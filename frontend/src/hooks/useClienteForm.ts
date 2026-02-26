import { useState } from 'react'
import type { Cliente, Interacao, Vendedor } from '../types'
import * as db from '../lib/database'
import { formatCNPJ, formatTelefone, validarCNPJ } from '../utils/validators'
import { logger } from '../utils/logger'

interface FormData {
  razaoSocial: string
  nomeFantasia: string
  cnpj: string
  contatoNome: string
  contatoTelefone: string
  contatoEmail: string
  endereco: string
  valorEstimado: string
  produtosInteresse: string
  vendedorId: string
}

const emptyForm: FormData = {
  razaoSocial: '', nomeFantasia: '', cnpj: '', contatoNome: '',
  contatoTelefone: '', contatoEmail: '', endereco: '',
  valorEstimado: '', produtosInteresse: '', vendedorId: ''
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    let formatted = value
    if (name === 'cnpj') formatted = formatCNPJ(value)
    if (name === 'contatoTelefone') formatted = formatTelefone(value)
    setFormData(prev => ({
      ...prev,
      [name]: formatted
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSaving) return

    // Validação de campos obrigatórios
    if (!formData.razaoSocial.trim()) { showToast('error', 'Razão Social é obrigatória.'); return }

    // Validação de CNPJ (se preenchido)
    const cnpjDigits = formData.cnpj.replace(/\D/g, '')
    if (cnpjDigits.length > 0 && !validarCNPJ(formData.cnpj)) {
      showToast('error', 'CNPJ inválido. Verifique os dígitos.')
      return
    }

    // Validação de email (se preenchido)
    if (formData.contatoEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contatoEmail.trim())) {
      showToast('error', 'Email de contato inválido.')
      return
    }

    // Validação de valor estimado (se preenchido)
    if (formData.valorEstimado && (isNaN(Number(formData.valorEstimado)) || Number(formData.valorEstimado) < 0)) {
      showToast('error', 'Valor estimado deve ser um número positivo.')
      return
    }
    
    const produtosArray = formData.produtosInteresse 
      ? formData.produtosInteresse.split(',').map(p => p.trim()).filter(p => p)
      : []
    const { vendedorId: vIdStr, valorEstimado: vEstStr, produtosInteresse: _pi, ...restForm } = formData
    
    setIsSaving(true)
    try {
      if (editingCliente) {
        const updatedFields: Partial<Cliente> = {
          ...restForm,
          valorEstimado: vEstStr ? parseFloat(vEstStr) : undefined,
          vendedorId: vIdStr ? Number(vIdStr) : (editingCliente.vendedorId || loggedUser?.id),
          produtosInteresse: produtosArray
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
          ...restForm, etapa: 'prospecção',
          valorEstimado: vEstStr ? parseFloat(vEstStr) : undefined,
          vendedorId: vIdStr ? Number(vIdStr) : loggedUser?.id,
          produtosInteresse: produtosArray,
          ultimaInteracao: new Date().toISOString().split('T')[0], diasInativo: 0
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
      contatoEmail: cliente.contatoEmail,
      endereco: cliente.endereco || '',
      valorEstimado: cliente.valorEstimado?.toString() || '',
      produtosInteresse: cliente.produtosInteresse?.join(', ') || '',
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
    handleInputChange, handleSubmit,
    handleEditCliente, openModal
  }
}
