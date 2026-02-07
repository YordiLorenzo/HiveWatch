import * as fs from "fs";
import * as path from "path";
import type {
  TeamConfig,
  Task,
  InboxMessage,
  AgentActivity,
  SnapshotMeta,
  SessionSnapshotMeta,
  SoloSession,
  TeamOverview,
} from "../../shared/types.js";

const HOME = process.env.HOME;
if (!HOME) throw new Error("$HOME environment variable is not set");
const HIVEWATCH_DIR = path.join(HOME, ".claude", "hivewatch");
const SNAPSHOTS_DIR = path.join(HIVEWATCH_DIR, "snapshots");

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function teamDir(teamName: string): string {
  return path.join(SNAPSHOTS_DIR, teamName);
}

/**
 * Write JSON atomically: write to .tmp then rename.
 * Prevents corrupt reads if the process is interrupted mid-write.
 */
function writeJsonAtomic(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
}

function readJsonSafe<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

// --- Write snapshots ---

export function writeConfigSnapshot(teamName: string, config: TeamConfig): void {
  // Merge: preserve departed members so they survive in the snapshot
  const existing = readJsonSafe<TeamConfig>(path.join(teamDir(teamName), "config.json"));
  if (existing) {
    const currentNames = new Set(config.members.map((m) => m.name));
    const departed = existing.members.filter((m) => !currentNames.has(m.name));
    if (departed.length > 0) {
      config = { ...config, members: [...config.members, ...departed] };
    }
  }
  writeJsonAtomic(path.join(teamDir(teamName), "config.json"), config);
  updateMeta(teamName, { configVersion: config.members.length });
}

export function writeTasksSnapshot(teamName: string, tasks: Task[]): void {
  // Merge: keep tasks from snapshot that aren't in live data
  const existing = readJsonSafe<Task[]>(path.join(teamDir(teamName), "tasks.json"));
  if (existing && existing.length > 0 && tasks.length < existing.length) {
    const liveIds = new Set(tasks.map((t) => t.id));
    const departed = existing.filter((t) => !liveIds.has(t.id));
    if (departed.length > 0) {
      tasks = [...tasks, ...departed];
    }
  }
  writeJsonAtomic(path.join(teamDir(teamName), "tasks.json"), tasks);
  updateMeta(teamName);
}

export function writeInboxSnapshot(teamName: string, inboxes: Record<string, InboxMessage[]>): void {
  // Merge: preserve departed agents' inboxes
  const existing = readJsonSafe<Record<string, InboxMessage[]>>(
    path.join(teamDir(teamName), "inboxes.json"),
  );
  if (existing) {
    for (const [agent, messages] of Object.entries(existing)) {
      if (!(agent in inboxes) && messages.length > 0) {
        inboxes[agent] = messages;
      }
    }
  }
  writeJsonAtomic(path.join(teamDir(teamName), "inboxes.json"), inboxes);
  updateMeta(teamName);
}

export function writeActivitySnapshot(teamName: string, activity: Record<string, AgentActivity[]>): void {
  writeJsonAtomic(path.join(teamDir(teamName), "activity.json"), activity);
}

function updateMeta(teamName: string, extra?: Partial<SnapshotMeta>): void {
  const metaPath = path.join(teamDir(teamName), "meta.json");
  const existing = readJsonSafe<SnapshotMeta>(metaPath);
  const meta: SnapshotMeta = {
    teamName,
    snapshotAt: new Date().toISOString(),
    disbandedAt: existing?.disbandedAt ?? null,
    configVersion: existing?.configVersion ?? 0,
    ...extra,
  };
  writeJsonAtomic(metaPath, meta);
}

export function markTeamDisbanded(teamName: string): void {
  const metaPath = path.join(teamDir(teamName), "meta.json");
  const existing = readJsonSafe<SnapshotMeta>(metaPath);
  if (!existing) return; // No snapshot to mark
  existing.disbandedAt = new Date().toISOString();
  writeJsonAtomic(metaPath, existing);
}

export function markTeamLive(teamName: string): void {
  const metaPath = path.join(teamDir(teamName), "meta.json");
  const existing = readJsonSafe<SnapshotMeta>(metaPath);
  if (!existing) return;
  existing.disbandedAt = null;
  writeJsonAtomic(metaPath, existing);
}

// --- Read snapshots ---

export function getSnapshotOverview(teamName: string): TeamOverview | null {
  const dir = teamDir(teamName);
  const config = readJsonSafe<TeamConfig>(path.join(dir, "config.json"));
  if (!config) return null;
  return {
    config,
    tasks: readJsonSafe<Task[]>(path.join(dir, "tasks.json")) || [],
    inboxes: readJsonSafe<Record<string, InboxMessage[]>>(path.join(dir, "inboxes.json")) || {},
  };
}

export function getSnapshotActivity(teamName: string): Record<string, AgentActivity[]> {
  return readJsonSafe<Record<string, AgentActivity[]>>(
    path.join(teamDir(teamName), "activity.json")
  ) || {};
}

export function getSnapshotMeta(teamName: string): SnapshotMeta | null {
  return readJsonSafe<SnapshotMeta>(path.join(teamDir(teamName), "meta.json"));
}

// --- Disbanded team discovery ---

export function getDisbandedTeamNames(): string[] {
  ensureDir(SNAPSHOTS_DIR);
  try {
    return fs.readdirSync(SNAPSHOTS_DIR).filter((name) => {
      const meta = getSnapshotMeta(name);
      return meta?.disbandedAt != null;
    });
  } catch {
    return [];
  }
}

/**
 * Called at startup: compare snapshots against live teams.
 * Any snapshot that isn't in the live set and isn't already marked disbanded
 * gets marked as disbanded (team disappeared while server was down).
 */
export function reconcileSnapshots(liveTeamNames: string[]): void {
  ensureDir(SNAPSHOTS_DIR);
  const liveSet = new Set(liveTeamNames);
  try {
    const snapshotDirs = fs.readdirSync(SNAPSHOTS_DIR);
    for (const name of snapshotDirs) {
      if (liveSet.has(name)) {
        // Team is live — clear any disbanded marker (team was recreated)
        const meta = getSnapshotMeta(name);
        if (meta?.disbandedAt) markTeamLive(name);
        continue;
      }
      const meta = getSnapshotMeta(name);
      if (meta && !meta.disbandedAt) {
        markTeamDisbanded(name);
      }
    }
  } catch {
    // Snapshot dir doesn't exist yet — nothing to reconcile
  }
}

/**
 * Delete disbanded snapshots older than `days` days.
 */
export function pruneOldSnapshots(days: number = 7): void {
  ensureDir(SNAPSHOTS_DIR);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  try {
    const dirs = fs.readdirSync(SNAPSHOTS_DIR);
    for (const name of dirs) {
      const meta = getSnapshotMeta(name);
      if (!meta?.disbandedAt) continue;
      if (new Date(meta.disbandedAt).getTime() < cutoff) {
        fs.rmSync(path.join(SNAPSHOTS_DIR, name), { recursive: true, force: true });
      }
    }
  } catch {
    // Ignore errors during pruning
  }
}

// --- Session snapshots ---

const SESSION_SNAPSHOTS_DIR = path.join(HIVEWATCH_DIR, "snapshots", "sessions");

function sessionDir(sessionId: string): string {
  return path.join(SESSION_SNAPSHOTS_DIR, sessionId);
}

export function writeSessionSnapshot(session: SoloSession): void {
  writeJsonAtomic(path.join(sessionDir(session.sessionId), "session.json"), session);
  updateSessionMeta(session.sessionId);
}

export function writeSessionActivitySnapshot(
  sessionId: string,
  activity: { lead: AgentActivity[]; subagents: Record<string, AgentActivity[]> },
): void {
  writeJsonAtomic(path.join(sessionDir(sessionId), "activity.json"), activity);
}

function updateSessionMeta(sessionId: string): void {
  const metaPath = path.join(sessionDir(sessionId), "meta.json");
  const existing = readJsonSafe<SessionSnapshotMeta>(metaPath);
  const meta: SessionSnapshotMeta = {
    sessionId,
    snapshotAt: new Date().toISOString(),
    endedAt: existing?.endedAt ?? null,
  };
  writeJsonAtomic(metaPath, meta);
}

export function getSessionSnapshot(sessionId: string): SoloSession | null {
  return readJsonSafe<SoloSession>(path.join(sessionDir(sessionId), "session.json"));
}

export function getSessionActivitySnapshot(
  sessionId: string,
): { lead: AgentActivity[]; subagents: Record<string, AgentActivity[]> } | null {
  return readJsonSafe<{ lead: AgentActivity[]; subagents: Record<string, AgentActivity[]> }>(
    path.join(sessionDir(sessionId), "activity.json"),
  );
}

export function getEndedSessionIds(): string[] {
  ensureDir(SESSION_SNAPSHOTS_DIR);
  try {
    return fs.readdirSync(SESSION_SNAPSHOTS_DIR).filter((id) => {
      const meta = readJsonSafe<SessionSnapshotMeta>(
        path.join(SESSION_SNAPSHOTS_DIR, id, "meta.json"),
      );
      return meta?.endedAt != null;
    });
  } catch {
    return [];
  }
}

export function markSessionEnded(sessionId: string): void {
  const metaPath = path.join(sessionDir(sessionId), "meta.json");
  const existing = readJsonSafe<SessionSnapshotMeta>(metaPath);
  if (!existing) return;
  existing.endedAt = new Date().toISOString();
  writeJsonAtomic(metaPath, existing);
}

export function markSessionLive(sessionId: string): void {
  const metaPath = path.join(sessionDir(sessionId), "meta.json");
  const existing = readJsonSafe<SessionSnapshotMeta>(metaPath);
  if (!existing) return;
  existing.endedAt = null;
  writeJsonAtomic(metaPath, existing);
}

export function reconcileSessionSnapshots(liveSessionIds: string[]): void {
  ensureDir(SESSION_SNAPSHOTS_DIR);
  const liveSet = new Set(liveSessionIds);
  try {
    const snapshotDirs = fs.readdirSync(SESSION_SNAPSHOTS_DIR);
    for (const id of snapshotDirs) {
      if (liveSet.has(id)) {
        const meta = readJsonSafe<SessionSnapshotMeta>(
          path.join(SESSION_SNAPSHOTS_DIR, id, "meta.json"),
        );
        if (meta?.endedAt) markSessionLive(id);
        continue;
      }
      const meta = readJsonSafe<SessionSnapshotMeta>(
        path.join(SESSION_SNAPSHOTS_DIR, id, "meta.json"),
      );
      if (meta && !meta.endedAt) {
        markSessionEnded(id);
      }
    }
  } catch {
    // Snapshot dir doesn't exist yet
  }
}

export function pruneOldSessionSnapshots(days: number = 7): void {
  ensureDir(SESSION_SNAPSHOTS_DIR);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  try {
    const dirs = fs.readdirSync(SESSION_SNAPSHOTS_DIR);
    for (const id of dirs) {
      const meta = readJsonSafe<SessionSnapshotMeta>(
        path.join(SESSION_SNAPSHOTS_DIR, id, "meta.json"),
      );
      if (!meta?.endedAt) continue;
      if (new Date(meta.endedAt).getTime() < cutoff) {
        fs.rmSync(path.join(SESSION_SNAPSHOTS_DIR, id), { recursive: true, force: true });
      }
    }
  } catch {
    // Ignore errors during pruning
  }
}
