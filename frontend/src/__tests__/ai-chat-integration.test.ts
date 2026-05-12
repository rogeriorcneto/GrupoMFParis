import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CriarAutomacaoView } from '../components/views/CriarAutomacaoView'
import * as gemini from '../lib/gemini'
import * as database from '../lib/database'

// Mock das dependências
jest.mock('../lib/database')
jest.mock('../lib/gemini')

const mockCallAI = gemini.callAI as jest.MockedFunction<typeof gemini.callAI>
const mockGetAutomacoes = database.getAutomacoes as jest.MockedFunction<typeof database.getAutomacoes>

// Mock de automação para testes
const mockAutomacoes = [
  {
    id: '1',
    nome: 'Automação de Boas-vindas',
    descricao: 'Envia mensagem de boas-vindas',
    tipo: 'mensagem' as const,
    status: 'ativa' as const,
    gatilhoTipo: 'evento' as const,
    gatilhoConfig: { evento: 'cliente_novo' },
    acoes: [
      { tipo: 'enviar_mensagem', configuracao: { mensagem: 'Bem-vindo!' }, ordem: 1 }
    ],
    criadoEm: '2024-01-15T10:30:00Z',
    atualizadoEm: '2024-01-15T10:30:00Z',
    execucoes: 25,
    ultimaExecucao: '2024-01-20T14:22:00Z',
    ativo: true
  },
  {
    id: '2',
    nome: 'Follow-up Automático',
    descricao: 'Envia follow-up após 3 dias',
    tipo: 'email' as const,
    status: 'pausada' as const,
    gatilhoTipo: 'tempo' as const,
    gatilhoConfig: { dias: 3 },
    acoes: [
      { tipo: 'enviar_email', configuracao: { assunto: 'Follow-up' }, ordem: 1 }
    ],
    criadoEm: '2024-01-10T09:00:00Z',
    atualizadoEm: '2024-01-10T09:00:00Z',
    execucoes: 12,
    ativo: false
  }
]

describe('Chat com IA - Integração Gemini', () => {
  const mockLoggedUser = {
    id: '1',
    nome: 'Gerente Teste',
    email: 'gerente@teste.com',
    cargo: 'gerente'
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetAutomacoes.mockResolvedValue(mockAutomacoes)
    mockCallAI.mockResolvedValue('Resposta padrão da IA')
  })

  describe('Funcionalidades Básicas do Chat', () => {
    test('deve abrir chat ao clicar no botão Assistente IA', () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      const assistenteBtn = screen.getByText('Assistente IA')
      fireEvent.click(assistenteBtn)
      
      expect(screen.getByText('Assistente de Automações')).toBeInTheDocument()
      expect(screen.getByText('IA especialista em automações de vendas')).toBeInTheDocument()
    })

    test('deve mostrar mensagem de boas-vindas ao abrir chat', () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      expect(screen.getByText(/Olá! Sou o assistente de automações da MF Paris/)).toBeInTheDocument()
      expect(screen.getByText('Como posso ajudar você hoje?')).toBeInTheDocument()
    })

    test('deve fechar chat ao clicar no botão fechar', () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      expect(screen.getByText('Assistente de Automações')).toBeInTheDocument()
      
      fireEvent.click(screen.getByTitle('Fechar'))
      expect(screen.queryByText('Assistente de Automações')).not.toBeInTheDocument()
    })

    test('deve limpar conversa ao clicar no botão limpar', () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      // Enviar uma mensagem primeiro
      const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
      fireEvent.change(input, { target: { value: 'Teste' } })
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
      
      // Limpar conversa
      fireEvent.click(screen.getByTitle('Limpar conversa'))
      
      expect(screen.getByText('Como posso ajudar?')).toBeInTheDocument()
    })
  })

  describe('Integração com Gemini API', () => {
    test('deve enviar mensagem para a IA corretamente', async () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
      const enviarBtn = screen.getByRole('button', { name: /enviar/i })
      
      fireEvent.change(input, { target: { value: 'Como criar uma automação?' } })
      fireEvent.click(enviarBtn)
      
      await waitFor(() => {
        expect(mockCallAI).toHaveBeenCalledWith(
          [{ role: 'user', content: 'Como criar uma automação?' }],
          expect.stringContaining('Contexto de Automações da MF Paris')
        )
      })
      
      expect(screen.getByText('Resposta padrão da IA')).toBeInTheDocument()
    })

    test('deve incluir contexto das automações na chamada da IA', async () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
      fireEvent.change(input, { target: { value: 'Análise' } })
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
      
      await waitFor(() => {
        const contextArg = mockCallAI.mock.calls[0][1]
        expect(contextArg).toContain('Automação de Boas-vindas')
        expect(contextArg).toContain('Follow-up Automático')
        expect(contextArg).toContain('25 execuções')
        expect(contextArg).toContain('12 execuções')
        expect(contextArg).toContain('ativa')
        expect(contextArg).toContain('pausada')
      })
    })

    test('deve mostrar indicador de carregamento enquanto processa', async () => {
      mockCallAI.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('Resposta'), 100)))
      
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
      fireEvent.change(input, { target: { value: 'Teste lento' } })
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
      
      expect(screen.getByText('Pensando...')).toBeInTheDocument()
      
      await waitFor(() => {
        expect(screen.queryByText('Pensando...')).not.toBeInTheDocument()
      })
    })

    test('deve lidar com erro na API da IA', async () => {
      mockCallAI.mockRejectedValue(new Error('Erro de conexão com Gemini'))
      
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
      fireEvent.change(input, { target: { value: 'Teste erro' } })
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/❌ Desculpe, ocorreu um erro ao processar sua mensagem/)).toBeInTheDocument()
      })
    })

    test('deve desabilitar input durante carregamento', async () => {
      mockCallAI.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('Resposta'), 100)))
      
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
      const enviarBtn = screen.getByRole('button', { name: /enviar/i })
      
      fireEvent.change(input, { target: { value: 'Teste' } })
      fireEvent.click(enviarBtn)
      
      expect(input).toBeDisabled()
      expect(enviarBtn).toBeDisabled()
      
      await waitFor(() => {
        expect(input).not.toBeDisabled()
        expect(enviarBtn).not.toBeDisabled()
      })
    })
  })

  describe('Sugestões Rápidas', () => {
    test('deve mostrar sugestões rápidas', () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const sugestoes = [
        'Como criar automação?',
        'Melhores práticas',
        'Otimizar automações',
        'Tipos de gatilhos'
      ]
      
      sugestoes.forEach(sugestao => {
        expect(screen.getByText(sugestao)).toBeInTheDocument()
      })
    })

    test('deve preencher input ao clicar em sugestão', () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const sugestaoBtn = screen.getByText('Como criar automação?')
      fireEvent.click(sugestaoBtn)
      
      const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
      expect(input).toHaveValue('Como criar uma automação de boas-vindas?')
    })

    test('deve esconder sugestões após enviar mensagem', async () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      expect(screen.getByText('Como criar automação?')).toBeInTheDocument()
      
      const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
      fireEvent.change(input, { target: { value: 'Teste' } })
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
      
      await waitFor(() => {
        expect(screen.queryByText('Como criar automação?')).not.toBeInTheDocument()
      })
    })
  })

  describe('Chat Contextual', () => {
    test('deve abrir chat com contexto ao clicar em ajuda de automação específica', async () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      // Mudar para aba gerenciar
      fireEvent.click(screen.getByText('Gerenciar (2)'))
      
      await waitFor(() => {
        expect(screen.getByText('Automação de Boas-vindas')).toBeInTheDocument()
      })
      
      // Clicar em ajuda IA para automação específica
      const ajudaBtn = screen.getAllByTitle('Pedir ajuda à IA')[0]
      fireEvent.click(ajudaBtn)
      
      expect(screen.getByText('Assistente de Automações')).toBeInTheDocument()
      
      await waitFor(() => {
        expect(mockCallAI).toHaveBeenCalledWith(
          [{ 
            role: 'user', 
            content: 'Olá! Preciso de ajuda com a automação "Automação de Boas-vindas". Pode me explicar como ela funciona e dar sugestões de melhoria?' 
          }],
          expect.stringContaining('Contexto de Automações da MF Paris')
        )
      })
    })

    test('deve personalizar contexto baseado na automação selecionada', async () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Gerenciar (2)'))
      
      await waitFor(() => {
        expect(screen.getByText('Follow-up Automático')).toBeInTheDocument()
      }
      
      // Clicar em ajuda para segunda automação
      const ajudaBtns = screen.getAllByTitle('Pedir ajuda à IA')
      fireEvent.click(ajudaBtns[1])
      
      await waitFor(() => {
        expect(mockCallAI).toHaveBeenCalledWith(
          [{ 
            role: 'user', 
            content: 'Olá! Preciso de ajuda com a automação "Follow-up Automático". Pode me explicar como ela funciona e dar sugestões de melhoria?' 
          }],
          expect.any(String)
        )
      })
    })
  })

  describe('Histórico de Conversa', () => {
    test('deve manter histórico durante a sessão', async () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
      
      // Enviar primeira mensagem
      fireEvent.change(input, { target: { value: 'Primeira pergunta' } })
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
      
      await waitFor(() => {
        expect(screen.getByText('Primeira pergunta')).toBeInTheDocument()
        expect(screen.getByText('Resposta padrão da IA')).toBeInTheDocument()
      })
      
      // Enviar segunda mensagem
      fireEvent.change(input, { target: { value: 'Segunda pergunta' } })
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
      
      await waitFor(() => {
        expect(screen.getByText('Segunda pergunta')).toBeInTheDocument()
      })
      
      // Verificar que ambas as mensagens estão no histórico
      expect(screen.getByText('Primeira pergunta')).toBeInTheDocument()
      expect(screen.getByText('Segunda pergunta')).toBeInTheDocument()
    })

    test('deve limpar histórico ao clicar em limpar conversa', async () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
      fireEvent.change(input, { target: { value: 'Teste' } })
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
      
      await waitFor(() => {
        expect(screen.getByText('Teste')).toBeInTheDocument()
      })
      
      fireEvent.click(screen.getByTitle('Limpar conversa'))
      
      expect(screen.queryByText('Teste')).not.toBeInTheDocument()
      expect(screen.getByText('Como posso ajudar?')).toBeInTheDocument()
    })
  })

  describe('Interface do Chat', () => {
    test('deve enviar mensagem ao pressionar Enter', async () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
      fireEvent.change(input, { target: { value: 'Teste Enter' } })
      fireEvent.keyPress(input, { key: 'Enter', code: 'Enter' })
      
      await waitFor(() => {
        expect(mockCallAI).toHaveBeenCalled()
      })
    })

    test('não deve enviar mensagem ao pressionar Shift+Enter', () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
      fireEvent.change(input, { target: { value: 'Teste Shift+Enter' } })
      fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', shiftKey: true })
      
      expect(mockCallAI).not.toHaveBeenCalled()
    })

    test('deve impedir envio de mensagem vazia', () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const enviarBtn = screen.getByRole('button', { name: /enviar/i })
      fireEvent.click(enviarBtn)
      
      expect(mockCallAI).not.toHaveBeenCalled()
    })

    test('deve impedir envio durante carregamento', async () => {
      mockCallAI.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('Resposta'), 100)))
      
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
      const enviarBtn = screen.getByRole('button', { name: /enviar/i })
      
      fireEvent.change(input, { target: { value: 'Primeira' } })
      fireEvent.click(enviarBtn)
      
      // Tentar enviar segunda mensagem durante carregamento
      fireEvent.change(input, { target: { value: 'Segunda' } })
      fireEvent.click(enviarBtn)
      
      // Deve ter chamado apenas uma vez
      await waitFor(() => {
        expect(mockCallAI).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('Respostas da IA', () => {
    test('deve exibir diferentes tipos de resposta', async () => {
      const respostas = [
        'Para criar uma automação, siga estes passos:\n1. Escolha o tipo\n2. Configure o gatilho\n3. Adicione ações',
        '⚡ **Dica Rápida**: Use gatilhos baseados em eventos para maior eficiência.',
        'Recomendo avaliar suas automações atuais. Você tem 2 ativas e 1 pausada.'
      ]
      
      for (const resposta of respostas) {
        mockCallAI.mockResolvedValue(resposta)
        
        const { unmount } = render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
        
        fireEvent.click(screen.getByText('Assistente IA'))
        
        const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
        fireEvent.change(input, { target: { value: 'Teste' } })
        fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
        
        await waitFor(() => {
          expect(screen.getByText(resposta)).toBeInTheDocument()
        })
        
        unmount()
      }
    })

    test('deve lidar com mensagens longas', async () => {
      const respostaLonga = 'A'.repeat(1000)
      mockCallAI.mockResolvedValue(respostaLonga)
      
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
      fireEvent.change(input, { target: { value: 'Resposta longa' } })
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
      
      await waitFor(() => {
        expect(screen.getByText(respostaLonga)).toBeInTheDocument()
      })
    })
  })

  describe('Contexto Dinâmico', () => {
    test('deve atualizar contexto quando automações mudam', async () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      // Enviar mensagem inicial
      const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
      fireEvent.change(input, { target: { value: 'Contexto inicial' } })
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
      
      await waitFor(() => {
        expect(mockCallAI).toHaveBeenCalledWith(
          [{ role: 'user', content: 'Contexto inicial' }],
          expect.stringContaining('Automação de Boas-vindas')
        )
      })
      
      // Simular mudança nas automações
      const novasAutomacoes = [...mockAutomacoes, {
        id: '3',
        nome: 'Nova Automação',
        descricao: 'Adicionada recentemente',
        tipo: 'notificacao' as const,
        status: 'rascunho' as const,
        gatilhoTipo: 'manual' as const,
        gatilhoConfig: {},
        acoes: [],
        criadoEm: '2024-01-20T10:00:00Z',
        atualizadoEm: '2024-01-20T10:00:00Z',
        execucoes: 0,
        ativo: false
      }]
      
      mockGetAutomacoes.mockResolvedValue(novasAutomacoes)
      
      // Enviar nova mensagem
      fireEvent.change(input, { target: { value: 'Contexto atualizado' } })
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
      
      await waitFor(() => {
        expect(mockCallAI).toHaveBeenCalledWith(
          [{ role: 'user', content: 'Contexto atualizado' }],
          expect.stringContaining('Nova Automação')
        )
      })
    })

    test('deve lidar com lista vazia de automações', async () => {
      mockGetAutomacoes.mockResolvedValue([])
      
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
      fireEvent.change(input, { target: { value: 'Sem automações' } })
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
      
      await waitFor(() => {
        const contextArg = mockCallAI.mock.calls[0][1]
        expect(contextArg).toContain('Nenhuma automação encontrada')
      })
    })
  })

  describe('Performance', () => {
    test('deve abrir chat rapidamente', () => {
      const startTime = performance.now()
      
      const { unmount } = render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const endTime = performance.now()
      const openTime = endTime - startTime
      
      expect(openTime).toBeLessThan(100) // Deve abrir em menos de 100ms
      
      unmount()
    })

    test('deve lidar com múltiplas mensagens consecutivas', async () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
      
      // Enviar múltiplas mensagens rapidamente
      for (let i = 0; i < 5; i++) {
        fireEvent.change(input, { target: { value: `Mensagem ${i}` } })
        fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
        
        await waitFor(() => {
          expect(screen.getByText(`Mensagem ${i}`)).toBeInTheDocument()
        })
      }
      
      expect(mockCallAI).toHaveBeenCalledTimes(5)
    })
  })
})
