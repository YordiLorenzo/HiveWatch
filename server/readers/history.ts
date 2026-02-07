import * as fs from "fs";
import type { StatsCache, HistoryEntry } from "../../shared/types.js";
import { HISTORY_FILE, STATS_FILE, readJsonSafe } from "../constants.js";

export function getStats(): StatsCache | null {
  return readJsonSafe<StatsCache>(STATS_FILE);
}

export function getRecentHistory(limit = 100): HistoryEntry[] {
  try {
    const raw = fs.readFileSync(HISTORY_FILE, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line) as HistoryEntry;
        } catch {
          return null;
        }
      })
      .filter((h): h is HistoryEntry => h !== null)
      .reverse();
  } catch {
    return [];
  }
}
