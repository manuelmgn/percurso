import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback: (reload: () => void) => ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

/** Catches render errors (e.g. a failed lazy chunk) so the whole app does
 * not unmount; offers a page reload as recovery. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  reload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) return this.props.fallback(this.reload)
    return this.props.children
  }
}
