import React, { useState, useEffect } from 'react'
import { 
  DocumentTextIcon, 
  PlusIcon, 
  TrashIcon, 
  EyeIcon, 
  CloudArrowUpIcon,
  DocumentIcon,
  FolderIcon,
  CogIcon,
  BookOpenIcon,
  LightBulbIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import { getIAContexto, createIAContexto, updateIAContexto, deleteIAContexto, uploadArquivoIAContexto, type IAContexto } from '../../lib/database'

interface ContextoDocumento {
  id: string
  nome: string
  tipo: 'pdf' | 'texto' | 'regra' | 'produto'
  conteudo: string
  dataCriacao: string
  dataAtualizacao: string
  tamanho?: number
  url?: string
}

interface ContextoSecao {
  id: string
  titulo: string
  descricao: string
  documentos: ContextoDocumento[]
}

interface IAContextoViewProps {
  loggedUser: any
}

const IAContextoView: React.FC<IAContextoViewProps> = ({ loggedUser }) => {
  const isGerente = loggedUser?.cargo === 'gerente'
  const [secoes, setSecoes] = useState<ContextoSecao[]>([
    {
      id: 'visao-geral',
      titulo: 'Visão Geral do Negócio',
      descricao: 'Informações essenciais sobre a MF Paris, produtos e mercado',
      documentos: []
    },
    {
      id: 'processos',
      titulo: 'Processos e Fluxos',
      descricao: 'Procedimentos operacionais e regras de negócio',
      documentos: []
    },
    {
      id: 'produtos',
      titulo: 'Catálogo de Produtos',
      descricao: 'Descrições detalhadas, especificações e preços',
      documentos: []
    },
    {
      id: 'clientes',
      titulo: 'Perfil de Clientes',
      descricao: 'Características do público-alvo e personas',
      documentos: []
    },
    {
      id: 'vendas',
      titulo: 'Estratégias de Vendas',
      descricao: 'Técnicas, argumentos e abordagens comerciais',
      documentos: []
    }
  ])
  
  const [secaoAtiva, setSecaoAtiva] = useState<string>('visao-geral')
  const [mostrarEditor, setMostrarEditor] = useState(false)
  const [editorTipo, setEditorTipo] = useState<'texto' | 'regra'>('texto')
  const [editorTitulo, setEditorTitulo] = useState('')
  const [editorConteudo, setEditorConteudo] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [mostrarPreview, setMostrarPreview] = useState<ContextoDocumento | null>(null)

  // Simulação de carregamento de dados do Supabase
  useEffect(() => {
    carregarContexto()
  }, [])

  const carregarContexto = async () => {
    setCarregando(true)
    try {
      const contextoData = await getIAContexto()
      
      // Organizar dados por seção
      const novasSecoes = secoes.map(secao => ({
        ...secao,
        documentos: contextoData
          .filter(doc => doc.secao === secao.id)
          .map(doc => ({
            id: doc.id,
            nome: doc.titulo,
            tipo: doc.tipo,
            conteudo: doc.conteudo,
            dataCriacao: doc.criadoEm,
            dataAtualizacao: doc.atualizadoEm,
            tamanho: doc.tamanhoArquivo,
            url: doc.urlArquivo
          }))
      }))
      
      setSecoes(novasSecoes)
    } catch (error) {
      console.error('Erro ao carregar contexto:', error)
    } finally {
      setCarregando(false)
    }
  }

  const salvarDocumento = async () => {
    if (!editorTitulo.trim() || !editorConteudo.trim()) {
      alert('Preencha título e conteúdo')
      return
    }

    setCarregando(true)
    
    try {
      let resultado: IAContexto | null = null

      if (editandoId) {
        // Atualizar documento existente
        resultado = await updateIAContexto(editandoId, {
          titulo: editorTitulo,
          conteudo: editorConteudo
        })
      } else {
        // Criar novo documento
        resultado = await createIAContexto(
          secaoAtiva,
          editorTitulo,
          editorTipo,
          editorConteudo
        )
      }

      if (resultado) {
        await carregarContexto() // Recarregar dados
        
        setEditorTitulo('')
        setEditorConteudo('')
        setEditandoId(null)
        setMostrarEditor(false)
        
        alert(editandoId ? 'Documento atualizado com sucesso!' : 'Documento criado com sucesso!')
      } else {
        alert('Erro ao salvar documento')
      }
    } catch (error) {
      console.error('Erro ao salvar documento:', error)
      alert('Erro ao salvar documento')
    } finally {
      setCarregando(false)
    }
  }

  const handleUploadPDF = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      alert('Apenas arquivos PDF são permitidos')
      return
    }

    setCarregando(true)
    setUploadProgress(0)

    try {
      // Simulação de progresso
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return 90
          }
          return prev + 10
        })
      }, 100)

      // Fazer upload do arquivo
      const uploadResult = await uploadArquivoIAContexto(file, secaoAtiva, file.name)
      
      clearInterval(progressInterval)
      setUploadProgress(100)

      if (uploadResult) {
        // Criar registro no banco
        const resultado = await createIAContexto(
          secaoAtiva,
          file.name,
          'pdf',
          `Documento PDF: ${file.name}`,
          uploadResult.url,
          uploadResult.tamanho
        )

        if (resultado) {
          await carregarContexto() // Recarregar dados
          alert('PDF enviado com sucesso!')
        } else {
          alert('Erro ao salvar informações do PDF')
        }
      } else {
        alert('Erro ao fazer upload do PDF')
      }
    } catch (error) {
      console.error('Erro ao fazer upload:', error)
      alert('Erro ao fazer upload do PDF')
    } finally {
      setCarregando(false)
      setUploadProgress(0)
    }
  }

  const editarDocumento = (documento: ContextoDocumento) => {
    if (documento.tipo === 'pdf') {
      setMostrarPreview(documento)
    } else {
      setEditorTitulo(documento.nome)
      setEditorConteudo(documento.conteudo)
      setEditandoId(documento.id)
      setMostrarEditor(true)
    }
  }

  const excluirDocumento = async (documentoId: string) => {
    if (!confirm('Tem certeza que deseja excluir este documento?')) return

    try {
      const sucesso = await deleteIAContexto(documentoId)
      
      if (sucesso) {
        await carregarContexto() // Recarregar dados
        alert('Documento excluído com sucesso!')
      } else {
        alert('Erro ao excluir documento')
      }
    } catch (error) {
      console.error('Erro ao excluir documento:', error)
      alert('Erro ao excluir documento')
    }
  }

  const secaoAtual = secoes.find(s => s.id === secaoAtiva)

  if (!isGerente) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <ExclamationTriangleIcon className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Acesso Restrito</h3>
          <p className="text-gray-500">Apenas gerentes podem acessar o contexto da IA.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-purple-100 rounded-lg">
            <LightBulbIcon className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contexto da IA</h1>
            <p className="text-sm text-gray-500">Gerencie informações e documentos para dar contexto à inteligência artificial</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar - Seções */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-apple border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FolderIcon className="h-5 w-5" />
              Seções de Contexto
            </h3>
            <div className="space-y-2">
              {secoes.map(secao => (
                <button
                  key={secao.id}
                  onClick={() => setSecaoAtiva(secao.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    secaoAtiva === secao.id 
                      ? 'bg-purple-50 border border-purple-200 text-purple-700' 
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <div className="font-medium">{secao.titulo}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {secao.documentos.length} documento(s)
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className="lg:col-span-3">
          {secaoAtual && (
            <div className="space-y-4">
              {/* Cabeçalho da Seção */}
              <div className="bg-white rounded-apple border border-gray-200 p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">{secaoAtual.titulo}</h2>
                    <p className="text-gray-600">{secaoAtual.descricao}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditorTipo('texto')
                        setMostrarEditor(true)
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                    >
                      <PlusIcon className="h-4 w-4" />
                      Adicionar Texto
                    </button>
                    <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer">
                      <CloudArrowUpIcon className="h-4 w-4" />
                      Enviar PDF
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={handleUploadPDF}
                        className="hidden"
                        disabled={carregando}
                      />
                    </label>
                  </div>
                </div>

                {/* Progresso de Upload */}
                {uploadProgress > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                      <span>Enviando PDF...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Lista de Documentos */}
              <div className="bg-white rounded-apple border border-gray-200">
                {carregando ? (
                  <div className="p-8 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
                    <p className="text-gray-500 mt-2">Carregando...</p>
                  </div>
                ) : secaoAtual.documentos.length === 0 ? (
                  <div className="p-8 text-center">
                    <DocumentTextIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum documento</h3>
                    <p className="text-gray-500">Adicione textos ou PDFs para começar a construir o contexto da IA.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {secaoAtual.documentos.map(documento => (
                      <div key={documento.id} className="p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1">
                            <div className={`p-2 rounded-lg ${
                              documento.tipo === 'pdf' ? 'bg-red-100' :
                              documento.tipo === 'regra' ? 'bg-yellow-100' : 'bg-blue-100'
                            }`}>
                              {documento.tipo === 'pdf' ? (
                                <DocumentIcon className="h-5 w-5 text-red-600" />
                              ) : documento.tipo === 'regra' ? (
                                <CogIcon className="h-5 w-5 text-yellow-600" />
                              ) : (
                                <DocumentTextIcon className="h-5 w-5 text-blue-600" />
                              )}
                            </div>
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">{documento.nome}</h4>
                              <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                                {documento.conteudo}
                              </p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                <span>Tipo: {documento.tipo}</span>
                                <span>Criado: {new Date(documento.dataCriacao).toLocaleDateString('pt-BR')}</span>
                                {documento.tamanho && (
                                  <span>Tamanho: {(documento.tamanho / 1024).toFixed(1)} KB</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <button
                              onClick={() => editarDocumento(documento)}
                              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                              title={documento.tipo === 'pdf' ? 'Visualizar' : 'Editar'}
                            >
                              <EyeIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => excluirDocumento(documento.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Excluir"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Editor */}
      {mostrarEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-apple max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {editandoId ? 'Editar Documento' : 'Novo Documento'}
              </h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Título
                  </label>
                  <input
                    type="text"
                    value={editorTitulo}
                    onChange={(e) => setEditorTitulo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Digite o título do documento"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Conteúdo
                  </label>
                  <textarea
                    value={editorConteudo}
                    onChange={(e) => setEditorConteudo(e.target.value)}
                    rows={12}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Digite o conteúdo que servirá de contexto para a IA..."
                  />
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setMostrarEditor(false)
                  setEditorTitulo('')
                  setEditorConteudo('')
                  setEditandoId(null)
                }}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={salvarDocumento}
                disabled={carregando}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                {carregando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Preview PDF */}
      {mostrarPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-apple max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{mostrarPreview.nome}</h3>
              <button
                onClick={() => setMostrarPreview(null)}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <div className="bg-gray-100 rounded-lg p-8 text-center">
                <DocumentIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Visualização de PDF</p>
                <p className="text-sm text-gray-500 mt-2">
                  Tamanho: {mostrarPreview.tamanho ? (mostrarPreview.tamanho / 1024).toFixed(1) : 'N/A'} KB
                </p>
                <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  Abrir PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default IAContextoView
