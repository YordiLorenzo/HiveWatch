# HiveWatch

Real-time monitoring dashboard for Claude Code agent teams. Reads Claude Code's file-based IPC from disk, pushes updates over WebSocket.

## Critical Constraints

- **Read-only monitoring of `~/.claude/`** — never write to `~/.claude/`. Persistence snapshots go to `~/.claude/hivewatch/snapshots/`.
- **Server is modular** — `server/index.ts` is a thin entry point. Logic lives in `constants.ts`, `routes.ts`, `websocket.ts`, and `readers/`. All imports use `.js` extension (ESM).
- **Shared types are the contract** — `shared/types.ts` is used by both frontend and backend. Never duplicate types.
- **Tailwind v4 only** — no CSS modules, no styled-components, no separate stylesheets. All styling is inline Tailwind classes.
- **No test suite exists** — don't run `npm test`, it's not configured.

## Architecture

```
~/.claude/teams/     ─┐
~/.claude/tasks/      ├─→  server/ (Express :3847)  ──WebSocket──→  React frontend (:5173)
~/.claude/projects/  ─┘    chokidar + 2s polling                   Vite dev proxy → :3847
                           ↓ snapshots
                     ~/.claude/hivewatch/snapshots/{teamName}/
```

**Data flow:** chokidar watches config/task/inbox files → change triggers read → WebSocket broadcast + snapshot write → React state updates → UI re-renders.

**JSONL activity:** Server polls agent transcript files (last 32KB tail read) every 2s, dedupes by content hash before broadcasting.

**Session monitoring:** Server scans `~/.claude/projects/*/sessions-index.json` every 5s to discover active solo sessions (non-team, modified within 2h). Detects subagent hierarchies via `{sessionId}/subagents/` directories. Agent types resolved from hook events. Session activity fetched on-demand via REST.

**Persistence:** On every chokidar change, server writes atomic snapshots to `~/.claude/hivewatch/snapshots/`. When a team is disbanded (files deleted), the snapshot preserves all data. A 5s interval detects disbandment; `reconcileSnapshots()` runs at startup. Old snapshots auto-prune after 7 days.

## Commands

```bash
npm run server    # Express backend on :3847
npm run dev       # Vite frontend on :5173 (proxies /api and /ws to :3847)
npm run dev:all   # Both (server backgrounded)
npm run build     # TypeScript check + Vite production build
npm run lint      # ESLint
```

Both servers must run simultaneously. Frontend alone shows nothing — it needs the WebSocket.

## Code Conventions

**Theme:** Dark-first. Background `#0a0a0b`, surfaces `#111113`, borders `zinc-800/40`. Accent color is amber.

**Data display:** All IDs, timestamps, file paths, agent names, and status labels use `font-mono`. Text sizes are small: `text-xs`, `text-[11px]`, `text-[10px]`.

**Icons:** `lucide-react` only. Import individual icons: `import { Activity } from 'lucide-react'`.

**Components:** Functional only. Props destructured in signature. No prop spreading.

**Routing:** `react-router-dom` v7. Pages in `src/pages/`, linked from `src/App.tsx`.

## File Organization

```
server/
  index.ts               # Thin entry point: Express app + server startup
  constants.ts           # Path constants (CLAUDE_DIR, TEAMS_DIR, etc.) + readJsonSafe utility
  routes.ts              # registerRoutes(app) — REST API endpoints (live + snapshot fallback)
  websocket.ts           # setupWebSocket(server) — broadcast, watchers, polling, disbandment detection
  readers/
    team.ts              # Team config, tasks, inboxes, overview readers
    activity.ts          # JSONL tail reader, agent path resolution, activity cache
    session.ts           # Solo session discovery (sessions-index scanning) + activity reading
    hook-mapping.ts      # Hook event log parsing, agent_id -> member name correlation
    member-identify.ts   # Content-based JSONL-to-member heuristics (fallback identification)
    snapshot.ts          # Persistence layer: atomic writes, snapshot CRUD, reconciliation, pruning
    history.ts           # Stats + recent history readers
shared/types.ts          # All shared TypeScript interfaces (InboxMessage, SnapshotMeta, WsEventType)
src/
  utils/format.ts        # Shared utilities: relativeTime, getMemberColor, normalizeMessage
  pages/
    Dashboard.tsx        # Team list + sessions list + disbanded teams section
    TeamDetail.tsx       # Team detail (imports AgentsPanel, TaskBoard, RightPanel)
    AgentDetail.tsx      # Individual agent profile + activity + tasks
    SessionDetail.tsx    # Solo session detail: lead + subagent activity hierarchy
  components/
    AgentCard.tsx        # AgentCard + AgentsPanel (extracted from TeamDetail)
    TaskBoard.tsx        # TaskCard + TaskBoard (extracted from TeamDetail)
    RightPanel.tsx       # Activity/Messages tabbed panel (extracted from TeamDetail)
    ActivityFeed.tsx     # Tool call + reasoning timeline
    MessageBubble.tsx    # Message rendering (DM, broadcast, system types)
    StatusBadge.tsx      # Color-coded task status indicator
    Markdown.tsx         # React markdown renderer
    Layout.tsx           # Header + main wrapper
  hooks/useHiveData.ts   # WebSocket connection + state (teams, disbandedTeams, sessions, activities)
  index.css              # Tailwind v4 imports + @theme + scrollbar styles only
```

## Gotchas

- **Agent tracking tasks:** Claude Code auto-generates tasks whose `subject` matches a team member name. Filter these out when displaying task counts/boards: `tasks.filter(t => !memberNames.has(t.subject))`.
- **Subagent JSONL paths:** In-process agents store transcripts at `{leadSessionId}/subagents/agent-{shortId}.jsonl`, not project root. Match agent to file by checking first message content for the agent name.
- **Agent ID mismatch:** Team config uses `name@team` format, JSONL files use short hash IDs. The server resolves this mapping.
- **Tailwind v4 syntax:** Use `bg-black/10` not `bg-opacity-10`. The opacity modifier syntax changed from v3.
- **No mock data:** App requires active Claude Code teams in `~/.claude/teams/`. Empty state is normal without them.
- **Vite proxy:** Frontend WebSocket connects to `/ws` which Vite proxies to `:3847`. Don't hardcode `ws://localhost:3847`.
- **Session vs team exclusion:** Solo sessions exclude team lead sessions by comparing against `leadSessionId` from team configs. If a session appears in both, the team view wins.
- **Session activity is REST-only:** Unlike team activity (pushed via WebSocket), session activity is fetched on-demand from `GET /api/sessions/:id/activity` with client-side polling on the detail page.

## Do Not

- Install state management libraries (WebSocket + React state is sufficient)
- Add authentication (local dev tool)
- Create API client abstractions (WebSocket-first, REST is minimal)
- Add new CSS files (Tailwind handles everything)
- Use gray/neutral Tailwind colors (use zinc for consistency)
- Add polling where WebSocket events already exist
