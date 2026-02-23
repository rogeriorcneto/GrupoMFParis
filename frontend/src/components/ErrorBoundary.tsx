import React from 'react'

interface State {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900 flex items-center justify-center p-4">
          <div className="w-full max-w-md text-center">
            <div className="w-20 h-20 bg-white rounded-2xl shadow-lg mx-auto flex items-center justify-center mb-6 p-2">
              <img src="/Logo_MFParis.jpg" alt="GMF" className="w-full h-full object-contain rounded-xl" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Algo deu errado</h1>
            <p className="text-primary-200 mb-6">Ocorreu um erro inesperado. Tente recarregar a página.</p>
            {import.meta.env.DEV && this.state.error && (
              <div className="bg-red-900/40 border border-red-400/30 rounded-xl p-4 mb-6 text-left">
                <p className="text-red-200 text-xs font-mono break-all">{this.state.error.message}</p>
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-white text-primary-700 font-semibold rounded-xl hover:bg-gray-100 transition-colors shadow-lg"
            >
              🔄 Recarregar Página
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
