import type { InboxMessage } from '../../shared/types'

function formatTime(timestamp: string): string {
  const d = new Date(timestamp)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function MessageBubble({ message, compact }: { message: InboxMessage; compact?: boolean }) {
  const opacity = message.read ? 'opacity-50' : 'opacity-100'
  const time = formatTime(message.timestamp)

  // Normalize: if text is JSON with a type field, merge it into the message
  let msg = message
  if (!message.type && message.text) {
    try {
      const parsed = JSON.parse(message.text)
      if (parsed && typeof parsed === 'object' && parsed.type) {
        msg = { ...message, ...parsed }
      }
    } catch {
      // not JSON
    }
  }

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

  // Regular message
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
      <p className="text-xs text-zinc-400 whitespace-pre-wrap break-words leading-relaxed">
        {truncatedText}
      </p>
    </div>
  )
}
