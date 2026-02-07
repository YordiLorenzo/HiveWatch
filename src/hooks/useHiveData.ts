import { useState, useEffect, useRef, useCallback } from 'react'
import type { TeamOverview, StatsCache, WsEvent, AgentActivity, SoloSession } from '../../shared/types'

export interface HiveData {
  teams: Record<string, TeamOverview>
  disbandedTeams: Record<string, { overview: TeamOverview; disbandedAt: string }>
  sessions: SoloSession[]
  endedSessions: SoloSession[]
  stats: StatsCache | null
  activities: Record<string, Record<string, AgentActivity[]>>
  loading: boolean
  connected: boolean
}

export function useHiveData(): HiveData {
  const [teams, setTeams] = useState<Record<string, TeamOverview>>({})
  const [disbandedTeams, setDisbandedTeams] = useState<
    Record<string, { overview: TeamOverview; disbandedAt: string }>
  >({})
  const [sessions, setSessions] = useState<SoloSession[]>([])
  const [endedSessions, setEndedSessions] = useState<SoloSession[]>([])
  const [stats, setStats] = useState<StatsCache | null>(null)
  const [activities, setActivities] = useState<Record<string, Record<string, AgentActivity[]>>>({})
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
    }

    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
      reconnectTimer.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onmessage = (event) => {
      const msg: WsEvent = JSON.parse(event.data)

      switch (msg.type) {
        case 'initial_state': {
          const {
            teams: teamList,
            stats: statsData,
            activities: activityData,
            disbandedTeams: disbandedData,
            sessions: sessionsData,
            endedSessions: endedSessionsData,
          } = msg.data as {
            teams: TeamOverview[]
            stats: StatsCache | null
            activities?: Record<string, Record<string, AgentActivity[]>>
            disbandedTeams?: Record<string, { overview: TeamOverview; disbandedAt: string }>
            sessions?: SoloSession[]
            endedSessions?: SoloSession[]
          }
          const teamsMap: Record<string, TeamOverview> = {}
          for (const t of teamList) {
            teamsMap[t.config.name] = t
          }
          setTeams(teamsMap)
          setStats(statsData)
          if (activityData) setActivities(activityData)
          if (disbandedData) setDisbandedTeams(disbandedData)
          if (sessionsData) setSessions(sessionsData)
          if (endedSessionsData) setEndedSessions(endedSessionsData)
          setLoading(false)
          break
        }
        case 'team_updated': {
          const teamData = msg.data as TeamOverview
          setTeams((prev) => ({ ...prev, [msg.team!]: teamData }))
          // If this team was in disbanded, remove it (it's back)
          setDisbandedTeams((prev) => {
            if (!prev[msg.team!]) return prev
            const next = { ...prev }
            delete next[msg.team!]
            return next
          })
          break
        }
        case 'task_updated': {
          const tasks = msg.data as TeamOverview['tasks']
          setTeams((prev) => {
            const existing = prev[msg.team!]
            if (!existing) return prev
            return { ...prev, [msg.team!]: { ...existing, tasks } }
          })
          break
        }
        case 'inbox_updated': {
          const inboxes = msg.data as TeamOverview['inboxes']
          setTeams((prev) => {
            const existing = prev[msg.team!]
            if (!existing) return prev
            return { ...prev, [msg.team!]: { ...existing, inboxes } }
          })
          break
        }
        case 'activity_updated': {
          const activityData = msg.data as Record<string, AgentActivity[]>
          setActivities((prev) => ({ ...prev, [msg.team!]: activityData }))
          break
        }
        case 'session_updated': {
          const sessionsData = msg.data as SoloSession[]
          setSessions(sessionsData)
          // If a previously ended session reappears, remove it from endedSessions
          const activeIds = new Set(sessionsData.map((s) => s.sessionId))
          setEndedSessions((prev) => {
            const filtered = prev.filter((s) => !activeIds.has(s.sessionId))
            return filtered.length === prev.length ? prev : filtered
          })
          break
        }
        case 'session_ended': {
          const endedSession = msg.data as SoloSession
          setEndedSessions((prev) => {
            // Avoid duplicates
            if (prev.some((s) => s.sessionId === endedSession.sessionId)) return prev
            return [endedSession, ...prev]
          })
          break
        }
        case 'team_disbanded': {
          const { overview, disbandedAt, activity } = msg.data as {
            overview: TeamOverview
            disbandedAt: string
            activity?: Record<string, AgentActivity[]>
          }
          // Move from live to disbanded
          setTeams((prev) => {
            if (!prev[msg.team!]) return prev
            const next = { ...prev }
            delete next[msg.team!]
            return next
          })
          setDisbandedTeams((prev) => ({
            ...prev,
            [msg.team!]: { overview, disbandedAt },
          }))
          // Preserve activity snapshot
          if (activity) {
            setActivities((prev) => ({ ...prev, [msg.team!]: activity }))
          }
          break
        }
      }
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  return { teams, disbandedTeams, sessions, endedSessions, stats, activities, loading, connected }
}
