import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type {
  Cliente, Interacao, Tarefa, Produto, Pedido, Vendedor,
  Template, TemplateMsg, Cadencia, CadenciaStep, Campanha,
  JobAutomacao, Atividade, Notificacao, HistoricoEtapa, ItemPedido,
  PropostaHistorico, ChatMensagem
} from '../types'

// ============================================
// Helpers: converter snake_case (DB) ↔ camelCase (frontend)
// ============================================

export function clienteFromDb(row: any): Cliente {
  return {
    id: row.id,
    razaoSocial: row.razao_social ?? '',
    nomeFantasia: row.nome_fantasia ?? undefined,
    cnpj: row.cnpj ?? '',
    contatoNome: row.contato_nome ?? '',
    contatoTelefone: row.contato_telefone ?? '',
    contatoCelular: row.contato_celular ?? undefined,
    contatoTelefoneFixo: row.contato_telefone_fixo ?? undefined,
    contatoEmail: row.contato_email ?? '',
    endereco: row.endereco ?? undefined,
    enderecoRua: row.endereco_rua ?? undefined,
    enderecoNumero: row.endereco_numero ?? undefined,
    enderecoComplemento: row.endereco_complemento ?? undefined,
    enderecoBairro: row.endereco_bairro ?? undefined,
    enderecoCidade: row.endereco_cidade ?? undefined,
    enderecoEstado: row.endereco_estado ?? undefined,
    enderecoCep: row.endereco_cep ?? undefined,
    cnpj2: row.cnpj2 ?? undefined,
    enderecoRua2: row.endereco_rua2 ?? undefined,
    enderecoNumero2: row.endereco_numero2 ?? undefined,
    enderecoComplemento2: row.endereco_complemento2 ?? undefined,
    enderecoBairro2: row.endereco_bairro2 ?? undefined,
    enderecoCidade2: row.endereco_cidade2 ?? undefined,
    enderecoEstado2: row.endereco_estado2 ?? undefined,
    enderecoCep2: row.endereco_cep2 ?? undefined,
    cnaePrimario: row.cnae_primario ?? undefined,
    cnaeSecundario: row.cnae_secundario ?? undefined,
    redesSociais: row.redes_sociais ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    omieCodigo: row.omie_codigo ?? undefined,
    agendorCodigo: row.agendor_codigo ?? undefined,
    etapa: row.etapa,
    etapaAnterior: row.etapa_anterior ?? undefined,
    dataEntradaEtapa: row.data_entrada_etapa ?? undefined,
    vendedorId: row.vendedor_id,
    score: row.score ?? 0,
    valorEstimado: row.valor_estimado ?? undefined,
    produtosInteresse: row.produtos_interesse ?? [],
    ultimaInteracao: row.ultima_interacao ?? undefined,
    diasInativo: row.dias_inativo ?? 0,
    dataEnvioAmostra: row.data_envio_amostra ?? undefined,
    statusAmostra: row.status_amostra ?? undefined,
    dataHomologacao: row.data_homologacao ?? undefined,
    proximoPedidoPrevisto: row.proximo_pedido_previsto ?? undefined,
    valorProposta: row.valor_proposta ?? undefined,
    dataProposta: row.data_proposta ?? undefined,
    statusEntrega: row.status_entrega ?? undefined,
    dataEntregaPrevista: row.data_entrega_prevista ?? undefined,
    dataEntregaRealizada: row.data_entrega_realizada ?? undefined,
    statusFaturamento: row.status_faturamento ?? undefined,
    dataUltimoPedido: row.data_ultimo_pedido ?? undefined,
    motivoPerda: row.motivo_perda ?? undefined,
    categoriaPerda: row.categoria_perda ?? undefined,
    dataPerda: row.data_perda ?? undefined,
    resultadoAmostra: row.resultado_amostra ?? undefined,
    dataResultadoAmostra: row.data_resultado_amostra ?? undefined,
    motivoReprovacao: row.motivo_reprovacao ?? undefined,
    statusFollowUp: row.status_follow_up ?? undefined,
    statusSatisfacao: row.status_satisfacao ?? undefined,
    notaSatisfacao: row.nota_satisfacao ?? undefined,
    feedbackSatisfacao: row.feedback_satisfacao ?? undefined,
    cicloRecompra: row.ciclo_recompra ?? undefined,
    dataProximaRecompra: row.data_proxima_recompra ?? undefined,
    totalCompras: row.total_compras ?? 0,
    omieStatusLogistico: row.omie_status_logistico ?? undefined,
    omieCodigoRastreio: row.omie_codigo_rastreio ?? undefined,
    omieNotaFiscal: row.omie_nota_fiscal ?? undefined,
    omieDataFaturamento: row.omie_data_faturamento ?? undefined,
    origemLead: row.origem_lead ?? undefined,
    notas: row.notas ?? undefined,
    segmento: row.segmento ?? undefined,
    localizacao: row.localizacao ?? undefined,
    tentativaAmostra: row.tentativa_amostra ?? 0,
    whatsappValido: row.whatsapp_valido ?? null,
    whatsappJid: row.whatsapp_jid || '',
    whatsappValidadoEm: row.whatsapp_validado_em || '',
    novoCiclo: row.novo_ciclo ?? undefined,
    cicloNumero: row.ciclo_numero ?? undefined,
    googlePlaceId: row.google_place_id ?? undefined,
    googleRating: row.google_rating != null ? Number(row.google_rating) : undefined,
    googleReviews: row.google_reviews ?? undefined,
    website: row.website ?? undefined,
    latitude: row.latitude != null ? Number(row.latitude) : undefined,
    longitude: row.longitude != null ? Number(row.longitude) : undefined,
    statusCliente: row.status_cliente ?? undefined,
    dataUltimaAmostra: row.data_ultima_amostra ?? undefined,
    dataUltimaVenda: row.data_ultima_venda ?? undefined,
    grupoEconomicoId: row.grupo_economico_id ?? undefined,
    instagram: row.instagram ?? undefined,
    facebook: row.facebook ?? undefined,
    linkedin: row.linkedin ?? undefined,
    contatoFinanceiroNome: row.contato_financeiro_nome ?? undefined,
    contatoFinanceiroTelefone: row.contato_financeiro_telefone ?? undefined,
    contatoComprasNome: row.contato_compras_nome ?? undefined,
    contatoComprasTelefone: row.contato_compras_telefone ?? undefined,
    produtosQuantidadesMensais: row.produtos_quantidades_mensais ?? undefined,
    produtosDenegados: row.produtos_denegados ?? undefined,
    motivoInativacao: row.motivo_inativacao ?? undefined,
    dataInativacao: row.data_inativacao ?? undefined,
    inativadoPor: row.inativado_por ?? undefined,
    inativadoPorAbandono: row.inativado_por_abandono ?? undefined,
    descricao: row.descricao ?? undefined,
    criadoEm: row.criado_em ?? undefined,
    criadoPorNome: row.criado_por_nome ?? undefined,
    atualizadoEm: row.atualizado_em ?? undefined,
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
  if (c.contatoCelular !== undefined) row.contato_celular = c.contatoCelular
  if (c.contatoTelefoneFixo !== undefined) row.contato_telefone_fixo = c.contatoTelefoneFixo
  if (c.contatoEmail !== undefined) row.contato_email = c.contatoEmail
  if (c.endereco !== undefined) row.endereco = c.endereco
  if (c.enderecoRua !== undefined) row.endereco_rua = c.enderecoRua
  if (c.enderecoNumero !== undefined) row.endereco_numero = c.enderecoNumero
  if (c.enderecoComplemento !== undefined) row.endereco_complemento = c.enderecoComplemento
  if (c.enderecoBairro !== undefined) row.endereco_bairro = c.enderecoBairro
  if (c.enderecoCidade !== undefined) row.endereco_cidade = c.enderecoCidade
  if (c.enderecoEstado !== undefined) row.endereco_estado = c.enderecoEstado
  if (c.enderecoCep !== undefined) row.endereco_cep = c.enderecoCep
  if (c.cnpj2 !== undefined) row.cnpj2 = c.cnpj2
  if (c.enderecoRua2 !== undefined) row.endereco_rua2 = c.enderecoRua2
  if (c.enderecoNumero2 !== undefined) row.endereco_numero2 = c.enderecoNumero2
  if (c.enderecoComplemento2 !== undefined) row.endereco_complemento2 = c.enderecoComplemento2
  if (c.enderecoBairro2 !== undefined) row.endereco_bairro2 = c.enderecoBairro2
  if (c.enderecoCidade2 !== undefined) row.endereco_cidade2 = c.enderecoCidade2
  if (c.enderecoEstado2 !== undefined) row.endereco_estado2 = c.enderecoEstado2
  if (c.enderecoCep2 !== undefined) row.endereco_cep2 = c.enderecoCep2
  if (c.cnaePrimario !== undefined) row.cnae_primario = c.cnaePrimario
  if (c.cnaeSecundario !== undefined) row.cnae_secundario = c.cnaeSecundario
  if (c.redesSociais !== undefined) row.redes_sociais = c.redesSociais
  if (c.whatsapp !== undefined) row.whatsapp = c.whatsapp
  if (c.omieCodigo !== undefined) row.omie_codigo = c.omieCodigo
  if (c.agendorCodigo !== undefined) row.agendor_codigo = c.agendorCodigo
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
  if (c.dataEntregaPrevista !== undefined) row.data_entrega_prevista = c.dataEntregaPrevista || null
  if (c.dataEntregaRealizada !== undefined) row.data_entrega_realizada = c.dataEntregaRealizada || null
  if (c.statusFaturamento !== undefined) row.status_faturamento = c.statusFaturamento
  if (c.dataUltimoPedido !== undefined) row.data_ultimo_pedido = c.dataUltimoPedido || null
  if (c.motivoPerda !== undefined) row.motivo_perda = c.motivoPerda ?? null
  if (c.categoriaPerda !== undefined) row.categoria_perda = c.categoriaPerda ?? null
  if (c.dataPerda !== undefined) row.data_perda = c.dataPerda || null
  if (c.resultadoAmostra !== undefined) row.resultado_amostra = c.resultadoAmostra ?? null
  if (c.dataResultadoAmostra !== undefined) row.data_resultado_amostra = c.dataResultadoAmostra || null
  if (c.motivoReprovacao !== undefined) row.motivo_reprovacao = c.motivoReprovacao ?? null
  if (c.statusFollowUp !== undefined) row.status_follow_up = c.statusFollowUp ?? null
  if (c.statusSatisfacao !== undefined) row.status_satisfacao = c.statusSatisfacao ?? null
  if (c.notaSatisfacao !== undefined) row.nota_satisfacao = c.notaSatisfacao ?? null
  if (c.feedbackSatisfacao !== undefined) row.feedback_satisfacao = c.feedbackSatisfacao ?? null
  if (c.cicloRecompra !== undefined) row.ciclo_recompra = c.cicloRecompra ?? null
  if (c.dataProximaRecompra !== undefined) row.data_proxima_recompra = c.dataProximaRecompra || null
  if (c.totalCompras !== undefined) row.total_compras = c.totalCompras
  if (c.omieStatusLogistico !== undefined) row.omie_status_logistico = c.omieStatusLogistico ?? null
  if (c.omieCodigoRastreio !== undefined) row.omie_codigo_rastreio = c.omieCodigoRastreio ?? null
  if (c.omieNotaFiscal !== undefined) row.omie_nota_fiscal = c.omieNotaFiscal ?? null
  if (c.omieDataFaturamento !== undefined) row.omie_data_faturamento = c.omieDataFaturamento || null
  if (c.origemLead !== undefined) row.origem_lead = c.origemLead
  if (c.notas !== undefined) row.notas = c.notas
  if (c.segmento !== undefined) row.segmento = c.segmento
  if (c.localizacao !== undefined) row.localizacao = c.localizacao
  if (c.tentativaAmostra !== undefined) row.tentativa_amostra = c.tentativaAmostra
  if (c.whatsappValido !== undefined) row.whatsapp_valido = c.whatsappValido
  if (c.whatsappJid !== undefined) row.whatsapp_jid = c.whatsappJid
  if (c.whatsappValidadoEm !== undefined) row.whatsapp_validado_em = c.whatsappValidadoEm
  if (c.novoCiclo !== undefined) row.novo_ciclo = c.novoCiclo
  if (c.cicloNumero !== undefined) row.ciclo_numero = c.cicloNumero
  if (c.googlePlaceId !== undefined) row.google_place_id = c.googlePlaceId
  if (c.googleRating !== undefined) row.google_rating = c.googleRating
  if (c.googleReviews !== undefined) row.google_reviews = c.googleReviews
  if (c.website !== undefined) row.website = c.website
  if (c.latitude !== undefined) row.latitude = c.latitude
  if (c.longitude !== undefined) row.longitude = c.longitude
  if (c.statusCliente !== undefined) row.status_cliente = c.statusCliente ?? null
  if (c.dataUltimaAmostra !== undefined) row.data_ultima_amostra = c.dataUltimaAmostra ?? null
  if (c.dataUltimaVenda !== undefined) row.data_ultima_venda = c.dataUltimaVenda ?? null
  if (c.grupoEconomicoId !== undefined) row.grupo_economico_id = c.grupoEconomicoId ?? null
  if (c.instagram !== undefined) row.instagram = c.instagram ?? null
  if (c.facebook !== undefined) row.facebook = c.facebook ?? null
  if (c.linkedin !== undefined) row.linkedin = c.linkedin ?? null
  if (c.contatoFinanceiroNome !== undefined) row.contato_financeiro_nome = c.contatoFinanceiroNome ?? null
  if (c.contatoFinanceiroTelefone !== undefined) row.contato_financeiro_telefone = c.contatoFinanceiroTelefone ?? null
  if (c.contatoComprasNome !== undefined) row.contato_compras_nome = c.contatoComprasNome ?? null
  if (c.contatoComprasTelefone !== undefined) row.contato_compras_telefone = c.contatoComprasTelefone ?? null
  if (c.produtosQuantidadesMensais !== undefined) row.produtos_quantidades_mensais = c.produtosQuantidadesMensais ?? null
  if (c.produtosDenegados !== undefined) row.produtos_denegados = c.produtosDenegados ?? null
  if (c.motivoInativacao !== undefined) row.motivo_inativacao = c.motivoInativacao ?? null
  if (c.dataInativacao !== undefined) row.data_inativacao = c.dataInativacao ?? null
  if (c.inativadoPor !== undefined) row.inativado_por = c.inativadoPor ?? null
  if (c.inativadoPorAbandono !== undefined) row.inativado_por_abandono = c.inativadoPorAbandono ?? null
  if (c.descricao !== undefined) row.descricao = c.descricao ?? null
  if (c.criadoPorNome !== undefined) row.criado_por_nome = c.criadoPorNome ?? null
  if (c.criadoEm !== undefined) row.criado_em = c.criadoEm ?? null
  if (c.atualizadoEm !== undefined) row.atualizado_em = c.atualizadoEm ?? null
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
    omieCodigo: row.omie_codigo || undefined,
    marca: row.marca || undefined,
    localEstoque: row.local_estoque || undefined,
    especieVolume: row.especie_volume || undefined,
    cfopInterno: row.cfop_interno || undefined,
    cfopExterno: row.cfop_externo || undefined,
    ncm: row.ncm || undefined,
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
  }
}

export function interacaoFromDb(row: any): Interacao {
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

const CONCLUSAO_SEP = '\n[CONCLUSAO]\n'
export function tarefaFromDb(row: any): Tarefa {
  const rawDesc: string = row.descricao || ''
  const sepIdx = rawDesc.indexOf(CONCLUSAO_SEP)
  const descricao = sepIdx >= 0 ? rawDesc.slice(0, sepIdx) : rawDesc
  const conclusao = sepIdx >= 0 ? rawDesc.slice(sepIdx + CONCLUSAO_SEP.length) : undefined
  return {
    id: row.id,
    titulo: row.titulo,
    descricao: descricao || '',
    conclusao: conclusao || undefined,
    data: row.data,
    hora: row.hora || '',
    tipo: row.tipo,
    status: row.status,
    prioridade: row.prioridade,
    clienteId: row.cliente_id,
    vendedorId: row.vendedor_id,
    criadoEm: row.created_at || undefined,
    reagendamentos: row.reagendamentos || undefined,
  }
}

export function pedidoFromDb(row: any, itens: any[] = []): Pedido {
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
    dataAprovacao: row.data_aprovacao || undefined,
    motivoRecusa: row.motivo_recusa || undefined,
    aprovadoPor: row.aprovado_por || undefined,
    omieCodigo: row.omie_codigo || undefined,
    omieNumero: row.omie_numero || undefined,
    omieStatus: row.omie_status || undefined,
    omieErro: row.omie_erro || undefined,
    tipo: row.tipo || 'venda',
    formaPagamento: row.forma_pagamento || 'À vista',
    tipoFrete: row.tipo_frete || undefined,
    enderecoDiferente: row.endereco_diferente || false,
    enderecoEntregaRua: row.endereco_entrega_rua || undefined,
    enderecoEntregaNumero: row.endereco_entrega_numero || undefined,
    enderecoEntregaBairro: row.endereco_entrega_bairro || undefined,
    enderecoEntregaCidade: row.endereco_entrega_cidade || undefined,
    enderecoEntregaEstado: row.endereco_entrega_estado || undefined,
    enderecoEntregaCep: row.endereco_entrega_cep || undefined,
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
// AUTH RETRY WRAPPER
// ============================================

/**
 * Wraps a Supabase operation with automatic session refresh on auth errors.
 * When the JWT expires (after ~1h), the first request fails with 401/403.
 * This catches that, refreshes the session, and retries once — avoiding
 * the need for a manual page reload.
 */
async function withAuthRetry<T>(fn: () => Promise<{ data: T | null; error: any }>): Promise<{ data: T | null; error: any }> {
  let result = await fn()
  if (!result.error) return result

  // Check if it's an auth error (JWT expired, invalid token, etc.)
  const errMsg = (result.error?.message || '').toLowerCase()
  const isAuthError =
    result.error?.code === 'PGRST301' ||
    result.error?.status === 401 ||
    result.error?.status === 403 ||
    errMsg.includes('jwt') ||
    errMsg.includes('invalid token') ||
    errMsg.includes('expired')

  if (!isAuthError) return result

  // Refresh the session and retry once
  try {
    const { error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError) return result // can't refresh, return original error
    result = await fn()
  } catch {
    // refresh failed, return original error
  }
  return result
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
  // Tenta pelo auth_id primeiro, e fallback por email
  let { data } = await supabase
    .from('vendedores')
    .select('*')
    .eq('auth_id', user.id)
    .maybeSingle()
  if (!data && user.email) {
    const r2 = await supabase.from('vendedores').select('*').eq('email', user.email).maybeSingle()
    if (r2.data) data = r2.data
  }
  if (!data) return null
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

async function fetchAllPages<T>(table: string, extraQuery?: (q: any) => any): Promise<T[]> {
  const PAGE_SIZE = 1000
  let allRows: T[] = []
  let from = 0
  while (true) {
    let q = supabase.from(table).select('*').range(from, from + PAGE_SIZE - 1)
    if (extraQuery) q = extraQuery(q)
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    allRows = allRows.concat(data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return allRows
}

export async function fetchClientes(): Promise<Cliente[]> {
  // Busca clientes e histórico em paralelo
  const [allRows, allHist] = await Promise.all([
    fetchAllPages<any>('clientes', q => q.order('id')),
    fetchAllPages<any>('historico_etapas', q => q.order('data')).catch(() => [] as any[]),
  ])

  const clientes = allRows.map(clienteFromDb)

  if (allHist.length > 0) {
    const histMap = new Map<number, HistoricoEtapa[]>()
    allHist.forEach((h: any) => {
      const arr = histMap.get(h.cliente_id) || []
      arr.push(historicoFromDb(h))
      histMap.set(h.cliente_id, arr)
    })
    clientes.forEach(c => { c.historicoEtapas = histMap.get(c.id) || [] })
  }

  return clientes
}

export async function checkCnpjDuplicado(cnpj: string, excludeId?: number): Promise<Cliente | null> {
  if (!cnpj || cnpj.trim() === '') return null
  let query = supabase.from('clientes').select('*').eq('cnpj', cnpj.trim()).limit(1)
  if (excludeId) query = query.neq('id', excludeId)
  const { data } = await withAuthRetry(async () => { const r = await query; return r })
  return data && data.length > 0 ? clienteFromDb(data[0]) : null
}

export async function insertCliente(c: Omit<Cliente, 'id'>): Promise<Cliente> {
  const row = clienteToDb(c)
  const { data, error } = await withAuthRetry(async () => { const r = await supabase.from('clientes').insert(row).select().single(); return r })
  if (error) throw error
  return clienteFromDb(data)
}

export interface ImportFalha { razaoSocial: string; cnpj?: string; erro: string }
export interface ImportResult { saved: Cliente[]; falhas: ImportFalha[] }

export async function insertClientesBatch(clientes: Omit<Cliente, 'id'>[]): Promise<ImportResult> {
  const BATCH_SIZE = 100
  const allSaved: Cliente[] = []
  const falhas: ImportFalha[] = []

  for (let i = 0; i < clientes.length; i += BATCH_SIZE) {
    const slice = clientes.slice(i, i + BATCH_SIZE)
    const batch = slice.map(c => clienteToDb(c))
    const { data, error } = await supabase.from('clientes').insert(batch).select()
    if (!error) {
      if (data) allSaved.push(...data.map(clienteFromDb))
      continue
    }
    // Batch falhou: tenta linha-a-linha para salvar as válidas e identificar as quebradas
    console.warn(`Batch de clientes falhou (${error.message}). Tentando linha-a-linha...`)
    for (const c of slice) {
      const { data: one, error: oneErr } = await supabase.from('clientes').insert(clienteToDb(c)).select().single()
      if (oneErr) {
        falhas.push({ razaoSocial: c.razaoSocial, cnpj: c.cnpj, erro: oneErr.message })
        console.error(`Falha ao inserir "${c.razaoSocial}" (CNPJ: ${c.cnpj || 'N/A'}):`, oneErr.message)
      } else if (one) {
        allSaved.push(clienteFromDb(one))
      }
    }
  }

  if (falhas.length > 0) {
    console.error(`${falhas.length} cliente(s) não puderam ser importados:`, falhas)
  }
  return { saved: allSaved, falhas }
}

export async function updateCliente(id: number, c: Partial<Cliente>): Promise<void> {
  const row = clienteToDb(c)
  // Trigger no banco já atualiza atualizado_em; não enviar updated_at (coluna não existe)
  const { error } = await withAuthRetry(async () => { const r = await supabase.from('clientes').update(row).eq('id', id); return r })
  if (error) throw error
}

export async function updateClientesBatch(updates: { id: number; changes: Partial<Cliente> }[]): Promise<void> {
  if (updates.length === 0) return
  const BATCH = 50
  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH)
    await Promise.all(chunk.map(({ id, changes }) => {
      const row = clienteToDb(changes)
      // Trigger no banco já atualiza atualizado_em
      return supabase.from('clientes').update(row).eq('id', id)
    }))
  }
}

export async function deleteCliente(id: number): Promise<void> {
  // Deletar dados sem FK entre si em paralelo
  await Promise.all([
    supabase.from('historico_etapas').delete().eq('cliente_id', id),
    supabase.from('interacoes').delete().eq('cliente_id', id),
    supabase.from('tarefas').delete().eq('cliente_id', id),
  ])
  // Pedidos precisam de delete sequencial (itens dependem do pedido)
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

export async function moverClienteAtomico(
  clienteId: number,
  etapa: string,
  etapaAnterior: string,
  dataEntradaEtapa: string,
  extras: Partial<Cliente> = {}
): Promise<void> {
  const extrasDb: any = {}
  if (extras.motivoPerda !== undefined) extrasDb.motivo_perda = extras.motivoPerda
  if (extras.categoriaPerda !== undefined) extrasDb.categoria_perda = extras.categoriaPerda
  if (extras.dataPerda !== undefined) extrasDb.data_perda = extras.dataPerda
  if (extras.dataEnvioAmostra !== undefined) extrasDb.data_envio_amostra = extras.dataEnvioAmostra
  if (extras.statusAmostra !== undefined) extrasDb.status_amostra = extras.statusAmostra
  if (extras.dataHomologacao !== undefined) extrasDb.data_homologacao = extras.dataHomologacao
  if (extras.valorProposta !== undefined) extrasDb.valor_proposta = extras.valorProposta
  if (extras.dataProposta !== undefined) extrasDb.data_proposta = extras.dataProposta
  if (extras.statusEntrega !== undefined) extrasDb.status_entrega = extras.statusEntrega
  if (extras.dataUltimoPedido !== undefined) extrasDb.data_ultimo_pedido = extras.dataUltimoPedido
  if (extras.statusFaturamento !== undefined) extrasDb.status_faturamento = extras.statusFaturamento
  if (extras.statusFollowUp !== undefined) extrasDb.status_follow_up = extras.statusFollowUp
  if (extras.statusSatisfacao !== undefined) extrasDb.status_satisfacao = extras.statusSatisfacao
  if (extras.ultimaInteracao !== undefined) extrasDb.ultima_interacao = extras.ultimaInteracao
  if (extras.vendedorId !== undefined) extrasDb.vendedor_id = extras.vendedorId

  const { error } = await supabase.rpc('mover_cliente_atomico', {
    p_cliente_id: clienteId,
    p_etapa: etapa,
    p_etapa_anterior: etapaAnterior,
    p_data_entrada_etapa: dataEntradaEtapa,
    p_extras: extrasDb,
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

export async function fetchInteracoesByCliente(clienteId: number): Promise<Interacao[]> {
  const { data, error } = await supabase
    .from('interacoes')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data || []).map(interacaoFromDb)
}

export async function deleteAllClientes(): Promise<void> {
  const BATCH = 300

  // Buscar todos os IDs dos clientes com paginação
  let allClienteIds: number[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from('clientes').select('id').range(from, from + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    allClienteIds = allClienteIds.concat(data.map((c: any) => c.id))
    if (data.length < 1000) break
    from += 1000
  }
  if (allClienteIds.length === 0) return

  // Helper: deletar em batches de BATCH para respeitar limite do .in()
  const batchDelete = async (table: string, column: string, ids: number[]) => {
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH)
      const { error } = await supabase.from(table).delete().in(column, chunk)
      if (error && import.meta.env.DEV) console.error(`Erro ao limpar ${table}:`, error)
    }
  }

  // Deletar dados relacionados em batches
  await batchDelete('historico_etapas', 'cliente_id', allClienteIds)
  await batchDelete('interacoes', 'cliente_id', allClienteIds)
  await batchDelete('tarefas', 'cliente_id', allClienteIds)

  // Buscar pedidos vinculados (também em batches)
  let allPedidoIds: number[] = []
  for (let i = 0; i < allClienteIds.length; i += BATCH) {
    const chunk = allClienteIds.slice(i, i + BATCH)
    const { data } = await supabase.from('pedidos').select('id').in('cliente_id', chunk)
    if (data) allPedidoIds = allPedidoIds.concat(data.map((p: any) => p.id))
  }
  if (allPedidoIds.length > 0) {
    await batchDelete('itens_pedido', 'pedido_id', allPedidoIds)
    await batchDelete('pedidos', 'id', allPedidoIds)
  }

  // Deletar clientes em batches (escopo exato, não .neq)
  await batchDelete('clientes', 'id', allClienteIds)
}

export async function updateInteracao(id: number, changes: { tipo?: Interacao['tipo']; descricao?: string; assunto?: string }): Promise<void> {
  const row: any = {}
  if (changes.tipo !== undefined) row.tipo = changes.tipo
  if (changes.descricao !== undefined) row.descricao = changes.descricao
  if (changes.assunto !== undefined) row.assunto = changes.assunto
  const { error } = await supabase.from('interacoes').update(row).eq('id', id)
  if (error) throw error
}

export async function insertInteracao(i: Omit<Interacao, 'id'>): Promise<Interacao> {
  const now = i.data || new Date().toISOString()
  // NOTA: a tabela 'interacoes' usa created_at (auto-gerada), NÃO tem coluna 'data'
  const { error } = await withAuthRetry(async () => { const r = await supabase.from('interacoes').insert({
    cliente_id: i.clienteId,
    tipo: i.tipo,
    assunto: i.assunto || '',
    descricao: i.descricao,
    automatico: i.automatico || false,
  }); return r })
  if (error) throw error
  // Objeto local com ID temporario — o ID real vem no proximo fetchInteracoes
  return {
    id: Date.now(),
    clienteId: i.clienteId,
    tipo: i.tipo,
    assunto: i.assunto || '',
    descricao: i.descricao || '',
    data: now,
    automatico: i.automatico || false,
  }
}

// ============================================
// TAREFAS
// ============================================

export async function fetchTarefas(): Promise<Tarefa[]> {
  const PAGE_SIZE = 1000
  let allRows: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from('tarefas').select('*').order('data').range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allRows = allRows.concat(data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return allRows.map(tarefaFromDb)
}

export async function insertTarefa(t: Omit<Tarefa, 'id'>): Promise<Tarefa> {
  const { error } = await supabase.from('tarefas').insert({
    titulo: t.titulo, descricao: t.descricao, data: t.data, hora: t.hora,
    tipo: t.tipo, status: t.status, prioridade: t.prioridade,
    cliente_id: t.clienteId || null, vendedor_id: t.vendedorId || null,
  })
  if (error) throw error
  return {
    id: Date.now(),
    titulo: t.titulo,
    descricao: t.descricao,
    data: t.data,
    hora: t.hora,
    tipo: t.tipo,
    status: t.status,
    prioridade: t.prioridade,
    clienteId: t.clienteId,
    vendedorId: t.vendedorId,
    criadoEm: new Date().toISOString(),
  }
}

export async function insertTarefasBatch(tarefas: Omit<Tarefa, 'id'>[]): Promise<Tarefa[]> {
  const BATCH_SIZE = 100
  const allSaved: Tarefa[] = []
  const falhas: string[] = []
  const toRow = (t: Omit<Tarefa, 'id'>) => ({
    titulo: t.titulo, descricao: t.descricao || null, data: t.data, hora: t.hora || null,
    tipo: t.tipo, status: t.status, prioridade: t.prioridade,
    cliente_id: t.clienteId || null, vendedor_id: t.vendedorId || null,
  })

  for (let i = 0; i < tarefas.length; i += BATCH_SIZE) {
    const slice = tarefas.slice(i, i + BATCH_SIZE)
    const batch = slice.map(toRow)
    const { data, error } = await supabase.from('tarefas').insert(batch).select()
    if (!error) {
      if (data) allSaved.push(...data.map(tarefaFromDb))
      continue
    }

    for (let j = 0; j < slice.length; j++) {
      const { data: rowData, error: rowError } = await supabase.from('tarefas').insert(toRow(slice[j])).select().single()
      if (rowError) falhas.push(`linha ${i + j + 1}: ${rowError.message}`)
      else if (rowData) allSaved.push(tarefaFromDb(rowData))
    }
  }

  if (falhas.length > 0 && allSaved.length === 0) {
    throw new Error(`${falhas.length} tarefa(s) falharam. Primeiras falhas: ${falhas.slice(0, 5).join(' | ')}`)
  }
  return allSaved
}

export async function updateTarefa(id: number, t: Partial<Tarefa>): Promise<void> {
  const row: any = {}
  if (t.titulo !== undefined) row.titulo = t.titulo
  if (t.descricao !== undefined && t.conclusao !== undefined) {
    row.descricao = t.conclusao ? `${t.descricao}${CONCLUSAO_SEP}${t.conclusao}` : t.descricao
  } else if (t.descricao !== undefined) {
    row.descricao = t.descricao
  }
  if (t.data !== undefined) row.data = t.data
  if (t.hora !== undefined) row.hora = t.hora
  if (t.tipo !== undefined) row.tipo = t.tipo
  if (t.status !== undefined) row.status = t.status
  if (t.prioridade !== undefined) row.prioridade = t.prioridade
  if (t.clienteId !== undefined) row.cliente_id = t.clienteId
  if (t.vendedorId !== undefined) row.vendedor_id = t.vendedorId
  if (t.reagendamentos !== undefined) row.reagendamentos = t.reagendamentos
  // NOTA: tabela 'tarefas' não tem coluna concluida_em — não enviar
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
  const { data, error } = await withAuthRetry(async () => { const r = await supabase.from('produtos').insert({
    nome: p.nome, descricao: p.descricao, categoria: p.categoria,
    preco: p.preco, unidade: p.unidade, foto: p.foto,
    sku: p.sku, omie_codigo: p.omieCodigo, estoque: p.estoque, peso_kg: p.pesoKg,
    margem_lucro: p.margemLucro, ativo: p.ativo, destaque: p.destaque,
  }).select().single(); return r })
  if (error) throw error
  return produtoFromDb(data)
}

export async function updateProduto(id: number, p: Partial<Produto>): Promise<Produto | undefined> {
  const row: any = {}
  if (p.nome !== undefined) row.nome = p.nome
  if (p.descricao !== undefined) row.descricao = p.descricao
  if (p.categoria !== undefined) row.categoria = p.categoria
  if (p.preco !== undefined) row.preco = p.preco
  if (p.unidade !== undefined) row.unidade = p.unidade
  if (p.foto !== undefined) row.foto = p.foto
  if (p.sku !== undefined) row.sku = p.sku
  if (p.omieCodigo !== undefined) row.omie_codigo = p.omieCodigo
  if (p.estoque !== undefined) row.estoque = p.estoque
  if (p.pesoKg !== undefined) row.peso_kg = p.pesoKg
  if (p.margemLucro !== undefined) row.margem_lucro = p.margemLucro
  if (p.ativo !== undefined) row.ativo = p.ativo
  if (p.destaque !== undefined) row.destaque = p.destaque
  const { error } = await withAuthRetry(async () => { const r = await supabase.from('produtos').update(row).eq('id', id); return r })
  if (error) throw error
  const { data: updated, error: fetchErr } = await withAuthRetry(async () => { const r = await supabase.from('produtos').select('*').eq('id', id).single(); return r })
  if (fetchErr) return undefined
  return updated ? produtoFromDb(updated) : undefined
}

export async function deleteProduto(id: number): Promise<void> {
  const { error } = await withAuthRetry(async () => { const r = await supabase.from('produtos').delete().eq('id', id); return r })
  if (error) throw error
}

// ============================================
// PEDIDOS
// ============================================

export async function fetchPedidos(): Promise<Pedido[]> {
  const PAGE_SIZE = 1000
  let allRows: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('pedidos')
      .select('*, itens_pedido(*)')
      .order('data_criacao', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allRows = allRows.concat(data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return allRows.map((p: any) => pedidoFromDb(p, p.itens_pedido || []))
}

export async function insertPedido(p: Omit<Pedido, 'id'>): Promise<Pedido> {
  const itensJson = (p.itens || []).map(i => ({
    produto_id: i.produtoId,
    nome_produto: i.nomeProduto,
    sku: i.sku || '',
    unidade: i.unidade,
    preco: i.preco,
    quantidade: i.quantidade,
  }))

  // Insert pedido (PostgREST handles TEXT→TIMESTAMPTZ cast automatically)
  const { data: pedidoRow, error: pedidoError } = await supabase
    .from('pedidos')
    .insert({
      numero: p.numero,
      cliente_id: p.clienteId,
      vendedor_id: p.vendedorId,
      observacoes: p.observacoes,
      status: p.status,
      total_valor: p.totalValor,
      data_criacao: p.dataCriacao,
      data_envio: p.dataEnvio || null,
      tipo: p.tipo || 'venda',
      forma_pagamento: p.formaPagamento || 'À vista',
      tipo_frete: p.tipoFrete || null,
      endereco_diferente: p.enderecoDiferente || false,
      endereco_entrega_rua: p.enderecoEntregaRua || null,
      endereco_entrega_numero: p.enderecoEntregaNumero || null,
      endereco_entrega_bairro: p.enderecoEntregaBairro || null,
      endereco_entrega_cidade: p.enderecoEntregaCidade || null,
      endereco_entrega_estado: p.enderecoEntregaEstado || null,
      endereco_entrega_cep: p.enderecoEntregaCep || null,
    })
    .select()
    .single()
  if (pedidoError) throw pedidoError

  // Insert itens
  if (itensJson.length > 0) {
    const itensRows = itensJson.map(i => ({ ...i, pedido_id: pedidoRow.id }))
    const { error: itensError } = await supabase.from('itens_pedido').insert(itensRows)
    if (itensError) {
      // Rollback pedido if itens fail
      await supabase.from('pedidos').delete().eq('id', pedidoRow.id)
      throw itensError
    }
  }

  return pedidoFromDb(pedidoRow, itensJson)
}

export async function updatePedidoStatus(id: number, status: string): Promise<void> {
  const row: any = { status }
  if (status === 'enviado') row.data_envio = new Date().toISOString()
  if (status === 'confirmado') row.data_aprovacao = new Date().toISOString()
  const { error } = await supabase.from('pedidos').update(row).eq('id', id)
  if (error) throw error
}

export async function aprovarPedido(id: number, aprovadoPorId: number): Promise<void> {
  const { error } = await supabase.from('pedidos').update({
    status: 'confirmado',
    data_aprovacao: new Date().toISOString(),
    aprovado_por: aprovadoPorId,
    motivo_recusa: null,
  }).eq('id', id)
  if (error) throw error
}

export async function recusarPedido(id: number, motivoRecusa: string): Promise<void> {
  const { error } = await supabase.from('pedidos').update({
    status: 'cancelado',
    motivo_recusa: motivoRecusa,
  }).eq('id', id)
  if (error) throw error
}

export async function solicitarCancelamentoPedido(id: number, motivo: string): Promise<void> {
  const { error } = await supabase.from('pedidos').update({
    status: 'cancelamento_solicitado',
    motivo_recusa: motivo,
  }).eq('id', id)
  if (error) throw error
}

export async function confirmarCancelamentoPedido(id: number): Promise<void> {
  const { error } = await supabase.from('pedidos').update({
    status: 'cancelado',
  }).eq('id', id)
  if (error) throw error
}

export async function rejeitarCancelamentoPedido(id: number): Promise<void> {
  const { error } = await supabase.from('pedidos').update({
    status: 'confirmado',
    motivo_recusa: null,
  }).eq('id', id)
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

export async function insertJobsBatch(jobs: Omit<JobAutomacao, 'id'>[]): Promise<JobAutomacao[]> {
  if (jobs.length === 0) return []
  const BATCH_SIZE = 100
  const allSaved: JobAutomacao[] = []
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE).map(j => ({
      cliente_id: j.clienteId, canal: j.canal, tipo: j.tipo,
      status: j.status, agendado_para: j.agendadoPara,
      template_id: j.templateId || null, campanha_id: j.campanhaId || null,
    }))
    const { data, error } = await supabase.from('jobs_automacao').insert(batch).select()
    if (error) throw error
    if (data) allSaved.push(...data.map(jobFromDb))
  }
  return allSaved
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

// ============================================
// PROPOSTAS (histórico de propostas geradas)
// ============================================

export async function savePropostaHistorico(
  p: Omit<PropostaHistorico, 'id'>
): Promise<PropostaHistorico> {
  const { data, error } = await supabase
    .from('propostas')
    .insert({
      numero: p.numero,
      cliente_id: p.clienteId,
      vendedor_nome: p.vendedorNome,
      itens: p.itens,
      observacoes: p.observacoes,
      frete: p.frete || null,
      pagamento: p.pagamento || null,
      total_valor: p.totalValor,
      criado_em: p.criadoEm,
    })
    .select()
    .single()
  if (error) throw error
  return propostaFromDb(data)
}

export async function fetchPropostasByCliente(clienteId: number): Promise<PropostaHistorico[]> {
  const { data, error } = await supabase
    .from('propostas')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('criado_em', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data || []).map(propostaFromDb)
}

function propostaFromDb(row: any): PropostaHistorico {
  return {
    id: row.id,
    numero: row.numero,
    clienteId: row.cliente_id,
    vendedorNome: row.vendedor_nome,
    itens: row.itens || [],
    observacoes: row.observacoes || '',
    frete: row.frete || undefined,
    pagamento: row.pagamento || undefined,
    totalValor: Number(row.total_valor) || 0,
    criadoEm: row.criado_em,
  }
}

// ============================================
// Chat Interno
// ============================================

function chatMensagemFromDb(row: any): ChatMensagem {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    content: row.content,
    readAt: row.read_at ?? null,
    createdAt: row.created_at,
  }
}

export async function fetchChatMensagens(myId: number, otherId: number, limit = 100): Promise<ChatMensagem[]> {
  const { data, error } = await supabase
    .from('chat_mensagens')
    .select('*')
    .or(`and(sender_id.eq.${myId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${myId})`)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return (data || []).map(chatMensagemFromDb)
}

export async function insertChatMensagem(senderId: number, receiverId: number, content: string): Promise<ChatMensagem> {
  const { data, error } = await supabase
    .from('chat_mensagens')
    .insert({ sender_id: senderId, receiver_id: receiverId, content })
    .select()
    .single()
  if (error) throw error
  return chatMensagemFromDb(data)
}

export async function markChatMensagensRead(myId: number, otherId: number): Promise<void> {
  await supabase
    .from('chat_mensagens')
    .update({ read_at: new Date().toISOString() })
    .eq('receiver_id', myId)
    .eq('sender_id', otherId)
    .is('read_at', null)
}

export async function fetchUnreadCounts(myId: number): Promise<Record<number, number>> {
  const { data, error } = await supabase
    .from('chat_mensagens')
    .select('sender_id')
    .eq('receiver_id', myId)
    .is('read_at', null)
  if (error) return {}
  const counts: Record<number, number> = {}
  for (const row of data || []) {
    counts[row.sender_id] = (counts[row.sender_id] || 0) + 1
  }
  return counts
}

// ============================================
// REGRAS DE AUTOMAÇÃO DE TAREFAS
// ============================================

export interface RegraAutomacaoDB {
  id: number
  nome: string
  ativa: boolean
  gatilho: 'mudanca_etapa' | 'inatividade' | 'substatus' | 'data_especifica' | 'reconquista' | 'tarefa_concluida'
  condicoes: {
    etapaOrigem?: string
    etapaDestino?: string
    diasInatividade?: number
    subStatus?: string
    diasDesdeEvento?: number
    tipoTarefaConcluida?: 'ligacao' | 'email' | 'whatsapp' | 'reuniao' | 'follow-up' | 'outro' | 'qualquer'
    tarefaEspecifica?: string
    etapaCliente?: string
  }
  acao: {
    titulo: string
    descricao: string
    tipo: 'ligacao' | 'email' | 'whatsapp' | 'reuniao' | 'outro'
    prioridade: 'alta' | 'media' | 'baixa'
    diasPrazo: number
    horaPadrao?: string
  }
  created_at?: string
  updated_at?: string
}

export async function getRegrasAutomacao(): Promise<RegraAutomacaoDB[]> {
  const { data, error } = await supabase
    .from('regras_automacao')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Erro ao buscar regras:', error)
    return []
  }
  
  return (data || []).map(row => ({
    id: row.id,
    nome: row.nome,
    ativa: row.ativa,
    gatilho: row.gatilho,
    condicoes: row.condicoes || {},
    acao: row.acao || {},
    created_at: row.created_at,
    updated_at: row.updated_at
  }))
}

export async function insertRegraAutomacao(regra: Omit<RegraAutomacaoDB, 'id' | 'created_at' | 'updated_at'>): Promise<RegraAutomacaoDB> {
  const { data, error } = await supabase
    .from('regras_automacao')
    .insert({
      nome: regra.nome,
      ativa: regra.ativa,
      gatilho: regra.gatilho,
      condicoes: regra.condicoes,
      acao: regra.acao
    })
    .select()
    .single()
  
  if (error) throw error
  if (!data) throw new Error('Erro ao criar regra')
  
  return {
    id: data.id,
    nome: data.nome,
    ativa: data.ativa,
    gatilho: data.gatilho,
    condicoes: data.condicoes || {},
    acao: data.acao || {},
    created_at: data.created_at,
    updated_at: data.updated_at
  }
}

export async function updateRegraAutomacao(id: number, regra: Partial<RegraAutomacaoDB>): Promise<void> {
  const updateData: any = {}
  if (regra.nome !== undefined) updateData.nome = regra.nome
  if (regra.ativa !== undefined) updateData.ativa = regra.ativa
  if (regra.gatilho !== undefined) updateData.gatilho = regra.gatilho
  if (regra.condicoes !== undefined) updateData.condicoes = regra.condicoes
  if (regra.acao !== undefined) updateData.acao = regra.acao
  
  const { error } = await supabase
    .from('regras_automacao')
    .update(updateData)
    .eq('id', id)
  
  if (error) throw error
}

export async function deleteRegraAutomacao(id: number): Promise<void> {
  const { error } = await supabase
    .from('regras_automacao')
    .delete()
    .eq('id', id)
  
  if (error) throw error
}

// ============================================
// AUTOMAÇÃO DE MENSAGENS (IA)
// ============================================

export interface MensagemAutomacaoDB {
  id: number
  nome: string
  ativa: boolean
  gatilho: 'mudanca_etapa' | 'substatus' | 'data_especifica' | 'inatividade'
  condicoes: {
    etapaDestino?: string
    subStatus?: string
    diasInatividade?: number
    diasAposEvento?: number
  }
  config: {
    canal: 'whatsapp' | 'email'
    usarIA: boolean
    promptIA?: string
    mensagemFixa?: string
    instrucoes?: string
  }
  created_at?: string
  updated_at?: string
}

export async function getMensagensAutomacao(): Promise<MensagemAutomacaoDB[]> {
  const { data, error } = await supabase
    .from('mensagens_automacao')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Erro ao buscar mensagens:', error)
    return []
  }
  
  return (data || []).map(row => ({
    id: row.id,
    nome: row.nome,
    ativa: row.ativa,
    gatilho: row.gatilho,
    condicoes: row.condicoes || {},
    config: row.config || {},
    created_at: row.created_at,
    updated_at: row.updated_at
  }))
}

export async function insertMensagemAutomacao(mensagem: Omit<MensagemAutomacaoDB, 'id' | 'created_at' | 'updated_at'>): Promise<MensagemAutomacaoDB> {
  const { data, error } = await supabase
    .from('mensagens_automacao')
    .insert({
      nome: mensagem.nome,
      ativa: mensagem.ativa,
      gatilho: mensagem.gatilho,
      condicoes: mensagem.condicoes,
      config: mensagem.config
    })
    .select()
    .single()
  
  if (error) throw error
  if (!data) throw new Error('Erro ao criar mensagem automática')
  
  return {
    id: data.id,
    nome: data.nome,
    ativa: data.ativa,
    gatilho: data.gatilho,
    condicoes: data.condicoes || {},
    config: data.config || {},
    created_at: data.created_at,
    updated_at: data.updated_at
  }
}

export async function updateMensagemAutomacao(id: number, mensagem: Partial<MensagemAutomacaoDB>): Promise<void> {
  const updateData: any = {}
  if (mensagem.nome !== undefined) updateData.nome = mensagem.nome
  if (mensagem.ativa !== undefined) updateData.ativa = mensagem.ativa
  if (mensagem.gatilho !== undefined) updateData.gatilho = mensagem.gatilho
  if (mensagem.condicoes !== undefined) updateData.condicoes = mensagem.condicoes
  if (mensagem.config !== undefined) updateData.config = mensagem.config
  
  const { error } = await supabase
    .from('mensagens_automacao')
    .update(updateData)
    .eq('id', id)
  
  if (error) throw error
}

export async function deleteMensagemAutomacao(id: number): Promise<void> {
  const { error } = await supabase
    .from('mensagens_automacao')
    .delete()
    .eq('id', id)
  
  if (error) throw error
}

// ============================================
// FUNÇÃO PARA PROCESSAR REGRAS E CRIAR TAREFAS
// ============================================

export async function processarRegrasAutomacao(
  clienteId: number,
  toStage: string,
  fromStage: string,
  vendedorId: number,
  nomeCliente: string
): Promise<Tarefa[]> {
  const tarefasCriadas: Tarefa[] = []
  
  try {
    // Buscar regras ativas para esta etapa
    const { data: regras, error } = await supabase
      .from('regras_automacao')
      .select('*')
      .eq('ativa', true)
      .eq('gatilho', 'mudanca_etapa')
      .or(`condicoes->>etapaDestino.eq.${toStage},condicoes->>etapaDestino.is.null`)
    
    if (error || !regras || regras.length === 0) {
      return tarefasCriadas
    }
    
    const dataDaqui = (dias: number) => new Date(Date.now() + dias * 86400000).toISOString().split('T')[0]
    
    for (const regra of regras) {
      const condicoes = regra.condicoes || {}
      
      // Verificar se a regra se aplica
      if (condicoes.etapaDestino && condicoes.etapaDestino !== toStage) continue
      if (condicoes.etapaOrigem && condicoes.etapaOrigem !== fromStage) continue
      
      // Substituir {cliente} pelo nome real
      const titulo = (regra.acao?.titulo || '').replace(/\{cliente\}/g, nomeCliente)
      const descricao = (regra.acao?.descricao || '').replace(/\{cliente\}/g, nomeCliente)
      
      // Criar a tarefa
      const novaTarefa = await insertTarefa({
        titulo,
        descricao,
        data: dataDaqui(regra.acao?.diasPrazo || 7),
        hora: regra.acao?.horaPadrao || '10:00',
        tipo: regra.acao?.tipo || 'outro',
        status: 'pendente',
        prioridade: regra.acao?.prioridade || 'media',
        clienteId,
        vendedorId
      })
      
      tarefasCriadas.push(novaTarefa)
    }
  } catch (err) {
    console.error('Erro ao processar regras de automação:', err)
  }
  
  return tarefasCriadas
}

// ============================================
// PROCESSAR REGRAS QUANDO TAREFA É CONCLUÍDA
// ============================================
export async function processarRegrasTarefaConcluida(
  tarefaConcluida: Tarefa,
  etapaCliente: string,
  nomeCliente: string,
  vendedorId: number
): Promise<Tarefa[]> {
  const tarefasCriadas: Tarefa[] = []

  try {
    const { data: regras, error } = await supabase
      .from('regras_automacao')
      .select('*')
      .eq('ativa', true)
      .eq('gatilho', 'tarefa_concluida')

    if (error) {
      console.error('Erro ao buscar regras tarefa_concluida:', error)
      return tarefasCriadas
    }

    if (!regras || regras.length === 0) {
      console.log('Nenhuma regra ativa para gatilho tarefa_concluida')
      return tarefasCriadas
    }

    console.log(`[Automação] Tarefa concluída: ${tarefaConcluida.titulo} (tipo: ${tarefaConcluida.tipo}, etapa cliente: ${etapaCliente}). Verificando ${regras.length} regra(s)...`)

    const dataDaqui = (dias: number) => new Date(Date.now() + dias * 86400000).toISOString().split('T')[0]

    for (const regra of regras) {
      const condicoes = regra.condicoes || {}

      // Filtrar por tarefa específica
      if (condicoes.tarefaEspecifica) {
        if (tarefaConcluida.titulo !== condicoes.tarefaEspecifica) {
          console.log(`  -> Regra "${regra.nome}" não aplicável: tarefa "${tarefaConcluida.titulo}" !== "${condicoes.tarefaEspecifica}"`)
          continue
        }
      }

      // Filtrar por tipo de tarefa
      if (condicoes.tipoTarefaConcluida && condicoes.tipoTarefaConcluida !== 'qualquer') {
        if (condicoes.tipoTarefaConcluida !== tarefaConcluida.tipo) {
          console.log(`  -> Regra "${regra.nome}" não aplicável: tipo ${condicoes.tipoTarefaConcluida} !== ${tarefaConcluida.tipo}`)
          continue
        }
      }

      // Filtrar por etapa do cliente
      if (condicoes.etapaCliente && condicoes.etapaCliente !== etapaCliente) {
        console.log(`  -> Regra "${regra.nome}" não aplicável: etapaCliente ${condicoes.etapaCliente} !== ${etapaCliente}`)
        continue
      }

      console.log(`  -> Regra "${regra.nome}" APLICADA! Criando tarefa...`)

      const titulo = (regra.acao?.titulo || '').replace(/\{cliente\}/g, nomeCliente)
      const descricao = (regra.acao?.descricao || '').replace(/\{cliente\}/g, nomeCliente)

      const novaTarefa = await insertTarefa({
        titulo,
        descricao,
        data: dataDaqui(regra.acao?.diasPrazo || 7),
        hora: regra.acao?.horaPadrao || undefined,
        tipo: regra.acao?.tipo || 'outro',
        status: 'pendente',
        prioridade: regra.acao?.prioridade || 'media',
        clienteId: tarefaConcluida.clienteId,
        vendedorId
      })

      tarefasCriadas.push(novaTarefa)
    }
  } catch (err) {
    console.error('Erro ao processar regras de tarefa concluída:', err)
  }

  return tarefasCriadas
}

// ============================================
// Contexto da IA
// ============================================

export interface IAContexto {
  id: string
  secao: string
  titulo: string
  tipo: 'texto' | 'pdf' | 'regra' | 'produto'
  conteudo: string
  urlArquivo?: string
  tamanhoArquivo?: number
  criadoPor?: string
  criadoEm: string
  atualizadoEm: string
  ativo: boolean
}

export function iaContextoFromDb(row: any): IAContexto {
  return {
    id: row.id,
    secao: row.secao,
    titulo: row.titulo,
    tipo: row.tipo,
    conteudo: row.conteudo,
    urlArquivo: row.url_arquivo,
    tamanhoArquivo: row.tamanho_arquivo,
    criadoPor: row.criado_por,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    ativo: row.ativo
  }
}

export async function getIAContexto(secao?: string): Promise<IAContexto[]> {
  try {
    let query = supabase
      .from('ia_contexto')
      .select('*')
      .eq('ativo', true)
      .order('criado_em', { ascending: false })

    if (secao) {
      query = query.eq('secao', secao)
    }

    const { data, error } = await query

    if (error) throw error
    return data ? data.map(iaContextoFromDb) : []
  } catch (err) {
    console.error('Erro ao buscar contexto da IA:', err)
    return []
  }
}

export async function createIAContexto(
  secao: string,
  titulo: string,
  tipo: 'texto' | 'pdf' | 'regra' | 'produto',
  conteudo: string,
  urlArquivo?: string,
  tamanhoArquivo?: number
): Promise<IAContexto | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { data, error } = await supabase
      .from('ia_contexto')
      .insert({
        secao,
        titulo,
        tipo,
        conteudo,
        url_arquivo: urlArquivo,
        tamanho_arquivo: tamanhoArquivo,
        criado_por: user.id
      })
      .select()
      .single()

    if (error) throw error
    return data ? iaContextoFromDb(data) : null
  } catch (err) {
    console.error('Erro ao criar contexto da IA:', err)
    return null
  }
}

export async function updateIAContexto(
  id: string,
  updates: Partial<{
    titulo: string
    conteudo: string
    urlArquivo: string
    tamanhoArquivo: number
    ativo: boolean
  }>
): Promise<IAContexto | null> {
  try {
    const updateData: any = {}
    if (updates.titulo !== undefined) updateData.titulo = updates.titulo
    if (updates.conteudo !== undefined) updateData.conteudo = updates.conteudo
    if (updates.urlArquivo !== undefined) updateData.url_arquivo = updates.urlArquivo
    if (updates.tamanhoArquivo !== undefined) updateData.tamanho_arquivo = updates.tamanhoArquivo
    if (updates.ativo !== undefined) updateData.ativo = updates.ativo

    const { data, error } = await supabase
      .from('ia_contexto')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data ? iaContextoFromDb(data) : null
  } catch (err) {
    console.error('Erro ao atualizar contexto da IA:', err)
    return null
  }
}

export async function deleteIAContexto(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('ia_contexto')
      .delete()
      .eq('id', id)

    if (error) throw error
    return true
  } catch (err) {
    console.error('Erro ao deletar contexto da IA:', err)
    return false
  }
}

export async function uploadArquivoIAContexto(
  arquivo: File,
  secao: string,
  titulo: string
): Promise<{ url: string; tamanho: number } | null> {
  try {
    // Gerar nome único para o arquivo
    const timestamp = Date.now()
    const extensao = arquivo.name.split('.').pop()
    const nomeArquivo = `ia-contexto/${secao}/${timestamp}-${arquivo.name}`

    // Fazer upload para o Supabase Storage
    const { data, error } = await supabase.storage
      .from('documentos')
      .upload(nomeArquivo, arquivo, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) throw error

    // Obter URL pública
    const { data: { publicUrl } } = supabase.storage
      .from('documentos')
      .getPublicUrl(data.path)

    return {
      url: publicUrl,
      tamanho: arquivo.size
    }
  } catch (err) {
    console.error('Erro ao fazer upload de arquivo:', err)
    return null
  }
}

// ============================================
// Automações
// ============================================

export interface Automacao {
  id: string
  nome: string
  descricao?: string
  tipo: 'mensagem' | 'tarefa' | 'etapa' | 'notificacao' | 'email' | 'whatsapp'
  status: 'ativa' | 'pausada' | 'rascunho'
  gatilhoTipo: 'tempo' | 'evento' | 'manual'
  gatilhoConfig: Record<string, any>
  acoes: Array<{
    tipo: string
    configuracao: Record<string, any>
    ordem: number
  }>
  criadoPor?: string
  criadoEm: string
  atualizadoEm: string
  execucoes: number
  ultimaExecucao?: string
  proximaExecucao?: string
  ativo: boolean
}

export interface AutomacaoExecucao {
  id: string
  automacaoId: string
  status: 'sucesso' | 'erro' | 'executando'
  inicio: string
  fim?: string
  resultado?: Record<string, any>
  erroMensagem?: string
  dadosEntrada?: Record<string, any>
  criadoEm: string
}

export function automacaoFromDb(row: any): Automacao {
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao,
    tipo: row.tipo,
    status: row.status,
    gatilhoTipo: row.gatilho_tipo,
    gatilhoConfig: row.gatilho_config || {},
    acoes: row.acoes || [],
    criadoPor: row.criado_por,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    execucoes: row.execucoes || 0,
    ultimaExecucao: row.ultima_execucao,
    proximaExecucao: row.proxima_execucao,
    ativo: row.ativo
  }
}

export function automacaoExecucaoFromDb(row: any): AutomacaoExecucao {
  return {
    id: row.id,
    automacaoId: row.automacao_id,
    status: row.status,
    inicio: row.inicio,
    fim: row.fim,
    resultado: row.resultado,
    erroMensagem: row.erro_mensagem,
    dadosEntrada: row.dados_entrada,
    criadoEm: row.criado_em
  }
}

export async function getAutomacoes(): Promise<Automacao[]> {
  try {
    const { data, error } = await supabase
      .from('automacoes')
      .select('*')
      .eq('ativo', true)
      .order('criado_em', { ascending: false })

    if (error) throw error
    return data ? data.map(automacaoFromDb) : []
  } catch (err) {
    console.error('Erro ao buscar automações:', err)
    return []
  }
}

export async function getAutomacao(id: string): Promise<Automacao | null> {
  try {
    const { data, error } = await supabase
      .from('automacoes')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data ? automacaoFromDb(data) : null
  } catch (err) {
    console.error('Erro ao buscar automação:', err)
    return null
  }
}

export async function createAutomacao(
  nome: string,
  descricao: string,
  tipo: Automacao['tipo'],
  gatilhoTipo: Automacao['gatilhoTipo'],
  gatilhoConfig: Record<string, any>,
  acoes: Array<{
    tipo: string
    configuracao: Record<string, any>
    ordem: number
  }>
): Promise<Automacao | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { data, error } = await supabase
      .from('automacoes')
      .insert({
        nome,
        descricao,
        tipo,
        gatilho_tipo: gatilhoTipo,
        gatilho_config: gatilhoConfig,
        acoes,
        criado_por: user.id
      })
      .select()
      .single()

    if (error) throw error
    return data ? automacaoFromDb(data) : null
  } catch (err) {
    console.error('Erro ao criar automação:', err)
    return null
  }
}

export async function updateAutomacao(
  id: string,
  updates: Partial<{
    nome: string
    descricao: string
    tipo: Automacao['tipo']
    status: Automacao['status']
    gatilhoTipo: Automacao['gatilhoTipo']
    gatilhoConfig: Record<string, any>
    acoes: Array<{
      tipo: string
      configuracao: Record<string, any>
      ordem: number
    }>
    execucoes: number
    ultimaExecucao: string
    proximaExecucao: string
    ativo: boolean
  }>
): Promise<Automacao | null> {
  try {
    const updateData: any = {}
    if (updates.nome !== undefined) updateData.nome = updates.nome
    if (updates.descricao !== undefined) updateData.descricao = updates.descricao
    if (updates.tipo !== undefined) updateData.tipo = updates.tipo
    if (updates.status !== undefined) updateData.status = updates.status
    if (updates.gatilhoTipo !== undefined) updateData.gatilho_tipo = updates.gatilhoTipo
    if (updates.gatilhoConfig !== undefined) updateData.gatilho_config = updates.gatilhoConfig
    if (updates.acoes !== undefined) updateData.acoes = updates.acoes
    if (updates.execucoes !== undefined) updateData.execucoes = updates.execucoes
    if (updates.ultimaExecucao !== undefined) updateData.ultima_execucao = updates.ultimaExecucao
    if (updates.proximaExecucao !== undefined) updateData.proxima_execucao = updates.proximaExecucao
    if (updates.ativo !== undefined) updateData.ativo = updates.ativo

    const { data, error } = await supabase
      .from('automacoes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data ? automacaoFromDb(data) : null
  } catch (err) {
    console.error('Erro ao atualizar automação:', err)
    return null
  }
}

export async function deleteAutomacao(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('automacoes')
      .delete()
      .eq('id', id)

    if (error) throw error
    return true
  } catch (err) {
    console.error('Erro ao deletar automação:', err)
    return false
  }
}

export async function getAutomacoesExecucoes(automacaoId?: string): Promise<AutomacaoExecucao[]> {
  try {
    let query = supabase
      .from('automacoes_execucoes')
      .select('*')
      .order('criado_em', { ascending: false })

    if (automacaoId) {
      query = query.eq('automacao_id', automacaoId)
    }

    const { data, error } = await query

    if (error) throw error
    return data ? data.map(automacaoExecucaoFromDb) : []
  } catch (err) {
    console.error('Erro ao buscar execuções de automação:', err)
    return []
  }
}

export async function registrarExecucaoAutomacao(
  automacaoId: string,
  status: 'sucesso' | 'erro' | 'executando',
  dadosEntrada?: Record<string, any>,
  resultado?: Record<string, any>,
  erroMensagem?: string
): Promise<AutomacaoExecucao | null> {
  try {
    const { data, error } = await supabase
      .from('automacoes_execucoes')
      .insert({
        automacao_id: automacaoId,
        status,
        dados_entrada: dadosEntrada,
        resultado,
        erro_mensagem: erroMensagem
      })
      .select()
      .single()

    if (error) throw error
    return data ? automacaoExecucaoFromDb(data) : null
  } catch (err) {
    console.error('Erro ao registrar execução de automação:', err)
    return null
  }
}
