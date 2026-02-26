import { describe, it, expect } from 'vitest'

// Replicate the permission logic from App.tsx for testing
// These are the views each role can access
const viewsPermitidas: Record<string, string[]> = {
  gerente: [
    'dashboard', 'clientes', 'funil', 'tarefas', 'pedidos',
    'produtos', 'automacoes', 'vendedores', 'relatorios',
    'templates', 'integracoes', 'prospeccao', 'mapa', 'social',
  ],
  vendedor: [
    'clientes', 'funil', 'tarefas', 'pedidos', 'produtos',
    'templates', 'prospeccao', 'mapa', 'social',
  ],
  sdr: [
    'clientes', 'funil', 'tarefas', 'prospeccao', 'mapa', 'social',
  ],
}

describe('permissões por cargo', () => {
  describe('gerente', () => {
    it('tem acesso ao dashboard', () => {
      expect(viewsPermitidas.gerente).toContain('dashboard')
    })

    it('tem acesso a vendedores (equipe)', () => {
      expect(viewsPermitidas.gerente).toContain('vendedores')
    })

    it('tem acesso a automações', () => {
      expect(viewsPermitidas.gerente).toContain('automacoes')
    })

    it('tem acesso a relatórios', () => {
      expect(viewsPermitidas.gerente).toContain('relatorios')
    })

    it('tem acesso a integrações', () => {
      expect(viewsPermitidas.gerente).toContain('integracoes')
    })

    it('tem mais views que vendedor', () => {
      expect(viewsPermitidas.gerente.length).toBeGreaterThan(viewsPermitidas.vendedor.length)
    })
  })

  describe('vendedor', () => {
    it('NÃO tem acesso ao dashboard', () => {
      expect(viewsPermitidas.vendedor).not.toContain('dashboard')
    })

    it('NÃO tem acesso a vendedores (equipe)', () => {
      expect(viewsPermitidas.vendedor).not.toContain('vendedores')
    })

    it('NÃO tem acesso a automações', () => {
      expect(viewsPermitidas.vendedor).not.toContain('automacoes')
    })

    it('NÃO tem acesso a relatórios', () => {
      expect(viewsPermitidas.vendedor).not.toContain('relatorios')
    })

    it('tem acesso a clientes', () => {
      expect(viewsPermitidas.vendedor).toContain('clientes')
    })

    it('tem acesso ao funil', () => {
      expect(viewsPermitidas.vendedor).toContain('funil')
    })

    it('tem acesso a pedidos', () => {
      expect(viewsPermitidas.vendedor).toContain('pedidos')
    })

    it('tem acesso a produtos', () => {
      expect(viewsPermitidas.vendedor).toContain('produtos')
    })
  })

  describe('sdr', () => {
    it('NÃO tem acesso ao dashboard', () => {
      expect(viewsPermitidas.sdr).not.toContain('dashboard')
    })

    it('NÃO tem acesso a pedidos', () => {
      expect(viewsPermitidas.sdr).not.toContain('pedidos')
    })

    it('NÃO tem acesso a produtos', () => {
      expect(viewsPermitidas.sdr).not.toContain('produtos')
    })

    it('tem acesso a prospecção', () => {
      expect(viewsPermitidas.sdr).toContain('prospeccao')
    })

    it('tem acesso a clientes', () => {
      expect(viewsPermitidas.sdr).toContain('clientes')
    })

    it('tem acesso ao funil', () => {
      expect(viewsPermitidas.sdr).toContain('funil')
    })

    it('tem acesso a tarefas', () => {
      expect(viewsPermitidas.sdr).toContain('tarefas')
    })

    it('tem menos views que vendedor', () => {
      expect(viewsPermitidas.sdr.length).toBeLessThan(viewsPermitidas.vendedor.length)
    })
  })

  describe('consistência', () => {
    it('todos os cargos existem', () => {
      expect(viewsPermitidas).toHaveProperty('gerente')
      expect(viewsPermitidas).toHaveProperty('vendedor')
      expect(viewsPermitidas).toHaveProperty('sdr')
    })

    it('todos os cargos têm pelo menos 1 view', () => {
      for (const [cargo, views] of Object.entries(viewsPermitidas)) {
        expect(views.length).toBeGreaterThan(0)
      }
    })

    it('hierarquia: gerente > vendedor > sdr', () => {
      expect(viewsPermitidas.gerente.length).toBeGreaterThan(viewsPermitidas.vendedor.length)
      expect(viewsPermitidas.vendedor.length).toBeGreaterThan(viewsPermitidas.sdr.length)
    })
  })
})
