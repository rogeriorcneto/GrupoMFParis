import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import * as db from './lib/database'
import type { Vendedor } from './types'
import App from './App'
import GrupoParisHome from './components/GrupoParisHome'
import LogisticaSystem from './components/erp/LogisticaSystem'
import FinanceiroSystem from './components/erp/FinanceiroSystem'
import CerebroParisSystem from './components/erp/CerebroParisSystem'
import ProducaoSystem from './components/erp/ProducaoSystem'
import RhSystem from './components/erp/RhSystem'
import BiSystem from './components/erp/BiSystem'
import DocumentosSystem from './components/erp/DocumentosSystem'

type SistemaAtivo = 'portal' | 'crm' | 'logistica' | 'financeiro' | 'producao' | 'rh' | 'bi' | 'documentos' | 'cerebro'

export default function GrupoParisShell() {
  const [authChecked, setAuthChecked] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  // Persistir sistema ativo no localStorage para sobreviver a reloads
  const [sistemaAtivo, setSistemaAtivoState] = useState<SistemaAtivo>(() => {
    const saved = localStorage.getItem('gp_sistema_ativo')
    return (saved as SistemaAtivo) || 'portal'
  })
  const setSistemaAtivo = (s: SistemaAtivo) => {
    localStorage.setItem('gp_sistema_ativo', s)
    setSistemaAtivoState(s)
  }
  const [usuario, setUsuario] = useState<{ nome: string; cargo: string; email: string } | null>(null)
  const [vendedorCompleto, setVendedorCompleto] = useState<Vendedor | null>(null)
  // vendedorReady: true quando fetchUserInfo terminou (com ou sem vendedorCompleto)
  const [vendedorReady, setVendedorReady] = useState(false)
  // CRM fica montado após primeira abertura — nunca desmonta
  const [crmMontado, setCrmMontado] = useState(() => {
    const saved = localStorage.getItem('gp_sistema_ativo')
    return saved === 'crm'
  })

  useEffect(() => {
    // Checar sessão atual
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          setIsAuthenticated(true)
          await fetchUserInfo(session.user.id)
        }
      } catch (err) {
        console.error('Erro ao checar sessão:', err)
      } finally {
        setAuthChecked(true)
      }
    }
    checkSession()

    // Timeout de segurança: se em 3s não respondeu, libera
    const timeout = setTimeout(() => setAuthChecked(true), 3000)

    // Listener de mudanças de autenticação
    // SIGNED_IN não reseta para portal — mantém o sistema que estava ativo
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setIsAuthenticated(true)
        await fetchUserInfo(session.user.id)
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false)
        setUsuario(null)
        setVendedorCompleto(null)
        setVendedorReady(false)
        setSistemaAtivo('portal')
        setCrmMontado(false)
      }
    })

    return () => {
      clearTimeout(timeout)
      authListener.subscription.unsubscribe()
    }
  }, [])

  const fetchUserInfo = async (userId: string) => {
    try {
      // Tenta pelo auth_user_id primeiro, fallback pelo auth_id, depois pelo email
      let { data } = await supabase
        .from('vendedores')
        .select('*')
        .eq('auth_user_id', userId)
        .maybeSingle()
      if (!data) {
        const r2 = await supabase.from('vendedores').select('*').eq('auth_id', userId).maybeSingle()
        if (r2.data) data = r2.data
      }
      if (!data) {
        const { data: { session } } = await supabase.auth.getSession()
        const email = session?.user?.email
        if (email) {
          const r3 = await supabase.from('vendedores').select('*').eq('email', email).maybeSingle()
          if (r3.data) data = r3.data
        }
      }
      if (data) {
        setUsuario({ nome: data.nome, cargo: data.cargo, email: data.email })
        // Tentar buscar o Vendedor completo para passar ao App (evita segunda verificação)
        try {
          const v = await db.getLoggedVendedor()
          if (v) setVendedorCompleto(v)
          // Se null, App fará sua própria verificação normalmente
        } catch { /* App fará sua própria verificação */ }
      }
    } catch (err) {
      console.error('Erro ao buscar usuário:', err)
    } finally {
      setVendedorReady(true)
    }
  }

  // Se não autenticado, renderiza o App existente (que mostra LoginScreen)
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-700 via-purple-800 to-pink-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p>Carregando Grupo Paris...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    // Renderiza App original que faz login
    return <App />
  }

  // Outros sistemas ERP
  const voltarPortal = () => setSistemaAtivo('portal')

  // Montar CRM na primeira vez que for selecionado — só quando vendedorReady
  if (sistemaAtivo === 'crm' && !crmMontado && vendedorReady) setCrmMontado(true)

  // Portal + CRM oculto em background (se já foi montado)
  if (sistemaAtivo === 'portal') {
    return (
      <>
        <GrupoParisHome
          usuario={usuario}
          onSelectSistema={(s: SistemaAtivo) => setSistemaAtivo(s)}
          onSignOut={async () => {
            await supabase.auth.signOut()
          }}
        />
        {/* CRM permanece montado em display:none para não recarregar ao voltar */}
        {crmMontado && vendedorReady && (
          <div style={{ display: 'none' }} aria-hidden>
            <App preloadedUser={vendedorCompleto} />
          </div>
        )}
      </>
    )
  }

  // Sistema CRM ativo — aguardar vendedorReady para evitar flash de login
  if (sistemaAtivo === 'crm') {
    if (!vendedorReady) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-700 via-purple-800 to-pink-900 flex items-center justify-center">
          <div className="text-center text-white">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
            <p>Carregando CRM...</p>
          </div>
        </div>
      )
    }
    return (
      <>
        {crmMontado && <App preloadedUser={vendedorCompleto} />}
        <button
          onClick={() => setSistemaAtivo('portal')}
          className="fixed bottom-4 right-4 z-[9999] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg shadow-2xl flex items-center gap-2 font-medium"
          title="Voltar ao Portal Grupo Paris"
        >
          ← Portal Grupo Paris
        </button>
      </>
    )
  }

  if (sistemaAtivo === 'logistica') return <LogisticaSystem onVoltar={voltarPortal} />
  if (sistemaAtivo === 'financeiro') return <FinanceiroSystem onVoltar={voltarPortal} />
  if (sistemaAtivo === 'cerebro') return <CerebroParisSystem onVoltar={voltarPortal} />
  if (sistemaAtivo === 'producao') return <ProducaoSystem onVoltar={voltarPortal} />
  if (sistemaAtivo === 'rh') return <RhSystem onVoltar={voltarPortal} />
  if (sistemaAtivo === 'bi') return <BiSystem onVoltar={voltarPortal} />
  if (sistemaAtivo === 'documentos') return <DocumentosSystem onVoltar={voltarPortal} />

  // Fallback para sistema desconhecido
  return (
    <SistemaPlaceholder
      sistema={sistemaAtivo}
      onVoltar={voltarPortal}
    />
  )
}

// Componente de placeholder para sistemas em desenvolvimento
function SistemaPlaceholder({ sistema, onVoltar }: { sistema: string; onVoltar: () => void }) {
  const titulos: Record<string, { titulo: string; descricao: string; icone: string; cor: string }> = {
    logistica: { titulo: 'Logística & Frete', descricao: 'Gestão de transportadoras, rotas, fretes e rastreamento', icone: '🚚', cor: 'from-orange-500 to-red-600' },
    financeiro: { titulo: 'Financeiro', descricao: 'Contas a pagar, receber, fluxo de caixa e DRE', icone: '💰', cor: 'from-green-500 to-emerald-600' },
    producao: { titulo: 'Produção', descricao: 'Ordens de produção, controle de qualidade e estoque', icone: '🏭', cor: 'from-gray-600 to-gray-800' },
    rh: { titulo: 'Recursos Humanos', descricao: 'Folha de pagamento, ponto, benefícios e equipe', icone: '👥', cor: 'from-indigo-500 to-blue-600' },
    bi: { titulo: 'Business Intelligence', descricao: 'Dashboards executivos, análises e relatórios gerenciais', icone: '📊', cor: 'from-pink-500 to-purple-600' },
    documentos: { titulo: 'Gestão Documental', descricao: 'Arquivamento, contratos e documentos digitais', icone: '📁', cor: 'from-red-500 to-rose-600' },
    cerebro: { titulo: 'Cérebro Paris (IA)', descricao: 'IA com contexto total da empresa para análises e decisões', icone: '🧠', cor: 'from-purple-500 to-indigo-700' },
  }

  const info = titulos[sistema] || { titulo: sistema, descricao: 'Em breve', icone: '⚙️', cor: 'from-gray-500 to-gray-700' }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className={`bg-gradient-to-br ${info.cor} rounded-2xl shadow-2xl p-12 text-white text-center`}>
          <div className="text-7xl mb-6">{info.icone}</div>
          <h1 className="text-4xl font-bold mb-3">{info.titulo}</h1>
          <p className="text-lg opacity-90 mb-8">{info.descricao}</p>
          <div className="bg-white/20 backdrop-blur rounded-xl p-6 mb-8">
            <p className="text-sm font-medium mb-2">🚧 Em Desenvolvimento</p>
            <p className="text-sm opacity-90">
              Este módulo faz parte da estratégia do Cérebro Paris para integrar
              todas as operações do Grupo MF Paris em um único ecossistema empresarial inteligente.
            </p>
          </div>
          <button
            onClick={onVoltar}
            className="px-6 py-3 bg-white text-gray-900 font-medium rounded-lg hover:bg-gray-100 transition-colors shadow-lg"
          >
            ← Voltar ao Portal Grupo Paris
          </button>
        </div>
      </div>
    </div>
  )
}
