import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import FunilView from '../components/views/FunilView'
import type { Cliente, FunilViewProps, Vendedor } from '../types'

vi.mock('../lib/database', () => ({ fetchAllPropostas: vi.fn().mockResolvedValue([]) }))
vi.mock('../lib/omieApi', () => ({ omieSyncLogistics: vi.fn() }))
vi.mock('../components/CallRecorder', () => ({ default: () => null }))

const cliente = {
  id: 123, razaoSocial: 'Cliente satisfação', etapa: 'follow_up', vendedorId: 2,
  statusFollowUp: 'entregue', dataEntradaEtapa: '2020-01-01', ultimaInteracao: '2020-01-01',
} as Cliente

function props(onColetarSatisfacao: (cliente: Cliente) => Promise<void>) {
  return {
    clientes: [cliente], vendedores: [], interacoes: [],
    loggedUser: { id: 2, nome: 'Vendedor', cargo: 'vendedor' } as Vendedor,
    onDragStart: vi.fn(), onDragOver: vi.fn(), onDrop: vi.fn(), onQuickAction: vi.fn(),
    onColetarSatisfacao,
  } as FunilViewProps & { onColetarSatisfacao: typeof onColetarSatisfacao }
}

describe('Coletar satisfação no bloqueio do funil', () => {
  it('abre o fluxo da tarefa do cliente ao clicar', async () => {
    const abrir = vi.fn().mockResolvedValue(undefined)
    render(<FunilView {...props(abrir)} />)
    fireEvent.click(screen.getByRole('button', { name: /Coletar Satisfação/ }))
    await waitFor(() => expect(abrir).toHaveBeenCalledExactlyOnceWith(cliente))
  })

  it('mostra erro e permite tentar novamente quando a tarefa não abre', async () => {
    const alerta = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const abrir = vi.fn().mockRejectedValue(new Error('offline'))
    render(<FunilView {...props(abrir)} />)
    fireEvent.click(screen.getByRole('button', { name: /Coletar Satisfação/ }))
    await waitFor(() => expect(alerta).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: /Coletar Satisfação/ })).toBeVisible())
    alerta.mockRestore()
  })
})
