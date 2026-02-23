import React from 'react'
import { PlusIcon, XMarkIcon, PhotoIcon } from '@heroicons/react/24/outline'
import type { Produto } from '../../types'

const ProdutosView: React.FC<{
  produtos: Produto[]
  onAdd: (p: Produto) => void
  onUpdate: (p: Produto) => void
  onDelete: (id: number) => void
  isGerente: boolean
}> = ({ produtos, onAdd, onUpdate, onDelete, isGerente }) => {
  const [search, setSearch] = React.useState('')
  const [filterCategoria, setFilterCategoria] = React.useState('')
  const [filterAtivo, setFilterAtivo] = React.useState<string>('')
  const [showModal, setShowModal] = React.useState(false)
  const [editing, setEditing] = React.useState<Produto | null>(null)
  const [previewId, setPreviewId] = React.useState<number | null>(null)

  const [fNome, setFNome] = React.useState('')
  const [fDescricao, setFDescricao] = React.useState('')
  const [fCategoria, setFCategoria] = React.useState<Produto['categoria']>('sacaria')
  const [fPreco, setFPreco] = React.useState('')
  const [fUnidade, setFUnidade] = React.useState('un')
  const [fFoto, setFFoto] = React.useState('')
  const [fSku, setFSku] = React.useState('')
  const [fEstoque, setFEstoque] = React.useState('')
  const [fPesoKg, setFPesoKg] = React.useState('')
  const [fMargemLucro, setFMargemLucro] = React.useState('')
  const [fAtivo, setFAtivo] = React.useState(true)
  const [fDestaque, setFDestaque] = React.useState(false)

  const filtered = produtos.filter(p => {
    const matchSearch = p.nome.toLowerCase().includes(search.toLowerCase()) || (p.sku || '').toLowerCase().includes(search.toLowerCase())
    const matchCat = !filterCategoria || p.categoria === filterCategoria
    const matchAtivo = filterAtivo === '' || (filterAtivo === 'ativo' ? p.ativo : !p.ativo)
    return matchSearch && matchCat && matchAtivo
  })

  const openNew = () => {
    setEditing(null)
    setFNome(''); setFDescricao(''); setFCategoria('sacaria'); setFPreco(''); setFUnidade('sc')
    setFFoto(''); setFSku(''); setFEstoque(''); setFPesoKg(''); setFMargemLucro('')
    setFAtivo(true); setFDestaque(false); setShowModal(true)
  }

  const openEdit = (p: Produto) => {
    setEditing(p)
    setFNome(p.nome); setFDescricao(p.descricao); setFCategoria(p.categoria); setFPreco(String(p.preco)); setFUnidade(p.unidade)
    setFFoto(p.foto); setFSku(p.sku || ''); setFEstoque(p.estoque !== undefined ? String(p.estoque) : ''); setFPesoKg(p.pesoKg !== undefined ? String(p.pesoKg) : ''); setFMargemLucro(p.margemLucro !== undefined ? String(p.margemLucro) : '')
    setFAtivo(p.ativo); setFDestaque(p.destaque); setShowModal(true)
  }

  const handleFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { alert('Imagem deve ter no máximo 2MB'); return }
    const reader = new FileReader()
    reader.onload = (ev) => setFFoto(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSave = () => {
    if (!fNome.trim() || !fDescricao.trim() || !fPreco) return
    const prod: Produto = {
      id: editing ? editing.id : Date.now(),
      nome: fNome.trim(), descricao: fDescricao.trim(), categoria: fCategoria,
      preco: parseFloat(fPreco), unidade: fUnidade, foto: fFoto,
      sku: fSku.trim() || undefined, estoque: fEstoque ? parseInt(fEstoque) : undefined,
      pesoKg: fPesoKg ? parseFloat(fPesoKg) : undefined, margemLucro: fMargemLucro ? parseFloat(fMargemLucro) : undefined,
      ativo: fAtivo, destaque: fDestaque,
      dataCadastro: editing ? editing.dataCadastro : new Date().toISOString().split('T')[0]
    }
    if (editing) { onUpdate(prod) } else { onAdd(prod) }
    setShowModal(false)
  }

  const catLabel: Record<string, string> = { sacaria: 'Sacaria 25kg', okey_lac: 'Okey Lac 25kg', varejo_lacteo: 'Varejo Lácteo', cafe: 'Café', outros: 'Outros' }
  const catColor: Record<string, string> = { sacaria: 'bg-amber-100 text-amber-800', okey_lac: 'bg-blue-100 text-blue-800', varejo_lacteo: 'bg-purple-100 text-purple-800', cafe: 'bg-yellow-100 text-yellow-900', outros: 'bg-gray-100 text-gray-800' }

  const previewProd = produtos.find(p => p.id === previewId)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Catálogo de Produtos</h1>
          <p className="mt-1 text-sm text-gray-600">{produtos.filter(p => p.ativo).length} produtos ativos — {produtos.length} total</p>
        </div>
        {isGerente && (
          <button onClick={openNew} className="px-4 py-2.5 bg-primary-600 text-white rounded-apple hover:bg-primary-700 shadow-apple-sm flex items-center self-start">
            <PlusIcon className="h-4 w-4 mr-2" /> Novo Produto
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <input type="text" placeholder="Buscar por nome ou SKU..." value={search} onChange={(e) => setSearch(e.target.value)} className="px-4 py-2.5 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 w-full sm:w-72" />
        <select value={filterCategoria} onChange={(e) => setFilterCategoria(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">Todas categorias</option>
          <option value="sacaria">Sacaria 25kg</option>
          <option value="okey_lac">Okey Lac 25kg</option>
          <option value="varejo_lacteo">Varejo Lácteo</option>
          <option value="cafe">Café</option>
          <option value="outros">Outros</option>
        </select>
        <select value={filterAtivo} onChange={(e) => setFilterAtivo(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">Todos</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map(p => (
          <div key={p.id} className={`bg-white rounded-apple shadow-apple-sm border border-gray-200 overflow-hidden hover:shadow-apple transition-shadow ${!p.ativo ? 'opacity-60' : ''}`}>
            <div className="h-40 bg-gray-100 flex items-center justify-center relative">
              {p.foto ? <img src={p.foto} alt={p.nome} className="w-full h-full object-cover" /> : <PhotoIcon className="h-16 w-16 text-gray-300" />}
              {p.destaque && <span className="absolute top-2 left-2 px-2 py-0.5 text-xs font-bold bg-yellow-400 text-yellow-900 rounded-full">Destaque</span>}
              {!p.ativo && <span className="absolute top-2 right-2 px-2 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded-full">Inativo</span>}
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between mb-1">
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${catColor[p.categoria]}`}>{catLabel[p.categoria]}</span>
                {p.sku && <span className="text-xs text-gray-400 font-mono">{p.sku}</span>}
              </div>
              <h3 className="font-semibold text-gray-900 mt-2 text-sm leading-tight">{p.nome}</h3>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.descricao}</p>
              <div className="flex items-end justify-between mt-3">
                <div>
                  <p className="text-lg font-bold text-primary-600">R$ {p.preco.toFixed(2).replace('.', ',')}</p>
                  <p className="text-xs text-gray-400">/{p.unidade}</p>
                </div>
                {p.estoque !== undefined && (
                  <p className={`text-xs font-medium ${p.estoque > 100 ? 'text-green-600' : p.estoque > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {p.estoque > 0 ? `${p.estoque} em estoque` : 'Sem estoque'}
                  </p>
                )}
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                <button onClick={() => setPreviewId(p.id)} className="text-xs text-primary-600 hover:text-primary-800 font-medium flex-1">Ver detalhes</button>
                {isGerente && (
                  <>
                    <button onClick={() => openEdit(p)} className="text-xs text-gray-600 hover:text-gray-800 font-medium">Editar</button>
                    <button onClick={() => onUpdate({ ...p, ativo: !p.ativo })} className="text-xs text-gray-600 hover:text-gray-800 font-medium">{p.ativo ? 'Desativar' : 'Ativar'}</button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && <div className="text-center py-12 text-gray-500">Nenhum produto encontrado</div>}

      {previewProd && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-apple shadow-apple-lg max-w-lg w-full max-h-[85vh] overflow-y-auto">
            {previewProd.foto ? <img src={previewProd.foto} alt={previewProd.nome} className="w-full h-56 object-cover rounded-t-apple" /> : <div className="w-full h-56 bg-gray-100 flex items-center justify-center rounded-t-apple"><PhotoIcon className="h-20 w-20 text-gray-300" /></div>}
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex gap-2 mb-2">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${catColor[previewProd.categoria]}`}>{catLabel[previewProd.categoria]}</span>
                    {previewProd.destaque && <span className="px-2 py-0.5 text-xs font-bold bg-yellow-400 text-yellow-900 rounded-full">Destaque</span>}
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${previewProd.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{previewProd.ativo ? 'Ativo' : 'Inativo'}</span>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">{previewProd.nome}</h2>
                </div>
                <button onClick={() => setPreviewId(null)} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="h-6 w-6" /></button>
              </div>
              <p className="text-sm text-gray-600 mt-3">{previewProd.descricao}</p>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="p-3 bg-gray-50 rounded-apple"><p className="text-xs text-gray-500">Preço</p><p className="text-lg font-bold text-primary-600">R$ {previewProd.preco.toFixed(2).replace('.', ',')}/{previewProd.unidade}</p></div>
                {previewProd.sku && <div className="p-3 bg-gray-50 rounded-apple"><p className="text-xs text-gray-500">SKU</p><p className="text-sm font-mono font-semibold text-gray-900">{previewProd.sku}</p></div>}
                {previewProd.estoque !== undefined && <div className="p-3 bg-gray-50 rounded-apple"><p className="text-xs text-gray-500">Estoque</p><p className="text-sm font-semibold text-gray-900">{previewProd.estoque} {previewProd.unidade}</p></div>}
                {previewProd.pesoKg !== undefined && <div className="p-3 bg-gray-50 rounded-apple"><p className="text-xs text-gray-500">Peso</p><p className="text-sm font-semibold text-gray-900">{previewProd.pesoKg} kg</p></div>}
                {previewProd.margemLucro !== undefined && <div className="p-3 bg-gray-50 rounded-apple"><p className="text-xs text-gray-500">Margem</p><p className="text-sm font-semibold text-gray-900">{previewProd.margemLucro}%</p></div>}
                <div className="p-3 bg-gray-50 rounded-apple"><p className="text-xs text-gray-500">Cadastrado em</p><p className="text-sm font-semibold text-gray-900">{new Date(previewProd.dataCadastro).toLocaleDateString('pt-BR')}</p></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-apple shadow-apple-lg max-w-xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Editar Produto' : 'Novo Produto'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="h-6 w-6" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Foto do Produto</label>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 bg-gray-100 rounded-apple border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {fFoto ? <img src={fFoto} alt="Preview" className="w-full h-full object-cover" /> : <PhotoIcon className="h-10 w-10 text-gray-300" />}
                  </div>
                  <div>
                    <label className="px-4 py-2 bg-white border border-gray-300 rounded-apple text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer inline-block">
                      <input type="file" accept="image/*" className="hidden" onChange={handleFoto} />
                      Escolher imagem
                    </label>
                    <p className="text-xs text-gray-500 mt-1">JPG, PNG ou WebP. Máx 2MB.</p>
                    {fFoto && <button onClick={() => setFFoto('')} className="text-xs text-red-500 hover:text-red-700 mt-1">Remover foto</button>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label><input value={fNome} onChange={(e) => setFNome(e.target.value)} placeholder="Ex: Filé de Tilápia Congelado" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label><textarea value={fDescricao} onChange={(e) => setFDescricao(e.target.value)} rows={3} placeholder="Descrição detalhada do produto..." className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Categoria *</label><select value={fCategoria} onChange={(e) => setFCategoria(e.target.value as Produto['categoria'])} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500"><option value="sacaria">Sacaria 25kg</option><option value="okey_lac">Okey Lac 25kg</option><option value="varejo_lacteo">Varejo Lácteo</option><option value="cafe">Café</option><option value="outros">Outros</option></select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">SKU</label><input value={fSku} onChange={(e) => setFSku(e.target.value)} placeholder="CONG-001" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Preço (R$) *</label><input type="number" step="0.01" value={fPreco} onChange={(e) => setFPreco(e.target.value)} placeholder="0,00" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Unidade *</label><select value={fUnidade} onChange={(e) => setFUnidade(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500"><option value="sc">Saco (sc)</option><option value="un">Unidade (un)</option><option value="kg">Quilograma (kg)</option><option value="cx">Caixa (cx)</option><option value="lt">Litro (lt)</option><option value="pct">Pacote (pct)</option><option value="fd">Fardo (fd)</option></select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Estoque</label><input type="number" value={fEstoque} onChange={(e) => setFEstoque(e.target.value)} placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Peso (kg)</label><input type="number" step="0.1" value={fPesoKg} onChange={(e) => setFPesoKg(e.target.value)} placeholder="0.0" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Margem Lucro (%)</label><input type="number" step="0.1" value={fMargemLucro} onChange={(e) => setFMargemLucro(e.target.value)} placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={fAtivo} onChange={(e) => setFAtivo(e.target.checked)} className="w-4 h-4 text-primary-600 rounded" /><span className="text-sm text-gray-700">Produto ativo</span></label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={fDestaque} onChange={(e) => setFDestaque(e.target.checked)} className="w-4 h-4 text-yellow-500 rounded" /><span className="text-sm text-gray-700">Destaque / Promoção</span></label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50">Cancelar</button>
              <button onClick={handleSave} disabled={!fNome.trim() || !fDescricao.trim() || !fPreco} className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 disabled:bg-gray-400 shadow-apple-sm">{editing ? 'Salvar' : 'Criar Produto'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProdutosView
