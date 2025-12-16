import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Error Boundary pour capturer les erreurs React et WebGL
 * Affiche un message d'erreur au lieu de crasher l'application
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log en dev seulement
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary] Caught error:', error)
      console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack)
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-gray-900 p-8 text-white">
          <div className="max-w-md text-center">
            <h1 className="mb-4 text-2xl font-bold text-red-400">
              Oups ! Une erreur est survenue
            </h1>
            <p className="mb-6 text-gray-300">
              Le jeu a rencontré un problème. Cela peut arriver si WebGL n'est pas supporté ou si la mémoire est insuffisante.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <pre className="mb-6 overflow-auto rounded bg-gray-800 p-4 text-left text-xs text-red-300">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleRetry}
              className="rounded-lg bg-blue-600 px-6 py-3 font-semibold transition-colors hover:bg-blue-500"
            >
              Réessayer
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
