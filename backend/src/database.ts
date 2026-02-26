import { supabase } from './supabase.js'

// ============================================
// Types (réplica simplificada do frontend)
// ============================================

export interface Vendedor {
  id: number
  nome: string
  email: string
  telefone: string
  cargo: 'vendedor' | 'gerente' | 'sdr'
  avatar: string
  metaVendas: number
  metaLeads: number
  metaConversao: number
  ativo: boolean
}

export interface Cliente {
  id: number
  razaoSocial: string
  nomeFantasia?: string
  cnpj: string
  contatoNome: string
  contatoTelefone: string
  contatoEmail: string
  endereco?: string
  whatsapp?: string
  etapa: string
  score?: number
  ultimaInteracao?: string
  diasInativo?: number
  valorEstimado?: number
  produtosInteresse?: string[]
  vendedorId?: number
  dataEntradaEtapa?: string
  notas?: string
  origemLead?: string
  statusEntrega?: string
  dataEntregaPrevista?: string
  dataEntregaRealizada?: string
  statusFaturamento?: string
  dataUltimoPedido?: string
  etapaAnterior?: string
  categoriaPerda?: string
  motivoPerda?: string
  dataPerda?: string
  dataProposta?: string
  valorProposta?: number
}

export interface Tarefa {
  id: number
  titulo: string
  descricao?: string
  data: string
  hora?: string
  tipo: string
  status: 'pendente' | 'concluida'
  prioridade: 'alta' | 'media' | 'baixa'
  clienteId?: number
  vendedorId?: number
}

export interface Produto {
  id: number
  nome: string
  descricao: string
  categoria: string
  preco: number
  unidade: string
  sku?: string
  ativo: boolean
}

export interface Pedido {
  id: number
  numero: string
  clienteId: number
  vendedorId: number
  itens: ItemPedido[]
  observacoes: string
  status: string
  dataCriacao: string
  dataEnvio?: string
  totalValor: number
}

export interface ItemPedido {
  produtoId: number
  nomeProduto: string
  sku?: string
  unidade: string
  preco: number
  quantidade: number
}

export interface Interacao {
  id: number
  clienteId: number
  tipo: string
  data: string
  assunto: string
  descricao: string
  automatico: boolean
}

export interface Template {
  id: number
  nome: string
  canal: string
  etapa: string
  assunto?: string
  corpo: string
}

// ============================================
// Mappers: DB row → App type
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
    whatsapp: row.whatsapp || '',
    etapa: row.etapa,
    score: row.score || 0,
    ultimaInteracao: row.ultima_interacao || '',
    diasInativo: row.dias_inativo || 0,
    valorEstimado: row.valor_estimado || 0,
    produtosInteresse: row.produtos_interesse || [],
    vendedorId: row.vendedor_id,
    dataEntradaEtapa: row.data_entrada_etapa || '',
    notas: row.notas || '',
    origemLead: row.origem_lead || '',
    statusEntrega: row.status_entrega || '',
    dataEntregaPrevista: row.data_entrega_prevista || '',
    dataEntregaRealizada: row.data_entrega_realizada || '',
    statusFaturamento: row.status_faturamento || '',
    dataUltimoPedido: row.data_ultimo_pedido || '',
    etapaAnterior: row.etapa_anterior || '',
    categoriaPerda: row.categoria_perda,
    motivoPerda: row.motivo_perda,
    dataPerda: row.data_perda,
    dataProposta: row.data_proposta,
    valorProposta: row.valor_proposta ? Number(row.valor_proposta) : undefined,
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
  if (c.whatsapp !== undefined) row.whatsapp = c.whatsapp
  if (c.etapa !== undefined) row.etapa = c.etapa
  if (c.score !== undefined) row.score = c.score
  if (c.ultimaInteracao !== undefined) row.ultima_interacao = c.ultimaInteracao
  if (c.diasInativo !== undefined) row.dias_inativo = c.diasInativo
  if (c.valorEstimado !== undefined) row.valor_estimado = c.valorEstimado
  if (c.produtosInteresse !== undefined) row.produtos_interesse = c.produtosInteresse
  if (c.vendedorId !== undefined) row.vendedor_id = c.vendedorId
  if (c.dataEntradaEtapa !== undefined) row.data_entrada_etapa = c.dataEntradaEtapa
  if (c.notas !== undefined) row.notas = c.notas
  if (c.origemLead !== undefined) row.origem_lead = c.origemLead
  return row
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

function produtoFromDb(row: any): Produto {
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao || '',
    categoria: row.categoria,
    preco: Number(row.preco),
    unidade: row.unidade,
    sku: row.sku,
    ativo: row.ativo,
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

// ============================================
// AUTH
// ============================================

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function getVendedorByAuthId(authId: string): Promise<Vendedor | null> {
  const { data, error } = await supabase
    .from('vendedores')
    .select('*')
    .eq('auth_id', authId)
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

// ============================================
// CLIENTES
// ============================================

export async function fetchClientes(): Promise<Cliente[]> {
  const PAGE_SIZE = 1000
  let allRows: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from('clientes').select('*').order('id').range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allRows = allRows.concat(data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return allRows.map(clienteFromDb)
}

export async function fetchClientesByVendedor(vendedorId: number): Promise<Cliente[]> {
  const PAGE_SIZE = 1000
  let allRows: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from('clientes').select('*').eq('vendedor_id', vendedorId).order('id').range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allRows = allRows.concat(data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return allRows.map(clienteFromDb)
}

export async function searchClientes(term: string, vendedorId?: number): Promise<Cliente[]> {
  let query = supabase.from('clientes').select('*').or(`razao_social.ilike.%${term}%,cnpj.ilike.%${term}%,contato_nome.ilike.%${term}%`).order('razao_social').limit(10)
  if (vendedorId) query = query.eq('vendedor_id', vendedorId)
  const { data, error } = await query
  if (error) throw error
  return (data || []).map(clienteFromDb)
}

export async function insertCliente(c: Omit<Cliente, 'id'>): Promise<Cliente> {
  const row = clienteToDb(c)
  const { data, error } = await supabase.from('clientes').insert(row).select().single()
  if (error) throw error
  return clienteFromDb(data)
}

export async function updateCliente(id: number, c: Partial<Cliente>): Promise<void> {
  const row = clienteToDb(c)
  row.updated_at = new Date().toISOString()
  const { error } = await supabase.from('clientes').update(row).eq('id', id)
  if (error) throw error
}

// ============================================
// TAREFAS
// ============================================

export async function fetchTarefasByVendedor(vendedorId: number): Promise<Tarefa[]> {
  const { data, error } = await supabase.from('tarefas').select('*').eq('vendedor_id', vendedorId).order('data')
  if (error) throw error
  return (data || []).map(tarefaFromDb)
}

export async function updateTarefaStatus(id: number, status: 'pendente' | 'concluida'): Promise<void> {
  const { error } = await supabase.from('tarefas').update({ status }).eq('id', id)
  if (error) throw error
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

// ============================================
// PRODUTOS
// ============================================

export async function fetchProdutosAtivos(): Promise<Produto[]> {
  const { data, error } = await supabase.from('produtos').select('*').eq('ativo', true).order('categoria, nome')
  if (error) throw error
  return (data || []).map(produtoFromDb)
}

// ============================================
// PEDIDOS
// ============================================

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
// INTERAÇÕES
// ============================================

export async function insertInteracao(i: Omit<Interacao, 'id'>): Promise<void> {
  const { error } = await supabase.from('interacoes').insert({
    cliente_id: i.clienteId,
    tipo: i.tipo,
    assunto: i.assunto || '',
    descricao: i.descricao,
    automatico: i.automatico || false,
  })
  if (error) throw error
}

// ============================================
// ATIVIDADES
// ============================================

export async function insertAtividade(a: { tipo: string; descricao: string; vendedorNome: string }): Promise<void> {
  const { error } = await supabase.from('atividades').insert({
    tipo: a.tipo, descricao: a.descricao, vendedor_nome: a.vendedorNome,
  })
  if (error) throw error
}

// ============================================
// TEMPLATES
// ============================================

export async function fetchTemplates(canal?: string): Promise<Template[]> {
  let query = supabase.from('templates').select('*').order('id')
  if (canal) query = query.eq('canal', canal)
  const { data, error } = await query
  if (error) throw error
  return (data || []).map(templateFromDb)
}
