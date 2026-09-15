import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ConversationProvider } from '@elevenlabs/react'
import {
  AcademicCapIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  LightBulbIcon,
  PaperAirplaneIcon,
  PhoneIcon,
  PlayIcon,
  SparklesIcon,
  StopIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline'
import { callAI } from '../lib/gemini'
import type { AIMessage } from '../lib/gemini'
import { CATALOGO_PRODUTOS, MANIFESTO_COMERCIAL_OKEYLAC, REGRAS_MF_PARIS, TEXTO_CATALOGO } from '../data/aiContext'
import { LigarView } from './views/TreinamentoView'
import type { SessaoTreinamento } from './views/TreinamentoView'
import type { ModuloTreinamento, PerfilTreinamento } from '../types'

const BOT_URL = (import.meta as any).env?.VITE_BOT_URL || 'http://localhost:3002'

interface MsgChat { role: 'user' | 'assistant'; content: string; ts: number }

interface SessaoCandidato {
  id: string | number
  modulo: string
  perfilNome: string
  duracao: number
  nota: number | null
  createdAt: string
}

type Fase = 'validando' | 'invalido' | 'home' | 'roleplay' | 'avaliando' | 'resultado'
type Aba = 'home' | 'ligar' | 'produtos' | 'quiz'

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

export default function AcademiaCandidatoView() {
  const [fase, setFase] = useState<Fase>('validando')
  const [aba, setAba] = useState<Aba>('home')
  const [erroAcesso, setErroAcesso] = useState('')
  const [nomeCandidato, setNomeCandidato] = useState('')
  const [expiraEm, setExpiraEm] = useState('')
  const [token, setToken] = useState('')

  const [modulos, setModulos] = useState<ModuloTreinamento[]>([])
  const [perfis, setPerfis] = useState<PerfilTreinamento[]>([])
  const [moduloId, setModuloId] = useState<number | null>(null)
  const [perfilId, setPerfilId] = useState<number | null>(null)

  const [msgs, setMsgs] = useState<MsgChat[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [tempoInicio, setTempoInicio] = useState(0)
  const [duracaoAtual, setDuracaoAtual] = useState(0)
  const [nota, setNota] = useState<number | null>(null)
  const [feedbackObj, setFeedbackObj] = useState<any>(null)
  const [historico, setHistorico] = useState<SessaoCandidato[]>([])

  // Produtos / Quiz
  const [produtoVer, setProdutoVer] = useState<typeof PRODUTOS_MF_PARIS[0] | null>(null)
  const [quizAtivo, setQuizAtivo] = useState(false)
  const [quizPergunta, setQuizPergunta] = useState('')
  const [quizResp, setQuizResp] = useState('')
  const [quizFeedback, setQuizFeedback] = useState<string | null>(null)
  const [quizLoading, setQuizLoading] = useState(false)

  const chatRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Valida o token e carrega módulos/perfis + histórico do candidato
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token') || ''
    if (!t) {
      setErroAcesso('Link inválido — peça um novo link ao responsável pelo seu processo seletivo.')
      setFase('invalido')
      return
    }
    setToken(t)
    ;(async () => {
      try {
        const r = await fetch(`${BOT_URL}/api/academia/validar?token=${encodeURIComponent(t)}`)
        const j = await r.json()
        if (!j.valido) {
          setErroAcesso(j.error || 'Link inválido ou expirado.')
          setFase('invalido')
          return
        }
        setNomeCandidato(j.nomeCandidato)
        setExpiraEm(j.expiraEm)

        const [cfg, hist] = await Promise.all([
          fetch(`${BOT_URL}/api/academia/config?token=${encodeURIComponent(t)}`).then(x => x.json()).catch(() => null),
          fetch(`${BOT_URL}/api/academia/sessoes?token=${encodeURIComponent(t)}`).then(x => x.json()).catch(() => null),
        ])
        const ms: ModuloTreinamento[] = (cfg?.modulos || []).map((m: any) => ({
          id: m.id, ordem: m.ordem ?? 0, ativo: m.ativo ?? true, titulo: m.titulo,
          descricao: m.descricao, objetivo: m.objetivo, emoji: m.emoji,
          dificuldade: m.dificuldade, promptInstrucoes: m.prompt_instrucoes,
          createdAt: '', updatedAt: '',
        }))
        const ps: PerfilTreinamento[] = (cfg?.perfis || []).map((p: any) => ({
          id: p.id, ordem: p.ordem ?? 0, ativo: p.ativo ?? true, nome: p.nome,
          negocio: p.negocio, emoji: p.emoji, dor: p.dor, estilo: p.estilo,
          promptInstrucoes: p.prompt_instrucoes, createdAt: '', updatedAt: '',
        }))
        setModulos(ms)
        setPerfis(ps)
        if (ms.length) setModuloId(ms[0].id)
        if (ps.length) setPerfilId(ps[0].id)

        if (hist?.sessoes) {
          setHistorico(hist.sessoes.map((s: any) => ({
            id: s.id, modulo: s.modulo || '', perfilNome: s.perfil_nome || '',
            duracao: s.duracao_segundos || 0, nota: s.nota ?? null, createdAt: s.created_at,
          })))
        }
        setFase('home')
      } catch {
        setErroAcesso('Não foi possível validar seu acesso. Verifique a internet e tente novamente.')
        setFase('invalido')
      }
    })()
  }, [])

  // Cronômetro da sessão de texto
  useEffect(() => {
    if (fase === 'roleplay') {
      timerRef.current = setInterval(() => setDuracaoAtual(Math.floor((Date.now() - tempoInicio) / 1000)), 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fase, tempoInicio])

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [msgs])

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
  const notaColor = (n: number | null) => (n ?? 0) >= 9 ? 'text-green-600 bg-green-100' : (n ?? 0) >= 7 ? 'text-yellow-600 bg-yellow-100' : 'text-red-600 bg-red-100'
  const difColor = (d?: string) => d === 'Iniciante' ? 'bg-green-100 text-green-700' : d === 'Médio' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'

  const sistemaTreinamento = useCallback(() => {
    const modulo = modulos.find(m => m.id === moduloId)
    const perfil = perfis.find(p => p.id === perfilId)
    const instrucoesModulo = modulo?.promptInstrucoes ? `INSTRUÇÕES ESPECÍFICAS DESTE MÓDULO:\n${modulo.promptInstrucoes}\n` : ''
    const instrucoesPerfil = perfil?.promptInstrucoes ? `INSTRUÇÕES ESPECÍFICAS DESTE PERFIL:\n${perfil.promptInstrucoes}\n` : ''
    return `Você é um CLIENTE em um roleplay de avaliação de vendas para candidatos a vendedor da MF Paris / Okeylac, distribuidora de alimentos premium.

PERSONAGEM: ${perfil?.nome} (${perfil?.negocio})
PERFIL: ${perfil?.estilo}
DOR PRINCIPAL: ${perfil?.dor}

MÓDULO DO TREINO: "${modulo?.titulo}"
${modulo?.objetivo || ''}

CATÁLOGO DE PRODUTOS MF PARIS / OKEYLAC (você pode mencionar interesse em alguns):
${TEXTO_CATALOGO}

REGRAS DO ROLEPLAY:
1. Fique SEMPRE no personagem. Não quebre o personagem.
2. Responda de forma realista — seja difícil de convencer, coloque objeções genuínas.
3. Se o candidato fizer perguntas inteligentes de qualificação, responda com detalhes do seu negócio.
4. Se ele apresentar argumentos fracos, mostre resistência.
5. Se ele apresentar argumentos fortes e benefícios reais, demonstre interesse gradual.
6. Você conhece os concorrentes do seu segmento e pode comparar preços, mas valoriza resultado, segurança e suporte.
7. Quando o candidato digitar "ENCERRAR TREINO", saia do personagem e dê um FEEDBACK DETALHADO em JSON com este formato EXATO:
{"nota": 6, "abertura": 5, "qualificacao": 6, "apresentacao": 7, "objecoes": 5, "fechamento": 6, "pontos_fortes": ["..."], "pontos_melhora": ["..."], "feedback_geral": "..."}

RUBRICA DE NOTA — seja RIGOROSO e use TODA a escala de 0 a 10. NOTAS GENÉRICAS (7/8/9 automáticas) SÃO PROIBIDAS:
- 10: execução exemplar, objetivo totalmente atingido, argumentos afiados, conexão genuína e próximo passo claro. Só dê 10 se for praticamente perfeito.
- 8-9: muito bom, com pouquíssimas falhas e objetivo bem atingido.
- 5-7: mediano, atingiu parcialmente o objetivo, erros de técnicas, argumentos rasos ou falta de qualificação.
- 3-4: ruim, muitos erros, despreparo, não conectou ou não avançou no objetivo.
- 0-2: péssimo, sem conexão, sem argumento, sem técnicas ou abordagem inadequada.

REGRAS PARA A NOTA FINAL:
- Se o candidato não atingir o objetivo do módulo, a nota final NÃO pode ser maior que 6.
- Cada erro de qualificação, argumento fraco, resposta genérica ou falta de conteúdo do catálogo desconta 1-2 pontos.
- Respostas muito curtas ("ok", "tudo bem?", "qual seu preço?") sem contexto: descontar.
- A nota final é uma média PONDERADA dos critérios, com ênfase no que o módulo exige.
- Você DEVE justificar a nota no "feedback_geral", citando exemplos reais do transcript.

CONTEXTO COMERCIAL E REGRAS QUE OS VENDEDORES SEGUEM (você reage a eles):
${MANIFESTO_COMERCIAL_OKEYLAC}

${REGRAS_MF_PARIS}

${instrucoesModulo}${instrucoesPerfil}
Comece a cena: você acabou de receber uma mensagem no WhatsApp de um vendedor da MF Paris / Okeylac. Responda como se estivesse digitando no celular, de forma natural, objetiva e no ritmo de uma conversa por mensagem.`
  }, [moduloId, perfilId, modulos, perfis])

  // Salva a sessão no backend (usado pelo roleplay de texto e pela ligação por voz)
  const salvarSessaoBackend = useCallback(async (dados: {
    msgsFinal: MsgChat[]; duracao: number; notaFinal: number | null; avaliacao: any
  }) => {
    const modulo = modulos.find(m => m.id === moduloId)
    const perfil = perfis.find(p => p.id === perfilId)
    const nova: SessaoCandidato = {
      id: Date.now(), modulo: modulo?.titulo || '', perfilNome: perfil?.nome || '',
      duracao: dados.duracao, nota: dados.notaFinal, createdAt: new Date().toISOString(),
    }
    setHistorico(prev => [nova, ...prev])
    try {
      await fetch(`${BOT_URL}/api/academia/sessao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          modulo: modulo?.titulo || '',
          perfilId: String(perfilId || ''),
          perfilNome: perfil?.nome || '',
          mensagens: dados.msgsFinal,
          duracaoSegundos: dados.duracao,
          nota: dados.notaFinal,
          feedback: dados.avaliacao,
        }),
      })
    } catch { /* sessão fica só na tela */ }
  }, [moduloId, perfilId, modulos, perfis, token])

  // Callback para o LigarView (sessão por voz) — converte SessaoTreinamento → formato do backend
  const salvarSessaoVoz = useCallback(async (sessao: SessaoTreinamento, perfilNome?: string) => {
    const modulo = modulos.find(m => String(m.id) === sessao.modulo)
    let avaliacao: any = null
    try { avaliacao = JSON.parse(sessao.feedback) } catch { avaliacao = { feedback_geral: sessao.feedback } }
    const nova: SessaoCandidato = {
      id: sessao.id, modulo: modulo?.titulo || sessao.modulo, perfilNome: perfilNome || '',
      duracao: sessao.duracao, nota: sessao.nota, createdAt: sessao.createdAt,
    }
    setHistorico(prev => [nova, ...prev])
    try {
      await fetch(`${BOT_URL}/api/academia/sessao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          modulo: modulo?.titulo || sessao.modulo,
          perfilId: sessao.perfilId,
          perfilNome: perfilNome || '',
          mensagens: sessao.msgs,
          duracaoSegundos: sessao.duracao,
          nota: sessao.nota,
          feedback: avaliacao,
        }),
      })
    } catch { /* sessão fica só na tela */ }
  }, [modulos, token])

  const iniciarSessao = async () => {
    if (!moduloId) return
    setTempoInicio(Date.now())
    setDuracaoAtual(0)
    setMsgs([])
    setNota(null)
    setFeedbackObj(null)
    setFase('roleplay')
    setLoading(true)
    try {
      const resp = await callAI([{ role: 'user', content: 'Pode começar o roleplay.' }], sistemaTreinamento())
      setMsgs([{ role: 'assistant', content: resp, ts: Date.now() }])
    } catch {
      setMsgs([{ role: 'assistant', content: '📱 *nova mensagem* Olá, quem é?', ts: Date.now() }])
    }
    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const encerrarSessao = async (msgsFinal: MsgChat[]) => {
    setFase('avaliando')
    setLoading(true)
    const duracao = Math.max(0, Math.floor((Date.now() - tempoInicio) / 1000))
    let notaFinal: number | null = null
    let avaliacao: any = { nota: null, feedback_geral: 'Não foi possível avaliar a sessão. Tente novamente.' }
    try {
      const transcript = msgsFinal.map(m => `${m.role === 'user' ? 'CANDIDATO' : 'CLIENTE'}: ${m.content}`).join('\n')
      const resp = await callAI(
        [{ role: 'user', content: `TRANSCRIPT DO ROLEPLAY:\n${transcript}\n\nAGORA DÊ O FEEDBACK DETALHADO EM JSON conforme instrução.` }],
        sistemaTreinamento()
      )
      const jsonMatch = resp.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        avaliacao = JSON.parse(jsonMatch[0])
        notaFinal = typeof avaliacao.nota === 'number' ? avaliacao.nota : null
      }
    } catch { /* mantém fallback */ }
    setNota(notaFinal)
    setFeedbackObj(avaliacao)
    await salvarSessaoBackend({ msgsFinal, duracao, notaFinal, avaliacao })
    setLoading(false)
    setFase('resultado')
  }

  const enviarMsg = async () => {
    if (!input.trim() || loading) return
    const texto = input.trim()
    setInput('')
    const novasMsgs = [...msgs, { role: 'user' as const, content: texto, ts: Date.now() }]
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

  const gerarQuiz = async () => {
    setQuizLoading(true)
    setQuizFeedback(null)
    setQuizResp('')
    const produtosTexto = PRODUTOS_MF_PARIS.map(p => `${p.nome}: ${p.dif}. Aplicação: ${p.aplicacao}.`).join('\n')
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
        [{ role: 'user', content: `Pergunta: ${quizPergunta}\nResposta do candidato: ${quizResp}\n\nAvalie a resposta e dê feedback construtivo em 2-3 linhas.` }],
        `Você é um treinador de vendas da MF Paris. Catálogo:\n${produtosTexto}`
      )
      setQuizFeedback(resp)
    } catch { setQuizFeedback('Não foi possível avaliar agora.') }
    setQuizLoading(false)
  }

  const moduloAtual = modulos.find(m => m.id === moduloId)
  const perfilAtual = perfis.find(p => p.id === perfilId)
  const totalTreinos = historico.length
  const notaMedia = totalTreinos > 0 ? (historico.reduce((a, b) => a + (b.nota || 0), 0) / totalTreinos).toFixed(1) : '—'
  const minutosTotais = Math.floor(historico.reduce((a, b) => a + b.duracao, 0) / 60)

  // ─── TELAS DE ACESSO ───

  if (fase === 'validando') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-700 via-purple-800 to-pink-900 flex items-center justify-center p-4">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-14 w-14 border-b-2 border-white mx-auto mb-4" />
          <p className="text-sm font-medium">Validando seu acesso...</p>
        </div>
      </div>
    )
  }

  if (fase === 'invalido') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-700 via-purple-800 to-pink-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <StopIcon className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Acesso indisponível</h1>
          <p className="text-sm text-gray-600 leading-relaxed">{erroAcesso}</p>
        </div>
      </div>
    )
  }

  const abas: { id: Aba; icon: React.ReactNode; label: string }[] = [
    { id: 'home', icon: <PlayIcon className="h-4 w-4" />, label: 'Treinar' },
    { id: 'ligar', icon: <PhoneIcon className="h-4 w-4" />, label: 'Ligar' },
    { id: 'produtos', icon: <BookOpenIcon className="h-4 w-4" />, label: 'Produtos' },
    { id: 'quiz', icon: <SparklesIcon className="h-4 w-4" />, label: 'Quiz IA' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src="/Logo_MFParis.png" alt="MF Paris" className="w-9 h-9 rounded-full object-cover" />
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <AcademicCapIcon className="h-4 w-4 text-primary-600" /> Academia de Vendas
            </h1>
            <p className="text-[11px] text-gray-500 truncate">
              {nomeCandidato}{expiraEm && ` · acesso até ${new Date(expiraEm).toLocaleDateString('pt-BR')}`}
            </p>
          </div>
          {fase === 'roleplay' && (
            <span className="flex items-center gap-1 text-xs font-semibold text-red-600">
              <ClockIcon className="h-4 w-4" /> {fmt(duracaoAtual)}
            </span>
          )}
        </div>
        {/* Abas — só na home (roleplay tem tela própria) */}
        {fase === 'home' && (
          <div className="max-w-4xl mx-auto px-4 pb-2 flex items-center gap-1 overflow-x-auto">
            {abas.map(a => (
              <button key={a.id} onClick={() => { setAba(a.id); setProdutoVer(null) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${aba === a.id ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                {a.icon}{a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 w-full max-w-4xl mx-auto p-4">
        {/* HOME — escolha de módulo e cliente simulado */}
        {fase === 'home' && aba === 'home' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-5 text-white">
              <h2 className="text-lg font-bold">Olá, {nomeCandidato.split(' ')[0]}! 👋</h2>
              <p className="text-sm text-purple-100 mt-1">
                Este é seu ambiente de avaliação. Escolha um módulo, converse com o cliente simulado e receba uma nota com feedback no final.
              </p>
              <div className="flex flex-wrap gap-4 mt-3 text-xs">
                <span className="flex items-center gap-1"><TrophyIcon className="h-4 w-4" /> {totalTreinos} treino(s)</span>
                <span className="flex items-center gap-1"><CheckCircleIcon className="h-4 w-4" /> Média {notaMedia}</span>
                <span className="flex items-center gap-1"><ClockIcon className="h-4 w-4" /> {minutosTotais} min treinados</span>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">1. Módulo do treino</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {modulos.map(m => (
                  <button key={m.id} onClick={() => setModuloId(m.id)}
                    className={`text-left p-3 rounded-xl border-2 transition-all ${moduloId === m.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <p className="text-sm font-semibold text-gray-900">{m.emoji} {m.titulo}</p>
                    {m.descricao && <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{m.descricao}</p>}
                    {m.dificuldade && <span className={`inline-block mt-1.5 px-2 py-0.5 text-[10px] font-bold rounded-full ${difColor(m.dificuldade)}`}>{m.dificuldade}</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">2. Cliente simulado</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {perfis.map(p => (
                  <button key={p.id} onClick={() => setPerfilId(p.id)}
                    className={`text-left p-3 rounded-xl border-2 transition-all ${perfilId === p.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <p className="text-sm font-semibold text-gray-900">{p.emoji} {p.nome}</p>
                    {p.negocio && <p className="text-[11px] text-gray-500">{p.negocio}</p>}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={iniciarSessao} disabled={!moduloId || !perfilId}
              className="w-full py-3.5 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg transition-all">
              <ChatBubbleLeftRightIcon className="h-5 w-5" /> Iniciar treino por texto
            </button>

            {historico.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Seus treinos anteriores</p>
                <div className="space-y-2">
                  {historico.slice(0, 10).map(s => (
                    <div key={s.id} className="flex items-center gap-3 text-sm">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${notaColor(s.nota)}`}>{s.nota ?? '—'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-800 truncate">{s.modulo}</p>
                        <p className="text-[10px] text-gray-400">{s.perfilNome} · {fmt(s.duracao)}min · {new Date(s.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* LIGAR — simulação por voz (ElevenLabs), mesmo componente da Academia de Vendas */}
        {fase === 'home' && aba === 'ligar' && (
          <ConversationProvider>
            <LigarView
              modulos={modulos}
              perfis={perfis}
              moduloId={moduloId}
              perfilId={perfilId}
              setModuloId={setModuloId}
              setPerfilId={setPerfilId}
              historico={[]}
              setHistorico={() => {}}
              produtos={[]}
              onSaveSessao={salvarSessaoVoz}
            />
          </ConversationProvider>
        )}

        {/* PRODUTOS — catálogo */}
        {fase === 'home' && aba === 'produtos' && !produtoVer && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Catálogo de Produtos MF Paris</h2>
            <p className="text-sm text-gray-500 mb-5">Conheça cada produto e seus argumentos de venda antes de entrar num treino.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {PRODUTOS_MF_PARIS.map((p, i) => (
                <button key={i} onClick={() => setProdutoVer(p)}
                  className="text-left bg-white rounded-xl p-4 border border-gray-200 hover:border-primary-400 hover:shadow-md transition-all group">
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full font-medium">{p.categoria}</span>
                    <ChevronRightIcon className="h-4 w-4 text-gray-300 group-hover:text-primary-500 transition-colors" />
                  </div>
                  <h3 className="font-semibold text-gray-900 text-sm mb-1">{p.nome}</h3>
                  <p className="text-xs text-gray-500 mb-2">{p.destaque}</p>
                  <p className="text-xs font-bold text-green-600">{p.preco}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {fase === 'home' && aba === 'produtos' && produtoVer && (
          <div className="max-w-2xl mx-auto">
            <button onClick={() => setProdutoVer(null)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
              <ArrowLeftIcon className="h-4 w-4" /> Voltar ao catálogo
            </button>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
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
                  <div key={row.label} className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-bold text-gray-500 mb-1">{row.label}</p>
                    <p className="text-sm text-gray-900">{row.value}</p>
                  </div>
                ))}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-blue-700 mb-1">💡 Argumento de Venda Sugerido</p>
                  <p className="text-sm text-blue-800">"Nosso {produtoVer.nome.split(' ').slice(0, 3).join(' ')} tem {produtoVer.dif.toLowerCase()}, o que garante {produtoVer.destaque.toLowerCase()} para o seu negócio."</p>
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

        {/* QUIZ IA */}
        {fase === 'home' && aba === 'quiz' && (
          <div className="max-w-2xl mx-auto space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Quiz de Produtos</h2>
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
                <div className="bg-white rounded-xl p-5 border-2 border-primary-200 shadow-sm">
                  <div className="flex items-start gap-2 mb-3">
                    <SparklesIcon className="h-5 w-5 text-primary-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm font-semibold text-gray-900 leading-relaxed">{quizPergunta}</p>
                  </div>
                  {!quizFeedback && (
                    <div className="flex gap-2">
                      <input value={quizResp} onChange={e => setQuizResp(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && responderQuiz()}
                        placeholder="Sua resposta..."
                        className="flex-1 px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                      <button onClick={responderQuiz} disabled={quizLoading || !quizResp.trim()}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-primary-700 transition-colors">
                        {quizLoading ? '...' : 'Enviar'}
                      </button>
                    </div>
                  )}
                </div>
                {quizFeedback && (
                  <div className="space-y-3">
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <p className="text-xs font-bold text-green-700 mb-1 flex items-center gap-1"><CheckCircleIcon className="h-4 w-4" />Feedback do Coach IA</p>
                      <p className="text-sm text-green-800 leading-relaxed">{quizFeedback}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setQuizPergunta(''); setQuizResp(''); setQuizFeedback(null); gerarQuiz() }}
                        className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5">
                        <ArrowPathIcon className="h-4 w-4" />Próxima Pergunta
                      </button>
                      <button onClick={() => { setQuizPergunta(''); setQuizResp(''); setQuizFeedback(null); setQuizAtivo(false) }}
                        className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm hover:bg-gray-200 transition-colors">
                        Encerrar Quiz
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ROLEPLAY — chat com cliente simulado */}
        {fase === 'roleplay' && (
          <div className="bg-white rounded-xl border border-gray-200 flex flex-col h-[calc(100dvh-140px)]">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <span className="text-xl">{perfilAtual?.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">{perfilAtual?.nome}</p>
                <p className="text-[10px] text-gray-400 truncate">{moduloAtual?.titulo}</p>
              </div>
              <button onClick={() => encerrarSessao(msgs)}
                className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100">
                Encerrar e avaliar
              </button>
            </div>
            <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {msgs.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-primary-600 text-white rounded-br-md' : 'bg-white text-gray-800 border border-gray-200 rounded-bl-md'}`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
                    <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                    <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                  </div>
                </div>
              )}
            </div>
            <div className="p-3 border-t border-gray-100 flex gap-2">
              <input ref={inputRef} type="text" value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && enviarMsg()}
                placeholder="Digite sua mensagem como vendedor..."
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              <button onClick={enviarMsg} disabled={loading || !input.trim()}
                className="px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white rounded-xl transition-colors">
                <PaperAirplaneIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* AVALIANDO */}
        {fase === 'avaliando' && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="animate-spin rounded-full h-14 w-14 border-b-2 border-primary-600 mb-4" />
            <p className="text-sm font-semibold text-gray-700">Avaliando sua performance...</p>
            <p className="text-xs text-gray-400 mt-1">A IA está analisando a conversa</p>
          </div>
        )}

        {/* RESULTADO */}
        {fase === 'resultado' && feedbackObj && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold mx-auto ${notaColor(nota)}`}>
                {nota ?? '—'}
              </div>
              <p className="text-sm font-semibold text-gray-900 mt-3">Nota final</p>
              <p className="text-xs text-gray-400 mt-0.5">{moduloAtual?.titulo} · {perfilAtual?.nome}</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[['Abertura', feedbackObj.abertura], ['Qualificação', feedbackObj.qualificacao], ['Apresentação', feedbackObj.apresentacao], ['Objeções', feedbackObj.objecoes], ['Fechamento', feedbackObj.fechamento]].map(([label, v]) => (
                <div key={label as string} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">{label}</p>
                  <p className="text-lg font-bold text-gray-900">{v ?? '—'}</p>
                </div>
              ))}
            </div>

            {feedbackObj.feedback_geral && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Feedback geral</p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{feedbackObj.feedback_geral}</p>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              {Array.isArray(feedbackObj.pontos_fortes) && feedbackObj.pontos_fortes.length > 0 && (
                <div className="bg-green-50 rounded-xl border border-green-200 p-4">
                  <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2">💪 Pontos fortes</p>
                  <ul className="space-y-1">{feedbackObj.pontos_fortes.map((p: string, i: number) => <li key={i} className="text-xs text-green-800">• {p}</li>)}</ul>
                </div>
              )}
              {Array.isArray(feedbackObj.pontos_melhora) && feedbackObj.pontos_melhora.length > 0 && (
                <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">🎯 Para melhorar</p>
                  <ul className="space-y-1">{feedbackObj.pontos_melhora.map((p: string, i: number) => <li key={i} className="text-xs text-amber-800">• {p}</li>)}</ul>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setMsgs([]); setFeedbackObj(null); setNota(null); setFase('home') }}
                className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2">
                <ChevronRightIcon className="h-4 w-4" /> Fazer outro treino
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
