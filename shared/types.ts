// Shared types matching ~/.claude/ data structures

export interface TeamMember {
  agentId: string;
  name: string;
  agentType: string;
  model: string;
  prompt?: string;
  color: string;
  planModeRequired?: boolean;
  joinedAt: number;
  tmuxPaneId: string;
  cwd: string;
  subscriptions: string[];
  backendType?: string;
}

export interface TeamConfig {
  name: string;
  description: string;
  createdAt: number;
  leadAgentId: string;
  leadSessionId: string;
  members: TeamMember[];
}

export interface Task {
  id: string;
  subject: string;
  description: string;
  activeForm?: string;
  owner?: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
  blocks: string[];
  blockedBy: string[];
}

export interface InboxMessage {
  from: string;
  text: string;
  summary?: string;
  timestamp: string;
  color?: string;
  read: boolean;
  // System message fields
  type?: "idle_notification" | "shutdown_approved" | "task_assignment" | "shutdown_request";
  idleReason?: string;
  requestId?: string;
  taskId?: string;
  subject?: string;
  description?: string;
  assignedBy?: string;
  paneId?: string;
  backendType?: string;
}

export interface HistoryEntry {
  display: string;
  pastedContents: Record<string, unknown>;
  timestamp: number;
  project: string;
  sessionId: string;
}

export interface DailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export interface StatsCache {
  version: number;
  lastComputedDate: string;
  dailyActivity: DailyActivity[];
}

// Enriched types for the API
export interface TeamOverview {
  config: TeamConfig;
  tasks: Task[];
  inboxes: Record<string, InboxMessage[]>;
}

export interface AgentStatus {
  name: string;
  team: string;
  color: string;
  model: string;
  agentType: string;
  cwd: string;
  lastActivity?: string;
  isIdle: boolean;
  currentTask?: Task;
  unreadMessages: number;
  totalMessages: number;
}

// Agent activity from JSONL transcripts
export interface AgentActivity {
  agentName: string;
  teamName: string;
  timestamp: string;
  type: "tool_call" | "reasoning" | "tool_result";
  toolName?: string;
  toolInput?: Record<string, unknown>;
  text?: string;
  summary?: string;
}

// WebSocket event types
export type WsEventType =
  | "team_updated"
  | "task_updated"
  | "inbox_updated"
  | "initial_state"
  | "activity_updated";

export interface WsEvent {
  type: WsEventType;
  team?: string;
  data: unknown;
}
