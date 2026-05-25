import React, { ReactNode } from 'react'
import { useDarkMode } from '../../hooks/useDarkMode'
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline'

interface ErpMenuItem {
  id: string
  label: string
  icone: string
  badge?: number
}

interface ErpLayoutProps {
  titulo: string
  subtitulo?: string
  icone: string
  cor: string // gradient classes ex: "from-blue-500 to-blue-700"
  menu: ErpMenuItem[]
  activeMenu: string
  onMenuChange: (id: string) => void
  onVoltarPortal: () => void
  children: ReactNode
}

export default function ErpLayout({
  titulo, subtitulo, icone, cor, menu, activeMenu, onMenuChange, onVoltarPortal, children
}: ErpLayoutProps) {
  const { dark, toggleDark } = useDarkMode()
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-gray-900 shadow-lg flex flex-col border-r border-gray-200 dark:border-gray-800">
        <div className={`bg-gradient-to-br ${cor} p-5 text-white`}>
          <div className="flex items-center gap-3">
            <div className="text-3xl">{icone}</div>
            <div>
              <h1 className="font-bold text-lg leading-tight">{titulo}</h1>
              {subtitulo && <p className="text-xs opacity-90">{subtitulo}</p>}
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {menu.map(item => (
            <button
              key={item.id}
              onClick={() => onMenuChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeMenu === item.id
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <span className="text-lg">{item.icone}</span>
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-200 dark:border-gray-800 space-y-2">
          <button
            onClick={toggleDark}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium transition-colors"
            title={dark ? 'Modo claro' : 'Modo escuro'}
          >
            {dark ? <SunIcon className="h-4 w-4 text-amber-500" /> : <MoonIcon className="h-4 w-4" />}
            <span>{dark ? 'Modo claro' : 'Modo escuro'}</span>
          </button>
          <button
            onClick={onVoltarPortal}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium transition-colors"
          >
            ← Portal Grupo Paris
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
