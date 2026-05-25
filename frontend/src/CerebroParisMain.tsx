import React from 'react'
import ReactDOM from 'react-dom/client'
import CerebroParisApp from './CerebroParisApp'
import ErrorBoundary from './components/ErrorBoundary'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <CerebroParisApp modo="cerebro-paris" />
    </ErrorBoundary>
  </React.StrictMode>,
)
