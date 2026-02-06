import type { Task } from '../../shared/types'
import StatusBadge from './StatusBadge'

export default function TaskCard({ task }: { task: Task }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-zinc-500 text-sm font-mono shrink-0">#{task.id}</span>
          <h4 className="font-medium text-zinc-100 truncate">{task.subject}</h4>
        </div>
        <StatusBadge status={task.status} />
      </div>

      {task.owner && (
        <p className="text-xs text-zinc-400 mb-2">
          Owner: <span className="text-zinc-300">{task.owner}</span>
        </p>
      )}

      {task.blockedBy.length > 0 && (
        <p className="text-xs text-red-400 mb-2">
          Blocked by: {task.blockedBy.map((id) => `#${id}`).join(', ')}
        </p>
      )}

      {task.description && (
        <p className="text-sm text-zinc-400 line-clamp-3">{task.description}</p>
      )}
    </div>
  )
}
