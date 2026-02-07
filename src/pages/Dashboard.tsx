import { Link } from 'react-router-dom'
import { Users, CheckCircle, MessageSquare, Eye, XCircle, Terminal, GitBranch, Layers, Clock } from 'lucide-react'
import type { HiveData } from '../hooks/useHiveData'
import type { TeamOverview, SoloSession } from '../../shared/types'
import { relativeTime, filterRealTasks } from '../utils/format'

function getUnreadCount(team: TeamOverview): number {
  let count = 0
  for (const messages of Object.values(team.inboxes)) {
    for (const msg of messages) {
      if (!msg.read) count++
    }
  }
  return count
}

function TeamCard({ team, disbanded, disbandedAt }: { team: TeamOverview; disbanded?: boolean; disbandedAt?: string }) {
  const { config, tasks } = team
  const realTasks = filterRealTasks(tasks, config.members)
  const completed = realTasks.filter((t) => t.status === 'completed').length
  const total = realTasks.length
  const unread = getUnreadCount(team)
  const progress = total > 0 ? (completed / total) * 100 : 0
  const inProgress = realTasks.filter((t) => t.status === 'in_progress').length

  return (
    <Link
      to={`/team/${config.name}`}
      className={`block bg-[#111113] border border-zinc-800/40 rounded-lg p-5 hover:border-zinc-700/60 hover:bg-[#161618] transition-all group ${disbanded ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-100 group-hover:text-amber-400 transition-colors">
            {config.name}
          </h2>
          {config.description && (
            <p className="text-xs text-zinc-500 mt-0.5">{config.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {disbanded && disbandedAt && (
            <span className="flex items-center gap-1 text-zinc-500 text-[10px] font-mono bg-zinc-800/60 px-1.5 py-0.5 rounded">
              <XCircle className="w-3 h-3" />
              disbanded {relativeTime(disbandedAt)}
            </span>
          )}
          {!disbanded && inProgress > 0 && (
            <span className="flex items-center gap-1 text-amber-500/80 text-[10px] font-mono bg-amber-500/10 px-1.5 py-0.5 rounded">
              {inProgress} active
            </span>
          )}
          {unread > 0 && (
            <span className="flex items-center gap-1 bg-amber-500/15 text-amber-400 text-[10px] font-mono px-1.5 py-0.5 rounded">
              <MessageSquare className="w-3 h-3" />
              {unread}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 mb-1">
        {config.members.map((member) => (
          <span
            key={member.agentId}
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: member.color }}
            title={member.name}
          />
        ))}
      </div>
      <p className="text-[11px] text-zinc-600 font-mono mb-4">
        {config.members.map((m) => m.name).join(' · ')}
      </p>

      <div className="mb-3">
        <div className="flex items-center justify-between text-[11px] mb-1.5">
          <span className="text-zinc-500 flex items-center gap-1 font-mono">
            <CheckCircle className="w-3 h-3 text-emerald-500/70" />
            {completed}/{total}
          </span>
          <span className="text-zinc-600 font-mono">{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-zinc-800/50 rounded-full h-1">
          <div
            className="bg-emerald-500/80 h-1 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-zinc-600">
        <span className="flex items-center gap-1 font-mono">
          <Users className="w-3 h-3" />
          {config.members.length}
        </span>
        <span className="font-mono">{relativeTime(config.createdAt)}</span>
      </div>
    </Link>
  )
}

function SessionCard({ session, ended }: { session: SoloSession; ended?: boolean }) {
  const promptPreview = session.firstPrompt.length > 80
    ? session.firstPrompt.slice(0, 77) + '...'
    : session.firstPrompt

  return (
    <Link
      to={`/session/${session.sessionId}`}
      className={`block bg-[#111113] border border-zinc-800/40 rounded-lg p-5 hover:border-zinc-700/60 hover:bg-[#161618] transition-all group ${ended ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-zinc-100 group-hover:text-amber-400 transition-colors truncate">
            {session.projectName}
          </h2>
          {session.gitBranch && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 mt-0.5">
              <GitBranch className="w-3 h-3" />
              {session.gitBranch}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {ended && (
            <span className="flex items-center gap-1 text-zinc-500 text-[10px] font-mono bg-zinc-800/60 px-1.5 py-0.5 rounded">
              <Clock className="w-3 h-3" />
              ended {relativeTime(session.modified)}
            </span>
          )}
          {session.subagents.length > 0 && (
            <span className="flex items-center gap-1 text-amber-500/80 text-[10px] font-mono bg-amber-500/10 px-1.5 py-0.5 rounded">
              <Layers className="w-3 h-3" />
              {session.subagents.length}
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-zinc-500 mb-3 line-clamp-2 leading-relaxed">
        {promptPreview}
      </p>

      {session.subagents.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {session.subagents.slice(0, 6).map((sub) => (
            <span
              key={sub.agentId}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-500"
            >
              {sub.agentType || `agent-${sub.agentId.slice(0, 7)}`}
            </span>
          ))}
          {session.subagents.length > 6 && (
            <span className="text-[10px] font-mono text-zinc-600">
              +{session.subagents.length - 6}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-zinc-600">
        <span className="flex items-center gap-1 font-mono">
          <MessageSquare className="w-3 h-3" />
          {session.messageCount}
        </span>
        <span className="font-mono">{relativeTime(session.modified)}</span>
      </div>
    </Link>
  )
}

export default function Dashboard({ data }: { data: HiveData }) {
  const teamList = Object.values(data.teams)
  const disbandedList = Object.entries(data.disbandedTeams)
  const sessionList = data.sessions || []
  const endedSessionList = data.endedSessions || []

  if (data.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-600 animate-pulse text-sm">Loading...</div>
      </div>
    )
  }

  if (teamList.length === 0 && disbandedList.length === 0 && sessionList.length === 0 && endedSessionList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
        <Eye className="w-10 h-10 mb-4 text-zinc-800" />
        <p className="text-sm font-medium text-zinc-500">No active sessions</p>
        <p className="text-xs mt-1">Teams and sessions will appear here when Claude Code is running.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold text-zinc-300">Teams</h1>
        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-600">
          <span
            className={`w-1.5 h-1.5 rounded-full ${data.connected ? 'bg-emerald-500' : 'bg-red-500'}`}
          />
          {data.connected ? 'live' : 'disconnected'}
        </div>
      </div>

      {teamList.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {teamList.map((team) => (
            <TeamCard key={team.config.name} team={team} />
          ))}
        </div>
      )}

      {sessionList.length > 0 && (
        <div className={teamList.length > 0 ? 'mt-8' : ''}>
          <h2 className="text-[11px] font-semibold text-zinc-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5" />
            Sessions ({sessionList.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sessionList.map((session) => (
              <SessionCard key={session.sessionId} session={session} />
            ))}
          </div>
        </div>
      )}

      {endedSessionList.length > 0 && (
        <div className="mt-8">
          <h2 className="text-[11px] font-semibold text-zinc-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" />
            Ended Sessions ({endedSessionList.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {endedSessionList.map((session) => (
              <SessionCard key={session.sessionId} session={session} ended />
            ))}
          </div>
        </div>
      )}

      {teamList.length === 0 && sessionList.length === 0 && endedSessionList.length === 0 && disbandedList.length > 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-zinc-600 mb-6">
          <Eye className="w-8 h-8 mb-3 text-zinc-800" />
          <p className="text-xs">No active teams or sessions</p>
        </div>
      )}

      {disbandedList.length > 0 && (
        <div className="mt-8">
          <h2 className="text-[11px] font-semibold text-zinc-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" />
            Disbanded Teams ({disbandedList.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {disbandedList.map(([name, { overview, disbandedAt }]) => (
              <TeamCard key={name} team={overview} disbanded disbandedAt={disbandedAt} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
