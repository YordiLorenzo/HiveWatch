import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import * as fs from "fs";
import * as path from "path";
import chokidar from "chokidar";
import type {
  TeamConfig,
  Task,
  InboxMessage,
  TeamOverview,
  StatsCache,
  HistoryEntry,
  WsEvent,
  AgentActivity,
} from "../shared/types.js";

const CLAUDE_DIR = path.join(process.env.HOME!, ".claude");
const TEAMS_DIR = path.join(CLAUDE_DIR, "teams");
const TASKS_DIR = path.join(CLAUDE_DIR, "tasks");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const HISTORY_FILE = path.join(CLAUDE_DIR, "history.jsonl");
const STATS_FILE = path.join(CLAUDE_DIR, "stats-cache.json");

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

// --- Data readers ---

function readJsonSafe<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getTeamNames(): string[] {
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

function getTeamConfig(teamName: string): TeamConfig | null {
  return readJsonSafe<TeamConfig>(path.join(TEAMS_DIR, teamName, "config.json"));
}

function getTeamTasks(teamName: string): Task[] {
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

function getTeamInboxes(teamName: string): Record<string, InboxMessage[]> {
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

function getTeamOverview(teamName: string): TeamOverview | null {
  const config = getTeamConfig(teamName);
  if (!config) return null;
  return {
    config,
    tasks: getTeamTasks(teamName),
    inboxes: getTeamInboxes(teamName),
  };
}

function getStats(): StatsCache | null {
  return readJsonSafe<StatsCache>(STATS_FILE);
}

function getRecentHistory(limit = 100): HistoryEntry[] {
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

// --- Activity reader (JSONL tail) ---

function encodeProjectPath(cwdPath: string): string {
  // /Users/foo/bar → -Users-foo-bar (replace / with -, strip leading -)
  return cwdPath.replace(/\//g, "-").replace(/^-/, "");
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

// Cache for agent JSONL path lookups (agentId -> filePath)
const agentJsonlCache = new Map<string, string | null>();

function findAgentJsonlPath(teamName: string, agentId: string): string | null {
  const cacheKey = `${teamName}:${agentId}`;
  if (agentJsonlCache.has(cacheKey)) return agentJsonlCache.get(cacheKey)!;

  const config = getTeamConfig(teamName);
  if (!config) return null;

  const member = config.members.find((m) => m.agentId === agentId);
  if (!member) return null;

  // Find the project dir - try the member's cwd and parent paths
  const cwdVariants = [member.cwd];
  // Also try parent dir (agents often have a subdir as cwd)
  const parentCwd = path.dirname(member.cwd);
  if (parentCwd !== member.cwd) cwdVariants.push(parentCwd);

  for (const cwd of cwdVariants) {
    const encodedPath = encodeProjectPath(cwd);
    const projectDir = path.join(PROJECTS_DIR, encodedPath);

    try {
      if (!fs.existsSync(projectDir)) continue;
    } catch {
      continue;
    }

    // Strategy 1: Check {leadSessionId}/subagents/ directory (in-process agents)
    const subagentsDir = path.join(projectDir, config.leadSessionId, "subagents");
    try {
      if (fs.existsSync(subagentsDir)) {
        const files = fs.readdirSync(subagentsDir).filter((f) => f.endsWith(".jsonl"));
        for (const f of files) {
          const jsonlPath = path.join(subagentsDir, f);
          try {
            const fd = fs.openSync(jsonlPath, "r");
            const buf = Buffer.alloc(8192);
            const bytesRead = fs.readSync(fd, buf, 0, 8192, 0);
            fs.closeSync(fd);
            if (bytesRead === 0) continue;
            const firstLine = buf.toString("utf-8", 0, bytesRead).split("\n")[0];
            if (!firstLine) continue;
            const parsed = JSON.parse(firstLine);
            // Check agentId match
            if (parsed.agentId === agentId) {
              agentJsonlCache.set(cacheKey, jsonlPath);
              return jsonlPath;
            }
            // For in-process agents: check if first message contains the agent name
            const content = parsed.message?.content;
            if (typeof content === "string") {
              const agentName = member.name;
              if (
                content.includes(`You are ${agentName}`) ||
                content.includes(`name="${agentName}"`) ||
                content.includes(`summary="${agentName}`)
              ) {
                agentJsonlCache.set(cacheKey, jsonlPath);
                return jsonlPath;
              }
            }
          } catch {
            continue;
          }
        }
        // Second pass: match by summary field containing agent description
        // The summary in teammate-message tags often has the spawn description
        for (const f of files) {
          const jsonlPath = path.join(subagentsDir, f);
          try {
            const fd = fs.openSync(jsonlPath, "r");
            const buf = Buffer.alloc(8192);
            const bytesRead = fs.readSync(fd, buf, 0, 8192, 0);
            fs.closeSync(fd);
            if (bytesRead === 0) continue;
            const firstLine = buf.toString("utf-8", 0, bytesRead).split("\n")[0];
            if (!firstLine) continue;
            const parsed = JSON.parse(firstLine);
            const content = parsed.message?.content;
            if (typeof content === "string" && content.includes(member.name)) {
              agentJsonlCache.set(cacheKey, jsonlPath);
              return jsonlPath;
            }
          } catch {
            continue;
          }
        }
      }
    } catch {
      // subagents dir doesn't exist
    }

    // Strategy 2: Direct JSONL files in project dir
    try {
      const files = fs.readdirSync(projectDir).filter((f) => f.endsWith(".jsonl"));
      for (const f of files) {
        const jsonlPath = path.join(projectDir, f);
        try {
          const fd = fs.openSync(jsonlPath, "r");
          const buf = Buffer.alloc(4096);
          const bytesRead = fs.readSync(fd, buf, 0, 4096, 0);
          fs.closeSync(fd);
          if (bytesRead === 0) continue;
          const firstLine = buf.toString("utf-8", 0, bytesRead).split("\n")[0];
          if (!firstLine) continue;
          const parsed = JSON.parse(firstLine);
          if (parsed.agentId === agentId) {
            agentJsonlCache.set(cacheKey, jsonlPath);
            return jsonlPath;
          }
        } catch {
          continue;
        }
      }
    } catch {
      // ignore
    }
  }

  agentJsonlCache.set(cacheKey, null);
  return null;
}

function tailReadJsonl(
  filePath: string,
  agentName: string,
  teamName: string,
  maxEntries: number = 20
): AgentActivity[] {
  const TAIL_BYTES = 32 * 1024; // 32KB from end

  try {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    if (fileSize === 0) return [];

    const readStart = Math.max(0, fileSize - TAIL_BYTES);
    const readLen = Math.min(TAIL_BYTES, fileSize);

    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(readLen);
    fs.readSync(fd, buf, 0, readLen, readStart);
    fs.closeSync(fd);

    const text = buf.toString("utf-8");
    const lines = text.split("\n");

    // Skip first line if we started mid-file (likely partial)
    const startIdx = readStart > 0 ? 1 : 0;

    const activities: AgentActivity[] = [];

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
                  text: trimmed.length > 200 ? trimmed.slice(0, 197) + "..." : trimmed,
                  summary: "Reasoning",
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

    // Sort by timestamp descending, take top maxEntries
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return activities.slice(0, maxEntries);
  } catch {
    return [];
  }
}

function getTeamActivity(teamName: string): Record<string, AgentActivity[]> {
  const config = getTeamConfig(teamName);
  if (!config) return {};

  const result: Record<string, AgentActivity[]> = {};

  for (const member of config.members) {
    const jsonlPath = findAgentJsonlPath(teamName, member.agentId);
    if (jsonlPath) {
      result[member.name] = tailReadJsonl(jsonlPath, member.name, teamName);
    } else {
      result[member.name] = [];
    }
  }

  return result;
}

// --- REST API ---

app.get("/api/teams", (_req, res) => {
  const names = getTeamNames();
  const teams = names
    .map((name) => getTeamOverview(name))
    .filter((t): t is TeamOverview => t !== null);
  res.json(teams);
});

app.get("/api/teams/:name", (req, res) => {
  const overview = getTeamOverview(req.params.name);
  if (!overview) return res.status(404).json({ error: "Team not found" });
  res.json(overview);
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
  if (!config) return res.status(404).json({ error: "Team not found" });
  res.json(getTeamActivity(req.params.name));
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

// --- WebSocket live updates ---

function broadcast(event: WsEvent) {
  const payload = JSON.stringify(event);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

wss.on("connection", (ws) => {
  // Send initial state
  const names = getTeamNames();
  const teams = names
    .map((name) => getTeamOverview(name))
    .filter((t): t is TeamOverview => t !== null);
  ws.send(
    JSON.stringify({ type: "initial_state", data: { teams, stats: getStats() } })
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
    broadcast({ type: "inbox_updated", team: teamName, data: getTeamInboxes(teamName) });
  } else if (filePath.startsWith(TASKS_DIR)) {
    broadcast({ type: "task_updated", team: teamName, data: getTeamTasks(teamName) });
  } else if (filePath.endsWith("config.json")) {
    const overview = getTeamOverview(teamName);
    if (overview) broadcast({ type: "team_updated", team: teamName, data: overview });
  }
});

// --- Activity polling (every 2s) ---

// Cache of last-seen activity hashes per team to avoid duplicate broadcasts
const lastActivityHash = new Map<string, string>();

function hashActivity(activity: Record<string, AgentActivity[]>): string {
  // Simple hash: concatenate latest timestamps per agent
  return Object.entries(activity)
    .map(([name, acts]) => `${name}:${acts[0]?.timestamp || ""}`)
    .sort()
    .join("|");
}

setInterval(() => {
  // Clear JSONL path cache so new agents get discovered
  agentJsonlCache.clear();
}, 30000);

setInterval(() => {
  if (wss.clients.size === 0) return; // No connected clients, skip work

  const teamNames = getTeamNames();
  for (const teamName of teamNames) {
    try {
      const activity = getTeamActivity(teamName);
      const hash = hashActivity(activity);
      if (hash !== lastActivityHash.get(teamName)) {
        lastActivityHash.set(teamName, hash);
        broadcast({
          type: "activity_updated",
          team: teamName,
          data: activity,
        });
      }
    } catch {
      // Skip errors in activity polling
    }
  }
}, 2000);

// --- Start server ---

const PORT = process.env.PORT || 3847;
server.listen(PORT, () => {
  console.log(`HiveWatch server running on http://localhost:${PORT}`);
  console.log(`WebSocket available on ws://localhost:${PORT}`);
  console.log(`Watching: ${TEAMS_DIR}, ${TASKS_DIR}`);
});
