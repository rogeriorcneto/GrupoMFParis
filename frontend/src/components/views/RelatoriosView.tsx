import React from 'react'
import { SparklesIcon } from '@heroicons/react/24/outline'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import type { Cliente, Vendedor, Interacao, Produto } from '../../types'

const RelatoriosView: React.FC<{ clientes: Cliente[], vendedores: Vendedor[], interacoes: Interacao[], produtos?: Produto[] }> = ({ clientes, vendedores, interacoes, produtos = [] }) => {
  const stages = ['prospecção', 'amostra', 'homologado', 'negociacao', 'pos_venda', 'perdido']
  const stageLabels: Record<string, string> = { 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'homologado': 'Homologado', 'negociacao': 'Negociação', 'pos_venda': 'Pós-Venda', 'perdido': 'Perdido' }
  const COLORS = ['#3B82F6', '#EAB308', '#22C55E', '#A855F7', '#EC4899', '#EF4444']

  const pipelineData = stages.map(s => ({ name: stageLabels[s] || s, valor: clientes.filter(c => c.etapa === s).reduce((sum, c) => sum + (c.valorEstimado || 0), 0), qtd: clientes.filter(c => c.etapa === s).length }))
  const pieData = stages.map(s => ({ name: stageLabels[s] || s, value: clientes.filter(c => c.etapa === s).length })).filter(d => d.value > 0)
  const vendedorData = vendedores.filter(v => v.ativo).map(v => { const cv = clientes.filter(c => c.vendedorId === v.id); return { name: v.nome.split(' ')[0], pipeline: cv.reduce((s, c) => s + (c.valorEstimado || 0), 0), leads: cv.length, conversoes: cv.filter(c => c.etapa === 'pos_venda').length } })
  const interacaoData = ['email', 'whatsapp', 'linkedin', 'instagram', 'ligacao', 'reuniao'].map(tipo => ({ name: tipo.charAt(0).toUpperCase() + tipo.slice(1), qtd: interacoes.filter(i => i.tipo === tipo).length })).filter(d => d.qtd > 0)

  const gerarRelatorioPDF = () => {
    const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    const totalLeads = clientes.length
    const leadsAtivos = clientes.filter(c => c.etapa !== 'perdido').length
    const perdidos = clientes.filter(c => c.etapa === 'perdido')
    const posVenda = clientes.filter(c => c.etapa === 'pos_venda')
    const totalPipeline = clientes.reduce((s, c) => s + (c.valorEstimado || 0), 0)
    const valorPerdido = perdidos.reduce((s, c) => s + (c.valorEstimado || 0), 0)
    const valorGanho = posVenda.reduce((s, c) => s + (c.valorEstimado || 0), 0)
    const taxaConversao = totalLeads > 0 ? ((posVenda.length / totalLeads) * 100).toFixed(1) : '0'
    const taxaPerda = totalLeads > 0 ? ((perdidos.length / totalLeads) * 100).toFixed(1) : '0'
    const ticketMedio = leadsAtivos > 0 ? Math.round(totalPipeline / leadsAtivos) : 0
    const stLabels: Record<string, string> = { 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'homologado': 'Homologado', 'negociacao': 'Negociação', 'pos_venda': 'Pós-Venda', 'perdido': 'Perdido' }
    const catLabels: Record<string, string> = { preco: 'Preço', prazo: 'Prazo', qualidade: 'Qualidade', concorrencia: 'Concorrência', sem_resposta: 'Sem resposta', outro: 'Outro' }
    const pipelineRows = stages.map(s => { const cls = clientes.filter(c => c.etapa === s); return `<tr><td>${stLabels[s]}</td><td style="text-align:center">${cls.length}</td><td style="text-align:right">R$ ${cls.reduce((sum, c) => sum + (c.valorEstimado || 0), 0).toLocaleString('pt-BR')}</td></tr>` }).join('')
    const vendRows = vendedores.filter(v => v.ativo).map(v => { const cv = clientes.filter(c => c.vendedorId === v.id); return `<tr><td>${v.nome}</td><td style="text-align:center">${cv.length}</td><td style="text-align:center">${cv.filter(c => c.etapa === 'pos_venda').length}</td><td style="text-align:center">${cv.filter(c => c.etapa === 'perdido').length}</td><td style="text-align:right">R$ ${cv.filter(c => c.etapa !== 'perdido').reduce((s, c) => s + (c.valorEstimado || 0), 0).toLocaleString('pt-BR')}</td></tr>` }).join('')
    const catCount = perdidos.reduce((acc, c) => { const k = c.categoriaPerda || 'outro'; acc[k] = (acc[k] || 0) + 1; return acc }, {} as Record<string, number>)
    const perdaRows = Object.entries(catCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${catLabels[k] || k}</td><td style="text-align:center">${v}</td><td style="text-align:right">${totalLeads > 0 ? ((v / totalLeads) * 100).toFixed(1) : 0}%</td></tr>`).join('')
    const funilStages = ['prospecção', 'amostra', 'homologado', 'negociacao', 'pos_venda']
    const passaramPor: Record<string, number> = {}
    funilStages.forEach(s => { passaramPor[s] = 0 })
    clientes.forEach(c => { const etapas = new Set<string>(); etapas.add(c.etapa); (c.historicoEtapas || []).forEach(h => { etapas.add(h.etapa); if (h.de) etapas.add(h.de) }); funilStages.forEach(s => { if (etapas.has(s)) passaramPor[s]++ }) })
    const convRows = funilStages.map((s, i) => { const qtd = passaramPor[s]; const ant = i > 0 ? passaramPor[funilStages[i - 1]] : qtd; const taxa = ant > 0 ? ((qtd / ant) * 100).toFixed(0) : '—'; return `<tr><td>${stLabels[s]}</td><td style="text-align:center">${qtd}</td><td style="text-align:center">${i > 0 ? taxa + '%' : '—'}</td></tr>` }).join('')
    const topClientes = [...clientes].filter(c => c.etapa !== 'perdido').sort((a, b) => (b.valorEstimado || 0) - (a.valorEstimado || 0)).slice(0, 10)
    const topRows = topClientes.map(c => { const vend = vendedores.find(v => v.id === c.vendedorId); return `<tr><td>${c.razaoSocial}</td><td>${stLabels[c.etapa] || c.etapa}</td><td style="text-align:center">${c.score || 0}</td><td style="text-align:right">R$ ${(c.valorEstimado || 0).toLocaleString('pt-BR')}</td><td>${vend?.nome || '—'}</td></tr>` }).join('')
    const etapaMaisPerdas = Object.entries(perdidos.reduce((acc, c) => { const k = c.etapaAnterior || 'desconhecido'; acc[k] = (acc[k] || 0) + 1; return acc }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1])
    const motivoTop = Object.entries(catCount).sort((a, b) => b[1] - a[1])
    const probEtapa: Record<string, number> = { 'prospecção': 0.10, 'amostra': 0.25, 'homologado': 0.50, 'negociacao': 0.75, 'pos_venda': 0.95 }
    const receitaProjetada = clientes.filter(c => c.etapa !== 'perdido').reduce((s, c) => s + (c.valorEstimado || 0) * (probEtapa[c.etapa] || 0), 0)
    const clientesRisco = clientes.filter(c => { if (!c.dataEntradaEtapa) return false; const dias = Math.floor((Date.now() - new Date(c.dataEntradaEtapa).getTime()) / 86400000); return (c.etapa === 'amostra' && dias >= 20) || (c.etapa === 'homologado' && dias >= 55) })
    const insights = [
      `O pipeline atual totaliza <strong>R$ ${totalPipeline.toLocaleString('pt-BR')}</strong> distribuídos em <strong>${leadsAtivos}</strong> leads ativos.`,
      `A taxa de conversão global é de <strong>${taxaConversao}%</strong> (${posVenda.length} de ${totalLeads} leads chegaram a Pós-Venda).`,
      `Receita projetada (ponderada por probabilidade): <strong>R$ ${receitaProjetada.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</strong>.`,
      motivoTop.length > 0 ? `O principal motivo de perda é <strong>"${catLabels[motivoTop[0][0]] || motivoTop[0][0]}"</strong> com ${motivoTop[0][1]} ocorrência(s).` : '',
      etapaMaisPerdas.length > 0 ? `A etapa com mais perdas é <strong>"${stLabels[etapaMaisPerdas[0][0]] || etapaMaisPerdas[0][0]}"</strong> (${etapaMaisPerdas[0][1]} clientes).` : '',
      clientesRisco.length > 0 ? `⚠️ <strong>${clientesRisco.length}</strong> cliente(s) em risco de perda por prazo: ${clientesRisco.map(c => c.razaoSocial).join(', ')}.` : 'Nenhum cliente em risco iminente de prazo.',
      `Ticket médio: <strong>R$ ${ticketMedio.toLocaleString('pt-BR')}</strong>.`,
    ].filter(Boolean)

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
<div class="footer">Relatório gerado automaticamente pelo CRM MF Paris com análise de IA • ${hoje}</div></body></html>`

    const printWindow = window.open('', '_blank')
    if (printWindow) { printWindow.document.write(html); printWindow.document.close(); setTimeout(() => { printWindow.print() }, 500) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div><h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Relatórios e Gráficos</h1><p className="mt-1 text-sm text-gray-600">Análise visual completa do pipeline, vendedores e interações</p></div>
        <button onClick={gerarRelatorioPDF} className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-apple hover:from-blue-700 hover:to-indigo-700 shadow-apple-sm flex items-center gap-2 font-medium text-sm transition-all self-start">
          <SparklesIcon className="h-4 w-4" /> Gerar Relatório com IA
        </button>
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
          <div className="p-4 bg-blue-50 rounded-apple border border-blue-200"><p className="text-xs text-blue-600 font-medium">Total Pipeline</p><p className="text-xl font-bold text-blue-900">R$ {clientes.reduce((s, c) => s + (c.valorEstimado || 0), 0).toLocaleString('pt-BR')}</p></div>
          <div className="p-4 bg-green-50 rounded-apple border border-green-200"><p className="text-xs text-green-600 font-medium">Vendas Fechadas</p><p className="text-xl font-bold text-green-900">R$ {clientes.filter(c => c.etapa === 'pos_venda').reduce((s, c) => s + (c.valorEstimado || 0), 0).toLocaleString('pt-BR')}</p></div>
          <div className="p-4 bg-red-50 rounded-apple border border-red-200"><p className="text-xs text-red-600 font-medium">Perdidos</p><p className="text-xl font-bold text-red-900">{clientes.filter(c => c.etapa === 'perdido').length} leads</p></div>
          <div className="p-4 bg-purple-50 rounded-apple border border-purple-200"><p className="text-xs text-purple-600 font-medium">Taxa Conversão</p><p className="text-xl font-bold text-purple-900">{clientes.length > 0 ? ((clientes.filter(c => c.etapa === 'pos_venda').length / clientes.length) * 100).toFixed(1) : 0}%</p></div>
        </div>
      </div>

      {/* Funil de Conversão */}
      {(() => {
        const funilStages = ['prospecção', 'amostra', 'homologado', 'negociacao', 'pos_venda']
        const funilLabels: Record<string, string> = { 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'homologado': 'Homologado', 'negociacao': 'Negociação', 'pos_venda': 'Pós-Venda' }
        const passaramPor: Record<string, number> = {}
        funilStages.forEach(s => { passaramPor[s] = 0 })
        clientes.forEach(c => { const etapas = new Set<string>(); etapas.add(c.etapa); (c.historicoEtapas || []).forEach(h => { etapas.add(h.etapa); if (h.de) etapas.add(h.de) }); funilStages.forEach(s => { if (etapas.has(s)) passaramPor[s]++ }) })
        const convData = funilStages.map((s, i) => { const qtd = passaramPor[s]; const anterior = i > 0 ? passaramPor[funilStages[i - 1]] : qtd; const taxa = anterior > 0 ? (qtd / anterior) * 100 : 0; return { name: funilLabels[s], qtd, taxa: Math.round(taxa) } })
        const maxQtd = Math.max(...convData.map(d => d.qtd), 1)
        return (
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">📈 Funil de Conversão</h3>
            <p className="text-sm text-gray-500 mb-5">Taxa de conversão entre cada etapa do funil</p>
            <div className="space-y-3">
              {convData.map((d, i) => (
                <div key={d.name}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700 w-24 text-right">{d.name}</span>
                    <div className="flex-1 relative"><div className="w-full bg-gray-100 rounded-full h-8 overflow-hidden"><div className="h-8 rounded-full flex items-center px-3 transition-all duration-500" style={{ width: `${Math.max((d.qtd / maxQtd) * 100, 8)}%`, backgroundColor: ['#3B82F6', '#EAB308', '#22C55E', '#A855F7', '#EC4899'][i] || '#6B7280' }}><span className="text-xs font-bold text-white drop-shadow">{d.qtd} lead{d.qtd !== 1 ? 's' : ''}</span></div></div></div>
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

      {/* Tempo Médio por Etapa */}
      {(() => {
        const funilStages = ['prospecção', 'amostra', 'homologado', 'negociacao', 'pos_venda']
        const funilLabels: Record<string, string> = { 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'homologado': 'Homologado', 'negociacao': 'Negociação', 'pos_venda': 'Pós-Venda' }
        const stColors = ['#3B82F6', '#EAB308', '#22C55E', '#A855F7', '#EC4899']
        const temposPorEtapa: Record<string, number[]> = {}
        funilStages.forEach(s => { temposPorEtapa[s] = [] })
        clientes.forEach(c => { const hist = c.historicoEtapas || []; for (let i = 0; i < hist.length; i++) { const etapa = hist[i].de; if (etapa && funilStages.includes(etapa)) { const entrada = i > 0 ? new Date(hist[i - 1].data).getTime() : (c.dataEntradaEtapa ? new Date(c.dataEntradaEtapa).getTime() : null); if (entrada) { const saida = new Date(hist[i].data).getTime(); const dias = Math.max(1, Math.floor((saida - entrada) / 86400000)); temposPorEtapa[etapa].push(dias) } } }; if (funilStages.includes(c.etapa) && c.dataEntradaEtapa) { const dias = Math.max(1, Math.floor((Date.now() - new Date(c.dataEntradaEtapa).getTime()) / 86400000)); temposPorEtapa[c.etapa].push(dias) } })
        const tempoData = funilStages.map((s, i) => { const arr = temposPorEtapa[s]; const media = arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0; return { name: funilLabels[s], dias: media, fill: stColors[i], count: arr.length } }).filter(d => d.count > 0)
        if (tempoData.length === 0) return null
        return (
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">⏱️ Tempo Médio por Etapa</h3>
            <p className="text-sm text-gray-500 mb-4">Dias que os clientes ficam em média em cada etapa antes de avançar</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tempoData} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis type="number" tick={{ fontSize: 11 }} unit=" dias" /><YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={100} /><Tooltip formatter={(value: number) => [`${value} dias`, 'Média']} /><Bar dataKey="dias" radius={[0, 6, 6, 0]}>{tempoData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}</Bar></BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-3">{tempoData.map(d => (<div key={d.name} className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} /><span className="text-xs text-gray-600">{d.name}: <span className="font-bold text-gray-900">{d.dias}d</span></span></div>))}</div>
          </div>
        )
      })()}

      {/* Relatório de Perdas */}
      {(() => {
        const perdidos = clientes.filter(c => c.etapa === 'perdido')
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
              <div className="p-4 bg-gray-50 rounded-apple border border-gray-200"><p className="text-xs text-gray-600 font-medium">Taxa de Perda</p><p className="text-2xl font-bold text-gray-900">{clientes.length > 0 ? ((totalPerdido / clientes.length) * 100).toFixed(1) : 0}%</p></div>
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
    </div>
  )
}

export default RelatoriosView
