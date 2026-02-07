import * as fs from "fs";
import * as path from "path";

const HOME = process.env.HOME;
if (!HOME) throw new Error("$HOME environment variable is not set");

export const CLAUDE_DIR = path.join(HOME, ".claude");
export const TEAMS_DIR = path.join(CLAUDE_DIR, "teams");
export const TASKS_DIR = path.join(CLAUDE_DIR, "tasks");
export const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
export const HISTORY_FILE = path.join(CLAUDE_DIR, "history.jsonl");
export const STATS_FILE = path.join(CLAUDE_DIR, "stats-cache.json");
export const HIVEWATCH_EVENTS_FILE = path.join(CLAUDE_DIR, "hivewatch", "events.jsonl");

export function readJsonSafe<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
