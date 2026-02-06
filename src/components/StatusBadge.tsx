const statusColors: Record<string, string> = {
  pending: 'bg-zinc-800/60 text-zinc-500',
  in_progress: 'bg-amber-500/10 text-amber-400',
  completed: 'bg-emerald-500/10 text-emerald-400',
  blocked: 'bg-red-500/10 text-red-400',
}

const statusLabels: Record<string, string> = {
  pending: 'pending',
  in_progress: 'in_progress',
  completed: 'completed',
  blocked: 'blocked',
}

export default function StatusBadge({ status }: { status: string }) {
  const colors = statusColors[status] ?? 'bg-zinc-800/60 text-zinc-500'
  const label = statusLabels[status] ?? status

  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-mono ${colors}`}
    >
      {label}
    </span>
  )
}
