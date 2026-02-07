import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, XCircle } from 'lucide-react'
import type { HiveData } from '../hooks/useHiveData'
import AgentsPanel from '../components/AgentCard'
import TaskBoard from '../components/TaskBoard'
import RightPanel from '../components/RightPanel'

export default function TeamDetail({ data }: { data: HiveData }) {
  const { name } = useParams<{ name: string }>()

  if (data.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-600 animate-pulse text-sm">Loading team...</div>
      </div>
    )
  }

  const liveTeam = name ? data.teams[name] : undefined
  const disbandedEntry = name ? data.disbandedTeams[name] : undefined
  const team = liveTeam || disbandedEntry?.overview
  const isDisbanded = !liveTeam && !!disbandedEntry

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

        {isDisbanded && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/40 border border-zinc-700/30 text-zinc-400 text-xs mb-3">
            <XCircle className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
            Team disbanded — showing last known state
          </div>
        )}

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
