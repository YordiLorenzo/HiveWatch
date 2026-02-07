<p align="center">
  <img src="public/hivewatch.svg" width="80" height="80" alt="HiveWatch">
</p>

<h1 align="center">HiveWatch</h1>

<p align="center">Real-time monitoring dashboard for Claude Code agent teams and solo sessions.</p>

---

## What it does

HiveWatch gives you a live web dashboard for monitoring Claude Code activity:

- **Team monitoring** — agent status (active/idle/stuck), task boards with dependency chains, inter-agent messages, and live tool call streams
- **Session monitoring** — discovers solo Claude Code sessions, shows project, branch, prompt, and subagent hierarchies with per-agent activity feeds
- **Rich activity formatting** — tool-specific renderers for Edit (diffs), Bash (commands), Read/Write (file ops), Grep/Glob (search), Task (delegation), with expandable reasoning and markdown rendering
- **Persistence** — atomic snapshots preserve disbanded teams and ended sessions for up to 7 days, with startup reconciliation
- **Agent detail view** — per-agent system prompt, assigned tasks, full message history, and live activity

## Quick start

```bash
git clone git@github.com:YordiLorenzo/HiveWatch.git
cd HiveWatch
npm install
```

Run the backend server and frontend dev server:

```bash
# Terminal 1: Start the file-watching server
npm run server

# Terminal 2: Start the Vite dev server
npm run dev
```

Open `http://localhost:5173`. The dashboard auto-discovers teams from `~/.claude/teams/` and solo sessions from `~/.claude/projects/*/sessions-index.json`.

## Agent mapping hooks (recommended)

HiveWatch needs to know which JSONL transcript file belongs to which team member. Claude Code doesn't persist this mapping — it only exists in memory at runtime. Without hooks, HiveWatch falls back to content heuristics that work for **in-process** agents but fail for **tmux** agents.

The hooks capture three events that let HiveWatch build the mapping reliably:

| Hook event | What it captures | Why it matters |
|---|---|---|
| `SubagentStart` | `agent_id` (short hash used in JSONL filename) | Links the file to a spawn event |
| `PostToolUse` on `Task` | `member_name`, `team_name` from tool input | Identifies which team member was spawned |
| `SubagentStop` | `agent_id` + `agent_transcript_path` | Confirms the full path after agent finishes |

Events are correlated by `session_id` and timestamp proximity to produce the final mapping.

### Setup

The hooks are defined in `~/.claude/settings.json` (user-level, applies to all projects).

**1. Copy the hook script:**

```bash
cp hooks/hivewatch-agent-map.sh ~/.claude/hooks/hivewatch-agent-map.sh
chmod +x ~/.claude/hooks/hivewatch-agent-map.sh
```

**2. Add the hook entries to `~/.claude/settings.json`:**

```jsonc
{
  "hooks": {
    // ... your existing hooks ...
    "SubagentStart": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "~/.claude/hooks/hivewatch-agent-map.sh" }]
      }
    ],
    "SubagentStop": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "~/.claude/hooks/hivewatch-agent-map.sh" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Task",
        "hooks": [{ "type": "command", "command": "~/.claude/hooks/hivewatch-agent-map.sh" }]
      }
    ]
  }
}
```

**3. Create the data directory:**

```bash
mkdir -p ~/.claude/hivewatch
```

The hook writes events to `~/.claude/hivewatch/events.jsonl`. HiveWatch's server reads this file to resolve agent identities. The hook always exits 0 and never blocks Claude Code.

### Without hooks

HiveWatch still works without hooks using content-based heuristics (matching member names in JSONL message content). This covers in-process agents well but may miss tmux agents whose transcripts don't contain identifiable member names.

### Requirements

The hook script requires `jq` for JSON parsing:

```bash
# macOS (usually pre-installed, otherwise):
brew install jq
```

## How it works

HiveWatch reads Claude Code's file-based IPC system directly from disk:

| Data source | Path | Contents |
|---|---|---|
| Team config | `~/.claude/teams/{name}/config.json` | Members, roles, models, session IDs |
| Agent inboxes | `~/.claude/teams/{name}/inboxes/{agent}.json` | Messages between agents |
| Task files | `~/.claude/tasks/{name}/{id}.json` | Task status, ownership, dependencies |
| Conversation transcripts | `~/.claude/projects/{path}/{sessionId}/subagents/*.jsonl` | Tool calls, reasoning, timestamps |
| Sessions index | `~/.claude/projects/{path}/sessions-index.json` | Session metadata for solo session discovery |
| Hook events | `~/.claude/hivewatch/events.jsonl` | Agent ID to member name mapping |
| Snapshots | `~/.claude/hivewatch/snapshots/` | Persisted team and session state |

The Express server watches these files with chokidar and pushes updates via WebSocket. The JSONL tail reader uses adaptive chunk sizing (64KB to 256KB) to efficiently extract recent tool calls without loading entire transcript files.

### Agent types

Claude Code supports two backend types for team members:

| Type | How it runs | Mapping strategy |
|---|---|---|
| **in-process** | Runs inside the lead agent's process | Content heuristics (member name in messages) + hooks |
| **tmux** | Runs in separate tmux panes, communicates via inbox files | Hooks required (content doesn't contain member names) |

Both types write their JSONL transcripts to the same `subagents/` directory under the lead session.

### Session monitoring

HiveWatch discovers solo Claude Code sessions (non-team) by scanning `sessions-index.json` files every 5 seconds. Active sessions are those modified within the last 2 hours.

For each session, HiveWatch detects:
- Project path and git branch
- Initial prompt
- Subagent hierarchies via `{sessionId}/subagents/` directories
- Agent types resolved from hook events

Session activity is fetched on-demand via REST (`GET /api/sessions/:id/activity`) with a 3-tier fallback: live data, direct JSONL scan, or snapshot. The frontend polls activity at 3-second intervals on the detail page.

Ended sessions are preserved from snapshots alongside disbanded teams.

## Architecture

```
~/.claude/teams/     ─┐
~/.claude/tasks/      ├─→  server/ (Express :3847)  ──WebSocket──→  React frontend (:5173)
~/.claude/projects/  ─┘    chokidar + polling                      Vite dev proxy → :3847
~/.claude/hivewatch/ ─┘    ↓ snapshots
                     ~/.claude/hivewatch/snapshots/
```

**Server**: Modular Express backend — `server/index.ts` is a thin entry point, with logic split across `constants.ts`, `routes.ts`, `websocket.ts`, and 7 reader modules in `server/readers/`. File watching via chokidar for config/task/inbox changes. Polling at 2s for activity, 5s for disbandment detection and session discovery, 1h for snapshot pruning. Graceful shutdown on SIGTERM/SIGINT.

**Frontend**: React 19 + TypeScript + Tailwind CSS v4. Four routes: Dashboard, TeamDetail, AgentDetail, SessionDetail. WebSocket for live team updates with auto-reconnect. REST polling for session activity. Data survival via useRef caching when teams or sessions disappear.

**Persistence**: On every chokidar change, the server writes atomic snapshots to `~/.claude/hivewatch/snapshots/` for both teams and sessions. `reconcileSnapshots()` runs at startup to restore state. Old snapshots auto-prune after 7 days.

**Hooks**: Shell script registered in Claude Code settings. Captures agent spawn/stop events and writes them to `~/.claude/hivewatch/events.jsonl`. The server correlates `SubagentStart` events (which have the agent hash ID) with `PostToolUse/Task` events (which have the member name) by matching session IDs and timestamps.

## REST API

| Endpoint | Response |
|---|---|
| `GET /api/teams` | `{ live, disbanded }` |
| `GET /api/teams/:name` | Single team (snapshot fallback) |
| `GET /api/teams/:name/tasks` | Team tasks |
| `GET /api/teams/:name/inboxes` | All agent inboxes |
| `GET /api/teams/:name/inboxes/:agent` | Single agent inbox |
| `GET /api/teams/:name/activity` | Team activity feed |
| `GET /api/stats` | Aggregate statistics |
| `GET /api/history` | Recent team history |
| `GET /api/sessions` | `{ active, ended }` |
| `GET /api/sessions/:id/activity` | Session activity (3-tier fallback) |

## WebSocket events

`initial_state`, `team_updated`, `task_updated`, `inbox_updated`, `activity_updated`, `team_disbanded`, `session_updated`, `session_ended`

## Stack

- TypeScript, React 19, Tailwind CSS v4
- Express, WebSocket (ws), chokidar
- Vite with dev proxy
- Claude Code hooks for agent identity mapping
