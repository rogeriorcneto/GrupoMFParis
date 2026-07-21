import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  PlayIcon,
  StopIcon,
  TrophyIcon,
  ClockIcon,
  UserGroupIcon,
  PhoneIcon,
  AcademicCapIcon,
  ArrowPathIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  XCircleIcon,
  LightBulbIcon,
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  SparklesIcon,
  ChartBarIcon,
  FireIcon,
  ArrowLeftIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline'
import { callAI } from '../../lib/gemini'
import type { AIMessage } from '../../lib/gemini'
import type { Vendedor, Produto } from '../../types'

interface MsgChat {
  role: 'user' | 'assistant'
  content: string
  ts: number
}

interface SessaoTreinamento {
  id: string
  modulo: string
  perfilId: string
  msgs: MsgChat[]
  duracao: number
  nota: number | null
  feedback: string
  createdAt: string
}

type Aba = 'home' | 'roleplay' | 'produtos' | 'quiz' | 'historico'
type ModuloId = 'abertura' | 'qualificacao' | 'objecao_preco' | 'objecao_prazo' | 'amostra' | 'fechamento' | 'pos_venda' | 'livre'

const MODULOS: { id: ModuloId; titulo: string; desc: string; dif: 'Iniciante' | 'Médio' | 'Avançado'; emoji: string; objetivo: string }[] = [
  { id: 'abertura', titulo: 'Abertura & Conexão', desc: 'Captar atenção nos primeiros 30s e criar rapport', dif: 'Iniciante', emoji: '📞', objetivo: 'Objetivo: o cliente concorda em ouvir a proposta.' },
  { id: 'qualificacao', titulo: 'Qualificação BANT', desc: 'Descobrir orçamento, autoridade, necessidade e timing', dif: 'Médio', emoji: '🔍', objetivo: 'Objetivo: entender o perfil completo antes de propor.' },
  { id: 'objecao_preco', titulo: 'Objeção: Preço', desc: 'Lidar com "está caro" e "o concorrente é mais barato"', dif: 'Médio', emoji: '💸', objetivo: 'Objetivo: reverter objeção de preço e avançar.' },
  { id: 'objecao_prazo', titulo: 'Objeção: Prazo & Frete', desc: 'Negociar prazos de pagamento e condições CIF/FOB', dif: 'Avançado', emoji: '🚚', objetivo: 'Objetivo: fechar condições logísticas favoráveis.' },
  { id: 'amostra', titulo: 'Solicitação de Amostra', desc: 'Converter interesse em amostra física com data de retorno', dif: 'Médio', emoji: '🧪', objetivo: 'Objetivo: cliente aceita receber amostra com prazo de feedback.' },
  { id: 'fechamento', titulo: 'Fechamento & Próximo Passo', desc: 'Propor ação concreta sem ser agressivo', dif: 'Avançado', emoji: '🤝', objetivo: 'Objetivo: cliente confirma pedido ou agenda próxima etapa.' },
  { id: 'pos_venda', titulo: 'Pós-Venda & Fidelização', desc: 'Garantir satisfação e abrir oportunidade de recompra', dif: 'Médio', emoji: '🌟', objetivo: 'Objetivo: cliente satisfeito e nova compra agendada.' },
  { id: 'livre', titulo: 'Roleplay Livre', desc: 'Simule uma call completa do zero ao fechamento', dif: 'Avançado', emoji: '🎯', objetivo: 'Objetivo: conduzir toda a jornada comercial.' },
]

const PERFIS = [
  { id: 'panificador', nome: 'João da Silva', negocio: 'Panificadora Estrela', emoji: '🥖', dor: 'custo de insumos alto e falta de tempo', estilo: 'direto, impaciente, foco total em preço e prazo de entrega' },
  { id: 'sorveteiro', nome: 'Carlos Mendes', negocio: 'Sorveteria Gelada', emoji: '🍦', dor: 'qualidade inconsistente dos fornecedores atuais', estilo: 'técnico, detalhista, compara ingredientes e laudos' },
  { id: 'industrial', nome: 'Márcio Ferreira', negocio: 'Indústria FrioPar', emoji: '🏭', dor: 'processo de compra burocrático e múltiplos aprovadores', estilo: 'corporativo, frio, pede cotação formal e prazo de entrega garantido' },
  { id: 'confeiteiro', nome: 'Ana Lima', negocio: 'Confeitaria Premium Belle', emoji: '🧁', dor: 'clientes exigentes que pedem produtos especiais', estilo: 'sofisticada, exige excelência, pergunta sobre origem e diferenciais' },
  { id: 'restaurante', nome: 'Roberto Costa', negocio: 'Restaurante Sabor Mineiro', emoji: '🍽️', dor: 'volume alto mas margem apertada', estilo: 'negociador nato, sempre pede desconto e prazo maior' },
]

const PRODUTOS_MF_PARIS = [
  { nome: 'Composto Lácteo Horizonte 400g', categoria: 'Lácteos', destaque: 'Alto rendimento, cremosidade superior', preco: 'R$ 8,90/un', aplicacao: 'Sorvetes, vitaminas, bebidas lácteas', dif: 'Sem gordura trans, enriquecido com vitaminas A e D' },
  { nome: 'Leite em Pó Integral 200g', categoria: 'Lácteos', destaque: 'Dissolução rápida, sabor suave', preco: 'R$ 12,50/un', aplicacao: 'Panificação, confeitaria, bebidas', dif: 'Origem rastreada, sem conservantes' },
  { nome: 'Creme de Leite UHT 200ml', categoria: 'Lácteos', destaque: 'Textura firme, não talha no cozimento', preco: 'R$ 5,20/un', aplicacao: 'Molhos, sobremesas, recheios', dif: 'Processado UHT — maior validade e estabilidade' },
  { nome: 'Açaí Congelado 1kg', categoria: 'Açaí & Frutas', destaque: 'Polpa 100% pura, sem adição de açúcar', preco: 'R$ 22,00/kg', aplicacao: 'Sorveterias, açaí bowls, blends', dif: 'Colheita sazonal controlada, alto teor de antocianinas' },
  { nome: 'Base Sorvete de Baunilha 1kg', categoria: 'Sorvetes', destaque: 'Rendimento até 3L de sorvete por kg', preco: 'R$ 28,00/kg', aplicacao: 'Sorveterias artesanais e industriais', dif: 'Fácil preparo a frio, sem necessidade de cozimento' },
  { nome: 'Chocolate em Pó 50% Cacau 200g', categoria: 'Chocolates', destaque: 'Cor intensa, sabor amargo equilibrado', preco: 'R$ 9,80/un', aplicacao: 'Confeitaria, bolos, mousses', dif: 'Processamento alcalino — dissolve sem grumos' },
  { nome: 'Cobertura de Chocolate ao Leite 1kg', categoria: 'Chocolates', destaque: 'Brilho intenso, snap perfeito', preco: 'R$ 35,00/kg', aplicacao: 'Trufas, picolés, coberturas', dif: 'Temperagem fácil, ponto ideal em 35°C' },
  { nome: 'Leite Condensado 395g', categoria: 'Lácteos', destaque: 'Cremosidade ideal para doces finos', preco: 'R$ 7,50/un', aplicacao: 'Brigadeiros, quindins, sorvetes', dif: 'Sem gordura vegetal parcialmente hidrogenada' },
  { nome: 'Mucilon Milho 400g', categoria: 'Cereais', destaque: 'Enriquecido com 11 vitaminas e minerais', preco: 'R$ 10,90/un', aplicacao: 'Papas, vitaminas, produtos infantis', dif: 'Marca reconhecida, alta rotatividade no varejo' },
  { nome: 'Farinha de Trigo Premium 1kg', categoria: 'Panificação', destaque: 'Alta absorção de água, glúten forte', preco: 'R$ 6,40/kg', aplicacao: 'Pães, massas, pizzas', dif: 'Maturação controlada — produto consistente lote a lote' },
]

export default function TreinamentoView({
  vendedor,
  isGerente,
  produtos = [],
}: {
  vendedor: Vendedor
  isGerente: boolean
  produtos?: Produto[]
}) {
  const [aba, setAba] = useState<Aba>('home')
  const [moduloId, setModuloId] = useState<ModuloId | null>(null)
  const [perfilId, setPerfilId] = useState<string>('panificador')
  const [msgs, setMsgs] = useState<MsgChat[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [tempoInicio, setTempoInicio] = useState<number>(0)
  const [duracaoAtual, setDuracaoAtual] = useState(0)
  const [sessaoAtiva, setSessaoAtiva] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [nota, setNota] = useState<number | null>(null)
  const [historico, setHistorico] = useState<SessaoTreinamento[]>([])
  const [produtoVer, setProdutoVer] = useState<typeof PRODUTOS_MF_PARIS[0] | null>(null)
  const [quizAtivo, setQuizAtivo] = useState(false)
  const [quizPergunta, setQuizPergunta] = useState<string>('')
  const [quizResp, setQuizResp] = useState('')
  const [quizFeedback, setQuizFeedback] = useState<string | null>(null)
  const [quizLoading, setQuizLoading] = useState(false)
  const [sessaoHistoricoVer, setSessaoHistoricoVer] = useState<SessaoTreinamento | null>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem(`treinamentos_v2_${vendedor.id}`)
    if (saved) setHistorico(JSON.parse(saved))
  }, [vendedor.id])

  useEffect(() => {
    if (sessaoAtiva) {
      timerRef.current = setInterval(() => setDuracaoAtual(Math.floor((Date.now() - tempoInicio) / 1000)), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [sessaoAtiva, tempoInicio])

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [msgs])

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  const sistemaTreinamento = useCallback(() => {
    const modulo = MODULOS.find(m => m.id === moduloId)
    const perfil = PERFIS.find(p => p.id === perfilId)
    const produtosCatalogo = PRODUTOS_MF_PARIS.map(p => `• ${p.nome} — ${p.dif}`).join('\n')
    return `Você é um CLIENTE em um roleplay de treinamento de vendas para vendedores da MF Paris, distribuidora de alimentos premium.

PERSONAGEM: ${perfil?.nome} (${perfil?.negocio})
PERFIL: ${perfil?.estilo}
DOR PRINCIPAL: ${perfil?.dor}

MÓDULO DO TREINO: "${modulo?.titulo}"
${modulo?.objetivo}

CATÁLOGO DE PRODUTOS MF PARIS (você pode mencionar interesse em alguns):
${produtosCatalogo}

REGRAS DO ROLEPLAY:
1. Fique SEMPRE no personagem. Não quebre o personagem.
2. Responda de forma realista — seja difícil de convencer, coloque objeções genuínas.
3. Se o vendedor fizer perguntas inteligentes de qualificação, responda com detalhes do seu negócio.
4. Se ele apresentar argumentos fracos, mostre resistência.
5. Se ele apresentar argumentos fortes e benefícios reais, demonstre interesse gradual.
6. Quando o vendedor digitar "ENCERRAR TREINO", saia do personagem e dê um FEEDBACK DETALHADO em JSON com este formato:
{"nota": 8, "abertura": 7, "qualificacao": 9, "apresentacao": 8, "objecoes": 7, "fechamento": 8, "pontos_fortes": ["..."], "pontos_melhora": ["..."], "feedback_geral": "..."}

Comece a cena: você acabou de atender o telefone em um momento movimentado do seu dia.`
  }, [moduloId, perfilId])

  const iniciarSessao = async () => {
    if (!moduloId) return
    const t = Date.now()
    setTempoInicio(t)
    setDuracaoAtual(0)
    setMsgs([])
    setFeedback(null)
    setNota(null)
    setSessaoAtiva(true)
    setAba('roleplay')
    setLoading(true)
    try {
      const resp = await callAI(
        [{ role: 'user', content: 'Pode começar o roleplay.' }],
        sistemaTreinamento()
      )
      setMsgs([{ role: 'assistant', content: resp, ts: Date.now() }])
    } catch {
      setMsgs([{ role: 'assistant', content: '📞 *toca o telefone* Alô?', ts: Date.now() }])
    }
    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const enviarMsg = async () => {
    if (!input.trim() || loading) return
    const texto = input.trim()
    setInput('')
    const novaMsg: MsgChat = { role: 'user', content: texto, ts: Date.now() }
    const novasMsgs = [...msgs, novaMsg]
    setMsgs(novasMsgs)

    if (texto.toUpperCase().includes('ENCERRAR TREINO')) {
      await encerrarSessao(novasMsgs)
      return
    }

    setLoading(true)
    try {
      const histAI: AIMessage[] = novasMsgs.map(m => ({ role: m.role, content: m.content }))
      const resp = await callAI(histAI, sistemaTreinamento())
      setMsgs(prev => [...prev, { role: 'assistant', content: resp, ts: Date.now() }])
    } catch {
      setMsgs(prev => [...prev, { role: 'assistant', content: '*(sem resposta — verifique conexão)*', ts: Date.now() }])
    }
    setLoading(false)
  }

  const encerrarSessao = async (msgsFinal: MsgChat[]) => {
    setSessaoAtiva(false)
    setLoading(true)
    const duracao = Math.max(0, Math.floor((Date.now() - tempoInicio) / 1000))
    let notaFinal = 7
    let feedbackFinal = '{"nota":7,"feedback_geral":"Sessão encerrada."}'
    try {
      const transcript = msgsFinal.map(m => `${m.role === 'user' ? 'VENDEDOR' : 'CLIENTE'}: ${m.content}`).join('\n')
      const resp = await callAI(
        [{ role: 'user', content: `TRANSCRIPT DO ROLEPLAY:\n${transcript}\n\nAGORA DÊ O FEEDBACK DETALHADO EM JSON conforme instrução.` }],
        sistemaTreinamento()
      )
      const jsonMatch = resp.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const avaliacao = JSON.parse(jsonMatch[0])
        notaFinal = avaliacao.nota || 7
        feedbackFinal = JSON.stringify(avaliacao)
      }
    } catch { /* mantém fallback */ }
    setNota(notaFinal)
    setFeedback(feedbackFinal)
    const sessao: SessaoTreinamento = {
      id: Date.now().toString(), modulo: moduloId!, perfilId,
      msgs: msgsFinal, duracao, nota: notaFinal,
      feedback: feedbackFinal, createdAt: new Date().toISOString()
    }
    const novoHist = [sessao, ...historico]
    setHistorico(novoHist)
    localStorage.setItem(`treinamentos_v2_${vendedor.id}`, JSON.stringify(novoHist))
    setLoading(false)
  }

  const gerarQuiz = async () => {
    setQuizLoading(true)
    setQuizFeedback(null)
    setQuizResp('')
    const produtosTexto = PRODUTOS_MF_PARIS.map(p =>
      `${p.nome}: ${p.dif}. Aplicação: ${p.aplicacao}.`
    ).join('\n')
    try {
      const resp = await callAI(
        [{ role: 'user', content: 'Gere UMA pergunta de quiz sobre os produtos MF Paris. Apenas a pergunta, sem resposta.' }],
        `Você é um treinador de vendas da MF Paris. Catálogo:\n${produtosTexto}\nCrie perguntas práticas sobre aplicações, diferenciais e argumentos de venda.`
      )
      setQuizPergunta(resp)
    } catch { setQuizPergunta('Qual é o diferencial do Composto Lácteo Horizonte para uma sorveteria?') }
    setQuizLoading(false)
  }

  const responderQuiz = async () => {
    if (!quizResp.trim() || quizLoading) return
    setQuizLoading(true)
    const produtosTexto = PRODUTOS_MF_PARIS.map(p => `${p.nome}: ${p.dif}. Aplicação: ${p.aplicacao}.`).join('\n')
    try {
      const resp = await callAI(
        [{ role: 'user', content: `Pergunta: ${quizPergunta}\nResposta do vendedor: ${quizResp}\n\nAvalie a resposta e dê feedback construtivo em 2-3 linhas.` }],
        `Você é um treinador de vendas da MF Paris. Catálogo:\n${produtosTexto}`
      )
      setQuizFeedback(resp)
    } catch { setQuizFeedback('Não foi possível avaliar agora.') }
    setQuizLoading(false)
  }

  const notaColor = (n: number) => n >= 9 ? 'text-green-600 bg-green-100' : n >= 7 ? 'text-yellow-600 bg-yellow-100' : 'text-red-600 bg-red-100'
  const difColor = (d: string) => d === 'Iniciante' ? 'bg-green-100 text-green-700' : d === 'Médio' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'

  const totalTreinos = historico.length
  const notaMedia = historico.length > 0 ? (historico.reduce((a, b) => a + (b.nota || 0), 0) / historico.length).toFixed(1) : '—'
  const minutosTotais = Math.floor(historico.reduce((a, b) => a + b.duracao, 0) / 60)
  const streak = historico.filter(h => new Date(h.createdAt).toDateString() === new Date().toDateString()).length

  // FEEDBACK PARSED
  let feedbackObj: any = null
  if (feedback) { try { feedbackObj = JSON.parse(feedback) } catch { feedbackObj = { nota, feedback_geral: feedback } } }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gray-50 dark:bg-gray-950 flex flex-col">

      {/* ─── HEADER STICKY ─────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {(aba === 'roleplay' || aba === 'produtos' || aba === 'quiz') && (
              <button onClick={() => { setSessaoAtiva(false); setAba('home') }} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">
                <ArrowLeftIcon className="h-5 w-5" />
              </button>
            )}
            <div className="p-1.5 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg">
              <AcademicCapIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-none">Academia de Vendas</h1>
              <p className="text-[10px] text-gray-400">MF Paris · Treinamento com IA</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {(['home', 'produtos', 'quiz', 'historico'] as Aba[]).map(a => {
              const labels: Record<string, { icon: React.ReactNode; label: string }> = {
                home: { icon: <PlayIcon className="h-4 w-4" />, label: 'Treinar' },
                produtos: { icon: <BookOpenIcon className="h-4 w-4" />, label: 'Produtos' },
                quiz: { icon: <SparklesIcon className="h-4 w-4" />, label: 'Quiz IA' },
                historico: { icon: <ClockIcon className="h-4 w-4" />, label: 'Histórico' },
              }
              const l = labels[a]
              return (
                <button key={a} onClick={() => { setSessaoAtiva(false); setAba(a) }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${aba === a ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                  {l.icon}{l.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ─── HOME ────────────────────────────────────────────── */}
      {aba === 'home' && (
        <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Treinos hoje', value: streak, icon: <FireIcon className="h-4 w-4 text-orange-500" />, color: 'text-orange-600' },
              { label: 'Total de treinos', value: totalTreinos, icon: <ChartBarIcon className="h-4 w-4 text-blue-500" />, color: 'text-blue-600' },
              { label: 'Nota média', value: notaMedia, icon: <TrophyIcon className="h-4 w-4 text-yellow-500" />, color: 'text-yellow-600' },
              { label: 'Minutos treinados', value: minutosTotais, icon: <ClockIcon className="h-4 w-4 text-green-500" />, color: 'text-green-600' },
            ].map(s => (
              <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex items-center gap-2 mb-1">{s.icon}<p className="text-xs text-gray-400">{s.label}</p></div>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Módulos */}
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Módulos de Roleplay</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {MODULOS.map(m => (
                  <button key={m.id} onClick={() => setModuloId(m.id)}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${moduloId === m.id ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 shadow-md' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'}`}>
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-2xl">{m.emoji}</span>
                      <div className="flex items-center gap-1">
                        {moduloId === m.id && <CheckCircleIcon className="h-4 w-4 text-primary-600" />}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${difColor(m.dif)}`}>{m.dif}</span>
                      </div>
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-1">{m.titulo}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{m.desc}</p>
                    <p className="text-[10px] text-primary-600 dark:text-primary-400 font-medium">{m.objetivo}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Lateral: Perfil + Iniciar */}
            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <UserGroupIcon className="h-4 w-4 text-primary-500" />Perfil do Cliente
                </h3>
                <div className="space-y-2">
                  {PERFIS.map(p => (
                    <button key={p.id} onClick={() => setPerfilId(p.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${perfilId === p.id ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{p.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{p.nome}</p>
                          <p className="text-[10px] text-gray-400 truncate">{p.negocio}</p>
                        </div>
                        {perfilId === p.id && <CheckCircleIcon className="h-4 w-4 text-primary-600 flex-shrink-0" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={iniciarSessao} disabled={!moduloId}
                className="w-full py-3.5 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white rounded-xl font-bold shadow-lg hover:shadow-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                <ChatBubbleLeftRightIcon className="h-5 w-5" />
                {moduloId ? 'Iniciar Roleplay' : 'Selecione um módulo'}
              </button>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <LightBulbIcon className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-blue-700 dark:text-blue-300">Digite <strong>ENCERRAR TREINO</strong> a qualquer momento para receber o feedback da IA.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── ROLEPLAY CHAT ───────────────────────────────────── */}
      {aba === 'roleplay' && !feedbackObj && (
        <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 py-4 gap-3">
          {/* Info bar */}
          <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl px-4 py-2.5 border border-gray-200 dark:border-gray-700 shadow-sm flex-shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{PERFIS.find(p => p.id === perfilId)?.emoji}</span>
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{PERFIS.find(p => p.id === perfilId)?.nome}</p>
                <p className="text-xs text-gray-400">{MODULOS.find(m => m.id === moduloId)?.titulo}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <ClockIcon className="h-4 w-4" />{fmt(duracaoAtual)}
              </div>
              <button onClick={() => encerrarSessao(msgs)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors border border-red-200 dark:border-red-800">
                <StopIcon className="h-3.5 w-3.5" />Encerrar
              </button>
            </div>
          </div>

          {/* Chat area */}
          <div ref={chatRef} className="flex-1 overflow-y-auto space-y-3 min-h-0">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <span className="text-xl mr-2 flex-shrink-0 mt-1">{PERFIS.find(p => p.id === perfilId)?.emoji}</span>
                )}
                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${m.role === 'user' ? 'bg-primary-600 text-white rounded-br-sm' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 shadow-sm rounded-bl-sm'}`}>
                  {m.content}
                </div>
                {m.role === 'user' && (
                  <span className="text-xl ml-2 flex-shrink-0 mt-1">🧑‍💼</span>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <span className="text-xl mr-2 flex-shrink-0">{PERFIS.find(p => p.id === perfilId)?.emoji}</span>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 flex items-center gap-1.5">
                  {[0,1,2].map(i => <span key={i} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex gap-2 flex-shrink-0">
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviarMsg()}
              disabled={loading}
              placeholder="Digite sua resposta como vendedor... (Enter para enviar)"
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:opacity-50" />
            <button onClick={enviarMsg} disabled={loading || !input.trim()}
              className="px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl disabled:opacity-40 transition-colors">
              <PaperAirplaneIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* ─── FEEDBACK PÓS-ROLEPLAY ───────────────────────────── */}
      {aba === 'roleplay' && feedbackObj && (
        <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white p-6 text-center">
              <TrophyIcon className="h-12 w-12 mx-auto mb-2" />
              <h2 className="text-2xl font-bold">Roleplay Concluído!</h2>
              <p className="text-green-100 text-sm">Análise de Performance</p>
            </div>
            <div className="p-6 space-y-6">
              {/* Nota */}
              <div className="text-center">
                <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full text-3xl font-bold mb-2 ${notaColor(feedbackObj.nota || 7)}`}>
                  {feedbackObj.nota || 7}
                </div>
                <p className="text-sm text-gray-500">Nota Final / 10</p>
              </div>
              {/* Breakdown */}
              {feedbackObj.abertura && (
                <div className="grid grid-cols-5 gap-2">
                  {['abertura', 'qualificacao', 'apresentacao', 'objecoes', 'fechamento'].map(k => (
                    <div key={k} className="text-center p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <p className={`text-lg font-bold ${notaColor(feedbackObj[k] || 7).split(' ')[0]}`}>{feedbackObj[k] || '—'}</p>
                      <p className="text-[10px] text-gray-400 capitalize">{k}</p>
                    </div>
                  ))}
                </div>
              )}
              {/* Pontos fortes */}
              {feedbackObj.pontos_fortes?.length > 0 && (
                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
                  <h4 className="text-sm font-bold text-green-800 dark:text-green-300 mb-2 flex items-center gap-1"><CheckCircleIcon className="h-4 w-4" />Pontos Fortes</h4>
                  <ul className="space-y-1">{feedbackObj.pontos_fortes.map((p: string, i: number) => <li key={i} className="text-sm text-green-700 dark:text-green-300">• {p}</li>)}</ul>
                </div>
              )}
              {/* Pontos de melhora */}
              {feedbackObj.pontos_melhora?.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
                  <h4 className="text-sm font-bold text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-1"><LightBulbIcon className="h-4 w-4" />Pontos de Melhora</h4>
                  <ul className="space-y-1">{feedbackObj.pontos_melhora.map((p: string, i: number) => <li key={i} className="text-sm text-amber-700 dark:text-amber-300">• {p}</li>)}</ul>
                </div>
              )}
              {/* Feedback geral */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
                <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-1"><SparklesIcon className="h-4 w-4 text-primary-500" />Análise do Coach IA</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{feedbackObj.feedback_geral}</p>
              </div>
              {/* Ações */}
              <div className="flex gap-3">
                <button onClick={() => { setFeedback(null); setNota(null); setMsgs([]); setAba('home') }}
                  className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2">
                  <ArrowPathIcon className="h-4 w-4" />Novo Treino
                </button>
                <button onClick={() => setAba('historico')}
                  className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                  Ver Histórico
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── CATÁLOGO DE PRODUTOS ─────────────────────────────── */}
      {aba === 'produtos' && !produtoVer && (
        <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Catálogo de Produtos MF Paris</h2>
          <p className="text-sm text-gray-500 mb-5">Conheça cada produto e seus argumentos de venda antes de entrar numa ligação.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PRODUTOS_MF_PARIS.map((p, i) => (
              <button key={i} onClick={() => setProdutoVer(p)}
                className="text-left bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:border-primary-400 hover:shadow-md transition-all group">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs px-2 py-0.5 bg-primary-50 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 rounded-full font-medium">{p.categoria}</span>
                  <ChevronRightIcon className="h-4 w-4 text-gray-300 group-hover:text-primary-500 transition-colors" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-1">{p.nome}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{p.destaque}</p>
                <p className="text-xs font-bold text-green-600">{p.preco}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* PRODUTO DETALHE */}
      {aba === 'produtos' && produtoVer && (
        <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
          <button onClick={() => setProdutoVer(null)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
            <ArrowLeftIcon className="h-4 w-4" /> Voltar ao catálogo
          </button>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-br from-primary-500 to-primary-700 p-6 text-white">
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{produtoVer.categoria}</span>
              <h2 className="text-xl font-bold mt-2">{produtoVer.nome}</h2>
              <p className="text-primary-200 text-sm mt-1">{produtoVer.destaque}</p>
            </div>
            <div className="p-6 space-y-4">
              {[
                { label: '💰 Preço Referência', value: produtoVer.preco },
                { label: '🍳 Aplicações', value: produtoVer.aplicacao },
                { label: '⭐ Diferencial de Venda', value: produtoVer.dif },
              ].map(row => (
                <div key={row.label} className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">{row.label}</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">{row.value}</p>
                </div>
              ))}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <p className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-1">💡 Argumento de Venda Sugerido</p>
                <p className="text-sm text-blue-800 dark:text-blue-200">"Nosso {produtoVer.nome.split(' ').slice(0,3).join(' ')} tem {produtoVer.dif.toLowerCase()}, o que garante {produtoVer.destaque.toLowerCase()} para o seu negócio."</p>
              </div>
              <button
                onClick={() => { setModuloId('livre'); setAba('home') }}
                className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2">
                <ChatBubbleLeftRightIcon className="h-4 w-4" />Praticar com este produto no Roleplay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── QUIZ IA ──────────────────────────────────────────── */}
      {aba === 'quiz' && (
        <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Quiz de Produtos</h2>
            <p className="text-sm text-gray-500">Teste seus conhecimentos. A IA avalia e dá feedback personalizado.</p>
          </div>
          {!quizAtivo && !quizPergunta && (
            <button onClick={() => { setQuizAtivo(true); gerarQuiz() }}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-primary-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2">
              <SparklesIcon className="h-5 w-5" />Gerar Pergunta com IA
            </button>
          )}
          {quizLoading && !quizPergunta && (
            <div className="text-center py-8"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-2" /><p className="text-sm text-gray-400">Gerando pergunta...</p></div>
          )}
          {quizPergunta && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border-2 border-primary-200 dark:border-primary-800 shadow-sm">
                <div className="flex items-start gap-2 mb-3">
                  <SparklesIcon className="h-5 w-5 text-primary-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-relaxed">{quizPergunta}</p>
                </div>
                {!quizFeedback && (
                  <div className="flex gap-2">
                    <input value={quizResp} onChange={e => setQuizResp(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && responderQuiz()}
                      placeholder="Sua resposta..."
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                    <button onClick={responderQuiz} disabled={quizLoading || !quizResp.trim()}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-primary-700 transition-colors">
                      {quizLoading ? '...' : 'Enviar'}
                    </button>
                  </div>
                )}
              </div>
              {quizFeedback && (
                <div className="space-y-3">
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                    <p className="text-xs font-bold text-green-700 dark:text-green-300 mb-1 flex items-center gap-1"><CheckCircleIcon className="h-4 w-4" />Feedback do Coach IA</p>
                    <p className="text-sm text-green-800 dark:text-green-200 leading-relaxed">{quizFeedback}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setQuizPergunta(''); setQuizResp(''); setQuizFeedback(null); gerarQuiz() }}
                      className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5">
                      <ArrowPathIcon className="h-4 w-4" />Próxima Pergunta
                    </button>
                    <button onClick={() => { setQuizPergunta(''); setQuizResp(''); setQuizFeedback(null); setQuizAtivo(false) }}
                      className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                      Encerrar Quiz
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── HISTÓRICO ────────────────────────────────────────── */}
      {aba === 'historico' && !sessaoHistoricoVer && (
        <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Histórico de Treinamentos</h2>
          {historico.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <AcademicCapIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">Nenhum treino realizado ainda.</p>
              <button onClick={() => setAba('home')} className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">Começar agora</button>
            </div>
          ) : (
            <div className="space-y-3">
              {historico.map(s => {
                const m = MODULOS.find(x => x.id === s.modulo)
                const p = PERFIS.find(x => x.id === s.perfilId)
                let fb: any = null
                try { fb = JSON.parse(s.feedback) } catch { fb = null }
                return (
                  <button key={s.id} onClick={() => setSessaoHistoricoVer(s)}
                    className="w-full text-left bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all group">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0 ${notaColor(s.nota || 7)}`}>{s.nota || '?'}</div>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{m?.emoji} {m?.titulo}</p>
                          <p className="text-xs text-gray-400">{p?.emoji} {p?.nome} · {Math.floor(s.duracao / 60)}min · {new Date(s.createdAt).toLocaleDateString('pt-BR')}</p>
                        </div>
                      </div>
                      <ChevronRightIcon className="h-4 w-4 text-gray-300 group-hover:text-primary-500 transition-colors" />
                    </div>
                    {fb?.feedback_geral && <p className="text-xs text-gray-500 mt-2 line-clamp-1">{fb.feedback_geral}</p>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* DETALHE HISTÓRICO */}
      {aba === 'historico' && sessaoHistoricoVer && (
        <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
          <button onClick={() => setSessaoHistoricoVer(null)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
            <ArrowLeftIcon className="h-4 w-4" /> Voltar ao histórico
          </button>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg p-6 space-y-4">
            {(() => {
              const m = MODULOS.find(x => x.id === sessaoHistoricoVer.modulo)
              const p = PERFIS.find(x => x.id === sessaoHistoricoVer.perfilId)
              let fb: any = null
              try { fb = JSON.parse(sessaoHistoricoVer.feedback) } catch { fb = null }
              return (
                <>
                  <div className="flex items-center gap-3">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold ${notaColor(sessaoHistoricoVer.nota || 7)}`}>{sessaoHistoricoVer.nota || '?'}</div>
                    <div>
                      <p className="font-bold text-gray-900 dark:text-gray-100">{m?.emoji} {m?.titulo}</p>
                      <p className="text-sm text-gray-400">{p?.emoji} {p?.nome} · {Math.floor(sessaoHistoricoVer.duracao / 60)}min · {new Date(sessaoHistoricoVer.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                    </div>
                  </div>
                  {fb?.feedback_geral && (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
                      <p className="text-xs font-bold text-gray-500 mb-1">Análise do Coach</p>
                      <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{fb.feedback_geral}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-2">Transcrição ({sessaoHistoricoVer.msgs.length} mensagens)</p>
                    <div className="max-h-64 overflow-y-auto space-y-2 border border-gray-200 dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-gray-900">
                      {sessaoHistoricoVer.msgs.map((msg, i) => (
                        <p key={i} className={`text-xs ${msg.role === 'user' ? 'text-primary-700 dark:text-primary-300' : 'text-gray-600 dark:text-gray-400'}`}>
                          <span className="font-bold">{msg.role === 'user' ? '🧑‍💼 Você' : `${p?.emoji} ${p?.nome?.split(' ')[0]}`}:</span> {msg.content}
                        </p>
                      ))}
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
