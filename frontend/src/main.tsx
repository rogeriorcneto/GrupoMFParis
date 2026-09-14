import React from 'react'
import ReactDOM from 'react-dom/client'
import GrupoParisShell from './GrupoParisShell'
import ErrorBoundary from './components/ErrorBoundary'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <GrupoParisShell />
    </ErrorBoundary>
  </React.StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
