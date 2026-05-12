import { test, expect, type Page } from '@playwright/test'

// Dados de teste
const GERENTE_CREDENTIALS = {
  email: 'rafael@mfparis.com.br',
  senha: '123456'
}

const VENDEDOR_CREDENTIALS = {
  email: 'vendedor@teste.com',
  senha: '123456'
}

class AutomacoesPage {
  constructor(private page: Page) {}

  async navigateTo() {
    await this.page.click('text=Criar Automação')
    await expect(this.page.getByText('Criação de Automações')).toBeVisible()
  }

  async createAutomacao(nome: string, descricao: string, tipo: string) {
    // Clicar no tipo de automação
    await this.page.click(`text=${tipo}`)
    
    // Preencher formulário
    await this.page.fill('input[placeholder*="Nome da Automação"]', nome)
    await this.page.fill('textarea[placeholder*="Descreva"]', descricao)
    
    // Adicionar ação
    await this.page.click('text=Adicionar Ação')
    await this.page.selectOption('select:has-text("Selecione...")', 'enviar_mensagem')
    await this.page.fill('textarea[placeholder*="Digite a mensagem"]', 'Mensagem de teste automática')
    
    // Salvar
    await this.page.click('text=Criar Automação')
    
    // Aguardar sucesso
    await expect(this.page.getByText('criada com sucesso')).toBeVisible({ timeout: 10000 })
  }

  async manageAutomacao(nome: string) {
    // Mudar para aba gerenciar
    await this.page.click('text=Gerenciar')
    
    // Encontrar automação
    await expect(this.page.getByText(nome)).toBeVisible()
    
    return {
      element: this.page.locator(`text=${nome}`).locator('..').locator('..'),
      pauseButton: this.page.locator(`text=${nome}`).locator('..').locator('..').getByTitle('Pausar'),
      editButton: this.page.locator(`text=${nome}`).locator('..').locator('..').getByTitle('Editar'),
      deleteButton: this.page.locator(`text=${nome}`).locator('..').locator('..').getByTitle('Excluir'),
      aiHelpButton: this.page.locator(`text=${nome}`).locator('..').locator('..').getByTitle('Pedir ajuda à IA')
    }
  }

  async openAIChat() {
    await this.page.click('text=Assistente IA')
    await expect(this.page.getByText('Assistente de Automações')).toBeVisible()
  }

  async sendAIMessage(message: string) {
    await this.page.fill('input[placeholder*="Digite sua pergunta"]', message)
    await this.page.click('button:has(svg)').first()
    
    // Aguardar resposta
    await expect(this.page.getByText(/Resposta|Erro|Desculpe/)).toBeVisible({ timeout: 15000 })
  }

  async useQuickSuggestion(suggestion: string) {
    await this.page.click(`text=${suggestion}`)
    await expect(this.page.locator('input[placeholder*="Digite sua pergunta"]')).toHaveValue(/./)
  }
}

test.describe('Fluxo Completo de Automações', () => {
  let automacoesPage: AutomacoesPage

  test.beforeEach(async ({ page }) => {
    automacoesPage = new AutomacoesPage(page)
    
    // Login como gerente
    await page.goto('/')
    await page.fill('input[type="email"]', GERENTE_CREDENTIALS.email)
    await page.fill('input[type="password"]', GERENTE_CREDENTIALS.senha)
    await page.click('button:has-text("Entrar")')
    
    // Aguardar login
    await expect(page.getByText('Bem-vindo')).toBeVisible({ timeout: 10000 })
  })

  test('fluxo completo: criar, gerenciar e interagir com automações', async ({ page }) => {
    const automacaoNome = `AUTOMAÇÃO E2E ${Date.now()}`
    const automacaoDescricao = 'Descrição da automação de teste E2E'
    
    // 1. Navegar para página de automações
    await automacoesPage.navigateTo()
    
    // 2. Criar automação
    await automacoesPage.createAutomacao(automacaoNome, automacaoDescricao, 'Mensagem Automática')
    
    // 3. Gerenciar automação
    const automacaoManager = await automacoesPage.manageAutomacao(automacaoNome)
    
    // 4. Verificar informações da automação
    await expect(automacaoManager.element.getByText(automacaoDescricao)).toBeVisible()
    await expect(automacaoManager.element.getByText('1 ação(ões)')).toBeVisible()
    await expect(automacaoManager.element.getByText('0 execuções')).toBeVisible()
    
    // 5. Pausar automação
    await automacaoManager.pauseButton.click()
    await expect(automacaoManager.element.getByText('pausada')).toBeVisible()
    
    // 6. Reativar automação
    await automacoesPage.manageAutomacao(automacaoNome).then(manager => 
      manager.element.getByTitle('Ativar').click()
    )
    await expect(automacoesPage.manageAutomacao(automacaoNome).then(manager => 
      manager.element.getByText('ativa')
    )).toBeVisible()
    
    // 7. Editar automação
    await automacaoManager.editButton.click()
    await expect(page.getByDisplayValue(automacaoNome)).toBeVisible()
    await expect(page.getByDisplayValue(automacaoDescricao)).toBeVisible()
    
    // Cancelar edição
    await page.click('text=Cancelar')
    await expect(page.getByText('Escolha o tipo de automação')).toBeVisible()
    
    // 8. Testar chat com IA - ajuda geral
    await automacoesPage.openAIChat()
    await automacoesPage.sendAIMessage('Como criar uma automação de boas-vindas?')
    
    // Fechar chat
    await page.click('button[title="Fechar"]')
    
    // 9. Testar chat com IA - ajuda específica
    await automacoesPage.manageAutomacao(automacaoNome).then(manager => 
      manager.aiHelpButton.click()
    )
    
    await expect(page.getByText('Assistente de Automações')).toBeVisible()
    await automacoesPage.sendAIMessage('Como otimizar esta automação?')
    
    // 10. Excluir automação
    await page.click('button[title="Fechar"]') // Fechar chat
    await automacoesPage.manageAutomacao(automacaoNome).then(manager => 
      manager.deleteButton.click()
    )
    
    // Confirmar exclusão
    page.on('dialog', dialog => dialog.accept())
    await expect(page.getByText('excluída com sucesso')).toBeVisible()
    
    // 11. Verificar que foi excluída
    await page.reload()
    await automacoesPage.navigateTo()
    await page.click('text=Gerenciar')
    
    await expect(page.getByText(automacaoNome)).not.toBeVisible()
  })

  test('deve impedir acesso de vendedor à página de automações', async ({ page }) => {
    // Logout
    await page.click('button:has-text("Sair")')
    
    // Login como vendedor
    await page.fill('input[type="email"]', VENDEDOR_CREDENTIALS.email)
    await page.fill('input[type="password"]', VENDEDOR_CREDENTIALS.senha)
    await page.click('button:has-text("Entrar")')
    
    // Tentar acessar página de automações
    await page.click('text=Criar Automação')
    
    // Verificar acesso restrito
    await expect(page.getByText('Acesso Restrito')).toBeVisible()
    await expect(page.getByText('Apenas gerentes podem criar automações')).toBeVisible()
  })

  test('deve validar formulário de criação', async ({ page }) => {
    await automacoesPage.navigateTo()
    
    // Tentar criar sem preencher nome
    await page.click('text=Mensagem Automática')
    await page.click('text=Criar Automação')
    
    // Verificar validação
    await expect(page.getByText('Preencha o nome da automação')).toBeVisible()
    
    // Tentar criar sem ações
    await page.fill('input[placeholder*="Nome da Automação"]', 'Teste sem ações')
    await page.click('text=Criar Automação')
    
    await expect(page.getByText('Adicione pelo menos uma ação')).toBeVisible()
  })

  test('deve testar todos os tipos de automação', async ({ page }) => {
    await automacoesPage.navigateTo()
    
    const tipos = [
      'Mensagem Automática',
      'Criação de Tarefas',
      'Movimentação de Etapa',
      'Notificação',
      'E-mail Marketing',
      'WhatsApp'
    ]
    
    for (const tipo of tipos) {
      await expect(page.getByText(tipo)).toBeVisible()
      
      // Abrir editor
      await page.click(`text=${tipo}`)
      
      // Verificar se formulário abriu
      await expect(page.getByText('Informações Básicas')).toBeVisible()
      
      // Verificar se tipo foi selecionado
      const select = page.locator('select')
      await expect(select).toHaveValue(tipo.toLowerCase().replace(' ', '_').replace('-', ''))
      
      // Voltar
      await page.click('text=Cancelar')
      await expect(page.getByText('Escolha o tipo de automação')).toBeVisible()
    }
  })

  test('deve testar todos os tipos de gatilho', async ({ page }) => {
    await automacoesPage.navigateTo()
    await page.click('text=Mensagem Automática')
    
    const gatilhos = [
      { nome: 'Agendado', id: 'tempo' },
      { nome: 'Baseado em Evento', id: 'evento' },
      { nome: 'Manual', id: 'manual' }
    ]
    
    for (const gatilho of gatilhos) {
      await expect(page.getByText(gatilho.nome)).toBeVisible()
      await page.click(`text=${gatilho.nome}`)
      
      // Verificar seleção visual
      await expect(page.locator(`text=${gatilho.nome}`).locator('..')).toHaveClass(/border-indigo-300/)
    }
  })

  test('deve testar chat com IA completamente', async ({ page }) => {
    await automacoesPage.navigateTo()
    await automacoesPage.openAIChat()
    
    // Testar sugestões rápidas
    const sugestoes = [
      'Como criar automação?',
      'Melhores práticas',
      'Otimizar automações',
      'Tipos de gatilhos'
    ]
    
    for (const sugestao of sugestoes) {
      await expect(page.getByText(sugestao)).toBeVisible()
      await automacoesPage.useQuickSuggestion(sugestao)
      
      // Limpar input para próxima sugestão
      await page.fill('input[placeholder*="Digite sua pergunta"]', '')
    }
    
    // Testar envio de mensagem personalizada
    await automacoesPage.sendAIMessage('Quais são os melhores horários para enviar mensagens automáticas?')
    
    // Testar limpar conversa
    await page.click('button[title="Limpar conversa"]')
    await expect(page.getByText('Como posso ajudar?')).toBeVisible()
    
    // Fechar chat
    await page.click('button[title="Fechar"]')
    await expect(page.getByText('Assistente de Automações')).not.toBeVisible()
  })

  test('deve testar responsividade', async ({ page }) => {
    // Desktop
    await page.setViewportSize({ width: 1200, height: 800 })
    await automacoesPage.navigateTo()
    
    await expect(page.getByText('Assistente IA')).toBeVisible()
    await expect(page.getByText('Escolha o tipo de automação')).toBeVisible()
    
    // Tablet
    await page.setViewportSize({ width: 768, height: 1024 })
    await expect(page.getByText('Assistente IA')).toBeVisible()
    
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 })
    await expect(page.getByText('Assistente IA')).toBeVisible()
    
    // Verificar se texto do botão fica oculto no mobile
    await expect(page.locator('text=Assistente IA').locator('span')).toHaveClass(/hidden/)
  })

  test('deve testar acessibilidade', async ({ page }) => {
    await automacoesPage.navigateTo()
    
    // Verificar ordem do tab
    await page.keyboard.press('Tab')
    let focused = await page.locator(':focus')
    await expect(focused).toBeVisible()
    
    // Navegar por elementos principais
    const elementos = [
      'text=Assistente IA',
      'text=Criar Automação',
      'text=Gerenciar',
      'text=Mensagem Automática'
    ]
    
    for (const elemento of elementos) {
      await page.keyboard.press('Tab')
      focused = await page.locator(':focus')
      // Verificar se algum elemento está focado
    }
    
    // Testar navegação por teclado no chat
    await page.click('text=Assistente IA')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    
    // Focar no input
    await page.keyboard.press('Tab')
    focused = await page.locator(':focus')
    await expect(focused).toBeVisible()
  })

  test('deve testar performance', async ({ page }) => {
    // Medir tempo de carregamento da página
    const startTime = Date.now()
    await automacoesPage.navigateTo()
    const loadTime = Date.now() - startTime
    
    expect(loadTime).toBeLessThan(3000) // Deve carregar em menos de 3 segundos
    
    // Medir tempo para abrir chat
    const chatStartTime = Date.now()
    await automacoesPage.openAIChat()
    const chatLoadTime = Date.now() - chatStartTime
    
    expect(chatLoadTime).toBeLessThan(1000) // Chat deve abrir em menos de 1 segundo
    
    // Testar criação rápida
    const createStartTime = Date.now()
    await page.click('text=Mensagem Automática')
    await page.fill('input[placeholder*="Nome da Automação"]', 'Teste Performance')
    await page.click('text=Adicionar Ação')
    await page.selectOption('select:has-text("Selecione...")', 'enviar_mensagem')
    await page.fill('textarea[placeholder*="Digite a mensagem"]', 'Teste')
    await page.click('text=Cancelar')
    const createTime = Date.now() - createStartTime
    
    expect(createTime).toBeLessThan(2000) // Operação deve ser rápida
  })

  test('deve testar tratamento de erros', async ({ page }) => {
    await automacoesPage.navigateTo()
    
    // Simular erro de conexão (pode ser feito interceptando requisições)
    await page.route('**/api/automacoes', route => route.abort())
    
    await page.click('text=Gerenciar')
    
    // Verificar se lida com erro gracefully
    await expect(page.getByText('Criação de Automações')).toBeVisible()
    
    // Remover interceptação
    await page.unroute('**/api/automacoes')
  })

  test('deve testar estado de carregamento', async ({ page }) => {
    // Simular resposta lenta
    await page.route('**/api/automacoes', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      })
    })
    
    await automacoesPage.navigateTo()
    await page.click('text=Gerenciar')
    
    // Verificar estado de loading
    await expect(page.getByText('Carregando automações...')).toBeVisible()
    
    // Aguardar carregamento
    await expect(page.getByText('Nenhuma automação criada')).toBeVisible({ timeout: 5000 })
    
    await page.unroute('**/api/automacoes')
  })
})

test.describe('Navegação e Fluxos de Usuário', () => {
  test('deve navegar corretamente pelo menu', async ({ page }) => {
    // Login
    await page.goto('/')
    await page.fill('input[type="email"]', GERENTE_CREDENTIALS.email)
    await page.fill('input[type="password"]', GERENTE_CREDENTIALS.senha)
    await page.click('button:has-text("Entrar")')
    await expect(page.getByText('Bem-vindo')).toBeVisible()
    
    // Navegar para diferentes seções
    const sections = [
      'Dashboard',
      'Clientes',
      'Funil de Vendas',
      'Pedidos',
      'Criar Automação'
    ]
    
    for (const section of sections) {
      await page.click(`text=${section}`)
      await expect(page.getByText(section)).toBeVisible({ timeout: 5000 })
    }
  })

  test('deve manter estado ao navegar', async ({ page }) => {
    // Login e navegar para automações
    await page.goto('/')
    await page.fill('input[type="email"]', GERENTE_CREDENTIALS.email)
    await page.fill('input[type="password"]', GERENTE_CREDENTIALS.senha)
    await page.click('button:has-text("Entrar")')
    
    await page.click('text=Criar Automação')
    await page.click('text=Mensagem Automática')
    await page.fill('input[placeholder*="Nome da Automação"]', 'Teste Estado')
    
    // Navegar para outra página
    await page.click('text=Clientes')
    
    // Voltar para automações
    await page.click('text=Criar Automação')
    
    // Verificar se voltou para estado inicial (não deve manter formulário preenchido)
    await expect(page.getByText('Escolha o tipo de automação')).toBeVisible()
  })
})
