import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import chokidar from "chokidar";
import * as path from "path";
import type { WsEvent, TeamOverview, AgentActivity, SoloSession } from "../shared/types.js";
import { TEAMS_DIR, TASKS_DIR } from "./constants.js";
import { getTeamNames, getTeamTasks, getTeamInboxes, getTeamOverview } from "./readers/team.js";
import { getTeamActivity, agentJsonlCache } from "./readers/activity.js";
import { getStats } from "./readers/history.js";
import {
  writeConfigSnapshot,
  writeTasksSnapshot,
  writeInboxSnapshot,
  writeActivitySnapshot,
  markTeamDisbanded,
  markTeamLive,
  reconcileSnapshots,
  pruneOldSnapshots,
  getDisbandedTeamNames,
  getSnapshotOverview,
  getSnapshotActivity,
  getSnapshotMeta,
  writeSessionSnapshot,
  writeSessionActivitySnapshot,
  markSessionEnded,
  markSessionLive,
  reconcileSessionSnapshots,
  pruneOldSessionSnapshots,
  getEndedSessionIds,
  getSessionSnapshot,
} from "./readers/snapshot.js";
import { discoverActiveSessions, getSessionActivity, getSessionActivityDirect, clearSessionCache } from "./readers/session.js";

function broadcast(wss: WebSocketServer, event: WsEvent) {
  const payload = JSON.stringify(event);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server });
  const intervals: ReturnType<typeof setInterval>[] = [];

  // --- Startup: reconcile snapshots + prune old ones ---
  const liveNames = getTeamNames();
  reconcileSnapshots(liveNames);
  pruneOldSnapshots(7);

  const initialSessions = discoverActiveSessions();
  reconcileSessionSnapshots(initialSessions.map((s) => s.sessionId));
  pruneOldSessionSnapshots(7);

  // Prune hourly
  intervals.push(setInterval(() => {
    pruneOldSnapshots(7);
    pruneOldSessionSnapshots(7);
  }, 60 * 60 * 1000));

  // Track known live teams for disbandment detection
  const knownLiveTeams = new Set<string>(liveNames);

  // Track known live sessions for ended-session detection
  const knownLiveSessions = new Set<string>(initialSessions.map((s) => s.sessionId));

  // Write initial session snapshots
  for (const session of initialSessions) {
    writeSessionSnapshot(session);
  }

  wss.on("connection", (ws) => {
    // Send initial state
    const names = getTeamNames();
    const teams = names
      .map((name) => getTeamOverview(name))
      .filter((t): t is TeamOverview => t !== null);

    // Build activities for each team
    const activities: Record<string, Record<string, AgentActivity[]>> = {};
    for (const name of names) {
      activities[name] = getTeamActivity(name);
    }

    // Build disbanded teams data from snapshots
    const disbandedNames = getDisbandedTeamNames();
    const disbandedTeams: Record<string, { overview: TeamOverview; disbandedAt: string }> = {};
    for (const dName of disbandedNames) {
      const overview = getSnapshotOverview(dName);
      if (!overview) continue;
      const meta = getSnapshotMeta(dName);
      disbandedTeams[dName] = {
        overview,
        disbandedAt: meta?.disbandedAt || new Date().toISOString(),
      };
    }

    const sessions = discoverActiveSessions();

    // Build ended sessions from snapshots
    const endedSessionIds = getEndedSessionIds();
    const endedSessions: SoloSession[] = [];
    for (const id of endedSessionIds) {
      const snapshot = getSessionSnapshot(id);
      if (snapshot) endedSessions.push(snapshot);
    }

    ws.send(
      JSON.stringify({
        type: "initial_state",
        data: { teams, stats: getStats(), activities, disbandedTeams, sessions, endedSessions },
      })
    );
  });

  // --- File watchers ---

  const teamsWatcher = chokidar.watch([TEAMS_DIR, TASKS_DIR], {
    ignoreInitial: true,
    persistent: true,
    depth: 3,
  });

  teamsWatcher.on("all", (event, filePath) => {
    if (!filePath.endsWith(".json")) return;

    // Determine which team was affected
    const relative = filePath.startsWith(TEAMS_DIR)
      ? path.relative(TEAMS_DIR, filePath)
      : path.relative(TASKS_DIR, filePath);
    const teamName = relative.split(path.sep)[0];
    if (!teamName) return;

    if (filePath.includes("/inboxes/")) {
      const inboxes = getTeamInboxes(teamName);
      broadcast(wss, { type: "inbox_updated", team: teamName, data: inboxes });
      writeInboxSnapshot(teamName, inboxes);
    } else if (filePath.startsWith(TASKS_DIR)) {
      const tasks = getTeamTasks(teamName);
      broadcast(wss, { type: "task_updated", team: teamName, data: tasks });
      writeTasksSnapshot(teamName, tasks);
    } else if (filePath.endsWith("config.json")) {
      const overview = getTeamOverview(teamName);
      if (overview) {
        broadcast(wss, { type: "team_updated", team: teamName, data: overview });
        writeConfigSnapshot(teamName, overview.config);
        writeTasksSnapshot(teamName, overview.tasks);
        writeInboxSnapshot(teamName, overview.inboxes);
      }
    }
  });

  // --- Activity polling (every 2s) ---

  const lastActivityHash = new Map<string, string>();
  let cacheClearCounter = 0;

  function hashActivity(activity: Record<string, AgentActivity[]>): string {
    return Object.entries(activity)
      .map(([name, acts]) => `${name}:${acts[0]?.timestamp || ""}`)
      .sort()
      .join("|");
  }

  intervals.push(setInterval(() => {
    if (wss.clients.size === 0) return;

    // Clear JSONL cache every 30s (15 polls at 2s interval)
    cacheClearCounter++;
    if (cacheClearCounter >= 15) {
      agentJsonlCache.clear();
      cacheClearCounter = 0;
    }

    const teamNames = getTeamNames();
    for (const teamName of teamNames) {
      try {
        const activity = getTeamActivity(teamName);
        const hash = hashActivity(activity);
        if (hash !== lastActivityHash.get(teamName)) {
          lastActivityHash.set(teamName, hash);
          broadcast(wss, {
            type: "activity_updated",
            team: teamName,
            data: activity,
          });
          writeActivitySnapshot(teamName, activity);
        }
      } catch (err) {
        console.error(`[activity] Error polling ${teamName}:`, err);
      }
    }
  }, 2000));

  // --- Disbandment detection (every 5s) ---

  intervals.push(setInterval(() => {
    const currentLive = new Set(getTeamNames());

    // Detect disbanded: was in knownLiveTeams but no longer live
    for (const name of knownLiveTeams) {
      if (!currentLive.has(name)) {
        knownLiveTeams.delete(name);

        // Capture final activity before marking disbanded
        try {
          const activity = getTeamActivity(name);
          if (Object.keys(activity).length > 0) {
            writeActivitySnapshot(name, activity);
          }
        } catch (err) {
          console.error(`[disbandment] Error capturing final activity for ${name}:`, err);
        }

        markTeamDisbanded(name);

        // Build disbanded data for broadcast
        const overview = getSnapshotOverview(name);
        if (overview) {
          const meta = getSnapshotMeta(name);
          broadcast(wss, {
            type: "team_disbanded",
            team: name,
            data: {
              overview,
              disbandedAt: meta?.disbandedAt || new Date().toISOString(),
              activity: getSnapshotActivity(name),
            },
          });
        }

        lastActivityHash.delete(name);
      }
    }

    // Detect new teams (or recreated teams)
    for (const name of currentLive) {
      if (!knownLiveTeams.has(name)) {
        knownLiveTeams.add(name);
        // If this team was previously disbanded, clear it
        markTeamLive(name);
      }
    }
  }, 5000));

  // --- Session polling (every 5s) ---

  let lastSessionHash = "";

  function hashSessions(sessions: SoloSession[]): string {
    return sessions
      .map((s) => `${s.sessionId}:${s.modified}:${s.subagents.length}`)
      .join("|");
  }

  intervals.push(setInterval(() => {
    if (wss.clients.size === 0) return;

    clearSessionCache();
    const sessions = discoverActiveSessions();
    const currentSessionIds = new Set(sessions.map((s) => s.sessionId));

    // Write snapshots for all active sessions
    for (const session of sessions) {
      writeSessionSnapshot(session);
    }

    // Detect ended sessions: were in knownLiveSessions but no longer discovered
    for (const id of knownLiveSessions) {
      if (!currentSessionIds.has(id)) {
        knownLiveSessions.delete(id);

        // Capture final activity snapshot
        try {
          const activity = getSessionActivityDirect(id);
          if (activity) {
            writeSessionActivitySnapshot(id, activity);
          }
        } catch (err) {
          console.error(`[session] Error capturing final activity for ${id}:`, err);
        }

        markSessionEnded(id);

        // Broadcast session_ended with snapshot data
        const snapshot = getSessionSnapshot(id);
        if (snapshot) {
          broadcast(wss, {
            type: "session_ended",
            data: snapshot,
          });
        }
      }
    }

    // Detect reappeared sessions
    for (const id of currentSessionIds) {
      if (!knownLiveSessions.has(id)) {
        knownLiveSessions.add(id);
        markSessionLive(id);
      }
    }

    const hash = hashSessions(sessions);
    if (hash !== lastSessionHash) {
      lastSessionHash = hash;
      broadcast(wss, { type: "session_updated", data: sessions });
    }
  }, 5000));

  // --- Graceful shutdown ---

  function cleanup() {
    for (const id of intervals) {
      clearInterval(id);
    }
    teamsWatcher.close();
    wss.close();
  }

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  return wss;
}
