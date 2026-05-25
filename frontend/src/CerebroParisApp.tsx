import React, { useState, useEffect } from 'react'
import type { UsuarioERP, ModuloERP } from './types/cerebro-paris'
import type { Vendedor } from './types'
import { supabase } from './lib/supabase'
import * as db from './lib/database'
import LoginScreen from './components/LoginScreen'
import GrupoParisPortal from './components/GrupoParisPortal'
import CerebroParisRouter from './components/CerebroParisRouter'
import AppRouter from './components/AppRouter' // CRM Router existente
import Toast from './components/Toast'
import { useNotificacoes } from './hooks/useNotificacoes'
import { useRealtimeSubscription } from './hooks/useRealtimeSubscription'

interface CerebroParisAppProps {
  modo?: 'cerebro-paris' | 'crm-classico'
}

// Mapeamento de permissões do CRM para o novo sistema
function mapearUsuarioParaERP(usuario: Vendedor): UsuarioERP {
  // Mapear cargo do CRM para níveis do ERP
  const cargoMap: Record<string, UsuarioERP['cargo']> = {
    'gerente': 'gerente',
    'vendedor': 'analista',
    'sdr': 'operacional'
  }

  // Definir módulos permitidos baseado no cargo
  const modulosPorCargo: Record<string, ModuloERP[]> = {
    'gerente': [
      'dashboard-executivo',
      'crm',
      'financeiro',
      'logistica',
      'producao',
      'rh',
      'bi',
      'automacoes',
      'ia-contextual',
      'configuracoes',
      'dashboard',
      'funil',
      'clientes',
      'pedidos',
      'tarefas',
      'automacoes',
      'ia',
      'integracoes',
      'relatorios',
      'equipe',
      'produtos',
      'criar-automacao'
    ],
    'vendedor': [
      'dashboard-executivo',
      'crm',
      'dashboard',
      'funil',
      'clientes',
      'pedidos',
      'tarefas',
      'ia',
      'produtos',
      'templates',
      'treinamento'
    ],
    'sdr': [
      'dashboard-executivo',
      'crm',
      'dashboard',
      'funil',
      'clientes',
      'prospeccao',
      'baseleads',
      'tarefas',
      'templates',
      'treinamento',
      'pedidos'
    ]
  }

  // Criar permissões detalhadas
  const permissoes: UsuarioERP['permissoes'] = [
    { modulo: 'dashboard-executivo', nivel: 'leitura' },
    { modulo: 'crm', nivel: usuario.cargo === 'gerente' ? 'administracao' : 'escrita' },
    { modulo: 'financeiro', nivel: usuario.cargo === 'gerente' ? 'leitura' : 'leitura' },
    { modulo: 'logistica', nivel: usuario.cargo === 'gerente' ? 'leitura' : 'leitura' },
    { modulo: 'producao', nivel: usuario.cargo === 'gerente' ? 'leitura' : 'leitura' },
    { modulo: 'rh', nivel: usuario.cargo === 'gerente' ? 'leitura' : 'leitura' },
    { modulo: 'bi', nivel: usuario.cargo === 'gerente' ? 'leitura' : 'leitura' },
    { modulo: 'automacoes', nivel: usuario.cargo === 'gerente' ? 'administracao' : 'leitura' },
    { modulo: 'ia-contextual', nivel: 'escrita' },
    { modulo: 'configuracoes', nivel: usuario.cargo === 'gerente' ? 'administracao' : 'leitura' }
  ]

  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    cargo: cargoMap[usuario.cargo] || 'operacional',
    departamento: usuario.cargo === 'gerente' ? 'Geral' : 'Vendas',
    modulosPermitidos: modulosPorCargo[usuario.cargo] || modulosPorCargo['vendedor'],
    permissoes,
    ativo: usuario.ativo,
    dataCriacao: new Date().toISOString(),
    ultimoAcesso: new Date().toISOString(),
    // Propriedades obrigatórias do Vendedor
    telefone: usuario.telefone || '',
    avatar: usuario.avatar || '',
    usuario: usuario.usuario || usuario.email.split('@')[0],
    metaVendas: usuario.metaVendas || 0,
    taxaComissao: (usuario as any).taxaComissao || 0,
    metaLeads: (usuario as any).metaLeads || 0,
    metaConversao: (usuario as any).metaConversao || 0,
    auth_user_id: (usuario as any).auth_user_id || ''
  }
}

export default function CerebroParisApp({ modo = 'cerebro-paris' }: CerebroParisAppProps) {
  const [loggedUser, setLoggedUser] = useState<Vendedor | UsuarioERP | null>(null)
  const [loading, setLoading] = useState(true)
  const [modoAtual, setModoAtual] = useState<'cerebro-paris' | 'crm-classico' | 'portal'>('portal')
  const [sistemaSelecionado, setSistemaSelecionado] = useState<string | null>(null)
  const [notificacoes, setNotificacoes] = useState<any[]>([])
  
  // Simplificado para teste
  const adicionarNotificacao = (mensagem: string, tipo: string) => {
    console.log(`[${tipo}] ${mensagem}`)
  }
  const removerNotificacao = (id: number) => {
    console.log(`Removendo notificação ${id}`)
  }
  const conectar = () => {}
  const desconectar = () => {}

  // Função para lidar com seleção de sistema no portal
  const handleSistemaSelect = (sistemaId: string) => {
    setSistemaSelecionado(sistemaId)
    
    switch (sistemaId) {
      case 'cerebro-paris':
        setModoAtual('cerebro-paris')
        break
      case 'crm-mfparis':
        setModoAtual('crm-classico')
        break
      default:
        // Para sistemas em desenvolvimento, mostrar mensagem
        adicionarNotificacao('Sistema em desenvolvimento', 'info')
        return
    }
  }

  // Verificar sessão ao carregar
  useEffect(() => {
    const checkSession = async () => {
      try {
        console.log('Verificando sessão...')
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session?.user) {
          console.log('Sessão encontrada:', session.user.id)
          // Buscar dados completos do usuário
          const { data: userData, error } = await supabase
            .from('vendedores')
            .select('*')
            .eq('auth_user_id', session.user.id)
            .single()

          if (error) {
            console.error('Erro ao buscar usuário:', error)
          }

          if (userData) {
            console.log('Usuário encontrado:', userData.nome)
            // Sempre começar no modo portal após login
            setModoAtual('portal')
            setLoggedUser(userData)
          } else {
            console.log('Usuário não encontrado na tabela vendedores')
          }
        } else {
          console.log('Nenhuma sessão ativa')
        }
      } catch (error) {
        console.error('Erro ao verificar sessão:', error)
      } finally {
        setLoading(false)
      }
    }

    checkSession()
  }, [])

  // Conectar realtime quando usuário logar
  useEffect(() => {
    if (loggedUser) {
      conectar()
    } else {
      desconectar()
    }
  }, [loggedUser, conectar, desconectar])

  // Login
  const handleLogin = async (email: string, senha: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: senha
      })

      if (error) throw error

      if (data.user) {
        // Buscar dados do vendedor
        const { data: userData, error: userError } = await supabase
          .from('vendedores')
          .select('*')
          .eq('auth_user_id', data.user.id)
          .single()

        if (userError) throw userError

        if (userData) {
          console.log('Login bem-sucedido, redirecionando para portal...')
          // Sempre redirecionar para o portal após login
          setModoAtual('portal')
          setLoggedUser(userData)
          adicionarNotificacao('Login realizado com sucesso!', 'success')
        }
      }
    } catch (error: any) {
      console.error('Erro no login:', error)
      adicionarNotificacao('Erro ao fazer login. Verifique suas credenciais.', 'error')
      throw error
    }
  }

  // Logout
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
      setLoggedUser(null)
      desconectar()
      adicionarNotificacao('Logout realizado com sucesso!', 'info')
    } catch (error) {
      console.error('Erro no logout:', error)
      adicionarNotificacao('Erro ao fazer logout.', 'error')
    }
  }

  // Alternar entre modos
  const alternarModo = () => {
    if (loggedUser) {
      const novoModo = modoAtual === 'cerebro-paris' ? 'crm-classico' : 'cerebro-paris'
      setModoAtual(novoModo)
      
      // Reconverter usuário se necessário
      if ('cargo' in loggedUser && 'modulosPermitidos' in loggedUser) {
        // Já está no formato ERP, precisa converter para Vendedor
        if (novoModo === 'crm-classico') {
          // Converter de volta para Vendedor (simplificado)
          const vendedor: Vendedor = {
            id: loggedUser.id,
            nome: loggedUser.nome,
            email: loggedUser.email,
            cargo: loggedUser.cargo === 'gerente' ? 'gerente' : 'vendedor',
            ativo: loggedUser.ativo,
            telefone: loggedUser.telefone || '',
            avatar: loggedUser.avatar || '',
            usuario: loggedUser.usuario || loggedUser.email.split('@')[0],
            metaVendas: loggedUser.metaVendas || 0,
            metaLeads: loggedUser.metaLeads || 0,
            metaConversao: loggedUser.metaConversao || 0
          }
          setLoggedUser(vendedor)
        }
      } else {
        // Está no formato Vendedor, converter para ERP
        if (novoModo === 'cerebro-paris') {
          const usuarioERP = mapearUsuarioParaERP(loggedUser as Vendedor)
          setLoggedUser(usuarioERP)
        }
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Cérebro Paris</h2>
          <p className="text-gray-600">Carregando sistema...</p>
        </div>
      </div>
    )
  }

  if (!loggedUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Grupo Paris</h1>
          <p className="text-gray-600">Carregando sistema de login...</p>
        </div>
      </div>
    )
  }

  // Renderizar baseado no modo atual
  if (modoAtual === 'portal') {
    return (
      <>
        <GrupoParisPortal 
          loggedUser={loggedUser as Vendedor}
          onSistemaSelect={handleSistemaSelect}
        />
        <Toast toastMsg={null} />
        
        {/* Botão para sair */}
        <button
          onClick={handleSignOut}
          className="fixed bottom-4 right-4 z-50 px-3 py-2 bg-red-600 text-white text-xs rounded-lg shadow-lg hover:bg-red-700"
          title="Sair"
        >
          Sair
        </button>
      </>
    )
  }

  if (modoAtual === 'cerebro-paris') {
    return (
      <>
        <CerebroParisRouter 
          usuario={loggedUser as UsuarioERP} 
          onSignOut={handleSignOut} 
        />
        <Toast toastMsg={null} />
        
        {/* Botão para voltar ao portal */}
        <button
          onClick={() => setModoAtual('portal')}
          className="fixed bottom-4 left-4 z-50 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg shadow-lg hover:bg-gray-700"
          title="Voltar ao Portal"
        >
          ← Portal
        </button>
      </>
    )
  }

  // Modo CRM Clássico (existente)
  return (
    <>
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">CRM MF Paris</h1>
          <p className="text-gray-600">Sistema CRM em desenvolvimento...</p>
          <button
            onClick={() => setModoAtual('portal')}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Voltar ao Portal
          </button>
        </div>
      </div>
      <Toast toastMsg={null} />
      
      {/* Botão para voltar ao portal */}
      <button
        onClick={() => setModoAtual('portal')}
        className="fixed bottom-4 left-4 z-50 px-3 py-2 bg-indigo-600 text-white text-xs rounded-lg shadow-lg hover:bg-indigo-700"
        title="Voltar ao Portal"
      >
        ← Portal
      </button>
    </>
  )
}
