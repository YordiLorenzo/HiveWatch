import { useState, useRef, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronRight, Inbox, ListTodo, Terminal, Clock, Activity, XCircle } from 'lucide-react'
import type { HiveData } from '../hooks/useHiveData'
import type { InboxMessage, TeamOverview } from '../../shared/types'
import StatusBadge from '../components/StatusBadge'
import MessageBubble from '../components/MessageBubble'
import ActivityFeed from '../components/ActivityFeed'
import Markdown from '../components/Markdown'
import { filterRealTasks } from '../utils/format'

function formatJoinedDate(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AgentDetail({ data }: { data: HiveData }) {
  const { team: teamName, name: agentName } = useParams<{ team: string; name: string }>()
  const [promptExpanded, setPromptExpanded] = useState(false)

  // Cache last known team data so agent view survives team cleanup
  const cachedTeamRef = useRef<TeamOverview | null>(null)
  const liveTeamData = teamName ? data.teams[teamName] : undefined
  const disbandedEntry = teamName ? data.disbandedTeams[teamName] : undefined
  const isDisbanded = !liveTeamData && (!!disbandedEntry || cachedTeamRef.current !== null)

  useEffect(() => {
    if (liveTeamData) cachedTeamRef.current = liveTeamData
  }, [liveTeamData])

  if (data.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-600 animate-pulse text-sm">Loading...</div>
      </div>
    )
  }

  const teamData = liveTeamData || disbandedEntry?.overview || cachedTeamRef.current
  if (!teamData) {
    return (
      <div className="py-10 text-center">
        <p className="text-zinc-500 text-sm">Team "{teamName}" not found.</p>
        <Link to="/" className="text-amber-500 hover:text-amber-400 text-xs mt-2 inline-block">
          Dashboard
        </Link>
      </div>
    )
  }

  const agent = teamData.config.members.find((m) => m.name === agentName)
  if (!agent) {
    return (
      <div className="py-10 text-center">
        <p className="text-zinc-500 text-sm">Agent "{agentName}" not found in "{teamName}".</p>
        <Link
          to={`/team/${teamName}`}
          className="text-amber-500 hover:text-amber-400 text-xs mt-2 inline-block"
        >
          Back to {teamName}
        </Link>
      </div>
    )
  }

  const assignedTasks = filterRealTasks(teamData.tasks, teamData.config.members)
    .filter((t) => t.owner === agentName)

  const inbox: InboxMessage[] = (agentName ? teamData.inboxes[agentName] ?? [] : [])
    .slice()
    .sort((a: InboxMessage, b: InboxMessage) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  return (
    <div className="space-y-6">
      {isDisbanded && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/40 border border-zinc-700/30 text-zinc-400 text-xs">
          <XCircle className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
          Team disbanded — showing last known state
        </div>
      )}

      {/* HEADER */}
      <div>
        <Link
          to={isDisbanded ? '/' : `/team/${teamName}`}
          className="inline-flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300 transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {isDisbanded ? 'Dashboard' : teamName}
        </Link>

        <div className="flex items-start gap-4">
          <span
            className="w-4 h-4 rounded-full flex-shrink-0 mt-1.5"
            style={{ backgroundColor: agent.color }}
          />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-zinc-200">{agent.name}</h1>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-400">
                {agent.model}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-400">
                {agent.agentType}
              </span>
              {agent.backendType && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-400">
                  {agent.backendType}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 mt-2 text-[11px] text-zinc-600 font-mono">
              <Terminal className="w-3 h-3" />
              {agent.cwd}
            </div>
            <div className="flex items-center gap-1 mt-1 text-[11px] text-zinc-600 font-mono">
              <Clock className="w-3 h-3" />
              joined {formatJoinedDate(agent.joinedAt)}
            </div>
          </div>
        </div>
      </div>

      {/* SYSTEM PROMPT */}
      {agent.prompt && (
        <div className="border border-zinc-800/40 rounded-lg overflow-hidden">
          <button
            onClick={() => setPromptExpanded(!promptExpanded)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-zinc-500 hover:bg-[#161618] transition-colors"
          >
            {promptExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            System Prompt
          </button>
          {promptExpanded && (
            <div className="px-4 pb-4">
              <pre className="bg-[#0a0a0b] rounded-lg p-4 text-[11px] text-zinc-400 font-mono whitespace-pre-wrap break-words overflow-x-auto max-h-96 overflow-y-auto">
                {agent.prompt}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* LIVE ACTIVITY */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-zinc-600" />
          <h2 className="text-sm font-semibold text-zinc-300">Live Activity</h2>
        </div>
        <ActivityFeed
          activities={data.activities[teamName!] || {}}
          members={teamData.config.members}
          singleAgent={agentName}
        />
      </div>

      {/* ASSIGNED TASKS */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ListTodo className="w-4 h-4 text-zinc-600" />
          <h2 className="text-sm font-semibold text-zinc-300">Tasks</h2>
          <span className="text-[11px] text-zinc-600 font-mono">({assignedTasks.length})</span>
        </div>
        {assignedTasks.length === 0 ? (
          <p className="text-xs text-zinc-600">No tasks assigned.</p>
        ) : (
          <div className="space-y-2">
            {assignedTasks.map((task) => (
              <div
                key={task.id}
                className="border border-zinc-800/40 rounded-lg bg-[#111113] p-3"
              >
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-600 text-[10px] font-mono">#{task.id}</span>
                    <span className="font-medium text-xs text-zinc-300">{task.subject}</span>
                  </div>
                  <StatusBadge status={task.status} />
                </div>
                {task.description && (
                  <Markdown content={task.description} className="text-[11px] text-zinc-500" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MESSAGES / INBOX */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Inbox className="w-4 h-4 text-zinc-600" />
          <h2 className="text-sm font-semibold text-zinc-300">Messages</h2>
          <span className="text-[11px] text-zinc-600 font-mono">({inbox.length})</span>
        </div>
        {inbox.length === 0 ? (
          <p className="text-xs text-zinc-600">No messages.</p>
        ) : (
          <div className="space-y-2">
            {inbox.map((msg, i) => (
              <MessageBubble key={`${msg.timestamp}-${i}`} message={msg} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
