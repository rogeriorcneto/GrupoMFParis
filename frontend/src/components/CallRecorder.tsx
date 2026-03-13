import React, { useState, useRef, useCallback, useEffect } from 'react'
import { PhoneIcon, StopIcon, MicrophoneIcon, XMarkIcon } from '@heroicons/react/24/solid'
import { supabase } from '../lib/supabase'
import type { Cliente } from '../types'

export type CallMode = 'phone' | 'whatsapp'

interface CallRecorderProps {
  cliente?: Cliente | null
  vendedorId?: number
  phoneNumber: string
  contactName?: string
  callMode?: CallMode
  onClose: () => void
  onSaved?: (gravacao: GravacaoMeta) => void
}

export interface GravacaoMeta {
  id: number
  clienteId: number
  vendedorId: number | null
  numeroTelefone: string
  duracaoSegundos: number
  arquivoUrl: string | null
  arquivoPath: string | null
  tamanhoBytes: number
  notas: string | null
  createdAt: string
}

type RecordingState = 'idle' | 'requesting' | 'recording' | 'stopped' | 'uploading' | 'saved' | 'error'

export default function CallRecorder({ cliente, vendedorId, phoneNumber, contactName, callMode = 'phone', onClose, onSaved }: CallRecorderProps) {
  const [state, setState] = useState<RecordingState>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notas, setNotas] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioBlobRef = useRef<Blob | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  const startRecording = useCallback(async () => {
    setState('requesting')
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      })
      streamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        audioBlobRef.current = blob
        setAudioUrl(URL.createObjectURL(blob))
        // Stop all tracks
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }

      recorder.start(1000) // collect data every 1s
      setState('recording')
      setSeconds(0)

      timerRef.current = setInterval(() => {
        setSeconds(s => s + 1)
      }, 1000)

      // Open the call link based on mode
      const cleanNum = phoneNumber.replace(/\D/g, '')
      if (callMode === 'whatsapp') {
        // WhatsApp voice call — open in new tab so recording continues
        window.open(`https://wa.me/${cleanNum}`, '_blank')
      } else {
        window.open(`tel:${cleanNum}`, '_self')
      }

    } catch (err: any) {
      setError(err?.message === 'Permission denied'
        ? 'Permissão do microfone negada. Habilite nas configurações do navegador.'
        : `Erro ao acessar microfone: ${err?.message || 'Desconhecido'}`)
      setState('error')
    }
  }, [phoneNumber, callMode])

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setState('stopped')
  }, [])

  const saveRecording = useCallback(async () => {
    if (!audioBlobRef.current) return
    setState('uploading')
    setError(null)

    const blob = audioBlobRef.current
    const ext = blob.type.includes('webm') ? 'webm' : 'mp4'
    const clienteIdForFile = cliente?.id || 'wa'
    const fileName = `call_${clienteIdForFile}_${Date.now()}.${ext}`
    const storagePath = `${vendedorId || 'unknown'}/${fileName}`

    let arquivoUrl: string | null = null
    let arquivoPath: string | null = null

    // Try to upload to Supabase Storage
    try {
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('call-recordings')
        .upload(storagePath, blob, {
          contentType: blob.type,
          upsert: false,
        })

      if (uploadError) {
        console.warn('Storage upload failed (bucket may not exist):', uploadError.message)
        // Fallback: no file URL, just save metadata
      } else if (uploadData) {
        arquivoPath = uploadData.path
        const { data: urlData } = supabase.storage
          .from('call-recordings')
          .getPublicUrl(uploadData.path)
        arquivoUrl = urlData?.publicUrl || null
      }
    } catch (err) {
      console.warn('Storage not available:', err)
    }

    // Save metadata to DB
    try {
      const { data, error: dbError } = await supabase
        .from('gravacoes_chamada')
        .insert({
          cliente_id: cliente?.id || null,
          vendedor_id: vendedorId || null,
          numero_telefone: phoneNumber,
          duracao_segundos: seconds,
          arquivo_url: arquivoUrl,
          arquivo_path: arquivoPath,
          tamanho_bytes: blob.size,
          notas: notas.trim() || null,
          tipo_chamada: callMode,
        })
        .select()
        .single()

      if (dbError) throw dbError

      setState('saved')

      if (onSaved && data) {
        onSaved({
          id: data.id,
          clienteId: data.cliente_id,
          vendedorId: data.vendedor_id,
          numeroTelefone: data.numero_telefone,
          duracaoSegundos: data.duracao_segundos,
          arquivoUrl: data.arquivo_url,
          arquivoPath: data.arquivo_path,
          tamanhoBytes: data.tamanho_bytes,
          notas: data.notas,
          createdAt: data.created_at,
        })
      }

      // Auto-close after 2s
      setTimeout(() => onClose(), 2000)

    } catch (err: any) {
      setError(`Erro ao salvar: ${err?.message || 'Desconhecido'}. Verifique se a tabela gravacoes_chamada existe.`)
      setState('error')
    }
  }, [cliente?.id, vendedorId, phoneNumber, seconds, notas, callMode, onSaved, onClose])

  const discardRecording = useCallback(() => {
    audioBlobRef.current = null
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
    onClose()
  }, [audioUrl, onClose])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in slide-in-from-bottom-4">
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between ${
        state === 'recording' ? 'bg-red-500 text-white' :
        state === 'saved' ? 'bg-green-500 text-white' :
        'bg-gray-800 text-white'
      }`}>
        <div className="flex items-center gap-2">
          {state === 'recording' && (
            <span className="w-3 h-3 rounded-full bg-white animate-pulse" />
          )}
          <PhoneIcon className="h-4 w-4" />
          <span className="text-sm font-semibold truncate max-w-[160px]">
            {contactName || cliente?.razaoSocial || cliente?.nomeFantasia || 'Contato'}
          </span>
        </div>
        {state !== 'recording' && (
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <XMarkIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="p-4">
        {/* IDLE — Start recording */}
        {state === 'idle' && (
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-3">
              {callMode === 'whatsapp'
                ? <>Ligar via <strong>WhatsApp</strong> para <strong>{phoneNumber}</strong> com gravação?</>
                : <>Iniciar ligação para <strong>{phoneNumber}</strong> com gravação?</>}
            </p>
            <p className="text-xs text-gray-400 mb-4">
              {callMode === 'whatsapp'
                ? 'O WhatsApp abrirá em nova aba. O microfone do PC gravará a conversa pelo alto-falante.'
                : 'O microfone gravará sua voz durante a chamada. A ligação será iniciada pelo app do telefone.'}
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={startRecording}
                className={`flex items-center gap-1.5 px-4 py-2 text-white rounded-xl text-sm font-semibold transition-colors ${
                  callMode === 'whatsapp' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                <MicrophoneIcon className="h-4 w-4" />
                {callMode === 'whatsapp' ? 'Ligar via WhatsApp + Gravar' : 'Ligar e Gravar'}
              </button>
              {callMode === 'phone' && (
                <a
                  href={`tel:${phoneNumber.replace(/\D/g, '')}`}
                  onClick={() => onClose()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors no-underline"
                >
                  <PhoneIcon className="h-4 w-4" />
                  Só Ligar
                </a>
              )}
            </div>
          </div>
        )}

        {/* REQUESTING mic permission */}
        {state === 'requesting' && (
          <div className="text-center py-4">
            <div className="inline-block animate-spin h-8 w-8 border-3 border-gray-300 border-t-red-500 rounded-full mb-3" />
            <p className="text-sm text-gray-600">Solicitando acesso ao microfone...</p>
          </div>
        )}

        {/* RECORDING */}
        {state === 'recording' && (
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <MicrophoneIcon className="h-6 w-6 text-red-500 animate-pulse" />
              <span className="text-3xl font-mono font-bold text-gray-900">{formatTime(seconds)}</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              {callMode === 'whatsapp'
                ? 'Gravando via microfone... Use o WhatsApp na outra aba. Clique em parar ao encerrar.'
                : 'Gravando... Clique em parar quando encerrar a ligação.'}
            </p>
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 transition-colors"
            >
              <StopIcon className="h-5 w-5" />
              Parar Gravação
            </button>
          </div>
        )}

        {/* STOPPED — Review + save */}
        {state === 'stopped' && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-medium text-gray-700">Duração:</span>
              <span className="text-sm font-mono font-bold text-gray-900">{formatTime(seconds)}</span>
            </div>

            {audioUrl && (
              <audio controls src={audioUrl} className="w-full mb-3 h-10" />
            )}

            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Notas sobre a ligação (opcional)..."
              className="w-full border border-gray-200 rounded-xl p-2.5 text-sm resize-none h-20 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-3"
            />

            <div className="flex gap-2">
              <button
                onClick={saveRecording}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors"
              >
                Salvar Gravação
              </button>
              <button
                onClick={discardRecording}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Descartar
              </button>
            </div>
          </div>
        )}

        {/* UPLOADING */}
        {state === 'uploading' && (
          <div className="text-center py-4">
            <div className="inline-block animate-spin h-8 w-8 border-3 border-gray-300 border-t-green-500 rounded-full mb-3" />
            <p className="text-sm text-gray-600">Salvando gravação...</p>
          </div>
        )}

        {/* SAVED */}
        {state === 'saved' && (
          <div className="text-center py-4">
            <div className="text-4xl mb-2">✅</div>
            <p className="text-sm font-semibold text-green-700">Gravação salva com sucesso!</p>
            <p className="text-xs text-gray-500 mt-1">{formatTime(seconds)} — {contactName || cliente?.razaoSocial || phoneNumber}</p>
          </div>
        )}

        {/* ERROR */}
        {state === 'error' && (
          <div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-sm text-red-700">
              {error}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setState('idle')}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200"
              >
                Tentar Novamente
              </button>
              <button onClick={onClose} className="px-4 py-2 text-gray-500 text-sm">
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
