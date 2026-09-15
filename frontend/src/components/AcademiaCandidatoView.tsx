import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  AcademicCapIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  PaperAirplaneIcon,
  StopIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline'
import { callAI } from '../lib/gemini'
import type { AIMessage } from '../lib/gemini'
import { MANIFESTO_COMERCIAL_OKEYLAC, REGRAS_MF_PARIS, TEXTO_CATALOGO } from '../data/aiContext'

const BOT_URL = (import.meta as any).env?.VITE_BOT_URL || 'http://localhost:3002'

interface MsgChat { role: 'user' | 'assistant'; content: string; ts: number }

interface ModuloCandidato {
  id: number
  titulo: string
  descricao?: string
  objetivo?: string
  emoji?: string
  dificuldade?: string
  promptInstrucoes?: string
}

interface PerfilCandidato {
  id: number
  nome: string
  negocio?: string
  emoji?: string
  dor?: string
  estilo?: string
  promptInstrucoes?: string
}

interface SessaoCandidato {
  id: string | number
  modulo: string
  perfilNome: string
  duracao: number
  nota: number | null
  createdAt: string
}

type Fase = 'validando' | 'invalido' | 'home' | 'roleplay' | 'avaliando' | 'resultado'

export default function AcademiaCandidatoView() {
  const [fase, setFase] = useState<Fase>('validando')
  const [erroAcesso, setErroAcesso] = useState('')
  const [nomeCandidato, setNomeCandidato] = useState('')
  const [expiraEm, setExpiraEm] = useState('')
  const [token, setToken] = useState('')

  const [modulos, setModulos] = useState<ModuloCandidato[]>([])
  const [perfis, setPerfis] = useState<PerfilCandidato[]>([])
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
        const ms: ModuloCandidato[] = (cfg?.modulos || []).map((m: any) => ({
          id: m.id, titulo: m.titulo, descricao: m.descricao, objetivo: m.objetivo,
          emoji: m.emoji, dificuldade: m.dificuldade, promptInstrucoes: m.prompt_instrucoes,
        }))
        const ps: PerfilCandidato[] = (cfg?.perfis || []).map((p: any) => ({
          id: p.id, nome: p.nome, negocio: p.negocio, emoji: p.emoji,
          dor: p.dor, estilo: p.estilo, promptInstrucoes: p.prompt_instrucoes,
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

  // Cronômetro da sessão
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

    const modulo = modulos.find(m => m.id === moduloId)
    const perfil = perfis.find(p => p.id === perfilId)
    const nova: SessaoCandidato = {
      id: Date.now(), modulo: modulo?.titulo || '', perfilNome: perfil?.nome || '',
      duracao, nota: notaFinal, createdAt: new Date().toISOString(),
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
          mensagens: msgsFinal,
          duracaoSegundos: duracao,
          nota: notaFinal,
          feedback: avaliacao,
        }),
      })
    } catch { /* sessão fica só na tela */ }
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

  const moduloAtual = modulos.find(m => m.id === moduloId)
  const perfilAtual = perfis.find(p => p.id === perfilId)
  const totalTreinos = historico.length
  const notaMedia = totalTreinos > 0 ? (historico.reduce((a, b) => a + (b.nota || 0), 0) / totalTreinos).toFixed(1) : '—'

  // ─── TELAS ───

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
      </div>

      <div className="flex-1 w-full max-w-4xl mx-auto p-4">
        {/* HOME — escolha de módulo e cliente simulado */}
        {fase === 'home' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-5 text-white">
              <h2 className="text-lg font-bold">Olá, {nomeCandidato.split(' ')[0]}! 👋</h2>
              <p className="text-sm text-purple-100 mt-1">
                Este é seu ambiente de avaliação. Escolha um módulo, converse com o cliente simulado por texto e receba uma nota com feedback no final.
              </p>
              <div className="flex gap-4 mt-3 text-xs">
                <span className="flex items-center gap-1"><TrophyIcon className="h-4 w-4" /> {totalTreinos} treino(s)</span>
                <span className="flex items-center gap-1"><CheckCircleIcon className="h-4 w-4" /> Média {notaMedia}</span>
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
              <ChatBubbleLeftRightIcon className="h-5 w-5" /> Iniciar treino
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
