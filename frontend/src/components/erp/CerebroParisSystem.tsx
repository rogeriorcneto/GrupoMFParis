import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import ErpLayout from './ErpLayout'

interface Mensagem {
  id: string
  papel: 'user' | 'ai'
  texto: string
  timestamp: Date
}

interface Contexto {
  clientes: number
  pedidos: number
  faturamento: number
  fretesPendentes: number
  contasReceber: number
  contasPagar: number
  saldo: number
}

const PROMPTS_RAPIDOS = [
  '📊 Resuma a saúde financeira da empresa',
  '🎯 Quais clientes precisam de atenção?',
  '🚚 Status das entregas em andamento',
  '💡 Sugira 3 ações para aumentar vendas',
  '⚠️ Quais são os principais riscos atuais?',
  '📈 Análise de performance do mês',
]

export default function CerebroParisSystem({ onVoltar }: { onVoltar: () => void }) {
  const [activeMenu, setActiveMenu] = useState('chat')
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      id: '1',
      papel: 'ai',
      texto: '🧠 Olá! Sou o Cérebro Paris, IA com visão 360° de toda a empresa. Tenho acesso a clientes, pedidos, financeiro, logística e mais. Como posso te ajudar hoje?',
      timestamp: new Date()
    }
  ])
  const [input, setInput] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [contexto, setContexto] = useState<Contexto | null>(null)
  const chatRef = useRef<HTMLDivElement>(null)

  const buildContexto = async (): Promise<Contexto> => {
    try {
      const [c, p, f, lr, lp] = await Promise.all([
        supabase.from('clientes').select('id', { count: 'exact', head: true }),
        supabase.from('pedidos').select('valor_total'),
        supabase.from('fretes').select('id, status'),
        supabase.from('lancamentos_financeiros').select('valor, tipo, status').eq('tipo', 'receita').eq('status', 'pendente'),
        supabase.from('lancamentos_financeiros').select('valor, tipo, status').eq('tipo', 'despesa').eq('status', 'pendente'),
      ])

      const faturamento = (p.data || []).reduce((s, x: any) => s + Number(x.valor_total || 0), 0)
      const fretesPendentes = (f.data || []).filter((x: any) => ['pendente', 'cotado', 'em_transito', 'coletado'].includes(x.status)).length
      const contasReceber = (lr.data || []).reduce((s, x: any) => s + Number(x.valor || 0), 0)
      const contasPagar = (lp.data || []).reduce((s, x: any) => s + Number(x.valor || 0), 0)

      return {
        clientes: c.count || 0,
        pedidos: (p.data || []).length,
        faturamento,
        fretesPendentes,
        contasReceber,
        contasPagar,
        saldo: contasReceber - contasPagar,
      }
    } catch (err) {
      console.error('Erro contexto:', err)
      return { clientes: 0, pedidos: 0, faturamento: 0, fretesPendentes: 0, contasReceber: 0, contasPagar: 0, saldo: 0 }
    }
  }

  useEffect(() => {
    buildContexto().then(setContexto)
  }, [])

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
  }, [mensagens])

  const enviarMensagem = async (texto: string) => {
    if (!texto.trim() || enviando) return

    const userMsg: Mensagem = { id: Date.now().toString(), papel: 'user', texto, timestamp: new Date() }
    setMensagens(prev => [...prev, userMsg])
    setInput('')
    setEnviando(true)

    try {
      const ctx = contexto || await buildContexto()
      const resposta = await chamarIA(texto, ctx)
      const aiMsg: Mensagem = { id: (Date.now() + 1).toString(), papel: 'ai', texto: resposta, timestamp: new Date() }
      setMensagens(prev => [...prev, aiMsg])
    } catch (err) {
      console.error(err)
      const errMsg: Mensagem = {
        id: (Date.now() + 1).toString(),
        papel: 'ai',
        texto: '⚠️ Erro ao processar. Verifique a configuração da API Gemini.',
        timestamp: new Date()
      }
      setMensagens(prev => [...prev, errMsg])
    } finally {
      setEnviando(false)
    }
  }

  const menu = [
    { id: 'chat', label: 'Chat IA', icone: '💬' },
    { id: 'insights', label: 'Insights', icone: '💡' },
    { id: 'contexto', label: 'Contexto Empresa', icone: '🏢' },
  ]

  return (
    <ErpLayout
      titulo="Cérebro Paris"
      subtitulo="IA Empresarial"
      icone="🧠"
      cor="from-purple-500 to-indigo-700"
      menu={menu}
      activeMenu={activeMenu}
      onMenuChange={setActiveMenu}
      onVoltarPortal={onVoltar}
    >
      {activeMenu === 'chat' && (
        <div className="h-screen flex flex-col">
          {/* KPIs no topo */}
          {contexto && (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 p-4 bg-white border-b">
              <MiniKpi titulo="Clientes" valor={contexto.clientes} />
              <MiniKpi titulo="Pedidos" valor={contexto.pedidos} />
              <MiniKpi titulo="Faturamento" valor={`R$ ${contexto.faturamento.toFixed(0)}`} />
              <MiniKpi titulo="Fretes Ativos" valor={contexto.fretesPendentes} />
              <MiniKpi titulo="A Receber" valor={`R$ ${contexto.contasReceber.toFixed(0)}`} cor="text-green-600" />
              <MiniKpi titulo="A Pagar" valor={`R$ ${contexto.contasPagar.toFixed(0)}`} cor="text-red-600" />
            </div>
          )}

          {/* Chat */}
          <div ref={chatRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-to-br from-purple-50 to-indigo-50">
            {mensagens.map(m => (
              <div key={m.id} className={`flex ${m.papel === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-3xl rounded-2xl px-5 py-3 shadow-sm ${
                  m.papel === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-900 border'
                }`}>
                  {m.papel === 'ai' && <div className="text-xs text-purple-600 font-bold mb-1">🧠 Cérebro Paris</div>}
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.texto}</div>
                  <div className={`text-[10px] mt-1 opacity-60 ${m.papel === 'user' ? 'text-white' : 'text-gray-500'}`}>
                    {m.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            {enviando && (
              <div className="flex justify-start">
                <div className="bg-white border rounded-2xl px-5 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Prompts rápidos */}
          <div className="p-3 bg-white border-t flex gap-2 overflow-x-auto">
            {PROMPTS_RAPIDOS.map(p => (
              <button
                key={p}
                onClick={() => enviarMensagem(p)}
                disabled={enviando}
                className="flex-shrink-0 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-full text-xs font-medium disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="p-4 bg-white border-t">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && enviarMensagem(input)}
                placeholder="Pergunte algo sobre a empresa..."
                disabled={enviando}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
              />
              <button
                onClick={() => enviarMensagem(input)}
                disabled={enviando || !input.trim()}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 text-white rounded-xl font-medium disabled:opacity-50"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      {activeMenu === 'insights' && (
        <InsightsView contexto={contexto} />
      )}

      {activeMenu === 'contexto' && (
        <ContextoView contexto={contexto} onRefresh={() => buildContexto().then(setContexto)} />
      )}
    </ErpLayout>
  )
}

function MiniKpi({ titulo, valor, cor = 'text-gray-900' }: any) {
  return (
    <div className="bg-gray-50 rounded-lg p-2 text-center">
      <p className="text-[10px] text-gray-500 uppercase">{titulo}</p>
      <p className={`text-sm font-bold ${cor}`}>{valor}</p>
    </div>
  )
}

function InsightsView({ contexto }: { contexto: Contexto | null }) {
  if (!contexto) return <div className="p-6">Carregando...</div>

  const insights = []
  if (contexto.contasPagar > contexto.contasReceber) {
    insights.push({ tipo: 'alerta', icone: '⚠️', texto: 'Despesas pendentes superam receitas a receber. Atenção ao fluxo de caixa.' })
  }
  if (contexto.fretesPendentes > 5) {
    insights.push({ tipo: 'info', icone: '🚚', texto: `${contexto.fretesPendentes} fretes em andamento. Monitorar prazos.` })
  }
  if (contexto.saldo > 0) {
    insights.push({ tipo: 'positivo', icone: '✅', texto: `Saldo previsto positivo: R$ ${contexto.saldo.toFixed(2)}` })
  }
  if (contexto.clientes < 10) {
    insights.push({ tipo: 'oportunidade', icone: '🎯', texto: 'Base de clientes pequena. Oportunidade para prospecção.' })
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">💡 Insights Automáticos</h2>
      <div className="space-y-3">
        {insights.map((i, idx) => (
          <div key={idx} className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-purple-500">
            <div className="flex items-start gap-3">
              <span className="text-3xl">{i.icone}</span>
              <p className="text-gray-800 flex-1">{i.texto}</p>
            </div>
          </div>
        ))}
        {insights.length === 0 && <p className="text-gray-500">Sem insights ainda. Cadastre dados para receber análises.</p>}
      </div>
    </div>
  )
}

function ContextoView({ contexto, onRefresh }: any) {
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">🏢 Contexto da Empresa</h2>
        <button onClick={onRefresh} className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg">🔄 Atualizar</button>
      </div>
      {contexto && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ContextoCard titulo="Total de Clientes" valor={contexto.clientes} icone="👥" />
          <ContextoCard titulo="Total de Pedidos" valor={contexto.pedidos} icone="📦" />
          <ContextoCard titulo="Faturamento Total" valor={`R$ ${contexto.faturamento.toFixed(2)}`} icone="💰" />
          <ContextoCard titulo="Fretes Ativos" valor={contexto.fretesPendentes} icone="🚚" />
          <ContextoCard titulo="A Receber" valor={`R$ ${contexto.contasReceber.toFixed(2)}`} icone="📥" cor="text-green-600" />
          <ContextoCard titulo="A Pagar" valor={`R$ ${contexto.contasPagar.toFixed(2)}`} icone="📤" cor="text-red-600" />
        </div>
      )}
    </div>
  )
}

function ContextoCard({ titulo, valor, icone, cor = 'text-gray-900' }: any) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-3xl">{icone}</span>
      </div>
      <p className="text-sm text-gray-500">{titulo}</p>
      <p className={`text-2xl font-bold ${cor}`}>{valor}</p>
    </div>
  )
}

// Função de chamada à IA (tenta Gemini ou cai em fallback inteligente)
async function chamarIA(pergunta: string, ctx: Contexto): Promise<string> {
  const contextoStr = `
Dados atuais da empresa Grupo MF Paris:
- ${ctx.clientes} clientes ativos
- ${ctx.pedidos} pedidos registrados
- Faturamento total: R$ ${ctx.faturamento.toFixed(2)}
- ${ctx.fretesPendentes} fretes em andamento
- Contas a receber: R$ ${ctx.contasReceber.toFixed(2)}
- Contas a pagar: R$ ${ctx.contasPagar.toFixed(2)}
- Saldo previsto: R$ ${ctx.saldo.toFixed(2)}
`

  const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY
  if (apiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Você é o "Cérebro Paris", IA empresarial do Grupo MF Paris. Responda em português, de forma clara, prática e estratégica.

${contextoStr}

Pergunta do gestor: ${pergunta}

Resposta (curta, com bullet points quando útil):`
            }]
          }]
        })
      })
      const data = await res.json()
      const resposta = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (resposta) return resposta
    } catch (err) {
      console.warn('Gemini falhou, usando fallback', err)
    }
  }

  // Fallback inteligente sem IA externa
  return fallbackResposta(pergunta, ctx)
}

function fallbackResposta(pergunta: string, ctx: Contexto): string {
  const p = pergunta.toLowerCase()

  if (p.includes('saúde financeira') || p.includes('financeiro')) {
    return `📊 **Saúde Financeira:**

• Saldo previsto: R$ ${ctx.saldo.toFixed(2)} ${ctx.saldo >= 0 ? '✅' : '⚠️'}
• A receber: R$ ${ctx.contasReceber.toFixed(2)}
• A pagar: R$ ${ctx.contasPagar.toFixed(2)}
• Faturamento histórico: R$ ${ctx.faturamento.toFixed(2)}

${ctx.saldo < 0
  ? '⚠️ ATENÇÃO: Despesas pendentes superam receitas. Considere antecipar recebíveis ou negociar prazos.'
  : '✅ Situação positiva. Mantenha o ritmo de cobrança e aproveite para investir.'}`
  }

  if (p.includes('cliente')) {
    return `🎯 **Análise de Clientes:**

• Total de clientes: ${ctx.clientes}
• Pedidos gerados: ${ctx.pedidos}
• Ticket médio: R$ ${ctx.pedidos > 0 ? (ctx.faturamento / ctx.pedidos).toFixed(2) : '0.00'}

💡 Acesse o CRM para ver clientes específicos e suas etapas no funil.`
  }

  if (p.includes('entrega') || p.includes('frete') || p.includes('logística')) {
    return `🚚 **Entregas em Andamento:**

• Fretes ativos: ${ctx.fretesPendentes}
${ctx.fretesPendentes > 0 ? '• Acesse o módulo Logística para detalhes e rastreamento.' : '• Nenhum frete em trânsito no momento.'}`
  }

  if (p.includes('venda') || p.includes('aumentar') || p.includes('crescer')) {
    return `📈 **Sugestões para Aumentar Vendas:**

1. **Reativar clientes inativos**: Contato com base atual
2. **Cross-sell**: Oferecer produtos complementares aos compradores recentes
3. **Campanha segmentada**: WhatsApp/Email para leads em prospecção
4. **Indicações**: Programa de referência com desconto
5. **Otimizar funil**: Identifique gargalos no CRM

Ticket médio atual: R$ ${ctx.pedidos > 0 ? (ctx.faturamento / ctx.pedidos).toFixed(2) : '0.00'}`
  }

  if (p.includes('risco') || p.includes('alerta') || p.includes('problema')) {
    const riscos = []
    if (ctx.saldo < 0) riscos.push('• ⚠️ Fluxo de caixa negativo')
    if (ctx.contasPagar > ctx.contasReceber * 1.5) riscos.push('• ⚠️ Despesas muito acima das receitas')
    if (ctx.fretesPendentes > 10) riscos.push('• ⚠️ Muitos fretes pendentes — risco de atraso')
    if (ctx.clientes < 5) riscos.push('• ⚠️ Base de clientes pequena — concentração de risco')
    return riscos.length > 0 ? `**Riscos Identificados:**\n\n${riscos.join('\n')}` : '✅ Nenhum risco crítico identificado no momento.'
  }

  return `🧠 Posso ajudar com análises sobre:

• **Financeiro**: "Como está a saúde financeira?"
• **Clientes**: "Quem precisa de atenção?"
• **Vendas**: "Como aumentar vendas?"
• **Logística**: "Status das entregas"
• **Riscos**: "Quais alertas atuais?"

💡 Para análises mais profundas, configure a API Gemini em \`VITE_GEMINI_API_KEY\`.`
}
