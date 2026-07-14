import { useState } from 'react'
import type { Cliente, Interacao, Vendedor, FormData } from '../types'
import * as db from '../lib/database'
import { formatCNPJ, formatTelefone, validarCNPJ } from '../utils/validators'
import { logger } from '../utils/logger'
import { fetchCnpjViaBackend } from '../lib/botApi'

const emptyForm: FormData = {
  razaoSocial: '', nomeFantasia: '', cnpj: '', cnpj2: '', contatoNome: '',
  contatoTelefone: '', contatoCelular: '', contatoTelefoneFixo: '',
  contatoEmail: '',
  enderecoRua: '', enderecoNumero: '', enderecoComplemento: '',
  enderecoBairro: '', enderecoCidade: '', enderecoEstado: '', enderecoCep: '',
  enderecoRua2: '', enderecoNumero2: '', enderecoComplemento2: '',
  enderecoBairro2: '', enderecoCidade2: '', enderecoEstado2: '', enderecoCep2: '',
  cnaePrimario: '', cnaeSecundario: '', segmento: '',
  redesSociais: '',
  instagram: '', facebook: '', linkedin: '', website: '',
  contatoFinanceiroNome: '', contatoFinanceiroTelefone: '',
  contatoComprasNome: '', contatoComprasTelefone: '',
  valorEstimado: '',
  produtosInteresse: '', produtosQuantidades: {}, produtosQuantidadesMensais: {},
  vendedorId: '',
  statusCliente: '', grupoEconomicoId: '', descricao: ''
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    let formatted = value
    if (name === 'cnpj' || name === 'cnpj2') formatted = formatCNPJ(value)
    if (name === 'contatoTelefone' || name === 'contatoCelular' || name === 'contatoTelefoneFixo') formatted = formatTelefone(value)
    if (name === 'enderecoCep' || name === 'enderecoCep2') formatted = value.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2').substring(0, 9)
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
      const data = await fetchCnpjViaBackend(digits)

      if (!data) { showToast('error', 'CNPJ não encontrado na Receita Federal.'); return }

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

    if (formData.valorEstimado && Number(formData.valorEstimado) < 0) {
      showToast('error', 'Valor estimado deve ser um número positivo.')
      return
    }

    // Verificar CNPJ duplicado antes de salvar
    // Regra: bloquear duplicata EXCETO se o cliente existente estiver em Proposta ou etapa posterior
    // (proposta, negociacao, follow_up) — nesse caso um novo lead pode entrar em Amostra.
    const ETAPAS_PROPOSTA_OU_POSTERIOR = ['proposta', 'negociacao', 'follow_up']
    if (cnpjDigits.length === 14) {
      try {
        const duplicado = await db.checkCnpjDuplicado(formData.cnpj, editingCliente?.id)
        if (duplicado) {
          if (ETAPAS_PROPOSTA_OU_POSTERIOR.includes(duplicado.etapa)) {
            showToast('error', `"${duplicado.razaoSocial}" já está em ${duplicado.etapa === 'proposta' ? 'Proposta' : duplicado.etapa === 'negociacao' ? 'Negociação' : 'Follow-up'}. Para duplicar, use a importação de Amostra diretamente no funil.`)
            return
          }
          showToast('error', `CNPJ já cadastrado para "${duplicado.razaoSocial}" (${duplicado.etapa}). Não é possível duplicar.`)
          return
        }
      } catch (err) {
        logger.error('Erro ao verificar CNPJ duplicado:', err)
      }
    }

    const produtosArray = formData.produtosInteresse
      ? formData.produtosInteresse.split(',').map(p => p.trim()).filter(p => p)
      : []

    const enderecoCompleto = buildEnderecoCompleto(formData)

    const { vendedorId: vIdStr, produtosInteresse: _pi, produtosQuantidades: _pq, produtosQuantidadesMensais: _pqm, valorEstimado: _ve, statusCliente: _sc, grupoEconomicoId: _gei, ...restForm } = formData

    const vendedorResponsavelId = loggedUser?.cargo === 'gerente'
      ? (vIdStr ? Number(vIdStr) : undefined)
      : loggedUser?.id

    const clienteFields: Partial<Cliente> = {
      ...restForm,
      endereco: enderecoCompleto,
      vendedorId: vendedorResponsavelId,
      produtosInteresse: produtosArray,
      produtosQuantidadesMensais: _pqm && Object.keys(_pqm).length > 0 ? _pqm : undefined,
      statusCliente: (_sc || undefined) as Cliente['statusCliente'],
      grupoEconomicoId: _gei ? Number(_gei) : undefined,
    }

    setIsSaving(true)
    try {
      if (editingCliente) {
        const updatedFields: Partial<Cliente> = {
          ...clienteFields,
          vendedorId: vendedorResponsavelId || editingCliente.vendedorId || loggedUser?.id,
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
          vendedorId: vendedorResponsavelId || loggedUser?.id,
          ultimaInteracao: new Date().toISOString().split('T')[0],
          diasInativo: 0,
          criadoPorNome: loggedUser?.nome || undefined,
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
      cnpj2: cliente.cnpj2 || '',
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
      enderecoRua2: cliente.enderecoRua2 || '',
      enderecoNumero2: cliente.enderecoNumero2 || '',
      enderecoComplemento2: cliente.enderecoComplemento2 || '',
      enderecoBairro2: cliente.enderecoBairro2 || '',
      enderecoCidade2: cliente.enderecoCidade2 || '',
      enderecoEstado2: cliente.enderecoEstado2 || '',
      enderecoCep2: cliente.enderecoCep2 || '',
      cnaePrimario: cliente.cnaePrimario || '',
      cnaeSecundario: cliente.cnaeSecundario || '',
      segmento: cliente.segmento || '',
      redesSociais: cliente.redesSociais || '',
      instagram: cliente.instagram || '',
      facebook: cliente.facebook || '',
      linkedin: cliente.linkedin || '',
      website: cliente.website || '',
      contatoFinanceiroNome: cliente.contatoFinanceiroNome || '',
      contatoFinanceiroTelefone: cliente.contatoFinanceiroTelefone || '',
      contatoComprasNome: cliente.contatoComprasNome || '',
      contatoComprasTelefone: cliente.contatoComprasTelefone || '',
      produtosInteresse: cliente.produtosInteresse?.join(', ') || '',
      produtosQuantidades: {},
      produtosQuantidadesMensais: cliente.produtosQuantidadesMensais || {},
      valorEstimado: cliente.valorEstimado?.toString() || '',
      vendedorId: cliente.vendedorId?.toString() || '',
      statusCliente: cliente.statusCliente || '',
      grupoEconomicoId: cliente.grupoEconomicoId?.toString() || '',
      descricao: cliente.descricao || ''
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
