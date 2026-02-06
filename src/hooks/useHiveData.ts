import { useState, useEffect, useRef, useCallback } from 'react'
import type { TeamOverview, StatsCache, WsEvent, AgentActivity } from '../../shared/types'

export interface HiveData {
  teams: Record<string, TeamOverview>
  stats: StatsCache | null
  activities: Record<string, Record<string, AgentActivity[]>>
  loading: boolean
  connected: boolean
}

export function useHiveData(): HiveData {
  const [teams, setTeams] = useState<Record<string, TeamOverview>>({})
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
          const { teams: teamList, stats: statsData } = msg.data as {
            teams: TeamOverview[]
            stats: StatsCache | null
          }
          const teamsMap: Record<string, TeamOverview> = {}
          for (const t of teamList) {
            teamsMap[t.config.name] = t
          }
          setTeams(teamsMap)
          setStats(statsData)
          setLoading(false)
          break
        }
        case 'team_updated': {
          const teamData = msg.data as TeamOverview
          setTeams((prev) => ({ ...prev, [msg.team!]: teamData }))
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

  return { teams, stats, activities, loading, connected }
}
