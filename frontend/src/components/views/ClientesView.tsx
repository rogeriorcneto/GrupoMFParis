import React from 'react'
import { PlusIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline'
import type { ClientesViewProps, Cliente } from '../../types'

const ClientesView: React.FC<ClientesViewProps> = ({ clientes, vendedores, onNewCliente, onEditCliente, onImportClientes, onDeleteCliente }) => {
  const [searchTerm, setSearchTerm] = React.useState('')
  const [showFilters, setShowFilters] = React.useState(false)
  const [filterEtapa, setFilterEtapa] = React.useState('')
  const [filterVendedor, setFilterVendedor] = React.useState('')
  const [filterScoreMin, setFilterScoreMin] = React.useState('')
  const [filterValorMin, setFilterValorMin] = React.useState('')

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

  const getEtapaColor = (etapa: string) => {
    switch (etapa) {
      case 'prospecção': return 'bg-blue-100 text-blue-800'
      case 'amostra': return 'bg-yellow-100 text-yellow-800'
      case 'homologado': return 'bg-green-100 text-green-800'
      case 'negociacao': return 'bg-purple-100 text-purple-800'
      case 'pos_venda': return 'bg-pink-100 text-pink-800'
      case 'perdido': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
        <input
          type="text"
          placeholder="Buscar clientes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-4 py-2.5 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent w-full sm:w-80 lg:w-96"
        />
        <div className="flex gap-2 flex-wrap">
          <label className="bg-white hover:bg-gray-50 text-gray-700 font-medium py-2 px-3 sm:px-4 rounded-apple transition-colors duration-200 shadow-apple-sm border border-gray-300 flex items-center cursor-pointer text-sm">
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = (ev) => {
                  const text = ev.target?.result as string
                  const lines = text.split('\n').filter(l => l.trim())
                  if (lines.length < 2) { alert('CSV vazio ou sem dados'); return }
                  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
                  const novos: Cliente[] = []
                  for (let i = 1; i < lines.length; i++) {
                    const vals = lines[i].match(/(".*?"|[^",]+)/g)?.map(v => v.trim().replace(/^"|"$/g, '')) || []
                    const row: Record<string, string> = {}
                    headers.forEach((h, idx) => { row[h] = vals[idx] || '' })
                    if (!row['razaosocial'] && !row['razao_social'] && !row['nome']) continue
                    novos.push({
                      id: Date.now() + i,
                      razaoSocial: row['razaosocial'] || row['razao_social'] || row['nome'] || `Importado ${i}`,
                      nomeFantasia: '',
                      cnpj: row['cnpj'] || '',
                      contatoNome: row['contatonome'] || row['contato_nome'] || row['contato'] || '',
                      contatoTelefone: row['contatotelefone'] || row['contato_telefone'] || row['telefone'] || '',
                      contatoEmail: row['contatoemail'] || row['contato_email'] || row['email'] || '',
                      endereco: row['endereco'] || '',
                      etapa: 'prospecção',
                      valorEstimado: row['valorestimado'] || row['valor_estimado'] || row['valor'] ? parseFloat(row['valorestimado'] || row['valor_estimado'] || row['valor']) : undefined,
                      ultimaInteracao: new Date().toISOString().split('T')[0],
                      diasInativo: 0,
                      score: 30
                    })
                  }
                  if (novos.length === 0) { alert('Nenhum cliente válido encontrado no CSV.\nVerifique se o cabeçalho contém: razaoSocial, cnpj, contatoNome, contatoTelefone, contatoEmail'); return }
                  onImportClientes(novos)
                  alert(`✅ ${novos.length} cliente(s) importado(s) com sucesso!`)
                }
                reader.readAsText(file)
                e.target.value = ''
              }}
            />
            📥 Importar CSV
          </label>
          <button
            onClick={() => {
              const modelo = 'razaoSocial,cnpj,contatoNome,contatoTelefone,contatoEmail,endereco,valorEstimado\n' +
                '"Padaria Exemplo","12.345.678/0001-99","João Silva","(31) 99999-1234","joao@exemplo.com","Rua das Flores 100, Belo Horizonte - MG","15000"\n' +
                '"Mercado Modelo","98.765.432/0001-11","Maria Santos","(31) 98888-5678","maria@modelo.com","Av. Brasil 500, Contagem - MG","25000"'
              const blob = new Blob(['\uFEFF' + modelo], { type: 'text/csv;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'modelo_importacao_clientes.csv'
              a.click()
              URL.revokeObjectURL(url)
            }}
            className="bg-white hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-apple transition-colors duration-200 shadow-apple-sm border border-gray-300 flex items-center text-sm"
          >
            📋 Modelo CSV
          </button>
          <button
            onClick={() => {
              const csv = 'razaoSocial,cnpj,contatoNome,contatoTelefone,contatoEmail,endereco,valorEstimado,etapa,score\n' +
                clientes.map(c => `"${c.razaoSocial}","${c.cnpj}","${c.contatoNome}","${c.contatoTelefone}","${c.contatoEmail}","${c.endereco || ''}","${c.valorEstimado || ''}","${c.etapa}","${c.score || 0}"`).join('\n')
              const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `clientes_${new Date().toISOString().split('T')[0]}.csv`
              a.click()
              URL.revokeObjectURL(url)
            }}
            className="bg-white hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-apple transition-colors duration-200 shadow-apple-sm border border-gray-300 flex items-center"
          >
            📤 Exportar CSV
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`py-2 px-4 rounded-apple transition-colors duration-200 shadow-apple-sm border flex items-center font-medium ${showFilters ? 'bg-primary-50 text-primary-700 border-primary-300' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'}`}
          >
            <AdjustmentsHorizontalIcon className="h-4 w-4 mr-2" />
            Filtros
          </button>
          <button
            onClick={onNewCliente}
            className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-apple transition-colors duration-200 shadow-apple-sm flex items-center"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Novo Cliente
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Etapa</label>
              <select value={filterEtapa} onChange={(e) => setFilterEtapa(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Vendedor</label>
              <select value={filterVendedor} onChange={(e) => setFilterVendedor(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">Todos</option>
                {vendedores.filter(v => v.ativo).map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Score mínimo</label>
              <input type="number" value={filterScoreMin} onChange={(e) => setFilterScoreMin(e.target.value)} placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Valor mínimo (R$)</label>
              <input type="number" value={filterValorMin} onChange={(e) => setFilterValorMin(e.target.value)} placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
          <div className="flex justify-between items-center mt-3">
            <p className="text-xs text-gray-500">{filteredClientes.length} de {clientes.length} clientes</p>
            <button onClick={() => { setFilterEtapa(''); setFilterVendedor(''); setFilterScoreMin(''); setFilterValorMin('') }} className="text-xs text-primary-600 hover:text-primary-800 font-medium">Limpar filtros</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Cliente</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Contato</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Etapa</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Vendedor</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Score</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredClientes.length === 0 && (
                <tr><td colSpan={6} className="py-12 text-center">
                  <p className="text-gray-400 text-lg mb-2">{clientes.length === 0 ? '📋 Nenhum cliente cadastrado ainda' : '🔍 Nenhum cliente encontrado'}</p>
                  <p className="text-gray-400 text-sm">{clientes.length === 0 ? 'Clique em "Novo Cliente" ou importe um CSV para começar.' : 'Tente ajustar os filtros ou termo de busca.'}</p>
                </td></tr>
              )}
              {filteredClientes.map((cliente) => (
                <tr key={cliente.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div>
                      <p className="font-medium text-gray-900">{cliente.razaoSocial}</p>
                      <p className="text-sm text-gray-500">{cliente.cnpj}</p>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div>
                      <p className="text-gray-900">{cliente.contatoNome}</p>
                      <p className="text-sm text-gray-500">{cliente.contatoTelefone}</p>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getEtapaColor(cliente.etapa)}`}>
                      {cliente.etapa.charAt(0).toUpperCase() + cliente.etapa.slice(1)}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {(() => {
                      const v = vendedores.find(v => v.id === cliente.vendedorId)
                      return v ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center">
                            <span className="text-xs font-bold text-primary-700">{v.avatar}</span>
                          </div>
                          <span className="text-sm text-gray-900">{v.nome}</span>
                        </div>
                      ) : <span className="text-xs text-gray-400">—</span>
                    })()}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center">
                      <span className="text-gray-900">{cliente.score}</span>
                      <div className="ml-2 w-16 bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${cliente.score}%` }}></div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onEditCliente(cliente)}
                        className="text-primary-600 hover:text-primary-800 text-sm font-medium"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => { if (window.confirm(`Excluir "${cliente.razaoSocial}"? Esta ação não pode ser desfeita.`)) onDeleteCliente(cliente.id) }}
                        className="text-red-500 hover:text-red-700 text-sm font-medium"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default ClientesView
