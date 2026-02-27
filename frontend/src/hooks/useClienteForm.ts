import { useState } from 'react'
import type { Cliente, Interacao, Vendedor, FormData } from '../types'
import * as db from '../lib/database'
import { formatCNPJ, formatTelefone, validarCNPJ } from '../utils/validators'
import { logger } from '../utils/logger'

const emptyForm: FormData = {
  razaoSocial: '', nomeFantasia: '', cnpj: '', contatoNome: '',
  contatoTelefone: '', contatoCelular: '', contatoTelefoneFixo: '',
  contatoEmail: '',
  enderecoRua: '', enderecoNumero: '', enderecoComplemento: '',
  enderecoBairro: '', enderecoCidade: '', enderecoEstado: '', enderecoCep: '',
  cnaePrimario: '', cnaeSecundario: '',
  produtosInteresse: '', produtosQuantidades: {}, vendedorId: ''
}

interface UseClienteFormParams {
  loggedUser: Vendedor | null
  setClientes: React.Dispatch<React.SetStateAction<Cliente[]>>
  setInteracoes: React.Dispatch<React.SetStateAction<Interacao[]>>
  showToast: (tipo: 'success' | 'error', texto: string) => void
}

export function useClienteForm({ loggedUser, setClientes, setInteracoes, showToast }: UseClienteFormParams) {
  const [formData, setFormData] = useState<FormData>({ ...emptyForm })
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [isLoadingCep, setIsLoadingCep] = useState(false)
  const [isLoadingCnpj, setIsLoadingCnpj] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    let formatted = value
    if (name === 'cnpj') formatted = formatCNPJ(value)
    if (name === 'contatoTelefone' || name === 'contatoCelular' || name === 'contatoTelefoneFixo') formatted = formatTelefone(value)
    if (name === 'enderecoCep') formatted = value.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2').substring(0, 9)
    setFormData(prev => ({ ...prev, [name]: formatted }))
  }

  const buscarCep = async (cep: string) => {
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) return
    setIsLoadingCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (data.erro) { showToast('error', 'CEP não encontrado.'); return }
      setFormData(prev => ({
        ...prev,
        enderecoRua: data.logradouro || prev.enderecoRua,
        enderecoBairro: data.bairro || prev.enderecoBairro,
        enderecoCidade: data.localidade || prev.enderecoCidade,
        enderecoEstado: data.uf || prev.enderecoEstado,
      }))
    } catch { showToast('error', 'Erro ao buscar CEP.') } finally { setIsLoadingCep(false) }
  }

  const buscarCnpj = async (cnpj: string) => {
    const digits = cnpj.replace(/\D/g, '')
    if (digits.length !== 14) return
    setIsLoadingCnpj(true)
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
      if (!res.ok) { showToast('error', 'CNPJ não encontrado na Receita Federal.'); return }
      const data = await res.json()
      setFormData(prev => ({
        ...prev,
        razaoSocial: data.razao_social || prev.razaoSocial,
        nomeFantasia: data.nome_fantasia || prev.nomeFantasia,
        enderecoRua: data.logradouro || prev.enderecoRua,
        enderecoNumero: data.numero || prev.enderecoNumero,
        enderecoComplemento: data.complemento || prev.enderecoComplemento,
        enderecoBairro: data.bairro || prev.enderecoBairro,
        enderecoCidade: data.municipio || prev.enderecoCidade,
        enderecoEstado: data.uf || prev.enderecoEstado,
        enderecoCep: data.cep ? data.cep.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2') : prev.enderecoCep,
        cnaePrimario: data.cnae_fiscal_descricao
          ? `${data.cnae_fiscal} - ${data.cnae_fiscal_descricao}`
          : prev.cnaePrimario,
        cnaeSecundario: data.cnaes_secundarios?.length
          ? data.cnaes_secundarios.slice(0, 3).map((c: { codigo: string; descricao: string }) => `${c.codigo} - ${c.descricao}`).join(' | ')
          : prev.cnaeSecundario,
      }))
      showToast('success', 'Dados preenchidos pela Receita Federal!')
    } catch { showToast('error', 'Erro ao consultar CNPJ. Verifique a conexão.') } finally { setIsLoadingCnpj(false) }
  }

  const buildEnderecoCompleto = (f: FormData) =>
    [f.enderecoRua, f.enderecoNumero, f.enderecoComplemento, f.enderecoBairro, f.enderecoCidade, f.enderecoEstado, f.enderecoCep ? `CEP ${f.enderecoCep}` : '']
      .filter(Boolean).join(', ')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSaving) return

    if (!formData.razaoSocial.trim()) { showToast('error', 'Razão Social é obrigatória.'); return }

    const cnpjDigits = formData.cnpj.replace(/\D/g, '')
    if (cnpjDigits.length > 0 && !validarCNPJ(formData.cnpj)) {
      showToast('error', 'CNPJ inválido. Verifique os dígitos.')
      return
    }

    if (formData.contatoEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contatoEmail.trim())) {
      showToast('error', 'Email de contato inválido.')
      return
    }

    const produtosArray = formData.produtosInteresse
      ? formData.produtosInteresse.split(',').map(p => p.trim()).filter(p => p)
      : []

    const enderecoCompleto = buildEnderecoCompleto(formData)

    const { vendedorId: vIdStr, produtosInteresse: _pi, produtosQuantidades: _pq, valorEstimado: _ve, ...restForm } = formData

    const clienteFields: Partial<Cliente> = {
      ...restForm,
      endereco: enderecoCompleto,
      vendedorId: vIdStr ? Number(vIdStr) : undefined,
      produtosInteresse: produtosArray,
    }

    setIsSaving(true)
    try {
      if (editingCliente) {
        const updatedFields: Partial<Cliente> = {
          ...clienteFields,
          vendedorId: vIdStr ? Number(vIdStr) : (editingCliente.vendedorId || loggedUser?.id),
        }
        await db.updateCliente(editingCliente.id, updatedFields)
        setClientes(prev => prev.map(c => c.id === editingCliente.id ? { ...c, ...updatedFields } : c))
        const savedI = await db.insertInteracao({
          clienteId: editingCliente.id, tipo: 'nota', data: new Date().toISOString(),
          assunto: 'Dados atualizados', descricao: `Cliente atualizado: ${formData.razaoSocial}`, automatico: true
        })
        setInteracoes(prev => [savedI, ...prev])
        setEditingCliente(null)
        showToast('success', `Cliente "${formData.razaoSocial}" atualizado com sucesso!`)
      } else {
        const savedC = await db.insertCliente({
          ...clienteFields,
          etapa: 'prospecção',
          vendedorId: vIdStr ? Number(vIdStr) : loggedUser?.id,
          ultimaInteracao: new Date().toISOString().split('T')[0],
          diasInativo: 0
        } as Omit<Cliente, 'id'>)
        setClientes(prev => [...prev, savedC])
        const savedI = await db.insertInteracao({
          clienteId: savedC.id, tipo: 'nota', data: new Date().toISOString(),
          assunto: 'Novo cliente', descricao: `Cliente cadastrado por ${loggedUser?.nome || 'Sistema'}: ${formData.razaoSocial}`, automatico: true
        })
        setInteracoes(prev => [savedI, ...prev])
        showToast('success', `Cliente "${formData.razaoSocial}" cadastrado com sucesso!`)
      }
      setFormData({ ...emptyForm })
      setShowModal(false)
    } catch (err) { logger.error('Erro ao salvar cliente:', err); showToast('error', 'Erro ao salvar cliente. Tente novamente.') } finally { setIsSaving(false) }
  }

  const handleEditCliente = (cliente: Cliente) => {
    setEditingCliente(cliente)
    setFormData({
      razaoSocial: cliente.razaoSocial,
      nomeFantasia: cliente.nomeFantasia || '',
      cnpj: cliente.cnpj,
      contatoNome: cliente.contatoNome,
      contatoTelefone: cliente.contatoTelefone,
      contatoCelular: cliente.contatoCelular || '',
      contatoTelefoneFixo: cliente.contatoTelefoneFixo || '',
      contatoEmail: cliente.contatoEmail,
      enderecoRua: cliente.enderecoRua || '',
      enderecoNumero: cliente.enderecoNumero || '',
      enderecoComplemento: cliente.enderecoComplemento || '',
      enderecoBairro: cliente.enderecoBairro || '',
      enderecoCidade: cliente.enderecoCidade || '',
      enderecoEstado: cliente.enderecoEstado || '',
      enderecoCep: cliente.enderecoCep || '',
      cnaePrimario: cliente.cnaePrimario || '',
      cnaeSecundario: cliente.cnaeSecundario || '',
      produtosInteresse: cliente.produtosInteresse?.join(', ') || '',
      produtosQuantidades: {},
      vendedorId: cliente.vendedorId?.toString() || ''
    })
    setShowModal(true)
  }

  const openModal = () => {
    setEditingCliente(null)
    setFormData({ ...emptyForm })
    setShowModal(true)
  }

  return {
    formData, setFormData,
    editingCliente, isSaving,
    showModal, setShowModal,
    isLoadingCep, isLoadingCnpj,
    handleInputChange, handleSubmit,
    handleEditCliente, openModal,
    buscarCep, buscarCnpj,
  }
}
