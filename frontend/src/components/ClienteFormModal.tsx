import React from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import type { Cliente, Produto, Vendedor, FormData } from '../types'

interface ClienteFormModalProps {
  showModal: boolean
  setShowModal: (v: boolean) => void
  editingCliente: Cliente | null
  formData: FormData
  setFormData: React.Dispatch<React.SetStateAction<FormData>>
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  handleSubmit: (e: React.FormEvent) => void
  isSaving: boolean
  isLoadingCep: boolean
  isLoadingCnpj: boolean
  buscarCep: (cep: string) => void
  buscarCnpj: (cnpj: string) => void
  produtos: Produto[]
  vendedores: Vendedor[]
}

export default function ClienteFormModal({
  showModal, setShowModal, editingCliente, formData, setFormData,
  handleInputChange, handleSubmit, isSaving,
  isLoadingCep, isLoadingCnpj, buscarCep, buscarCnpj,
  produtos, vendedores
}: ClienteFormModalProps) {
  if (!showModal) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black bg-opacity-25 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        />

        {/* Modal */}
        <div className="relative w-full max-w-lg bg-white rounded-apple shadow-apple border border-gray-200 max-h-[90vh] overflow-y-auto">
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
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">CNPJ 2 (opcional)</label>
                    <input type="text" name="cnpj2" value={formData.cnpj2} onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      placeholder="00.000.000/0000-00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Razão Social *</label>
                    <input type="text" name="razaoSocial" value={formData.razaoSocial} onChange={handleInputChange} required
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      placeholder="Ex: Supermercado BH Ltda" />
                  </div>
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
                      <input type="tel" name="contatoCelular" value={formData.contatoCelular} onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        placeholder="(00) 99999-0000" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Telefone Fixo</label>
                      <input type="tel" name="contatoTelefoneFixo" value={formData.contatoTelefoneFixo} onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        placeholder="(00) 3333-0000" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp / Telefone Principal</label>
                    <input type="tel" name="contatoTelefone" value={formData.contatoTelefone} onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      placeholder="(00) 99999-0000" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                    <input type="email" name="contatoEmail" value={formData.contatoEmail} onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      placeholder="email@empresa.com" />
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

              {/* ── Endereço 2 ── */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Endereço 2 (opcional)</p>
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

              {/* ── Produtos de Interesse ── */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Produtos de Interesse</p>
                <div className="border border-gray-300 rounded-apple overflow-hidden">
                  {produtos.filter(p => p.ativo).length === 0 && (
                    <p className="text-xs text-gray-400 p-3">Nenhum produto cadastrado</p>
                  )}
                  {produtos.filter(p => p.ativo).map(p => {
                    const selected = formData.produtosInteresse.split(',').map(s => s.trim()).filter(Boolean)
                    const isChecked = selected.includes(p.nome)
                    const qty = formData.produtosQuantidades?.[p.nome] || 1
                    return (
                      <div key={p.id} className={`px-3 py-2 border-b border-gray-100 last:border-b-0 ${isChecked ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={isChecked}
                            onChange={() => {
                              const updated = isChecked
                                ? selected.filter(s => s !== p.nome)
                                : [...selected, p.nome]
                              setFormData(prev => ({ ...prev, produtosInteresse: updated.join(', ') }))
                            }}
                            className="w-4 h-4 text-primary-600 rounded flex-shrink-0" />
                          <span className="text-sm text-gray-800 flex-1">{p.nome}</span>
                          <span className="text-xs text-gray-400">R$ {p.preco.toFixed(2).replace('.', ',')}/{p.unidade}</span>
                        </div>
                        {isChecked && (
                          <div className="flex items-center gap-2 mt-2 ml-6">
                            <label className="text-xs text-gray-500">Qtd:</label>
                            <div className="flex items-center border border-gray-300 rounded-apple overflow-hidden">
                              <button type="button"
                                onClick={() => setFormData(prev => ({ ...prev, produtosQuantidades: { ...prev.produtosQuantidades, [p.nome]: Math.max(1, (prev.produtosQuantidades?.[p.nome] || 1) - 1) } }))}
                                className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold">−</button>
                              <input type="number" min={1} value={qty}
                                onChange={(e) => setFormData(prev => ({ ...prev, produtosQuantidades: { ...prev.produtosQuantidades, [p.nome]: Math.max(1, parseInt(e.target.value) || 1) } }))}
                                className="w-12 text-center text-sm py-0.5 border-x border-gray-300 focus:outline-none" />
                              <button type="button"
                                onClick={() => setFormData(prev => ({ ...prev, produtosQuantidades: { ...prev.produtosQuantidades, [p.nome]: (prev.produtosQuantidades?.[p.nome] || 1) + 1 } }))}
                                className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold">+</button>
                            </div>
                            <span className="text-xs text-primary-600 font-medium">
                              = R$ {(p.preco * qty).toFixed(2).replace('.', ',')}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ── Vendedor ── */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Vendedor Responsável</label>
                <select name="vendedorId" value={formData.vendedorId || ''} onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm">
                  <option value="">Sem vendedor</option>
                  {vendedores.filter(v => v.ativo).map(v => (
                    <option key={v.id} value={v.id}>{v.nome} ({v.cargo === 'gerente' ? 'Gerente' : v.cargo === 'sdr' ? 'SDR' : 'Vendedor'})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3 mt-6">
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
          </form>
        </div>
      </div>
    </div>
  )
}
