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
import { relativeTime, getMemberColor } from '../utils/format'
import Markdown from './Markdown'

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

interface FlatEntry {
  agent: string
  activity: AgentActivity
}

function shortenPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+\//, '~/')
}

function JsonValue({ value }: { value: unknown }) {
  if (value === null) return <span className="text-zinc-600">null</span>
  if (typeof value === 'boolean') return <span className="text-amber-400">{String(value)}</span>
  if (typeof value === 'number') return <span className="text-cyan-400">{value}</span>
  if (typeof value === 'string') {
    if (value.length > 300) {
      return <span className="text-green-400/80">"{value.slice(0, 297)}..."</span>
    }
    return <span className="text-green-400/80">"{value}"</span>
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-zinc-600">[]</span>
    return (
      <span>
        <span className="text-zinc-600">[</span>
        {value.map((v, i) => (
          <span key={i}>
            {i > 0 && <span className="text-zinc-700">, </span>}
            <JsonValue value={v} />
          </span>
        ))}
        <span className="text-zinc-600">]</span>
      </span>
    )
  }
  if (typeof value === 'object') {
    return <span className="text-zinc-600">{JSON.stringify(value)}</span>
  }
  return <span className="text-zinc-500">{String(value)}</span>
}

function ToolInputDetail({ toolName, input }: { toolName: string; input: Record<string, unknown> }) {
  const s = (key: string) => String(input[key] ?? '')
  const has = (key: string) => input[key] != null

  // Tool-specific renderers
  if (toolName === 'Edit' && input.file_path) {
    return (
      <div className="space-y-1.5">
        <div className="text-[11px]">
          <span className="text-zinc-600">file: </span>
          <span className="text-amber-400/80 font-mono">{shortenPath(s('file_path'))}</span>
        </div>
        {input.old_string != null && (
          <div>
            <div className="text-[10px] text-red-400/60 mb-0.5">- old</div>
            <pre className="text-[11px] text-red-400/50 bg-red-950/20 rounded px-2 py-1 whitespace-pre-wrap break-words font-mono">{s('old_string')}</pre>
          </div>
        )}
        {input.new_string != null && (
          <div>
            <div className="text-[10px] text-green-400/60 mb-0.5">+ new</div>
            <pre className="text-[11px] text-green-400/50 bg-green-950/20 rounded px-2 py-1 whitespace-pre-wrap break-words font-mono">{s('new_string')}</pre>
          </div>
        )}
        {has('replace_all') && (
          <div className="text-[10px] text-zinc-500">replace_all: <span className="text-amber-400">true</span></div>
        )}
      </div>
    )
  }

  if (toolName === 'Bash' && input.command) {
    return (
      <div className="space-y-1">
        <pre className="text-[11px] text-blue-300/80 bg-blue-950/20 rounded px-2 py-1.5 whitespace-pre-wrap break-words font-mono">{s('command')}</pre>
        {has('description') && (
          <div className="text-[10px] text-zinc-500 italic">{s('description')}</div>
        )}
        {has('timeout') && (
          <div className="text-[10px] text-zinc-600">timeout: <span className="text-cyan-400">{s('timeout')}ms</span></div>
        )}
      </div>
    )
  }

  if ((toolName === 'Read' || toolName === 'Write') && input.file_path) {
    return (
      <div className="space-y-1">
        <div className="text-[11px]">
          <span className="text-zinc-600">file: </span>
          <span className="text-amber-400/80 font-mono">{shortenPath(s('file_path'))}</span>
        </div>
        {has('offset') && <div className="text-[10px] text-zinc-600">offset: <span className="text-cyan-400">{s('offset')}</span></div>}
        {has('limit') && <div className="text-[10px] text-zinc-600">limit: <span className="text-cyan-400">{s('limit')}</span></div>}
        {has('content') && (
          <pre className="text-[11px] text-green-400/50 bg-green-950/20 rounded px-2 py-1 whitespace-pre-wrap break-words font-mono max-h-32 overflow-y-auto">
            {s('content').length > 500 ? s('content').slice(0, 497) + '...' : s('content')}
          </pre>
        )}
      </div>
    )
  }

  if (toolName === 'Grep' && input.pattern) {
    return (
      <div className="space-y-1">
        <div className="text-[11px]">
          <span className="text-zinc-600">pattern: </span>
          <span className="text-purple-400/80 font-mono">/{s('pattern')}/</span>
        </div>
        {has('path') && <div className="text-[11px]"><span className="text-zinc-600">path: </span><span className="text-amber-400/80 font-mono">{shortenPath(s('path'))}</span></div>}
        {has('glob') && <div className="text-[11px]"><span className="text-zinc-600">glob: </span><span className="text-zinc-400 font-mono">{s('glob')}</span></div>}
      </div>
    )
  }

  if (toolName === 'Glob' && input.pattern) {
    return (
      <div className="text-[11px]">
        <span className="text-zinc-600">pattern: </span>
        <span className="text-purple-400/80 font-mono">{s('pattern')}</span>
        {has('path') && <><br /><span className="text-zinc-600">path: </span><span className="text-amber-400/80 font-mono">{shortenPath(s('path'))}</span></>}
      </div>
    )
  }

  if (toolName === 'Task' && input.prompt) {
    return (
      <div className="space-y-1">
        {has('description') && <div className="text-[11px] text-zinc-400">{s('description')}</div>}
        <pre className="text-[11px] text-zinc-400/80 bg-zinc-900/50 rounded px-2 py-1.5 whitespace-pre-wrap break-words font-mono max-h-32 overflow-y-auto">
          {s('prompt').length > 500 ? s('prompt').slice(0, 497) + '...' : s('prompt')}
        </pre>
        {has('subagent_type') && <div className="text-[10px] text-zinc-600">type: <span className="text-cyan-400">{s('subagent_type')}</span></div>}
      </div>
    )
  }

  // Generic fallback: render as key-value pairs with syntax highlighting
  const entries = Object.entries(input)
  return (
    <div className="space-y-0.5">
      {entries.map(([key, value]) => (
        <div key={key} className="text-[11px] font-mono">
          <span className="text-zinc-500">{key}: </span>
          <JsonValue value={value} />
        </div>
      ))}
    </div>
  )
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
  const hasDetail = isReasoning
    ? !!(activity.text && activity.text.length > 0)
    : activity.toolInput && Object.keys(activity.toolInput).length > 0
  const displayText = isReasoning
    ? (activity.text || 'Reasoning')
    : (activity.summary || activity.text || '')

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
          <button
            onClick={() => hasDetail && setExpanded(!expanded)}
            className={`flex items-start gap-1.5 flex-1 min-w-0 text-left ${hasDetail ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <span className={`inline-flex items-center gap-1 text-xs bg-zinc-800/60 px-1.5 py-0.5 rounded flex-shrink-0 ${config.color}`}>
              <Icon className="w-3 h-3" />
              Thinking
            </span>
            {!expanded && (
              <span className="text-xs text-zinc-500 italic truncate flex-1">
                {displayText.length > 80 ? displayText.slice(0, 77) + '...' : displayText}
              </span>
            )}
            {hasDetail && (
              <span className="flex-shrink-0 text-zinc-600">
                {expanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </span>
            )}
          </button>
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
      {expanded && isReasoning && activity.text && (
        <div className="ml-3.5 mt-1 bg-[#0a0a0b] border border-zinc-800/40 rounded p-2 max-h-80 overflow-y-auto">
          <Markdown content={activity.text} className="text-xs text-zinc-400" />
        </div>
      )}
      {expanded && !isReasoning && activity.toolInput && (
        <div className="ml-3.5 mt-1 bg-[#0a0a0b] border border-zinc-800/40 rounded p-2 max-h-60 overflow-y-auto">
          <ToolInputDetail toolName={toolName} input={activity.toolInput} />
        </div>
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
