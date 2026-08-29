import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  onReset?: () => void
}

interface State {
  error: Error | null
}

/**
 * IMP-02: without this, any render-time throw left a white window with no
 * diagnostic. Three of the audited defects failed exactly that way.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('FeatureBuilder recovered from a render error:', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="crash-screen" role="alert">
        <div className="crash-card">
          <h1>FeatureBuilder hit an unexpected problem</h1>
          <p>Your work is still on disk. Reloading the last saved state usually clears this.</p>
          <pre>{error.message}</pre>
          <div className="crash-actions">
            <button className="primary-button" type="button" onClick={this.handleReset}>
              Reload last saved project
            </button>
            <button type="button" onClick={() => window.location.reload()}>
              Restart the window
            </button>
          </div>
        </div>
      </div>
    )
  }
}
