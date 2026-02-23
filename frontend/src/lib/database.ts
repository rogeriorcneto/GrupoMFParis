import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type {
  Cliente, Interacao, Tarefa, Produto, Pedido, Vendedor,
  Template, TemplateMsg, Cadencia, CadenciaStep, Campanha,
  JobAutomacao, Atividade, Notificacao, HistoricoEtapa, ItemPedido
} from '../types'

// ============================================
// Helpers: converter snake_case (DB) ↔ camelCase (frontend)
// ============================================

function clienteFromDb(row: any): Cliente {
  return {
    id: row.id,
    razaoSocial: row.razao_social,
    nomeFantasia: row.nome_fantasia || '',
    cnpj: row.cnpj || '',
    contatoNome: row.contato_nome || '',
    contatoTelefone: row.contato_telefone || '',
    contatoEmail: row.contato_email || '',
    endereco: row.endereco || '',
    etapa: row.etapa,
    etapaAnterior: row.etapa_anterior || '',
    dataEntradaEtapa: row.data_entrada_etapa || '',
    vendedorId: row.vendedor_id,
    score: row.score || 0,
    valorEstimado: row.valor_estimado || 0,
    produtosInteresse: row.produtos_interesse || [],
    ultimaInteracao: row.ultima_interacao || '',
    diasInativo: row.dias_inativo || 0,
    dataEnvioAmostra: row.data_envio_amostra || '',
    statusAmostra: row.status_amostra || '',
    dataHomologacao: row.data_homologacao || '',
    proximoPedidoPrevisto: row.proximo_pedido_previsto || '',
    valorProposta: row.valor_proposta || 0,
    dataProposta: row.data_proposta || '',
    statusEntrega: row.status_entrega || '',
    dataUltimoPedido: row.data_ultimo_pedido || '',
    motivoPerda: row.motivo_perda || '',
    categoriaPerda: row.categoria_perda || '',
    dataPerda: row.data_perda || '',
    origemLead: row.origem_lead || '',
    notas: row.notas || '',
    historicoEtapas: [],
  }
}

function clienteToDb(c: Partial<Cliente>): any {
  const row: any = {}
  if (c.razaoSocial !== undefined) row.razao_social = c.razaoSocial
  if (c.nomeFantasia !== undefined) row.nome_fantasia = c.nomeFantasia
  if (c.cnpj !== undefined) row.cnpj = c.cnpj
  if (c.contatoNome !== undefined) row.contato_nome = c.contatoNome
  if (c.contatoTelefone !== undefined) row.contato_telefone = c.contatoTelefone
  if (c.contatoEmail !== undefined) row.contato_email = c.contatoEmail
  if (c.endereco !== undefined) row.endereco = c.endereco
  if (c.etapa !== undefined) row.etapa = c.etapa
  if (c.etapaAnterior !== undefined) row.etapa_anterior = c.etapaAnterior
  if (c.dataEntradaEtapa !== undefined) row.data_entrada_etapa = c.dataEntradaEtapa
  if (c.vendedorId !== undefined) row.vendedor_id = c.vendedorId
  if (c.score !== undefined) row.score = c.score
  if (c.valorEstimado !== undefined) row.valor_estimado = c.valorEstimado
  if (c.produtosInteresse !== undefined) row.produtos_interesse = c.produtosInteresse
  if (c.ultimaInteracao !== undefined) row.ultima_interacao = c.ultimaInteracao || null
  if (c.diasInativo !== undefined) row.dias_inativo = c.diasInativo
  if (c.dataEnvioAmostra !== undefined) row.data_envio_amostra = c.dataEnvioAmostra || null
  if (c.statusAmostra !== undefined) row.status_amostra = c.statusAmostra
  if (c.dataHomologacao !== undefined) row.data_homologacao = c.dataHomologacao || null
  if (c.proximoPedidoPrevisto !== undefined) row.proximo_pedido_previsto = c.proximoPedidoPrevisto || null
  if (c.valorProposta !== undefined) row.valor_proposta = c.valorProposta
  if (c.dataProposta !== undefined) row.data_proposta = c.dataProposta || null
  if (c.statusEntrega !== undefined) row.status_entrega = c.statusEntrega
  if (c.dataUltimoPedido !== undefined) row.data_ultimo_pedido = c.dataUltimoPedido || null
  if (c.motivoPerda !== undefined) row.motivo_perda = c.motivoPerda
  if (c.categoriaPerda !== undefined) row.categoria_perda = c.categoriaPerda
  if (c.dataPerda !== undefined) row.data_perda = c.dataPerda || null
  if (c.origemLead !== undefined) row.origem_lead = c.origemLead
  if (c.notas !== undefined) row.notas = c.notas
  return row
}

function produtoFromDb(row: any): Produto {
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao || '',
    categoria: row.categoria,
    preco: Number(row.preco),
    unidade: row.unidade,
    foto: row.foto || '',
    sku: row.sku,
    estoque: row.estoque,
    pesoKg: row.peso_kg != null ? Number(row.peso_kg) : undefined,
    margemLucro: row.margem_lucro != null ? Number(row.margem_lucro) : undefined,
    ativo: row.ativo,
    destaque: row.destaque,
    dataCadastro: row.created_at ? row.created_at.split('T')[0] : '',
  }
}

function vendedorFromDb(row: any): Vendedor {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    telefone: row.telefone || '',
    cargo: row.cargo,
    avatar: row.avatar || '',
    metaVendas: Number(row.meta_vendas) || 0,
    metaLeads: row.meta_leads || 0,
    metaConversao: Number(row.meta_conversao) || 0,
    ativo: row.ativo,
    usuario: row.email, // usuario = email no Supabase Auth
    senha: '', // Senha é gerenciada pelo Supabase Auth, não armazenamos aqui
  }
}

function interacaoFromDb(row: any): Interacao {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    tipo: row.tipo,
    assunto: row.assunto || '',
    descricao: row.descricao || '',
    data: row.created_at || '',
    automatico: row.automatico || false,
  }
}

function tarefaFromDb(row: any): Tarefa {
  return {
    id: row.id,
    titulo: row.titulo,
    descricao: row.descricao || '',
    data: row.data,
    hora: row.hora || '',
    tipo: row.tipo,
    status: row.status,
    prioridade: row.prioridade,
    clienteId: row.cliente_id,
    vendedorId: row.vendedor_id,
  }
}

function pedidoFromDb(row: any, itens: any[]): Pedido {
  return {
    id: row.id,
    numero: row.numero,
    clienteId: row.cliente_id,
    vendedorId: row.vendedor_id,
    observacoes: row.observacoes || '',
    status: row.status,
    itens: itens.map(i => ({
      produtoId: i.produto_id,
      nomeProduto: i.nome_produto,
      sku: i.sku || '',
      unidade: i.unidade,
      preco: Number(i.preco),
      quantidade: i.quantidade,
    })),
    totalValor: Number(row.total_valor),
    dataCriacao: row.data_criacao,
    dataEnvio: row.data_envio || '',
  }
}

function templateFromDb(row: any): Template {
  return {
    id: row.id,
    nome: row.nome,
    canal: row.canal,
    etapa: row.etapa || '',
    assunto: row.assunto,
    corpo: row.corpo,
  }
}

function templateMsgFromDb(row: any): TemplateMsg {
  return {
    id: row.id,
    canal: row.canal,
    nome: row.nome,
    conteudo: row.conteudo,
  }
}

function cadenciaFromDb(row: any, steps: any[]): Cadencia {
  return {
    id: row.id,
    nome: row.nome,
    pausarAoResponder: row.pausar_ao_responder,
    steps: steps
      .filter(s => s.cadencia_id === row.id)
      .sort((a: any, b: any) => a.ordem - b.ordem)
      .map((s: any) => ({
        id: s.id,
        canal: s.canal,
        delayDias: s.delay_dias,
        templateId: s.template_id,
      })),
  }
}

function campanhaFromDb(row: any): Campanha {
  return {
    id: row.id,
    nome: row.nome,
    cadenciaId: row.cadencia_id,
    etapa: row.etapa || '',
    minScore: row.min_score || 0,
    diasInativoMin: row.dias_inativo_min || 0,
    status: row.status,
  }
}

function jobFromDb(row: any): JobAutomacao {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    canal: row.canal,
    tipo: row.tipo,
    status: row.status,
    agendadoPara: row.agendado_para,
    templateId: row.template_id,
    campanhaId: row.campanha_id,
  }
}

function atividadeFromDb(row: any): Atividade {
  return {
    id: row.id,
    tipo: row.tipo,
    descricao: row.descricao,
    vendedorNome: row.vendedor_nome || 'Sistema',
    timestamp: row.created_at,
  }
}

function notificacaoFromDb(row: any): Notificacao {
  return {
    id: row.id,
    tipo: row.tipo,
    titulo: row.titulo,
    mensagem: row.mensagem,
    lida: row.lida,
    clienteId: row.cliente_id,
    timestamp: row.created_at,
  }
}

function historicoFromDb(row: any): HistoricoEtapa {
  return {
    etapa: row.etapa,
    data: row.data,
    de: row.etapa_anterior || '',
  }
}

// ============================================
// AUTH
// ============================================

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function getLoggedVendedor(): Promise<Vendedor | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('vendedores')
    .select('*')
    .eq('auth_id', user.id)
    .single()
  if (error || !data) return null
  return vendedorFromDb(data)
}

// ============================================
// VENDEDORES
// ============================================

export async function fetchVendedores(): Promise<Vendedor[]> {
  const { data, error } = await supabase.from('vendedores').select('*').order('id')
  if (error) throw error
  return (data || []).map(vendedorFromDb)
}

export async function insertVendedor(v: Omit<Vendedor, 'id'>): Promise<Vendedor> {
  const { data, error } = await supabase.from('vendedores').insert({
    nome: v.nome, email: v.email, telefone: v.telefone,
    cargo: v.cargo, avatar: v.avatar,
    meta_vendas: v.metaVendas, meta_leads: v.metaLeads, meta_conversao: v.metaConversao,
    ativo: v.ativo,
  }).select().single()
  if (error) throw error
  return vendedorFromDb(data)
}

// Cria um usuário no Supabase Auth + insere na tabela vendedores com auth_id
export async function createVendedorWithAuth(
  email: string,
  password: string,
  vendedorData: Omit<Vendedor, 'id' | 'usuario' | 'senha'>
): Promise<Vendedor> {
  // Usar um cliente separado para o signUp, para não deslogar o gerente atual
  const tempClient = createClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    { auth: { storageKey: 'sb-temp-signup', persistSession: false } }
  )

  // 1. Criar o auth user
  const { data: authData, error: authError } = await tempClient.auth.signUp({
    email,
    password,
    options: { data: { nome: vendedorData.nome, cargo: vendedorData.cargo } }
  })
  if (authError) throw new Error(`Erro ao criar login: ${authError.message}`)
  if (!authData.user) throw new Error('Erro inesperado ao criar usuário')

  // 2. Inserir na tabela vendedores COM auth_id
  const { data, error } = await supabase.from('vendedores').insert({
    auth_id: authData.user.id,
    nome: vendedorData.nome, email, telefone: vendedorData.telefone,
    cargo: vendedorData.cargo, avatar: vendedorData.avatar,
    meta_vendas: vendedorData.metaVendas, meta_leads: vendedorData.metaLeads,
    meta_conversao: vendedorData.metaConversao, ativo: vendedorData.ativo,
  }).select().single()
  if (error) throw new Error(`Erro ao salvar vendedor: ${error.message}`)
  return vendedorFromDb(data)
}

export async function updateVendedor(id: number, v: Partial<Vendedor>): Promise<void> {
  const row: any = {}
  if (v.nome !== undefined) row.nome = v.nome
  if (v.email !== undefined) row.email = v.email
  if (v.telefone !== undefined) row.telefone = v.telefone
  if (v.cargo !== undefined) row.cargo = v.cargo
  if (v.avatar !== undefined) row.avatar = v.avatar
  if (v.metaVendas !== undefined) row.meta_vendas = v.metaVendas
  if (v.metaLeads !== undefined) row.meta_leads = v.metaLeads
  if (v.metaConversao !== undefined) row.meta_conversao = v.metaConversao
  if (v.ativo !== undefined) row.ativo = v.ativo
  const { error } = await supabase.from('vendedores').update(row).eq('id', id)
  if (error) throw error
}

// ============================================
// CLIENTES
// ============================================

export async function fetchClientes(): Promise<Cliente[]> {
  const { data, error } = await supabase.from('clientes').select('*').order('id').range(0, 9999)
  if (error) throw error
  const clientes = (data || []).map(clienteFromDb)

  // Buscar histórico de etapas para todos os clientes
  const { data: hist } = await supabase.from('historico_etapas').select('*').order('data').range(0, 49999)
  if (hist) {
    const histMap = new Map<number, HistoricoEtapa[]>()
    hist.forEach((h: any) => {
      const arr = histMap.get(h.cliente_id) || []
      arr.push(historicoFromDb(h))
      histMap.set(h.cliente_id, arr)
    })
    clientes.forEach(c => { c.historicoEtapas = histMap.get(c.id) || [] })
  }

  return clientes
}

export async function insertCliente(c: Omit<Cliente, 'id'>): Promise<Cliente> {
  const row = clienteToDb(c)
  const { data, error } = await supabase.from('clientes').insert(row).select().single()
  if (error) throw error
  return clienteFromDb(data)
}

export async function insertClientesBatch(clientes: Omit<Cliente, 'id'>[]): Promise<Cliente[]> {
  const BATCH_SIZE = 100
  const allSaved: Cliente[] = []
  for (let i = 0; i < clientes.length; i += BATCH_SIZE) {
    const batch = clientes.slice(i, i + BATCH_SIZE).map(c => clienteToDb(c))
    const { data, error } = await supabase.from('clientes').insert(batch).select()
    if (error) throw error
    if (data) allSaved.push(...data.map(clienteFromDb))
  }
  return allSaved
}

export async function updateCliente(id: number, c: Partial<Cliente>): Promise<void> {
  const row = clienteToDb(c)
  row.updated_at = new Date().toISOString()
  const { error } = await supabase.from('clientes').update(row).eq('id', id)
  if (error) throw error
}

export async function deleteCliente(id: number): Promise<void> {
  // Cascade: delete related data first
  await supabase.from('historico_etapas').delete().eq('cliente_id', id)
  await supabase.from('interacoes').delete().eq('cliente_id', id)
  await supabase.from('tarefas').delete().eq('cliente_id', id)
  // Delete pedidos and their items
  const { data: pedidosDoCliente } = await supabase.from('pedidos').select('id').eq('cliente_id', id)
  if (pedidosDoCliente && pedidosDoCliente.length > 0) {
    const pedidoIds = pedidosDoCliente.map((p: any) => p.id)
    await supabase.from('itens_pedido').delete().in('pedido_id', pedidoIds)
    await supabase.from('pedidos').delete().eq('cliente_id', id)
  }
  const { error } = await supabase.from('clientes').delete().eq('id', id)
  if (error) throw error
}

export async function insertHistoricoEtapa(clienteId: number, h: HistoricoEtapa): Promise<void> {
  const { error } = await supabase.from('historico_etapas').insert({
    cliente_id: clienteId,
    etapa: h.etapa,
    etapa_anterior: h.de,
    data: h.data,
  })
  if (error) throw error
}

// ============================================
// INTERAÇÕES
// ============================================

export async function fetchInteracoes(): Promise<Interacao[]> {
  const PAGE_SIZE = 1000
  let allRows: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from('interacoes').select('*').order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allRows = allRows.concat(data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return allRows.map(interacaoFromDb)
}

export async function deleteAllClientes(): Promise<void> {
  // Deletar dados relacionados primeiro (caso não tenha CASCADE)
  const { error: e1 } = await supabase.from('historico_etapas').delete().neq('id', 0)
  if (e1) console.error('Erro ao limpar historico_etapas:', e1)
  const { error: e2 } = await supabase.from('interacoes').delete().neq('id', 0)
  if (e2) console.error('Erro ao limpar interacoes:', e2)
  // Só deletar tarefas vinculadas a clientes (preserva tarefas avulsas)
  const { error: e3 } = await supabase.from('tarefas').delete().not('cliente_id', 'is', null)
  if (e3) console.error('Erro ao limpar tarefas:', e3)
  // Deletar itens de pedido e pedidos
  const { error: e5 } = await supabase.from('itens_pedido').delete().neq('id', 0)
  if (e5) console.error('Erro ao limpar itens_pedido:', e5)
  const { error: e6 } = await supabase.from('pedidos').delete().neq('id', 0)
  if (e6) console.error('Erro ao limpar pedidos:', e6)
  const { error: e4 } = await supabase.from('clientes').delete().neq('id', 0)
  if (e4) throw e4
}

export async function insertInteracao(i: Omit<Interacao, 'id'>): Promise<Interacao> {
  const { data, error } = await supabase.from('interacoes').insert({
    cliente_id: i.clienteId,
    tipo: i.tipo,
    assunto: i.assunto || '',
    descricao: i.descricao,
    automatico: i.automatico || false,
  }).select().single()
  if (error) throw error
  return interacaoFromDb(data)
}

// ============================================
// TAREFAS
// ============================================

export async function fetchTarefas(): Promise<Tarefa[]> {
  const { data, error } = await supabase.from('tarefas').select('*').order('data').range(0, 9999)
  if (error) throw error
  return (data || []).map(tarefaFromDb)
}

export async function insertTarefa(t: Omit<Tarefa, 'id'>): Promise<Tarefa> {
  const { data, error } = await supabase.from('tarefas').insert({
    titulo: t.titulo, descricao: t.descricao, data: t.data, hora: t.hora,
    tipo: t.tipo, status: t.status, prioridade: t.prioridade,
    cliente_id: t.clienteId || null, vendedor_id: t.vendedorId || null,
  }).select().single()
  if (error) throw error
  return tarefaFromDb(data)
}

export async function insertTarefasBatch(tarefas: Omit<Tarefa, 'id'>[]): Promise<Tarefa[]> {
  const BATCH_SIZE = 100
  const allSaved: Tarefa[] = []
  for (let i = 0; i < tarefas.length; i += BATCH_SIZE) {
    const batch = tarefas.slice(i, i + BATCH_SIZE).map(t => ({
      titulo: t.titulo, descricao: t.descricao || null, data: t.data, hora: t.hora || null,
      tipo: t.tipo, status: t.status, prioridade: t.prioridade,
      cliente_id: t.clienteId || null, vendedor_id: t.vendedorId || null,
    }))
    const { data, error } = await supabase.from('tarefas').insert(batch).select()
    if (error) throw error
    if (data) allSaved.push(...data.map(tarefaFromDb))
  }
  return allSaved
}

export async function updateTarefa(id: number, t: Partial<Tarefa>): Promise<void> {
  const row: any = {}
  if (t.titulo !== undefined) row.titulo = t.titulo
  if (t.descricao !== undefined) row.descricao = t.descricao
  if (t.data !== undefined) row.data = t.data
  if (t.hora !== undefined) row.hora = t.hora
  if (t.tipo !== undefined) row.tipo = t.tipo
  if (t.status !== undefined) row.status = t.status
  if (t.prioridade !== undefined) row.prioridade = t.prioridade
  if (t.clienteId !== undefined) row.cliente_id = t.clienteId
  if (t.vendedorId !== undefined) row.vendedor_id = t.vendedorId
  const { error } = await supabase.from('tarefas').update(row).eq('id', id)
  if (error) throw error
}

export async function deleteTarefa(id: number): Promise<void> {
  const { error } = await supabase.from('tarefas').delete().eq('id', id)
  if (error) throw error
}

// ============================================
// PRODUTOS
// ============================================

export async function fetchProdutos(): Promise<Produto[]> {
  const { data, error } = await supabase.from('produtos').select('*').order('id')
  if (error) throw error
  return (data || []).map(produtoFromDb)
}

export async function insertProduto(p: Omit<Produto, 'id' | 'dataCadastro'>): Promise<Produto> {
  const { data, error } = await supabase.from('produtos').insert({
    nome: p.nome, descricao: p.descricao, categoria: p.categoria,
    preco: p.preco, unidade: p.unidade, foto: p.foto,
    sku: p.sku, estoque: p.estoque, peso_kg: p.pesoKg,
    margem_lucro: p.margemLucro, ativo: p.ativo, destaque: p.destaque,
  }).select().single()
  if (error) throw error
  return produtoFromDb(data)
}

export async function updateProduto(id: number, p: Partial<Produto>): Promise<void> {
  const row: any = {}
  if (p.nome !== undefined) row.nome = p.nome
  if (p.descricao !== undefined) row.descricao = p.descricao
  if (p.categoria !== undefined) row.categoria = p.categoria
  if (p.preco !== undefined) row.preco = p.preco
  if (p.unidade !== undefined) row.unidade = p.unidade
  if (p.foto !== undefined) row.foto = p.foto
  if (p.sku !== undefined) row.sku = p.sku
  if (p.estoque !== undefined) row.estoque = p.estoque
  if (p.pesoKg !== undefined) row.peso_kg = p.pesoKg
  if (p.margemLucro !== undefined) row.margem_lucro = p.margemLucro
  if (p.ativo !== undefined) row.ativo = p.ativo
  if (p.destaque !== undefined) row.destaque = p.destaque
  const { error } = await supabase.from('produtos').update(row).eq('id', id)
  if (error) throw error
}

export async function deleteProduto(id: number): Promise<void> {
  const { error } = await supabase.from('produtos').delete().eq('id', id)
  if (error) throw error
}

// ============================================
// PEDIDOS
// ============================================

export async function fetchPedidos(): Promise<Pedido[]> {
  const { data: pedidosRaw, error } = await supabase.from('pedidos').select('*').order('data_criacao', { ascending: false }).range(0, 9999)
  if (error) throw error
  if (!pedidosRaw || pedidosRaw.length === 0) return []

  const pedidoIds = pedidosRaw.map((p: any) => p.id)
  const { data: itensRaw } = await supabase.from('itens_pedido').select('*').in('pedido_id', pedidoIds)

  return pedidosRaw.map((p: any) => {
    const itens = (itensRaw || []).filter((i: any) => i.pedido_id === p.id)
    return pedidoFromDb(p, itens)
  })
}

export async function insertPedido(p: Omit<Pedido, 'id'>): Promise<Pedido> {
  const { data: pedido, error } = await supabase.from('pedidos').insert({
    numero: p.numero,
    cliente_id: p.clienteId,
    vendedor_id: p.vendedorId,
    observacoes: p.observacoes,
    status: p.status,
    total_valor: p.totalValor,
    data_criacao: p.dataCriacao,
    data_envio: p.dataEnvio || null,
  }).select().single()
  if (error) throw error

  if (p.itens && p.itens.length > 0) {
    const itensRows = p.itens.map(i => ({
      pedido_id: pedido.id,
      produto_id: i.produtoId,
      nome_produto: i.nomeProduto,
      sku: i.sku,
      unidade: i.unidade,
      preco: i.preco,
      quantidade: i.quantidade,
    }))
    await supabase.from('itens_pedido').insert(itensRows)
  }

  return pedidoFromDb(pedido, p.itens.map(i => ({
    produto_id: i.produtoId, nome_produto: i.nomeProduto,
    sku: i.sku, unidade: i.unidade, preco: i.preco, quantidade: i.quantidade,
  })))
}

export async function updatePedidoStatus(id: number, status: string): Promise<void> {
  const row: any = { status }
  if (status === 'enviado') row.data_envio = new Date().toISOString()
  const { error } = await supabase.from('pedidos').update(row).eq('id', id)
  if (error) throw error
}

// ============================================
// TEMPLATES
// ============================================

export async function fetchTemplates(): Promise<Template[]> {
  const { data, error } = await supabase.from('templates').select('*').order('id')
  if (error) throw error
  return (data || []).map(templateFromDb)
}

export async function insertTemplate(t: Omit<Template, 'id'>): Promise<Template> {
  const { data, error } = await supabase.from('templates').insert({
    nome: t.nome, canal: t.canal, etapa: t.etapa, assunto: t.assunto, corpo: t.corpo,
  }).select().single()
  if (error) throw error
  return templateFromDb(data)
}

export async function deleteTemplate(id: number): Promise<void> {
  const { error } = await supabase.from('templates').delete().eq('id', id)
  if (error) throw error
}

// ============================================
// TEMPLATES MSGS (prospecção)
// ============================================

export async function fetchTemplateMsgs(): Promise<TemplateMsg[]> {
  const { data, error } = await supabase.from('templates_msgs').select('*').order('id')
  if (error) throw error
  return (data || []).map(templateMsgFromDb)
}

export async function insertTemplateMsg(t: Omit<TemplateMsg, 'id'>): Promise<TemplateMsg> {
  const { data, error } = await supabase.from('templates_msgs').insert({
    canal: t.canal, nome: t.nome, conteudo: t.conteudo,
  }).select().single()
  if (error) throw error
  return templateMsgFromDb(data)
}

// ============================================
// CADÊNCIAS
// ============================================

export async function fetchCadencias(): Promise<Cadencia[]> {
  const { data: cadRaw, error } = await supabase.from('cadencias').select('*').order('id')
  if (error) throw error
  const { data: stepsRaw } = await supabase.from('cadencia_steps').select('*').order('ordem')
  return (cadRaw || []).map((c: any) => cadenciaFromDb(c, stepsRaw || []))
}

// ============================================
// CAMPANHAS
// ============================================

export async function fetchCampanhas(): Promise<Campanha[]> {
  const { data, error } = await supabase.from('campanhas').select('*').order('id')
  if (error) throw error
  return (data || []).map(campanhaFromDb)
}

export async function insertCampanha(c: Omit<Campanha, 'id'>): Promise<Campanha> {
  const { data, error } = await supabase.from('campanhas').insert({
    nome: c.nome, cadencia_id: c.cadenciaId, etapa: c.etapa,
    min_score: c.minScore, dias_inativo_min: c.diasInativoMin, status: c.status,
  }).select().single()
  if (error) throw error
  return campanhaFromDb(data)
}

export async function updateCampanhaStatus(id: number, status: string): Promise<void> {
  const { error } = await supabase.from('campanhas').update({ status }).eq('id', id)
  if (error) throw error
}

// ============================================
// JOBS DE AUTOMAÇÃO
// ============================================

export async function fetchJobs(): Promise<JobAutomacao[]> {
  const { data, error } = await supabase.from('jobs_automacao').select('*').order('agendado_para')
  if (error) throw error
  return (data || []).map(jobFromDb)
}

export async function insertJob(j: Omit<JobAutomacao, 'id'>): Promise<JobAutomacao> {
  const { data, error } = await supabase.from('jobs_automacao').insert({
    cliente_id: j.clienteId, canal: j.canal, tipo: j.tipo,
    status: j.status, agendado_para: j.agendadoPara,
    template_id: j.templateId || null, campanha_id: j.campanhaId || null,
  }).select().single()
  if (error) throw error
  return jobFromDb(data)
}

export async function updateJobStatus(id: number, status: string): Promise<void> {
  const { error } = await supabase.from('jobs_automacao').update({ status }).eq('id', id)
  if (error) throw error
}

// ============================================
// ATIVIDADES
// ============================================

export async function fetchAtividades(): Promise<Atividade[]> {
  const { data, error } = await supabase.from('atividades').select('*').order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return (data || []).map(atividadeFromDb)
}

export async function insertAtividade(a: Omit<Atividade, 'id'>): Promise<Atividade> {
  const { data, error } = await supabase.from('atividades').insert({
    tipo: a.tipo, descricao: a.descricao, vendedor_nome: a.vendedorNome,
  }).select().single()
  if (error) throw error
  return atividadeFromDb(data)
}

// ============================================
// NOTIFICAÇÕES
// ============================================

export async function fetchNotificacoes(): Promise<Notificacao[]> {
  const { data, error } = await supabase.from('notificacoes').select('*').order('created_at', { ascending: false }).limit(50)
  if (error) throw error
  return (data || []).map(notificacaoFromDb)
}

export async function insertNotificacao(n: Omit<Notificacao, 'id' | 'timestamp' | 'lida'>): Promise<Notificacao> {
  const { data, error } = await supabase.from('notificacoes').insert({
    tipo: n.tipo, titulo: n.titulo, mensagem: n.mensagem,
    cliente_id: n.clienteId || null,
  }).select().single()
  if (error) throw error
  return notificacaoFromDb(data)
}

export async function markNotificacaoLida(id: number): Promise<void> {
  const { error } = await supabase.from('notificacoes').update({ lida: true }).eq('id', id)
  if (error) throw error
}

export async function markAllNotificacoesLidas(): Promise<void> {
  const { error } = await supabase.from('notificacoes').update({ lida: true }).eq('lida', false)
  if (error) throw error
}
