import React from 'react'
import { SparklesIcon, FlagIcon } from '@heroicons/react/24/outline'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import type { Cliente, Vendedor, Interacao, Produto, Pedido, Tarefa, Atividade, Missao } from '../../types'
import { fetchTempoTelaRelatorio, type TempoTelaRelatorioItem, authFetch, BOT_URL } from '../../lib/botApi'
import { stageLabels } from '../../utils/constants'
import { calcularDuracoesEtapas, diasEtapaAtual, EtapaDuracao } from '../../utils/etapas'

type Periodo = '7d' | '30d' | '90d' | 'total'
const periodoLabels: Record<Periodo, string> = { '7d': '7 dias', '30d': '30 dias', '90d': '90 dias', 'total': 'Todo período' }

const RelatoriosView: React.FC<{ clientes: Cliente[], vendedores: Vendedor[], interacoes: Interacao[], produtos?: Produto[], pedidos?: Pedido[], tarefas?: Tarefa[], atividades?: Atividade[] }> = ({ clientes, vendedores, interacoes, produtos = [], pedidos = [], tarefas = [], atividades = [] }) => {
  const [periodo, setPeriodo] = React.useState<Periodo>('total')

  const hoje = new Date().toISOString().slice(0, 10)
  const [ttDataInicio, setTtDataInicio] = React.useState(hoje)
  const [ttDataFim, setTtDataFim] = React.useState(hoje)
  const [ttRelatorio, setTtRelatorio] = React.useState<TempoTelaRelatorioItem[]>([])
  const [ttLoading, setTtLoading] = React.useState(false)

  React.useEffect(() => {
    setTtLoading(true)
    fetchTempoTelaRelatorio(ttDataInicio, ttDataFim)
      .then(r => setTtRelatorio(r.relatorio))
      .catch(() => setTtRelatorio([]))
      .finally(() => setTtLoading(false))
  }, [ttDataInicio, ttDataFim])

  const [missoes, setMissoes] = React.useState<Missao[]>([])

  React.useEffect(() => {
    authFetch(`${BOT_URL}/api/missoes?status=em_andamento`)
      .then(r => r.json())
      .then(r => setMissoes(r.data || []))
      .catch(() => {})
  }, [])

  const threshold = React.useMemo(() => {
    if (periodo === 'total') return null
    const d = new Date()
    if (periodo === '7d') d.setDate(d.getDate() - 7)
    else if (periodo === '30d') d.setMonth(d.getMonth() - 1)
    else if (periodo === '90d') d.setMonth(d.getMonth() - 3)
    return d
  }, [periodo])

  const fc = React.useMemo(() => {
    if (!threshold) return clientes
    return clientes.filter(c => {
      const d = c.dataEntradaEtapa || c.ultimaInteracao
      return d ? new Date(d) >= threshold : false
    })
  }, [clientes, threshold])

  const fi = React.useMemo(() => {
    if (!threshold) return interacoes
    return interacoes.filter(i => new Date(i.data) >= threshold)
  }, [interacoes, threshold])

  const fp = React.useMemo(() => {
    if (!threshold) return pedidos
    return pedidos.filter(p => new Date(p.dataCriacao) >= threshold)
  }, [pedidos, threshold])

  const fpConfirmed = React.useMemo(() => fp.filter(p => p.status === 'confirmado'), [fp])

  const ft = React.useMemo(() => {
    if (!threshold) return tarefas
    return tarefas.filter(t => new Date(t.data) >= threshold)
  }, [tarefas, threshold])

  const fa = React.useMemo(() => {
    if (!threshold) return atividades
    return atividades.filter(a => new Date(a.timestamp) >= threshold)
  }, [atividades, threshold])

  const stages = ['lead', 'prospecção', 'amostra', 'amostra_perdida', 'proposta', 'negociacao', 'follow_up', 'inativo', 'perdido']
  const COLORS = ['#3B82F6', '#EAB308', '#22C55E', '#A855F7', '#EC4899', '#EF4444']

  const pipelineData = stages.map(s => ({ name: stageLabels[s] || s, valor: fc.filter(c => c.etapa === s).reduce((sum, c) => sum + (c.valorEstimado || 0), 0), qtd: fc.filter(c => c.etapa === s).length }))
  const pieData = stages.map(s => ({ name: stageLabels[s] || s, value: fc.filter(c => c.etapa === s).length })).filter(d => d.value > 0)
  const vendedorData = vendedores.filter(v => v.ativo).map(v => { const cv = fc.filter(c => c.vendedorId === v.id); return { name: v.nome.split(' ')[0], pipeline: cv.reduce((s, c) => s + (c.valorEstimado || 0), 0), leads: cv.length, conversoes: cv.filter(c => c.etapa === 'follow_up').length } })
  const interacaoData = ['email', 'whatsapp', 'linkedin', 'instagram', 'ligacao', 'reuniao'].map(tipo => ({ name: tipo.charAt(0).toUpperCase() + tipo.slice(1), qtd: fi.filter(i => i.tipo === tipo).length })).filter(d => d.qtd > 0)

  const gerarRelatorioPDF = () => {
    const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    const totalLeads = clientes.length
    const leadsAtivos = clientes.filter(c => c.etapa !== 'perdido').length
    const perdidos = clientes.filter(c => c.etapa === 'perdido')
    const clientesAtivos = clientes.filter(c => c.etapa === 'follow_up')
    const totalPipeline = clientes.reduce((s, c) => s + (c.valorEstimado || 0), 0)
    const valorPerdido = perdidos.reduce((s, c) => s + (c.valorEstimado || 0), 0)
    const valorGanho = clientesAtivos.reduce((s, c) => s + (c.valorEstimado || 0), 0)
    const taxaConversao = totalLeads > 0 ? ((clientesAtivos.length / totalLeads) * 100).toFixed(1) : '0'
    const taxaPerda = totalLeads > 0 ? ((perdidos.length / totalLeads) * 100).toFixed(1) : '0'
    const ticketMedio = leadsAtivos > 0 ? Math.round(totalPipeline / leadsAtivos) : 0
    const stLabels: Record<string, string> = { 'lead': 'Leads', 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'amostra_perdida': 'Amostra Perdida', 'proposta': 'Proposta', 'negociacao': 'Negociação', 'follow_up': 'Follow-up', 'inativo': 'Inativos', 'perdido': 'Perdido' }
    const catLabels: Record<string, string> = { preco: 'Preço', prazo: 'Prazo', qualidade: 'Qualidade', concorrencia: 'Concorrência', sem_resposta: 'Sem resposta', outro: 'Outro' }
    const pipelineRows = stages.map(s => { const cls = clientes.filter(c => c.etapa === s); return `<tr><td>${stLabels[s]}</td><td style="text-align:center">${cls.length}</td><td style="text-align:right">R$ ${cls.reduce((sum, c) => sum + (c.valorEstimado || 0), 0).toLocaleString('pt-BR')}</td></tr>` }).join('')
    const vendRows = vendedores.filter(v => v.ativo).map(v => { const cv = clientes.filter(c => c.vendedorId === v.id); return `<tr><td>${v.nome}</td><td style="text-align:center">${cv.length}</td><td style="text-align:center">${cv.filter(c => c.etapa === 'follow_up').length}</td><td style="text-align:center">${cv.filter(c => c.etapa === 'perdido').length}</td><td style="text-align:right">R$ ${cv.filter(c => c.etapa !== 'perdido').reduce((s, c) => s + (c.valorEstimado || 0), 0).toLocaleString('pt-BR')}</td></tr>` }).join('')
    const catCount = perdidos.reduce((acc, c) => { const k = c.categoriaPerda || 'outro'; acc[k] = (acc[k] || 0) + 1; return acc }, {} as Record<string, number>)
    const perdaRows = Object.entries(catCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${catLabels[k] || k}</td><td style="text-align:center">${v}</td><td style="text-align:right">${totalLeads > 0 ? ((v / totalLeads) * 100).toFixed(1) : 0}%</td></tr>`).join('')
    const funilStages = ['lead', 'prospecção', 'amostra', 'proposta', 'negociacao', 'follow_up']
    const passaramPor: Record<string, number> = {}
    funilStages.forEach(s => { passaramPor[s] = 0 })
    clientes.forEach(c => { const etapas = new Set<string>(); etapas.add(c.etapa); (c.historicoEtapas || []).forEach(h => { etapas.add(h.etapa); if (h.de) etapas.add(h.de) }); funilStages.forEach(s => { if (etapas.has(s)) passaramPor[s]++ }) })
    const convRows = funilStages.map((s, i) => { const qtd = passaramPor[s]; const ant = i > 0 ? passaramPor[funilStages[i - 1]] : qtd; const taxa = ant > 0 ? ((qtd / ant) * 100).toFixed(0) : '—'; return `<tr><td>${stLabels[s]}</td><td style="text-align:center">${qtd}</td><td style="text-align:center">${i > 0 ? taxa + '%' : '—'}</td></tr>` }).join('')
    const topClientes = [...clientes].filter(c => c.etapa !== 'perdido').sort((a, b) => (b.valorEstimado || 0) - (a.valorEstimado || 0)).slice(0, 10)
    const topRows = topClientes.map(c => { const vend = vendedores.find(v => v.id === c.vendedorId); return `<tr><td>${c.razaoSocial}</td><td>${stLabels[c.etapa] || c.etapa}</td><td style="text-align:center">${c.score || 0}</td><td style="text-align:right">R$ ${(c.valorEstimado || 0).toLocaleString('pt-BR')}</td><td>${vend?.nome || '—'}</td></tr>` }).join('')
    const etapaMaisPerdas = Object.entries(perdidos.reduce((acc, c) => { const k = c.etapaAnterior || 'desconhecido'; acc[k] = (acc[k] || 0) + 1; return acc }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1])
    const motivoTop = Object.entries(catCount).sort((a, b) => b[1] - a[1])
    const probEtapa: Record<string, number> = { 'lead': 0.05, 'prospecção': 0.10, 'amostra': 0.25, 'amostra_perdida': 0.05, 'proposta': 0.40, 'negociacao': 0.60, 'follow_up': 0.80, 'inativo': 0.10 }
    const receitaProjetada = clientes.filter(c => c.etapa !== 'perdido').reduce((s, c) => s + (c.valorEstimado || 0) * (probEtapa[c.etapa] || 0), 0)
    const clientesRisco = clientes.filter(c => { if (!c.dataEntradaEtapa) return false; const dias = Math.floor((Date.now() - new Date(c.dataEntradaEtapa).getTime()) / 86400000); return (c.etapa === 'amostra' && dias >= 35) || (c.etapa === 'proposta' && dias >= 25) || (c.etapa === 'negociacao' && dias >= 35) })
    const insights = [
      `O pipeline atual totaliza <strong>R$ ${totalPipeline.toLocaleString('pt-BR')}</strong> distribuídos em <strong>${leadsAtivos}</strong> leads ativos.`,
      `A taxa de conversão global é de <strong>${taxaConversao}%</strong> (${clientesAtivos.length} de ${totalLeads} leads chegaram a Cliente Ativo).`,
      `Receita projetada (ponderada por probabilidade): <strong>R$ ${receitaProjetada.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</strong>.`,
      motivoTop.length > 0 ? `O principal motivo de perda é <strong>"${catLabels[motivoTop[0][0]] || motivoTop[0][0]}"</strong> com ${motivoTop[0][1]} ocorrência(s).` : '',
      etapaMaisPerdas.length > 0 ? `A etapa com mais perdas é <strong>"${stLabels[etapaMaisPerdas[0][0]] || etapaMaisPerdas[0][0]}"</strong> (${etapaMaisPerdas[0][1]} clientes).` : '',
      clientesRisco.length > 0 ? `⚠️ <strong>${clientesRisco.length}</strong> cliente(s) em risco de perda por prazo: ${clientesRisco.map(c => c.razaoSocial).join(', ')}.` : 'Nenhum cliente em risco iminente de prazo.',
      `Ticket médio: <strong>R$ ${ticketMedio.toLocaleString('pt-BR')}</strong>.`,
    ].filter(Boolean)

    const confirmedOrders = pedidos.filter(p => p.status === 'confirmado')
    const activeClientIds = new Set(confirmedOrders.map(p => p.clienteId))
    const ativos = activeClientIds.size
    const receitaTotal = confirmedOrders.reduce((s, p) => s + p.totalValor, 0)
    const receitaMedia = ativos > 0 ? Math.round(receitaTotal / ativos) : 0
    const clientRev = new Map<number, number>()
    confirmedOrders.forEach(p => clientRev.set(p.clienteId, (clientRev.get(p.clienteId) || 0) + p.totalValor))
    const revArr = Array.from(clientRev.entries()).sort((a, b) => b[1] - a[1])
    const totalRev = revArr.reduce((s, [, v]) => s + v, 0)
    let cum = 0, classeA = 0, classeB = 0, classeC = 0
    revArr.forEach(([, v]) => { cum += v; if (cum / (totalRev || 1) <= 0.8) classeA++; else if (cum / (totalRev || 1) <= 0.95) classeB++; else classeC++ })
    const top10Rev = revArr.slice(0, 10).reduce((s, [, v]) => s + v, 0)
    const concentracaoTop10 = totalRev > 0 ? (top10Rev / totalRev) * 100 : 0
    const pedidosFechados = confirmedOrders.length
    const taxaConversaoFunil = clientes.length > 0 ? ((pedidosFechados / clientes.length) * 100).toFixed(1) : '0'
    const vendedoresRanking = vendedores.filter(v => v.ativo).map(v => {
      const pv = confirmedOrders.filter(p => p.vendedorId === v.id)
      const cv = clientes.filter(c => c.vendedorId === v.id)
      const faturamento = pv.reduce((s, p) => s + p.totalValor, 0)
      const volume = pv.reduce((s, p) => s + p.itens.reduce((is, it) => is + it.quantidade, 0), 0)
      const conv = cv.length > 0 ? ((cv.filter(c => c.etapa === 'follow_up').length / cv.length) * 100).toFixed(1) : '0'
      return { nome: v.nome, faturamento, volume, conv }
    }).filter(v => v.faturamento > 0 || v.volume > 0).sort((a, b) => b.faturamento - a.faturamento)

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório Comercial MF Paris</title>
<style>@page{margin:20mm;size:A4}body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;font-size:11pt;line-height:1.5}h1{font-size:22pt;color:#1e40af;margin-bottom:4px;border-bottom:3px solid #3b82f6;padding-bottom:8px}h2{font-size:14pt;color:#1e3a5f;margin-top:28px;margin-bottom:8px;border-left:4px solid #3b82f6;padding-left:10px}.subtitle{font-size:10pt;color:#666;margin-bottom:20px}.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}.kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center}.kpi .label{font-size:9pt;color:#64748b;text-transform:uppercase;letter-spacing:.5px}.kpi .value{font-size:16pt;font-weight:700;color:#1e293b;margin-top:4px}.kpi .value.green{color:#16a34a}.kpi .value.red{color:#dc2626}.kpi .value.blue{color:#2563eb}table{width:100%;border-collapse:collapse;margin:10px 0 20px 0;font-size:10pt}th{background:#f1f5f9;font-weight:600;text-align:left;padding:8px 10px;border-bottom:2px solid #cbd5e1}td{padding:6px 10px;border-bottom:1px solid #e2e8f0}tr:nth-child(even){background:#f8fafc}.insights{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:16px 0}.insights h2{color:#1e40af;border-left-color:#3b82f6;margin-top:0}.insights ul{margin:8px 0;padding-left:20px}.insights li{margin-bottom:6px;font-size:10.5pt}.footer{margin-top:30px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:9pt;color:#94a3b8;text-align:center}.page-break{page-break-before:always}</style></head><body>
<h1>📊 Relatório Comercial — MF Paris</h1><p class="subtitle">Gerado em ${hoje} • Dados em tempo real do CRM</p>
<div class="kpi-grid"><div class="kpi"><div class="label">Total Leads</div><div class="value">${totalLeads}</div></div><div class="kpi"><div class="label">Leads Ativos</div><div class="value blue">${leadsAtivos}</div></div><div class="kpi"><div class="label">Pipeline Total</div><div class="value">R$ ${totalPipeline.toLocaleString('pt-BR')}</div></div><div class="kpi"><div class="label">Ticket Médio</div><div class="value">R$ ${ticketMedio.toLocaleString('pt-BR')}</div></div><div class="kpi"><div class="label">Conversão</div><div class="value green">${taxaConversao}%</div></div><div class="kpi"><div class="label">Vendas Fechadas</div><div class="value green">R$ ${valorGanho.toLocaleString('pt-BR')}</div></div><div class="kpi"><div class="label">Taxa de Perda</div><div class="value red">${taxaPerda}%</div></div><div class="kpi"><div class="label">Valor Perdido</div><div class="value red">R$ ${valorPerdido.toLocaleString('pt-BR')}</div></div></div>
<div class="insights"><h2>🤖 Análise Inteligente (IA)</h2><ul>${insights.map(i => `<li>${i}</li>`).join('')}</ul></div>
<h2>📊 Pipeline por Etapa</h2><table><thead><tr><th>Etapa</th><th style="text-align:center">Leads</th><th style="text-align:right">Valor</th></tr></thead><tbody>${pipelineRows}</tbody></table>
<h2>📈 Funil de Conversão</h2><table><thead><tr><th>Etapa</th><th style="text-align:center">Passaram</th><th style="text-align:center">Taxa</th></tr></thead><tbody>${convRows}</tbody></table>
<h2>👥 Desempenho por Vendedor</h2><table><thead><tr><th>Vendedor</th><th style="text-align:center">Leads</th><th style="text-align:center">Ganhos</th><th style="text-align:center">Perdidos</th><th style="text-align:right">Pipeline Ativo</th></tr></thead><tbody>${vendRows}</tbody></table>
<div class="page-break"></div>
<h2>🏆 Top 10 Clientes (por valor)</h2><table><thead><tr><th>Cliente</th><th>Etapa</th><th style="text-align:center">Score</th><th style="text-align:right">Valor</th><th>Vendedor</th></tr></thead><tbody>${topRows}</tbody></table>
${perdidos.length > 0 ? `<h2>❌ Análise de Perdas</h2><table><thead><tr><th>Motivo</th><th style="text-align:center">Qtd</th><th style="text-align:right">% do Total</th></tr></thead><tbody>${perdaRows}</tbody></table>` : ''}
<h2>🔮 Projeção de Receita</h2><table><thead><tr><th>Etapa</th><th style="text-align:center">Leads</th><th style="text-align:center">Prob.</th><th style="text-align:right">Valor Pipeline</th><th style="text-align:right">Projetado</th></tr></thead><tbody>
${funilStages.map(s => { const cls = clientes.filter(c => c.etapa === s); const val = cls.reduce((sum, c) => sum + (c.valorEstimado || 0), 0); const proj = val * (probEtapa[s] || 0); return `<tr><td>${stLabels[s]}</td><td style="text-align:center">${cls.length}</td><td style="text-align:center">${((probEtapa[s] || 0) * 100).toFixed(0)}%</td><td style="text-align:right">R$ ${val.toLocaleString('pt-BR')}</td><td style="text-align:right"><strong>R$ ${proj.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</strong></td></tr>` }).join('')}
<tr style="background:#f0fdf4;font-weight:700"><td colspan="4">Total Projetado</td><td style="text-align:right;color:#16a34a">R$ ${receitaProjetada.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td></tr>
</tbody></table>
<div class="footer">Relatório gerado automaticamente pelo CRM MF Paris com análise de IA • ${hoje}</div><div class="page-break"></div>
<h2>5. Indicadores de Clientes</h2>
<div class="kpi-grid"><div class="kpi"><div class="label">Clientes Ativos</div><div class="value">${ativos}</div></div><div class="kpi"><div class="label">Receita Total</div><div class="value">R$ ${receitaTotal.toLocaleString('pt-BR')}</div></div><div class="kpi"><div class="label">Receita Média / Cliente</div><div class="value">R$ ${receitaMedia.toLocaleString('pt-BR')}</div></div><div class="kpi"><div class="label">Concentração Top 10</div><div class="value">${concentracaoTop10.toFixed(1)}%</div></div></div>
<table><thead><tr><th>Indicador</th><th style="text-align:center">Valor</th></tr></thead><tbody>
<tr><td>Clientes Classe A</td><td style="text-align:center">${classeA}</td></tr>
<tr><td>Clientes Classe B</td><td style="text-align:center">${classeB}</td></tr>
<tr><td>Clientes Classe C</td><td style="text-align:center">${classeC}</td></tr>
</tbody></table>
<h2>6. Funil Comercial</h2>
<table><thead><tr><th>Etapa</th><th style="text-align:center">Qtd</th></tr></thead><tbody>
${funilStages.map(s => `<tr><td>${stLabels[s]}</td><td style="text-align:center">${clientes.filter(c => c.etapa === s).length}</td></tr>`).join('')}
<tr><td>Pedidos Fechados</td><td style="text-align:center">${pedidosFechados}</td></tr>
<tr><td>Taxa de Conversão do Funil</td><td style="text-align:center">${taxaConversaoFunil}%</td></tr>
</tbody></table>
<h2>7. Performance da Equipe</h2>
<table><thead><tr><th>Vendedor</th><th style="text-align:right">Faturamento</th><th style="text-align:center">Volume</th><th style="text-align:center">Conversão</th></tr></thead><tbody>
${vendedoresRanking.map(v => `<tr><td>${v.nome}</td><td style="text-align:right">R$ ${v.faturamento.toLocaleString('pt-BR')}</td><td style="text-align:center">${v.volume}</td><td style="text-align:center">${v.conv}%</td></tr>`).join('')}
</tbody></table>
<h2>8. Inteligência Competitiva</h2>
<table><thead><tr><th>Categoria</th><th style="text-align:center">Qtd</th><th style="text-align:right">% das Perdas</th></tr></thead><tbody>
${Object.entries(catCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${catLabels[k] || k}</td><td style="text-align:center">${v}</td><td style="text-align:right">${perdidos.length > 0 ? ((v / perdidos.length) * 100).toFixed(1) : 0}%</td></tr>`).join('')}
</tbody></table>
</body></html>`

    const printWindow = window.open('', '_blank')
    if (printWindow) { printWindow.document.write(html); printWindow.document.close(); setTimeout(() => { printWindow.print() }, 500) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div><h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Relatórios e Gráficos</h1><p className="mt-1 text-sm text-gray-600">Análise visual completa do pipeline, vendedores e interações{periodo !== 'total' ? ` — últimos ${periodoLabels[periodo]}` : ''}</p></div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-apple p-0.5 shadow-apple-sm">
            {(['7d', '30d', '90d', 'total'] as Periodo[]).map(p => (
              <button key={p} onClick={() => setPeriodo(p)} className={`px-3 py-1.5 text-xs font-medium rounded-apple transition-all duration-200 ${ periodo === p ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900' }`}>
                {periodoLabels[p]}
              </button>
            ))}
          </div>
          <button onClick={gerarRelatorioPDF} className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-apple hover:from-blue-700 hover:to-indigo-700 shadow-apple-sm flex items-center gap-2 font-medium text-sm transition-all">
            <SparklesIcon className="h-4 w-4" /> Relatório IA
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-100 text-orange-600"><FlagIcon className="h-5 w-5" /></div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Missões em andamento</p>
            <p className="text-xl font-bold text-gray-900">{missoes.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600"><FlagIcon className="h-5 w-5" /></div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Custo estimado</p>
            <p className="text-xl font-bold text-gray-900">R$ {missoes.reduce((s, m) => s + (m.custoEstimado || 0), 0).toLocaleString('pt-BR')}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Pipeline por Etapa (R$)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={pipelineData}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} /><Tooltip formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Valor']} /><Bar dataKey="valor" radius={[6, 6, 0, 0]}>{pipelineData.map((_e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar></BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">🥧 Distribuição de Leads</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart><Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>{pieData.map((_e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">👥 Desempenho por Vendedor</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={vendedorData}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} /><Tooltip formatter={(value: number, name: string) => [name === 'pipeline' ? `R$ ${value.toLocaleString('pt-BR')}` : value, name === 'pipeline' ? 'Pipeline' : name === 'leads' ? 'Leads' : 'Conversões']} /><Bar dataKey="pipeline" fill="#6366F1" name="Pipeline" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">💬 Interações por Canal</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={interacaoData} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={80} /><Tooltip /><Bar dataKey="qtd" fill="#10B981" name="Quantidade" radius={[0, 6, 6, 0]} /></BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Produtos por Pipeline */}
      <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📦 Produtos por Volume de Pipeline</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={(() => { const prodPipeline: Record<string, number> = {}; clientes.forEach(c => (c.produtosInteresse || []).forEach(p => { prodPipeline[p] = (prodPipeline[p] || 0) + (c.valorEstimado || 0) })); return Object.entries(prodPipeline).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, valor]) => ({ name: name.length > 18 ? name.slice(0, 18) + '…' : name, valor })) })()} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} /><YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={140} /><Tooltip formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Pipeline']} /><Bar dataKey="valor" fill="#F59E0B" name="Pipeline" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Resumo Executivo */}
      <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 Resumo Executivo</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-blue-50 rounded-apple border border-blue-200"><p className="text-xs text-blue-600 font-medium">Total Pipeline</p><p className="text-xl font-bold text-blue-900">R$ {fc.reduce((s, c) => s + (c.valorEstimado || 0), 0).toLocaleString('pt-BR')}</p></div>
          <div className="p-4 bg-green-50 rounded-apple border border-green-200"><p className="text-xs text-green-600 font-medium">Vendas Fechadas</p><p className="text-xl font-bold text-green-900">R$ {fc.filter(c => c.etapa === 'follow_up').reduce((s, c) => s + (c.valorEstimado || 0), 0).toLocaleString('pt-BR')}</p></div>
          <div className="p-4 bg-red-50 rounded-apple border border-red-200"><p className="text-xs text-red-600 font-medium">Perdidos</p><p className="text-xl font-bold text-red-900">{fc.filter(c => c.etapa === 'perdido').length} leads</p></div>
          <div className="p-4 bg-purple-50 rounded-apple border border-purple-200"><p className="text-xs text-purple-600 font-medium">Taxa Conversão</p><p className="text-xl font-bold text-purple-900">{fc.length > 0 ? ((fc.filter(c => c.etapa === 'follow_up').length / fc.length) * 100).toFixed(1) : 0}%</p></div>
        </div>
      </div>

      {/* Funil de Conversão */}
      {(() => {
        const funilStages = ['lead', 'prospecção', 'amostra', 'proposta', 'negociacao', 'follow_up']
        const funilLabels: Record<string, string> = { 'lead': 'Leads', 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'proposta': 'Proposta', 'negociacao': 'Negociação', 'follow_up': 'Follow-up' }
        const passaramPor: Record<string, number> = {}
        funilStages.forEach(s => { passaramPor[s] = 0 })
        fc.forEach(c => { const etapas = new Set<string>(); etapas.add(c.etapa); (c.historicoEtapas || []).forEach(h => { etapas.add(h.etapa); if (h.de) etapas.add(h.de) }); funilStages.forEach(s => { if (etapas.has(s)) passaramPor[s]++ }) })
        const convData = funilStages.map((s, i) => { const qtd = passaramPor[s]; const anterior = i > 0 ? passaramPor[funilStages[i - 1]] : qtd; const taxa = anterior > 0 ? (qtd / anterior) * 100 : 0; return { name: funilLabels[s], qtd, taxa: Math.round(taxa) } })
        const maxQtd = Math.max(...convData.map(d => d.qtd), 1)
        const funilColors = ['#0EA5E9', '#F59E0B', '#6366F1', '#A855F7', '#3B82F6', '#22C55E']
        return (
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">📈 Funil de Conversão</h3>
            <p className="text-sm text-gray-500 mb-5">Taxa de conversão entre cada etapa do funil</p>
            <div className="space-y-3">
              {convData.map((d, i) => (
                <div key={d.name}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700 w-24 text-right">{d.name}</span>
                    <div className="flex-1 relative"><div className="w-full bg-gray-100 rounded-full h-8 overflow-hidden"><div className="h-8 rounded-full flex items-center px-3 transition-all duration-500" style={{ width: `${Math.max((d.qtd / maxQtd) * 100, 8)}%`, backgroundColor: funilColors[i] || '#6B7280' }}><span className="text-xs font-bold text-white drop-shadow">{d.qtd} lead{d.qtd !== 1 ? 's' : ''}</span></div></div></div>
                    {i > 0 && <span className={`text-sm font-bold w-14 text-right ${d.taxa >= 60 ? 'text-green-600' : d.taxa >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>{d.taxa}%</span>}
                    {i === 0 && <span className="text-sm font-bold w-14 text-right text-gray-400">—</span>}
                  </div>
                  {i < convData.length - 1 && <div className="flex items-center ml-24 pl-3 py-0.5"><span className="text-gray-300 text-xs">↓</span><span className="text-[10px] text-gray-400 ml-1">{convData[i + 1].taxa}% avançam</span></div>}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Tempo de Tela / Tempo Médio por Etapa */}
      {(() => {
        const funilStages = ['lead', 'prospecção', 'amostra', 'proposta', 'negociacao', 'follow_up']
        const funilLabels: Record<string, string> = { 'lead': 'Leads', 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'proposta': 'Proposta', 'negociacao': 'Negociação', 'follow_up': 'Follow-up' }
        const stColors = ['#10B981', '#0EA5E9', '#F59E0B', '#6366F1', '#A855F7', '#3B82F6']

        const duracoesTotais: EtapaDuracao[] = []
        const temposPorEtapa: Record<string, number[]> = {}
        funilStages.forEach(s => { temposPorEtapa[s] = [] })

        fc.forEach(c => {
          const duracoes = calcularDuracoesEtapas(c).filter(d => funilStages.includes(d.etapa))
          duracoes.forEach(d => {
            const v = vendedores.find(v => v.id === c.vendedorId)
            duracoesTotais.push({ ...d, clienteId: c.id, clienteNome: c.razaoSocial, vendedorId: c.vendedorId, vendedorNome: v?.nome })
            temposPorEtapa[d.etapa].push(d.dias)
          })
        })

        const tempoData = funilStages.map((s, i) => {
          const arr = temposPorEtapa[s]
          const media = arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0
          return { name: funilLabels[s], dias: media, fill: stColors[i], count: arr.length }
        }).filter(d => d.count > 0)

        const tempoAtualClientes = fc
          .filter(c => funilStages.includes(c.etapa))
          .map(c => {
            const v = vendedores.find(v => v.id === c.vendedorId)
            return { id: c.id, nome: c.razaoSocial, etapa: c.etapa, etapaLabel: funilLabels[c.etapa] || c.etapa, dias: diasEtapaAtual(c), vendedor: v?.nome || '—' }
          })
          .sort((a, b) => b.dias - a.dias)

        if (tempoData.length === 0 && tempoAtualClientes.length === 0) return null

        return (
          <div className="space-y-6">
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">⏱️ Tempo Médio por Etapa</h3>
              <p className="text-sm text-gray-500 mb-4">Dias que os clientes ficam em média em cada etapa antes de avançar</p>
              {tempoData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={tempoData} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis type="number" tick={{ fontSize: 11 }} unit=" dias" /><YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={100} /><Tooltip formatter={(value: number) => [`${value} dias`, 'Média']} /><Bar dataKey="dias" radius={[0, 6, 6, 0]}>{tempoData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}</Bar></BarChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-3 mt-3">{tempoData.map(d => (<div key={d.name} className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} /><span className="text-xs text-gray-600">{d.name}: <span className="font-bold text-gray-900">{d.dias}d</span></span></div>))}</div>
                </>
              ) : <p className="text-sm text-gray-400 py-8 text-center">Sem movimentações suficientes para calcular o tempo médio</p>}
            </div>

            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">🕒 Tempo de Tela por Cliente</h3>
              <p className="text-sm text-gray-500 mb-4">Quanto tempo cada cliente está na etapa atual</p>
              {tempoAtualClientes.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">Nenhum cliente nos funil</p> : (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead><tr className="border-b border-gray-200"><th className="text-left py-2 px-3 text-xs font-medium text-gray-600">Cliente</th><th className="text-left py-2 px-3 text-xs font-medium text-gray-600">Etapa</th><th className="text-right py-2 px-3 text-xs font-medium text-gray-600">Dias na Etapa</th><th className="text-left py-2 px-3 text-xs font-medium text-gray-600">Vendedor</th></tr></thead>
                    <tbody>
                      {tempoAtualClientes.slice(0, 50).map((c, i) => (
                        <tr key={`${c.id}-${i}`} className="border-b border-gray-100">
                          <td className="py-2 px-3 text-sm font-medium text-gray-900">{c.nome}</td>
                          <td className="py-2 px-3 text-sm text-gray-700"><span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 border border-gray-200">{c.etapaLabel}</span></td>
                          <td className="py-2 px-3 text-sm text-right font-bold text-gray-900">{c.dias}</td>
                          <td className="py-2 px-3 text-sm text-gray-600">{c.vendedor}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Tempo de Tela por Vendedor */}
      {(() => {
        const funilStages = ['lead', 'prospecção', 'amostra', 'proposta', 'negociacao', 'follow_up']
        const funilLabels: Record<string, string> = { 'lead': 'Leads', 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'proposta': 'Proposta', 'negociacao': 'Negociação', 'follow_up': 'Follow-up' }
        const vendTela = vendedores.filter(v => v.ativo).map(v => {
          const clientesV = fc.filter(c => c.vendedorId === v.id)
          const duracoes: Record<string, number[]> = {}
          funilStages.forEach(s => { duracoes[s] = [] })
          clientesV.forEach(c => {
            calcularDuracoesEtapas(c).filter(d => funilStages.includes(d.etapa)).forEach(d => { duracoes[d.etapa].push(d.dias) })
          })
          const medias = funilStages.map(s => ({
            etapa: s,
            label: funilLabels[s],
            media: duracoes[s].length > 0 ? Math.round(duracoes[s].reduce((a, b) => a + b, 0) / duracoes[s].length) : 0,
            qtd: duracoes[s].length,
          }))
          return { id: v.id, nome: v.nome, medias, totalClientes: clientesV.length }
        }).filter(v => v.totalClientes > 0)

        if (vendTela.length === 0) return null

        return (
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">⏱️ Tempo de Tela por Vendedor</h3>
            <p className="text-sm text-gray-500 mb-4">Média de dias que os clientes de cada vendedor ficam em cada etapa</p>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead><tr className="border-b border-gray-200"><th className="text-left py-2 px-3 text-xs font-medium text-gray-600 sticky left-0 bg-white">Vendedor</th>{funilStages.map(s => (<th key={s} className="text-center py-2 px-2 text-xs font-medium text-gray-600 min-w-[90px]">{funilLabels[s]}</th>))}</tr></thead>
                <tbody>
                  {vendTela.map(v => (
                    <tr key={v.id} className="border-b border-gray-100">
                      <td className="py-2 px-3 text-sm font-medium text-gray-900 sticky left-0 bg-white">{v.nome}</td>
                      {v.medias.map(m => (
                        <td key={m.etapa} className="py-2 px-2 text-center text-sm">
                          {m.qtd > 0 ? (
                            <div className="flex flex-col items-center">
                              <span className="font-bold text-gray-900">{m.media}d</span>
                              <span className="text-[10px] text-gray-400">{m.qtd} cliente{m.qtd !== 1 ? 's' : ''}</span>
                            </div>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* Indicadores Comerciais — Clientes, Funil, Equipe, Concorrência */}
      {(() => {
        const now = new Date()
        const fmtCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
        const clienteMap = new Map(clientes.map(c => [c.id, c]))
        const confirmedAll = pedidos.filter(p => p.status === 'confirmado')
        const activeIds = new Set(fpConfirmed.map(p => p.clienteId))
        const ativos = activeIds.size
        const receita = fpConfirmed.reduce((s, p) => s + p.totalValor, 0)

        // first purchase per client (all time) to detect new clients in period
        const firstPurchase: Record<number, string> = {}
        confirmedAll.forEach(p => { if (!firstPurchase[p.clienteId] || p.dataCriacao < firstPurchase[p.clienteId]) firstPurchase[p.clienteId] = p.dataCriacao })
        const novos = Object.entries(firstPurchase).filter(([, d]) => !threshold || new Date(d) >= threshold).length

        const perdidos = fc.filter(c => c.etapa === 'perdido').length

        // retention / churn using previous period
        let retencao = 0, churn = 0
        if (threshold) {
          const rangeMs = now.getTime() - threshold.getTime()
          const prevStart = new Date(threshold.getTime() - rangeMs)
          const prevIds = new Set(confirmedAll.filter(p => { const d = new Date(p.dataCriacao); return d >= prevStart && d < threshold }).map(p => p.clienteId))
          const mantidos = [...prevIds].filter(id => activeIds.has(id)).length
          retencao = prevIds.size > 0 ? (mantidos / prevIds.size) * 100 : 0
          churn = prevIds.size > 0 ? ((prevIds.size - mantidos) / prevIds.size) * 100 : 0
        }

        // repurchase and averages
        const purchaseCounts: Record<number, number> = {}
        confirmedAll.forEach(p => { purchaseCounts[p.clienteId] = (purchaseCounts[p.clienteId] || 0) + 1 })
        const recompraClientes = [...activeIds].filter(id => (purchaseCounts[id] || 0) >= 2).length
        const taxaRecompra = ativos > 0 ? (recompraClientes / ativos) * 100 : 0
        const freqMedia = ativos > 0 ? fpConfirmed.length / ativos : 0
        const receitaMedia = ativos > 0 ? receita / ativos : 0

        // ABC and top 10 concentration
        const clientRev = new Map<number, number>()
        fpConfirmed.forEach(p => clientRev.set(p.clienteId, (clientRev.get(p.clienteId) || 0) + p.totalValor))
        const revArr = Array.from(clientRev.entries()).sort((a, b) => b[1] - a[1])
        const totalRev = revArr.reduce((s, [, v]) => s + v, 0)
        let cum = 0, classeA = 0, classeB = 0, classeC = 0
        revArr.forEach(([, v]) => { cum += v; if (cum / (totalRev || 1) <= 0.8) classeA++; else if (cum / (totalRev || 1) <= 0.95) classeB++; else classeC++ })
        const top10Rev = revArr.slice(0, 10).reduce((s, [, v]) => s + v, 0)
        const concentracaoTop10 = totalRev > 0 ? (top10Rev / totalRev) * 100 : 0

        // Funil
        const leadsGerados = fc.length
        const prospeccoes = fi.filter(i => ['ligacao', 'email', 'whatsapp'].includes(i.tipo)).length
        const diagnosticos = fi.filter(i => i.tipo === 'reuniao').length
        const propostasEnviadas = fc.filter(c => c.dataProposta && (!threshold || new Date(c.dataProposta) >= threshold)).length
        const testesRealizados = fc.filter(c => c.dataEnvioAmostra && (!threshold || new Date(c.dataEnvioAmostra) >= threshold)).length
        const negociacoes = fc.filter(c => c.etapa === 'negociacao').length
        const pedidosFech = fpConfirmed.length
        const taxaConversaoFunil = leadsGerados > 0 ? (pedidosFech / leadsGerados) * 100 : 0
        const temposFech: number[] = []
        fc.filter(c => c.etapa === 'follow_up' && c.criadoEm && c.dataEntradaEtapa).forEach(c => {
          const dias = Math.max(0, Math.floor((new Date(c.dataEntradaEtapa!).getTime() - new Date(c.criadoEm!).getTime()) / 86400000))
          if (dias > 0) temposFech.push(dias)
        })
        const tempoMedioFech = temposFech.length > 0 ? Math.round(temposFech.reduce((a, b) => a + b, 0) / temposFech.length) : 0

        // Equipe
        const statsEquipe = vendedores.filter(v => v.ativo).map(v => {
          const cv = fc.filter(c => c.vendedorId === v.id)
          const pv = fpConfirmed.filter(p => p.vendedorId === v.id)
          const faturamento = pv.reduce((s, p) => s + p.totalValor, 0)
          const volume = pv.reduce((s, p) => s + p.itens.reduce((is, it) => is + it.quantidade, 0), 0)
          const oport = cv.length
          const ganhos = cv.filter(c => c.etapa === 'follow_up').length
          const taxaConv = oport > 0 ? (ganhos / oport) * 100 : 0
          const ligacoes = fi.filter(i => i.tipo === 'ligacao' && clienteMap.get(i.clienteId)?.vendedorId === v.id).length
          const emails = fi.filter(i => i.tipo === 'email' && clienteMap.get(i.clienteId)?.vendedorId === v.id).length
          const whats = fi.filter(i => i.tipo === 'whatsapp' && clienteMap.get(i.clienteId)?.vendedorId === v.id).length
          const reunioes = fi.filter(i => i.tipo === 'reuniao' && clienteMap.get(i.clienteId)?.vendedorId === v.id).length
          const visitas = ft.filter(t => t.tipo === 'reuniao' && t.vendedorId === v.id).length
          const propostas = cv.filter(c => c.dataProposta).length
          return { id: v.id, nome: v.nome.split(' ')[0], faturamento, volume, taxaConv, ligacoes, emails, whats, reunioes, visitas, propostas }
        }).filter(v => v.faturamento > 0 || v.ligacoes > 0 || v.emails > 0 || v.whats > 0 || v.reunioes > 0 || v.visitas > 0 || v.propostas > 0 || v.volume > 0)

        // Concorrência
        const perdasList = fc.filter(c => c.etapa === 'perdido')
        const totalPerdas = perdasList.length
        const catLabels: Record<string, string> = { preco: 'Preço', prazo: 'Prazo', qualidade: 'Qualidade', concorrencia: 'Concorrência', sem_resposta: 'Sem resposta', outro: 'Outro' }
        const catColors: Record<string, string> = { preco: '#EAB308', prazo: '#F97316', qualidade: '#3B82F6', concorrencia: '#EF4444', sem_resposta: '#6B7280', outro: '#A855F7' }
        const perdasCat = Object.entries(perdasList.reduce((acc, c) => { const k = c.categoriaPerda || 'outro'; acc[k] = (acc[k] || 0) + 1; return acc }, {} as Record<string, number>)).map(([k, v]) => ({ name: catLabels[k] || k, value: v, fill: catColors[k] || '#6B7280' }))
        const motivosFreq = Object.entries(perdasList.reduce((acc, c) => { if (c.motivoPerda) acc[c.motivoPerda] = (acc[c.motivoPerda] || 0) + 1; return acc }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]).slice(0, 5)

        const KPICard: React.FC<{ label: string; value: string | number; sub?: string; color?: string }> = ({ label, value, sub, color }) => (
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4"><p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p><p className={`text-xl font-bold mt-1 ${color || 'text-gray-900'}`}>{value}</p>{sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}</div>
        )

        return (
          <div className="space-y-8">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4">5. Indicadores de Clientes</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <KPICard label="Clientes Ativos" value={ativos} sub="com compra no período" color="text-green-700" />
                <KPICard label="Novos Clientes" value={novos} sub="primeira compra" color="text-blue-700" />
                <KPICard label="Clientes Perdidos" value={perdidos} sub="no funil" color="text-red-600" />
                <KPICard label="Taxa Retenção" value={`${retencao.toFixed(1)}%`} sub="base mantida" color={retencao >= 80 ? 'text-green-700' : 'text-red-600'} />
                <KPICard label="Taxa Churn" value={`${churn.toFixed(1)}%`} sub="base perdida" color={churn <= 20 ? 'text-green-700' : 'text-red-600'} />
                <KPICard label="Taxa Recompra" value={`${taxaRecompra.toFixed(1)}%`} sub="clientes recorrentes" color="text-purple-700" />
                <KPICard label="Freq. Média Compra" value={freqMedia.toFixed(1)} sub="pedidos / cliente ativo" color="text-indigo-700" />
                <KPICard label="Receita Média / Cliente" value={fmtCurrency(receitaMedia)} sub="valor da carteira" color="text-amber-700" />
                <KPICard label="Clientes Classe A" value={classeA} sub="80% da receita" color="text-emerald-700" />
                <KPICard label="Concentração Top 10" value={`${concentracaoTop10.toFixed(1)}%`} sub="do faturamento" color="text-rose-700" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Evolução da Base</h3>
                  <ResponsiveContainer width="100%" height={220}><BarChart data={[{ name: 'Ativos', valor: ativos }, { name: 'Novos', valor: novos }, { name: 'Perdidos', valor: perdidos }]}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="valor" fill="#3B82F6" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
                </div>
                <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Classificação ABC</h3>
                  {revArr.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">Sem pedidos confirmados</p> : <ResponsiveContainer width="100%" height={220}><PieChart><Pie data={[{ name: 'Classe A', value: classeA, fill: '#22C55E' }, { name: 'Classe B', value: classeB, fill: '#F59E0B' }, { name: 'Classe C', value: classeC, fill: '#EF4444' }]} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}><Cell fill="#22C55E" /><Cell fill="#F59E0B" /><Cell fill="#EF4444" /></Pie><Tooltip /></PieChart></ResponsiveContainer>}
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4">6. Funil Comercial</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <KPICard label="Leads Gerados" value={leadsGerados} sub="volume no período" />
                <KPICard label="Prospecções" value={prospeccoes} sub="abordagens" color="text-blue-700" />
                <KPICard label="Diagnósticos" value={diagnosticos} sub="reuniões levantamento" color="text-indigo-700" />
                <KPICard label="Propostas Enviadas" value={propostasEnviadas} sub="com data de proposta" color="text-purple-700" />
                <KPICard label="Testes de Produto" value={testesRealizados} sub="amostras enviadas" color="text-amber-700" />
                <KPICard label="Negociações Abertas" value={negociacoes} sub="em curso" color="text-cyan-700" />
                <KPICard label="Pedidos Fechados" value={pedidosFech} sub="confirmados" color="text-green-700" />
                <KPICard label="Conversão Funil" value={`${taxaConversaoFunil.toFixed(1)}%`} sub="pedidos / leads" color="text-emerald-700" />
                <KPICard label="Tempo Médio Fechamento" value={tempoMedioFech > 0 ? `${tempoMedioFech} dias` : '—'} sub="ciclo médio" color="text-pink-700" />
              </div>
              <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Volume por Etapa do Funil</h3>
                <ResponsiveContainer width="100%" height={240}><BarChart data={[{ name: 'Leads', valor: leadsGerados }, { name: 'Prospecções', valor: prospeccoes }, { name: 'Diagnósticos', valor: diagnosticos }, { name: 'Propostas', valor: propostasEnviadas }, { name: 'Testes', valor: testesRealizados }, { name: 'Negociações', valor: negociacoes }, { name: 'Pedidos', valor: pedidosFech }]}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="valor" fill="#6366F1" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4">7. Performance da Equipe Comercial</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
                <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Faturamento por Vendedor</h3>
                  {statsEquipe.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">Sem dados</p> : <ResponsiveContainer width="100%" height={240}><BarChart data={statsEquipe.map(v => ({ name: v.nome, valor: v.faturamento }))} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis type="number" tickFormatter={(v: number) => `R$ ${(v / 1000).toFixed(0)}k`} /><YAxis dataKey="name" type="category" width={100} /><Tooltip formatter={(v: number) => [fmtCurrency(v), 'Faturamento']} /><Bar dataKey="valor" fill="#22C55E" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer>}
                </div>
                <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Atividades por Vendedor</h3>
                  {statsEquipe.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">Sem dados</p> : <ResponsiveContainer width="100%" height={240}><BarChart data={statsEquipe.map(v => ({ name: v.nome, ligações: v.ligacoes, emails: v.emails, whatsapp: v.whats, reuniões: v.reunioes, visitas: v.visitas, propostas: v.propostas }))}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="ligações" fill="#3B82F6" /><Bar dataKey="emails" fill="#8B5CF6" /><Bar dataKey="whatsapp" fill="#22C55E" /><Bar dataKey="reuniões" fill="#F59E0B" /><Bar dataKey="visitas" fill="#14B8A6" /><Bar dataKey="propostas" fill="#EC4899" /></BarChart></ResponsiveContainer>}
                </div>
              </div>
              <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6 overflow-x-auto">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Ranking de Vendedores</h3>
                <table className="min-w-full">
                  <thead><tr className="border-b border-gray-200"><th className="text-left py-2 px-3 text-xs font-medium text-gray-600">Vendedor</th><th className="text-right py-2 px-3 text-xs font-medium text-gray-600">Faturamento</th><th className="text-right py-2 px-3 text-xs font-medium text-gray-600">Volume</th><th className="text-right py-2 px-3 text-xs font-medium text-gray-600">Conversão</th><th className="text-right py-2 px-3 text-xs font-medium text-gray-600">Ligações</th><th className="text-right py-2 px-3 text-xs font-medium text-gray-600">Emails</th><th className="text-right py-2 px-3 text-xs font-medium text-gray-600">Whats</th><th className="text-right py-2 px-3 text-xs font-medium text-gray-600">Reuniões</th><th className="text-right py-2 px-3 text-xs font-medium text-gray-600">Visitas</th><th className="text-right py-2 px-3 text-xs font-medium text-gray-600">Propostas</th></tr></thead>
                  <tbody>{statsEquipe.sort((a, b) => b.faturamento - a.faturamento).map(v => (<tr key={v.id} className="border-b border-gray-100"><td className="py-2 px-3 text-sm font-medium text-gray-900">{v.nome}</td><td className="py-2 px-3 text-sm text-right font-bold text-green-700">{fmtCurrency(v.faturamento)}</td><td className="py-2 px-3 text-sm text-right">{v.volume}</td><td className="py-2 px-3 text-sm text-right">{v.taxaConv.toFixed(1)}%</td><td className="py-2 px-3 text-sm text-right">{v.ligacoes}</td><td className="py-2 px-3 text-sm text-right">{v.emails}</td><td className="py-2 px-3 text-sm text-right">{v.whats}</td><td className="py-2 px-3 text-sm text-right">{v.reunioes}</td><td className="py-2 px-3 text-sm text-right">{v.visitas}</td><td className="py-2 px-3 text-sm text-right">{v.propostas}</td></tr>))}</tbody>
                </table>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4">8. Inteligência Competitiva</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <KPICard label="Negócios Perdidos" value={totalPerdas} sub="no período" color="text-red-600" />
                <KPICard label="Perdas por Preço" value={totalPerdas > 0 ? `${((perdasList.filter(c => c.categoriaPerda === 'preco').length / totalPerdas) * 100).toFixed(1)}%` : '0%'} sub="do total" color="text-yellow-600" />
                <KPICard label="Perdas por Prazo" value={totalPerdas > 0 ? `${((perdasList.filter(c => c.categoriaPerda === 'prazo').length / totalPerdas) * 100).toFixed(1)}%` : '0%'} sub="do total" color="text-orange-600" />
                <KPICard label="Perdas por Qualidade" value={totalPerdas > 0 ? `${((perdasList.filter(c => c.categoriaPerda === 'qualidade').length / totalPerdas) * 100).toFixed(1)}%` : '0%'} sub="do total" color="text-blue-600" />
                <KPICard label="Perdas por Concorrência" value={totalPerdas > 0 ? `${((perdasList.filter(c => c.categoriaPerda === 'concorrencia').length / totalPerdas) * 100).toFixed(1)}%` : '0%'} sub="do total" color="text-red-600" />
                <KPICard label="Preço Médio Mercado" value="—" sub="dados não coletados" color="text-gray-400" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Principais Motivos de Perda</h3>
                  {perdasCat.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">Nenhuma perda no período</p> : <ResponsiveContainer width="100%" height={240}><PieChart><Pie data={perdasCat} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>{perdasCat.map((e, i) => <Cell key={i} fill={e.fill} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>}
                </div>
                <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Motivos de Perda mais Citados</h3>
                  {motivosFreq.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">Nenhum motivo registrado</p> : (
                    <div className="space-y-2">
                      {motivosFreq.map(([motivo, qtd]) => (<div key={motivo} className="flex items-center justify-between py-1 border-b border-gray-100"><span className="text-sm text-gray-700 truncate flex-1 pr-3" title={motivo}>{motivo}</span><span className="text-sm font-bold text-red-600">{qtd}</span></div>))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Relatório de Perdas */}
      {(() => {
        const perdidos = fc.filter(c => c.etapa === 'perdido')
        const totalPerdido = perdidos.length
        const valorPerdido = perdidos.reduce((s, c) => s + (c.valorEstimado || 0), 0)
        const catLabels: Record<string, string> = { preco: 'Preço', prazo: 'Prazo', qualidade: 'Qualidade', concorrencia: 'Concorrência', sem_resposta: 'Sem resposta', outro: 'Outro' }
        const catColors: Record<string, string> = { preco: '#EAB308', prazo: '#F97316', qualidade: '#3B82F6', concorrencia: '#EF4444', sem_resposta: '#6B7280', outro: '#A855F7' }
        const porCategoria = Object.entries(perdidos.reduce((acc, c) => { const k = c.categoriaPerda || 'outro'; acc[k] = (acc[k] || 0) + 1; return acc }, {} as Record<string, number>)).map(([key, value]) => ({ name: catLabels[key] || key, value, fill: catColors[key] || '#6B7280' }))
        const porEtapaOrigem = Object.entries(perdidos.reduce((acc, c) => { const k = c.etapaAnterior || 'desconhecido'; acc[k] = (acc[k] || 0) + 1; return acc }, {} as Record<string, number>)).map(([key, value]) => ({ name: stageLabels[key] || key, qtd: value }))
        const porVendedor = vendedores.filter(v => v.ativo).map(v => ({ name: v.nome.split(' ')[0], perdidos: perdidos.filter(c => c.vendedorId === v.id).length, valorPerdido: perdidos.filter(c => c.vendedorId === v.id).reduce((s, c) => s + (c.valorEstimado || 0), 0) })).filter(v => v.perdidos > 0)
        const motivoMaisFrequente = porCategoria.length > 0 ? porCategoria.sort((a, b) => b.value - a.value)[0].name : '—'

        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900">❌ Relatório de Perdas</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-red-50 rounded-apple border border-red-200"><p className="text-xs text-red-600 font-medium">Total Perdidos</p><p className="text-2xl font-bold text-red-900">{totalPerdido}</p></div>
              <div className="p-4 bg-red-50 rounded-apple border border-red-200"><p className="text-xs text-red-600 font-medium">Valor Perdido</p><p className="text-2xl font-bold text-red-900">R$ {valorPerdido.toLocaleString('pt-BR')}</p></div>
              <div className="p-4 bg-orange-50 rounded-apple border border-orange-200"><p className="text-xs text-orange-600 font-medium">Motivo + Frequente</p><p className="text-2xl font-bold text-orange-900">{motivoMaisFrequente}</p></div>
              <div className="p-4 bg-gray-50 rounded-apple border border-gray-200"><p className="text-xs text-gray-600 font-medium">Taxa de Perda</p><p className="text-2xl font-bold text-gray-900">{fc.length > 0 ? ((totalPerdido / fc.length) * 100).toFixed(1) : 0}%</p></div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">🥧 Perdas por Motivo</h3>
                {porCategoria.length > 0 ? (<ResponsiveContainer width="100%" height={250}><PieChart><Pie data={porCategoria} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>{porCategoria.map((entry, i) => <Cell key={i} fill={entry.fill} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>) : <p className="text-sm text-gray-400 text-center py-12">Nenhum cliente perdido</p>}
              </div>
              <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Perdas por Etapa de Origem</h3>
                {porEtapaOrigem.length > 0 ? (<ResponsiveContainer width="100%" height={250}><BarChart data={porEtapaOrigem}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} /><Tooltip /><Bar dataKey="qtd" fill="#EF4444" name="Perdidos" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>) : <p className="text-sm text-gray-400 text-center py-12">Nenhum dado</p>}
              </div>
            </div>
            {porVendedor.length > 0 && (
              <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">👥 Perdas por Vendedor</h3>
                <div className="overflow-x-auto"><table className="min-w-full"><thead><tr className="border-b border-gray-200"><th className="text-left py-2 px-3 text-xs font-medium text-gray-600">Vendedor</th><th className="text-right py-2 px-3 text-xs font-medium text-gray-600">Clientes Perdidos</th><th className="text-right py-2 px-3 text-xs font-medium text-gray-600">Valor Perdido</th></tr></thead><tbody>{porVendedor.map((v, i) => (<tr key={i} className="border-b border-gray-100"><td className="py-2 px-3 text-sm font-medium text-gray-900">{v.name}</td><td className="py-2 px-3 text-sm text-right text-red-600 font-bold">{v.perdidos}</td><td className="py-2 px-3 text-sm text-right text-red-600">R$ {v.valorPerdido.toLocaleString('pt-BR')}</td></tr>))}</tbody></table></div>
              </div>
            )}
            {perdidos.length > 0 && (
              <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 Clientes Perdidos — Detalhe</h3>
                <div className="overflow-x-auto"><table className="min-w-full"><thead><tr className="border-b border-gray-200"><th className="text-left py-2 px-3 text-xs font-medium text-gray-600">Cliente</th><th className="text-left py-2 px-3 text-xs font-medium text-gray-600">Motivo</th><th className="text-left py-2 px-3 text-xs font-medium text-gray-600">Etapa Anterior</th><th className="text-right py-2 px-3 text-xs font-medium text-gray-600">Valor</th><th className="text-left py-2 px-3 text-xs font-medium text-gray-600">Data</th><th className="text-left py-2 px-3 text-xs font-medium text-gray-600">Vendedor</th></tr></thead><tbody>{perdidos.map(c => { const vend = vendedores.find(v => v.id === c.vendedorId); return (<tr key={c.id} className="border-b border-gray-100"><td className="py-2 px-3 text-sm font-medium text-gray-900">{c.razaoSocial}</td><td className="py-2 px-3"><span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">{catLabels[c.categoriaPerda || 'outro']}</span>{c.motivoPerda && <p className="text-xs text-gray-500 mt-0.5">{c.motivoPerda}</p>}</td><td className="py-2 px-3 text-sm text-gray-700">{stageLabels[c.etapaAnterior || ''] || '—'}</td><td className="py-2 px-3 text-sm text-right font-medium text-red-600">R$ {(c.valorEstimado || 0).toLocaleString('pt-BR')}</td><td className="py-2 px-3 text-sm text-gray-700">{c.dataPerda ? new Date(c.dataPerda).toLocaleDateString('pt-BR') : '—'}</td><td className="py-2 px-3 text-sm text-gray-700">{vend?.nome || '—'}</td></tr>) })}</tbody></table></div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Tempo de Tela */}
      {(() => {
        const formatar = (seg: number) => {
          const h = Math.floor(seg / 3600)
          const m = Math.floor((seg % 3600) / 60)
          const s = seg % 60
          return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`
        }
        const chartData = ttRelatorio.map(r => ({ name: r.nome.split(' ')[0], horas: Math.round((r.totalSegundos / 3600) * 100) / 100 }))
        return (
          <div className="space-y-6 mt-8">
            <h2 className="text-xl font-bold text-gray-900">⏱️ Tempo de Tela</h2>
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Data início</label>
                <input type="date" value={ttDataInicio} onChange={e => setTtDataInicio(e.target.value)} className="border border-gray-300 rounded-apple px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Data fim</label>
                <input type="date" value={ttDataFim} onChange={e => setTtDataFim(e.target.value)} className="border border-gray-300 rounded-apple px-3 py-2 text-sm" />
              </div>
              {ttLoading && <span className="text-sm text-gray-500">Carregando...</span>}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">⏳ Horas por Vendedor</h3>
                {chartData.length > 0 ? (<ResponsiveContainer width="100%" height={250}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(v: any) => [`${v} h`, 'Horas']} /><Bar dataKey="horas" fill="#3B82F6" name="Horas" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>) : <p className="text-sm text-gray-400 text-center py-12">{ttLoading ? 'Carregando...' : 'Nenhum dado no período'}</p>}
              </div>
              <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 Detalhamento</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">Vendedor</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-gray-600">Tempo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ttRelatorio.length > 0 ? ttRelatorio.map((r, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="py-2 px-3 text-sm font-medium text-gray-900">{r.nome}</td>
                          <td className="py-2 px-3 text-sm text-right text-blue-600 font-bold">{formatar(r.totalSegundos)}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={2} className="py-4 text-sm text-gray-400 text-center">{ttLoading ? 'Carregando...' : 'Nenhum dado no período'}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default RelatoriosView
