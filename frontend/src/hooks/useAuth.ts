import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import * as db from '../lib/database'
import type { Vendedor } from '../types'

export function useAuth() {
  const [loggedUser, setLoggedUser] = useState<Vendedor | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [loginUsuario, setLoginUsuario] = useState('')
  const [loginSenha, setLoginSenha] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const checkSession = useCallback(async () => {
    try {
      const vendedor = await db.getLoggedVendedor()
      if (vendedor) {
        setLoggedUser(vendedor)
        return vendedor
      }
    } catch {
      // No active session
    } finally {
      setAuthChecked(true)
    }
    return null
  }, [])

  useEffect(() => {
    checkSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_OUT') {
        setLoggedUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [checkSession])

  const handleLogin = useCallback(async (): Promise<Vendedor | null> => {
    if (loginLoading) return null
    setLoginError('')
    setLoginLoading(true)
    try {
      await db.signIn(loginUsuario.trim(), loginSenha)
      const vendedor = await db.getLoggedVendedor()
      if (vendedor) {
        setLoggedUser(vendedor)
        setLoginUsuario('')
        setLoginSenha('')
        return vendedor
      } else {
        setLoginError('Usuário não encontrado na equipe')
        return null
      }
    } catch (err: any) {
      setLoginError(
        err?.message === 'Invalid login credentials'
          ? 'Email ou senha inválidos'
          : (err?.message || 'Erro ao fazer login')
      )
      return null
    } finally {
      setLoginLoading(false)
    }
  }, [loginUsuario, loginSenha, loginLoading])

  const handleLogout = useCallback(async () => {
    await db.signOut()
    setLoggedUser(null)
  }, [])

  return {
    loggedUser,
    setLoggedUser,
    authChecked,
    loginUsuario,
    setLoginUsuario,
    loginSenha,
    setLoginSenha,
    loginError,
    setLoginError,
    loginLoading,
    handleLogin,
    handleLogout,
  }
}
