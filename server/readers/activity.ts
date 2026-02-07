import * as fs from "fs";
import * as path from "path";
import type { AgentActivity, TeamConfig } from "../../shared/types.js";
import { PROJECTS_DIR } from "../constants.js";
import { getTeamConfig } from "./team.js";
import { getHookMappings, clearHookMappingCache } from "./hook-mapping.js";
import { identifyMember } from "./member-identify.js";

export function encodeProjectPath(cwdPath: string): string {
  return cwdPath.replace(/[^a-zA-Z0-9-]/g, "-");
}

function generateActivitySummary(toolName: string, toolInput: Record<string, unknown>): string {
  switch (toolName) {
    case "Read":
      return `Reading ${toolInput.file_path || "file"}`;
    case "Edit":
      return `Editing ${toolInput.file_path || "file"}`;
    case "Write":
      return `Writing ${toolInput.file_path || "file"}`;
    case "Bash": {
      const cmd = String(toolInput.command || "");
      return `Running: ${cmd.length > 80 ? cmd.slice(0, 77) + "..." : cmd}`;
    }
    case "Grep":
      return `Searching for '${toolInput.pattern || ""}'`;
    case "Glob":
      return `Finding files: ${toolInput.pattern || ""}`;
    case "Task":
    case "TaskCreate":
      return `Spawning agent: ${toolInput.description || toolInput.subject || ""}`;
    default:
      return toolName;
  }
}

// --- Subagent directory discovery ---

function findSubagentsDir(config: TeamConfig): string | null {
  const cwdVariants = new Set<string>();
  for (const m of config.members) {
    cwdVariants.add(m.cwd);
    const parent = path.dirname(m.cwd);
    if (parent !== m.cwd) cwdVariants.add(parent);
  }

  for (const cwd of cwdVariants) {
    const encodedPath = encodeProjectPath(cwd);
    const subagentsDir = path.join(PROJECTS_DIR, encodedPath, config.leadSessionId, "subagents");
    try {
      if (fs.existsSync(subagentsDir)) return subagentsDir;
    } catch {
      continue;
    }
  }
  return null;
}

// --- Member -> JSONL mapping ---

const memberJsonlCache = new Map<string, { map: Map<string, string[]>; builtAt: number }>();

function buildMemberJsonlMap(
  config: TeamConfig,
  subagentsDir: string,
): Map<string, string[]> {
  const memberNames = new Set(config.members.map((m) => m.name));
  const map = new Map<string, string[]>();
  for (const name of memberNames) map.set(name, []);

  const hookMappings = getHookMappings();

  const files = fs.readdirSync(subagentsDir)
    .filter((f) => f.endsWith(".jsonl") && !f.includes("compact"));

  for (const f of files) {
    const filePath = path.join(subagentsDir, f);

    // Strategy 0: Check hook mapping by agent hash from filename
    const hashMatch = f.match(/^agent-([a-f0-9]+)\.jsonl$/);
    if (hashMatch) {
      const hookMapping = hookMappings.get(hashMatch[1]);
      if (hookMapping && (hookMapping.teamName === config.name || hookMapping.teamName === "") && map.has(hookMapping.memberName)) {
        map.get(hookMapping.memberName)!.push(filePath);
        continue;
      }
    }

    // Fallback: content-based heuristics
    const memberName = identifyMember(filePath, memberNames);
    if (memberName && map.has(memberName)) {
      map.get(memberName)!.push(filePath);
    }
  }

  // Sort each member's files by modification time (most recent first)
  for (const [, paths] of map) {
    paths.sort((a, b) => {
      try {
        return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
      } catch {
        return 0;
      }
    });
  }

  return map;
}

function getMemberJsonlMap(teamName: string, config: TeamConfig): Map<string, string[]> {
  const cached = memberJsonlCache.get(teamName);
  if (cached && Date.now() - cached.builtAt < 30_000) return cached.map;

  const subagentsDir = findSubagentsDir(config);
  if (!subagentsDir) return new Map();

  const map = buildMemberJsonlMap(config, subagentsDir);
  memberJsonlCache.set(teamName, { map, builtAt: Date.now() });
  return map;
}

// Public: clear cache (called by polling interval)
export const agentJsonlCache = {
  clear() {
    memberJsonlCache.clear();
    clearHookMappingCache();
  },
};

// --- JSONL tail reading ---

export function tailReadJsonl(
  filePath: string,
  agentName: string,
  teamName: string,
  maxEntries: number = 20
): AgentActivity[] {
  try {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    if (fileSize === 0) return [];

    // Adaptive tail: start at 64KB, expand up to 256KB if too few results
    const MIN_TAIL = 64 * 1024;
    const MAX_TAIL = 256 * 1024;
    let tailBytes = Math.min(MIN_TAIL, fileSize);

    let activities: AgentActivity[] = [];

    while (tailBytes <= MAX_TAIL) {
      const readStart = Math.max(0, fileSize - tailBytes);
      const readLen = Math.min(tailBytes, fileSize);

      const fd = fs.openSync(filePath, "r");
      const buf = Buffer.alloc(readLen);
      fs.readSync(fd, buf, 0, readLen, readStart);
      fs.closeSync(fd);

      const text = buf.toString("utf-8");
      const lines = text.split("\n");
      const startIdx = readStart > 0 ? 1 : 0;

      activities = [];

      for (let i = lines.length - 1; i >= startIdx && activities.length < maxEntries * 3; i--) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const entry = JSON.parse(line);
          const timestamp = entry.timestamp || new Date().toISOString();

          if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
            for (const block of entry.message.content) {
              if (block.type === "tool_use" && block.name) {
                activities.push({
                  agentName,
                  teamName,
                  timestamp,
                  type: "tool_call",
                  toolName: block.name,
                  toolInput: block.input || {},
                  summary: generateActivitySummary(block.name, block.input || {}),
                });
              } else if (block.type === "text" && block.text) {
                const trimmed = block.text.trim();
                if (trimmed.length > 0) {
                  activities.push({
                    agentName,
                    teamName,
                    timestamp,
                    type: "reasoning",
                    text: trimmed.length > 2000 ? trimmed.slice(0, 1997) + "..." : trimmed,
                    summary: undefined,
                  });
                }
              }
            }
          } else if (entry.type === "tool_result" || entry.type === "tool_response") {
            activities.push({
              agentName,
              teamName,
              timestamp,
              type: "tool_result",
              summary: "Tool result received",
            });
          }
        } catch {
          continue;
        }
      }

      // If we found enough or already read the whole file, stop
      if (activities.length >= maxEntries || readStart === 0) break;
      tailBytes *= 2;
    }

    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return activities.slice(0, maxEntries);
  } catch {
    return [];
  }
}

// --- Public API ---

export function getTeamActivity(teamName: string): Record<string, AgentActivity[]> {
  const config = getTeamConfig(teamName);
  if (!config) return {};

  const memberMap = getMemberJsonlMap(teamName, config);
  const result: Record<string, AgentActivity[]> = {};

  for (const member of config.members) {
    const jsonlPaths = memberMap.get(member.name) || [];
    if (jsonlPaths.length === 0) {
      result[member.name] = [];
      continue;
    }

    const allActivities: AgentActivity[] = [];
    for (const jp of jsonlPaths) {
      const activities = tailReadJsonl(jp, member.name, teamName);
      allActivities.push(...activities);
      if (allActivities.length >= 20) break;
    }

    allActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    result[member.name] = allActivities.slice(0, 20);
  }

  return result;
}
