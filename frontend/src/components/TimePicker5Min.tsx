import React from 'react'

export const HORAS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
export const MINUTOS_5 = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

export function arredondarHora5Min(raw?: string): string {
  if (!raw || !/^\d{1,2}:\d{2}/.test(raw.trim())) {
    const now = new Date()
    const m = Math.ceil(now.getMinutes() / 5) * 5
    if (m === 60) {
      return `${String((now.getHours() + 1) % 24).padStart(2, '0')}:00`
    }
    return `${String(now.getHours()).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const [hStr, mStr] = raw.trim().split(':')
  const h = Math.min(23, Math.max(0, parseInt(hStr, 10) || 0))
  const mRaw = Math.min(59, Math.max(0, parseInt(mStr, 10) || 0))
  const mRound = Math.min(55, Math.round(mRaw / 5) * 5)
  return `${String(h).padStart(2, '0')}:${String(mRound).padStart(2, '0')}`
}

/** Retorna true se data (AAAA-MM-DD) + hora (HH:MM opcional) for estritamente anterior ao instante atual */
export function isDataHoraNoPassado(dataISO: string, horaHHMM?: string, agora = new Date()): boolean {
  if (!dataISO || !/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return false
  const hojeLocal = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`
  if (dataISO < hojeLocal) return true
  if (dataISO > hojeLocal) return false
  // Mesma data de hoje: se hora foi informada, compara HH:MM com agora
  if (horaHHMM && /^\d{1,2}:\d{2}/.test(horaHHMM.trim())) {
    const [h, m] = horaHHMM.trim().split(':').map(n => parseInt(n, 10) || 0)
    const minAlvo = h * 60 + m
    const minAgora = agora.getHours() * 60 + agora.getMinutes()
    return minAlvo < minAgora
  }
  return false
}

interface TimePicker5MinProps {
  value: string
  onChange: (hhmm: string) => void
  className?: string
  ariaLabelPrefix?: string
}

export default function TimePicker5Min({ value, onChange, className = '', ariaLabelPrefix = 'Horário' }: TimePicker5MinProps) {
  const norm = value ? arredondarHora5Min(value) : ''
  const [hh, mm] = norm ? norm.split(':') : ['09', '00']

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      <select
        aria-label={`${ariaLabelPrefix} — Hora`}
        value={norm ? hh : ''}
        onChange={e => {
          const novaHora = e.target.value
          if (!novaHora) {
            onChange('')
          } else {
            onChange(`${novaHora}:${norm ? mm : '00'}`)
          }
        }}
        className="px-2 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
      >
        <option value="">HH</option>
        {HORAS_24.map(h => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="text-gray-500 font-bold text-xs">:</span>
      <select
        aria-label={`${ariaLabelPrefix} — Minutos`}
        value={norm ? mm : ''}
        onChange={e => {
          const novoMin = e.target.value
          if (!novoMin) {
            onChange('')
          } else {
            onChange(`${norm ? hh : '09'}:${novoMin}`)
          }
        }}
        className="px-2 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
      >
        <option value="">MM</option>
        {MINUTOS_5.map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  )
}
