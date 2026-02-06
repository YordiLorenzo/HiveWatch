const colorMap: Record<string, string> = {
  yellow: 'bg-yellow-400',
  blue: 'bg-blue-400',
  green: 'bg-green-400',
  pink: 'bg-pink-400',
  cyan: 'bg-cyan-400',
  orange: 'bg-orange-400',
  purple: 'bg-purple-400',
  red: 'bg-red-400',
  amber: 'bg-amber-400',
  emerald: 'bg-emerald-400',
}

const sizeMap: Record<string, string> = {
  sm: 'w-2 h-2',
  md: 'w-3 h-3',
  lg: 'w-4 h-4',
}

interface AgentDotProps {
  color: string
  size?: 'sm' | 'md' | 'lg'
}

export default function AgentDot({ color, size = 'md' }: AgentDotProps) {
  const bg = colorMap[color] ?? 'bg-zinc-400'
  const sz = sizeMap[size]

  return <span className={`inline-block rounded-full ${bg} ${sz}`} />
}
