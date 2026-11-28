/**
 * Fila offline em IndexedDB para gravações de visitas em Missões (Item 5):
 * "Sem internet, a gravação fica guardada no aparelho e é processada quando a conexão voltar."
 */

export interface AudioVisitaOfflineItem {
  localId: string
  missaoId: number
  visitaId: number
  clienteId: number
  vendedorId: number
  duracaoSeg: number
  mimeType: string
  audioBlob: Blob
  criadoEm: string
  tentativas: number
  ultimoErro?: string
}

const DB_NAME = 'crm_mfparis_missao_offline'
const STORE_NAME = 'gravacoes_pendentes'
const DB_VERSION = 1

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível neste ambiente'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'localId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('Falha ao abrir IndexedDB'))
  })
}

export async function salvarGravacaoOffline(item: Omit<AudioVisitaOfflineItem, 'localId' | 'tentativas'>): Promise<AudioVisitaOfflineItem> {
  const registro: AudioVisitaOfflineItem = {
    ...item,
    localId: `visita-${item.visitaId}-${Date.now()}`,
    tentativas: 0,
  }
  const db = await abrirDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(registro)
    tx.oncomplete = () => { db.close(); resolve(registro) }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function listarGravacoesOffline(vendedorId?: number): Promise<AudioVisitaOfflineItem[]> {
  try {
    const db = await abrirDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).getAll()
      req.onsuccess = () => {
        db.close()
        const todos = (req.result || []) as AudioVisitaOfflineItem[]
        resolve(vendedorId ? todos.filter(x => x.vendedorId === vendedorId) : todos)
      }
      req.onerror = () => { db.close(); reject(req.error) }
    })
  } catch {
    return []
  }
}

export async function removerGravacaoOffline(localId: string): Promise<void> {
  try {
    const db = await abrirDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(localId)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    })
  } catch {
    // ignore
  }
}

export async function marcarErroGravacaoOffline(localId: string, erro: string): Promise<void> {
  try {
    const db = await abrirDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const getReq = store.get(localId)
      getReq.onsuccess = () => {
        const atual = getReq.result as AudioVisitaOfflineItem | undefined
        if (atual) {
          store.put({ ...atual, tentativas: (atual.tentativas || 0) + 1, ultimoErro: erro })
        }
      }
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    })
  } catch {
    // ignore
  }
}

export function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const res = String(reader.result || '')
      const idx = res.indexOf(',')
      resolve(idx >= 0 ? res.slice(idx + 1) : res)
    }
    reader.onerror = () => reject(reader.error || new Error('Erro ao ler áudio'))
    reader.readAsDataURL(blob)
  })
}
