import { useEffect, useState } from 'react'

interface VersionInfo {
  version: string
  buildTime: string
}

let currentVersion: string | null = null
let checkInterval: ReturnType<typeof setInterval> | null = null

export function useVersionCheck() {
  const [newVersionAvailable, setNewVersionAvailable] = useState(false)

  useEffect(() => {
    const checkVersion = async () => {
      try {
        // Adiciona timestamp para evitar cache
        const response = await fetch(`/version.json?t=${Date.now()}`)
        if (!response.ok) return

        const data: VersionInfo = await response.json()

        // Primeira vez - salva versão atual
        if (currentVersion === null) {
          currentVersion = data.version
          return
        }

        // Verifica se mudou
        if (data.version !== currentVersion) {
          setNewVersionAvailable(true)
          if (checkInterval) {
            clearInterval(checkInterval)
            checkInterval = null
          }
        }
      } catch (err) {
        // Silenciosamente ignora erros de rede
      }
    }

    // Verifica imediatamente
    checkVersion()

    // Verifica a cada 5 minutos
    checkInterval = setInterval(checkVersion, 5 * 60 * 1000)

    return () => {
      if (checkInterval) {
        clearInterval(checkInterval)
        checkInterval = null
      }
    }
  }, [])

  const reloadApp = () => {
    window.location.reload()
  }

  return { newVersionAvailable, reloadApp }
}
