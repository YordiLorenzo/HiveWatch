import { useState, useMemo } from 'react'
import {
  FileText,
  Pencil,
  FilePlus,
  Terminal,
  Search,
  FolderSearch,
  Users,
  Zap,
  Brain,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import type { AgentActivity, TeamMember } from '../../shared/types'

function relativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  return `${hours}h ago`
}

const toolConfig: Record<string, { icon: typeof FileText; color: string }> = {
  Read: { icon: FileText, color: 'text-zinc-400' },
  Edit: { icon: Pencil, color: 'text-amber-400' },
  Write: { icon: FilePlus, color: 'text-green-400' },
  Bash: { icon: Terminal, color: 'text-blue-400' },
  Grep: { icon: Search, color: 'text-purple-400' },
  Glob: { icon: FolderSearch, color: 'text-purple-400' },
  Task: { icon: Users, color: 'text-cyan-400' },
}

const defaultToolConfig = { icon: Zap, color: 'text-zinc-400' }

function getMemberColor(name: string, members: TeamMember[]): string {
  return members.find((m) => m.name === name)?.color || '#71717a'
}

interface FlatEntry {
  agent: string
  activity: AgentActivity
}

function formatToolInput(input: Record<string, unknown>): string {
  return JSON.stringify(input, null, 2)
}

function ActivityEntry({
  agent,
  activity,
  agentColor,
}: {
  agent: string
  activity: AgentActivity
  agentColor: string
}) {
  const [expanded, setExpanded] = useState(false)
  const isReasoning = activity.type === 'reasoning'
  const toolName = activity.toolName || ''
  const config = isReasoning
    ? { icon: Brain, color: 'text-zinc-500' }
    : toolConfig[toolName] || defaultToolConfig
  const Icon = config.icon
  const displayText = activity.summary || activity.text || ''
  const hasDetail = activity.toolInput && Object.keys(activity.toolInput).length > 0

  return (
    <div
      className="border-l-2 pl-3 py-1.5"
      style={{ borderColor: agentColor }}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: agentColor }}
        />
        <span className="text-xs font-medium text-zinc-300">{agent}</span>
        <span className="text-xs text-zinc-600">&middot;</span>
        <span className="text-xs text-zinc-500">{relativeTime(activity.timestamp)}</span>
      </div>
      <div className="flex items-start gap-1.5 ml-3.5">
        {isReasoning ? (
          <p className="text-sm text-zinc-400 italic">{displayText}</p>
        ) : (
          <>
            <span className={`inline-flex items-center gap-1 text-xs bg-zinc-800 px-1.5 py-0.5 rounded flex-shrink-0 ${config.color}`}>
              <Icon className="w-3 h-3" />
              {toolName}
            </span>
            <span className="text-sm text-zinc-300 truncate">{displayText}</span>
            {hasDetail && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex-shrink-0 text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                {expanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </>
        )}
      </div>
      {expanded && activity.toolInput && (
        <pre className="ml-3.5 mt-1 text-[11px] text-zinc-500 bg-[#0a0a0b] border border-zinc-800/40 rounded p-2 font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
          {formatToolInput(activity.toolInput)}
        </pre>
      )}
    </div>
  )
}

interface ActivityFeedProps {
  activities: Record<string, AgentActivity[]>
  members: TeamMember[]
  maxItems?: number
  singleAgent?: string
}

export default function ActivityFeed({
  activities,
  members,
  maxItems = 50,
  singleAgent,
}: ActivityFeedProps) {
  const entries = useMemo(() => {
    const flat: FlatEntry[] = []
    for (const [agent, items] of Object.entries(activities)) {
      if (singleAgent && agent !== singleAgent) continue
      for (const activity of items) {
        flat.push({ agent, activity })
      }
    }
    flat.sort(
      (a, b) =>
        new Date(b.activity.timestamp).getTime() - new Date(a.activity.timestamp).getTime()
    )
    return flat.slice(0, maxItems)
  }, [activities, maxItems, singleAgent])

  if (entries.length === 0) {
    return <p className="text-xs text-zinc-600 text-center py-4">No activity yet</p>
  }

  return (
    <div className="overflow-y-auto space-y-1 pr-1 max-h-[calc(100vh-16rem)]">
      {entries.map((entry, i) => (
        <ActivityEntry
          key={`${entry.agent}-${entry.activity.timestamp}-${i}`}
          agent={entry.agent}
          activity={entry.activity}
          agentColor={getMemberColor(entry.agent, members)}
        />
      ))}
    </div>
  )
}
