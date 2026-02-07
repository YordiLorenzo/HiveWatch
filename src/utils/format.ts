import type { InboxMessage, Task, TeamMember } from '../../shared/types'

/**
 * Unified relative time formatter.
 * Accepts ISO string or epoch ms. Shows seconds for <60s, minutes, hours, days,
 * then falls back to locale date for >7 days.
 */
export function relativeTime(timestamp: string | number): string {
  const t = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime()
  const diff = Date.now() - t
  const secs = Math.floor(diff / 1000)
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function getMemberColor(name: string, members: TeamMember[]): string {
  return members.find((m) => m.name === name)?.color || '#71717a'
}

export function filterRealTasks(tasks: Task[], members: TeamMember[]): Task[] {
  const memberNames = new Set(members.map((m) => m.name))
  return tasks.filter((t) => !memberNames.has(t.subject))
}

export function normalizeMessage(msg: InboxMessage): InboxMessage {
  if (!msg.type && msg.text) {
    try {
      const parsed = JSON.parse(msg.text)
      if (parsed && typeof parsed === 'object' && parsed.type) {
        return { ...msg, ...parsed }
      }
    } catch {
      // not JSON, keep as-is
    }
  }
  return msg
}
