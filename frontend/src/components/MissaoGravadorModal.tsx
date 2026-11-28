import React, { useEffect, useRef, useState } from 'react'
import { MicrophoneIcon, StopIcon, XMarkIcon, CheckIcon } from '@heroicons/react/24/outline'
import { authFetch, BOT_URL } from '../lib/botApi'
import { blobParaBase64, salvarGravacaoOffline } from '../lib/missaoOfflineQueue'
import type { MissaoRoteiroVisita, MissaoResumoIA } from '../types'

interface Props {
  visita: MissaoRoteiroVisita
  clienteNome: string
  vendedorId: number
  onClose: () => void
  onSavedVisita: (visitaAtualizada: MissaoRoteiroVisita, ultimaInteracaoISO?: string) => void
  onQueuedOffline: () => void
  showToast?: (tipo: 'success' | 'error', texto: string) => void
}

type EtapaModal = 'aviso_consentimento' | 'gravando' | 'processando' | 'revisao' | 'guardado_offline'

export default function MissaoGravadorModal({
  visita,
  clienteNome,
  vendedorId,
  onClose,
  onSavedVisita,
  onQueuedOffline,
  showToast,
}: Props) {
  const jaTemRascunho = Boolean(visita.resumoIa && !visita.resumoConfirmado)
  const [etapa, setEtapa] = useState<EtapaModal>(jaTemRascunho ? 'revisao' : 'aviso_consentimento')
  const [avisouCliente, setAvisouCliente] = useState(false)
  const [segundos, setSegundos] = useState(visita.audioDuracaoSeg || 0)
  const [dispositivosAudio, setDispositivosAudio] = useState<MediaDeviceInfo[]>([])
  const [deviceIdSelecionado, setDeviceIdSelecionado] = useState<string>('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvandoConfirmacao, setSalvandoConfirmacao] = useState(false)
  const [mostrarTranscricao, setMostrarTranscricao] = useState(false)

  const [resumo, setResumo] = useState<MissaoResumoIA>({
    conversado: visita.resumoIa?.conversado || '',
    produtosInteresse: visita.resumoIa?.produtosInteresse || '',
    objecoes: visita.resumoIa?.objecoes || '',
    proximoPasso: visita.resumoIa?.proximoPasso || '',
    proximoPrazo: visita.resumoIa?.proximoPrazo || '',
  })
  const [transcricao, setTranscricao] = useState<string>(visita.transcricao || '')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wakeLockRef = useRef<any>(null)
  const duracaoRef = useRef<number>(0)

  useEffect(() => {
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then(devs => {
          const mics = devs.filter(d => d.kind === 'audioinput')
          setDispositivosAudio(mics)
        })
        .catch(() => {})
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      if (wakeLockRef.current?.release) wakeLockRef.current.release().catch(() => {})
    }
  }, [])

  const fmtTempo = (s: number) => {
    const min = Math.floor(s / 60)
    const sec = s % 60
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const iniciarGravacao = async () => {
    setErro(null)
    try {
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        ...(deviceIdSelecionado ? { deviceId: { exact: deviceIdSelecionado } } : {}),
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
      streamRef.current = stream

      // Atualiza lista de microfones (após permissão, os nomes dos microfones de lapela aparecem)
      navigator.mediaDevices.enumerateDevices?.()
        .then(devs => setDispositivosAudio(devs.filter(d => d.kind === 'audioinput')))
        .catch(() => {})

      // Mantém a tela acordada no celular durante reuniões longas
      try {
        if ((navigator as any).wakeLock?.request) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen')
        }
      } catch { /* opcional */ }

      const mimeType = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'

      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 32000, // voz limpa ~240 KB/min (10 min ≈ 2.4 MB)
      })
      recorderRef.current = recorder
      chunksRef.current = []
      duracaoRef.current = 0
      setSegundos(0)

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        if (wakeLockRef.current?.release) {
          wakeLockRef.current.release().catch(() => {})
          wakeLockRef.current = null
        }
        const blob = new Blob(chunksRef.current, { type: mimeType })
        void enviarOuGuardarOffline(blob, mimeType, Math.max(1, duracaoRef.current))
      }

      recorder.start(1000)
      setEtapa('gravando')
      timerRef.current = setInterval(() => {
        duracaoRef.current += 1
        setSegundos(duracaoRef.current)
      }, 1000)
    } catch (err: any) {
      setErro(
        err?.name === 'NotAllowedError'
          ? 'Permissão de microfone negada no navegador. Libere o microfone nas configurações do aparelho.'
          : `Não foi possível iniciar o microfone: ${err?.message || 'erro desconhecido'}`,
      )
    }
  }

  const encerrarGravacao = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setEtapa('processando')
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }

  const enviarOuGuardarOffline = async (blob: Blob, mimeType: string, duracaoSeg: number) => {
    // Sem internet no momento → salva imediatamente no aparelho (IndexedDB)
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await salvarGravacaoOffline({
        missaoId: visita.missaoId,
        visitaId: visita.id,
        clienteId: visita.clienteId,
        vendedorId,
        duracaoSeg,
        mimeType,
        audioBlob: blob,
        criadoEm: new Date().toISOString(),
      })
      setEtapa('guardado_offline')
      onQueuedOffline()
      return
    }

    try {
      const audioBase64 = await blobParaBase64(blob)
      const res = await authFetch(`${BOT_URL}/api/missoes/visitas/${visita.id}/gravacao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64, mimeType, duracaoSeg }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Erro HTTP ${res.status}`)
      }
      const vUpd: MissaoRoteiroVisita = json.data
      setResumo({
        conversado: vUpd.resumoIa?.conversado || '',
        produtosInteresse: vUpd.resumoIa?.produtosInteresse || '',
        objecoes: vUpd.resumoIa?.objecoes || '',
        proximoPasso: vUpd.resumoIa?.proximoPasso || '',
        proximoPrazo: vUpd.resumoIa?.proximoPrazo || '',
      })
      setTranscricao(vUpd.transcricao || '')
      setEtapa('revisao')
    } catch (err: any) {
      // Falha de rede / instabilidade → guarda no aparelho para não perder a gravação de campo!
      try {
        await salvarGravacaoOffline({
          missaoId: visita.missaoId,
          visitaId: visita.id,
          clienteId: visita.clienteId,
          vendedorId,
          duracaoSeg,
          mimeType,
          audioBlob: blob,
          criadoEm: new Date().toISOString(),
        })
        setEtapa('guardado_offline')
        onQueuedOffline()
      } catch {
        setErro(err?.message || 'Erro ao enviar áudio para transcrição.')
        setEtapa('aviso_consentimento')
      }
    }
  }

  const confirmarResumo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resumo.conversado.trim()) {
      setErro('Preencha o campo "O que foi conversado" antes de confirmar.')
      return
    }
    setSalvandoConfirmacao(true)
    setErro(null)
    try {
      const res = await authFetch(`${BOT_URL}/api/missoes/visitas/${visita.id}/confirmar-resumo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...resumo,
          transcricao,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Erro ao confirmar resumo.')
      }
      showToast?.('success', 'Resumo confirmado e data do último contato atualizada.')
      onSavedVisita(json.data, json.ultimaInteracaoAtualizada)
      onClose()
    } catch (err: any) {
      setErro(err?.message || 'Erro ao salvar confirmação do resumo.')
    } finally {
      setSalvandoConfirmacao(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-xl p-5 space-y-4 my-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Registro da visita por gravação</p>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{clienteNome}</h3>
          </div>
          {etapa !== 'gravando' && etapa !== 'processando' && (
            <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>

        {erro && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
            {erro}
          </div>
        )}

        {etapa === 'aviso_consentimento' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 space-y-1.5">
              <p className="text-xs font-bold text-amber-900">Lembrete obrigatório antes de gravar</p>
              <p className="text-xs text-amber-800 leading-relaxed">
                Avise o cliente de que a conversa está sendo gravada para registro comercial do atendimento e dos combinados da visita.
              </p>
            </div>

            {dispositivosAudio.length > 1 && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Microfone de entrada (ex.: microfone de lapela)
                </label>
                <select
                  value={deviceIdSelecionado}
                  onChange={e => setDeviceIdSelecionado(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl text-xs bg-white dark:bg-gray-800"
                >
                  <option value="">Padrão do aparelho (lapela conectada)</option>
                  {dispositivosAudio.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Microfone ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={avisouCliente}
                onChange={e => setAvisouCliente(e.target.checked)}
                className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-xs text-gray-700 dark:text-gray-300">
                Confirmo que avisei o cliente sobre a gravação desta reunião.
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!avisouCliente}
                onClick={iniciarGravacao}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white text-xs font-semibold rounded-xl"
              >
                <MicrophoneIcon className="h-4 w-4" />
                Iniciar gravação
              </button>
            </div>
          </div>
        )}

        {etapa === 'gravando' && (
          <div className="py-6 text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
              <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
              Gravando reunião
            </div>
            <p className="text-4xl font-bold tabular-nums text-gray-900 dark:text-white">
              {fmtTempo(segundos)}
            </p>
            <p className="text-xs text-gray-500">
              Mantenha o microfone de lapela próximo. Sem internet, o áudio será salvo no aparelho automaticamente.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={encerrarGravacao}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl shadow-sm"
              >
                <StopIcon className="h-4 w-4" />
                Encerrar e gerar resumo
              </button>
            </div>
          </div>
        )}

        {etapa === 'processando' && (
          <div className="py-8 text-center space-y-2">
            <div className="h-7 w-7 mx-auto rounded-full border-2 border-primary-600 border-t-transparent animate-spin" />
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Transcrevendo e resumindo a visita...</p>
            <p className="text-xs text-gray-500">Aguarde alguns segundos para revisar e confirmar o resumo.</p>
          </div>
        )}

        {etapa === 'guardado_offline' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 space-y-1">
              <p className="font-bold">Gravação guardada com segurança neste aparelho</p>
              <p className="leading-relaxed">
                Você está sem conexão estável no momento. Assim que a internet voltar, o CRM enviará o áudio automaticamente para transcrição e deixará o resumo pronto para sua confirmação.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-primary-600 text-white text-xs font-semibold rounded-xl"
              >
                Entendi
              </button>
            </div>
          </div>
        )}

        {etapa === 'revisao' && (
          <form onSubmit={confirmarResumo} className="space-y-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-900">
              Revise e corrija se necessário. O resumo só passa a valer e atualizar o último contato do cliente depois da sua confirmação.
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                O que foi conversado <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                value={resumo.conversado}
                onChange={e => setResumo({ ...resumo, conversado: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl text-xs bg-white dark:bg-gray-800"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Produtos de interesse
                </label>
                <input
                  type="text"
                  value={resumo.produtosInteresse}
                  onChange={e => setResumo({ ...resumo, produtosInteresse: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl text-xs bg-white dark:bg-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Objeções
                </label>
                <input
                  type="text"
                  value={resumo.objecoes}
                  onChange={e => setResumo({ ...resumo, objecoes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl text-xs bg-white dark:bg-gray-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Próximo passo
                </label>
                <input
                  type="text"
                  value={resumo.proximoPasso}
                  onChange={e => setResumo({ ...resumo, proximoPasso: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl text-xs bg-white dark:bg-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Prazo
                </label>
                <input
                  type="date"
                  value={resumo.proximoPrazo}
                  onChange={e => setResumo({ ...resumo, proximoPrazo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl text-xs bg-white dark:bg-gray-800"
                />
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setMostrarTranscricao(v => !v)}
                className="text-xs font-medium text-primary-600 hover:underline"
              >
                {mostrarTranscricao ? 'Ocultar transcrição completa' : 'Ver transcrição completa (privada ao dono da carteira e gestor)'}
              </button>
              {mostrarTranscricao && (
                <textarea
                  rows={5}
                  value={transcricao}
                  onChange={e => setTranscricao(e.target.value)}
                  className="mt-1.5 w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-[11px] bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300"
                />
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Revisar depois
              </button>
              <button
                type="submit"
                disabled={salvandoConfirmacao}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl"
              >
                <CheckIcon className="h-4 w-4" />
                {salvandoConfirmacao ? 'Salvando...' : 'Confirmar e salvar visita'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
