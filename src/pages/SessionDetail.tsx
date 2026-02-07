import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  GitBranch,
  MessageSquare,
  Clock,
  Activity,
  ChevronDown,
  ChevronRight,
  Layers,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
import type { HiveData } from '../hooks/useHiveData'
import type { AgentActivity, SoloSession, TeamMember } from '../../shared/types'
import ActivityFeed from '../components/ActivityFeed'
import { relativeTime } from '../utils/format'

// Generate consistent colors for session agents
const SESSION_COLORS = [
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f43f5e', // rose
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#ec4899', // pink
] as const

function buildSessionMembers(
  agentNames: string[],
): TeamMember[] {
  return agentNames.map((name, i) => ({
    agentId: name,
    name,
    agentType: 'session',
    model: '',
    color: SESSION_COLORS[i % SESSION_COLORS.length],
    joinedAt: 0,
    tmuxPaneId: '',
    cwd: '',
    subscriptions: [],
  }))
}

interface SessionActivityData {
  lead: AgentActivity[]
  subagents: Record<string, AgentActivity[]>
}

export default function SessionDetail({ data }: { data: HiveData }) {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [activity, setActivity] = useState<SessionActivityData | null>(null)
  const [loadingActivity, setLoadingActivity] = useState(true)
  const [error, setError] = useState(false)
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set(['lead']))

  // Cache session data so it survives when session falls out of active window
  const cachedSessionRef = useRef<SoloSession | null>(null)
  const liveSession = data.sessions.find((s) => s.sessionId === sessionId)
  const endedSession = data.endedSessions.find((s) => s.sessionId === sessionId)
  const isEnded = !liveSession && (!!endedSession || cachedSessionRef.current !== null)

  if (liveSession) cachedSessionRef.current = liveSession

  const session = liveSession || endedSession || cachedSessionRef.current

  const fetchActivity = useCallback(async () => {
    if (!sessionId) return
    try {
      const res = await fetch(`/api/sessions/${sessionId}/activity`)
      if (res.ok) {
        const data = await res.json()
        setActivity(data)
        setError(false)
      }
    } catch {
      setError(true)
    } finally {
      setLoadingActivity(false)
    }
  }, [sessionId])

  // Fetch activity on mount and poll every 3s
  useEffect(() => {
    fetchActivity()
    const interval = setInterval(fetchActivity, 3000)
    return () => clearInterval(interval)
  }, [fetchActivity])

  if (data.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-600 animate-pulse text-sm">Loading session...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm font-medium text-zinc-500">Session not found</p>
        <p className="text-xs text-zinc-600 mt-1 font-mono">{sessionId}</p>
        <Link to="/" className="text-xs text-amber-500 hover:text-amber-400 mt-3">
          Back to dashboard
        </Link>
      </div>
    )
  }

  const toggleAgent = (name: string) => {
    setExpandedAgents((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // Build member list for color assignment
  const subagentNames = activity ? Object.keys(activity.subagents) : []
  const allAgentNames = ['lead', ...subagentNames]
  const members = buildSessionMembers(allAgentNames)

  return (
    <div className="space-y-5">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Dashboard
      </Link>

      {isEnded && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/40 border border-zinc-700/30 text-zinc-400 text-xs">
          <XCircle className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
          Session ended — showing last known state
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-xl font-semibold text-zinc-200">{session.projectName}</h1>
          {session.gitBranch && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 bg-zinc-800/60 px-1.5 py-0.5 rounded">
              <GitBranch className="w-3 h-3" />
              {session.gitBranch}
            </span>
          )}
        </div>

        <p className="text-xs text-zinc-400 mb-3 leading-relaxed max-w-3xl">
          {session.firstPrompt.length > 200
            ? session.firstPrompt.slice(0, 197) + '...'
            : session.firstPrompt}
        </p>

        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-zinc-600">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {relativeTime(session.created)}
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            {session.messageCount} messages
          </span>
          <span className="flex items-center gap-1">
            <Layers className="w-3 h-3" />
            {session.subagents.length} subagent{session.subagents.length !== 1 ? 's' : ''}
          </span>
          <span className="text-zinc-700 select-all">{session.sessionId.slice(0, 8)}</span>
        </div>
      </div>

      {/* Activity sections */}
      {loadingActivity ? (
        <div className="text-zinc-600 animate-pulse text-xs py-8 text-center">
          Loading activity...
        </div>
      ) : error && !activity ? (
        <div className="flex items-center justify-center gap-2 text-zinc-500 text-xs py-8">
          <AlertTriangle className="w-3.5 h-3.5" />
          Failed to load activity. Retrying...
        </div>
      ) : !activity ? (
        <div className="text-zinc-600 text-xs py-8 text-center">
          No activity data available
        </div>
      ) : (
        <div className="space-y-4">
          {/* Lead agent */}
          <div className="border border-zinc-800/40 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleAgent('lead')}
              className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-[#161618] transition-colors"
            >
              {expandedAgents.has('lead') ? (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
              )}
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: SESSION_COLORS[0] }}
              />
              <span className="text-sm font-medium text-zinc-300">Lead Session</span>
              <span className="text-[10px] font-mono text-zinc-600 ml-auto">
                {activity.lead.length} events
              </span>
            </button>
            {expandedAgents.has('lead') && (
              <div className="px-4 pb-3">
                <ActivityFeed
                  activities={{ lead: activity.lead }}
                  members={members}
                  maxItems={30}
                  singleAgent="lead"
                />
              </div>
            )}
          </div>

          {/* Subagents */}
          {subagentNames.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-zinc-600" />
                <h2 className="text-sm font-semibold text-zinc-300">
                  Subagents ({subagentNames.length})
                </h2>
              </div>

              <div className="space-y-2">
                {subagentNames.map((name, idx) => {
                  const color = SESSION_COLORS[(idx + 1) % SESSION_COLORS.length]
                  const agentActivities = activity.subagents[name] || []
                  const isExpanded = expandedAgents.has(name)

                  return (
                    <div
                      key={name}
                      className="border border-zinc-800/40 rounded-lg overflow-hidden"
                    >
                      <button
                        onClick={() => toggleAgent(name)}
                        className="w-full flex items-center gap-2 px-4 py-2 hover:bg-[#161618] transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                        )}
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-xs font-medium text-zinc-400 font-mono">
                          {name}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-600 ml-auto">
                          {agentActivities.length} events
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-3">
                          <ActivityFeed
                            activities={{ [name]: agentActivities }}
                            members={members}
                            maxItems={20}
                            singleAgent={name}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
