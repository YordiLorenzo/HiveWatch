import * as fs from "fs";
import * as path from "path";
import type {
  TeamConfig,
  Task,
  InboxMessage,
  TeamOverview,
} from "../../shared/types.js";
import { TEAMS_DIR, TASKS_DIR, readJsonSafe } from "../constants.js";

export function getTeamNames(): string[] {
  try {
    return fs
      .readdirSync(TEAMS_DIR)
      .filter((f) => {
        const stat = fs.statSync(path.join(TEAMS_DIR, f));
        return stat.isDirectory() && !f.startsWith(".");
      });
  } catch {
    return [];
  }
}

export function getTeamConfig(teamName: string): TeamConfig | null {
  return readJsonSafe<TeamConfig>(path.join(TEAMS_DIR, teamName, "config.json"));
}

export function getTeamTasks(teamName: string): Task[] {
  const tasksDir = path.join(TASKS_DIR, teamName);
  try {
    const files = fs
      .readdirSync(tasksDir)
      .filter((f) => f.endsWith(".json") && !f.startsWith("."));
    return files
      .map((f) => readJsonSafe<Task>(path.join(tasksDir, f)))
      .filter((t): t is Task => t !== null)
      .sort((a, b) => parseInt(a.id) - parseInt(b.id));
  } catch {
    return [];
  }
}

export function getTeamInboxes(teamName: string): Record<string, InboxMessage[]> {
  const inboxDir = path.join(TEAMS_DIR, teamName, "inboxes");
  const result: Record<string, InboxMessage[]> = {};
  try {
    const files = fs.readdirSync(inboxDir).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      const agentName = f.replace(".json", "");
      const messages = readJsonSafe<InboxMessage[]>(path.join(inboxDir, f));
      if (messages) result[agentName] = messages;
    }
  } catch {
    // No inboxes
  }
  return result;
}

export function getTeamOverview(teamName: string): TeamOverview | null {
  const config = getTeamConfig(teamName);
  if (!config) return null;
  return {
    config,
    tasks: getTeamTasks(teamName),
    inboxes: getTeamInboxes(teamName),
  };
}
