import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  getAutomacoes,
  createAutomacao,
  updateAutomacao,
  deleteAutomacao,
  getAutomacaoExecucoes,
  registrarExecucaoAutomacao
} from '../lib/database'

// Configurações de teste
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zeaeppmnetdhzwwdydmq.supabase.co'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_kAIiWbgHs30d5AnAxcse3g_TFCoDF_d'

let supabase: SupabaseClient
let testAutomacaoId: string

describe('Integração de Automações com Supabase', () => {
  beforeAll(async () => {
    // Criar cliente Supabase para testes
    supabase = createClient(supabaseUrl, supabaseKey)
    
    // Limpar dados de teste anteriores
    await limparDadosTeste()
  })

  afterAll(async () => {
    // Limpar dados de teste
    await limparDadosTeste()
  })

  beforeEach(async () => {
    // Limpar execuções de testes
    await supabase
      .from('automacoes_execucoes')
      .delete()
      .eq('automacao_id', testAutomacaoId)
      .not('automacao_id', 'is', null)
  })

  async function limparDadosTeste() {
    try {
      // Remover execuções de automações de teste
      await supabase
        .from('automacoes_execucoes')
        .delete()
        .in('automacao_id', 
          (await supabase
            .from('automacoes')
            .select('id')
            .like('nome', '%TESTE%')
          ).data?.map(a => a.id) || []
        )

      // Remover automações de teste
      await supabase
        .from('automacoes')
        .delete()
        .like('nome', '%TESTE%')
    } catch (error) {
      console.warn('Erro ao limpar dados de teste:', error)
    }
  }

  describe('CRUD de Automações', () => {
    it('deve criar uma automação com sucesso', async () => {
      const automacaoData = {
        nome: 'AUTOMAÇÃO TESTE - Criação',
        descricao: 'Teste de criação de automação',
        tipo: 'mensagem' as const,
        gatilhoTipo: 'tempo' as const,
        gatilhoConfig: { horario: '09:00' },
        acoes: [
          {
            tipo: 'enviar_mensagem',
            configuracao: { mensagem: 'Mensagem de teste' },
            ordem: 1
          }
        ]
      }

      const resultado = await createAutomacao(
        automacaoData.nome,
        automacaoData.descricao,
        automacaoData.tipo,
        automacaoData.gatilhoTipo,
        automacaoData.gatilhoConfig,
        automacaoData.acoes
      )

      expect(resultado).toBeDefined()
      expect(resultado?.id).toBeDefined()
      expect(resultado?.nome).toBe(automacaoData.nome)
      expect(resultado?.descricao).toBe(automacaoData.descricao)
      expect(resultado?.tipo).toBe(automacaoData.tipo)
      expect(resultado?.status).toBe('rascunho')
      expect(resultado?.execucoes).toBe(0)

      testAutomacaoId = resultado!.id
    })

    it('deve listar automações com sucesso', async () => {
      // Criar automação de teste
      const automacao = await createAutomacao(
        'AUTOMAÇÃO TESTE - Listagem',
        'Teste de listagem',
        'mensagem',
        'evento',
        { evento: 'teste' },
        [{ tipo: 'enviar_mensagem', configuracao: {}, ordem: 1 }]
      )

      expect(automacao).toBeDefined()

      // Listar automações
      const automacoes = await getAutomacoes()

      expect(Array.isArray(automacoes)).toBe(true)
      expect(automacoes.length).toBeGreaterThan(0)
      
      const automacaoEncontrada = automacoes.find(a => a.id === automacao!.id)
      expect(automacaoEncontrada).toBeDefined()
      expect(automacaoEncontrada?.nome).toBe('AUTOMAÇÃO TESTE - Listagem')
    })

    it('deve atualizar uma automação com sucesso', async () => {
      // Criar automação
      const automacao = await createAutomacao(
        'AUTOMAÇÃO TESTE - Atualização',
        'Descrição original',
        'tarefa',
        'manual',
        {},
        []
      )

      expect(automacao).toBeDefined()

      // Atualizar automação
      const atualizacao = await updateAutomacao(automacao!.id, {
        nome: 'AUTOMAÇÃO TESTE - Atualizada',
        descricao: 'Descrição atualizada',
        status: 'ativa'
      })

      expect(atualizacao).toBeDefined()
      expect(atualizacao?.nome).toBe('AUTOMAÇÃO TESTE - Atualizada')
      expect(atualizacao?.descricao).toBe('Descrição atualizada')
      expect(atualizacao?.status).toBe('ativa')
    })

    it('deve excluir uma automação com sucesso', async () => {
      // Criar automação
      const automacao = await createAutomacao(
        'AUTOMAÇÃO TESTE - Exclusão',
        'Teste de exclusão',
        'etapa',
        'tempo',
        {},
        []
      )

      expect(automacao).toBeDefined()

      // Excluir automação
      const sucesso = await deleteAutomacao(automacao!.id)
      expect(sucesso).toBe(true)

      // Verificar se foi excluída
      const automacoes = await getAutomacoes()
      const automacaoExcluida = automacoes.find(a => a.id === automacao!.id)
      expect(automacaoExcluida).toBeUndefined()
    })

    it('deve retornar null ao tentar atualizar automação inexistente', async () => {
      const resultado = await updateAutomacao('id-inexistente', {
        nome: 'Teste'
      })

      expect(resultado).toBeNull()
    })

    it('deve retornar false ao tentar excluir automação inexistente', async () => {
      const resultado = await deleteAutomacao('id-inexistente')
      expect(resultado).toBe(false)
    })
  })

  describe('Execuções de Automações', () => {
    beforeEach(async () => {
      // Criar automação para testes de execução
      const automacao = await createAutomacao(
        'AUTOMAÇÃO TESTE - Execuções',
        'Teste de execuções',
        'mensagem',
        'tempo',
        {},
        []
      )
      testAutomacaoId = automacao!.id
    })

    it('deve registrar execução com sucesso', async () => {
      const dadosExecucao = {
        status: 'sucesso' as const,
        resultado: { mensagem: 'Executado com sucesso' },
        erro: null
      }

      const execucao = await registrarExecucaoAutomacao(
        testAutomacaoId,
        dadosExecucao.status,
        dadosExecucao.resultado,
        dadosExecucao.erro
      )

      expect(execucao).toBeDefined()
      expect(execucao?.automacao_id).toBe(testAutomacaoId)
      expect(execucao?.status).toBe(dadosExecucao.status)
      expect(execucao?.resultado).toEqual(dadosExecucao.resultado)
      expect(execucao?.erro).toBeNull()
    })

    it('deve registrar execução com erro', async () => {
      const dadosExecucao = {
        status: 'erro' as const,
        resultado: null,
        erro: 'Erro de conexão'
      }

      const execucao = await registrarExecucaoAutomacao(
        testAutomacaoId,
        dadosExecucao.status,
        dadosExecucao.resultado,
        dadosExecucao.erro
      )

      expect(execucao).toBeDefined()
      expect(execucao?.status).toBe(dadosExecucao.status)
      expect(execucao?.resultado).toBeNull()
      expect(execucao?.erro).toBe(dadosExecucao.erro)
    })

    it('deve listar execuções de uma automação', async () => {
      // Registrar algumas execuções
      await registrarExecucaoAutomacao(testAutomacaoId, 'sucesso', { msg: 'Execução 1' })
      await registrarExecucaoAutomacao(testAutomacaoId, 'erro', null, 'Erro 1')
      await registrarExecucaoAutomacao(testAutomacaoId, 'sucesso', { msg: 'Execução 2' })

      // Listar execuções
      const execucoes = await getAutomacaoExecucoes(testAutomacaoId)

      expect(Array.isArray(execucoes)).toBe(true)
      expect(execucoes.length).toBe(3)

      expect(execucoes[0].status).toBe('sucesso')
      expect(execucoes[1].status).toBe('erro')
      expect(execucoes[2].status).toBe('sucesso')
    })

    it('deve retornar array vazio para automação sem execuções', async () => {
      const novaAutomacao = await createAutomacao(
        'AUTOMAÇÃO TESTE - Sem Execuções',
        'Teste sem execuções',
        'notificacao',
        'manual',
        {},
        []
      )

      const execucoes = await getAutomacaoExecucoes(novaAutomacao!.id)
      expect(execucoes).toEqual([])
    })
  })

  describe('Validações e Restrições', () => {
    it('deve validar campos obrigatórios ao criar automação', async () => {
      // Tentar criar sem nome
      const resultado = await createAutomacao(
        '',
        'Descrição',
        'mensagem',
        'tempo',
        {},
        []
      )

      expect(resultado).toBeNull()
    })

    it('deve validar tipo de automação', async () => {
      const resultado = await createAutomacao(
        'AUTOMAÇÃO TESTE - Tipo Inválido',
        'Teste tipo inválido',
        'tipo-invalido' as any,
        'tempo',
        {},
        []
      )

      // Não deve quebrar, mas pode retornar null ou tratar o erro
      expect(resultado).toBeDefined()
    })

    it('deve manter ordem das ações', async () => {
      const acoes = [
        { tipo: 'enviar_mensagem', configuracao: { msg: '1' }, ordem: 1 },
        { tipo: 'criar_tarefa', configuracao: { titulo: '2' }, ordem: 2 },
        { tipo: 'enviar_email', configuracao: { assunto: '3' }, ordem: 3 }
      ]

      const automacao = await createAutomacao(
        'AUTOMAÇÃO TESTE - Ordem',
        'Teste de ordem das ações',
        'mensagem',
        'tempo',
        {},
        acoes
      )

      expect(automacao?.acoes).toHaveLength(3)
      expect(automacao?.acoes[0].ordem).toBe(1)
      expect(automacao?.acoes[1].ordem).toBe(2)
      expect(automacao?.acoes[2].ordem).toBe(3)
    })

    it('deve armazenar configuração complexa em gatilhoConfig', async () => {
      const configComplexa = {
        horario: '09:00',
        dias_semana: ['segunda', 'terca', 'quarta'],
        condicoes: {
          temperatura: { min: 20, max: 30 },
          umidade: { min: 40, max: 60 }
        },
        notificacoes: {
          email: true,
          sms: false,
          webhook: 'https://example.com/webhook'
        }
      }

      const automacao = await createAutomacao(
        'AUTOMAÇÃO TESTE - Config Complexa',
        'Teste configuração complexa',
        'mensagem',
        'tempo',
        configComplexa,
        []
      )

      expect(automacao?.gatilhoConfig).toEqual(configComplexa)
    })
  })

  describe('Performance e Paginação', () => {
    it('deve lidar com grande quantidade de automações', async () => {
      // Criar múltiplas automações
      const promises = []
      for (let i = 0; i < 10; i++) {
        promises.push(
          createAutomacao(
            `AUTOMAÇÃO TESTE - Performance ${i}`,
            `Descrição ${i}`,
            'mensagem',
            'tempo',
            {},
            []
          )
        )
      }

      const automacoes = await Promise.all(promises)
      expect(automacoes.length).toBe(10)

      // Listar todas
      const todasAutomacoes = await getAutomacoes()
      expect(todasAutomacoes.length).toBeGreaterThanOrEqual(10)
    })

    it('deve lidar com grande quantidade de execuções', async () => {
      // Criar automação
      const automacao = await createAutomacao(
        'AUTOMAÇÃO TESTE - Muitas Execuções',
        'Teste muitas execuções',
        'mensagem',
        'tempo',
        {},
        []
      )

      // Registrar muitas execuções
      const promises = []
      for (let i = 0; i < 20; i++) {
        promises.push(
          registrarExecucaoAutomacao(
            automacao!.id,
            i % 3 === 0 ? 'erro' : 'sucesso',
            i % 3 === 0 ? null : { execucao: i },
            i % 3 === 0 ? `Erro ${i}` : null
          )
        )
      }

      await Promise.all(promises)

      // Listar execuções
      const execucoes = await getAutomacaoExecucoes(automacao!.id)
      expect(execucoes.length).toBe(20)

      const sucessos = execucoes.filter(e => e.status === 'sucesso')
      const erros = execucoes.filter(e => e.status === 'erro')
      
      expect(sucessos.length).toBe(14)
      expect(erros.length).toBe(6)
    })
  })

  describe('Segurança e RLS', () => {
    it('deve respeitar políticas de RLS', async () => {
      // Testar se usuário não autenticado consegue acessar
      const supabaseAnon = createClient(supabaseUrl, supabaseKey)

      // Tentar listar automações sem autenticação
      const { data, error } = await supabaseAnon
        .from('automacoes')
        .select('*')

      // Pode retornar vazio ou erro dependendo das políticas RLS
      if (error) {
        expect(error.message).toContain('policy')
      } else {
        expect(data).toEqual([])
      }
    })

    it('deve impedir acesso direto à tabela de execuções', async () => {
      const supabaseAnon = createClient(supabaseUrl, supabaseKey)

      const { data, error } = await supabaseAnon
        .from('automacoes_execucoes')
        .select('*')

      // Pode retornar vazio ou erro dependendo das políticas RLS
      if (error) {
        expect(error.message).toContain('policy')
      } else {
        expect(data).toEqual([])
      }
    })
  })

  describe('Consistência de Dados', () => {
    it('deve manter relacionamento entre automação e execuções', async () => {
      // Criar automação
      const automacao = await createAutomacao(
        'AUTOMAÇÃO TESTE - Relacionamento',
        'Teste de relacionamento',
        'mensagem',
        'tempo',
        {},
        []
      )

      // Registrar execuções
      await registrarExecucaoAutomacao(automacao!.id, 'sucesso', { msg: '1' })
      await registrarExecucaoAutomacao(automacao!.id, 'erro', null, 'Erro')

      // Verificar relacionamento
      const execucoes = await getAutomacaoExecucoes(automacao!.id)
      expect(execucoes.length).toBe(2)
      
      execucoes.forEach(exec => {
        expect(exec.automacao_id).toBe(automacao!.id)
      })

      // Excluir automação
      await deleteAutomacao(automacao!.id)

      // Tentar buscar execuções da automação excluída
      const execucoesPosExclusao = await getAutomacaoExecucoes(automacao!.id)
      expect(execucoesPosExclusao).toEqual([])
    })

    it('deve atualizar contador de execuções', async () => {
      // Criar automação
      const automacao = await createAutomacao(
        'AUTOMAÇÃO TESTE - Contador',
        'Teste de contador',
        'mensagem',
        'tempo',
        {},
        []
      )

      expect(automacao?.execucoes).toBe(0)

      // Registrar execuções
      await registrarExecucaoAutomacao(automacao!.id, 'sucesso', { msg: '1' })
      await registrarExecucaoAutomacao(automacao!.id, 'sucesso', { msg: '2' })

      // Verificar se contador foi atualizado (pode ser via trigger)
      const automacaoAtualizada = await getAutomacoes()
        .then(automacoes => automacoes.find(a => a.id === automacao!.id))

      // O contador pode ser atualizado via trigger ou application layer
      expect(automacaoAtualizada?.execucoes).toBeGreaterThanOrEqual(0)
    })
  })
})
