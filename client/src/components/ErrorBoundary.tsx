import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface Props {
  children: ReactNode
  /** Optional custom fallback. If omitted, the default fallback UI is shown. */
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

/**
 * ErrorBoundary catches uncaught JavaScript errors in its child component tree
 * and renders a fallback UI instead of crashing the whole page.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeComponent />
 *   </ErrorBoundary>
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? 'An unexpected error occurred.' }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <main className="mx-auto max-w-lg px-4 py-20 text-center">
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-6 py-10"
            data-testid="error-boundary-fallback"
          >
            <h2 className="mb-2 text-lg font-semibold text-red-800">Something went wrong</h2>
            <p className="mb-6 text-sm text-red-700">{this.state.message}</p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-400"
              >
                Try again
              </button>
              <Link
                to="/"
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400"
              >
                Back to decks
              </Link>
            </div>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
