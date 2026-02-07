import type { Express } from "express";
import type { TeamOverview, SoloSession } from "../shared/types.js";
import { getTeamNames, getTeamConfig, getTeamTasks, getTeamInboxes, getTeamOverview } from "./readers/team.js";
import { getTeamActivity } from "./readers/activity.js";
import { getStats, getRecentHistory } from "./readers/history.js";
import {
  getDisbandedTeamNames,
  getSnapshotOverview,
  getSnapshotActivity,
  getSnapshotMeta,
  getEndedSessionIds,
  getSessionSnapshot,
  getSessionActivitySnapshot,
} from "./readers/snapshot.js";
import { discoverActiveSessions, getSessionActivity, getSessionActivityDirect } from "./readers/session.js";

export function registerRoutes(app: Express): void {
  app.get("/api/teams", (_req, res) => {
    const names = getTeamNames();
    const live = names
      .map((name) => getTeamOverview(name))
      .filter((t): t is TeamOverview => t !== null);

    const disbandedNames = getDisbandedTeamNames();
    const disbanded = disbandedNames
      .map((name) => {
        const overview = getSnapshotOverview(name);
        if (!overview) return null;
        const meta = getSnapshotMeta(name);
        return { overview, disbandedAt: meta?.disbandedAt || null };
      })
      .filter((t): t is { overview: TeamOverview; disbandedAt: string | null } => t !== null);

    res.json({ live, disbanded });
  });

  app.get("/api/teams/:name", (req, res) => {
    const overview = getTeamOverview(req.params.name);
    if (overview) return res.json(overview);

    // Fallback to snapshot
    const snapshot = getSnapshotOverview(req.params.name);
    if (snapshot) return res.json(snapshot);

    res.status(404).json({ error: "Team not found" });
  });

  app.get("/api/teams/:name/tasks", (req, res) => {
    res.json(getTeamTasks(req.params.name));
  });

  app.get("/api/teams/:name/inboxes", (req, res) => {
    res.json(getTeamInboxes(req.params.name));
  });

  app.get("/api/teams/:name/inboxes/:agent", (req, res) => {
    const inboxes = getTeamInboxes(req.params.name);
    const messages = inboxes[req.params.agent] || [];
    res.json(messages);
  });

  app.get("/api/teams/:name/activity", (req, res) => {
    const config = getTeamConfig(req.params.name);
    if (config) return res.json(getTeamActivity(req.params.name));

    // Fallback to snapshot
    const activity = getSnapshotActivity(req.params.name);
    if (Object.keys(activity).length > 0) return res.json(activity);

    res.status(404).json({ error: "Team not found" });
  });

  app.get("/api/stats", (_req, res) => {
    const stats = getStats();
    if (!stats) return res.status(404).json({ error: "Stats not found" });
    res.json(stats);
  });

  app.get("/api/history", (req, res) => {
    const limit = parseInt(req.query.limit as string) || 100;
    res.json(getRecentHistory(limit));
  });

  // --- Session endpoints ---

  app.get("/api/sessions", (_req, res) => {
    const active = discoverActiveSessions();
    const endedIds = getEndedSessionIds();
    const ended: SoloSession[] = [];
    for (const id of endedIds) {
      const snapshot = getSessionSnapshot(id);
      if (snapshot) ended.push(snapshot);
    }
    res.json({ active, ended });
  });

  app.get("/api/sessions/:id/activity", (req, res) => {
    const sessionId = req.params.id;

    // Try live discovery first
    const activity = getSessionActivity(sessionId);
    if (activity) return res.json(activity);

    // Fall back to direct JSONL scan (discovery-independent)
    const directActivity = getSessionActivityDirect(sessionId);
    if (directActivity) return res.json(directActivity);

    // Fall back to snapshot
    const snapshotActivity = getSessionActivitySnapshot(sessionId);
    if (snapshotActivity) return res.json(snapshotActivity);

    res.status(404).json({ error: "Session not found" });
  });
}
