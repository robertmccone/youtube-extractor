import { Youtube } from 'lucide-react'
import { VERSION, TITLE } from '@/config'

export function Header() {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border">
      <div className="flex items-center gap-2">
        <Youtube className="w-6 h-6 text-red-500" />
        <h1 className="text-lg font-semibold">{TITLE}</h1>
      </div>
      <span className="text-sm text-muted-foreground">v{VERSION}</span>
    </header>
  )
}
