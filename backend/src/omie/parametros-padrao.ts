import { supabase } from '../supabase.js'
import { log } from '../logger.js'

// ============================================
// Parâmetros padrão de pedido Omie
// O gerente salva uma "configuração modelo" no painel de parâmetros
// e ela é aplicada: (a) quando ele abrir outro pedido e clicar
// "Aplicar padrão"; (b) automaticamente em todo pedido novo enviado
// ao Omie via IncluirPedido (campos de cabeçalho/frete/info adicionais).
// ============================================

const KV_KEY = 'omie_param_defaults'

/** Campos reutilizáveis entre pedidos — itens, parcelas, endereço de
 *  entrega e vendedor são específicos de cada venda e ficam de fora. */
const TEMPLATE_PATHS: string[] = [
  // Cabeçalho — etapa e cenário fiscal são regras de negócio, não do pedido.
  // codigo_parcela/qtde_parcelas/data_previsao NÃO entram: derivam do
  // pagamento de cada venda (fixá-los quebraria a lista_parcelas).
  'cabecalho.etapa',
  'cabecalho.codigo_cenario_impostos',
  // Frete — pesos, volumes e valor do frete são por-carga; modalidade,
  // espécie e despesas fixas podem ser padrão.
  'frete.modalidade',
  'frete.valor_seguro',
  'frete.outras_despesas',
  'frete.especie_volumes',
  'frete.marca_volumes',
  // Informações adicionais — categoria/conta/tabela de preço são da empresa.
  // codVend e endereco_entrega ficam de fora (variam por venda/cliente).
  'informacoes_adicionais.codigo_categoria',
  'informacoes_adicionais.codigo_conta_corrente',
  'informacoes_adicionais.codigo_tabela_preco',
  'informacoes_adicionais.consumidor_final',
  'informacoes_adicionais.enviar_email',
  // Observação padrão (ex.: "CIF - Nosso motorista entrega.")
  'observacoes.obs_venda',
]

async function kvSet(key: string, value: unknown): Promise<void> {
  await supabase.from('whatsapp_session').upsert({ key, value: value as any }, { onConflict: 'key' })
}

async function kvGet<T>(key: string): Promise<T | null> {
  const { data } = await supabase.from('whatsapp_session').select('value').eq('key', key).maybeSingle()
  return (data?.value as T) ?? null
}

function getPath(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => o?.[k], obj)
}

function setPath(obj: any, path: string, value: any): void {
  const keys = path.split('.')
  let target = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (target[keys[i]] == null || typeof target[keys[i]] !== 'object') target[keys[i]] = {}
    target = target[keys[i]]
  }
  target[keys[keys.length - 1]] = value
}

/** Extrai de uma estrutura ConsultarPedido só os campos reutilizáveis. */
export function extrairParametrosPadrao(estrutura: any): Record<string, any> {
  const template: Record<string, any> = {}
  for (const path of TEMPLATE_PATHS) {
    const v = getPath(estrutura, path)
    if (v !== undefined && v !== null && v !== '') setPath(template, path, v)
  }
  return template
}

export async function obterParametrosPadrao(): Promise<Record<string, any> | null> {
  return kvGet<Record<string, any>>(KV_KEY)
}

/** Salva o template extraído da estrutura editada (só campos reutilizáveis). */
export async function salvarParametrosPadrao(estrutura: any): Promise<Record<string, any>> {
  const template = extrairParametrosPadrao(estrutura)
  template._salvo_em = new Date().toISOString()
  await kvSet(KV_KEY, template)
  log.info({ campos: Object.keys(template).length }, '💾 Parâmetros padrão Omie salvos')
  return template
}

/**
 * Aplica o template salvo sobre uma estrutura-alvo (template vence).
 * `incluirObservacoes=false` no fluxo de novos pedidos: a obs padrão não
 * deve apagar a observação específica de cada venda — só se aplica quando
 * o gerente clica explicitamente "Aplicar padrão" no editor.
 */
export async function aplicarParametrosPadrao(target: any, opts?: { incluirObservacoes?: boolean }): Promise<any> {
  const template = await obterParametrosPadrao()
  if (!template) return target

  for (const path of TEMPLATE_PATHS) {
    if (!opts?.incluirObservacoes && path === 'observacoes.obs_venda') continue
    const v = getPath(template, path)
    if (v !== undefined && v !== null && v !== '') setPath(target, path, v)
  }
  return target
}
