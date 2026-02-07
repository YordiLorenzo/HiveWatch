import { Clock, CheckCircle, Circle } from 'lucide-react'
import type { TeamOverview, Task, TeamMember } from '../../shared/types'
import { getMemberColor, filterRealTasks } from '../utils/format'

function TaskCard({ task, members }: { task: Task; members: TeamMember[] }) {
  const ownerColor = task.owner ? getMemberColor(task.owner, members) : undefined

  const statusStyles: Record<string, string> = {
    pending: 'bg-[#111113] border-zinc-800/40',
    in_progress: 'bg-amber-500/5 border-amber-500/20',
    completed: 'bg-emerald-500/5 border-emerald-500/20',
    blocked: 'bg-red-500/5 border-red-500/20',
  }

  return (
    <div className={`border rounded-lg p-3 ${statusStyles[task.status] || statusStyles.pending}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-zinc-600 font-mono">#{task.id}</span>
      </div>
      <p className="text-xs font-medium text-zinc-300 mb-2">{task.subject}</p>
      {task.status === 'in_progress' && task.activeForm && (
        <p className="text-[11px] text-amber-500/60 mb-2 italic font-mono">{task.activeForm}</p>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {task.owner ? (
            <>
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: ownerColor }}
              />
              <span className="text-[11px] text-zinc-500 font-mono">{task.owner}</span>
            </>
          ) : (
            <span className="text-[11px] text-zinc-700 font-mono">unassigned</span>
          )}
        </div>
        {task.blockedBy.length > 0 && (
          <div className="flex items-center gap-1">
            {task.blockedBy.map((id) => (
              <span
                key={id}
                className="text-[10px] bg-red-500/10 text-red-400/70 px-1.5 py-0.5 rounded font-mono"
              >
                blocked #{id}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function TaskBoard({ team }: { team: TeamOverview }) {
  const realTasks = filterRealTasks(team.tasks, team.config.members)

  const pending = realTasks.filter((t) => t.status === 'pending' || t.status === 'blocked')
  const inProgress = realTasks.filter((t) => t.status === 'in_progress')
  const completed = realTasks.filter((t) => t.status === 'completed')

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      <h2 className="text-[11px] font-semibold text-zinc-600 uppercase tracking-wider mb-3 flex items-center gap-1.5 flex-shrink-0">
        <CheckCircle className="w-3.5 h-3.5" />
        Tasks ({realTasks.length})
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1 overflow-y-auto min-h-0">
        <div>
          <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Circle className="w-2.5 h-2.5" />
            Pending ({pending.length})
          </h3>
          <div className="flex flex-col gap-2">
            {pending.length === 0 ? (
              <p className="text-[11px] text-zinc-700 text-center py-4">None</p>
            ) : (
              pending.map((task) => (
                <TaskCard key={task.id} task={task} members={team.config.members} />
              ))
            )}
          </div>
        </div>
        <div>
          <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Clock className="w-2.5 h-2.5 text-amber-500/70" />
            In Progress ({inProgress.length})
          </h3>
          <div className="flex flex-col gap-2">
            {inProgress.length === 0 ? (
              <p className="text-[11px] text-zinc-700 text-center py-4">None</p>
            ) : (
              inProgress.map((task) => (
                <TaskCard key={task.id} task={task} members={team.config.members} />
              ))
            )}
          </div>
        </div>
        <div>
          <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <CheckCircle className="w-2.5 h-2.5 text-emerald-500/70" />
            Done ({completed.length})
          </h3>
          <div className="flex flex-col gap-2">
            {completed.length === 0 ? (
              <p className="text-[11px] text-zinc-700 text-center py-4">None</p>
            ) : (
              completed.map((task) => (
                <TaskCard key={task.id} task={task} members={team.config.members} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
