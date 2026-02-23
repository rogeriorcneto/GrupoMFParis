import React from 'react'
import { PlusIcon, AdjustmentsHorizontalIcon, MagnifyingGlassIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline'
import type { ClientesViewProps, Cliente } from '../../types'

const ClientesView: React.FC<ClientesViewProps> = ({ clientes, vendedores, onNewCliente, onEditCliente, onImportClientes, onDeleteCliente, onDeleteAll }) => {
  const [searchTerm, setSearchTerm] = React.useState('')
  const [showFilters, setShowFilters] = React.useState(false)
  const [filterEtapa, setFilterEtapa] = React.useState('')
  const [filterVendedor, setFilterVendedor] = React.useState('')
  const [filterScoreMin, setFilterScoreMin] = React.useState('')
  const [filterValorMin, setFilterValorMin] = React.useState('')
  const [showDeleteAllModal, setShowDeleteAllModal] = React.useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = React.useState('')
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [showMenu, setShowMenu] = React.useState(false)
  const [openCardMenu, setOpenCardMenu] = React.useState<number | null>(null)
  const [deleteClienteModal, setDeleteClienteModal] = React.useState<Cliente | null>(null)
  const importRef = React.useRef<HTMLInputElement>(null)

  const filteredClientes = clientes.filter(cliente => {
    const matchSearch = cliente.razaoSocial.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.contatoNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.cnpj.includes(searchTerm)
    const matchEtapa = !filterEtapa || cliente.etapa === filterEtapa
    const matchVendedor = !filterVendedor || String(cliente.vendedorId) === filterVendedor
    const matchScore = !filterScoreMin || (cliente.score || 0) >= Number(filterScoreMin)
    const matchValor = !filterValorMin || (cliente.valorEstimado || 0) >= Number(filterValorMin)
    return matchSearch && matchEtapa && matchVendedor && matchScore && matchValor
  })

  const etapaConfig: Record<string, { label: string; badge: string; dot: string }> = {
    'prospecção': { label: 'Prospecção', badge: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
    'amostra': { label: 'Amostra', badge: 'bg-yellow-50 text-yellow-700', dot: 'bg-yellow-500' },
    'homologado': { label: 'Homologado', badge: 'bg-green-50 text-green-700', dot: 'bg-green-500' },
    'negociacao': { label: 'Negociação', badge: 'bg-purple-50 text-purple-700', dot: 'bg-purple-500' },
    'pos_venda': { label: 'Pós-Venda', badge: 'bg-pink-50 text-pink-700', dot: 'bg-pink-500' },
    'perdido': { label: 'Perdido', badge: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
  }

  // --- CSV handlers (extracted from JSX for cleanliness) ---
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.split('\n').filter(l => l.trim())
      if (lines.length < 2) { alert('CSV vazio ou sem dados'); return }

      const firstLine = lines[0]
      const countSemicolon = (firstLine.match(/;/g) || []).length
      const countComma = (firstLine.match(/,/g) || []).length
      const countTab = (firstLine.match(/\t/g) || []).length
      const sep = countTab > countComma && countTab > countSemicolon ? '\t' : countSemicolon > countComma ? ';' : ','

      const parseLine = (line: string): string[] => {
        const result: string[] = []
        let current = '', inQuotes = false
        for (let j = 0; j < line.length; j++) {
          const ch = line[j]
          if (ch === '"') { inQuotes = !inQuotes; continue }
          if (ch === sep && !inQuotes) { result.push(current.trim()); current = ''; continue }
          current += ch
        }
        result.push(current.trim())
        return result
      }

      const headers = parseLine(firstLine).map(h => h.replace(/^\uFEFF/, '').toLowerCase().trim())
      const isAgendor = headers.some(h => h.includes('código da empresa') || h.includes('codigo da empresa')) ||
        (headers.some(h => h.includes('razão social') || h.includes('razao social')) &&
         headers.some(h => h.includes('nome fantasia')))

      const novos: Cliente[] = []
      for (let i = 1; i < lines.length; i++) {
        const vals = parseLine(lines[i])
        const row: Record<string, string> = {}
        headers.forEach((h, idx) => { row[h] = vals[idx] || '' })

        if (isAgendor) {
          const razao = row['razão social'] || row['razao social'] || ''
          const fantasia = row['nome fantasia'] || ''
          if (!razao && !fantasia) continue

          const endParts = [
            row['rua'], row['número'] || row['numero'],
            row['complemento'] ? `(${row['complemento']})` : '',
            row['bairro'], row['cidade'],
            row['estado'], row['cep'] ? `CEP ${row['cep']}` : ''
          ].filter(Boolean)
          const endereco = endParts.join(', ')
          const tel = row['celular'] || row['whatsapp'] || row['telefone'] || ''
          const ranking = parseInt(row['ranking'] || '0')
          const score = ranking > 0 ? Math.min(ranking * 20, 100) : 30

          const notasParts: string[] = []
          if (row['setor']) notasParts.push(`Setor: ${row['setor']}`)
          if (row['descrição'] || row['descricao']) notasParts.push(`Obs: ${row['descrição'] || row['descricao']}`)
          if (row['website']) notasParts.push(`Site: ${row['website']}`)
          if (row['categoria']) notasParts.push(`Cat: ${row['categoria']}`)
          if (row['facebook']) notasParts.push(`FB: ${row['facebook']}`)
          if (row['instagram']) notasParts.push(`IG: ${row['instagram']}`)
          if (row['linkedin']) notasParts.push(`LI: ${row['linkedin']}`)
          if (row['fax']) notasParts.push(`Fax: ${row['fax']}`)
          if (row['ramal']) notasParts.push(`Ramal: ${row['ramal']}`)
          if (row['rádio'] || row['radio']) notasParts.push(`Rádio: ${row['rádio'] || row['radio']}`)
          if (row['skype']) notasParts.push(`Skype: ${row['skype']}`)
          if (row['nível de interesse'] || row['nivel de interesse']) notasParts.push(`Interesse: ${row['nível de interesse'] || row['nivel de interesse']}`)

          let ultInteracao = new Date().toISOString().split('T')[0]
          const dataStr = row['ultima atualização'] || row['ultima atualizacao'] || row['ultima atualização '] || row['data de cadastro'] || ''
          if (dataStr) {
            const match = dataStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
            if (match) {
              const ano = match[3].length === 2 ? '20' + match[3] : match[3]
              ultInteracao = `${ano}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
            }
          }

          novos.push({
            id: Date.now() + i, razaoSocial: razao || fantasia, nomeFantasia: fantasia,
            cnpj: (row['cnpj'] || '').replace(/[^\d./\-]/g, ''), contatoNome: '', contatoTelefone: tel,
            contatoEmail: row['e-mail'] || row['email'] || '', endereco, etapa: 'prospecção',
            origemLead: row['origem do cliente'] || row['origem do lead'] || row['origem'] || 'Agendor',
            notas: notasParts.length > 0 ? notasParts.join(' | ') : undefined,
            ultimaInteracao: ultInteracao, diasInativo: 0, score
          })
        } else {
          if (!row['razaosocial'] && !row['razao_social'] && !row['nome'] && !row['razão social']) continue
          novos.push({
            id: Date.now() + i,
            razaoSocial: row['razaosocial'] || row['razao_social'] || row['razão social'] || row['nome'] || `Importado ${i}`,
            nomeFantasia: row['nomefantasia'] || row['nome_fantasia'] || row['nome fantasia'] || '',
            cnpj: row['cnpj'] || '', contatoNome: row['contatonome'] || row['contato_nome'] || row['contato'] || '',
            contatoTelefone: row['contatotelefone'] || row['contato_telefone'] || row['telefone'] || '',
            contatoEmail: row['contatoemail'] || row['contato_email'] || row['email'] || row['e-mail'] || '',
            endereco: row['endereco'] || '', etapa: 'prospecção',
            valorEstimado: (row['valorestimado'] || row['valor_estimado'] || row['valor']) ? parseFloat(row['valorestimado'] || row['valor_estimado'] || row['valor']) : undefined,
            ultimaInteracao: new Date().toISOString().split('T')[0], diasInativo: 0, score: 30
          })
        }
      }
      if (novos.length === 0) { alert('Nenhum cliente válido encontrado no CSV.\nFormatos aceitos: CSV padrão ou exportação do Agendor.'); return }
      onImportClientes(novos)
      alert(`✅ ${novos.length} cliente(s) importado(s) com sucesso!${isAgendor ? '\n📋 Formato Agendor detectado automaticamente.' : ''}`)
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  const handleExportCSV = () => {
    const csv = 'razaoSocial,cnpj,contatoNome,contatoTelefone,contatoEmail,endereco,valorEstimado,etapa,score\n' +
      clientes.map(c => `"${c.razaoSocial}","${c.cnpj}","${c.contatoNome}","${c.contatoTelefone}","${c.contatoEmail}","${c.endereco || ''}","${c.valorEstimado || ''}","${c.etapa}","${c.score || 0}"`).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `clientes_${new Date().toISOString().split('T')[0]}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadModelo = () => {
    const modelo = 'razaoSocial,cnpj,contatoNome,contatoTelefone,contatoEmail,endereco,valorEstimado\n' +
      '"Padaria Exemplo","12.345.678/0001-99","João Silva","(31) 99999-1234","joao@exemplo.com","Rua das Flores 100, Belo Horizonte - MG","15000"\n' +
      '"Mercado Modelo","98.765.432/0001-11","Maria Santos","(31) 98888-5678","maria@modelo.com","Av. Brasil 500, Contagem - MG","25000"'
    const blob = new Blob(['\uFEFF' + modelo], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'modelo_importacao_clientes.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const filtersActive = !!(filterEtapa || filterVendedor || filterScoreMin || filterValorMin)
  const totalValor = filteredClientes.reduce((s, c) => s + (c.valorEstimado || 0), 0)

  return (
    <div className="space-y-3">
      {/* Hidden file input for CSV import */}
      <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filteredClientes.length}{filtersActive ? ` de ${clientes.length}` : ''} cliente{filteredClientes.length !== 1 ? 's' : ''}
            {totalValor > 0 ? ` · R$ ${totalValor.toLocaleString('pt-BR')} em pipeline` : ''}
          </p>
        </div>
        <button onClick={onNewCliente} className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-apple transition-colors shadow-apple-sm flex items-center gap-2 text-sm">
          <PlusIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Novo Cliente</span>
          <span className="sm:hidden">Novo</span>
        </button>
      </div>

      {/* Search + Filter + Menu */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, CNPJ ou contato..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-apple text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`p-2 rounded-apple border transition-colors flex-shrink-0 ${showFilters || filtersActive ? 'bg-primary-50 text-primary-600 border-primary-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
          title="Filtros"
        >
          <AdjustmentsHorizontalIcon className="h-5 w-5" />
        </button>
        <div className="relative flex-shrink-0">
          <button onClick={() => setShowMenu(!showMenu)} className="p-2 rounded-apple border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors" title="Mais opções">
            <EllipsisVerticalIcon className="h-5 w-5" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-apple shadow-lg border border-gray-200 z-40 py-1">
                <button onClick={() => { importRef.current?.click(); setShowMenu(false) }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left">
                  <span className="text-base">📥</span> Importar CSV
                </button>
                <button onClick={() => { handleExportCSV(); setShowMenu(false) }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left">
                  <span className="text-base">📤</span> Exportar CSV
                </button>
                <button onClick={() => { handleDownloadModelo(); setShowMenu(false) }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left">
                  <span className="text-base">📋</span> Baixar modelo CSV
                </button>
                {onDeleteAll && clientes.length > 0 && (
                  <>
                    <div className="border-t border-gray-100 my-1" />
                    <button onClick={() => { setShowDeleteAllModal(true); setShowMenu(false) }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-left">
                      <span className="text-base">🗑️</span> Apagar todos
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white rounded-apple border border-gray-200 p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Etapa</label>
              <select value={filterEtapa} onChange={(e) => setFilterEtapa(e.target.value)} className="w-full px-3 py-1.5 border border-gray-200 rounded-apple text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">Todas</option>
                <option value="prospecção">Prospecção</option>
                <option value="amostra">Amostra</option>
                <option value="homologado">Homologado</option>
                <option value="negociacao">Negociação</option>
                <option value="pos_venda">Pós-Venda</option>
                <option value="perdido">Perdido</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Vendedor</label>
              <select value={filterVendedor} onChange={(e) => setFilterVendedor(e.target.value)} className="w-full px-3 py-1.5 border border-gray-200 rounded-apple text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">Todos</option>
                {vendedores.filter(v => v.ativo).map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Score mín.</label>
              <input type="number" value={filterScoreMin} onChange={(e) => setFilterScoreMin(e.target.value)} placeholder="0" className="w-full px-3 py-1.5 border border-gray-200 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Valor mín. (R$)</label>
              <input type="number" value={filterValorMin} onChange={(e) => setFilterValorMin(e.target.value)} placeholder="0" className="w-full px-3 py-1.5 border border-gray-200 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
          {filtersActive && (
            <button onClick={() => { setFilterEtapa(''); setFilterVendedor(''); setFilterScoreMin(''); setFilterValorMin('') }} className="mt-2.5 text-xs text-primary-600 hover:text-primary-800 font-medium">
              ✕ Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {filteredClientes.length === 0 && (
        <div className="bg-white rounded-apple border border-gray-200 py-16 text-center">
          <div className="text-4xl mb-3">{clientes.length === 0 ? '📋' : '🔍'}</div>
          <p className="text-gray-600 font-medium">{clientes.length === 0 ? 'Nenhum cliente cadastrado ainda' : 'Nenhum cliente encontrado'}</p>
          <p className="text-sm text-gray-400 mt-1">{clientes.length === 0 ? 'Clique em "Novo Cliente" ou importe um CSV para começar.' : 'Tente ajustar os filtros ou o termo de busca.'}</p>
        </div>
      )}

      {/* ===== DESKTOP: Clean table (md+) ===== */}
      {filteredClientes.length > 0 && (
        <div className="hidden md:block bg-white rounded-apple border border-gray-200">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2.5 px-4 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Cliente</th>
                <th className="text-left py-2.5 px-4 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Etapa</th>
                <th className="text-left py-2.5 px-4 text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Vendedor</th>
                <th className="text-right py-2.5 px-4 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Valor</th>
                <th className="text-center py-2.5 px-4 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-16">Score</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredClientes.map((cliente) => {
                const v = vendedores.find(v => v.id === cliente.vendedorId)
                const cfg = etapaConfig[cliente.etapa] || { label: cliente.etapa, badge: 'bg-gray-50 text-gray-700', dot: 'bg-gray-400' }
                const scoreColor = (cliente.score || 0) >= 70 ? 'text-green-600' : (cliente.score || 0) >= 40 ? 'text-yellow-600' : 'text-gray-400'
                return (
                  <tr key={cliente.id} className="hover:bg-gray-50/60 transition-colors group cursor-pointer" onClick={() => onEditCliente(cliente)}>
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-900 text-sm leading-tight">{cliente.razaoSocial}</p>
                      <p className="text-xs text-gray-400 mt-0.5 leading-tight">
                        {[cliente.contatoNome, cliente.contatoTelefone].filter(Boolean).join(' · ') || cliente.cnpj || '—'}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full ${cfg.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      {v ? <span className="text-sm text-gray-600">{v.nome.split(' ')[0]}</span> : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {cliente.valorEstimado ? (
                        <span className="text-sm font-medium text-gray-800">R$ {cliente.valorEstimado.toLocaleString('pt-BR')}</span>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs font-bold ${scoreColor}`}>{cliente.score || 0}</span>
                    </td>
                    <td className="py-3 px-2" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setDeleteClienteModal(cliente)}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all p-1 rounded-apple text-sm"
                        title="Excluir"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== MOBILE: Card list (< md) ===== */}
      {filteredClientes.length > 0 && (
        <div className="md:hidden space-y-2">
          {filteredClientes.map((cliente) => {
            const v = vendedores.find(v => v.id === cliente.vendedorId)
            const cfg = etapaConfig[cliente.etapa] || { label: cliente.etapa, badge: 'bg-gray-50 text-gray-700', dot: 'bg-gray-400' }
            const scoreColor = (cliente.score || 0) >= 70 ? 'text-green-600' : (cliente.score || 0) >= 40 ? 'text-yellow-600' : 'text-gray-400'
            return (
              <div
                key={cliente.id}
                className="bg-white rounded-apple border border-gray-200 p-3.5 active:bg-gray-50 transition-colors"
                onClick={() => onEditCliente(cliente)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 text-sm truncate">{cliente.razaoSocial}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {[cliente.contatoNome, cliente.contatoTelefone].filter(Boolean).join(' · ') || cliente.cnpj || '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <span className={`text-xs font-bold ${scoreColor}`}>{cliente.score || 0}</span>
                    <div className="relative">
                      <button
                        onClick={() => setOpenCardMenu(openCardMenu === cliente.id ? null : cliente.id)}
                        className="p-1 text-gray-400 hover:text-gray-600 rounded-apple"
                      >
                        <EllipsisVerticalIcon className="h-4 w-4" />
                      </button>
                      {openCardMenu === cliente.id && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setOpenCardMenu(null)} />
                          <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-apple shadow-lg border border-gray-200 z-40 py-1">
                            <button onClick={() => { onEditCliente(cliente); setOpenCardMenu(null) }} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left">
                              ✏️ Editar
                            </button>
                            <button onClick={() => { setDeleteClienteModal(cliente); setOpenCardMenu(null) }} className="w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-left">
                              🗑️ Excluir
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full ${cfg.badge}`}>
                    <span className={`w-1 h-1 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>
                  {v && <span className="text-[10px] text-gray-400">{v.nome.split(' ')[0]}</span>}
                  {cliente.valorEstimado ? (
                    <span className="text-[10px] font-semibold text-gray-600 ml-auto">R$ {cliente.valorEstimado.toLocaleString('pt-BR')}</span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal - Apagar Todos */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowDeleteAllModal(false)}>
          <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">⚠️</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Apagar TODOS os clientes?</h3>
              <p className="text-sm text-gray-500 mt-2">
                Esta ação vai remover <span className="font-bold text-red-600">{clientes.length} clientes</span> permanentemente,
                junto com todas as interações, tarefas e histórico associados.
              </p>
              <p className="text-sm text-red-600 font-bold mt-3">Esta ação NÃO pode ser desfeita!</p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Digite <span className="font-bold text-red-600">APAGAR</span> para confirmar:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Digite APAGAR aqui"
                className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-red-500 text-center font-bold"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteAllModal(false); setDeleteConfirmText('') }}
                className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-apple font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (deleteConfirmText !== 'APAGAR' || !onDeleteAll) return
                  setIsDeleting(true)
                  try {
                    await onDeleteAll()
                    setShowDeleteAllModal(false)
                    setDeleteConfirmText('')
                  } catch (err) {
                    alert('Erro ao apagar clientes. Tente novamente.')
                  } finally {
                    setIsDeleting(false)
                  }
                }}
                disabled={deleteConfirmText !== 'APAGAR' || isDeleting}
                className={`flex-1 px-4 py-2.5 rounded-apple font-medium transition-colors ${deleteConfirmText === 'APAGAR' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
              >
                {isDeleting ? '⏳ Apagando...' : '🗑️ Apagar Tudo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal - Confirmar Exclusão de Cliente Individual */}
      {deleteClienteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteClienteModal(null)}>
          <div className="bg-white rounded-apple shadow-apple-lg max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">🗑️</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Excluir Cliente</h3>
              <p className="text-sm text-gray-600 mt-2">Tem certeza que deseja excluir <strong>{deleteClienteModal.razaoSocial}</strong>?</p>
              <p className="text-xs text-gray-400 mt-1">Esta ação não pode ser desfeita. Interações, tarefas e histórico serão removidos.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteClienteModal(null)} className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-apple font-medium transition-colors">Cancelar</button>
              <button onClick={() => { onDeleteCliente(deleteClienteModal.id); setDeleteClienteModal(null) }} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-apple font-medium transition-colors">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ClientesView
