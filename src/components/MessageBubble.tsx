import { useState } from 'react'
import { ArrowRight, Radio } from 'lucide-react'
import type { InboxMessage } from '../../shared/types'
import { normalizeMessage } from '../utils/format'
import Markdown from './Markdown'

function formatTime(timestamp: string): string {
  const d = new Date(timestamp)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function MessageBubble({ message, compact }: { message: InboxMessage; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const opacity = message.read ? 'opacity-50' : 'opacity-100'
  const time = formatTime(message.timestamp)
  const msg = normalizeMessage(message)

  // Idle notification
  if (msg.type === 'idle_notification') {
    return (
      <div className={`py-1 ${opacity}`}>
        <span className="text-[11px] text-zinc-600 font-mono">
          {time} {msg.from} idle
          {msg.idleReason ? ` — ${msg.idleReason}` : ''}
        </span>
      </div>
    )
  }

  // Task assignment
  if (msg.type === 'task_assignment') {
    return (
      <div className={`rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 ${opacity}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] text-blue-400 font-medium font-mono">task_assignment</span>
          <span className="text-[10px] text-zinc-600 font-mono">{time}</span>
        </div>
        <p className="text-xs text-blue-300">
          #{msg.taskId} {msg.subject}
        </p>
        {!compact && msg.description && (
          <p className="text-[11px] text-zinc-500 mt-1 line-clamp-2">{msg.description}</p>
        )}
        {msg.assignedBy && (
          <p className="text-[10px] text-zinc-600 mt-1 font-mono">by {msg.assignedBy}</p>
        )}
      </div>
    )
  }

  // Shutdown approved
  if (msg.type === 'shutdown_approved') {
    return (
      <div className={`py-1 ${opacity}`}>
        <span className="text-[11px] text-red-500/60 font-mono">
          {time} {msg.from} shutdown
        </span>
      </div>
    )
  }

  // Shutdown request
  if (msg.type === 'shutdown_request') {
    return (
      <div className={`rounded-lg border border-red-500/20 bg-red-500/5 p-3 ${opacity}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] text-red-400 font-medium font-mono">shutdown_request</span>
          <span className="text-[10px] text-zinc-600 font-mono">{time}</span>
        </div>
        <p className="text-xs text-red-300">{msg.text}</p>
      </div>
    )
  }

  // Shutdown response
  if (msg.type === 'shutdown_response') {
    return (
      <div className={`py-1 ${opacity}`}>
        <span className="text-[11px] text-zinc-500 font-mono">
          {time} {msg.from} shutdown response
        </span>
      </div>
    )
  }

  // Direct message (SendMessage type: "message")
  if (msg.type === 'message') {
    const hasLongContent = msg.content && msg.content.length > 200
    const showContent = expanded || !hasLongContent

    return (
      <div className={`rounded-lg border border-zinc-800/40 bg-[#111113] p-3 ${opacity}`}>
        <div className="flex items-center gap-2 mb-1.5">
          {msg.color && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: msg.color }}
            />
          )}
          <span className="text-xs font-medium text-zinc-300">{msg.from}</span>
          {msg.recipient && (
            <>
              <ArrowRight className="w-3 h-3 text-zinc-600" />
              <span className="text-xs font-medium text-zinc-400">{msg.recipient}</span>
            </>
          )}
          <span className="text-[10px] text-zinc-600 ml-auto font-mono">{time}</span>
        </div>
        {msg.summary && (
          <p className="text-[11px] text-zinc-500 font-mono mb-1.5">{msg.summary}</p>
        )}
        {msg.content ? (
          <>
            {showContent ? (
              <Markdown content={msg.content} />
            ) : (
              <>
                <Markdown content={msg.content.slice(0, 200) + '...'} />
                <button
                  onClick={() => setExpanded(true)}
                  className="text-[10px] text-amber-500 hover:text-amber-400 mt-1 font-mono"
                >
                  show more
                </button>
              </>
            )}
            {expanded && hasLongContent && (
              <button
                onClick={() => setExpanded(false)}
                className="text-[10px] text-amber-500 hover:text-amber-400 mt-1 font-mono"
              >
                show less
              </button>
            )}
          </>
        ) : (
          <Markdown content={msg.text} />
        )}
      </div>
    )
  }

  // Broadcast message
  if (msg.type === 'broadcast') {
    const hasLongContent = msg.content && msg.content.length > 200
    const showContent = expanded || !hasLongContent

    return (
      <div className={`rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 ${opacity}`}>
        <div className="flex items-center gap-2 mb-1.5">
          {msg.color && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: msg.color }}
            />
          )}
          <span className="text-xs font-medium text-zinc-300">{msg.from}</span>
          <Radio className="w-3 h-3 text-amber-500/60" />
          <span className="text-[10px] text-amber-500/60 font-mono">broadcast</span>
          <span className="text-[10px] text-zinc-600 ml-auto font-mono">{time}</span>
        </div>
        {msg.summary && (
          <p className="text-[11px] text-zinc-500 font-mono mb-1.5">{msg.summary}</p>
        )}
        {msg.content ? (
          <>
            {showContent ? (
              <Markdown content={msg.content} />
            ) : (
              <>
                <Markdown content={msg.content.slice(0, 200) + '...'} />
                <button
                  onClick={() => setExpanded(true)}
                  className="text-[10px] text-amber-500 hover:text-amber-400 mt-1 font-mono"
                >
                  show more
                </button>
              </>
            )}
            {expanded && hasLongContent && (
              <button
                onClick={() => setExpanded(false)}
                className="text-[10px] text-amber-500 hover:text-amber-400 mt-1 font-mono"
              >
                show less
              </button>
            )}
          </>
        ) : (
          <Markdown content={msg.text} />
        )}
      </div>
    )
  }

  // Plan approval request/response
  if (msg.type === 'plan_approval_request' || msg.type === 'plan_approval_response') {
    const label = msg.type === 'plan_approval_request' ? 'plan_approval' : 'plan_response'
    const borderColor = msg.type === 'plan_approval_request' ? 'border-purple-500/20' : 'border-emerald-500/20'
    const bgColor = msg.type === 'plan_approval_request' ? 'bg-purple-500/5' : 'bg-emerald-500/5'
    const labelColor = msg.type === 'plan_approval_request' ? 'text-purple-400' : 'text-emerald-400'

    return (
      <div className={`rounded-lg border ${borderColor} ${bgColor} p-3 ${opacity}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] ${labelColor} font-medium font-mono`}>{label}</span>
          <span className="text-[10px] text-zinc-600 font-mono">{time}</span>
        </div>
        <p className="text-xs text-zinc-300">{msg.from}</p>
        {msg.content ? (
          <Markdown content={compact && msg.content.length > 300 ? msg.content.slice(0, 300) + '...' : msg.content} />
        ) : msg.text ? (
          <Markdown content={compact && msg.text.length > 300 ? msg.text.slice(0, 300) + '...' : msg.text} />
        ) : null}
      </div>
    )
  }

  // Regular/fallback message
  const displayText = msg.summary || msg.text
  const truncatedText = compact && displayText.length > 300 ? displayText.slice(0, 300) + '...' : displayText

  return (
    <div className={`rounded-lg border border-zinc-800/40 bg-[#111113] p-3 ${opacity}`}>
      <div className="flex items-center gap-2 mb-1">
        {msg.color && (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: msg.color }}
          />
        )}
        <span className="text-xs font-medium text-zinc-300">{msg.from}</span>
        <span className="text-[10px] text-zinc-600 ml-auto font-mono">{time}</span>
      </div>
      <Markdown content={truncatedText} />
    </div>
  )
}
