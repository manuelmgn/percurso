import { Component, type ReactNode } from "react"

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] Uncaught render error:", error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6 space-y-3">
          <p className="text-muted-foreground">Ocorreu um erro ao carregar esta página.</p>
          <button
            className="text-sm text-primary hover:underline"
            onClick={() => this.setState({ error: null })}
          >
            Tentar novamente
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
