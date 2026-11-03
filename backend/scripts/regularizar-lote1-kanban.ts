import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key, { auth: { persistSession: false } })

// Lote 1 aprovado (2026-11-02): principal -> excedentes a arquivar
const LOTE: { empresa: string; principal: number; excedentes: number[] }[] = [
  { empresa: 'BIG DELICIA', principal: 22810, excedentes: [22811, 22812] },
  { empresa: 'M R R SORVETERIA', principal: 22802, excedentes: [22803] },
  { empresa: 'ARTPAN', principal: 23913, excedentes: [22747] },
  { empresa: 'BOLLA BOLA', principal: 23775, excedentes: [23278, 23722] },
  { empresa: 'PAULO HENRIQUE', principal: 23576, excedentes: [23496] },
  { empresa: 'DU CASTRO', principal: 23630, excedentes: [23370] },
  { empresa: 'DARLAN', principal: 23609, excedentes: [23495] },
  { empresa: 'BERRYS', principal: 23564, excedentes: [23566, 23568, 23569] },
]

const MOTIVO = 'Regularização funil lote 1 (2026-11-02): duplicata do card principal indicado'
const apenasVerificar = process.argv.includes('--verificar')
const testarRestauração = process.argv.includes('--testar-restore')
const executar = process.argv.includes('--executar')

async function estadoAtual(ids: number[]) {
  const { data: clientes, error } = await supabase
    .from('clientes')
    .select('id, razao_social, etapa, ciclo_numero, vendedor_id, arquivado_duplicata, card_principal_id')
    .in('id', ids)
  if (error) throw error
  const { data: pedidos, error: e2 } = await supabase
    .from('pedidos').select('id, cliente_id, status, tipo').in('cliente_id', ids)
  if (e2) throw e2
  const porCliente = new Map<number, { etapa: string; arquivado: boolean; pedidos: string[] }>()
  for (const c of clientes || []) {
    const peds = (pedidos || []).filter(p => p.cliente_id === c.id).map(p => `${p.id}:${p.status}:${p.tipo || ''}`)
    porCliente.set(c.id, { etapa: c.etapa, arquivado: !!c.arquivado_duplicata, pedidos: peds })
  }
  return porCliente
}

async function main() {
  const todosIds = LOTE.flatMap(g => [g.principal, ...g.excedentes])
  console.log('=== ESTADO ATUAL (ao vivo) ===')
  const antes = await estadoAtual(todosIds)
  let ok = true
  for (const g of LOTE) {
    for (const id of [g.principal, ...g.excedentes]) {
      const st = antes.get(id)
      if (!st) { console.log(`  ${g.empresa} card ${id}: NÃO ENCONTRADO`); ok = false; continue }
      const pedAtivos = st.pedidos.filter(p => !p.includes(':cancelado:'))
      const alvo = id === g.principal ? 'PRINCIPAL' : 'excedente'
      console.log(`  ${g.empresa} ${id} ${alvo}: etapa=${st.etapa} arquivado=${st.arquivado} pedidos=[${st.pedidos.join(', ')}]`)
      if (alvo === 'excedente' && pedAtivos.length > 0) {
        console.log(`    ⚠️  EXCEDENTE COM PEDIDO ATIVO — o banco vai bloquear o arquivamento deste card`)
        ok = false
      }
      if (st.arquivado) { console.log(`    ⚠️  já está arquivado`); }
    }
  }
  if (!executar || !ok) {
    console.log(executar ? '\nABORTADO: verifique os alertas acima' : '\nModo verificação (use --executar para aplicar)')
    return
  }

  console.log('\n=== EXECUTANDO ARQUIVAMENTO ===')
  for (const g of LOTE) {
    const { data, error } = await supabase.rpc('arquivar_duplicatas_funil', {
      p_principal: g.principal, p_excedentes: g.excedentes, p_motivo: `${MOTIVO} ${g.principal}`,
    })
    if (error) { console.log(`  ${g.empresa}: FALHOU — ${error.message}`); continue }
    console.log(`  ${g.empresa}: ${data?.length ?? 0} card(s) arquivado(s) → principal ${g.principal}`)
  }

  console.log('\n=== ESTADO DEPOIS ===')
  const depois = await estadoAtual(todosIds)
  for (const g of LOTE) {
    const p = depois.get(g.principal)
    const arq = g.excedentes.map(id => `${id}:${depois.get(id)?.arquivado}`).join(' ')
    console.log(`  ${g.empresa} principal ${g.principal} etapa=${p?.etapa} arquivado=${p?.arquivado} | excedentes ${arq}`)
  }

  if (testarRestauração) {
    const alvo = LOTE[1].excedentes[0] // 22803
    console.log(`\n=== TESTE DE RESTAURAÇÃO no card ${alvo} ===`)
    const { error: e1 } = await supabase.rpc('restaurar_duplicata_funil', { p_card_id: alvo })
    console.log(e1 ? `  restaurar FALHOU: ${e1.message}` : `  restaurado OK`)
    const st = await estadoAtual([alvo]); console.log(`  arquivado=${st.get(alvo)?.arquivado} (esperado false)`)
    const { error: e2 } = await supabase.rpc('arquivar_duplicatas_funil', {
      p_principal: LOTE[1].principal, p_excedentes: [alvo], p_motivo: `${MOTIVO} ${LOTE[1].principal}`,
    })
    console.log(e2 ? `  re-arquivar FALHOU: ${e2.message}` : `  re-arquivado OK (estado final correto)`)
  }
}

main().catch(e => { console.error('ERRO:', e.message || e); process.exit(1) })
