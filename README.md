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

## How it works

HiveWatch reads Claude Code's file-based IPC system directly from disk:

| Data source | Path | Contents |
|---|---|---|
| Team config | `~/.claude/teams/{name}/config.json` | Members, roles, models, session IDs |
| Agent inboxes | `~/.claude/teams/{name}/inboxes/{agent}.json` | Messages between agents |
| Task files | `~/.claude/tasks/{name}/{id}.json` | Task status, ownership, dependencies |
| Conversation transcripts | `~/.claude/projects/{path}/{sessionId}/subagents/*.jsonl` | Tool calls, reasoning, timestamps |

The Express server watches these files with chokidar and pushes updates via WebSocket. The JSONL tail reader efficiently reads the last 32KB of each agent's transcript to extract recent tool calls without loading entire files.

## Architecture

```
~/.claude/teams/     ─┐
~/.claude/tasks/      ├─→  Express server (port 3847)  ──WebSocket──→  React frontend
~/.claude/projects/  ─┘    (chokidar + 2s polling)                     (Vite dev server)
```

**Server**: Express + WebSocket + chokidar file watcher. Reads team configs, tasks, inboxes on change. Polls JSONL transcripts every 2 seconds for activity updates.

**Frontend**: React 19 + TypeScript + Tailwind CSS v4. Three-column team view with tabbed Activity/Messages panel. WebSocket for live updates with auto-reconnect.

## Stack

- TypeScript, React 19, Tailwind CSS v4
- Express, WebSocket (ws), chokidar
- Vite with dev proxy
