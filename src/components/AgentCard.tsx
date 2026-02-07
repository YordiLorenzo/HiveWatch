import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import type { TeamOverview, Task, InboxMessage, TeamMember } from '../../shared/types'

function getAgentStatus(agentName: string, inboxes: Record<string, InboxMessage[]>): 'idle' | 'active' {
  const messages = inboxes[agentName]
  if (!messages || messages.length === 0) return 'active'
  const last = messages[messages.length - 1]
  return last.type === 'idle_notification' ? 'idle' : 'active'
}

function getAgentCurrentTask(agentName: string, tasks: Task[]): Task | undefined {
  return tasks.find((t) => t.owner === agentName && t.status === 'in_progress')
}

function AgentCard({
  member,
  status,
  currentTask,
  teamName,
}: {
  member: TeamMember
  status: 'idle' | 'active'
  currentTask?: Task
  teamName: string
}) {
  return (
    <Link
      to={`/agent/${teamName}/${member.name}`}
      className="block bg-[#111113] border border-zinc-800/40 rounded-lg p-3 hover:border-zinc-700/60 hover:bg-[#161618] transition-all"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: member.color }}
        />
        <span className="font-medium text-xs text-zinc-200 truncate">{member.name}</span>
      </div>
      <p className="text-[10px] text-zinc-600 font-mono mb-1.5">{member.model}</p>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] bg-zinc-800/60 text-zinc-500 px-1.5 py-0.5 rounded font-mono">
          {member.agentType}
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
            status === 'idle'
              ? 'bg-zinc-800/60 text-zinc-600'
              : 'bg-emerald-500/10 text-emerald-400'
          }`}
        >
          {status}
        </span>
      </div>
      {currentTask && (
        <p className="text-[11px] text-amber-500/70 truncate mt-1 font-mono">
          {currentTask.activeForm || currentTask.subject}
        </p>
      )}
    </Link>
  )
}

export default function AgentsPanel({ team, teamName }: { team: TeamOverview; teamName: string }) {
  return (
    <div className="w-full lg:w-[220px] flex-shrink-0 flex flex-col min-h-0">
      <h2 className="text-[11px] font-semibold text-zinc-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" />
        Agents ({team.config.members.length})
      </h2>
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto min-h-0">
        {team.config.members.map((member) => (
          <AgentCard
            key={member.agentId}
            member={member}
            status={getAgentStatus(member.name, team.inboxes)}
            currentTask={getAgentCurrentTask(member.name, team.tasks)}
            teamName={teamName}
          />
        ))}
      </div>
    </div>
  )
}
