import React, { ReactNode } from 'react'

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
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-lg flex flex-col">
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
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-700 hover:bg-gray-100'
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

        <div className="p-3 border-t border-gray-200">
          <button
            onClick={onVoltarPortal}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
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
