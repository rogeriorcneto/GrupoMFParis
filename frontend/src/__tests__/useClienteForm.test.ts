import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { sampleVendedor, sampleCliente } from './mocks/supabase-mock'

// Mock database module
vi.mock('../lib/database', () => ({
  updateCliente: vi.fn().mockResolvedValue(undefined),
  insertCliente: vi.fn().mockImplementation((c: any) => Promise.resolve({ ...c, id: 99 })),
  insertInteracao: vi.fn().mockImplementation((i: any) => Promise.resolve({ ...i, id: 100 })),
}))

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { useClienteForm } from '../hooks/useClienteForm'
import * as db from '../lib/database'

const defaultParams = () => ({
  loggedUser: sampleVendedor(),
  setClientes: vi.fn(),
  setInteracoes: vi.fn(),
  showToast: vi.fn(),
})

describe('useClienteForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('estado inicial', () => {
    it('inicia com formData vazio e modal fechado', () => {
      const { result } = renderHook(() => useClienteForm(defaultParams()))
      expect(result.current.formData.razaoSocial).toBe('')
      expect(result.current.formData.cnpj).toBe('')
      expect(result.current.showModal).toBe(false)
      expect(result.current.editingCliente).toBeNull()
      expect(result.current.isSaving).toBe(false)
    })
  })

  describe('handleInputChange', () => {
    it('atualiza campo simples', () => {
      const { result } = renderHook(() => useClienteForm(defaultParams()))
      act(() => {
        result.current.handleInputChange({
          target: { name: 'razaoSocial', value: 'Empresa ABC' },
        } as any)
      })
      expect(result.current.formData.razaoSocial).toBe('Empresa ABC')
    })

    it('formata CNPJ automaticamente', () => {
      const { result } = renderHook(() => useClienteForm(defaultParams()))
      act(() => {
        result.current.handleInputChange({
          target: { name: 'cnpj', value: '12345678000195' },
        } as any)
      })
      expect(result.current.formData.cnpj).toBe('12.345.678/0001-95')
    })

    it('formata telefone automaticamente', () => {
      const { result } = renderHook(() => useClienteForm(defaultParams()))
      act(() => {
        result.current.handleInputChange({
          target: { name: 'contatoTelefone', value: '31999991234' },
        } as any)
      })
      expect(result.current.formData.contatoTelefone).toBe('(31) 99999-1234')
    })

    it('atualiza vendedorId via select', () => {
      const { result } = renderHook(() => useClienteForm(defaultParams()))
      act(() => {
        result.current.handleInputChange({
          target: { name: 'vendedorId', value: '5' },
        } as any)
      })
      expect(result.current.formData.vendedorId).toBe('5')
    })
  })

  describe('openModal', () => {
    it('abre modal com form limpo', () => {
      const { result } = renderHook(() => useClienteForm(defaultParams()))
      act(() => result.current.openModal())
      expect(result.current.showModal).toBe(true)
      expect(result.current.editingCliente).toBeNull()
      expect(result.current.formData.razaoSocial).toBe('')
    })
  })

  describe('handleEditCliente', () => {
    it('preenche form com dados do cliente e abre modal', () => {
      const { result } = renderHook(() => useClienteForm(defaultParams()))
      const cliente = sampleCliente()

      act(() => result.current.handleEditCliente(cliente))

      expect(result.current.showModal).toBe(true)
      expect(result.current.editingCliente).toEqual(cliente)
      expect(result.current.formData.razaoSocial).toBe('Empresa Teste LTDA')
      expect(result.current.formData.cnpj).toBe('12.345.678/0001-95')
      expect(result.current.formData.contatoNome).toBe('João Silva')
      expect(result.current.formData.contatoTelefone).toBe('(31) 99999-1234')
      expect(result.current.formData.contatoEmail).toBe('joao@empresa.com')
      expect(result.current.formData.valorEstimado).toBe('100000')
      expect(result.current.formData.produtosInteresse).toBe('Sacaria')
      expect(result.current.formData.vendedorId).toBe('1')
    })

    it('cliente sem valorEstimado preenche com string vazia', () => {
      const { result } = renderHook(() => useClienteForm(defaultParams()))
      act(() => result.current.handleEditCliente(sampleCliente({ valorEstimado: undefined })))
      expect(result.current.formData.valorEstimado).toBe('')
    })
  })

  describe('handleSubmit — validações', () => {
    it('rejeita razão social vazia', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useClienteForm(params))

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(params.showToast).toHaveBeenCalledWith('error', 'Razão Social é obrigatória.')
      expect(db.insertCliente).not.toHaveBeenCalled()
    })

    it('rejeita CNPJ inválido', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useClienteForm(params))

      act(() => {
        result.current.handleInputChange({ target: { name: 'razaoSocial', value: 'Teste' } } as any)
        result.current.handleInputChange({ target: { name: 'cnpj', value: '11.111.111/1111-11' } } as any)
      })

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(params.showToast).toHaveBeenCalledWith('error', 'CNPJ inválido. Verifique os dígitos.')
    })

    it('rejeita email inválido', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useClienteForm(params))

      act(() => {
        result.current.handleInputChange({ target: { name: 'razaoSocial', value: 'Teste' } } as any)
        result.current.handleInputChange({ target: { name: 'contatoEmail', value: 'invalido' } } as any)
      })

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(params.showToast).toHaveBeenCalledWith('error', 'Email de contato inválido.')
    })

    it('rejeita valor estimado negativo', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useClienteForm(params))

      act(() => {
        result.current.handleInputChange({ target: { name: 'razaoSocial', value: 'Teste' } } as any)
        result.current.handleInputChange({ target: { name: 'valorEstimado', value: '-500' } } as any)
      })

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(params.showToast).toHaveBeenCalledWith('error', 'Valor estimado deve ser um número positivo.')
    })
  })

  describe('handleSubmit — criação', () => {
    it('cria cliente novo com sucesso', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useClienteForm(params))

      act(() => {
        result.current.handleInputChange({ target: { name: 'razaoSocial', value: 'Nova Empresa' } } as any)
        result.current.handleInputChange({ target: { name: 'contatoEmail', value: 'test@test.com' } } as any)
        result.current.handleInputChange({ target: { name: 'valorEstimado', value: '50000' } } as any)
      })

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(db.insertCliente).toHaveBeenCalledTimes(1)
      expect(db.insertInteracao).toHaveBeenCalledTimes(1)
      expect(params.setClientes).toHaveBeenCalled()
      expect(params.setInteracoes).toHaveBeenCalled()
      expect(params.showToast).toHaveBeenCalledWith('success', expect.stringContaining('Nova Empresa'))
      expect(result.current.showModal).toBe(false)
      expect(result.current.formData.razaoSocial).toBe('')
    })

    it('atribui vendedorId do loggedUser quando não especificado', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useClienteForm(params))

      act(() => {
        result.current.handleInputChange({ target: { name: 'razaoSocial', value: 'Empresa' } } as any)
      })

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      const insertCall = vi.mocked(db.insertCliente).mock.calls[0][0] as any
      expect(insertCall.vendedorId).toBe(1) // loggedUser.id
    })
  })

  describe('handleSubmit — edição', () => {
    it('atualiza cliente existente', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useClienteForm(params))

      // Enter edit mode
      act(() => result.current.handleEditCliente(sampleCliente()))

      // Change razao social
      act(() => {
        result.current.handleInputChange({ target: { name: 'razaoSocial', value: 'Empresa Atualizada' } } as any)
      })

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(db.updateCliente).toHaveBeenCalledWith(1, expect.objectContaining({
        razaoSocial: 'Empresa Atualizada',
      }))
      expect(db.insertInteracao).toHaveBeenCalledTimes(1)
      expect(params.showToast).toHaveBeenCalledWith('success', expect.stringContaining('atualizado'))
      expect(result.current.showModal).toBe(false)
    })
  })

  describe('handleSubmit — erro', () => {
    it('mostra toast de erro quando db falha', async () => {
      vi.mocked(db.insertCliente).mockRejectedValueOnce(new Error('DB error'))
      const params = defaultParams()
      const { result } = renderHook(() => useClienteForm(params))

      act(() => {
        result.current.handleInputChange({ target: { name: 'razaoSocial', value: 'Empresa' } } as any)
      })

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(params.showToast).toHaveBeenCalledWith('error', expect.stringContaining('Erro'))
      expect(result.current.isSaving).toBe(false)
    })
  })

  describe('isSaving flag', () => {
    it('isSaving volta para false após submit completo', async () => {
      const params = defaultParams()
      const { result } = renderHook(() => useClienteForm(params))

      expect(result.current.isSaving).toBe(false)

      act(() => {
        result.current.handleInputChange({ target: { name: 'razaoSocial', value: 'Empresa' } } as any)
      })

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(result.current.isSaving).toBe(false)
    })

    it('isSaving volta para false após erro', async () => {
      vi.mocked(db.insertCliente).mockRejectedValueOnce(new Error('DB error'))
      const params = defaultParams()
      const { result } = renderHook(() => useClienteForm(params))

      act(() => {
        result.current.handleInputChange({ target: { name: 'razaoSocial', value: 'Empresa' } } as any)
      })

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(result.current.isSaving).toBe(false)
    })
  })
})
