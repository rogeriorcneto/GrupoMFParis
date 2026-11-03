import { supabase } from '../src/supabase.js'

async function listar(tabela: string, colunas: string) {
  const rows: any[] = []
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabase.from(tabela).select(colunas).order('id').range(inicio, inicio + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < 1000) return rows
  }
}

const normalizar = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')
const documento = (c: any) => (c.cnpj || c.cpf || '').replace(/\D/g, '')
const clientes = await listar('clientes', 'id,razao_social,cnpj,cpf,omie_codigo,etapa,ciclo_numero,vendedor_id,novo_ciclo,data_entrada_etapa')
if (!clientes.length) throw new Error('Consulta sem clientes visíveis. Verifique ambiente e permissões/RLS antes de concluir que não existem duplicatas.')
const ativos = clientes.filter(c => ['proposta', 'negociacao'].includes(c.etapa))
const pais = new Map(ativos.map(c => [c.id, c.id]))
const raiz = (id: number): number => {
  const pai = pais.get(id)!
  if (pai === id) return id
  const root = raiz(pai)
  pais.set(id, root)
  return root
}
const chaves = (c: any) => [normalizar(c.razao_social) && `nome:${normalizar(c.razao_social)}`, documento(c) && `doc:${documento(c)}`, c.omie_codigo && `omie:${c.omie_codigo}`].filter(Boolean)
const indices = new Map<string, number>()
for (const c of ativos) {
  for (const key of chaves(c)) {
    if (indices.has(key)) pais.set(raiz(c.id), raiz(indices.get(key)!))
    else indices.set(key, c.id)
  }
}
const grupos = new Map<number, any[]>()
for (const c of ativos) grupos.set(raiz(c.id), [...(grupos.get(raiz(c.id)) || []), c])
const candidatos = [...grupos.values()].filter(g => g.length > 1)
const familiaDe = (cards: any[]) => {
  const keys = new Set(cards.flatMap(chaves))
  return clientes.filter(c => chaves(c).some(key => keys.has(key)))
}
const ids = new Set(candidatos.flatMap(familiaDe).map(c => c.id))
const pedidos = (await listar('pedidos', 'id,numero,cliente_id,status,tipo,omie_codigo,omie_numero')).filter(p => ids.has(p.cliente_id))
const historicos = (await listar('historico_etapas', 'id,cliente_id,etapa,etapa_anterior,data')).filter(h => ids.has(h.cliente_id))
const resultado = candidatos.map(cards => {
  const familia = familiaDe(cards)
  const docs = new Set(familia.map(documento).filter(Boolean))
  const omies = new Set(familia.map(c => String(c.omie_codigo || '').trim()).filter(Boolean))
  return {
    nome: cards[0].razao_social,
    classificacao: docs.size > 1 || omies.size > 1 ? 'identidade_ambigua_revisar' : 'possivel_duplicata_mesma_empresa',
    cardsAtivos: cards.length,
    cards: familia.map(c => ({
      id: c.id, etapa: c.etapa, ativoNoComercial: ['proposta', 'negociacao'].includes(c.etapa), ciclo: c.ciclo_numero ?? null, vendedorId: c.vendedor_id,
      temDocumento: Boolean(documento(c)), omieCliente: c.omie_codigo || null,
      pedidos: pedidos.filter(p => p.cliente_id === c.id).map(p => ({ id: p.id, numero: p.numero, status: p.status, tipo: p.tipo, omieCodigo: p.omie_codigo, omieNumero: p.omie_numero })),
      historico: historicos.filter(h => h.cliente_id === c.id).map(h => ({ etapa: h.etapa, de: h.etapa_anterior, data: h.data })),
    })),
  }
})
const resumo = {
  consulta: new Date().toISOString(), somenteLeitura: true,
  totalClientes: clientes.length, totalAtivos: ativos.length, gruposCandidatos: resultado.length,
  cardsAtivosNosGrupos: resultado.reduce((s, g) => s + g.cardsAtivos, 0),
  cardsRelacionadosIncluindoHistorico: ids.size,
  gruposComIdentidadeAmbigua: resultado.filter(g => g.classificacao === 'identidade_ambigua_revisar').length,
}
const classificacoes = resultado.map(g => {
  const ativosGrupo = g.cards.filter(c => c.ativoNoComercial)
  const pedidosAtivos = ativosGrupo.flatMap(c => c.pedidos)
  const classe = g.classificacao === 'identidade_ambigua_revisar' ? 'I'
    : pedidosAtivos.some(p => p.status !== 'cancelado') ? 'P'
    : pedidosAtivos.length ? 'C' : 'S'
  return { nome: g.nome, classe, ativos: ativosGrupo.map(c => `${c.id}:${c.etapa === 'proposta' ? 'P' : 'N'}:c${c.ciclo ?? '?'}`).join(','), pedidos: g.cards.flatMap(c => c.pedidos.map(p => `${p.id}/${p.numero}@${c.id}:${p.status}:${p.tipo || 'venda'}${p.omieNumero ? ':Omie=' + p.omieNumero : ''}`)).join(',') || '-', historicos: g.cards.filter(c => !c.ativoNoComercial).map(c => `${c.id}:${c.etapa}:c${c.ciclo ?? '?'}`).join(',') || '-' }
})
if (process.argv.includes('--classificar')) {
  console.log(JSON.stringify({ ...resumo, classes: Object.fromEntries(['I', 'P', 'C', 'S'].map(classe => [classe, classificacoes.filter(g => g.classe === classe).length])) }))
  console.log('NOME|CLASSE|CARDS_ATIVOS_ID_ETAPA_CICLO|PEDIDOS_ID_NUMERO_CARD_STATUS_TIPO_OMIE|OUTROS_CICLOS')
  for (const g of classificacoes.sort((a, b) => a.classe.localeCompare(b.classe) || a.nome.localeCompare(b.nome))) console.log([g.nome, g.classe, g.ativos, g.pedidos, g.historicos].join('|'))
} else console.log(JSON.stringify(process.argv.includes('--resumo') ? {
  ...resumo,
  exemplos: [...resultado].sort((a, b) => b.cardsAtivos - a.cardsAtivos).slice(0, 10).map(g => ({
    nome: g.nome, classificacao: g.classificacao,
    ativos: g.cards.filter(c => c.ativoNoComercial).map(c => ({ id: c.id, etapa: c.etapa, ciclo: c.ciclo, pedidos: c.pedidos.map(p => `${p.numero}:${p.status}`) })),
  })),
} : { ...resumo, grupos: resultado }, null, 2))
