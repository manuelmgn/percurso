import { Link } from "react-router-dom"
import { useAuthStore } from "@/stores/auth"

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore()

  return (
    <div className="min-h-screen bg-background">
      {token && (
        <header className="glass border-b border-border/50 px-4 h-12 flex items-center justify-between sticky top-0 z-30">
          <Link to="/mapa" className="text-lg font-bold gradient-text tracking-tight">
            Percurso
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/viagens" className="hover:text-foreground transition-colors">Viagens</Link>
            <Link to="/projetos" className="hover:text-foreground transition-colors">Projetos</Link>
            <Link to="/mapa" className="hover:text-foreground transition-colors">Mapa</Link>
          </nav>
        </header>
      )}
      <main>{children}</main>
    </div>
  )
}
