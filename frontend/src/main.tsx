import React from 'react'
import ReactDOM from 'react-dom/client'
import GrupoParisShell from './GrupoParisShell'
import AcademiaCandidatoView from './components/AcademiaCandidatoView'
import ErrorBoundary from './components/ErrorBoundary'
import './styles/globals.css'

// /academia?token=... → ambiente do candidato, sem login no CRM
const isAcademiaCandidato = window.location.pathname === '/academia'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isAcademiaCandidato ? <AcademiaCandidatoView /> : <GrupoParisShell />}
    </ErrorBoundary>
  </React.StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
