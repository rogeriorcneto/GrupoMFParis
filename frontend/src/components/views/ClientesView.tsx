import React from 'react'
import { PlusIcon, AdjustmentsHorizontalIcon, MagnifyingGlassIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline'
import type { ClientesViewProps, Cliente } from '../../types'
import { useDebounce } from '../../hooks/useDebounce'

const ClientesView: React.FC<ClientesViewProps> = ({ clientes, vendedores, loggedUser, onNewCliente, onEditCliente, onUpdateCliente, onImportClientes, onDeleteCliente, onDeleteAll }) => {
  const isGerente = loggedUser?.cargo === 'gerente'
  // Vendedor só vê seus clientes; gerente vê todos
  const scopedClientes = React.useMemo(() =>
    isGerente ? clientes : clientes.filter(c => c.vendedorId === loggedUser?.id)
  , [clientes, isGerente, loggedUser?.id])
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
  const [editingVendedor, setEditingVendedor] = React.useState<number | null>(null)
  const importRef = React.useRef<HTMLInputElement>(null)
  const debouncedSearch = useDebounce(searchTerm, 250)
  const PAGE_SIZE = 50
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE)

  React.useEffect(() => { setVisibleCount(PAGE_SIZE) }, [debouncedSearch, filterEtapa, filterVendedor, filterScoreMin, filterValorMin])

  const filteredClientes = scopedClientes.filter(cliente => {
    const matchSearch = cliente.razaoSocial.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      cliente.contatoNome.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      cliente.cnpj.includes(debouncedSearch)
    const matchEtapa = !filterEtapa || cliente.etapa === filterEtapa
    const matchVendedor = !filterVendedor || String(cliente.vendedorId) === filterVendedor
    const matchScore = !filterScoreMin || (cliente.score || 0) >= Number(filterScoreMin)
    const matchValor = !filterValorMin || (cliente.valorEstimado || 0) >= Number(filterValorMin)
    return matchSearch && matchEtapa && matchVendedor && matchScore && matchValor
  })

  const etapaConfig: Record<string, { label: string; badge: string; dot: string }> = {
    'prospecção': { label: 'Prospecção', badge: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
    'amostra': { label: 'Amostra', badge: 'bg-yellow-50 text-yellow-700', dot: 'bg-yellow-500' },
    'proposta': { label: 'Proposta', badge: 'bg-indigo-50 text-indigo-700', dot: 'bg-indigo-500' },
    'negociacao': { label: 'Negociação', badge: 'bg-purple-50 text-purple-700', dot: 'bg-purple-500' },
    'follow_up': { label: 'Follow-up', badge: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
    'amostra_perdida': { label: 'Amostra Perdida', badge: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500' },
    'inativo': { label: 'Inativos', badge: 'bg-gray-100 text-gray-700', dot: 'bg-gray-500' },
    'lead': { label: 'Leads', badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
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

      // Função para parse de data brasileira
      const parseDate = (s: string): string => {
        if (!s || !s.trim()) return ''
        const clean = s.trim().replace(/^"|"$/g, '')
        const parts = clean.split('/')
        if (parts.length === 3) {
          let [d, m, y] = parts
          if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y
          return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
        }
        return clean
      }

      // Função para parse de valor monetário
      const parseMoney = (s: string): number | undefined => {
        if (!s || !s.trim()) return undefined
        const clean = s.replace(/[R$\s.]/g, '').replace(',', '.')
        const num = parseFloat(clean)
        return isNaN(num) ? undefined : num
      }

      // Função para parse de boolean
      const parseBoolean = (s: string): boolean | null => {
        if (!s || !s.trim()) return null
        const clean = s.toLowerCase().trim()
        if (['sim', 's', 'true', '1', 'yes', 'y'].includes(clean)) return true
        if (['não', 'nao', 'n', 'false', '0', 'no', 'n'].includes(clean)) return false
        return null
      }

      const novos: Cliente[] = []
      for (let i = 1; i < lines.length; i++) {
        const vals = parseLine(lines[i])
        const row: Record<string, string> = {}
        headers.forEach((h, idx) => { row[h] = vals[idx] || '' })

        if (isAgendor) {
          const razao = row['razão social'] || row['razao social'] || ''
          const fantasia = row['nome fantasia'] || ''
          if (!razao && !fantasia) continue

          // Parse de telefones
          const tel = row['celular'] || row['whatsapp'] || row['telefone'] || ''
          const telFixo = row['telefone fixo'] || row['telefone comercial'] || ''
          const celular = row['celular'] || row['whatsapp'] || ''

          // Parse de score/ranking
          const ranking = parseInt(row['ranking'] || '0')
          const score = ranking > 0 ? Math.min(ranking * 20, 100) : 30

          // Parse de valor estimado
          const valorEstimado = parseMoney(row['valor estimado'] || row['valor'] || row['faturamento'] || '')

          // Parse de datas
          let ultimaInteracao = new Date().toISOString().split('T')[0]
          const dataStr = row['ultima atualização'] || row['ultima atualizacao'] || row['ultima atualização '] || row['data de cadastro'] || ''
          if (dataStr) {
            const parsed = parseDate(dataStr)
            if (parsed) ultimaInteracao = parsed
          }

          // Montar notas com informações adicionais
          const notasParts: string[] = []
          if (row['setor']) notasParts.push(`Setor: ${row['setor']}`)
          if (row['descrição'] || row['descricao']) notasParts.push(`Obs: ${row['descrição'] || row['descricao']}`)
          if (row['website']) notasParts.push(`Site: ${row['website']}`)
          if (row['categoria']) notasParts.push(`Cat: ${row['categoria']}`)
          if (row['segmento']) notasParts.push(`Segmento: ${row['segmento']}`)
          if (row['facebook']) notasParts.push(`FB: ${row['facebook']}`)
          if (row['instagram']) notasParts.push(`IG: ${row['instagram']}`)
          if (row['linkedin']) notasParts.push(`LI: ${row['linkedin']}`)
          if (row['fax']) notasParts.push(`Fax: ${row['fax']}`)
          if (row['ramal']) notasParts.push(`Ramal: ${row['ramal']}`)
          if (row['rádio'] || row['radio']) notasParts.push(`Rádio: ${row['rádio'] || row['radio']}`)
          if (row['skype']) notasParts.push(`Skype: ${row['skype']}`)
          if (row['nível de interesse'] || row['nivel de interesse']) notasParts.push(`Interesse: ${row['nível de interesse'] || row['nivel de interesse']}`)
          if (row['pessoa de contato'] || row['contato principal']) notasParts.push(`Contato Principal: ${row['pessoa de contato'] || row['contato principal']}`)

          // Montar redes sociais
          const redesSociaisParts: string[] = []
          if (row['facebook']) redesSociaisParts.push(`Facebook: ${row['facebook']}`)
          if (row['instagram']) redesSociaisParts.push(`Instagram: ${row['instagram']}`)
          if (row['linkedin']) redesSociaisParts.push(`LinkedIn: ${row['linkedin']}`)
          if (row['twitter']) redesSociaisParts.push(`Twitter: ${row['twitter']}`)
          if (row['youtube']) redesSociaisParts.push(`YouTube: ${row['youtube']}`)

          // Parse de CNAE
          const cnaePrimario = row['cnae primario'] || row['cnae principal'] || row['cnae'] || ''
          const cnaeSecundario = row['cnae secundario'] || ''

          // Parse de produtos interesse
          let produtosInteresse: string[] = []
          if (row['produtos de interesse'] || row['produtos']) {
            produtosInteresse = (row['produtos de interesse'] || row['produtos']).split(',').map(p => p.trim()).filter(p => p)
          }

          novos.push({
            id: Date.now() + i,
            razaoSocial: razao || fantasia,
            nomeFantasia: fantasia,
            cnpj: (row['cnpj'] || '').replace(/[^\d./\-]/g, ''),
            cnpj2: (row['cnpj2'] || row['cnpj secundario'] || '').replace(/[^\d./\-]/g, ''),
            contatoNome: row['pessoa de contato'] || row['contato principal'] || row['contato'] || '',
            contatoTelefone: tel,
            contatoCelular: celular,
            contatoTelefoneFixo: telFixo,
            contatoEmail: row['e-mail'] || row['email'] || '',
            enderecoRua: row['rua'] || row['logradouro'] || '',
            enderecoNumero: row['número'] || row['numero'] || '',
            enderecoComplemento: row['complemento'] || '',
            enderecoBairro: row['bairro'] || '',
            enderecoCidade: row['cidade'] || '',
            enderecoEstado: row['estado'] || row['uf'] || '',
            enderecoCep: row['cep'] || '',
            cnaePrimario,
            cnaeSecundario,
            whatsapp: row['whatsapp'] || '',
            redesSociais: redesSociaisParts.length > 0 ? redesSociaisParts.join(' | ') : undefined,
            etapa: 'prospecção',
            score,
            produtosInteresse,
            dataEntradaEtapa: new Date().toISOString().split('T')[0],
            notas: notasParts.length > 0 ? notasParts.join(' | ') : undefined,
            origemLead: row['origem do cliente'] || row['origem do lead'] || row['origem'] || 'Agendor',
            valorEstimado,
            ultimaInteracao,
            diasInativo: 0,
            website: row['website'] || '',
            segmento: row['segmento'] || '',
            localizacao: row['localizacao'] || row['região'] || row['regiao'] || '',
            whatsappValido: row['whatsapp'] ? parseBoolean(row['whatsapp válido'] || row['whatsapp validado']) : null
          })
        } else {
          // Importação padrão (não-Agendor) - mapeamento completo
          if (!row['razaosocial'] && !row['razao_social'] && !row['nome'] && !row['razão social']) continue
          
          novos.push({
            id: Date.now() + i,
            razaoSocial: row['razaosocial'] || row['razao_social'] || row['razão social'] || row['nome'] || `Importado ${i}`,
            nomeFantasia: row['nomefantasia'] || row['nome_fantasia'] || row['nome fantasia'] || '',
            cnpj: row['cnpj'] || '',
            cnpj2: row['cnpj2'] || row['cnpj_secundario'] || '',
            contatoNome: row['contatonome'] || row['contato_nome'] || row['contato'] || row['pessoa_contato'] || '',
            contatoTelefone: row['contatotelefone'] || row['contato_telefone'] || row['telefone'] || '',
            contatoCelular: row['contatocelular'] || row['contato_celular'] || row['celular'] || '',
            contatoTelefoneFixo: row['contatotelefonefixo'] || row['contato_telefone_fixo'] || row['telefone_fixo'] || '',
            contatoEmail: row['contatoemail'] || row['contato_email'] || row['email'] || row['e-mail'] || '',
            enderecoRua: row['enderecorua'] || row['endereco_rua'] || row['rua'] || row['logradouro'] || '',
            enderecoNumero: row['endereconumero'] || row['endereco_numero'] || row['numero'] || '',
            enderecoComplemento: row['enderecocomplemento'] || row['endereco_complemento'] || row['complemento'] || '',
            enderecoBairro: row['enderecobairro'] || row['endereco_bairro'] || row['bairro'] || '',
            enderecoCidade: row['enderecocidade'] || row['endereco_cidade'] || row['cidade'] || '',
            enderecoEstado: row['enderecoestado'] || row['endereco_estado'] || row['estado'] || row['uf'] || '',
            enderecoCep: row['enderecocep'] || row['endereco_cep'] || row['cep'] || '',
            enderecoRua2: row['enderecorua2'] || row['endereco_rua2'] || '',
            enderecoNumero2: row['endereconumero2'] || row['endereco_numero2'] || '',
            enderecoComplemento2: row['enderecocomplemento2'] || row['endereco_complemento2'] || '',
            enderecoBairro2: row['enderecobairro2'] || row['endereco_bairro2'] || '',
            enderecoCidade2: row['enderecocidade2'] || row['endereco_cidade2'] || '',
            enderecoEstado2: row['enderecoestado2'] || row['endereco_estado2'] || '',
            enderecoCep2: row['enderecocep2'] || row['endereco_cep2'] || '',
            cnaePrimario: row['cnaeprimario'] || row['cnae_primario'] || row['cnae'] || '',
            cnaeSecundario: row['cnaesecundario'] || row['cnae_secundario'] || '',
            whatsapp: row['whatsapp'] || '',
            redesSociais: row['redessociais'] || row['redes_sociais'] || '',
            etapa: row['etapa'] || 'prospecção',
            score: row['score'] ? parseInt(row['score']) : 30,
            produtosInteresse: row['produtosinteresse'] || row['produtos_interesse'] ? 
              (row['produtosinteresse'] || row['produtos_interesse']).split(',').map(p => p.trim()).filter(p => p) : [],
            dataEntradaEtapa: parseDate(row['dataentradaetapa'] || row['data_entrada_etapa']) || new Date().toISOString().split('T')[0],
            notas: row['notas'] || row['observacoes'] || row['obs'] || '',
            origemLead: row['origemlead'] || row['origem_lead'] || row['origem'] || 'Importação CSV',
            dataEnvioAmostra: parseDate(row['dataenvioamostra'] || row['data_envio_amostra']),
            statusAmostra: row['statusamostra'] || row['status_amostra'] as any,
            dataHomologacao: parseDate(row['datahomologacao'] || row['data_homologacao']),
            proximoPedidoPrevisto: parseDate(row['proximopedidoprevisto'] || row['proximo_pedido_previsto']),
            dataProposta: parseDate(row['dataproposta'] || row['data_proposta']),
            valorProposta: parseMoney(row['valorproposta'] || row['valor_proposta']),
            resultadoAmostra: row['resultadoamostra'] || row['resultado_amostra'] as any,
            dataResultadoAmostra: parseDate(row['dataresultadoamostra'] || row['data_resultado_amostra']),
            motivoReprovacao: row['motivoreprovacao'] || row['motivo_reprovacao'],
            statusFollowUp: row['statusfollowup'] || row['status_follow_up'] as any,
            statusSatisfacao: row['statussatisfacao'] || row['status_satisfacao'] as any,
            notaSatisfacao: row['notasatisfacao'] || row['nota_satisfacao'] ? parseInt(row['notasatisfacao'] || row['nota_satisfacao']) : undefined,
            feedbackSatisfacao: row['feedbacksatisfacao'] || row['feedback_satisfacao'],
            cicloRecompra: row['ciclorecompra'] || row['ciclo_recompra'] ? parseInt(row['ciclorecompra'] || row['ciclo_recompra']) : undefined,
            dataProximaRecompra: parseDate(row['dataproximarecompra'] || row['data_proxima_recompra']),
            totalCompras: parseMoney(row['totalcompras'] || row['total_compras']),
            omieStatusLogistico: row['omiestatuslogistico'] || row['omie_status_logistico'],
            omieCodigoRastreio: row['omiecodigorastreio'] || row['omie_codigo_rastreio'],
            omieNotaFiscal: row['omienotafiscal'] || row['omie_nota_fiscal'],
            omieDataFaturamento: parseDate(row['omiedatafaturamento'] || row['omie_data_faturamento']),
            statusEntrega: row['statusentrega'] || row['status_entrega'] as any,
            dataEntregaPrevista: parseDate(row['dataentregaprevista'] || row['data_entrega_prevista']),
            dataEntregaRealizada: parseDate(row['dataentregarealizada'] || row['data_entrega_realizada']),
            statusFaturamento: row['statusfaturamento'] || row['status_faturamento'] as any,
            dataUltimoPedido: parseDate(row['dataultimopedido'] || row['data_ultimo_pedido']),
            etapaAnterior: row['etapaanterior'] || row['etapa_anterior'],
            categoriaPerda: row['categoriaperda'] || row['categoria_perda'] as any,
            motivoPerda: row['motivoperda'] || row['motivo_perda'],
            dataPerda: parseDate(row['dataperda'] || row['data_perda']),
            segmento: row['segmento'] || '',
            localizacao: row['localizacao'] || '',
            tentativaAmostra: row['tentativaamostra'] || row['tentativa_amostra'] ? parseInt(row['tentativaamostra'] || row['tentativa_amostra']) : undefined,
            whatsappValido: parseBoolean(row['whatsappvalido'] || row['whatsapp_valido']),
            whatsappJid: row['whatsappjid'] || row['whatsapp_jid'],
            whatsappValidadoEm: parseDate(row['whatsappvalidadoem'] || row['whatsapp_validado_em']),
            novoCiclo: parseBoolean(row['novociclo'] || row['novo_ciclo']),
            cicloNumero: row['ciclonumero'] || row['ciclo_numero'] ? parseInt(row['ciclonumero'] || row['ciclo_numero']) : undefined,
            googlePlaceId: row['googleplaceid'] || row['google_place_id'],
            googleRating: row['googlerating'] || row['google_rating'] ? parseFloat(row['googlerating'] || row['google_rating']) : undefined,
            googleReviews: row['googlereviews'] || row['google_reviews'] ? parseInt(row['googlereviews'] || row['google_reviews']) : undefined,
            website: row['website'] || '',
            latitude: row['latitude'] ? parseFloat(row['latitude']) : undefined,
            longitude: row['longitude'] ? parseFloat(row['longitude']) : undefined,
            statusCliente: row['statuscliente'] || row['status_cliente'] as any,
            grupoEconomicoId: row['grupoeconomicoid'] || row['grupo_economico_id'] ? parseInt(row['grupoeconomicoid'] || row['grupo_economico_id']) : undefined,
            valorEstimado: parseMoney(row['valorestimado'] || row['valor_estimado'] || row['valor']),
            ultimaInteracao: parseDate(row['ultimainteracao'] || row['ultima_interacao']) || new Date().toISOString().split('T')[0],
            diasInativo: 0
          })
        }
      }
      if (novos.length === 0) { 
        alert('Nenhum cliente válido encontrado no CSV.\nFormatos aceitos: CSV padrão ou exportação do Agendor.'); 
        return 
      }
      onImportClientes(novos)
      alert(`✅ ${novos.length} cliente(s) importado(s) com sucesso!${isAgendor ? '\n📋 Formato Agendor detectado automaticamente.' : ''}\n📊 Todos os campos foram mapeados conforme disponível no CSV.`)
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  const handleExportCSV = () => {
    const exportData = filtersActive || debouncedSearch ? filteredClientes : scopedClientes
    
    // Header completo com todos os campos
    const headers = [
      'razaoSocial', 'nomeFantasia', 'cnpj', 'cnpj2', 'contatoNome', 'contatoTelefone', 
      'contatoCelular', 'contatoTelefoneFixo', 'contatoEmail', 'enderecoRua', 'enderecoNumero',
      'enderecoComplemento', 'enderecoBairro', 'enderecoCidade', 'enderecoEstado', 'enderecoCep',
      'enderecoRua2', 'enderecoNumero2', 'enderecoComplemento2', 'enderecoBairro2', 
      'enderecoCidade2', 'enderecoEstado2', 'enderecoCep2', 'cnaePrimario', 'cnaeSecundario',
      'whatsapp', 'redesSociais', 'omieCodigo', 'etapa', 'score', 'ultimaInteracao', 
      'diasInativo', 'valorEstimado', 'produtosInteresse', 'vendedorId', 'dataEntradaEtapa',
      'notas', 'origemLead', 'dataEnvioAmostra', 'statusAmostra', 'dataHomologacao',
      'proximoPedidoPrevisto', 'dataProposta', 'valorProposta', 'resultadoAmostra',
      'dataResultadoAmostra', 'motivoReprovacao', 'statusFollowUp', 'statusSatisfacao',
      'notaSatisfacao', 'feedbackSatisfacao', 'cicloRecompra', 'dataProximaRecompra',
      'totalCompras', 'omieStatusLogistico', 'omieCodigoRastreio', 'omieNotaFiscal',
      'omieDataFaturamento', 'statusEntrega', 'dataEntregaPrevista', 'dataEntregaRealizada',
      'statusFaturamento', 'dataUltimoPedido', 'etapaAnterior', 'categoriaPerda',
      'motivoPerda', 'dataPerda', 'segmento', 'localizacao', 'tentativaAmostra',
      'whatsappValido', 'whatsappJid', 'whatsappValidadoEm', 'novoCiclo', 'cicloNumero',
      'googlePlaceId', 'googleRating', 'googleReviews', 'website', 'latitude', 'longitude',
      'statusCliente', 'grupoEconomicoId'
    ].join(',')
    
    // Função para escapar valores CSV
    const escapeCSV = (value: any): string => {
      if (value === null || value === undefined) return ''
      if (Array.isArray(value)) return `"${value.join(';')}"`
      if (typeof value === 'boolean') return value ? 'true' : 'false'
      if (typeof value === 'number') return value.toString()
      return `"${String(value).replace(/"/g, '""')}"`
    }
    
    // Gerar linhas com todos os dados
    const rows = exportData.map(c => {
      return [
        escapeCSV(c.razaoSocial),
        escapeCSV(c.nomeFantasia),
        escapeCSV(c.cnpj),
        escapeCSV(c.cnpj2),
        escapeCSV(c.contatoNome),
        escapeCSV(c.contatoTelefone),
        escapeCSV(c.contatoCelular),
        escapeCSV(c.contatoTelefoneFixo),
        escapeCSV(c.contatoEmail),
        escapeCSV(c.enderecoRua),
        escapeCSV(c.enderecoNumero),
        escapeCSV(c.enderecoComplemento),
        escapeCSV(c.enderecoBairro),
        escapeCSV(c.enderecoCidade),
        escapeCSV(c.enderecoEstado),
        escapeCSV(c.enderecoCep),
        escapeCSV(c.enderecoRua2),
        escapeCSV(c.enderecoNumero2),
        escapeCSV(c.enderecoComplemento2),
        escapeCSV(c.enderecoBairro2),
        escapeCSV(c.enderecoCidade2),
        escapeCSV(c.enderecoEstado2),
        escapeCSV(c.enderecoCep2),
        escapeCSV(c.cnaePrimario),
        escapeCSV(c.cnaeSecundario),
        escapeCSV(c.whatsapp),
        escapeCSV(c.redesSociais),
        escapeCSV(c.omieCodigo),
        escapeCSV(c.etapa),
        escapeCSV(c.score),
        escapeCSV(c.ultimaInteracao),
        escapeCSV(c.diasInativo),
        escapeCSV(c.valorEstimado),
        escapeCSV(c.produtosInteresse),
        escapeCSV(c.vendedorId),
        escapeCSV(c.dataEntradaEtapa),
        escapeCSV(c.notas),
        escapeCSV(c.origemLead),
        escapeCSV(c.dataEnvioAmostra),
        escapeCSV(c.statusAmostra),
        escapeCSV(c.dataHomologacao),
        escapeCSV(c.proximoPedidoPrevisto),
        escapeCSV(c.dataProposta),
        escapeCSV(c.valorProposta),
        escapeCSV(c.resultadoAmostra),
        escapeCSV(c.dataResultadoAmostra),
        escapeCSV(c.motivoReprovacao),
        escapeCSV(c.statusFollowUp),
        escapeCSV(c.statusSatisfacao),
        escapeCSV(c.notaSatisfacao),
        escapeCSV(c.feedbackSatisfacao),
        escapeCSV(c.cicloRecompra),
        escapeCSV(c.dataProximaRecompra),
        escapeCSV(c.totalCompras),
        escapeCSV(c.omieStatusLogistico),
        escapeCSV(c.omieCodigoRastreio),
        escapeCSV(c.omieNotaFiscal),
        escapeCSV(c.omieDataFaturamento),
        escapeCSV(c.statusEntrega),
        escapeCSV(c.dataEntregaPrevista),
        escapeCSV(c.dataEntregaRealizada),
        escapeCSV(c.statusFaturamento),
        escapeCSV(c.dataUltimoPedido),
        escapeCSV(c.etapaAnterior),
        escapeCSV(c.categoriaPerda),
        escapeCSV(c.motivoPerda),
        escapeCSV(c.dataPerda),
        escapeCSV(c.segmento),
        escapeCSV(c.localizacao),
        escapeCSV(c.tentativaAmostra),
        escapeCSV(c.whatsappValido),
        escapeCSV(c.whatsappJid),
        escapeCSV(c.whatsappValidadoEm),
        escapeCSV(c.novoCiclo),
        escapeCSV(c.cicloNumero),
        escapeCSV(c.googlePlaceId),
        escapeCSV(c.googleRating),
        escapeCSV(c.googleReviews),
        escapeCSV(c.website),
        escapeCSV(c.latitude),
        escapeCSV(c.longitude),
        escapeCSV(c.statusCliente),
        escapeCSV(c.grupoEconomicoId)
      ].join(',')
    }).join('\n')
    
    const csv = headers + '\n' + rows
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); 
    a.href = url; 
    a.download = `clientes_completos_${new Date().toISOString().split('T')[0]}.csv`; 
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadModelo = () => {
    // Modelo completo com campos principais
    const modelo = 'razaoSocial,nomeFantasia,cnpj,contatoNome,contatoTelefone,contatoCelular,contatoEmail,enderecoRua,enderecoNumero,enderecoBairro,enderecoCidade,enderecoEstado,enderecoCep,whatsapp,website,segmento,valorEstimado,etapa,origemLead,notas\n' +
      '"Padaria Exemplo Ltda","Padaria Exemplo","12.345.678/0001-99","João Silva","(31) 99999-1234","(31) 99999-1234","joao@exemplo.com","Rua das Flores","100","Centro","Belo Horizonte","MG","30100-000","(31) 99999-1234","www.exemplo.com","Alimentício","15000","prospecção","Site","Cliente com potencial de grande pedido","Contato preferencial às 14h"\n' +
      '"Mercado Modelo S/A","Mercado Modelo","98.765.432/0001-11","Maria Santos","(31) 98888-5678","(31) 98888-5678","maria@modelo.com","Avenida Brasil","500","Funcionários","Contagem","MG","32000-000","(31) 98888-5678","www.modelo.com","Varejo","25000","prospecção","Indicação","Interessado em produtos de panificação","Já é cliente da concorrência"'
    const blob = new Blob(['\uFEFF' + modelo], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'modelo_importacao_clientes_completo.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const filtersActive = !!(filterEtapa || filterVendedor || filterScoreMin || filterValorMin)
  const totalValor = filteredClientes.reduce((s, c) => s + (c.valorEstimado || 0), 0)
  const visibleClientes = filteredClientes.slice(0, visibleCount)
  const hasMore = visibleCount < filteredClientes.length

  return (
    <div className="space-y-3">
      {/* Hidden file input for CSV import */}
      <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filteredClientes.length}{filtersActive ? ` de ${scopedClientes.length}` : ''} cliente{filteredClientes.length !== 1 ? 's' : ''}
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
                <option value="proposta">Proposta</option>
                <option value="negociacao">Negociação</option>
                <option value="follow_up">Follow-up</option>
                <option value="amostra_perdida">Amostra Perdida</option>
                <option value="inativo">Inativos</option>
                <option value="lead">Leads</option>
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
          <div className="text-4xl mb-3">{scopedClientes.length === 0 ? '📋' : '🔍'}</div>
          <p className="text-gray-600 font-medium">{scopedClientes.length === 0 ? 'Nenhum cliente cadastrado ainda' : 'Nenhum cliente encontrado'}</p>
          <p className="text-sm text-gray-400 mt-1">{scopedClientes.length === 0 ? 'Clique em "Novo Cliente" ou importe um CSV para começar.' : 'Tente ajustar os filtros ou o termo de busca.'}</p>
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
              {visibleClientes.map((cliente) => {
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
                    <td className="py-3 px-4 hidden lg:table-cell" onClick={e => e.stopPropagation()}>
                      {editingVendedor === cliente.id ? (
                        <select
                          autoFocus
                          className="text-sm bg-white border border-primary-300 rounded-apple px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
                          value={cliente.vendedorId || ''}
                          onChange={async (e) => {
                            const newId = Number(e.target.value)
                            if (newId && newId !== cliente.vendedorId && onUpdateCliente) {
                              await onUpdateCliente(cliente.id, { vendedorId: newId })
                            }
                            setEditingVendedor(null)
                          }}
                          onBlur={() => setEditingVendedor(null)}
                        >
                          <option value="">— Sem vendedor —</option>
                          {vendedores.map(vd => (
                            <option key={vd.id} value={vd.id}>{vd.nome}</option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={() => setEditingVendedor(cliente.id)}
                          className="text-sm text-gray-600 hover:text-primary-700 hover:bg-primary-50 px-2 py-0.5 rounded-apple transition-colors"
                          title="Clique para trocar vendedor"
                        >
                          {v ? v.nome.split(' ')[0] : <span className="text-gray-300">—</span>}
                        </button>
                      )}
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
          {hasMore && (
            <div className="p-4 text-center border-t border-gray-100">
              <button
                onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                className="text-sm text-primary-600 hover:text-primary-800 font-medium"
              >
                Carregar mais ({filteredClientes.length - visibleCount} restantes)
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===== MOBILE: Card list (< md) ===== */}
      {filteredClientes.length > 0 && (
        <div className="md:hidden space-y-2">
          {visibleClientes.map((cliente) => {
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
                  <span className="text-[10px] text-gray-400" onClick={e => e.stopPropagation()}>
                    {editingVendedor === cliente.id ? (
                      <select
                        autoFocus
                        className="text-[10px] bg-white border border-primary-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        value={cliente.vendedorId || ''}
                        onChange={async (e) => {
                          const newId = Number(e.target.value)
                          if (newId && newId !== cliente.vendedorId && onUpdateCliente) {
                            await onUpdateCliente(cliente.id, { vendedorId: newId })
                          }
                          setEditingVendedor(null)
                        }}
                        onBlur={() => setEditingVendedor(null)}
                      >
                        <option value="">—</option>
                        {vendedores.map(vd => (
                          <option key={vd.id} value={vd.id}>{vd.nome}</option>
                        ))}
                      </select>
                    ) : (
                      <button onClick={() => setEditingVendedor(cliente.id)} className="hover:text-primary-600 transition-colors">
                        {v ? v.nome.split(' ')[0] : '—'}
                      </button>
                    )}
                  </span>
                  {cliente.valorEstimado ? (
                    <span className="text-[10px] font-semibold text-gray-600 ml-auto">R$ {cliente.valorEstimado.toLocaleString('pt-BR')}</span>
                  ) : null}
                </div>
              </div>
            )
          })}
          {filteredClientes.length > visibleCount && (
            <div className="pt-2 text-center">
              <button
                onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                className="w-full py-3 text-sm text-primary-600 hover:text-primary-800 font-medium bg-white rounded-apple border border-gray-200"
              >
                Carregar mais ({filteredClientes.length - visibleCount} restantes)
              </button>
            </div>
          )}
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
