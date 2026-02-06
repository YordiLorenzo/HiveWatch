import { Link } from 'react-router-dom'
import { Users, CheckCircle, MessageSquare, Eye } from 'lucide-react'
import type { HiveData } from '../hooks/useHiveData'
import type { TeamOverview } from '../../shared/types'

function getUnreadCount(team: TeamOverview): number {
  let count = 0
  for (const messages of Object.values(team.inboxes)) {
    for (const msg of messages) {
      if (!msg.read) count++
    }
  }
  return count
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function TeamCard({ team }: { team: TeamOverview }) {
  const { config, tasks } = team
  // Filter out auto-generated agent tracking tasks
  const memberNames = new Set(config.members.map((m) => m.name))
  const realTasks = tasks.filter((t) => !memberNames.has(t.subject))
  const completed = realTasks.filter((t) => t.status === 'completed').length
  const total = realTasks.length
  const unread = getUnreadCount(team)
  const progress = total > 0 ? (completed / total) * 100 : 0
  const inProgress = realTasks.filter((t) => t.status === 'in_progress').length

  return (
    <Link
      to={`/team/${config.name}`}
      className="block bg-[#111113] border border-zinc-800/40 rounded-lg p-5 hover:border-zinc-700/60 hover:bg-[#161618] transition-all group"
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
          {inProgress > 0 && (
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
        <span className="font-mono">{formatDate(config.createdAt)}</span>
      </div>
    </Link>
  )
}

export default function Dashboard({ data }: { data: HiveData }) {
  const teamList = Object.values(data.teams)

  if (data.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-600 animate-pulse text-sm">Loading...</div>
      </div>
    )
  }

  if (teamList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
        <Eye className="w-10 h-10 mb-4 text-zinc-800" />
        <p className="text-sm font-medium text-zinc-500">No active teams</p>
        <p className="text-xs mt-1">Teams will appear here when Claude Code agent teams are running.</p>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {teamList.map((team) => (
          <TeamCard key={team.config.name} team={team} />
        ))}
      </div>
    </div>
  )
}
