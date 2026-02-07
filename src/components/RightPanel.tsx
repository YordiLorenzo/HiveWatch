import { useState } from 'react'
import { MessageSquare, Activity } from 'lucide-react'
import type { HiveData } from '../hooks/useHiveData'
import type { TeamOverview, InboxMessage } from '../../shared/types'
import { normalizeMessage } from '../utils/format'
import MessageBubble from './MessageBubble'
import ActivityFeed from './ActivityFeed'

function getAllMessages(team: TeamOverview): (InboxMessage & { _recipient: string })[] {
  const all: (InboxMessage & { _recipient: string })[] = []
  for (const [recipient, messages] of Object.entries(team.inboxes)) {
    for (const rawMsg of messages) {
      const msg = normalizeMessage(rawMsg)
      if (msg.type === 'idle_notification') continue
      if (msg.type === 'shutdown_approved') continue
      all.push({ ...msg, _recipient: recipient })
    }
  }
  return all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export default function RightPanel({ team, data, teamName }: { team: TeamOverview; data: HiveData; teamName: string }) {
  const [tab, setTab] = useState<'activity' | 'messages'>('activity')
  const messages = getAllMessages(team)
  const activities = data.activities[teamName] || {}

  return (
    <div className="w-full lg:w-[400px] flex-shrink-0 flex flex-col min-h-0">
      <div className="flex items-center gap-1 mb-3 flex-shrink-0">
        <button
          onClick={() => setTab('activity')}
          className={`text-[11px] px-2 py-1 rounded font-medium transition-colors ${
            tab === 'activity'
              ? 'bg-amber-500/15 text-amber-400'
              : 'text-zinc-600 hover:text-zinc-400'
          }`}
        >
          <Activity className="w-3 h-3 inline mr-1" />
          Activity
        </button>
        <button
          onClick={() => setTab('messages')}
          className={`text-[11px] px-2 py-1 rounded font-medium transition-colors ${
            tab === 'messages'
              ? 'bg-amber-500/15 text-amber-400'
              : 'text-zinc-600 hover:text-zinc-400'
          }`}
        >
          <MessageSquare className="w-3 h-3 inline mr-1" />
          Messages ({messages.length})
        </button>
      </div>

      {tab === 'activity' ? (
        <div className="flex-1 overflow-y-auto min-h-0">
          <ActivityFeed activities={activities} members={team.config.members} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
          {messages.length === 0 ? (
            <p className="text-[11px] text-zinc-700 text-center py-4">No messages yet</p>
          ) : (
            messages.map((msg, i) => (
              <MessageBubble key={`${msg.timestamp}-${i}`} message={msg} />
            ))
          )}
        </div>
      )}
    </div>
  )
}
