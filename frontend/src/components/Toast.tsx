import React from 'react'

interface ToastProps {
  toastMsg: { tipo: 'success' | 'error'; texto: string } | null
}

export default function Toast({ toastMsg }: ToastProps) {
  if (!toastMsg) return null

  return (
    <div className={`fixed bottom-6 right-6 z-[60] px-5 py-3 rounded-apple shadow-apple-lg max-w-sm animate-slide-in-right ${toastMsg.tipo === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
      <div className="flex items-center gap-2">
        <span>{toastMsg.tipo === 'success' ? '✅' : '❌'}</span>
        <p className="text-sm font-medium">{toastMsg.texto}</p>
      </div>
    </div>
  )
}
