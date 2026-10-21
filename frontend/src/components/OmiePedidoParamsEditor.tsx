import React, { useCallback, useEffect, useState } from 'react'
import { authFetch, BOT_URL } from '../lib/botApi'

interface Props {
  pedidoId: number
  pedidoNumero: string
  onClose: () => void
  showToast?: (tipo: 'success' | 'error', texto: string) => void
}

type Struct = Record<string, any>

/** Painel de parâmetros do pedido já integrado ao Omie.
 *  Puxa a estrutura completa via ConsultarPedido, permite editar campo
 *  a campo por seções e regrava com AlterarPedidoVenda (que substitui
 *  o pedido inteiro — por isso sempre partimos da estrutura lida). */
export default function OmiePedidoParamsEditor({ pedidoId, pedidoNumero, onClose, showToast }: Props) {
  const [estrutura, setEstrutura] = useState<Struct | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await authFetch(`${BOT_URL}/api/omie/pedidos/${pedidoId}/estrutura`)
      const j = await res.json()
      if (j.success) {
        const data = j.data || {}
        // ConsultarPedido pode devolver frete como "transporte" — normaliza pra "frete"
        if (data.transporte && !data.frete) {
          data.frete = data.transporte
          delete data.transporte
        }
        setEstrutura(data)
      }
      else setLoadError(j.error || 'Erro ao carregar parâmetros')
    } catch (err: any) {
      setLoadError(err?.message || 'Erro ao carregar parâmetros')
    } finally {
      setLoading(false)
    }
  }, [pedidoId])

  useEffect(() => { carregar() }, [carregar])

  const setPath = (path: string, value: any) => {
    setEstrutura(prev => {
      if (!prev) return prev
      const clone = structuredClone(prev)
      const keys = path.split('.')
      let obj: any = clone
      for (let i = 0; i < keys.length - 1; i++) {
        if (obj[keys[i]] == null) obj[keys[i]] = {}
        obj = obj[keys[i]]
      }
      obj[keys[keys.length - 1]] = value
      return clone
    })
  }

  const num = (v: any) => (v === '' || v == null ? undefined : Number(v))

  const TEMPLATE_PATHS = [
    'cabecalho.etapa', 'cabecalho.codigo_cenario_impostos',
    'frete.modalidade', 'frete.valor_seguro', 'frete.outras_despesas',
    'frete.especie_volumes', 'frete.marca_volumes',
    'informacoes_adicionais.codigo_categoria', 'informacoes_adicionais.codigo_conta_corrente',
    'informacoes_adicionais.codigo_tabela_preco', 'informacoes_adicionais.consumidor_final',
    'informacoes_adicionais.enviar_email', 'observacoes.obs_venda',
  ]

  const getPath = (obj: any, path: string) => path.split('.').reduce((o, k) => o?.[k], obj)

  const aplicarPadrao = async () => {
    if (!estrutura || saving) return
    setSaving(true)
    try {
      const res = await authFetch(`${BOT_URL}/api/omie/parametros-padrao`)
      const j = await res.json()
      const template = j.data
      if (!j.success || !template || Object.keys(template).length === 0) {
        showToast?.('error', 'Nenhum parâmetro padrão salvo ainda. Use "Salvar como padrão".')
        return
      }
      setEstrutura(prev => {
        if (!prev) return prev
        const clone = structuredClone(prev)
        for (const path of TEMPLATE_PATHS) {
          const v = getPath(template, path)
          if (v !== undefined && v !== null && v !== '') {
            const keys = path.split('.')
            let obj: any = clone
            for (let i = 0; i < keys.length - 1; i++) {
              if (obj[keys[i]] == null) obj[keys[i]] = {}
              obj = obj[keys[i]]
            }
            obj[keys[keys.length - 1]] = v
          }
        }
        return clone
      })
      showToast?.('success', 'Parâmetros padrão aplicados — revise e salve no pedido.')
    } catch (err: any) {
      showToast?.('error', err?.message || 'Erro ao carregar padrão')
    } finally {
      setSaving(false)
    }
  }

  const salvar = async (comoPadrao = false) => {
    if (!estrutura || saving) return
    setSaving(true)
    try {
      const res = await authFetch(`${BOT_URL}/api/omie/pedidos/${pedidoId}/estrutura`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estrutura }),
      })
      const j = await res.json()
      if (!j.success) {
        showToast?.('error', j.error || 'Omie rejeitou a alteração')
        return
      }
      if (comoPadrao) {
        const resPadrao = await authFetch(`${BOT_URL}/api/omie/parametros-padrao`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estrutura }),
        })
        const jPadrao = await resPadrao.json()
        if (!jPadrao.success) {
          showToast?.('error', `Pedido salvo, mas falhou ao gravar padrão: ${jPadrao.error || 'erro'}`)
          onClose()
          return
        }
        showToast?.('success', `Pedido ${pedidoNumero} atualizado e parâmetros viraram padrão para próximas vendas`)
      } else {
        showToast?.('success', `Pedido ${pedidoNumero} atualizado no Omie`)
      }
      onClose()
    } catch (err: any) {
      showToast?.('error', err?.message || 'Erro ao salvar no Omie')
    } finally {
      setSaving(false)
    }
  }

  const input = (path: string, label: string, type: 'text' | 'number' = 'text', ro = false, hint?: string) => {
    const keys = path.split('.')
    let val: any = estrutura
    for (const k of keys) val = val?.[k]
    return (
      <label key={path} className="block">
        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide" title={hint}>{label}</span>
        <input
          type={type}
          step={type === 'number' ? 'any' : undefined}
          value={val ?? ''}
          disabled={ro || saving}
          onChange={e => setPath(path, type === 'number' ? num(e.target.value) : e.target.value)}
          className="mt-0.5 w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg disabled:bg-gray-50 disabled:text-gray-400"
        />
      </label>
    )
  }

  const cab = estrutura?.cabecalho || {}
  const det: any[] = Array.isArray(estrutura?.det) ? estrutura.det : []
  const frete = estrutura?.frete || {}
  const infAdic = estrutura?.informacoes_adicionais || {}
  const parcelas: any[] = estrutura?.lista_parcelas?.parcela || []
  const obs = estrutura?.observacoes || {}
  const totalPedido = estrutura?.total_pedido || {}
  void cab; void frete; void infAdic; void obs

  const fmt = (v: any) => v == null ? '—' : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-apple shadow-apple-lg max-w-3xl w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">⚙️ Parâmetros Omie — {pedidoNumero}</h2>
            <p className="text-[11px] text-gray-400">Alterações regravam o pedido inteiro no Omie (AlterarPedidoVenda). Pedido faturado pode rejeitar edições.</p>
          </div>
          <button onClick={onClose} disabled={saving} className="text-gray-400 hover:text-gray-600 text-xl leading-none disabled:opacity-50">×</button>
        </div>

        <div className="p-6 space-y-6">
          {loading && <p className="text-sm text-gray-400 text-center py-8">⏳ Carregando estrutura do pedido no Omie…</p>}
          {loadError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-apple text-center">
              <p className="text-sm text-red-700">{loadError}</p>
              <button onClick={carregar} className="mt-2 text-xs text-red-600 underline">Tentar novamente</button>
            </div>
          )}

          {estrutura && !loading && (
            <>
              {/* ── Cabeçalho ── */}
              <section>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">📋 Cabeçalho</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {input('cabecalho.codigo_pedido', 'Código Omie', 'text', true)}
                  {input('cabecalho.numero_pedido', 'Nº Pedido', 'text', true)}
                  {input('cabecalho.etapa', 'Etapa', 'text', false, '10=pedido, 20=separação, 50=faturar…')}
                  {input('cabecalho.data_previsao', 'Previsão (dd/mm/aaaa)')}
                  {input('cabecalho.codigo_parcela', 'Cód. parcela')}
                  {input('cabecalho.qtde_parcelas', 'Qtde parcelas', 'number')}
                  {input('cabecalho.codigo_cenario_impostos', 'Cenário fiscal')}
                </div>
              </section>

              {/* ── Itens ── */}
              <section>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">📦 Itens ({det.length})</h3>
                <div className="space-y-3">
                  {det.map((item, i) => (
                    <div key={i} className="border border-gray-200 rounded-apple p-3 bg-gray-50/50">
                      <p className="text-xs font-medium text-gray-700 mb-2 truncate" title={item?.produto?.descricao}>
                        {i + 1}. {item?.produto?.descricao || `Item ${i + 1}`}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {input(`det.${i}.produto.quantidade`, 'Quantidade', 'number')}
                        {input(`det.${i}.produto.valor_unitario`, 'Valor unitário', 'number')}
                        {input(`det.${i}.produto.valor_desconto`, 'Desconto R$', 'number')}
                        {input(`det.${i}.produto.percentual_desconto`, 'Desconto %', 'number')}
                        {input(`det.${i}.produto.cfop`, 'CFOP')}
                        {input(`det.${i}.produto.ncm`, 'NCM')}
                        {input(`det.${i}.inf_adic.codigo_local_estoque`, 'Local estoque')}
                        {input(`det.${i}.inf_adic.peso_bruto`, 'Peso bruto (kg)', 'number')}
                        {input(`det.${i}.inf_adic.peso_liquido`, 'Peso líquido (kg)', 'number')}
                      </div>
                      {item?.imposto && Object.keys(item.imposto).length > 0 && (
                        <details className="mt-2">
                          <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">Impostos do item (calculado pelo Omie — somente leitura)</summary>
                          <pre className="mt-1 p-2 bg-gray-100 rounded text-[10px] text-gray-600 overflow-x-auto max-h-32 overflow-y-auto">{JSON.stringify(item.imposto, null, 1)}</pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Frete ── */}
              <section>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">🚚 Frete</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <label className="block">
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Modalidade</span>
                    <select
                      value={estrutura?.frete?.modalidade ?? ''}
                      disabled={saving}
                      onChange={e => setPath('frete.modalidade', e.target.value)}
                      className="mt-0.5 w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg disabled:bg-gray-50"
                    >
                      <option value="">—</option>
                      <option value="0">0 — CIF (emitente)</option>
                      <option value="1">1 — FOB (destinatário)</option>
                      <option value="2">2 — Terceiros</option>
                      <option value="4">4 — Próprio remetente</option>
                      <option value="9">9 — Sem frete</option>
                    </select>
                  </label>
                  {input('frete.valor_frete', 'Valor frete R$', 'number')}
                  {input('frete.valor_seguro', 'Seguro R$', 'number')}
                  {input('frete.outras_despesas', 'Outras despesas R$', 'number')}
                  {input('frete.peso_bruto', 'Peso bruto total (kg)', 'number')}
                  {input('frete.peso_liquido', 'Peso líquido total (kg)', 'number')}
                  {input('frete.quantidade_volumes', 'Volumes', 'number')}
                  {input('frete.especie_volumes', 'Espécie (FARDO/CX…)')}
                  {input('frete.marca_volumes', 'Marca volumes')}
                </div>
              </section>

              {/* ── Parcelas ── */}
              {parcelas.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-800 mb-2">💳 Parcelas ({parcelas.length})</h3>
                  <div className="space-y-2">
                    {parcelas.map((p: any, i: number) => (
                      <div key={i} className="grid grid-cols-4 gap-2 items-end border border-gray-200 rounded-apple p-2 bg-gray-50/50">
                        <span className="text-xs text-gray-500 pb-1.5">#{p?.numero_parcela ?? i + 1}</span>
                        {input(`lista_parcelas.parcela.${i}.data_vencimento`, 'Vencimento')}
                        {input(`lista_parcelas.parcela.${i}.valor`, 'Valor R$', 'number')}
                        {input(`lista_parcelas.parcela.${i}.percentual`, '%', 'number')}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Inf. adicionais / entrega ── */}
              <section>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">📌 Informações adicionais</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {input('informacoes_adicionais.codigo_categoria', 'Categoria')}
                  {input('informacoes_adicionais.codigo_conta_corrente', 'Conta corrente')}
                  {input('informacoes_adicionais.codVend', 'Cód. vendedor Omie')}
                  {input('informacoes_adicionais.codigo_tabela_preco', 'Tabela de preço')}
                  {input('informacoes_adicionais.endereco_entrega', 'Entrega — rua')}
                  {input('informacoes_adicionais.numero_entrega', 'Entrega — nº')}
                  {input('informacoes_adicionais.bairro_entrega', 'Entrega — bairro')}
                  {input('informacoes_adicionais.cep_entrega', 'Entrega — CEP')}
                  {input('informacoes_adicionais.cidade_entrega', 'Entrega — cidade')}
                  {input('informacoes_adicionais.estado_entrega', 'Entrega — UF')}
                </div>
              </section>

              {/* ── Totais/impostos calculados pelo Omie (read-only) ── */}
              {Object.keys(totalPedido).length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-800 mb-2">🧮 Totais e impostos <span className="text-[10px] font-normal text-gray-400">(calculado pelo Omie — somente leitura)</span></h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-gray-50 border border-gray-200 rounded-apple p-3">
                    {[
                      ['Mercadorias', totalPedido.valor_mercadorias],
                      ['Total pedido', totalPedido.valor_total_pedido],
                      ['ICMS', totalPedido.valor_icms],
                      ['Base ICMS', totalPedido.base_calculo_icms],
                      ['PIS', totalPedido.valor_pis],
                      ['COFINS', totalPedido.valor_cofins],
                      ['CBS', totalPedido.valor_cbs],
                      ['IBS', totalPedido.valor_ibs],
                    ].map(([label, v]) => (
                      <div key={String(label)}>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
                        <p className="text-xs font-semibold text-gray-700">{fmt(v)}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Observações ── */}
              <section>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">📝 Observações</h3>
                <textarea
                  rows={3}
                  value={estrutura?.observacoes?.obs_venda ?? ''}
                  disabled={saving}
                  onChange={e => setPath('observacoes.obs_venda', e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg resize-none disabled:bg-gray-50"
                />
              </section>
            </>
          )}
        </div>

        {estrutura && !loading && (
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-amber-700">⚠️ Salvar substitui o pedido inteiro no Omie.</p>
              <button onClick={aplicarPadrao} disabled={saving}
                className="mt-1 text-[11px] text-blue-600 hover:text-blue-800 underline disabled:opacity-50">
                ⬇️ Aplicar parâmetros padrão salvos
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} disabled={saving}
                className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={() => salvar(false)} disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded-apple hover:bg-green-700 text-sm font-medium disabled:opacity-50">
                {saving ? '⏳ Salvando…' : '💾 Salvar neste pedido'}
              </button>
              <button onClick={() => salvar(true)} disabled={saving}
                title="Salva este pedido E grava estes parâmetros como padrão para as próximas vendas"
                className="px-4 py-2 bg-blue-600 text-white rounded-apple hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
                {saving ? '⏳ Salvando…' : '⭐ Salvar como padrão'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
