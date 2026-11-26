import React, { useMemo, useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import type { CadastroJustificativa, Cliente, Vendedor } from '../types'
import {
  avaliarCadastroCliente,
  CADASTRO_CAMPO_LABEL,
  CampoCadastroKey,
  campoCadastroPreenchido,
  CAMPOS_CADASTRO_PADRAO,
  SITUACAO_CADASTRO_CONFIG,
  temJustificativaAtiva,
} from '../utils/cadastroCompleto'
import { mesmaEmpresaNoFunil } from '../utils/funil-logic'

interface Props {
  cliente: Cliente
  clientes: Cliente[]
  camposObrigatorios?: CampoCadastroKey[]
  loggedUser: Vendedor | null
  onClose: () => void
  onSave: (changes: Partial<Cliente>) => Promise<void>
}

const input = 'w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white'
const label = 'block text-[11px] font-medium text-gray-500 mb-1'

function desativarJustificativa(lista: CadastroJustificativa[], campo: CampoCadastroKey, autor: string): CadastroJustificativa[] {
  let latestIdx = -1
  let latestDate = ''
  lista.forEach((j, idx) => {
    if (j.campo === campo && j.ativo !== false && String(j.criadoEm || '') >= latestDate) {
      latestIdx = idx
      latestDate = String(j.criadoEm || '')
    }
  })
  if (latestIdx < 0) return lista
  return lista.map((j, idx) => idx === latestIdx ? { ...j, ativo: false, desativadoEm: new Date().toISOString(), desativadoPor: autor } : j)
}

function adicionarJustificativa(cliente: Cliente, campo: CampoCadastroKey, texto: string, user: Vendedor | null): CadastroJustificativa[] {
  const autor = user?.nome || 'Vendedor'
  const semAtiva = desativarJustificativa([...(cliente.cadastroJustificativas || [])], campo, autor)
  return [...semAtiva, {
    campo,
    justificativa: texto.trim(),
    autorId: user?.id,
    autorNome: autor,
    criadoEm: new Date().toISOString(),
    ativo: true,
  }]
}

function parseProdutosLinhas(texto: string) {
  const produtos: string[] = []
  const consumo: NonNullable<Cliente['produtosQuantidadesMensais']> = {}
  texto.split('\n').map(l => l.trim()).filter(Boolean).forEach(linha => {
    const partes = linha.split('|').map(p => p.trim())
    const nome = partes[0]
    if (!nome) return
    const kg = Number(String(partes[1] || '').replace(',', '.'))
    produtos.push(nome)
    consumo[nome] = { kgMes: Number.isFinite(kg) ? kg : 0, atualizadoEm: new Date().toISOString(), vendedorNome: 'Cadastro completo' }
  })
  return { produtos, consumo }
}

export default function CadastroCompletoModal({ cliente, clientes, camposObrigatorios = CAMPOS_CADASTRO_PADRAO, loggedUser, onClose, onSave }: Props) {
  const avaliacao = useMemo(() => avaliarCadastroCliente(cliente, clientes, camposObrigatorios), [cliente, clientes, camposObrigatorios])
  const historicoJustificativasFamilia = useMemo(() => {
    const familia = clientes.filter(c => mesmaEmpresaNoFunil(c, cliente))
    const merged = new Map<string, CadastroJustificativa>()
    for (const membro of familia.length ? familia : [cliente]) {
      for (const j of membro.cadastroJustificativas || []) {
        const key = [j.campo, j.criadoEm, j.autorId || j.autorNome || '', j.justificativa].join('|')
        merged.set(key, j)
      }
    }
    return Array.from(merged.values()).sort((a, b) => String(a.criadoEm || '').localeCompare(String(b.criadoEm || '')))
  }, [cliente, clientes])
  const [campoAberto, setCampoAberto] = useState<CampoCadastroKey | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [justificativas, setJustificativas] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  const setDraft = (key: string, value: string) => setDrafts(prev => ({ ...prev, [key]: value }))
  const d = (key: string, inicial = '') => drafts[key] ?? inicial

  const salvarJustificativa = async (campo: CampoCadastroKey) => {
    const texto = (justificativas[campo] || '').trim()
    if (!texto) return
    setSalvando(true)
    try {
      await onSave({ cadastroJustificativas: adicionarJustificativa({ ...cliente, cadastroJustificativas: historicoJustificativasFamilia }, campo, texto, loggedUser) })
      setJustificativas(prev => ({ ...prev, [campo]: '' }))
    } finally { setSalvando(false) }
  }

  const salvarPreenchimento = async (campo: CampoCadastroKey) => {
    const changes: Partial<Cliente> = {}
    if (campo === 'contato_comprador') {
      changes.contatoComprasNome = d('cc_nome', cliente.contatoComprasNome || cliente.contatoNome || '').trim()
      changes.contatoComprasTelefone = d('cc_tel', cliente.contatoComprasTelefone || cliente.contatoCelular || cliente.contatoTelefone || '').trim()
      changes.contatoComprasSetor = d('cc_setor', cliente.contatoComprasSetor || 'Compras').trim() || 'Compras'
    } else if (campo === 'contato_financeiro') {
      changes.contatoFinanceiroNome = d('cf_nome', cliente.contatoFinanceiroNome || '').trim()
      changes.contatoFinanceiroTelefone = d('cf_tel', cliente.contatoFinanceiroTelefone || '').trim()
      changes.contatoFinanceiroSetor = d('cf_setor', cliente.contatoFinanceiroSetor || 'Financeiro').trim() || 'Financeiro'
    } else if (campo === 'email_boleto') {
      changes.emailBoleto = d('email_boleto', cliente.emailBoleto || '').trim()
    } else if (campo === 'telefone_empresa') {
      changes.contatoTelefone = d('telefone_empresa', cliente.contatoTelefone || cliente.contatoCelular || '').trim()
    } else if (campo === 'endereco_completo') {
      changes.enderecoRua = d('end_rua', cliente.enderecoRua || '').trim()
      changes.enderecoNumero = d('end_numero', cliente.enderecoNumero || '').trim()
      changes.enderecoBairro = d('end_bairro', cliente.enderecoBairro || '').trim()
      changes.enderecoCidade = d('end_cidade', cliente.enderecoCidade || '').trim()
      changes.enderecoEstado = d('end_estado', cliente.enderecoEstado || '').trim().toUpperCase()
      changes.enderecoCep = d('end_cep', cliente.enderecoCep || '').trim()
      changes.endereco = [changes.enderecoRua, changes.enderecoNumero, changes.enderecoBairro, changes.enderecoCidade, changes.enderecoEstado, changes.enderecoCep ? `CEP ${changes.enderecoCep}` : ''].filter(Boolean).join(', ')
    } else if (campo === 'segmento') {
      changes.segmento = d('segmento', cliente.segmento || '').trim()
    } else if (campo === 'presenca_digital') {
      changes.website = d('site', cliente.website || '').trim()
      changes.instagram = d('instagram', cliente.instagram || '').trim()
      changes.facebook = d('facebook', cliente.facebook || '').trim()
      changes.linkedin = d('linkedin', cliente.linkedin || '').trim()
    } else if (campo === 'produtos_interesse') {
      const inicial = (cliente.produtosInteresse || []).map(nome => {
        const info = (cliente.produtosQuantidadesMensais || {})[nome] as any
        const kg = typeof info === 'number' ? info : info?.kgMes || ''
        return `${nome} | ${kg}`
      }).join('\n')
      const parsed = parseProdutosLinhas(d('produtos', inicial))
      changes.produtosInteresse = parsed.produtos
      changes.produtosQuantidadesMensais = parsed.consumo
    }

    // Ao preencher, desativa a justificativa daquele campo sem apagar o histórico.
    changes.cadastroJustificativas = desativarJustificativa([...historicoJustificativasFamilia], campo, loggedUser?.nome || 'Vendedor')
    setSalvando(true)
    try {
      await onSave(changes)
      setCampoAberto(null)
    } finally { setSalvando(false) }
  }

  const renderEditor = (campo: CampoCadastroKey) => {
    if (campo === 'contato_comprador') return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div><label className={label}>Nome *</label><input className={input} value={d('cc_nome', cliente.contatoComprasNome || cliente.contatoNome || '')} onChange={e => setDraft('cc_nome', e.target.value)} /></div>
        <div><label className={label}>Telefone/WhatsApp *</label><input className={input} value={d('cc_tel', cliente.contatoComprasTelefone || cliente.contatoCelular || cliente.contatoTelefone || '')} onChange={e => setDraft('cc_tel', e.target.value)} /></div>
        <div><label className={label}>Setor *</label><input className={input} value={d('cc_setor', cliente.contatoComprasSetor || 'Compras')} onChange={e => setDraft('cc_setor', e.target.value)} /></div>
      </div>
    )
    if (campo === 'contato_financeiro') return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div><label className={label}>Nome *</label><input className={input} value={d('cf_nome', cliente.contatoFinanceiroNome || '')} onChange={e => setDraft('cf_nome', e.target.value)} /></div>
        <div><label className={label}>Telefone/WhatsApp *</label><input className={input} value={d('cf_tel', cliente.contatoFinanceiroTelefone || '')} onChange={e => setDraft('cf_tel', e.target.value)} /></div>
        <div><label className={label}>Setor *</label><input className={input} value={d('cf_setor', cliente.contatoFinanceiroSetor || 'Financeiro')} onChange={e => setDraft('cf_setor', e.target.value)} /></div>
      </div>
    )
    if (campo === 'email_boleto') return <div><label className={label}>E-mail para boleto *</label><input type="email" className={input} value={d('email_boleto', cliente.emailBoleto || '')} onChange={e => setDraft('email_boleto', e.target.value)} placeholder="boletos@empresa.com" /></div>
    if (campo === 'telefone_empresa') return <div><label className={label}>Telefone da empresa *</label><input className={input} value={d('telefone_empresa', cliente.contatoTelefone || cliente.contatoCelular || '')} onChange={e => setDraft('telefone_empresa', e.target.value)} /></div>
    if (campo === 'endereco_completo') return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="sm:col-span-2"><label className={label}>Logradouro *</label><input className={input} value={d('end_rua', cliente.enderecoRua || '')} onChange={e => setDraft('end_rua', e.target.value)} /></div>
        <div><label className={label}>Número *</label><input className={input} value={d('end_numero', cliente.enderecoNumero || '')} onChange={e => setDraft('end_numero', e.target.value)} /></div>
        <div><label className={label}>Bairro *</label><input className={input} value={d('end_bairro', cliente.enderecoBairro || '')} onChange={e => setDraft('end_bairro', e.target.value)} /></div>
        <div><label className={label}>Cidade *</label><input className={input} value={d('end_cidade', cliente.enderecoCidade || '')} onChange={e => setDraft('end_cidade', e.target.value)} /></div>
        <div><label className={label}>UF *</label><input maxLength={2} className={input} value={d('end_estado', cliente.enderecoEstado || '')} onChange={e => setDraft('end_estado', e.target.value)} /></div>
        <div><label className={label}>CEP *</label><input className={input} value={d('end_cep', cliente.enderecoCep || '')} onChange={e => setDraft('end_cep', e.target.value)} /></div>
      </div>
    )
    if (campo === 'segmento') return <div><label className={label}>Segmento *</label><input className={input} value={d('segmento', cliente.segmento || '')} onChange={e => setDraft('segmento', e.target.value)} placeholder="Ex: Distribuição" /></div>
    if (campo === 'presenca_digital') return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div><label className={label}>Site</label><input className={input} value={d('site', cliente.website || '')} onChange={e => setDraft('site', e.target.value)} /></div>
        <div><label className={label}>Instagram</label><input className={input} value={d('instagram', cliente.instagram || '')} onChange={e => setDraft('instagram', e.target.value)} /></div>
        <div><label className={label}>Facebook</label><input className={input} value={d('facebook', cliente.facebook || '')} onChange={e => setDraft('facebook', e.target.value)} /></div>
        <div><label className={label}>LinkedIn</label><input className={input} value={d('linkedin', cliente.linkedin || '')} onChange={e => setDraft('linkedin', e.target.value)} /></div>
        <p className="text-[11px] text-gray-400 sm:col-span-2">Preencha pelo menos um dos quatro.</p>
      </div>
    )
    const inicial = (cliente.produtosInteresse || []).map(nome => {
      const info = (cliente.produtosQuantidadesMensais || {})[nome] as any
      const kg = typeof info === 'number' ? info : info?.kgMes || ''
      return `${nome} | ${kg}`
    }).join('\n')
    return (
      <div>
        <label className={label}>Produtos e consumo mensal — um por linha: Produto | kg/mês *</label>
        <textarea rows={4} className={`${input} resize-none`} value={d('produtos', inicial)} onChange={e => setDraft('produtos', e.target.value)} placeholder={'Sorvete de chocolate 1L | 120\nCobertura de morango | 40'} />
        <p className="text-[11px] text-gray-400 mt-1">Todos os produtos listados precisam ter kg/mês maior que zero.</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-gray-200">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h3 className="font-bold text-gray-900">Cadastro do cliente</h3>
            <p className="text-xs text-gray-500">Complete os campos ou marque “Não possui” com justificativa.</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><XMarkIcon className="h-5 w-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-bold ${SITUACAO_CADASTRO_CONFIG[avaliacao.situacao].cor}`}>
            {SITUACAO_CADASTRO_CONFIG[avaliacao.situacao].label}
            {avaliacao.faltantes.length > 0 ? ` (${avaliacao.faltantes.length} campo${avaliacao.faltantes.length > 1 ? 's' : ''})` : ''}
          </div>

          {camposObrigatorios.map(campo => {
            const preenchido = campoCadastroPreenchido(cliente, campo, clientes)
            const just = temJustificativaAtiva(cliente, campo, clientes)
            const aberto = campoAberto === campo
            return (
              <div key={campo} className={`border rounded-xl p-3 ${preenchido ? 'border-blue-100 bg-blue-50/40' : just ? 'border-purple-100 bg-purple-50/40' : 'border-orange-200 bg-orange-50/40'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{CADASTRO_CAMPO_LABEL[campo]}</p>
                    <p className="text-xs text-gray-500">
                      {preenchido ? 'Preenchido' : just ? `Não possui — ${just.justificativa}` : 'Pendente'}
                    </p>
                    {just && <p className="text-[10px] text-gray-400 mt-0.5">por {just.autorNome || 'usuário'} em {new Date(just.criadoEm).toLocaleDateString('pt-BR')}</p>}
                  </div>
                  {!preenchido && (
                    <button type="button" onClick={() => setCampoAberto(aberto ? null : campo)} className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-gray-200 hover:border-primary-300 text-primary-700 flex-shrink-0">
                      {aberto ? 'Fechar' : 'Preencher / Não possui'}
                    </button>
                  )}
                </div>
                {aberto && !preenchido && (
                  <div className="mt-3 pt-3 border-t border-black/5 space-y-3">
                    {renderEditor(campo)}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={salvando} onClick={() => salvarPreenchimento(campo)} className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-bold disabled:opacity-50">
                        Salvar preenchimento
                      </button>
                    </div>
                    <div className="bg-white/70 border border-gray-200 rounded-lg p-2.5">
                      <label className={label}>Ou marcar “Não possui” — justificativa obrigatória</label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input className={input} value={justificativas[campo] || ''} onChange={e => setJustificativas(prev => ({ ...prev, [campo]: e.target.value }))} placeholder="Ex: Cliente não tem site nem redes sociais" />
                        <button type="button" disabled={salvando || !(justificativas[campo] || '').trim()} onClick={() => salvarJustificativa(campo)} className="px-3 py-2 bg-purple-600 text-white rounded-lg text-xs font-bold disabled:opacity-50 whitespace-nowrap">
                          Não possui
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
