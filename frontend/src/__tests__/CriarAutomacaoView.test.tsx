import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CriarAutomacaoView } from '../components/views/CriarAutomacaoView'
import * as database from '../lib/database'
import * as gemini from '../lib/gemini'

// Mock das dependências
jest.mock('../lib/database')
jest.mock('../lib/gemini')

const mockGetAutomacoes = database.getAutomacoes as jest.MockedFunction<typeof database.getAutomacoes>
const mockCreateAutomacao = database.createAutomacao as jest.MockedFunction<typeof database.createAutomacao>
const mockUpdateAutomacao = database.updateAutomacao as jest.MockedFunction<typeof database.updateAutomacao>
const mockDeleteAutomacao = database.deleteAutomacao as jest.MockedFunction<typeof database.deleteAutomacao>
const mockCallAI = gemini.callAI as jest.MockedFunction<typeof gemini.callAI>

// Mock de automação de teste
const mockAutomacao: database.Automacao = {
  id: '1',
  nome: 'Automação Teste',
  descricao: 'Descrição da automação',
  tipo: 'mensagem',
  status: 'ativa',
  gatilhoTipo: 'evento',
  gatilhoConfig: { evento: 'cliente_etapa' },
  acoes: [
    {
      tipo: 'enviar_mensagem',
      configuracao: { mensagem: 'Teste' },
      ordem: 1
    }
  ],
  criadoEm: '2024-01-15T10:30:00Z',
  atualizadoEm: '2024-01-15T10:30:00Z',
  execucoes: 10,
  ultimaExecucao: '2024-01-20T14:22:00Z',
  ativo: true
}

describe('CriarAutomacaoView', () => {
  const mockLoggedUser = {
    id: '1',
    nome: 'Gerente Teste',
    email: 'gerente@teste.com',
    cargo: 'gerente'
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetAutomacoes.mockResolvedValue([mockAutomacao])
    mockCallAI.mockResolvedValue('Resposta da IA')
  })

  describe('Renderização e Acesso', () => {
    test('deve renderizar página para gerente', async () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      expect(screen.getByText('Criação de Automações')).toBeInTheDocument()
      expect(screen.getByText('Configure automações para otimizar processos de vendas')).toBeInTheDocument()
      expect(screen.getByText('Assistente IA')).toBeInTheDocument()
    })

    test('deve mostrar acesso restrito para não-gerente', () => {
      const mockVendedor = { ...mockLoggedUser, cargo: 'vendedor' }
      render(<CriarAutomacaoView loggedUser={mockVendedor} />)
      
      expect(screen.getByText('Acesso Restrito')).toBeInTheDocument()
      expect(screen.getByText('Apenas gerentes podem criar automações.')).toBeInTheDocument()
    })

    test('deve carregar automações ao montar', async () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      await waitFor(() => {
        expect(mockGetAutomacoes).toHaveBeenCalledTimes(1)
      })
    })

    test('deve mostrar quantidade de automações na aba gerenciar', async () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      await waitFor(() => {
        expect(screen.getByText('Gerenciar (1)')).toBeInTheDocument()
      })
    })
  })

  describe('Abas e Navegação', () => {
    test('deve alternar entre abas criar e gerenciar', async () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      const abaGerenciar = screen.getByText('Gerenciar (1)')
      fireEvent.click(abaGerenciar)
      
      expect(screen.getByText('Automação Teste')).toBeInTheDocument()
      
      const abaCriar = screen.getByText('Criar Automação')
      fireEvent.click(abaCriar)
      
      expect(screen.getByText('Escolha o tipo de automação')).toBeInTheDocument()
    })

    test('deve mostrar tipos de automação disponíveis', () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      expect(screen.getByText('Mensagem Automática')).toBeInTheDocument()
      expect(screen.getByText('Criação de Tarefas')).toBeInTheDocument()
      expect(screen.getByText('Movimentação de Etapa')).toBeInTheDocument()
      expect(screen.getByText('Notificação')).toBeInTheDocument()
      expect(screen.getByText('E-mail Marketing')).toBeInTheDocument()
      expect(screen.getByText('WhatsApp')).toBeInTheDocument()
    })
  })

  describe('Criação de Automação', () => {
    test('deve abrir editor ao clicar em tipo de automação', () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      const tipoMensagem = screen.getByText('Mensagem Automática')
      fireEvent.click(tipoMensagem)
      
      expect(screen.getByText('Informações Básicas')).toBeInTheDocument()
      expect(screen.getByText('Gatilho')).toBeInTheDocument()
      expect(screen.getByText('Ações')).toBeInTheDocument()
    })

    test('deve preencher formulário corretamente', () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      // Abrir editor
      fireEvent.click(screen.getByText('Mensagem Automática'))
      
      // Preencher nome
      const nomeInput = screen.getByPlaceholderText('Ex: Boas-vindas Novos Clientes')
      fireEvent.change(nomeInput, { target: { value: 'Nova Automação' } })
      expect(nomeInput).toHaveValue('Nova Automação')
      
      // Preencher descrição
      const descricaoTextarea = screen.getByPlaceholderText('Descreva como esta automação funciona...')
      fireEvent.change(descricaoTextarea, { target: { value: 'Descrição teste' } })
      expect(descricaoTextarea).toHaveValue('Descrição teste')
    })

    test('deve adicionar e remover ações', () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      // Abrir editor
      fireEvent.click(screen.getByText('Mensagem Automática'))
      
      // Adicionar ação
      const adicionarAcaoBtn = screen.getByText('Adicionar Ação')
      fireEvent.click(adicionarAcaoBtn)
      
      expect(screen.getByText('Ação 1')).toBeInTheDocument()
      
      // Selecionar tipo de ação
      const tipoSelect = screen.getByDisplayValue('Selecione...')
      fireEvent.change(tipoSelect, { target: { value: 'enviar_mensagem' } })
      
      // Remover ação
      const removerBtn = screen.getByRole('button', { name: /remover/i })
      fireEvent.click(removerBtn)
      
      expect(screen.queryByText('Ação 1')).not.toBeInTheDocument()
    })

    test('deve validar campos obrigatórios ao salvar', async () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      // Abrir editor
      fireEvent.click(screen.getByText('Mensagem Automática'))
      
      // Tentar salvar sem preencher nome
      const salvarBtn = screen.getByText('Criar Automação')
      fireEvent.click(salvarBtn)
      
      // Mock de alert
      const mockAlert = jest.spyOn(window, 'alert').mockImplementation()
      
      expect(mockAlert).toHaveBeenCalledWith('Preencha o nome da automação')
      
      mockAlert.mockRestore()
    })
  })

  describe('Gerenciamento de Automações', () => {
    test('deve listar automações existentes', async () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      // Mudar para aba gerenciar
      fireEvent.click(screen.getByText('Gerenciar (1)'))
      
      await waitFor(() => {
        expect(screen.getByText('Automação Teste')).toBeInTheDocument()
        expect(screen.getByText('Descrição da automação')).toBeInTheDocument()
        expect(screen.getByText('1 ação(ões)')).toBeInTheDocument()
        expect(screen.getByText('10 execuções')).toBeInTheDocument()
      })
    })

    test('deve alternar status da automação', async () => {
      mockUpdateAutomacao.mockResolvedValue(mockAutomacao)
      
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      // Mudar para aba gerenciar
      fireEvent.click(screen.getByText('Gerenciar (1)'))
      
      await waitFor(() => {
        expect(screen.getByText('Automação Teste')).toBeInTheDocument()
      })
      
      // Clicar no botão de pausar
      const pausarBtn = screen.getByTitle('Pausar')
      fireEvent.click(pausarBtn)
      
      await waitFor(() => {
        expect(mockUpdateAutomacao).toHaveBeenCalledWith('1', { status: 'pausada' })
      })
    })

    test('deve editar automação', async () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      // Mudar para aba gerenciar
      fireEvent.click(screen.getByText('Gerenciar (1)'))
      
      await waitFor(() => {
        expect(screen.getByText('Automação Teste')).toBeInTheDocument()
      })
      
      // Clicar no botão de editar
      const editarBtn = screen.getByTitle('Editar')
      fireEvent.click(editarBtn)
      
      // Verificar se o formulário foi preenchido com os dados
      expect(screen.getByDisplayValue('Automação Teste')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Descrição da automação')).toBeInTheDocument()
    })

    test('deve excluir automação com confirmação', async () => {
      mockDeleteAutomacao.mockResolvedValue(true)
      
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      // Mudar para aba gerenciar
      fireEvent.click(screen.getByText('Gerenciar (1)'))
      
      await waitFor(() => {
        expect(screen.getByText('Automação Teste')).toBeInTheDocument()
      })
      
      // Mock de confirm
      const mockConfirm = jest.spyOn(window, 'confirm').mockReturnValue(true)
      const mockAlert = jest.spyOn(window, 'alert').mockImplementation()
      
      // Clicar no botão de excluir
      const excluirBtn = screen.getByTitle('Excluir')
      fireEvent.click(excluirBtn)
      
      expect(mockConfirm).toHaveBeenCalledWith('Tem certeza que deseja excluir esta automação?')
      
      await waitFor(() => {
        expect(mockDeleteAutomacao).toHaveBeenCalledWith('1')
        expect(mockAlert).toHaveBeenCalledWith('Automação excluída com sucesso!')
      })
      
      mockConfirm.mockRestore()
      mockAlert.mockRestore()
    })
  })

  describe('Chat com IA', () => {
    test('deve abrir chat ao clicar no botão Assistente IA', () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      const assistenteBtn = screen.getByText('Assistente IA')
      fireEvent.click(assistenteBtn)
      
      expect(screen.getByText('Assistente de Automações')).toBeInTheDocument()
      expect(screen.getByText('IA especialista em automações de vendas')).toBeInTheDocument()
    })

    test('deve mostrar mensagem de boas-vindas do chat', () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      expect(screen.getByText(/Olá! Sou o assistente de automações da MF Paris/)).toBeInTheDocument()
      expect(screen.getByText('Como posso ajudar você hoje?')).toBeInTheDocument()
    })

    test('deve enviar mensagem para a IA', async () => {
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
      
      expect(screen.getByText('Resposta da IA')).toBeInTheDocument()
    })

    test('deve usar sugestões rápidas', () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const sugestaoBtn = screen.getByText('Como criar automação?')
      fireEvent.click(sugestaoBtn)
      
      const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
      expect(input).toHaveValue('Como criar uma automação de boas-vindas?')
    })

    test('deve limpar conversa', () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const limparBtn = screen.getByTitle('Limpar conversa')
      fireEvent.click(limparBtn)
      
      expect(screen.getByText('Como posso ajudar?')).toBeInTheDocument()
    })

    test('deve abrir chat contextual para automação específica', async () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      // Mudar para aba gerenciar
      fireEvent.click(screen.getByText('Gerenciar (1)'))
      
      await waitFor(() => {
        expect(screen.getByText('Automação Teste')).toBeInTheDocument()
      })
      
      // Clicar no botão de ajuda IA
      const ajudaBtn = screen.getByTitle('Pedir ajuda à IA')
      fireEvent.click(ajudaBtn)
      
      expect(screen.getByText('Assistente de Automações')).toBeInTheDocument()
      expect(mockCallAI).toHaveBeenCalledWith(
        [{ role: 'user', content: 'Olá! Preciso de ajuda com a automação "Automação Teste". Pode me explicar como ela funciona e dar sugestões de melhoria?' }],
        expect.stringContaining('Contexto de Automações da MF Paris')
      )
    })
  })

  describe('Formulário e Validações', () => {
    test('deve selecionar diferentes tipos de gatilho', () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Mensagem Automática'))
      
      // Selecionar gatilho de tempo
      fireEvent.click(screen.getByText('Agendado'))
      
      // Selecionar gatilho de evento
      fireEvent.click(screen.getByText('Baseado em Evento'))
      
      // Selecionar gatilho manual
      fireEvent.click(screen.getByText('Manual'))
    })

    test('deve configurar mensagem para ação de enviar mensagem', () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Mensagem Automática'))
      
      // Adicionar ação
      fireEvent.click(screen.getByText('Adicionar Ação'))
      
      // Selecionar tipo enviar mensagem
      const tipoSelect = screen.getByDisplayValue('Selecione...')
      fireEvent.change(tipoSelect, { target: { value: 'enviar_mensagem' } })
      
      // Preencher mensagem
      const mensagemTextarea = screen.getByPlaceholderText('Digite a mensagem...')
      fireEvent.change(mensagemTextarea, { target: { value: 'Mensagem de teste' } })
      
      expect(mensagemTextarea).toHaveValue('Mensagem de teste')
    })

    test('deve cancelar edição e limpar formulário', () => {
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Mensagem Automática'))
      
      // Preencher algum campo
      const nomeInput = screen.getByPlaceholderText('Ex: Boas-vindas Novos Clientes')
      fireEvent.change(nomeInput, { target: { value: 'Teste' } })
      
      // Cancelar
      const cancelarBtn = screen.getByText('Cancelar')
      fireEvent.click(cancelarBtn)
      
      // Verificar se voltou para a tela inicial
      expect(screen.getByText('Escolha o tipo de automação')).toBeInTheDocument()
    })
  })

  describe('Estados de Carregamento', () => {
    test('deve mostrar loading ao carregar automações', async () => {
      mockGetAutomacoes.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve([mockAutomacao]), 100)))
      
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      // Mudar para aba gerenciar
      fireEvent.click(screen.getByText('Gerenciar (1)'))
      
      expect(screen.getByText('Carregando automações...')).toBeInTheDocument()
      
      await waitFor(() => {
        expect(screen.queryByText('Carregando automações...')).not.toBeInTheDocument()
      })
    })

    test('deve mostrar loading ao salvar automação', async () => {
      mockCreateAutomacao.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(mockAutomacao), 100)))
      
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Mensagem Automática'))
      
      // Preencher nome
      const nomeInput = screen.getByPlaceholderText('Ex: Boas-vindas Novos Clientes')
      fireEvent.change(nomeInput, { target: { value: 'Teste' } })
      
      // Adicionar ação
      fireEvent.click(screen.getByText('Adicionar Ação'))
      
      // Salvar
      const salvarBtn = screen.getByText('Criar Automação')
      fireEvent.click(salvarBtn)
      
      expect(screen.getByText('Salvando...')).toBeInTheDocument()
      
      await waitFor(() => {
        expect(screen.queryByText('Salvando...')).not.toBeInTheDocument()
      })
    })

    test('deve mostrar loading no chat', async () => {
      mockCallAI.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('Resposta'), 100)))
      
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
      const enviarBtn = screen.getByRole('button', { name: /enviar/i })
      
      fireEvent.change(input, { target: { value: 'Teste' } })
      fireEvent.click(enviarBtn)
      
      expect(screen.getByText('Pensando...')).toBeInTheDocument()
      
      await waitFor(() => {
        expect(screen.queryByText('Pensando...')).not.toBeInTheDocument()
      })
    })
  })

  describe('Tratamento de Erros', () => {
    test('deve mostrar erro ao falhar ao carregar automações', async () => {
      mockGetAutomacoes.mockRejectedValue(new Error('Erro de conexão'))
      
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      await waitFor(() => {
        expect(mockGetAutomacoes).toHaveBeenCalled()
      })
      
      // Não deve quebrar a aplicação
      expect(screen.getByText('Criação de Automações')).toBeInTheDocument()
    })

    test('deve mostrar erro ao falhar ao salvar automação', async () => {
      mockCreateAutomacao.mockRejectedValue(new Error('Erro ao salvar'))
      
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Mensagem Automática'))
      
      // Preencher nome
      const nomeInput = screen.getByPlaceholderText('Ex: Boas-vindas Novos Clientes')
      fireEvent.change(nomeInput, { target: { value: 'Teste' } })
      
      // Adicionar ação
      fireEvent.click(screen.getByText('Adicionar Ação'))
      
      const mockAlert = jest.spyOn(window, 'alert').mockImplementation()
      
      // Salvar
      const salvarBtn = screen.getByText('Criar Automação')
      fireEvent.click(salvarBtn)
      
      await waitFor(() => {
        expect(mockAlert).toHaveBeenCalledWith('Erro ao salvar automação')
      })
      
      mockAlert.mockRestore()
    })

    test('deve mostrar erro ao falhar na comunicação com IA', async () => {
      mockCallAI.mockRejectedValue(new Error('Erro na IA'))
      
      render(<CriarAutomacaoView loggedUser={mockLoggedUser} />)
      
      fireEvent.click(screen.getByText('Assistente IA'))
      
      const input = screen.getByPlaceholderText('Digite sua pergunta sobre automações...')
      const enviarBtn = screen.getByRole('button', { name: /enviar/i })
      
      fireEvent.change(input, { target: { value: 'Teste' } })
      fireEvent.click(enviarBtn)
      
      await waitFor(() => {
        expect(screen.getByText(/❌ Desculpe, ocorreu um erro ao processar sua mensagem/)).toBeInTheDocument()
      })
    })
  })
})
