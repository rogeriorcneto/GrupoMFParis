import React, { useState } from 'react'
import type { Vendedor } from '../../types'
import {
  LISTA_META,
  ListaParametroKey,
  OpcaoParametro,
  saveParametrosListas,
  useParametrosListas,
} from '../../lib/parametrosListas'

const ORDEM_ABAS: ListaParametroKey[] = [
  'segmento_cliente',
  'prazo_pagamento',
  'categoria_perda',
  'setor_contato',
  'tipo_frete',
]

interface Props {
  loggedUser: Vendedor
  showToast: (tipo: 'success' | 'error', texto: string) => void
}

export default function ParametrosView({ loggedUser, showToast }: Props) {
  const { parametros } = useParametrosListas()
  const [abaAtiva, setAbaAtiva] = useState<ListaParametroKey>('segmento_cliente')
  const [novoTexto, setNovoTexto] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editandoLabel, setEditandoLabel] = useState('')
  const [salvando, setSalvando] = useState(false)

  if (loggedUser.cargo !== 'gerente') {
    return (
      <div className="p-8 text-center text-gray-500">
        Acesso restrito a Gerente / Admin.
      </div>
    )
  }

  const listaAtual = [...(parametros.listas[abaAtiva] || [])].sort((a, b) => a.ordem - b.ordem)
  const meta = LISTA_META[abaAtiva]
  const usuario = loggedUser.nome || loggedUser.email || 'Gerente'

  const persistir = async (
    novaLista: OpcaoParametro[],
    acao: 'adicionar' | 'renomear' | 'reordenar' | 'ativar' | 'desativar',
    detalhe: string
  ) => {
    setSalvando(true)
    try {
      const agora = new Date().toISOString()
      const normalizada = novaLista.map((item, idx) => ({ ...item, ordem: idx + 1 }))
      await saveParametrosListas(
        {
          listas: {
            ...parametros.listas,
            [abaAtiva]: normalizada,
          },
          auditoria: [
            { data: agora, usuario, lista: abaAtiva, acao, detalhe },
            ...(parametros.auditoria || []),
          ].slice(0, 300),
        },
        usuario
      )
      showToast('success', 'Parâmetro atualizado com sucesso!')
    } catch (err: any) {
      showToast('error', `Erro ao salvar parâmetro: ${err?.message || 'falha de rede'}`)
    } finally {
      setSalvando(false)
    }
  }

  const handleAdicionar = async (e: React.FormEvent) => {
    e.preventDefault()
    const limpo = novoTexto.trim()
    if (!limpo || salvando) return
    if (listaAtual.some(o => o.label.trim().toLowerCase() === limpo.toLowerCase() || o.valor.trim().toLowerCase() === limpo.toLowerCase())) {
      showToast('error', 'Essa opção já existe nesta lista.')
      return
    }
    const agora = new Date().toISOString()
    // Para segmento e prazo, o valor salvo no cliente/pedido é o próprio texto; para categoria/setor/frete, mantém slug/código legível
    const valorGerado =
      abaAtiva === 'segmento_cliente' || abaAtiva === 'prazo_pagamento'
        ? limpo
        : abaAtiva === 'tipo_frete'
          ? limpo.toUpperCase().replace(/\s+/g, '_')
          : limpo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || limpo

    const novaOpcao: OpcaoParametro = {
      id: `${abaAtiva}-${Date.now()}`,
      valor: valorGerado,
      label: limpo,
      ativo: true,
      ordem: listaAtual.length + 1,
      alteradoPor: usuario,
      alteradoEm: agora,
    }
    setNovoTexto('')
    await persistir([...listaAtual, novaOpcao], 'adicionar', `Adicionada opção "${limpo}"`)
  }

  const handleRenomear = async (item: OpcaoParametro) => {
    const novoNome = editandoLabel.trim()
    if (!novoNome || novoNome === item.label) {
      setEditandoId(null)
      return
    }
    const agora = new Date().toISOString()
    const atualizaValorTambem = abaAtiva === 'segmento_cliente' || abaAtiva === 'prazo_pagamento'
    const novaLista = listaAtual.map(o =>
      o.id === item.id
        ? {
            ...o,
            label: novoNome,
            ...(atualizaValorTambem ? { valor: novoNome } : {}),
            alteradoPor: usuario,
            alteradoEm: agora,
          }
        : o
    )
    setEditandoId(null)
    await persistir(novaLista, 'renomear', `Renomeado de "${item.label}" para "${novoNome}"`)
  }

  const handleToggleAtivo = async (item: OpcaoParametro) => {
    const agora = new Date().toISOString()
    const novoAtivo = !item.ativo
    const novaLista = listaAtual.map(o =>
      o.id === item.id ? { ...o, ativo: novoAtivo, alteradoPor: usuario, alteradoEm: agora } : o
    )
    await persistir(
      novaLista,
      novoAtivo ? 'ativar' : 'desativar',
      `${novoAtivo ? 'Ativada' : 'Desativada'} opção "${item.label}"`
    )
  }

  const handleMover = async (idx: number, direcao: -1 | 1) => {
    const alvo = idx + direcao
    if (alvo < 0 || alvo >= listaAtual.length) return
    const agora = new Date().toISOString()
    const copia = [...listaAtual]
    const temp = copia[idx]
    copia[idx] = { ...copia[alvo], alteradoPor: usuario, alteradoEm: agora }
    copia[alvo] = { ...temp, alteradoPor: usuario, alteradoEm: agora }
    await persistir(copia, 'reordenar', `Alterada ordem de "${temp.label}"`)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-2 sm:p-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">⚙️ Parâmetros do Sistema</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Gerencie as listas dos dropdowns do CRM. Opções desativadas saem dos seletores novos sem alterar clientes ou pedidos antigos.
        </p>
      </div>

      {/* Abas das 5 listas */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-3">
        {ORDEM_ABAS.map(k => {
          const ativa = abaAtiva === k
          const qtdAtivas = (parametros.listas[k] || []).filter(o => o.ativo).length
          return (
            <button
              key={k}
              type="button"
              onClick={() => { setAbaAtiva(k); setEditandoId(null); setNovoTexto('') }}
              className={`px-3.5 py-2 rounded-apple text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2 ${
                ativa
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>{LISTA_META[k].titulo}</span>
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${ativa ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                {qtdAtivas}
              </span>
            </button>
          )
        })}
      </div>

      {/* Card principal da lista ativa */}
      <div className="bg-white dark:bg-gray-900 rounded-apple border border-gray-200 dark:border-gray-700 shadow-apple-sm p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{meta.titulo}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{meta.descricao}</p>
        </div>

        {/* Adicionar nova opção */}
        <form onSubmit={handleAdicionar} className="flex gap-2">
          <input
            type="text"
            value={novoTexto}
            onChange={e => setNovoTexto(e.target.value)}
            placeholder={`Nova opção em ${meta.titulo}...`}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="submit"
            disabled={!novoTexto.trim() || salvando}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-apple text-sm font-semibold whitespace-nowrap"
          >
            + Adicionar
          </button>
        </form>

        {/* Itens da lista */}
        <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-apple overflow-hidden">
          {listaAtual.map((item, idx) => (
            <div
              key={item.id}
              className={`px-4 py-3 flex items-center justify-between gap-3 ${
                item.ativo ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/60 opacity-70'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    disabled={idx === 0 || salvando}
                    onClick={() => handleMover(idx, -1)}
                    className="text-[10px] text-gray-400 hover:text-gray-700 disabled:opacity-30 leading-none"
                    title="Subir"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={idx === listaAtual.length - 1 || salvando}
                    onClick={() => handleMover(idx, 1)}
                    className="text-[10px] text-gray-400 hover:text-gray-700 disabled:opacity-30 leading-none"
                    title="Descer"
                  >
                    ▼
                  </button>
                </div>

                {editandoId === item.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      autoFocus
                      type="text"
                      value={editandoLabel}
                      onChange={e => setEditandoLabel(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRenomear(item)
                        if (e.key === 'Escape') setEditandoId(null)
                      }}
                      className="flex-1 px-2.5 py-1 border border-primary-400 rounded text-sm focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRenomear(item)}
                      className="px-2.5 py-1 bg-primary-600 text-white rounded text-xs font-semibold"
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditandoId(null)}
                      className="px-2 py-1 text-gray-500 text-xs"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${item.ativo ? 'text-gray-900 dark:text-gray-100' : 'line-through text-gray-500'}`}>
                        {item.label}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${item.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                        {item.ativo ? 'Ativo' : 'Desativado'}
                      </span>
                    </div>
                    {item.alteradoEm && (
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Alterado por <span className="font-medium">{item.alteradoPor || 'Gerente'}</span> em {new Date(item.alteradoEm).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {editandoId !== item.id && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={() => { setEditandoId(item.id); setEditandoLabel(item.label) }}
                    className="px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 rounded-apple"
                  >
                    Renomear
                  </button>
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={() => handleToggleAtivo(item)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-apple ${
                      item.ativo
                        ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                        : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                    }`}
                  >
                    {item.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Registro de auditoria (quem alterou e quando) */}
      <div className="bg-white dark:bg-gray-900 rounded-apple border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">🕒 Histórico de alterações de parâmetros</h3>
        {(parametros.auditoria || []).length === 0 ? (
          <p className="text-xs text-gray-400">Nenhuma alteração manual registrada ainda.</p>
        ) : (
          <div className="max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 text-xs">
            {parametros.auditoria.slice(0, 40).map((log, i) => (
              <div key={i} className="py-2 flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{LISTA_META[log.lista]?.titulo || log.lista}:</span>{' '}
                  <span className="text-gray-600 dark:text-gray-300">{log.detalhe}</span>
                </div>
                <span className="text-[11px] text-gray-400">
                  {log.usuario} · {new Date(log.data).toLocaleString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
