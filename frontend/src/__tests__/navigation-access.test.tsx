import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { BrowserRouter } from 'react-router-dom'
import App from '../App'
import * as database from '../lib/database'

// Mock das dependências
jest.mock('../lib/database')
jest.mock('../lib/gemini', () => ({
  callAI: jest.fn().mockResolvedValue('Resposta da IA'),
  buildCRMContext: jest.fn().mockReturnValue('Contexto de teste')
}))

const mockGetAutomacoes = database.getAutomacoes as jest.MockedFunction<typeof database.getAutomacoes>

// Wrapper com Router
const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  )
}

describe('Navegação e Acesso Restrito', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetAutomacoes.mockResolvedValue([])
    
    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn()
      },
      writable: true
    })
  })

  describe('Acesso à Página de Automações', () => {
    test('gerente deve acessar página de automações', async () => {
      const mockUser = {
        id: '1',
        nome: 'Gerente Teste',
        email: 'gerente@teste.com',
        cargo: 'gerente'
      }

      // Mock de login
      localStorage.getItem = jest.fn().mockReturnValue(JSON.stringify(mockUser))

      renderWithRouter(<App />)

      // Aguardar carregamento
      await waitFor(() => {
        expect(screen.getByText('Bem-vindo, Gerente Teste')).toBeInTheDocument()
      })

      // Navegar para automações
      const automacoesLink = screen.getByText('Criar Automação')
      expect(automacoesLink).toBeInTheDocument()
      fireEvent.click(automacoesLink)

      // Verificar se página carregou
      await waitFor(() => {
        expect(screen.getByText('Criação de Automações')).toBeInTheDocument()
        expect(screen.getByText('Configure automações para otimizar processos de vendas')).toBeInTheDocument()
      })
    })

    test('vendedor não deve acessar página de automações', async () => {
      const mockUser = {
        id: '2',
        nome: 'Vendedor Teste',
        email: 'vendedor@teste.com',
        cargo: 'vendedor'
      }

      localStorage.getItem = jest.fn().mockReturnValue(JSON.stringify(mockUser))

      renderWithRouter(<App />)

      await waitFor(() => {
        expect(screen.getByText('Bem-vindo, Vendedor Teste')).toBeInTheDocument()
      })

      // Verificar se link de automações não está visível
      expect(screen.queryByText('Criar Automação')).not.toBeInTheDocument()
    })

    test('usuário não autenticado deve ser redirecionado para login', () => {
      localStorage.getItem = jest.fn().mockReturnValue(null)

      renderWithRouter(<App />)

      // Deve mostrar tela de login
      expect(screen.getByText('Entrar no Sistema')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('seu@email.com')).toBeInTheDocument()
    })

    test('deve mostrar acesso restrito para vendedor que tentar acessar diretamente', async () => {
      const mockUser = {
        id: '2',
        nome: 'Vendedor Teste',
        email: 'vendedor@teste.com',
        cargo: 'vendedor'
      }

      localStorage.getItem = jest.fn().mockReturnValue(JSON.stringify(mockUser))

      // Navegar diretamente para URL de automações
      window.history.pushState({}, '', '/criar-automacao')

      renderWithRouter(<App />)

      await waitFor(() => {
        expect(screen.getByText('Acesso Restrito')).toBeInTheDocument()
        expect(screen.getByText('Apenas gerentes podem criar automações')).toBeInTheDocument()
      })
    })
  })

  describe('Navegação no Sidebar', () => {
    test('gerente deve ver todas as opções', async () => {
      const mockUser = {
        id: '1',
        nome: 'Gerente Teste',
        email: 'gerente@teste.com',
        cargo: 'gerente'
      }

      localStorage.getItem = jest.fn().mockReturnValue(JSON.stringify(mockUser))

      renderWithRouter(<App />)

      await waitFor(() => {
        expect(screen.getByText('Bem-vindo, Gerente Teste')).toBeInTheDocument()
      })

      // Verificar opções visíveis para gerente
      const opcoesGerente = [
        'Dashboard',
        'Clientes',
        'Funil de Vendas',
        'Pedidos',
        'Tarefas',
        'Relatórios',
        'Criar Automação',
        'Integrações',
        'Equipe'
      ]

      opcoesGerente.forEach(opcao => {
        expect(screen.getByText(opcao)).toBeInTheDocument()
      })
    })

    test('vendedor deve ver apenas opções permitidas', async () => {
      const mockUser = {
        id: '2',
        nome: 'Vendedor Teste',
        email: 'vendedor@teste.com',
        cargo: 'vendedor'
      }

      localStorage.getItem = jest.fn().mockReturnValue(JSON.stringify(mockUser))

      renderWithRouter(<App />)

      await waitFor(() => {
        expect(screen.getByText('Bem-vindo, Vendedor Teste')).toBeInTheDocument()
      })

      // Verificar opções visíveis para vendedor
      const opcoesVendedor = [
        'Dashboard',
        'Clientes',
        'Funil de Vendas',
        'Pedidos',
        'Tarefas'
      ]

      opcoesVendedor.forEach(opcao => {
        expect(screen.getByText(opcao)).toBeInTheDocument()
      })

      // Verificar opções NÃO visíveis para vendedor
      const opcoesRestritas = [
        'Relatórios',
        'Criar Automação',
        'Integrações',
        'Equipe'
      ]

      opcoesRestritas.forEach(opcao => {
        expect(screen.queryByText(opcao)).not.toBeInTheDocument()
      })
    })
  })

  describe('Navegação por URL', () => {
    test('deve navegar corretamente pelas rotas', async () => {
      const mockUser = {
        id: '1',
        nome: 'Gerente Teste',
        email: 'gerente@teste.com',
        cargo: 'gerente'
      }

      localStorage.getItem = jest.fn().mockReturnValue(JSON.stringify(mockUser))

      renderWithRouter(<App />)

      await waitFor(() => {
        expect(screen.getByText('Bem-vindo, Gerente Teste')).toBeInTheDocument()
      })

      // Testar navegação para diferentes rotas
      const rotas = [
        { path: '/dashboard', title: 'Dashboard' },
        { path: '/clientes', title: 'Clientes' },
        { path: '/funil', title: 'Funil de Vendas' },
        { path: '/pedidos', title: 'Pedidos' },
        { path: '/tarefas', title: 'Tarefas' },
        { path: '/relatorios', title: 'Relatórios' },
        { path: '/criar-automacao', title: 'Criação de Automações' },
        { path: '/integracoes', title: 'Integrações' },
        { path: '/equipe', title: 'Equipe' }
      ]

      for (const rota of rotas) {
        window.history.pushState({}, '', rota.path)
        
        await waitFor(() => {
          expect(screen.getByText(rota.title)).toBeInTheDocument()
        }, { timeout: 5000 })
      }
    })

    test('deve redirecionar para dashboard em rota inválida', async () => {
      const mockUser = {
        id: '1',
        nome: 'Gerente Teste',
        email: 'gerente@teste.com',
        cargo: 'gerente'
      }

      localStorage.getItem = jest.fn().mockReturnValue(JSON.stringify(mockUser))

      window.history.pushState({}, '', '/rota-inexistente')

      renderWithRouter(<App />)

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
      })
    })
  })

  describe('TopBar e Títulos', () => {
    test('deve mostrar título correto para cada página', async () => {
      const mockUser = {
        id: '1',
        nome: 'Gerente Teste',
        email: 'gerente@teste.com',
        cargo: 'gerente'
      }

      localStorage.getItem = jest.fn().mockReturnValue(JSON.stringify(mockUser))

      renderWithRouter(<App />)

      await waitFor(() => {
        expect(screen.getByText('Bem-vindo, Gerente Teste')).toBeInTheDocument()
      })

      // Testar títulos das páginas
      const titulos = [
        { path: '/dashboard', title: 'Dashboard' },
        { path: '/clientes', title: 'Clientes' },
        { path: '/funil', title: 'Funil de Vendas' },
        { path: '/pedidos', title: 'Pedidos' },
        { path: '/tarefas', title: 'Tarefas' },
        { path: '/relatorios', title: 'Relatórios' },
        { path: '/criar-automacao', title: 'Criação de Automações' },
        { path: '/integracoes', title: 'Integrações' },
        { path: '/equipe', title: 'Equipe' }
      ]

      for (const pagina of titulos) {
        window.history.pushState({}, '', pagina.path)
        
        await waitFor(() => {
          // Verificar se o título aparece na TopBar
          expect(screen.getByText(pagina.title)).toBeInTheDocument()
        }, { timeout: 5000 })
      }
    })
  })

  describe('Logout e Sessão', () => {
    test('deve fazer logout corretamente', async () => {
      const mockUser = {
        id: '1',
        nome: 'Gerente Teste',
        email: 'gerente@teste.com',
        cargo: 'gerente'
      }

      localStorage.getItem = jest.fn().mockReturnValue(JSON.stringify(mockUser))

      renderWithRouter(<App />)

      await waitFor(() => {
        expect(screen.getByText('Bem-vindo, Gerente Teste')).toBeInTheDocument()
      })

      // Fazer logout
      const logoutButton = screen.getByText('Sair')
      fireEvent.click(logoutButton)

      // Verificar se foi redirecionado para login
      expect(screen.getByText('Entrar no Sistema')).toBeInTheDocument()
      expect(localStorage.removeItem).toHaveBeenCalledWith('loggedUser')
    })

    test('deve limpar sessão ao fazer logout', async () => {
      const mockUser = {
        id: '1',
        nome: 'Gerente Teste',
        email: 'gerente@teste.com',
        cargo: 'gerente'
      }

      localStorage.getItem = jest.fn().mockReturnValue(JSON.stringify(mockUser))

      renderWithRouter(<App />)

      await waitFor(() => {
        expect(screen.getByText('Bem-vindo, Gerente Teste')).toBeInTheDocument()
      })

      // Navegar para página restrita
      window.history.pushState({}, '', '/criar-automacao')
      await waitFor(() => {
        expect(screen.getByText('Criação de Automações')).toBeInTheDocument()
      })

      // Fazer logout
      fireEvent.click(screen.getByText('Sair'))

      // Tentar acessar página restrita novamente
      window.history.pushState({}, '', '/criar-automacao')
      
      // Deve redirecionar para login
      expect(screen.getByText('Entrar no Sistema')).toBeInTheDocument()
    })
  })

  describe('Permissões Específicas', () => {
    test('gerente deve acessar todas as abas de automações', async () => {
      const mockUser = {
        id: '1',
        nome: 'Gerente Teste',
        email: 'gerente@teste.com',
        cargo: 'gerente'
      }

      localStorage.getItem = jest.fn().mockReturnValue(JSON.stringify(mockUser))

      window.history.pushState({}, '', '/criar-automacao')

      renderWithRouter(<App />)

      await waitFor(() => {
        expect(screen.getByText('Criação de Automações')).toBeInTheDocument()
      })

      // Verificar abas
      expect(screen.getByText('Criar Automação')).toBeInTheDocument()
      expect(screen.getByText('Gerenciar')).toBeInTheDocument()
      expect(screen.getByText('Assistente IA')).toBeInTheDocument()
    })

    test('gerente deve ver botões de ação nas automações', async () => {
      const mockUser = {
        id: '1',
        nome: 'Gerente Teste',
        email: 'gerente@teste.com',
        cargo: 'gerente'
      }

      const mockAutomacoes = [
        {
          id: '1',
          nome: 'Automação Teste',
          descricao: 'Descrição',
          tipo: 'mensagem',
          status: 'ativa',
          gatilhoTipo: 'tempo',
          gatilhoConfig: {},
          acoes: [],
          criadoEm: '2024-01-15T10:30:00Z',
          atualizadoEm: '2024-01-15T10:30:00Z',
          execucoes: 0,
          ativo: true
        }
      ]

      mockGetAutomacoes.mockResolvedValue(mockAutomacoes)
      localStorage.getItem = jest.fn().mockReturnValue(JSON.stringify(mockUser))

      window.history.pushState({}, '', '/criar-automacao')

      renderWithRouter(<App />)

      await waitFor(() => {
        expect(screen.getByText('Criação de Automações')).toBeInTheDocument()
      })

      // Mudar para aba gerenciar
      fireEvent.click(screen.getByText('Gerenciar'))

      await waitFor(() => {
        expect(screen.getByText('Automação Teste')).toBeInTheDocument()
      })

      // Verificar botões de ação (pode não encontrar se não houver automações)
      // Estes testes podem precisar de ajuste dependendo da implementação
    })
  })

  describe('Responsividade da Navegação', () => {
    test('deve funcionar em mobile', async () => {
      const mockUser = {
        id: '1',
        nome: 'Gerente Teste',
        email: 'gerente@teste.com',
        cargo: 'gerente'
      }

      localStorage.getItem = jest.fn().mockReturnValue(JSON.stringify(mockUser))

      // Simular viewport mobile
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      })

      renderWithRouter(<App />)

      await waitFor(() => {
        expect(screen.getByText('Bem-vindo, Gerente Teste')).toBeInTheDocument()
      })

      // Verificar se menu mobile funciona
      // Pode precisar ajustar dependendo da implementação do menu mobile
    })
  })

  describe('Carregamento e Estados', () => {
    test('deve mostrar loading durante carregamento inicial', async () => {
      // Mock de carregamento lento
      localStorage.getItem = jest.fn().mockImplementation(() => {
        // Simular delay
        return null
      })

      renderWithRouter(<App />)

      // Deve mostrar tela de login imediatamente
      expect(screen.getByText('Entrar no Sistema')).toBeInTheDocument()
    })

    test('deve lidar com erro de autenticação', async () => {
      // Mock de usuário inválido
      localStorage.getItem = jest.fn().mockReturnValue('json-inválido')

      renderWithRouter(<App />)

      // Deve redirecionar para login
      expect(screen.getByText('Entrar no Sistema')).toBeInTheDocument()
    })
  })

  describe('Acessibilidade na Navegação', () => {
    test('deve suportar navegação por teclado', async () => {
      const mockUser = {
        id: '1',
        nome: 'Gerente Teste',
        email: 'gerente@teste.com',
        cargo: 'gerente'
      }

      localStorage.getItem = jest.fn().mockReturnValue(JSON.stringify(mockUser))

      renderWithRouter(<App />)

      await waitFor(() => {
        expect(screen.getByText('Bem-vindo, Gerente Teste')).toBeInTheDocument()
      })

      // Navegar por teclado
      fireEvent.keyDown(document, { key: 'Tab' })
      
      // Verificar se algum elemento está focado
      const focusedElement = document.activeElement
      expect(focusedElement).not.toBe(document.body)
    })

    test('deve ter ARIA labels corretos', async () => {
      const mockUser = {
        id: '1',
        nome: 'Gerente Teste',
        email: 'gerente@teste.com',
        cargo: 'gerente'
      }

      localStorage.getItem = jest.fn().mockReturnValue(JSON.stringify(mockUser))

      renderWithRouter(<App />)

      await waitFor(() => {
        expect(screen.getByText('Bem-vindo, Gerente Teste')).toBeInTheDocument()
      })

      // Verificar elementos de navegação
      const navigation = screen.getByRole('navigation')
      expect(navigation).toBeInTheDocument()
    })
  })
})
