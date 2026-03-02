import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

interface LoginScreenProps {
  authChecked: boolean
  loginUsuario: string
  setLoginUsuario: (v: string) => void
  loginSenha: string
  setLoginSenha: (v: string) => void
  loginError: string
  loginLoading: boolean
  handleLogin: () => void
}

export default function LoginScreen({
  authChecked, loginUsuario, setLoginUsuario, loginSenha, setLoginSenha,
  loginError, loginLoading, handleLogin
}: LoginScreenProps) {
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotStatus, setForgotStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [forgotLoading, setForgotLoading] = useState(false)

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) return
    setForgotLoading(true)
    setForgotStatus(null)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: `${window.location.origin}/reset-password`
      })
      if (error) throw error
      setForgotStatus({ type: 'success', msg: 'E-mail de recuperação enviado! Verifique sua caixa de entrada.' })
    } catch (err: any) {
      setForgotStatus({ type: 'error', msg: err?.message || 'Erro ao enviar e-mail. Verifique o endereço.' })
    } finally {
      setForgotLoading(false)
    }
  }
  // Tela de loading enquanto verifica sessão
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-20 h-20 bg-white rounded-2xl shadow-lg mx-auto flex items-center justify-center mb-4 animate-pulse p-2">
            <img src="/Logo_MFParis.jpg" alt="GMF" className="w-full h-full object-contain rounded-xl" />
          </div>
          <p className="text-primary-200 mt-4">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-24 h-24 bg-white rounded-2xl shadow-lg mx-auto flex items-center justify-center mb-4 p-2">
            <img src="/Logo_MFParis.jpg" alt="Grupo MF Paris" className="w-full h-full object-contain rounded-xl" />
          </div>
          <h1 className="text-3xl font-bold text-white">Grupo MF Paris</h1>
          <p className="text-primary-200 mt-2">CRM de Vendas</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6 text-center">Entrar no sistema</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={loginUsuario}
                onChange={(e) => setLoginUsuario(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="seu@email.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <input
                type="password"
                value={loginSenha}
                onChange={(e) => setLoginSenha(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="Digite sua senha"
                className="w-full px-4 py-3 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900"
              />
            </div>

            {loginError && (
              <div className="bg-red-50 border border-red-200 rounded-apple p-3 text-sm text-red-700 text-center">
                {loginError}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loginLoading}
              className="w-full py-3 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors duration-200 shadow-apple-sm font-semibold text-base disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loginLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Entrando...
                </span>
              ) : 'Entrar'}
            </button>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200 space-y-3">
            <p className="text-xs text-gray-500 text-center">Use o email e senha cadastrados pelo administrador.</p>
            <p className="text-center">
              <button
                onClick={() => { setShowForgot(true); setForgotEmail(loginUsuario); setForgotStatus(null) }}
                className="text-xs text-primary-600 hover:text-primary-800 underline"
              >
                Esqueci minha senha
              </button>
            </p>
          </div>
        </div>

        {/* Modal Esqueci minha senha */}
        {showForgot && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowForgot(false)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">🔑 Recuperar senha</h3>
              <p className="text-sm text-gray-500 mb-4">Informe seu e-mail para receber o link de redefinição.</p>
              <input
                type="email"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleForgotPassword()}
                placeholder="seu@email.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 mb-3 text-sm"
                autoFocus
              />
              {forgotStatus && (
                <div className={`text-sm rounded-apple px-3 py-2 mb-3 ${forgotStatus.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {forgotStatus.msg}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowForgot(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-apple hover:bg-gray-50">
                  Cancelar
                </button>
                <button
                  onClick={handleForgotPassword}
                  disabled={forgotLoading || !forgotEmail.trim()}
                  className="px-4 py-2 text-sm bg-primary-600 text-white rounded-apple hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {forgotLoading ? 'Enviando...' : 'Enviar link'}
                </button>
              </div>
            </div>
          </div>
        )}

        <p className="text-center text-primary-200 text-xs mt-6">© 2026 Grupo MF Paris — CRM de Vendas</p>
      </div>
    </div>
  )
}
