import * as fs from "fs";
import * as path from "path";
import type { SoloSession, SessionSubagent, AgentActivity } from "../../shared/types.js";
import { PROJECTS_DIR, HIVEWATCH_EVENTS_FILE } from "../constants.js";
import { tailReadJsonl } from "./activity.js";
import { getTeamNames, getTeamConfig } from "./team.js";

// --- Types for sessions-index.json ---

interface SessionIndexEntry {
  sessionId: string;
  fullPath: string;
  fileMtime: number;
  firstPrompt: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch?: string;
  projectPath: string;
  isSidechain: boolean;
}

interface SessionIndex {
  version: number;
  entries: SessionIndexEntry[];
  originalPath: string;
}

// --- Agent type detection from hook events ---

let agentTypeCache: { map: Map<string, string>; builtAt: number } | null = null;

function getAgentTypeMap(): Map<string, string> {
  if (agentTypeCache && Date.now() - agentTypeCache.builtAt < 30_000) {
    return agentTypeCache.map;
  }

  const map = new Map<string, string>();
  try {
    if (!fs.existsSync(HIVEWATCH_EVENTS_FILE)) {
      agentTypeCache = { map, builtAt: Date.now() };
      return map;
    }

    // Tail-read last 128KB for recent events
    const stat = fs.statSync(HIVEWATCH_EVENTS_FILE);
    const tailBytes = 128 * 1024;
    const readStart = Math.max(0, stat.size - tailBytes);
    const readLen = Math.min(tailBytes, stat.size);

    const fd = fs.openSync(HIVEWATCH_EVENTS_FILE, "r");
    const buf = Buffer.alloc(readLen);
    fs.readSync(fd, buf, 0, readLen, readStart);
    fs.closeSync(fd);

    const text = buf.toString("utf-8");
    const lines = text.split("\n");
    const startIdx = readStart > 0 ? 1 : 0;

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const evt = JSON.parse(line);
        if (evt.event === "start" && evt.agent_id && evt.agent_type) {
          const id = evt.agent_id.startsWith("agent-") ? evt.agent_id.slice(6) : evt.agent_id;
          map.set(id, evt.agent_type);
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Events file missing or corrupt
  }

  agentTypeCache = { map, builtAt: Date.now() };
  return map;
}

// --- Helpers ---

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function getTeamLeadSessionIds(): Set<string> {
  const ids = new Set<string>();
  for (const name of getTeamNames()) {
    const config = getTeamConfig(name);
    if (config?.leadSessionId) ids.add(config.leadSessionId);
  }
  return ids;
}

function deriveProjectName(originalPath: string): string {
  const parts = originalPath.split(path.sep).filter(Boolean);
  return parts[parts.length - 1] || originalPath;
}

function collectSubagents(subagentsDir: string, agentTypes: Map<string, string>): SessionSubagent[] {
  const subagents: SessionSubagent[] = [];
  try {
    if (!fs.existsSync(subagentsDir)) return subagents;
    const files = fs.readdirSync(subagentsDir)
      .filter((f) => f.endsWith(".jsonl") && !f.includes("compact"));

    for (const f of files) {
      const match = f.match(/^agent-([a-f0-9]+)\.jsonl$/);
      if (!match) continue;

      const agentId = match[1];
      const agentType = agentTypes.get(agentId);
      const filePath = path.join(subagentsDir, f);

      let lastModified = 0;
      try {
        lastModified = fs.statSync(filePath).mtimeMs;
      } catch { /* skip */ }

      subagents.push({ agentId, agentType, lastModified });
    }
    subagents.sort((a, b) => b.lastModified - a.lastModified);
  } catch { /* skip */ }
  return subagents;
}

/**
 * Read JSONL head to extract session metadata for active sessions
 * that don't have a sessions-index entry yet.
 */
function readJsonlMetadata(filePath: string): {
  firstPrompt: string;
  created: string;
  gitBranch?: string;
  projectPath?: string;
} | null {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(32 * 1024);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    if (bytesRead === 0) return null;

    const text = buf.toString("utf-8", 0, bytesRead);
    const lines = text.split("\n").filter(Boolean).slice(0, 15);

    let firstPrompt = "";
    let created = "";
    let gitBranch: string | undefined;
    let projectPath: string | undefined;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        // Grab timestamp from earliest entry
        if (!created && entry.timestamp) {
          created = entry.timestamp;
        }
        // Grab git branch and cwd from any entry that has them
        if (!gitBranch && entry.gitBranch) {
          gitBranch = entry.gitBranch;
        }
        if (!projectPath && entry.cwd) {
          projectPath = entry.cwd;
        }
        // First user message = first prompt
        if (!firstPrompt && entry.type === "user" && entry.message?.content) {
          const content = entry.message.content;
          if (typeof content === "string") {
            firstPrompt = content.slice(0, 300);
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "text" && block.text) {
                firstPrompt = String(block.text).slice(0, 300);
                break;
              }
            }
          }
        }
        // Stop once we have everything
        if (firstPrompt && created && gitBranch) break;
      } catch {
        continue;
      }
    }

    return { firstPrompt, created, gitBranch, projectPath };
  } catch {
    return null;
  }
}

// --- Session discovery ---

const INDEX_RECENCY_MS = 24 * 60 * 60 * 1000; // 24h for index-based sessions
const ACTIVE_RECENCY_MS = 30 * 60 * 1000;      // 30min for actively-written JSONL files
let sessionCache: { sessions: SoloSession[]; builtAt: number } | null = null;

export function discoverActiveSessions(): SoloSession[] {
  if (sessionCache && Date.now() - sessionCache.builtAt < 30_000) {
    return sessionCache.sessions;
  }

  const sessionMap = new Map<string, SoloSession>();
  const teamLeadIds = getTeamLeadSessionIds();
  const now = Date.now();
  const indexCutoff = now - INDEX_RECENCY_MS;
  const activeCutoff = now - ACTIVE_RECENCY_MS;
  const agentTypes = getAgentTypeMap();

  let projectDirs: string[];
  try {
    projectDirs = fs.readdirSync(PROJECTS_DIR);
  } catch {
    sessionCache = { sessions: [], builtAt: now };
    return [];
  }

  for (const projDir of projectDirs) {
    const projPath = path.join(PROJECTS_DIR, projDir);

    // Skip non-directories
    try {
      if (!fs.statSync(projPath).isDirectory()) continue;
    } catch {
      continue;
    }

    // --- Strategy 1: Direct JSONL scanning for ACTIVE sessions ---
    // Look for UUID-named .jsonl files with recent mtime
    try {
      const files = fs.readdirSync(projPath);
      for (const f of files) {
        if (!f.endsWith(".jsonl")) continue;
        const sessionId = f.slice(0, -6); // remove .jsonl
        if (!UUID_RE.test(sessionId)) continue;
        if (teamLeadIds.has(sessionId)) continue;

        const jsonlPath = path.join(projPath, f);
        let mtime: number;
        try {
          mtime = fs.statSync(jsonlPath).mtimeMs;
        } catch {
          continue;
        }

        if (mtime < activeCutoff) continue;

        // This is an actively-written session!
        const subagentsDir = path.join(projPath, sessionId, "subagents");
        const subagents = collectSubagents(subagentsDir, agentTypes);

        // Read metadata from JSONL head
        const meta = readJsonlMetadata(jsonlPath);
        const projectPath = meta?.projectPath || projDir;

        sessionMap.set(sessionId, {
          sessionId,
          projectDir: projDir,
          projectPath,
          projectName: deriveProjectName(projectPath),
          firstPrompt: meta?.firstPrompt || "",
          gitBranch: meta?.gitBranch,
          created: meta?.created || new Date(mtime).toISOString(),
          modified: new Date(mtime).toISOString(),
          messageCount: 0, // unknown for active sessions
          subagents,
        });
      }
    } catch {
      // Skip unreadable dirs
    }

    // --- Strategy 2: Index-based discovery for recent/closed sessions ---
    const indexPath = path.join(projPath, "sessions-index.json");
    try {
      if (!fs.existsSync(indexPath)) continue;
    } catch {
      continue;
    }

    let index: SessionIndex;
    try {
      const raw = fs.readFileSync(indexPath, "utf-8");
      index = JSON.parse(raw);
    } catch {
      continue;
    }

    for (const entry of index.entries) {
      if (entry.isSidechain) continue;
      if (teamLeadIds.has(entry.sessionId)) continue;

      // Already found via active scanning — skip (active version is more up-to-date)
      if (sessionMap.has(entry.sessionId)) continue;

      const modTime = new Date(entry.modified).getTime();
      if (modTime < indexCutoff) continue;

      const subagentsDir = path.join(projPath, entry.sessionId, "subagents");
      const subagents = collectSubagents(subagentsDir, agentTypes);

      sessionMap.set(entry.sessionId, {
        sessionId: entry.sessionId,
        projectDir: projDir,
        projectPath: index.originalPath || entry.projectPath,
        projectName: deriveProjectName(index.originalPath || entry.projectPath),
        firstPrompt: entry.firstPrompt?.slice(0, 300) || "",
        gitBranch: entry.gitBranch,
        created: entry.created,
        modified: entry.modified,
        messageCount: entry.messageCount,
        subagents,
      });
    }
  }

  const sessions = Array.from(sessionMap.values());
  sessions.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

  sessionCache = { sessions, builtAt: now };
  return sessions;
}

// --- Session activity reading ---

export function getSessionActivity(
  sessionId: string,
): { lead: AgentActivity[]; subagents: Record<string, AgentActivity[]> } | null {
  const sessions = discoverActiveSessions();
  const session = sessions.find((s) => s.sessionId === sessionId);
  if (!session) return null;

  const projDir = path.join(PROJECTS_DIR, session.projectDir);

  // Read lead session activity
  const leadJsonl = path.join(projDir, `${sessionId}.jsonl`);
  const lead = tailReadJsonl(leadJsonl, "lead", sessionId, 30);

  // Read subagent activities
  const subagents: Record<string, AgentActivity[]> = {};
  const subagentsDir = path.join(projDir, sessionId, "subagents");

  for (const sub of session.subagents) {
    const subJsonl = path.join(subagentsDir, `agent-${sub.agentId}.jsonl`);
    let label = sub.agentType || `agent-${sub.agentId.slice(0, 7)}`;
    if (subagents[label]) label = `${label} (${sub.agentId.slice(0, 7)})`;
    subagents[label] = tailReadJsonl(subJsonl, label, sessionId, 15);
  }

  return { lead, subagents };
}

/**
 * Scan project dirs for a session's JSONL directly by UUID,
 * without requiring the session to be in discoverActiveSessions().
 * Falls back to snapshot if JSONL not found on disk.
 */
export function getSessionActivityDirect(
  sessionId: string,
): { lead: AgentActivity[]; subagents: Record<string, AgentActivity[]> } | null {
  const jsonlName = `${sessionId}.jsonl`;
  const agentTypes = getAgentTypeMap();

  let projectDirs: string[];
  try {
    projectDirs = fs.readdirSync(PROJECTS_DIR);
  } catch {
    return null;
  }

  for (const projDir of projectDirs) {
    const projPath = path.join(PROJECTS_DIR, projDir);
    const jsonlPath = path.join(projPath, jsonlName);

    try {
      if (!fs.existsSync(jsonlPath)) continue;
    } catch {
      continue;
    }

    const lead = tailReadJsonl(jsonlPath, "lead", sessionId, 30);
    const subagents: Record<string, AgentActivity[]> = {};
    const subagentsDir = path.join(projPath, sessionId, "subagents");
    const subs = collectSubagents(subagentsDir, agentTypes);

    for (const sub of subs) {
      const subJsonl = path.join(subagentsDir, `agent-${sub.agentId}.jsonl`);
      let label = sub.agentType || `agent-${sub.agentId.slice(0, 7)}`;
      if (subagents[label]) label = `${label} (${sub.agentId.slice(0, 7)})`;
      subagents[label] = tailReadJsonl(subJsonl, label, sessionId, 15);
    }

    return { lead, subagents };
  }

  return null;
}

export function clearSessionCache(): void {
  sessionCache = null;
  agentTypeCache = null;
}
