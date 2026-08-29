import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { clearLocalMirror } from './hooks/useProjectPersistence'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary
      onReset={() => {
        // A poisoned local mirror is the most common way to get stuck here.
        clearLocalMirror()
        window.location.reload()
      }}
    >
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
