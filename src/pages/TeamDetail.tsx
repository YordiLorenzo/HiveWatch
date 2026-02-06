import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Clock, CheckCircle, Circle, AlertTriangle, MessageSquare, Users, Activity } from 'lucide-react'
import type { HiveData } from '../hooks/useHiveData'
import type { TeamOverview, Task, InboxMessage, TeamMember } from '../../shared/types'
import MessageBubble from '../components/MessageBubble'
import ActivityFeed from '../components/ActivityFeed'

function relativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getAgentStatus(agentName: string, inboxes: Record<string, InboxMessage[]>): 'idle' | 'active' {
  const messages = inboxes[agentName]
  if (!messages || messages.length === 0) return 'active'
  const last = messages[messages.length - 1]
  return last.type === 'idle_notification' ? 'idle' : 'active'
}

function getAgentCurrentTask(agentName: string, tasks: Task[]): Task | undefined {
  return tasks.find((t) => t.owner === agentName && t.status === 'in_progress')
}

function getMemberColor(name: string, members: TeamMember[]): string {
  return members.find((m) => m.name === name)?.color || '#71717a'
}

function normalizeMessage(msg: InboxMessage): InboxMessage {
  if (!msg.type && msg.text) {
    try {
      const parsed = JSON.parse(msg.text)
      if (parsed && typeof parsed === 'object' && parsed.type) {
        return { ...msg, ...parsed }
      }
    } catch {
      // not JSON, keep as-is
    }
  }
  return msg
}

function getAllMessages(team: TeamOverview): (InboxMessage & { _recipient: string })[] {
  const all: (InboxMessage & { _recipient: string })[] = []
  for (const [recipient, messages] of Object.entries(team.inboxes)) {
    for (const rawMsg of messages) {
      const msg = normalizeMessage(rawMsg)
      if (msg.type === 'idle_notification') continue
      if (msg.type === 'shutdown_approved') continue
      all.push({ ...msg, _recipient: recipient })
    }
  }
  return all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

// --- Agent Panel ---

function AgentCard({
  member,
  status,
  currentTask,
  teamName,
}: {
  member: TeamMember
  status: 'idle' | 'active'
  currentTask?: Task
  teamName: string
}) {
  return (
    <Link
      to={`/agent/${teamName}/${member.name}`}
      className="block bg-[#111113] border border-zinc-800/40 rounded-lg p-3 hover:border-zinc-700/60 hover:bg-[#161618] transition-all"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: member.color }}
        />
        <span className="font-medium text-xs text-zinc-200 truncate">{member.name}</span>
      </div>
      <p className="text-[10px] text-zinc-600 font-mono mb-1.5">{member.model}</p>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] bg-zinc-800/60 text-zinc-500 px-1.5 py-0.5 rounded font-mono">
          {member.agentType}
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
            status === 'idle'
              ? 'bg-zinc-800/60 text-zinc-600'
              : 'bg-emerald-500/10 text-emerald-400'
          }`}
        >
          {status}
        </span>
      </div>
      {currentTask && (
        <p className="text-[11px] text-amber-500/70 truncate mt-1 font-mono">
          {currentTask.activeForm || currentTask.subject}
        </p>
      )}
    </Link>
  )
}

function AgentsPanel({ team, teamName }: { team: TeamOverview; teamName: string }) {
  return (
    <div className="w-full lg:w-[220px] flex-shrink-0 flex flex-col min-h-0">
      <h2 className="text-[11px] font-semibold text-zinc-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" />
        Agents ({team.config.members.length})
      </h2>
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto min-h-0">
        {team.config.members.map((member) => (
          <AgentCard
            key={member.agentId}
            member={member}
            status={getAgentStatus(member.name, team.inboxes)}
            currentTask={getAgentCurrentTask(member.name, team.tasks)}
            teamName={teamName}
          />
        ))}
      </div>
    </div>
  )
}

// --- Task Board ---

function TaskCard({ task, members }: { task: Task; members: TeamMember[] }) {
  const ownerColor = task.owner ? getMemberColor(task.owner, members) : undefined

  const statusStyles: Record<string, string> = {
    pending: 'bg-[#111113] border-zinc-800/40',
    in_progress: 'bg-amber-500/5 border-amber-500/20',
    completed: 'bg-emerald-500/5 border-emerald-500/20',
    blocked: 'bg-red-500/5 border-red-500/20',
  }

  return (
    <div className={`border rounded-lg p-3 ${statusStyles[task.status] || statusStyles.pending}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-zinc-600 font-mono">#{task.id}</span>
      </div>
      <p className="text-xs font-medium text-zinc-300 mb-2">{task.subject}</p>
      {task.status === 'in_progress' && task.activeForm && (
        <p className="text-[11px] text-amber-500/60 mb-2 italic font-mono">{task.activeForm}</p>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {task.owner ? (
            <>
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: ownerColor }}
              />
              <span className="text-[11px] text-zinc-500 font-mono">{task.owner}</span>
            </>
          ) : (
            <span className="text-[11px] text-zinc-700 font-mono">unassigned</span>
          )}
        </div>
        {task.blockedBy.length > 0 && (
          <div className="flex items-center gap-1">
            {task.blockedBy.map((id) => (
              <span
                key={id}
                className="text-[10px] bg-red-500/10 text-red-400/70 px-1.5 py-0.5 rounded font-mono"
              >
                blocked #{id}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TaskBoard({ team }: { team: TeamOverview }) {
  // Filter out auto-generated agent tracking tasks (subject matches a member name)
  const memberNames = new Set(team.config.members.map((m) => m.name))
  const realTasks = team.tasks.filter((t) => !memberNames.has(t.subject))

  const pending = realTasks.filter((t) => t.status === 'pending' || t.status === 'blocked')
  const inProgress = realTasks.filter((t) => t.status === 'in_progress')
  const completed = realTasks.filter((t) => t.status === 'completed')

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      <h2 className="text-[11px] font-semibold text-zinc-600 uppercase tracking-wider mb-3 flex items-center gap-1.5 flex-shrink-0">
        <CheckCircle className="w-3.5 h-3.5" />
        Tasks ({realTasks.length})
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1 overflow-y-auto min-h-0">
        <div>
          <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Circle className="w-2.5 h-2.5" />
            Pending ({pending.length})
          </h3>
          <div className="flex flex-col gap-2">
            {pending.length === 0 ? (
              <p className="text-[11px] text-zinc-700 text-center py-4">None</p>
            ) : (
              pending.map((task) => (
                <TaskCard key={task.id} task={task} members={team.config.members} />
              ))
            )}
          </div>
        </div>
        <div>
          <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Clock className="w-2.5 h-2.5 text-amber-500/70" />
            In Progress ({inProgress.length})
          </h3>
          <div className="flex flex-col gap-2">
            {inProgress.length === 0 ? (
              <p className="text-[11px] text-zinc-700 text-center py-4">None</p>
            ) : (
              inProgress.map((task) => (
                <TaskCard key={task.id} task={task} members={team.config.members} />
              ))
            )}
          </div>
        </div>
        <div>
          <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <CheckCircle className="w-2.5 h-2.5 text-emerald-500/70" />
            Done ({completed.length})
          </h3>
          <div className="flex flex-col gap-2">
            {completed.length === 0 ? (
              <p className="text-[11px] text-zinc-700 text-center py-4">None</p>
            ) : (
              completed.map((task) => (
                <TaskCard key={task.id} task={task} members={team.config.members} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Right Panel (Activity + Messages, tabbed) ---

function RightPanel({ team, data, teamName }: { team: TeamOverview; data: HiveData; teamName: string }) {
  const [tab, setTab] = useState<'activity' | 'messages'>('activity')
  const messages = getAllMessages(team)
  const activities = data.activities[teamName] || {}

  return (
    <div className="w-full lg:w-[400px] flex-shrink-0 flex flex-col min-h-0">
      <div className="flex items-center gap-1 mb-3 flex-shrink-0">
        <button
          onClick={() => setTab('activity')}
          className={`text-[11px] px-2 py-1 rounded font-medium transition-colors ${
            tab === 'activity'
              ? 'bg-amber-500/15 text-amber-400'
              : 'text-zinc-600 hover:text-zinc-400'
          }`}
        >
          <Activity className="w-3 h-3 inline mr-1" />
          Activity
        </button>
        <button
          onClick={() => setTab('messages')}
          className={`text-[11px] px-2 py-1 rounded font-medium transition-colors ${
            tab === 'messages'
              ? 'bg-amber-500/15 text-amber-400'
              : 'text-zinc-600 hover:text-zinc-400'
          }`}
        >
          <MessageSquare className="w-3 h-3 inline mr-1" />
          Messages ({messages.length})
        </button>
      </div>

      {tab === 'activity' ? (
        <div className="flex-1 overflow-y-auto min-h-0">
          <ActivityFeed activities={activities} members={team.config.members} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
          {messages.length === 0 ? (
            <p className="text-[11px] text-zinc-700 text-center py-4">No messages yet</p>
          ) : (
            messages.map((msg, i) => (
              <MessageBubble key={`${msg.timestamp}-${i}`} message={msg} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// --- Main Component ---

export default function TeamDetail({ data }: { data: HiveData }) {
  const { name } = useParams<{ name: string }>()

  if (data.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-600 animate-pulse text-sm">Loading team...</div>
      </div>
    )
  }

  const team = name ? data.teams[name] : undefined

  if (!team) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle className="w-8 h-8 text-zinc-700 mb-3" />
        <p className="text-sm font-medium text-zinc-500">Team not found</p>
        <Link to="/" className="text-xs text-amber-500 hover:text-amber-400 mt-2">
          Back to dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)]">
      <div className="flex-shrink-0">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Dashboard
        </Link>

        <div className="flex items-center gap-3 mb-5">
          <h1 className="text-xl font-semibold text-zinc-200">{team.config.name}</h1>
          {team.config.description && (
            <span className="text-xs text-zinc-600">{team.config.description}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 flex-1 min-h-0">
        <AgentsPanel team={team} teamName={name!} />
        <TaskBoard team={team} />
        <RightPanel team={team} data={data} teamName={name!} />
      </div>
    </div>
  )
}
