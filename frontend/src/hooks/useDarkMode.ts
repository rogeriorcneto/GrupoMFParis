import { useEffect, useState } from 'react'

export function useDarkMode() {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('crm-dark-mode')
      if (saved !== null) return saved === 'true'
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    } catch {
      return false
    }
  })

  useEffect(() => {
    const root = document.documentElement
    if (dark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    try {
      localStorage.setItem('crm-dark-mode', String(dark))
    } catch { /* ignore */ }
  }, [dark])

  return { dark, toggleDark: () => setDark(v => !v) }
}
