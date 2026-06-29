import React from 'react'
import { XMarkIcon, ChevronDownIcon, ChevronRightIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline'
import type { Cliente, Produto, Vendedor, FormData, Pedido } from '../types'
import { PlacesEnrich } from './PlacesEnrich'
import { formatTelefone } from '../utils/validators'

const etapaLabels: Record<string, string> = { 'lead': 'Lead', 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'amostra_perdida': 'Am. Perdida', 'proposta': 'Proposta', 'negociacao': 'Negociação', 'follow_up': 'Follow-up', 'inativo': 'Inativo', 'perdido': 'Perdido' }
const etapaCores: Record<string, string> = { 'lead': 'bg-emerald-100 text-emerald-800', 'prospecção': 'bg-sky-100 text-sky-800', 'amostra': 'bg-amber-100 text-amber-800', 'amostra_perdida': 'bg-orange-100 text-orange-800', 'proposta': 'bg-indigo-100 text-indigo-800', 'negociacao': 'bg-purple-100 text-purple-800', 'follow_up': 'bg-blue-100 text-blue-800', 'inativo': 'bg-gray-200 text-gray-700', 'perdido': 'bg-red-100 text-red-800' }

interface ClienteFormModalProps {
  showModal: boolean
  setShowModal: (v: boolean) => void
  editingCliente: Cliente | null
  formData: FormData
  setFormData: React.Dispatch<React.SetStateAction<FormData>>
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void
  handleSubmit: (e: React.FormEvent) => void
  isSaving: boolean
  isLoadingCep: boolean
  isLoadingCnpj: boolean
  buscarCep: (cep: string) => void
  buscarCnpj: (cnpj: string) => void
  produtos: Produto[]
  vendedores: Vendedor[]
  clientes?: Cliente[]
  pedidos?: Pedido[]
  loggedUser?: Vendedor | null
  onClickNegocio?: (c: Cliente) => void
  onInativarCliente?: (clienteId: number, motivo: string) => void | Promise<void>
  onReativarCliente?: (clienteId: number) => void | Promise<void>
}

const STATUS_CLIENTE_OPTIONS = [
  { value: 'prospecto', label: 'Prospecto', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  { value: 'ativo', label: 'Ativo', color: 'text-green-700 bg-green-50 border-green-200' },
  { value: 'em_risco', label: 'Em Risco', color: 'text-orange-700 bg-orange-50 border-orange-200' },
  { value: 'inativo', label: 'Inativo', color: 'text-gray-600 bg-gray-50 border-gray-200' },
  { value: 'inativado', label: 'Inativado', color: 'text-red-700 bg-red-50 border-red-200' },
  { value: 'descartado', label: 'Descartado', color: 'text-red-700 bg-red-50 border-red-200' },
  { value: 'bloqueado', label: 'Bloqueado', color: 'text-purple-700 bg-purple-50 border-purple-200' },
]

const PHONE_FIELDS = ['contatoCelular', 'contatoTelefoneFixo', 'contatoTelefone', 'contatoFinanceiroTelefone', 'contatoComprasTelefone']

export default function ClienteFormModal({
  showModal, setShowModal, editingCliente, formData, setFormData,
  handleInputChange, handleSubmit, isSaving,
  isLoadingCep, isLoadingCnpj, buscarCep, buscarCnpj,
  produtos, vendedores, clientes = [], pedidos = [], loggedUser,
  onClickNegocio, onInativarCliente, onReativarCliente
}: ClienteFormModalProps) {
  const handleTelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    const formatted = formatTelefone(value)
    const synthetic = { ...e, target: { ...e.target, name, value: formatted } } as React.ChangeEvent<HTMLInputElement>
    handleInputChange(synthetic)
  }
  const [activeTab, setActiveTab] = React.useState<'dados' | 'negocios'>('dados')
  const [isSearchingGrupo, setIsSearchingGrupo] = React.useState(false)
  const [grupoCnpjInput, setGrupoCnpjInput] = React.useState('')
  const [grupoSearchResult, setGrupoSearchResult] = React.useState<{ id: number; razaoSocial: string } | null>(null)
  const [grupoSearchError, setGrupoSearchError] = React.useState('')
  // Estados de expansão (seções escondidas por padrão)
  const [showGrupoEconomico, setShowGrupoEconomico] = React.useState(false)
  const [showEndereco2, setShowEndereco2] = React.useState(false)
  const [showProdutosInteresse, setShowProdutosInteresse] = React.useState(false)
  const [produtoSearch, setProdutoSearch] = React.useState('')
  // Estados do Inativar / Reativar
  const [showInativarModal, setShowInativarModal] = React.useState(false)
  const [motivoInativacao, setMotivoInativacao] = React.useState('')
  const [showMaisOpcoes, setShowMaisOpcoes] = React.useState(false)
  const isGerente = loggedUser?.cargo === 'gerente'

  React.useEffect(() => {
    if (!showModal) {
      setGrupoCnpjInput('')
      setGrupoSearchResult(null)
      setGrupoSearchError('')
      setShowGrupoEconomico(false)
      setShowEndereco2(false)
      setShowProdutosInteresse(false)
      setProdutoSearch('')
      setShowInativarModal(false)
      setMotivoInativacao('')
      setShowMaisOpcoes(false)
    } else {
      const linked = clientes.find(c => c.id === Number(formData.grupoEconomicoId))
      if (linked) {
        setGrupoSearchResult({ id: linked.id, razaoSocial: linked.razaoSocial })
        setShowGrupoEconomico(true)
      }
      // Expandir Endereço 2 se já houver dados
      if (formData.enderecoRua2 || formData.enderecoCep2 || formData.enderecoCidade2) {
        setShowEndereco2(true)
      }
      // Expandir Produtos se já houver selecionados
      if (formData.produtosInteresse?.trim()) {
        setShowProdutosInteresse(true)
      }
    }
  }, [showModal])

  const buscarClientePorCnpj = () => {
    const digits = grupoCnpjInput.replace(/\D/g, '')
    if (digits.length < 14) { setGrupoSearchError('Informe um CNPJ válido (14 dígitos).'); return }
    setIsSearchingGrupo(true)
    setGrupoSearchError('')
    setGrupoSearchResult(null)
    const found = clientes.find(c => c.cnpj?.replace(/\D/g, '') === digits && c.id !== editingCliente?.id)
    setIsSearchingGrupo(false)
    if (found) {
      setGrupoSearchResult({ id: found.id, razaoSocial: found.razaoSocial })
      setFormData(prev => ({ ...prev, grupoEconomicoId: found.id.toString() }))
    } else {
      setGrupoSearchError('Nenhum cliente encontrado com este CNPJ.')
    }
  }

  const removerGrupo = () => {
    setGrupoSearchResult(null)
    setGrupoCnpjInput('')
    setGrupoSearchError('')
    setFormData(prev => ({ ...prev, grupoEconomicoId: '' }))
  }

  React.useEffect(() => { if (showModal) setActiveTab('dados') }, [showModal])

  // Busca todos os cards do mesmo cliente (mesmo CNPJ ou mesma razão social)
  const negocios = React.useMemo(() => {
    if (!editingCliente) return []
    const cnpjDigits = editingCliente.cnpj?.replace(/\D/g, '') || ''
    return clientes
      .filter(c => {
        if (cnpjDigits.length === 14) return c.cnpj?.replace(/\D/g, '') === cnpjDigits
        return c.razaoSocial?.trim().toLowerCase() === editingCliente.razaoSocial?.trim().toLowerCase()
      })
      .sort((a, b) => (b.cicloNumero || 1) - (a.cicloNumero || 1))
  }, [editingCliente, clientes])

  if (!showModal) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black bg-opacity-25 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        />

        {/* Modal — ampliado para ~70% da largura da tela (mínimo de 5xl em telas pequenas) */}
        <div className="relative w-full sm:w-[70vw] max-w-[1400px] bg-white rounded-apple shadow-apple border border-gray-200 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
            <h2 className="text-lg font-semibold text-gray-900">
              {editingCliente ? 'Editar Cliente' : 'Novo Cliente'}
            </h2>
            <button
              onClick={() => setShowModal(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>


          {/* Form */}
          <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-4">
            <div className="space-y-5">

              {/* ── Responsável + Status ── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Vendedor Responsável</label>
                  {isGerente ? (
                    <select name="vendedorId" value={formData.vendedorId || ''} onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm">
                      <option value="">Sem vendedor</option>
                      {vendedores.filter(v => v.ativo).map(v => (
                        <option key={v.id} value={v.id}>{v.nome} ({v.cargo === 'gerente' ? 'Gerente' : v.cargo === 'sdr' ? 'SDR' : 'Vendedor'})</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={loggedUser?.nome || 'Vendedor atual'}
                      disabled
                      className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded-apple text-sm cursor-not-allowed"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status de Cliente</label>
                  <select name="statusCliente" value={formData.statusCliente || ''} onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm">
                    <option value="">Não definido</option>
                    {STATUS_CLIENTE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ── Empresa ── */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Empresa</p>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">CNPJ</label>
                      <div className="flex gap-1">
                        <input type="text" name="cnpj" value={formData.cnpj} onChange={handleInputChange}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                          placeholder="00.000.000/0000-00" />
                        <button type="button" onClick={() => buscarCnpj(formData.cnpj)}
                          disabled={isLoadingCnpj}
                          className="px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-apple text-xs font-medium disabled:opacity-50 whitespace-nowrap">
                          {isLoadingCnpj ? '⏳' : '🔍 Buscar'}
                        </button>
                      </div>
                    </div>
                  </div>
                  {/* ── Grupo Econômico (oculto por padrão, botão expansível) ── */}
                  <div>
                    {!showGrupoEconomico ? (
                      <button
                        type="button"
                        onClick={() => setShowGrupoEconomico(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50 rounded-apple border border-dashed border-primary-300"
                      >
                        <PlusIcon className="h-3.5 w-3.5" />
                        Incluir Grupo Econômico
                      </button>
                    ) : (
                      <div className="border border-gray-200 rounded-apple p-3 bg-gray-50/50">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-medium text-gray-600">Grupo Econômico</label>
                          {!grupoSearchResult && (
                            <button type="button" onClick={() => setShowGrupoEconomico(false)} className="text-xs text-gray-400 hover:text-gray-600">Recolher</button>
                          )}
                        </div>
                        {grupoSearchResult ? (
                          <div className="flex items-center gap-2 px-3 py-2 border border-green-300 bg-green-50 rounded-apple">
                            <span className="text-xs font-medium text-green-800 flex-1 truncate">🔗 {grupoSearchResult.razaoSocial}</span>
                            <button type="button" onClick={removerGrupo} className="text-gray-400 hover:text-red-500 text-xs font-bold">✕</button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={grupoCnpjInput}
                              onChange={e => { setGrupoCnpjInput(e.target.value); setGrupoSearchError('') }}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscarClientePorCnpj() } }}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                              placeholder="CNPJ do cliente matriz/filial" />
                            <button type="button" onClick={buscarClientePorCnpj} disabled={isSearchingGrupo}
                              className="px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-apple text-xs font-medium disabled:opacity-50 whitespace-nowrap">
                              {isSearchingGrupo ? '⏳' : '🔗 Linkar'}
                            </button>
                          </div>
                        )}
                        {grupoSearchError && <p className="text-xs text-red-500 mt-1">{grupoSearchError}</p>}
                        <p className="text-xs text-gray-400 mt-1">Informe o CNPJ de outro cadastro para indicar que são a mesma empresa.</p>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Razão Social *</label>
                    <input type="text" name="razaoSocial" value={formData.razaoSocial} onChange={handleInputChange} required
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      placeholder="Ex: Supermercado BH Ltda" />
                  </div>

                  {/* ── Google Places Enrichment ── */}
                  <PlacesEnrich
                    razaoSocial={formData.razaoSocial}
                    cidade={formData.enderecoCidade}
                    onApply={data => {
                      setFormData(prev => ({
                        ...prev,
                        ...(data.phone && !prev.contatoTelefone ? { contatoTelefone: data.phone } : {}),
                        ...(data.phone && !prev.contatoCelular ? { contatoCelular: data.phone } : {}),
                        ...(data.street && !prev.enderecoRua ? { enderecoRua: data.street } : {}),
                        ...(data.streetNumber && !prev.enderecoNumero ? { enderecoNumero: data.streetNumber } : {}),
                        ...(data.neighborhood && !prev.enderecoBairro ? { enderecoBairro: data.neighborhood } : {}),
                        ...(data.city && !prev.enderecoCidade ? { enderecoCidade: data.city } : {}),
                        ...(data.state && !prev.enderecoEstado ? { enderecoEstado: data.state } : {}),
                        ...(data.postalCode && !prev.enderecoCep ? {
                          enderecoCep: data.postalCode.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2')
                        } : {}),
                        ...(data.website && !prev.website ? { website: data.website } : {}),
                        ...(data.instagramHint && !prev.instagram ? { instagram: data.instagramHint } : {}),
                      }))
                    }}
                  />
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nome Fantasia</label>
                    <input type="text" name="nomeFantasia" value={formData.nomeFantasia} onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      placeholder="Ex: Mercadão BH" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">CNAE Primário</label>
                    <input type="text" name="cnaePrimario" value={formData.cnaePrimario} onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      placeholder="Ex: 4711-3/02 - Comércio varejista de mercadorias" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">CNAE Secundário</label>
                    <input type="text" name="cnaeSecundario" value={formData.cnaeSecundario} onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      placeholder="Preenchido automaticamente pelo CNPJ" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Segmento</label>
                    <select name="segmento" value={formData.segmento} onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white">
                      <option value="">— Selecionar —</option>
                      <option value="Indústria">🏭 Indústria</option>
                      <option value="Distribuição">🚚 Distribuição</option>
                      <option value="Consumo">🛒 Consumo</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Descrição</label>
                    <textarea name="descricao" value={formData.descricao || ''} onChange={handleInputChange}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-none"
                      placeholder="Data de abertura, porte, situação cadastral, quadro de sócios, atividade econômica..." />
                  </div>
                </div>
              </div>

              {/* ── Contato ── */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Contato</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nome do Contato</label>
                    <input type="text" name="contatoNome" value={formData.contatoNome} onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      placeholder="João Silva" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Celular</label>
                      <input type="tel" name="contatoCelular" value={formData.contatoCelular} onChange={handleTelChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        placeholder="(00) 99999-0000" maxLength={16} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Telefone Fixo</label>
                      <input type="tel" name="contatoTelefoneFixo" value={formData.contatoTelefoneFixo} onChange={handleTelChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        placeholder="(00) 3333-0000" maxLength={15} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp / Telefone Principal</label>
                    <input type="tel" name="contatoTelefone" value={formData.contatoTelefone} onChange={handleTelChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      placeholder="(00) 99999-0000" maxLength={16} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                    <input type="email" name="contatoEmail" value={formData.contatoEmail} onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      placeholder="email@empresa.com" />
                  </div>
                </div>
              </div>

              {/* ── Contatos adicionais (Financeiro / Compras) ── */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Contatos adicionais</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="border border-gray-200 rounded-apple p-3 bg-gray-50/40">
                    <p className="text-xs font-semibold text-gray-700 mb-2">💰 Financeiro</p>
                    <div className="space-y-2">
                      <input type="text" name="contatoFinanceiroNome" value={formData.contatoFinanceiroNome || ''} onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        placeholder="Nome do responsável financeiro" />
                      <input type="tel" name="contatoFinanceiroTelefone" value={formData.contatoFinanceiroTelefone || ''} onChange={handleTelChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        placeholder="(00) 99999-0000" maxLength={16} />
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-apple p-3 bg-gray-50/40">
                    <p className="text-xs font-semibold text-gray-700 mb-2">🛒 Compras</p>
                    <div className="space-y-2">
                      <input type="text" name="contatoComprasNome" value={formData.contatoComprasNome || ''} onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        placeholder="Nome do responsável por compras" />
                      <input type="tel" name="contatoComprasTelefone" value={formData.contatoComprasTelefone || ''} onChange={handleTelChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        placeholder="(00) 99999-0000" maxLength={16} />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Redes Sociais e Website (4 campos individuais) ── */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Redes Sociais e Website</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Instagram</label>
                    <input type="text" name="instagram" value={formData.instagram || ''} onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      placeholder="@usuario ou instagram.com/usuario" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Facebook</label>
                    <input type="text" name="facebook" value={formData.facebook || ''} onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      placeholder="facebook.com/empresa" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">LinkedIn</label>
                    <input type="text" name="linkedin" value={formData.linkedin || ''} onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      placeholder="linkedin.com/company/empresa" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Site / Website</label>
                    <input type="url" name="website" value={formData.website || ''} onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      placeholder="www.empresa.com.br" />
                  </div>
                </div>
              </div>

              {/* ── Endereço ── */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Endereço</p>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="w-36">
                      <label className="block text-xs font-medium text-gray-600 mb-1">CEP</label>
                      <div className="flex gap-1">
                        <input type="text" name="enderecoCep" value={formData.enderecoCep} onChange={handleInputChange}
                          onBlur={() => buscarCep(formData.enderecoCep)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                          placeholder="00000-000" maxLength={9} />
                        {isLoadingCep && <span className="text-xs text-gray-400 self-center">⏳</span>}
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Rua / Logradouro</label>
                      <input type="text" name="enderecoRua" value={formData.enderecoRua} onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        placeholder="Rua das Flores" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Número</label>
                      <input type="text" name="enderecoNumero" value={formData.enderecoNumero} onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        placeholder="100" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Complemento</label>
                      <input type="text" name="enderecoComplemento" value={formData.enderecoComplemento} onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        placeholder="Sala 2, Apto 301..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Bairro</label>
                      <input type="text" name="enderecoBairro" value={formData.enderecoBairro} onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        placeholder="Centro" />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Cidade</label>
                      <input type="text" name="enderecoCidade" value={formData.enderecoCidade} onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        placeholder="Belo Horizonte" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
                      <input type="text" name="enderecoEstado" value={formData.enderecoEstado} onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        placeholder="MG" maxLength={2} />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Endereço Alternativo (botão expansível) ── */}
              {!showEndereco2 ? (
                <button
                  type="button"
                  onClick={() => setShowEndereco2(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50 rounded-apple border border-dashed border-primary-300 self-start"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Incluir Endereço Alternativo
                </button>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Endereço Alternativo</p>
                    <button type="button" onClick={() => setShowEndereco2(false)} className="text-xs text-gray-400 hover:text-gray-600">Recolher</button>
                  </div>
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <div className="w-36">
                        <label className="block text-xs font-medium text-gray-600 mb-1">CEP</label>
                        <input type="text" name="enderecoCep2" value={formData.enderecoCep2} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                          placeholder="00000-000" maxLength={9} />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Rua / Logradouro</label>
                        <input type="text" name="enderecoRua2" value={formData.enderecoRua2} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                          placeholder="Rua das Flores" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Número</label>
                        <input type="text" name="enderecoNumero2" value={formData.enderecoNumero2} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                          placeholder="100" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Complemento</label>
                        <input type="text" name="enderecoComplemento2" value={formData.enderecoComplemento2} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                          placeholder="Sala 2, Apto 301..." />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Bairro</label>
                        <input type="text" name="enderecoBairro2" value={formData.enderecoBairro2} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                          placeholder="Centro" />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Cidade</label>
                        <input type="text" name="enderecoCidade2" value={formData.enderecoCidade2} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                          placeholder="Belo Horizonte" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
                        <input type="text" name="enderecoEstado2" value={formData.enderecoEstado2} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                          placeholder="MG" maxLength={2} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Produtos de Interesse (botão expansível + busca + qty mensal) ── */}
              {!showProdutosInteresse ? (
                <button
                  type="button"
                  onClick={() => setShowProdutosInteresse(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50 rounded-apple border border-dashed border-primary-300 self-start"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Incluir Produto de Interesse
                </button>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Produtos de Interesse</p>
                    <button type="button" onClick={() => setShowProdutosInteresse(false)} className="text-xs text-gray-400 hover:text-gray-600">Recolher</button>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">Selecionado(s) pelo vendedor após a prospecção. Representa o que o cliente demonstrou interesse antes de comprar.</p>

                  {/* Selecionados (com Quantidade Mensal) */}
                  {(() => {
                    const selected = formData.produtosInteresse.split(',').map(s => s.trim()).filter(Boolean)
                    if (selected.length === 0) return null
                    return (
                      <div className="mb-3 space-y-2">
                        {selected.map(nome => {
                          const prod = produtos.find(p => p.nome === nome)
                          const qtdMensal = formData.produtosQuantidadesMensais?.[nome] || ''
                          return (
                            <div key={nome} className="flex items-center gap-2 px-3 py-2 border border-primary-200 bg-primary-50/40 rounded-apple">
                              <span className="text-sm text-gray-800 flex-1 truncate">{nome}{prod && <span className="text-xs text-gray-400 ml-1">· {prod.unidade}</span>}</span>
                              <div className="flex items-center gap-1">
                                <label className="text-xs text-gray-500">Qtd Mensal:</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={qtdMensal}
                                  onChange={(e) => setFormData(prev => ({
                                    ...prev,
                                    produtosQuantidadesMensais: {
                                      ...(prev.produtosQuantidadesMensais || {}),
                                      [nome]: Math.max(0, parseInt(e.target.value) || 0),
                                    }
                                  }))}
                                  placeholder="0"
                                  className="w-20 px-2 py-1 border border-gray-300 rounded-apple text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-500" />
                                {prod && <span className="text-xs text-gray-400">/mês</span>}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = selected.filter(s => s !== nome)
                                  const qtds = { ...(formData.produtosQuantidadesMensais || {}) }
                                  delete qtds[nome]
                                  setFormData(prev => ({ ...prev, produtosInteresse: updated.join(', '), produtosQuantidadesMensais: qtds }))
                                }}
                                className="text-gray-400 hover:text-red-500 text-sm font-bold px-1"
                                title="Remover"
                              >✕</button>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}

                  {/* Busca por texto */}
                  <div className="relative">
                    <MagnifyingGlassIcon className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={produtoSearch}
                      onChange={(e) => setProdutoSearch(e.target.value)}
                      placeholder="Buscar produto por nome..."
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    />
                  </div>
                  {produtoSearch.trim().length >= 1 && (
                    <div className="mt-2 max-h-60 overflow-y-auto border border-gray-200 rounded-apple divide-y divide-gray-50">
                      {(() => {
                        const selected = formData.produtosInteresse.split(',').map(s => s.trim()).filter(Boolean)
                        const search = produtoSearch.toLowerCase().trim()
                        const matches = produtos.filter(p => p.ativo && !selected.includes(p.nome) && p.nome.toLowerCase().includes(search)).slice(0, 20)
                        if (matches.length === 0) return <p className="text-xs text-gray-400 p-3 text-center">Nenhum produto encontrado.</p>
                        return matches.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              const updated = [...selected, p.nome]
                              setFormData(prev => ({ ...prev, produtosInteresse: updated.join(', ') }))
                              setProdutoSearch('')
                            }}
                            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 text-sm"
                          >
                            <span className="text-gray-800">{p.nome}</span>
                            <span className="text-xs text-gray-400">R$ {p.preco.toFixed(2).replace('.', ',')}/{p.unidade}</span>
                          </button>
                        ))
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* ── Itens Homologados (auto-populado, somente leitura) ── */}
              {editingCliente && (() => {
                // Fonte 1: histórico de compras (pedidos confirmados/enviados/faturados)
                const meusPedidos = pedidos.filter(pd => pd.clienteId === editingCliente.id && pd.status !== 'cancelado' && pd.status !== 'rascunho')
                const homologadosMap = new Map<string, { nome: string; data: string; origem: 'Compra' | 'Amostra Aprovada' }>()
                meusPedidos.forEach(pd => {
                  (pd.itens || []).forEach(it => {
                    const dataRef = pd.dataAprovacao || pd.dataEnvio || pd.dataCriacao
                    const existing = homologadosMap.get(it.nomeProduto)
                    if (!existing || (dataRef && dataRef > existing.data)) {
                      homologadosMap.set(it.nomeProduto, { nome: it.nomeProduto, data: dataRef || '', origem: 'Compra' })
                    }
                  })
                })
                // Fonte 2: amostras aprovadas (resultadoAmostra === 'aprovada')
                if (editingCliente.resultadoAmostra === 'aprovada') {
                  const dataRef = editingCliente.dataResultadoAmostra || editingCliente.dataHomologacao || ''
                  ;(editingCliente.produtosInteresse || []).forEach(nome => {
                    const existing = homologadosMap.get(nome)
                    if (!existing || (existing.origem === 'Amostra Aprovada' && dataRef && dataRef > existing.data)) {
                      homologadosMap.set(nome, { nome, data: dataRef, origem: 'Amostra Aprovada' })
                    } else if (!existing) {
                      homologadosMap.set(nome, { nome, data: dataRef, origem: 'Amostra Aprovada' })
                    }
                  })
                }
                const homologados = Array.from(homologadosMap.values()).sort((a, b) => (b.data || '').localeCompare(a.data || ''))
                return (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Itens Homologados</p>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Auto-populado · somente leitura</span>
                    </div>
                    {homologados.length === 0 ? (
                      <div className="border border-dashed border-gray-200 rounded-apple p-4 text-center bg-green-50/30">
                        <p className="text-sm text-gray-500">✅ Nenhum produto homologado ainda.</p>
                        <p className="text-xs text-gray-400 mt-1">Itens aparecem aqui automaticamente quando há compras ou amostras aprovadas.</p>
                      </div>
                    ) : (
                      <div className="border border-gray-200 rounded-apple divide-y divide-gray-50 bg-white">
                        {homologados.map((it, i) => (
                          <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                            <span className="text-gray-800 flex-1 truncate">{it.nome}</span>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${it.origem === 'Compra' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{it.origem === 'Compra' ? '🧾 Compra' : '🧪 Amostra Aprovada'}</span>
                              <span className="text-xs text-gray-400 min-w-[80px] text-right">{it.data ? new Date(it.data).toLocaleDateString('pt-BR') : '—'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

            </div>

            {/* Actions */}
            <div className="flex justify-between items-center mt-6 gap-2 flex-wrap">
              {/* Botão Inativar + menu Mais Opções (só no modo edição) */}
              <div className="flex items-center gap-2">
                {editingCliente && editingCliente.etapa !== 'inativo' && onInativarCliente && (
                  <button
                    type="button"
                    onClick={() => { setMotivoInativacao(''); setShowInativarModal(true) }}
                    disabled={isSaving}
                    className="px-4 py-2 text-gray-600 bg-gray-100 border border-gray-300 rounded-apple hover:bg-gray-200 hover:text-gray-800 transition-colors duration-200 text-sm font-medium"
                    title="Mover cliente para etapa Inativo (com motivo)"
                  >
                    💤 Inativar
                  </button>
                )}
                {/* Menu Mais Opções (Reativar — só para Gestor, se cliente está inativo) */}
                {editingCliente && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowMaisOpcoes(v => !v)}
                      className="px-3 py-2 text-gray-500 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm font-medium"
                    >
                      Mais Opções ▾
                    </button>
                    {showMaisOpcoes && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowMaisOpcoes(false)} />
                        <div className="absolute left-0 bottom-full mb-1 w-56 bg-white rounded-apple shadow-lg border border-gray-200 z-40 py-1">
                          {editingCliente.etapa === 'inativo' && isGerente && onReativarCliente ? (
                            <button
                              type="button"
                              onClick={async () => {
                                setShowMaisOpcoes(false)
                                if (confirm('Reativar este cliente? Ele voltará à etapa anterior.')) {
                                  await onReativarCliente(editingCliente.id)
                                  setShowModal(false)
                                }
                              }}
                              className="w-full px-3 py-2 text-sm text-green-700 hover:bg-green-50 text-left flex items-center gap-2"
                            >
                              ♻️ Reativar Cliente
                            </button>
                          ) : (
                            <p className="px-3 py-2 text-xs text-gray-400">Nenhuma ação disponível.</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {!editingCliente && <div />}
              </div>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 transition-colors duration-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors duration-200 shadow-apple-sm disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Salvando...' : 'Salvar Cliente'}
                </button>
              </div>
            </div>
          </form>

          {/* Modal de Motivo de Inativação */}
          {showInativarModal && editingCliente && onInativarCliente && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40">
              <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Inativar Cliente</h3>
                <p className="text-sm text-gray-500 mb-3">Informe o motivo da inativação. Ele será registrado no histórico do cliente.</p>
                <textarea
                  value={motivoInativacao}
                  onChange={(e) => setMotivoInativacao(e.target.value)}
                  placeholder="Ex: Cliente solicitou pausa, parou de responder por mais de 60 dias..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-none"
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">Este cliente <strong>não aparecerá</strong> nos relatórios de "Clientes Inativos por abandono" — esta é uma decisão ativa da equipe.</p>
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowInativarModal(false)}
                    className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-apple font-medium"
                  >Cancelar</button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!motivoInativacao.trim()) { alert('Informe o motivo da inativação.'); return }
                      await onInativarCliente(editingCliente.id, motivoInativacao.trim())
                      setShowInativarModal(false)
                      setShowModal(false)
                    }}
                    disabled={!motivoInativacao.trim()}
                    className={`px-4 py-1.5 text-sm rounded-apple font-medium text-white ${motivoInativacao.trim() ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-300 cursor-not-allowed'}`}
                  >Confirmar Inativação</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
