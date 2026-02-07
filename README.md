<p align="center">
  <img src="public/hivewatch.svg" width="80" height="80" alt="HiveWatch">
</p>

<h1 align="center">HiveWatch</h1>

<p align="center">Real-time monitoring dashboard for Claude Code agent teams.</p>

---

## What it does

When you run Claude Code with the team feature (multiple AI agents collaborating on tasks), HiveWatch gives you a live web dashboard showing:

- **Agent status** — which agents are active, idle, or stuck, with their current task
- **Task board** — kanban view of pending, in-progress, and completed tasks with owner assignments and dependency chains
- **Live activity stream** — real-time tool calls (Read, Edit, Bash, Grep, etc.) and reasoning from each agent, extracted from JSONL conversation transcripts
- **Message feed** — inter-agent communication with parsed structured messages (task assignments, shutdown requests, idle notifications)
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

Open `http://localhost:5173`. The dashboard auto-discovers teams from `~/.claude/teams/`.

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
| Hook events | `~/.claude/hivewatch/events.jsonl` | Agent ID to member name mapping |

The Express server watches these files with chokidar and pushes updates via WebSocket. The JSONL tail reader efficiently reads the last 32KB of each agent's transcript to extract recent tool calls without loading entire files.

### Agent types

Claude Code supports two backend types for team members:

| Type | How it runs | Mapping strategy |
|---|---|---|
| **in-process** | Runs inside the lead agent's process | Content heuristics (member name in messages) + hooks |
| **tmux** | Runs in separate tmux panes, communicates via inbox files | Hooks required (content doesn't contain member names) |

Both types write their JSONL transcripts to the same `subagents/` directory under the lead session.

## Architecture

```
~/.claude/teams/     ─┐
~/.claude/tasks/      ├─→  Express server (port 3847)  ──WebSocket──→  React frontend
~/.claude/projects/  ─┘    (chokidar + 2s polling)                     (Vite dev server)
~/.claude/hivewatch/ ─┘
```

**Server**: Express + WebSocket + chokidar file watcher. Reads team configs, tasks, inboxes on change. Polls JSONL transcripts every 2 seconds for activity updates.

**Frontend**: React 19 + TypeScript + Tailwind CSS v4. Three-column team view with tabbed Activity/Messages panel. WebSocket for live updates with auto-reconnect.

**Hooks**: Shell script registered in Claude Code settings. Captures agent spawn/stop events and writes them to `~/.claude/hivewatch/events.jsonl`. The server correlates `SubagentStart` events (which have the agent hash ID) with `PostToolUse/Task` events (which have the member name) by matching session IDs and timestamps.

## Stack

- TypeScript, React 19, Tailwind CSS v4
- Express, WebSocket (ws), chokidar
- Vite with dev proxy
- Claude Code hooks for agent identity mapping
