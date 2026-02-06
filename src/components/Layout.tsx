import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'

interface LayoutProps {
  children: React.ReactNode
  connected?: boolean
}

export default function Layout({ children, connected }: LayoutProps) {
  return (
    <div className="min-h-screen bg-[#0a0a0b] text-zinc-100">
      <header className="border-b border-zinc-800/40 bg-[#111113]/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1440px] mx-auto px-5 h-12 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-zinc-100 hover:text-amber-400 transition-colors">
            <Eye className="w-5 h-5 text-amber-500" />
            <span className="text-sm font-semibold tracking-tight">HiveWatch</span>
          </Link>
          <div className="flex items-center gap-4 text-xs">
            <Link to="/" className="text-zinc-500 hover:text-zinc-200 transition-colors font-medium">
              Dashboard
            </Link>
            {connected !== undefined && (
              <div className="flex items-center gap-1.5 font-mono">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    connected ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'
                  }`}
                />
                <span className="text-zinc-600">
                  {connected ? 'live' : 'disconnected'}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-[1440px] mx-auto px-5 py-5">
        {children}
      </main>
    </div>
  )
}
