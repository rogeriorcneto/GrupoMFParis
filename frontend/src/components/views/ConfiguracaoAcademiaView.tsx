import React, { useState, useEffect } from 'react'
import {
  PlusIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  PencilIcon,
  SparklesIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { callAI } from '../../lib/gemini'
import {
  insertModuloTreinamento,
  updateModuloTreinamento,
  deleteModuloTreinamento,
  insertPerfilTreinamento,
  updatePerfilTreinamento,
  deletePerfilTreinamento,
} from '../../lib/database'
import { MANIFESTO_COMERCIAL_OKEYLAC, REGRAS_MF_PARIS } from '../../data/aiContext'
import type { ModuloTreinamento, PerfilTreinamento } from '../../types'

interface Props {
  isGerente: boolean
  modulos: ModuloTreinamento[]
  perfis: PerfilTreinamento[]
  setModulos: (m: ModuloTreinamento[]) => void
  setPerfis: (p: PerfilTreinamento[]) => void
}

const DIFICULDADES: Array<'Iniciante' | 'Médio' | 'Avançado'> = ['Iniciante', 'Médio', 'Avançado']

const moduloVazio = (ordem: number): ModuloTreinamento => ({
  id: 0, ordem, ativo: true, titulo: '', descricao: '', objetivo: '', emoji: '',
  dificuldade: 'Médio', promptInstrucoes: '', createdAt: '', updatedAt: '',
})

const perfilVazio = (ordem: number): PerfilTreinamento => ({
  id: 0, ordem, ativo: true, nome: '', negocio: '', emoji: '', dor: '', estilo: '',
  promptInstrucoes: '', createdAt: '', updatedAt: '',
})

export default function ConfiguracaoAcademiaView({ isGerente, modulos, perfis, setModulos, setPerfis }: Props) {
  const [aba, setAba] = useState<'modulos' | 'perfis'>('modulos')
  const [editandoM, setEditandoM] = useState<ModuloTreinamento | null>(null)
  const [editandoP, setEditandoP] = useState<PerfilTreinamento | null>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => { setEditandoM(null); setEditandoP(null) }, [aba])

  if (!isGerente) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p className="text-sm">Apenas gerentes podem acessar a configuração da Academia.</p>
      </div>
    )
  }

  function mostrarMsg(texto: string) {
    setMsg(texto)
    setTimeout(() => setMsg(null), 3000)
  }

  async function sugerirPrompt(tipo: 'modulo' | 'perfil', dados: any) {
    setLoading(true)
    try {
      const system = `Você é um especialista em prompts de IA para treinamento comercial da MF Paris / Okeylac. Use o contexto abaixo para criar uma instrução curta, objetiva e no tom da empresa.

${MANIFESTO_COMERCIAL_OKEYLAC}

${REGRAS_MF_PARIS}`
      const user = `Crie um prompt de instrução para a IA do roleplay (personagem cliente fictício) para o ${tipo === 'modulo' ? 'MÓDULO' : 'PERFIL'} a seguir. Não escreva como tutorial pro vendedor; escreva instruções DIRETAS para a IA interpretar o personagem.

Dados: ${JSON.stringify(dados, null, 2)}

Prompt (máximo 8 linhas):`
      const resp = await callAI([{ role: 'user', content: user }], system)
      if (tipo === 'modulo' && editandoM) setEditandoM({ ...editandoM, promptInstrucoes: resp.trim() })
      if (tipo === 'perfil' && editandoP) setEditandoP({ ...editandoP, promptInstrucoes: resp.trim() })
    } catch (e: any) {
      mostrarMsg('Erro ao sugerir prompt: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── MÓDULOS ─────────────────────────────────────
  function editarModulo(m: ModuloTreinamento) { setAba('modulos'); setEditandoM({ ...m }) }
  function novoModulo() { setAba('modulos'); setEditandoM(moduloVazio(modulos.length)) }

  async function salvarModulo() {
    if (!editandoM) return
    setLoading(true)
    try {
      let saved: ModuloTreinamento | undefined
      if (editandoM.id) {
        saved = await updateModuloTreinamento(editandoM.id, editandoM)
        if (saved) setModulos(modulos.map(m => m.id === saved!.id ? saved! : m))
      } else {
        const { id, createdAt, updatedAt, ...rest } = editandoM as any
        saved = await insertModuloTreinamento(rest)
        setModulos([...modulos, saved].sort((a, b) => a.ordem - b.ordem))
      }
      setEditandoM(null)
      mostrarMsg('Módulo salvo.')
    } catch (e: any) {
      mostrarMsg('Erro ao salvar módulo: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function excluirModulo(id: number) {
    if (!confirm('Excluir este módulo?')) return
    setLoading(true)
    try {
      await deleteModuloTreinamento(id)
      setModulos(modulos.filter(m => m.id !== id))
    } catch (e: any) {
      mostrarMsg('Erro ao excluir: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function moverModulo(id: number, dir: -1 | 1) {
    const idx = modulos.findIndex(m => m.id === id)
    const j = idx + dir
    if (idx < 0 || j < 0 || j >= modulos.length) return
    const a = { ...modulos[idx], ordem: j }
    const b = { ...modulos[j], ordem: idx }
    setLoading(true)
    try {
      const [ua, ub] = await Promise.all([
        updateModuloTreinamento(a.id, { ordem: a.ordem }),
        updateModuloTreinamento(b.id, { ordem: b.ordem }),
      ])
      const nova = [...modulos]
      if (ua) nova[idx] = ua
      if (ub) nova[j] = ub
      setModulos(nova.sort((x, y) => x.ordem - y.ordem))
    } catch (e: any) {
      mostrarMsg('Erro ao reordenar: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function toggleAtivoModulo(m: ModuloTreinamento) {
    setLoading(true)
    try {
      const saved = await updateModuloTreinamento(m.id, { ativo: !m.ativo })
      if (saved) setModulos(modulos.map(x => x.id === saved.id ? saved : x))
    } catch (e: any) {
      mostrarMsg('Erro: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── PERFIS ─────────────────────────────────────
  function editarPerfil(p: PerfilTreinamento) { setAba('perfis'); setEditandoP({ ...p }) }
  function novoPerfil() { setAba('perfis'); setEditandoP(perfilVazio(perfis.length)) }

  async function salvarPerfil() {
    if (!editandoP) return
    setLoading(true)
    try {
      let saved: PerfilTreinamento | undefined
      if (editandoP.id) {
        saved = await updatePerfilTreinamento(editandoP.id, editandoP)
        if (saved) setPerfis(perfis.map(p => p.id === saved!.id ? saved! : p))
      } else {
        const { id, createdAt, updatedAt, ...rest } = editandoP as any
        saved = await insertPerfilTreinamento(rest)
        setPerfis([...perfis, saved].sort((a, b) => a.ordem - b.ordem))
      }
      setEditandoP(null)
      mostrarMsg('Perfil salvo.')
    } catch (e: any) {
      mostrarMsg('Erro ao salvar perfil: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function excluirPerfil(id: number) {
    if (!confirm('Excluir este perfil?')) return
    setLoading(true)
    try {
      await deletePerfilTreinamento(id)
      setPerfis(perfis.filter(p => p.id !== id))
    } catch (e: any) {
      mostrarMsg('Erro ao excluir: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function moverPerfil(id: number, dir: -1 | 1) {
    const idx = perfis.findIndex(p => p.id === id)
    const j = idx + dir
    if (idx < 0 || j < 0 || j >= perfis.length) return
    const a = { ...perfis[idx], ordem: j }
    const b = { ...perfis[j], ordem: idx }
    setLoading(true)
    try {
      const [ua, ub] = await Promise.all([
        updatePerfilTreinamento(a.id, { ordem: a.ordem }),
        updatePerfilTreinamento(b.id, { ordem: b.ordem }),
      ])
      const nova = [...perfis]
      if (ua) nova[idx] = ua
      if (ub) nova[j] = ub
      setPerfis(nova.sort((x, y) => x.ordem - y.ordem))
    } catch (e: any) {
      mostrarMsg('Erro ao reordenar: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function toggleAtivoPerfil(p: PerfilTreinamento) {
    setLoading(true)
    try {
      const saved = await updatePerfilTreinamento(p.id, { ativo: !p.ativo })
      if (saved) setPerfis(perfis.map(x => x.id === saved.id ? saved : x))
    } catch (e: any) {
      mostrarMsg('Erro: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 space-y-4">
      {msg && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-2 text-sm text-blue-700 dark:text-blue-300">
          {msg}
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700">
        {(['modulos', 'perfis'] as const).map(t => (
          <button key={t} onClick={() => setAba(t)}
            className={`px-4 py-2 text-sm font-medium capitalize ${aba === t ? 'border-b-2 border-primary-500 text-primary-600' : 'text-gray-500'}`}>
            {t}
          </button>
        ))}
      </div>

      {aba === 'modulos' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Módulos de Treinamento</h2>
            <button onClick={novoModulo} disabled={loading} className="flex items-center gap-1 px-3 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
              <PlusIcon className="h-4 w-4" /> Novo
            </button>
          </div>

          {!editandoM && (
            <div className="space-y-2">
              {modulos.map((m, i) => (
                <div key={m.id} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{m.emoji}</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{m.titulo}</p>
                      <p className="text-xs text-gray-500">{m.dificuldade} · {m.ativo ? 'Ativo' : 'Inativo'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => moverModulo(m.id, -1)} disabled={i === 0 || loading} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><ChevronUpIcon className="h-4 w-4" /></button>
                    <button onClick={() => moverModulo(m.id, 1)} disabled={i === modulos.length - 1 || loading} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><ChevronDownIcon className="h-4 w-4" /></button>
                    <button onClick={() => toggleAtivoModulo(m)} disabled={loading} className={`px-2 py-1 text-xs rounded ${m.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{m.ativo ? 'Ativo' : 'Inativo'}</button>
                    <button onClick={() => editarModulo(m)} disabled={loading} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><PencilIcon className="h-4 w-4" /></button>
                    <button onClick={() => excluirModulo(m.id)} disabled={loading} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><TrashIcon className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {editandoM && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input value={editandoM.titulo} onChange={e => setEditandoM({ ...editandoM, titulo: e.target.value })} placeholder="Título" className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:border-gray-600" />
                <input value={editandoM.emoji} onChange={e => setEditandoM({ ...editandoM, emoji: e.target.value })} placeholder="Emoji" className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:border-gray-600" />
              </div>
              <input value={editandoM.descricao} onChange={e => setEditandoM({ ...editandoM, descricao: e.target.value })} placeholder="Descrição" className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:border-gray-600" />
              <input value={editandoM.objetivo} onChange={e => setEditandoM({ ...editandoM, objetivo: e.target.value })} placeholder="Objetivo" className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:border-gray-600" />
              <div className="grid grid-cols-2 gap-3">
                <select value={editandoM.dificuldade} onChange={e => setEditandoM({ ...editandoM, dificuldade: e.target.value as any })} className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:border-gray-600">
                  {DIFICULDADES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={editandoM.ativo} onChange={e => setEditandoM({ ...editandoM, ativo: e.target.checked })} /> Ativo
                </label>
              </div>
              <textarea value={editandoM.promptInstrucoes} onChange={e => setEditandoM({ ...editandoM, promptInstrucoes: e.target.value })} placeholder="Prompt de instruções para a IA..." rows={5} className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:border-gray-600" />
              <div className="flex gap-2">
                <button onClick={() => sugerirPrompt('modulo', { titulo: editandoM.titulo, descricao: editandoM.descricao, objetivo: editandoM.objetivo, dificuldade: editandoM.dificuldade })}
                  disabled={loading || !editandoM.titulo} className="flex items-center gap-1 px-3 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200 disabled:opacity-50">
                  <SparklesIcon className="h-4 w-4" /> Sugerir prompt com IA
                </button>
                <div className="flex-1" />
                <button onClick={() => setEditandoM(null)} className="flex items-center gap-1 px-3 py-2 text-gray-600 rounded-lg text-sm hover:bg-gray-100"><XMarkIcon className="h-4 w-4" /> Cancelar</button>
                <button onClick={salvarModulo} disabled={loading || !editandoM.titulo} className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"><CheckIcon className="h-4 w-4" /> Salvar</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Perfis de Cliente</h2>
            <button onClick={novoPerfil} disabled={loading} className="flex items-center gap-1 px-3 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
              <PlusIcon className="h-4 w-4" /> Novo
            </button>
          </div>

          {!editandoP && (
            <div className="space-y-2">
              {perfis.map((p, i) => (
                <div key={p.id} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{p.emoji}</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{p.nome}</p>
                      <p className="text-xs text-gray-500">{p.negocio} · {p.ativo ? 'Ativo' : 'Inativo'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => moverPerfil(p.id, -1)} disabled={i === 0 || loading} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><ChevronUpIcon className="h-4 w-4" /></button>
                    <button onClick={() => moverPerfil(p.id, 1)} disabled={i === perfis.length - 1 || loading} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><ChevronDownIcon className="h-4 w-4" /></button>
                    <button onClick={() => toggleAtivoPerfil(p)} disabled={loading} className={`px-2 py-1 text-xs rounded ${p.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{p.ativo ? 'Ativo' : 'Inativo'}</button>
                    <button onClick={() => editarPerfil(p)} disabled={loading} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><PencilIcon className="h-4 w-4" /></button>
                    <button onClick={() => excluirPerfil(p.id)} disabled={loading} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><TrashIcon className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {editandoP && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input value={editandoP.nome} onChange={e => setEditandoP({ ...editandoP, nome: e.target.value })} placeholder="Nome do cliente" className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:border-gray-600" />
                <input value={editandoP.emoji} onChange={e => setEditandoP({ ...editandoP, emoji: e.target.value })} placeholder="Emoji" className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:border-gray-600" />
              </div>
              <input value={editandoP.negocio} onChange={e => setEditandoP({ ...editandoP, negocio: e.target.value })} placeholder="Negócio" className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:border-gray-600" />
              <input value={editandoP.dor} onChange={e => setEditandoP({ ...editandoP, dor: e.target.value })} placeholder="Dor principal" className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:border-gray-600" />
              <input value={editandoP.estilo} onChange={e => setEditandoP({ ...editandoP, estilo: e.target.value })} placeholder="Estilo de comportamento" className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:border-gray-600" />
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={editandoP.ativo} onChange={e => setEditandoP({ ...editandoP, ativo: e.target.checked })} /> Ativo
              </label>
              <textarea value={editandoP.promptInstrucoes} onChange={e => setEditandoP({ ...editandoP, promptInstrucoes: e.target.value })} placeholder="Prompt de instruções para a IA..." rows={5} className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:border-gray-600" />
              <div className="flex gap-2">
                <button onClick={() => sugerirPrompt('perfil', { nome: editandoP.nome, negocio: editandoP.negocio, dor: editandoP.dor, estilo: editandoP.estilo })}
                  disabled={loading || !editandoP.nome} className="flex items-center gap-1 px-3 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200 disabled:opacity-50">
                  <SparklesIcon className="h-4 w-4" /> Sugerir prompt com IA
                </button>
                <div className="flex-1" />
                <button onClick={() => setEditandoP(null)} className="flex items-center gap-1 px-3 py-2 text-gray-600 rounded-lg text-sm hover:bg-gray-100"><XMarkIcon className="h-4 w-4" /> Cancelar</button>
                <button onClick={salvarPerfil} disabled={loading || !editandoP.nome} className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"><CheckIcon className="h-4 w-4" /> Salvar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
