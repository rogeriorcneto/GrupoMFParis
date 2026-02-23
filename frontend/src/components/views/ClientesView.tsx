import React from 'react'
import { PlusIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline'
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

                  // Auto-detectar separador (;  ,  ou tab)
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

                  // Detectar formato Agendor
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
                        id: Date.now() + i,
                        razaoSocial: razao || fantasia,
                        nomeFantasia: fantasia,
                        cnpj: (row['cnpj'] || '').replace(/[^\d./\-]/g, ''),
                        contatoNome: '',
                        contatoTelefone: tel,
                        contatoEmail: row['e-mail'] || row['email'] || '',
                        endereco,
                        etapa: 'prospecção',
                        origemLead: row['origem do cliente'] || row['origem do lead'] || row['origem'] || 'Agendor',
                        notas: notasParts.length > 0 ? notasParts.join(' | ') : undefined,
                        ultimaInteracao: ultInteracao,
                        diasInativo: 0,
                        score
                      })
                    } else {
                      if (!row['razaosocial'] && !row['razao_social'] && !row['nome'] && !row['razão social']) continue
                      novos.push({
                        id: Date.now() + i,
                        razaoSocial: row['razaosocial'] || row['razao_social'] || row['razão social'] || row['nome'] || `Importado ${i}`,
                        nomeFantasia: row['nomefantasia'] || row['nome_fantasia'] || row['nome fantasia'] || '',
                        cnpj: row['cnpj'] || '',
                        contatoNome: row['contatonome'] || row['contato_nome'] || row['contato'] || '',
                        contatoTelefone: row['contatotelefone'] || row['contato_telefone'] || row['telefone'] || '',
                        contatoEmail: row['contatoemail'] || row['contato_email'] || row['email'] || row['e-mail'] || '',
                        endereco: row['endereco'] || '',
                        etapa: 'prospecção',
                        valorEstimado: (row['valorestimado'] || row['valor_estimado'] || row['valor']) ? parseFloat(row['valorestimado'] || row['valor_estimado'] || row['valor']) : undefined,
                        ultimaInteracao: new Date().toISOString().split('T')[0],
                        diasInativo: 0,
                        score: 30
                      })
                    }
                  }
                  if (novos.length === 0) { alert('Nenhum cliente válido encontrado no CSV.\nFormatos aceitos: CSV padrão ou exportação do Agendor.'); return }
                  onImportClientes(novos)
                  alert(`✅ ${novos.length} cliente(s) importado(s) com sucesso!${isAgendor ? '\n📋 Formato Agendor detectado automaticamente.' : ''}`)
                }
                reader.readAsText(file, 'UTF-8')
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
          {onDeleteAll && clientes.length > 0 && (
            <button
              onClick={() => setShowDeleteAllModal(true)}
              className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-3 rounded-apple transition-colors duration-200 shadow-apple-sm flex items-center text-sm"
            >
              🗑️ Apagar Todos
            </button>
          )}
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

      {/* Modal de confirmação - Apagar Todos */}
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
    </div>
  )
}

export default ClientesView
