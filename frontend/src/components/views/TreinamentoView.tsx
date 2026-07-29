import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
  Cog6ToothIcon,
} from '@heroicons/react/24/outline'
import { callAI } from '../../lib/gemini'
import type { AIMessage } from '../../lib/gemini'
import { saveRoleplaySession, fetchRoleplayHistory, fetchRoleplayHistoryGerente } from '../../lib/botApi'
import { fetchModulosTreinamento, fetchPerfisTreinamento, fetchVendedores } from '../../lib/database'
import { CATALOGO_PRODUTOS, MANIFESTO_COMERCIAL_OKEYLAC, REGRAS_MF_PARIS, TEXTO_CATALOGO } from '../../data/aiContext'
import type { Vendedor, Produto, ModuloTreinamento, PerfilTreinamento } from '../../types'
import ConfiguracaoAcademiaView from './ConfiguracaoAcademiaView'

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

type Aba = 'home' | 'roleplay' | 'produtos' | 'quiz' | 'historico' | 'gerente' | 'config'

const DEFAULT_MODULES: ModuloTreinamento[] = [
  { id: 1, ordem: 0, ativo: true, titulo: 'Abertura & Conexão', descricao: 'Captar atenção nos primeiros 30s e criar rapport', objetivo: 'Objetivo: o cliente concorda em ouvir a proposta.', emoji: '📞', dificuldade: 'Iniciante', promptInstrucoes: '', createdAt: '', updatedAt: '' },
  { id: 2, ordem: 1, ativo: true, titulo: 'Qualificação BANT', descricao: 'Descobrir orçamento, autoridade, necessidade e timing', objetivo: 'Objetivo: entender o perfil completo antes de propor.', emoji: '🔍', dificuldade: 'Médio', promptInstrucoes: '', createdAt: '', updatedAt: '' },
  { id: 3, ordem: 2, ativo: true, titulo: 'Objeção: Preço', descricao: 'Lidar com "está caro" e "o concorrente é mais barato"', objetivo: 'Objetivo: reverter objeção de preço e avançar.', emoji: '💸', dificuldade: 'Médio', promptInstrucoes: '', createdAt: '', updatedAt: '' },
  { id: 4, ordem: 3, ativo: true, titulo: 'Objeção: Prazo & Frete', descricao: 'Negociar prazos de pagamento e condições CIF/FOB', objetivo: 'Objetivo: fechar condições logísticas favoráveis.', emoji: '🚚', dificuldade: 'Avançado', promptInstrucoes: '', createdAt: '', updatedAt: '' },
  { id: 5, ordem: 4, ativo: true, titulo: 'Solicitação de Amostra', descricao: 'Converter interesse em amostra física com data de retorno', objetivo: 'Objetivo: cliente aceita receber amostra com prazo de feedback.', emoji: '🧪', dificuldade: 'Médio', promptInstrucoes: '', createdAt: '', updatedAt: '' },
  { id: 6, ordem: 5, ativo: true, titulo: 'Fechamento & Próximo Passo', descricao: 'Propor ação concreta sem ser agressivo', objetivo: 'Objetivo: cliente confirma pedido ou agenda próxima etapa.', emoji: '🤝', dificuldade: 'Avançado', promptInstrucoes: '', createdAt: '', updatedAt: '' },
  { id: 7, ordem: 6, ativo: true, titulo: 'Pós-Venda & Fidelização', descricao: 'Garantir satisfação e abrir oportunidade de recompra', objetivo: 'Objetivo: cliente satisfeito e nova compra agendada.', emoji: '🌟', dificuldade: 'Médio', promptInstrucoes: '', createdAt: '', updatedAt: '' },
  { id: 8, ordem: 7, ativo: true, titulo: 'Roleplay Livre', descricao: 'Simule uma call completa do zero ao fechamento', objetivo: 'Objetivo: conduzir toda a jornada comercial.', emoji: '🎯', dificuldade: 'Avançado', promptInstrucoes: '', createdAt: '', updatedAt: '' },
]

const DEFAULT_PROFILES: PerfilTreinamento[] = [
  { id: 1, ordem: 0, ativo: true, nome: 'João da Silva', negocio: 'Panificadora Estrela', emoji: '🥖', dor: 'custo de insumos alto e falta de tempo', estilo: 'direto, impaciente, foco total em preço e prazo de entrega', promptInstrucoes: '', createdAt: '', updatedAt: '' },
  { id: 2, ordem: 1, ativo: true, nome: 'Carlos Mendes', negocio: 'Sorveteria Gelada', emoji: '🍦', dor: 'qualidade inconsistente dos fornecedores atuais', estilo: 'técnico, detalhista, compara ingredientes e laudos', promptInstrucoes: '', createdAt: '', updatedAt: '' },
  { id: 3, ordem: 2, ativo: true, nome: 'Márcio Ferreira', negocio: 'Indústria FrioPar', emoji: '🏭', dor: 'processo de compra burocrático e múltiplos aprovadores', estilo: 'corporativo, frio, pede cotação formal e prazo de entrega garantido', promptInstrucoes: '', createdAt: '', updatedAt: '' },
  { id: 4, ordem: 3, ativo: true, nome: 'Ana Lima', negocio: 'Confeitaria Premium Belle', emoji: '🧁', dor: 'clientes exigentes que pedem produtos especiais', estilo: 'sofisticada, exige excelência, pergunta sobre origem e diferenciais', promptInstrucoes: '', createdAt: '', updatedAt: '' },
  { id: 5, ordem: 4, ativo: true, nome: 'Roberto Costa', negocio: 'Restaurante Sabor Mineiro', emoji: '🍽️', dor: 'volume alto mas margem apertada', estilo: 'negociador nato, sempre pede desconto e prazo maior', promptInstrucoes: '', createdAt: '', updatedAt: '' },
]

const PRODUTOS_MF_PARIS = CATALOGO_PRODUTOS.map(p => ({
  nome: p.nome,
  categoria: `${p.linha} — ${p.categoria}`,
  destaque: `Desempenho superior em ${p.aplicacoes.toLowerCase()}`,
  preco: 'Sob consulta',
  aplicacao: p.aplicacoes,
  dif: p.proteina && p.gordura
    ? `proteína ${p.proteina} e gordura ${p.gordura}`
    : `formulação ${p.categoria.toLowerCase()} indicada para ${p.aplicacoes.toLowerCase()}`,
}))

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
  const [modulos, setModulos] = useState<ModuloTreinamento[]>(DEFAULT_MODULES)
  const [perfis, setPerfis] = useState<PerfilTreinamento[]>(DEFAULT_PROFILES)
  const [moduloId, setModuloId] = useState<number | null>(DEFAULT_MODULES[0]?.id ?? null)
  const [perfilId, setPerfilId] = useState<number | null>(DEFAULT_PROFILES[0]?.id ?? null)
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
  const [gerenteSessoes, setGerenteSessoes] = useState<any[]>([])
  const [gerenteVendedores, setGerenteVendedores] = useState<Vendedor[]>([])
  const [filtroDataInicio, setFiltroDataInicio] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')
  const [filtroVendedorId, setFiltroVendedorId] = useState('')
  const [filtroNotaMin, setFiltroNotaMin] = useState('')
  const [filtroNotaMax, setFiltroNotaMax] = useState('')
  const [filtroModuloId, setFiltroModuloId] = useState('')
  const chatRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchRoleplayHistory(vendedor.id).then(r => {
      if (!r.sessoes) return
      setHistorico(r.sessoes.map((s: any) => ({
        id: String(s.id),
        modulo: s.modulo != null ? String(s.modulo) : '',
        perfilId: s.perfil_id != null ? String(s.perfil_id) : '',
        msgs: Array.isArray(s.mensagens) ? s.mensagens : [],
        duracao: s.duracao_segundos || 0,
        nota: s.nota ?? null,
        feedback: typeof s.feedback === 'string' ? s.feedback : JSON.stringify(s.feedback || {}),
        createdAt: s.created_at,
      })))
    })
  }, [vendedor.id])

  useEffect(() => {
    if (aba !== 'gerente' || !isGerente) return
    Promise.all([fetchRoleplayHistoryGerente(), fetchVendedores().catch(() => [])]).then(([r, v]) => {
      setGerenteSessoes(r.sessoes || [])
      setGerenteVendedores(v || [])
    })
  }, [aba, isGerente])

  useEffect(() => {
    Promise.all([
      fetchModulosTreinamento().catch(() => DEFAULT_MODULES),
      fetchPerfisTreinamento().catch(() => DEFAULT_PROFILES),
    ]).then(([m, p]) => {
      const ativosM = m.filter(x => x.ativo).sort((a, b) => a.ordem - b.ordem)
      const ativosP = p.filter(x => x.ativo).sort((a, b) => a.ordem - b.ordem)
      setModulos(ativosM)
      setPerfis(ativosP)
      setModuloId(prev => (prev && ativosM.find(x => x.id === prev)) ? prev : (ativosM[0]?.id ?? null))
      setPerfilId(prev => (prev && ativosP.find(x => x.id === prev)) ? prev : (ativosP[0]?.id ?? null))
    })
  }, [])

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
    const modulo = modulos.find(m => m.id === moduloId)
    const perfil = perfis.find(p => p.id === perfilId)
    const contextoComercial = `${MANIFESTO_COMERCIAL_OKEYLAC}\n\n${REGRAS_MF_PARIS}`
    const produtosCrmTexto = produtos
      .map(p => `- ${p.nome} (${p.categoria}) | ${p.descricao || ''} | ${p.preco > 0 ? `R$ ${p.preco.toFixed(2)}/${p.unidade}` : 'preço sob consulta'} | SKU: ${p.sku || '-'} | peso: ${p.pesoKg ?? '-'}kg | ${p.ativo ? 'ativo' : 'inativo'}`)
      .join('\n')
    const instrucoesModulo = modulo?.promptInstrucoes ? `INSTRUÇÕES ESPECÍFICAS DESTE MÓDULO:\n${modulo.promptInstrucoes}\n` : ''
    const instrucoesPerfil = perfil?.promptInstrucoes ? `INSTRUÇÕES ESPECÍFICAS DESTE PERFIL:\n${perfil.promptInstrucoes}\n` : ''
    return `Você é um CLIENTE em um roleplay de treinamento de vendas para vendedores da MF Paris / Okeylac, distribuidora de alimentos premium.

PERSONAGEM: ${perfil?.nome} (${perfil?.negocio})
PERFIL: ${perfil?.estilo}
DOR PRINCIPAL: ${perfil?.dor}

MÓDULO DO TREINO: "${modulo?.titulo}"
${modulo?.objetivo}

CATÁLOGO DE PRODUTOS MF PARIS / OKEYLAC (você pode mencionar interesse em alguns):
${TEXTO_CATALOGO}

PRODUTOS CADASTRADOS NO CRM (referência real de todos os produtos):
${produtosCrmTexto}

REGRAS DO ROLEPLAY:
1. Fique SEMPRE no personagem. Não quebre o personagem.
2. Responda de forma realista — seja difícil de convencer, coloque objeções genuínas.
3. Se o vendedor fizer perguntas inteligentes de qualificação, responda com detalhes do seu negócio.
4. Se ele apresentar argumentos fracos, mostre resistência.
5. Se ele apresentar argumentos fortes e benefícios reais, demonstre interesse gradual.
6. Você conhece os concorrentes do seu segmento e pode comparar preços, mas valoriza resultado, segurança e suporte.
7. Quando o vendedor digitar "ENCERRAR TREINO", saia do personagem e dê um FEEDBACK DETALHADO em JSON com este formato EXATO:
{"nota": 6, "abertura": 5, "qualificacao": 6, "apresentacao": 7, "objecoes": 5, "fechamento": 6, "pontos_fortes": ["..."], "pontos_melhora": ["..."], "feedback_geral": "..."}

RUBRICA DE NOTA — seja RIGOROSO e use TODA a escala de 0 a 10. NOTAS GENÉRICAS (7/8/9 automáticas) SÃO PROIBIDAS:
- 10: execução exemplar, objetivo totalmente atingido, argumentos afiados, conexão genuína e próximo passo claro. Só dê 10 se for praticamente perfeito.
- 8-9: muito bom, com pouquíssimas falhas e objetivo bem atingido.
- 5-7: mediano, atingiu parcialmente o objetivo, erros de técnicas, argumentos rasos ou falta de qualificação.
- 3-4: ruim, muitos erros, despreparo, não conectou ou não avançou no objetivo.
- 0-2: péssimo, sem conexão, sem argumento, sem técnicas ou abordagem inadequada.

REGRAS PARA A NOTA FINAL:
- Se o vendedor não atingir o objetivo do módulo, a nota final NÃO pode ser maior que 6.
- Cada erro de qualificação, argumento fraco, resposta genérica ou falta de conteúdo do catálogo desconta 1-2 pontos.
- Respostas muito curtas ("ok", "tudo bem?", "qual seu preço?") sem contexto: descontar.
- A nota final é uma média PONDERADA dos critérios, com ênfase no que o módulo exige.
- Você DEVE justificar a nota no "feedback_geral", citando exemplos reais do transcript.

CONTEXTO COMERCIAL E REGRAS QUE OS VENDEDORES SEGUEM (você reage a eles):
${contextoComercial}

${instrucoesModulo}${instrucoesPerfil}
Comece a cena: você acabou de receber uma mensagem no WhatsApp de um vendedor da MF Paris / Okeylac. Responda como se estivesse digitando no celular, de forma natural, objetiva e no ritmo de uma conversa por mensagem.`
  }, [moduloId, perfilId, modulos, perfis, produtos])

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
      setMsgs([{ role: 'assistant', content: '� *nova mensagem* Olá, quem é?', ts: Date.now() }])
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
    let notaFinal: number | null = null
    let feedbackFinal = JSON.stringify({ nota: null, feedback_geral: 'Não foi possível avaliar a sessão. Tente novamente.' })
    try {
      const transcript = msgsFinal.map(m => `${m.role === 'user' ? 'VENDEDOR' : 'CLIENTE'}: ${m.content}`).join('\n')
      const resp = await callAI(
        [{ role: 'user', content: `TRANSCRIPT DO ROLEPLAY:\n${transcript}\n\nAGORA DÊ O FEEDBACK DETALHADO EM JSON conforme instrução.` }],
        sistemaTreinamento()
      )
      const jsonMatch = resp.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const avaliacao = JSON.parse(jsonMatch[0])
        notaFinal = typeof avaliacao.nota === 'number' ? avaliacao.nota : null
        feedbackFinal = JSON.stringify(avaliacao)
      }
    } catch { /* mantém fallback */ }
    setNota(notaFinal)
    setFeedback(feedbackFinal)
    const sessao: SessaoTreinamento = {
      id: Date.now().toString(), modulo: String(moduloId), perfilId: String(perfilId),
      msgs: msgsFinal, duracao, nota: notaFinal,
      feedback: feedbackFinal, createdAt: new Date().toISOString()
    }
    const novoHist = [sessao, ...historico]
    setHistorico(novoHist)
    const perfil = perfis.find(p => p.id === perfilId)
    try { await saveRoleplaySession(vendedor.id, sessao, perfil?.nome) } catch { /* mantém localmente */ }
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

  const notaColor = (n: number | null) => {
    const v = n ?? 0
    return v >= 9 ? 'text-green-600 bg-green-100' : v >= 7 ? 'text-yellow-600 bg-yellow-100' : 'text-red-600 bg-red-100'
  }
  const difColor = (d: string) => d === 'Iniciante' ? 'bg-green-100 text-green-700' : d === 'Médio' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'

  const totalTreinos = historico.length
  const notaMedia = historico.length > 0 ? (historico.reduce((a, b) => a + (b.nota || 0), 0) / historico.length).toFixed(1) : '—'
  const minutosTotais = Math.floor(historico.reduce((a, b) => a + b.duracao, 0) / 60)
  const streak = historico.filter(h => new Date(h.createdAt).toDateString() === new Date().toDateString()).length

  const gerenteFiltrado = useMemo(() => {
    return gerenteSessoes.filter((s: any) => {
      if (filtroVendedorId && String(s.vendedor_id) !== filtroVendedorId) return false
      if (filtroModuloId && String(s.modulo) !== filtroModuloId) return false
      if (filtroNotaMin !== '' && (s.nota == null || Number(s.nota) < Number(filtroNotaMin))) return false
      if (filtroNotaMax !== '' && (s.nota == null || Number(s.nota) > Number(filtroNotaMax))) return false
      if (filtroDataInicio && s.data && s.data < filtroDataInicio) return false
      if (filtroDataFim && s.data && s.data > filtroDataFim) return false
      return true
    })
  }, [gerenteSessoes, filtroVendedorId, filtroModuloId, filtroNotaMin, filtroNotaMax, filtroDataInicio, filtroDataFim])

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
            {(['home', 'produtos', 'quiz', 'historico', ...(isGerente ? ['gerente', 'config'] : [])] as Aba[]).map(a => {
              const labels: Record<string, { icon: React.ReactNode; label: string }> = {
                home: { icon: <PlayIcon className="h-4 w-4" />, label: 'Treinar' },
                produtos: { icon: <BookOpenIcon className="h-4 w-4" />, label: 'Produtos' },
                quiz: { icon: <SparklesIcon className="h-4 w-4" />, label: 'Quiz IA' },
                historico: { icon: <ClockIcon className="h-4 w-4" />, label: 'Histórico' },
                gerente: { icon: <ChartBarIcon className="h-4 w-4" />, label: 'Gerente' },
                config: { icon: <Cog6ToothIcon className="h-4 w-4" />, label: 'Config' },
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
                {modulos.map(m => (
                  <button key={m.id} onClick={() => setModuloId(m.id)}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${moduloId === m.id ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 shadow-md' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'}`}>
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-2xl">{m.emoji}</span>
                      <div className="flex items-center gap-1">
                        {moduloId === m.id && <CheckCircleIcon className="h-4 w-4 text-primary-600" />}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${difColor(m.dificuldade)}`}>{m.dificuldade}</span>
                      </div>
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-1">{m.titulo}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{m.descricao}</p>
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
                  {perfis.map(p => (
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
              <span className="text-2xl">{perfis.find(p => p.id === perfilId)?.emoji}</span>
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{perfis.find(p => p.id === perfilId)?.nome}</p>
                <p className="text-xs text-gray-400">{modulos.find(m => m.id === moduloId)?.titulo}</p>
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
                  <span className="text-xl mr-2 flex-shrink-0 mt-1">{perfis.find(p => p.id === perfilId)?.emoji}</span>
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
                <span className="text-xl mr-2 flex-shrink-0">{perfis.find(p => p.id === perfilId)?.emoji}</span>
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
                <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full text-3xl font-bold mb-2 ${notaColor(feedbackObj.nota)}`}>
                  {feedbackObj.nota ?? '?'}
                </div>
                <p className="text-sm text-gray-500">Nota Final / 10</p>
              </div>
              {/* Breakdown */}
              {feedbackObj.abertura && (
                <div className="grid grid-cols-5 gap-2">
                  {['abertura', 'qualificacao', 'apresentacao', 'objecoes', 'fechamento'].map(k => (
                    <div key={k} className="text-center p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <p className={`text-lg font-bold ${notaColor(feedbackObj[k] ?? 0).split(' ')[0]}`}>{feedbackObj[k] != null ? feedbackObj[k] : '—'}</p>
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
                onClick={() => { const livre = modulos.find(m => m.titulo.toLowerCase().includes('livre')) || modulos[modulos.length - 1]; setModuloId(livre?.id || null); setAba('home') }}
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
                const m = modulos.find(x => String(x.id) === s.modulo)
                const p = perfis.find(x => String(x.id) === s.perfilId)
                let fb: any = null
                try { fb = JSON.parse(s.feedback) } catch { fb = null }
                return (
                  <button key={s.id} onClick={() => setSessaoHistoricoVer(s)}
                    className="w-full text-left bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all group">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0 ${notaColor(s.nota)}`}>{s.nota ?? '?'}</div>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{m?.emoji} {m?.titulo}</p>
                          <p className="text-xs text-gray-400">{p?.emoji} {p?.nome} · {Math.floor(s.duracao / 60)}min · Início {new Date(new Date(s.createdAt).getTime() - s.duracao * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
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
              const m = modulos.find(x => String(x.id) === sessaoHistoricoVer.modulo)
              const p = perfis.find(x => String(x.id) === sessaoHistoricoVer.perfilId)
              let fb: any = null
              try { fb = JSON.parse(sessaoHistoricoVer.feedback) } catch { fb = null }
              return (
                <>
                  <div className="flex items-center gap-3">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold ${notaColor(sessaoHistoricoVer.nota)}`}>{sessaoHistoricoVer.nota ?? '?'}</div>
                    <div>
                      <p className="font-bold text-gray-900 dark:text-gray-100">{m?.emoji} {m?.titulo}</p>
                      <p className="text-sm text-gray-400">{p?.emoji} {p?.nome} · {Math.floor(sessaoHistoricoVer.duracao / 60)}min · Início {new Date(new Date(sessaoHistoricoVer.createdAt).getTime() - sessaoHistoricoVer.duracao * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · Fim {new Date(sessaoHistoricoVer.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
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
      {aba === 'gerente' && (
        <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Histórico de Treinamentos — Visão Gerente</h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Data início</label>
                <input type="date" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Data fim</label>
                <input type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Vendedor</label>
                <select value={filtroVendedorId} onChange={e => setFiltroVendedorId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
                  <option value="">Todos</option>
                  {gerenteVendedores.map(v => <option key={v.id} value={String(v.id)}>{v.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nota mín</label>
                <input type="number" min={0} max={10} value={filtroNotaMin} onChange={e => setFiltroNotaMin(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nota máx</label>
                <input type="number" min={0} max={10} value={filtroNotaMax} onChange={e => setFiltroNotaMax(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Módulo</label>
                <select value={filtroModuloId} onChange={e => setFiltroModuloId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
                  <option value="">Todos</option>
                  {modulos.map(m => <option key={m.id} value={String(m.id)}>{m.titulo}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-gray-700 text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Vendedor</th>
                    <th className="px-4 py-3">Módulo</th>
                    <th className="px-4 py-3">Perfil</th>
                    <th className="px-4 py-3">Nota</th>
                    <th className="px-4 py-3">Duração</th>
                    <th className="px-4 py-3">Início</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {gerenteFiltrado.map((s: any) => {
                    const m = modulos.find(x => String(x.id) === String(s.modulo))
                    const v = gerenteVendedores.find(v => v.id === Number(s.vendedor_id))
                    return (
                      <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 whitespace-nowrap">{s.data ? new Date(s.data).toLocaleDateString('pt-BR') : '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{v?.nome || s.vendedor_nome || `ID ${s.vendedor_id}`}</td>
                        <td className="px-4 py-3">{m?.emoji} {m?.titulo || s.modulo}</td>
                        <td className="px-4 py-3">{s.perfil_nome || '—'}</td>
                        <td className="px-4 py-3"><span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-xs ${notaColor(s.nota)}`}>{s.nota ?? '?'}</span></td>
                        <td className="px-4 py-3 whitespace-nowrap">{Math.floor((s.duracao_segundos || 0) / 60)}min</td>
                        <td className="px-4 py-3 whitespace-nowrap">{new Date(new Date(s.created_at).getTime() - (s.duracao_segundos || 0) * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {gerenteFiltrado.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">Nenhum treinamento encontrado</p>}
          </div>
        </div>
      )}

      {aba === 'config' && (
        <ConfiguracaoAcademiaView
          isGerente={isGerente}
          modulos={modulos}
          perfis={perfis}
          setModulos={setModulos}
          setPerfis={setPerfis}
        />
      )}
    </div>
  )
}
