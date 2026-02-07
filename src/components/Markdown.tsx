import ReactMarkdown from 'react-markdown'

const components = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-1.5 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-zinc-200">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-zinc-300">{children}</em>
  ),
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isBlock = className?.startsWith('language-')
    if (isBlock) {
      return (
        <code className="block bg-[#0a0a0b] border border-zinc-800/40 rounded px-2 py-1.5 my-1 font-mono text-[11px] text-zinc-400 whitespace-pre-wrap break-words overflow-x-auto">
          {children}
        </code>
      )
    }
    return (
      <code className="bg-zinc-800/60 text-amber-400/80 px-1 py-0.5 rounded text-[11px] font-mono">
        {children}
      </code>
    )
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="my-1">{children}</pre>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside ml-1 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside ml-1 space-y-0.5">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-zinc-400">{children}</li>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} className="text-amber-400 hover:text-amber-300 underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-sm font-semibold text-zinc-200 mb-1">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-xs font-semibold text-zinc-200 mb-1">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-xs font-semibold text-zinc-300 mb-0.5">{children}</h3>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-zinc-700 pl-2 text-zinc-500 italic">{children}</blockquote>
  ),
  hr: () => <hr className="border-zinc-800/40 my-2" />,
}

export default function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={`text-xs text-zinc-400 leading-relaxed break-words ${className || ''}`}>
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  )
}
