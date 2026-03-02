// ============================================
// Tipos genéricos da API Omie
// ============================================

export interface OmieCallPayload {
  app_key: string
  app_secret: string
  call: string
  param: any[]
}

export interface OmieError {
  faultstring: string
  faultcode: string
}

export interface OmiePaginatedRequest {
  pagina: number
  registros_por_pagina: number
  apenas_importado_api?: string
  ordenar_por?: string
  ordem_decrescente?: string
  filtrar_por_data_de?: string
  filtrar_por_hora_de?: string
  filtrar_por_data_ate?: string
  filtrar_por_hora_ate?: string
}

export interface OmieStatusResponse {
  codigo_status: string
  descricao_status: string
}

// ============================================
// Geral — Clientes / Fornecedores / Transportadoras
// ============================================

export interface OmieEnderecoEntrega {
  entRua?: string
  entNumero?: string
  entComplemento?: string
  entBairro?: string
  entCEP?: string
  entEstado?: string
  entCidade?: string
}

export interface OmieTag {
  tag: string
}

export interface OmieRecomendacoes {
  numero_parcelas?: string
  codigo_vendedor?: number
  tipo_boleto?: string
}

export interface OmieCliente {
  codigo_cliente_omie?: number
  codigo_cliente_integracao?: string
  razao_social: string
  nome_fantasia?: string
  cnpj_cpf?: string
  inscricao_estadual?: string
  inscricao_municipal?: string
  tipo_atividade?: string
  pessoa_fisica?: string
  optante_simples_nacional?: string
  email?: string
  telefone1_ddd?: string
  telefone1_numero?: string
  telefone2_ddd?: string
  telefone2_numero?: string
  fax_ddd?: string
  fax_numero?: string
  endereco?: string
  endereco_numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  estado?: string
  cep?: string
  codigo_pais?: string
  contato?: string
  homepage?: string
  cnae?: string
  observacao?: string
  tags?: OmieTag[]
  recomendacoes?: OmieRecomendacoes
  enderecoEntrega?: OmieEnderecoEntrega
  inativo?: string
  bloquear_faturamento?: string
  cidade_ibge?: string
  valor_limite_credito?: number
  bloquear_exclusao?: string
  importado_api?: string
  // Campos de controle
  info?: {
    dInc?: string
    hInc?: string
    dAlt?: string
    hAlt?: string
    uInc?: string
    uAlt?: string
    cImpAPI?: string
  }
}

export interface OmieClienteListRequest extends OmiePaginatedRequest {
  clientesFiltro?: {
    codigo_cliente_omie?: number
    codigo_cliente_integracao?: string
    cnpj_cpf?: string
    razao_social?: string
    nome_fantasia?: string
    endereco?: string
    bairro?: string
    cidade?: string
    estado?: string
    cep?: string
    contato?: string
    email?: string
    homepage?: string
    inscricao_municipal?: string
    inscricao_estadual?: string
    tags?: OmieTag[]
  }
  clientesPorCodigo?: {
    codigo_cliente_omie?: number
    codigo_cliente_integracao?: string
  }
}

export interface OmieClienteListResponse {
  pagina: number
  total_de_paginas: number
  registros: number
  total_de_registros: number
  clientes_cadastro: OmieCliente[]
  clientes_cadastro_resumido?: OmieClienteResumido[]
}

export interface OmieClienteResumido {
  codigo_cliente: number
  codigo_cliente_integracao?: string
  razao_social: string
  nome_fantasia?: string
  cnpj_cpf?: string
  cidade?: string
  estado?: string
  email?: string
  telefone1_numero?: string
}

// ============================================
// Geral — Características de Clientes
// ============================================

export interface OmieCaracteristica {
  campo: string
  conteudo: string
}

export interface OmieCaractClienteRequest {
  codigo_cliente_omie?: number
  codigo_cliente_integracao?: string
  campo?: string
  conteudo?: string
}

export interface OmieCaractClienteResponse {
  codigo_cliente_omie: number
  codigo_cliente_integracao?: string
  caracteristicas?: OmieCaracteristica[]
}

// ============================================
// Geral — Tags
// ============================================

export interface OmieTagRequest {
  nCodCliente?: number
  cCodIntCliente?: string
  tags?: OmieTag[]
}

export interface OmieTagListResponse {
  nCodCliente: number
  cCodIntCliente?: string
  tags?: { tag: string }[]
}

// ============================================
// Geral — Projetos
// ============================================

export interface OmieProjeto {
  codigo?: number
  codInt?: string
  nome: string
  descricao?: string
  inativo?: string
}

export interface OmieProjetoListRequest extends OmiePaginatedRequest {}

export interface OmieProjetoListResponse {
  pagina: number
  total_de_paginas: number
  registros: number
  total_de_registros: number
  cadastro?: OmieProjeto[]
}

// ============================================
// Geral — Cadastros Auxiliares
// ============================================

export interface OmieCadastroAuxiliar {
  codigo?: string | number
  descricao?: string
  nome?: string
  [key: string]: any
}

export interface OmieCadastroAuxiliarListResponse {
  pagina?: number
  total_de_paginas?: number
  registros?: number
  total_de_registros?: number
  lista?: OmieCadastroAuxiliar[]
  [key: string]: any
}

// ============================================
// CRM — Contas
// ============================================

export interface OmieCRMConta {
  nCod?: number
  cCodInt?: string
  cNome: string
  cDoc?: string
  cEmail?: string
  cTelefone?: string
  cSite?: string
  cEndereco?: string
  cComplemento?: string
  cCidade?: string
  cUF?: string
  cCEP?: string
  cObs?: string
  nCodVendedor?: number
  cOrigem?: string
  cSegmento?: string
  tags?: OmieTag[]
  [key: string]: any
}

export interface OmieCRMContaListRequest extends OmiePaginatedRequest {
  cNome?: string
  cEmail?: string
  cDoc?: string
}

export interface OmieCRMContaListResponse {
  nPagina: number
  nTotPaginas: number
  nRegistros: number
  nTotRegistros: number
  contasCadastro?: OmieCRMConta[]
}

// ============================================
// CRM — Contatos
// ============================================

export interface OmieCRMContato {
  nCod?: number
  cCodInt?: string
  nCodConta?: number
  cNome: string
  cCargo?: string
  cEmail?: string
  cDDDCel?: string
  cCelular?: string
  cDDDTel?: string
  cTelefone?: string
  cObs?: string
  [key: string]: any
}

export interface OmieCRMContatoListRequest extends OmiePaginatedRequest {
  nCodConta?: number
}

export interface OmieCRMContatoListResponse {
  nPagina: number
  nTotPaginas: number
  nRegistros: number
  nTotRegistros: number
  contatosCadastro?: OmieCRMContato[]
}

// ============================================
// CRM — Oportunidades
// ============================================

export interface OmieCRMOportunidade {
  nCod?: number
  cCodInt?: string
  nCodConta?: number
  cDescricao: string
  nValor?: number
  cFase?: string
  nCodVendedor?: number
  cOrigem?: string
  cTipo?: string
  cMotivo?: string
  dPrevisao?: string
  cObs?: string
  cSolucao?: string
  [key: string]: any
}

export interface OmieCRMOportunidadeListRequest extends OmiePaginatedRequest {
  nCodConta?: number
  nCodVendedor?: number
  cFase?: string
}

export interface OmieCRMOportunidadeListResponse {
  nPagina: number
  nTotPaginas: number
  nRegistros: number
  nTotRegistros: number
  oportunidadesCadastro?: OmieCRMOportunidade[]
}

// ============================================
// CRM — Tarefas
// ============================================

export interface OmieCRMTarefa {
  nCod?: number
  cCodInt?: string
  nCodConta?: number
  nCodOportunidade?: number
  cTitulo: string
  cDescricao?: string
  dData?: string
  cHora?: string
  cStatus?: string
  cTipo?: string
  nCodUsuario?: number
  [key: string]: any
}

export interface OmieCRMTarefaListRequest extends OmiePaginatedRequest {
  nCodConta?: number
  nCodOportunidade?: number
  cStatus?: string
}

export interface OmieCRMTarefaListResponse {
  nPagina: number
  nTotPaginas: number
  nRegistros: number
  nTotRegistros: number
  tarefasCadastro?: OmieCRMTarefa[]
}

// ============================================
// Finanças — Contas Correntes
// ============================================

export interface OmieContaCorrente {
  nCodCC?: number
  cCodIntCC?: string
  descricao: string
  tipo?: string
  codigo_banco?: string
  agencia?: string
  nro_conta?: string
  saldo_inicial?: number
  [key: string]: any
}

export interface OmieContaCorrenteListResponse {
  pagina: number
  total_de_paginas: number
  registros: number
  total_de_registros: number
  conta_corrente_lista?: OmieContaCorrente[]
  ListarContasCorrentes?: OmieContaCorrente[]
}

// ============================================
// Finanças — Contas a Pagar
// ============================================

export interface OmieContaPagar {
  codigo_lancamento_omie?: number
  codigo_lancamento_integracao?: string
  codigo_cliente_fornecedor?: number
  data_vencimento?: string
  valor_documento?: number
  numero_documento?: string
  codigo_categoria?: string
  data_previsao?: string
  observacao?: string
  [key: string]: any
}

export interface OmieContaPagarListResponse {
  pagina: number
  total_de_paginas: number
  registros: number
  total_de_registros: number
  conta_pagar_cadastro?: OmieContaPagar[]
}

// ============================================
// Finanças — Contas a Receber
// ============================================

export interface OmieContaReceber {
  codigo_lancamento_omie?: number
  codigo_lancamento_integracao?: string
  codigo_cliente_fornecedor?: number
  data_vencimento?: string
  valor_documento?: number
  numero_documento?: string
  codigo_categoria?: string
  data_previsao?: string
  observacao?: string
  numero_parcela?: string
  [key: string]: any
}

export interface OmieContaReceberListResponse {
  pagina: number
  total_de_paginas: number
  registros: number
  total_de_registros: number
  conta_receber_cadastro?: OmieContaReceber[]
}

// ============================================
// Compras — Produtos
// ============================================

export interface OmieProduto {
  codigo_produto?: number
  codigo_produto_integracao?: string
  codigo?: string
  descricao: string
  unidade?: string
  ncm?: string
  ean?: string
  valor_unitario?: number
  peso_bruto?: number
  peso_liq?: number
  tipo_item?: string
  marca?: string
  modelo?: string
  descricao_detalhada?: string
  observacoes?: string
  tipoItem?: string
  codigo_familia?: number
  [key: string]: any
}

export interface OmieProdutoListRequest extends OmiePaginatedRequest {
  filtrar_apenas_omiepdv?: string
}

export interface OmieProdutoListResponse {
  pagina: number
  total_de_paginas: number
  registros: number
  total_de_registros: number
  produto_servico_cadastro?: OmieProduto[]
}

// ============================================
// Compras — Pedidos de Compra
// ============================================

export interface OmiePedidoCompra {
  cabecalho?: {
    codigo_pedido?: number
    codigo_pedido_integracao?: string
    numero_pedido?: string
    codigo_cliente_fornecedor?: number
    data_previsao?: string
    observacoes?: string
    [key: string]: any
  }
  det?: any[]
  frete?: any
  [key: string]: any
}

export interface OmiePedidoCompraListResponse {
  pagina: number
  total_de_paginas: number
  registros: number
  total_de_registros: number
  pedido_compra_cadastro?: OmiePedidoCompra[]
}

// ============================================
// Vendas — Pedidos de Venda
// ============================================

export interface OmiePedidoVenda {
  cabecalho?: {
    codigo_pedido?: number
    codigo_pedido_integracao?: string
    numero_pedido?: string
    codigo_cliente?: number
    data_previsao?: string
    etapa?: string
    codigo_parcela?: string
    [key: string]: any
  }
  det?: any[]
  frete?: any
  informacoes_adicionais?: any
  [key: string]: any
}

export interface OmiePedidoVendaListRequest extends OmiePaginatedRequest {
  filtrar_apenas_inclusao?: string
  filtrar_apenas_alteracao?: string
  filtrar_por_etapa?: string
  filtrar_por_cliente?: number
}

export interface OmiePedidoVendaListResponse {
  pagina: number
  total_de_paginas: number
  registros: number
  total_de_registros: number
  pedido_venda_produto?: OmiePedidoVenda[]
}

// ============================================
// Estoque
// ============================================

export interface OmieEstoqueConsulta {
  codigo_local_estoque?: number
  nCodProd?: number
  cCodInt?: string
  nEstMin?: number
  nEstMax?: number
  nSaldo?: number
  nPendIn?: number
  nPendOut?: number
  nPrecoMedio?: number
  [key: string]: any
}

export interface OmieEstoqueMovimento {
  nCodProd?: number
  cCodInt?: string
  dDataMov?: string
  cTipoMov?: string
  nQtdeMov?: number
  nValorUnit?: number
  cObservacao?: string
  [key: string]: any
}

// ============================================
// Vendas — Cupom Fiscal
// ============================================

export interface OmieCupomFiscal {
  nCodCupom?: number
  cCodIntCupom?: string
  nCodCliente?: number
  dDataEmissao?: string
  nValorTotal?: number
  cStatus?: string
  [key: string]: any
}

// ============================================
// Mapeamento de módulos para endpoints Omie
// ============================================

export interface OmieModuleConfig {
  endpoint: string
  methods: Record<string, string> // { action: omieCallName }
  label: string
  description: string
}

export const OMIE_MODULES: Record<string, Record<string, OmieModuleConfig>> = {
  geral: {
    clientes: {
      endpoint: '/geral/clientes/',
      methods: {
        listar: 'ListarClientes',
        listarResumido: 'ListarClientesResumido',
        consultar: 'ConsultarCliente',
        incluir: 'IncluirCliente',
        alterar: 'AlterarCliente',
        upsert: 'UpsertCliente',
        upsertCnpj: 'UpsertClienteCpfCnpj',
        excluir: 'ExcluirCliente',
      },
      label: 'Clientes, Fornecedores, Transportadoras',
      description: 'Cria/edita/consulta o cadastro de clientes, fornecedores, transportadoras, etc',
    },
    caracteristicas: {
      endpoint: '/geral/clientescaract/',
      methods: {
        incluir: 'IncluirCaractCliente',
        alterar: 'AlterarCaractCliente',
        consultar: 'ConsultarCaractCliente',
        excluir: 'ExcluirCaractCliente',
        excluirTodas: 'ExcluirTodasCaractCliente',
      },
      label: 'Clientes - Características',
      description: 'Cria/edita/consulta características de clientes',
    },
    tags: {
      endpoint: '/geral/clientetag/',
      methods: {
        incluir: 'IncluirTags',
        listar: 'ListarTags',
        excluir: 'ExcluirTags',
        excluirTodas: 'ExcluirTodas',
      },
      label: 'Tags',
      description: 'Cria/edita/consulta tags usadas no cadastro de clientes, fornecedores, etc',
    },
    projetos: {
      endpoint: '/geral/projetos/',
      methods: {
        listar: 'ListarProjetos',
        consultar: 'ConsultarProjeto',
        incluir: 'IncluirProjeto',
        alterar: 'AlterarProjeto',
      },
      label: 'Projetos',
      description: 'Cria/edita/consulta projetos',
    },
    empresas: {
      endpoint: '/geral/empresas/',
      methods: { listar: 'ListarEmpresas' },
      label: 'Empresas',
      description: 'Lista o cadastro da empresa',
    },
    departamentos: {
      endpoint: '/geral/departamentos/',
      methods: { listar: 'ListarDepartamentos' },
      label: 'Departamentos',
      description: 'Lista o cadastro de departamentos',
    },
    categorias: {
      endpoint: '/geral/categorias/',
      methods: { listar: 'ListarCategorias' },
      label: 'Categorias',
      description: 'Lista o cadastro de categorias',
    },
    parcelas: {
      endpoint: '/geral/parcelas/',
      methods: { listar: 'ListarParcelas' },
      label: 'Parcelas',
      description: 'Lista as parcelas cadastradas',
    },
    tiposAtividade: {
      endpoint: '/geral/tpativ/',
      methods: { listar: 'ListarTiposAtiv' },
      label: 'Tipos de Atividade',
      description: 'Lista os tipos de atividade da empresa',
    },
    cnae: {
      endpoint: '/geral/cnae/',
      methods: { listar: 'ListarCNAE' },
      label: 'CNAE',
      description: 'Lista códigos CNAE',
    },
    cidades: {
      endpoint: '/geral/cidades/',
      methods: { listar: 'PesquisarCidades' },
      label: 'Cidades',
      description: 'Lista o cadastro de cidades',
    },
    paises: {
      endpoint: '/geral/paises/',
      methods: { listar: 'ListarPaises' },
      label: 'Países',
      description: 'Lista o cadastro de países',
    },
    tiposAnexo: {
      endpoint: '/geral/tiposanexo/',
      methods: { listar: 'ListarTiposAnexo' },
      label: 'Tipos de Anexos',
      description: 'Consulta Tipos de Anexos',
    },
    anexos: {
      endpoint: '/geral/anexo/',
      methods: {
        listar: 'ListarAnexo',
        incluir: 'IncluirAnexo',
        excluir: 'ExcluirAnexo',
      },
      label: 'Documentos Anexos',
      description: 'Criar/edita/consulta e exclui documentos anexos',
    },
    tipoEntrega: {
      endpoint: '/geral/tipoentrega/',
      methods: {
        listar: 'ListarTipoEntrega',
        incluir: 'IncluirTipoEntrega',
        alterar: 'AlterarTipoEntrega',
        excluir: 'ExcluirTipoEntrega',
      },
      label: 'Tipo de Entrega',
      description: 'Criar/edita/consulta e exclui tipo de entrega de fornecedores',
    },
    tipoAssinante: {
      endpoint: '/geral/tipoassinante/',
      methods: { listar: 'ListarTipoAssinante' },
      label: 'Tipo de Assinante',
      description: 'Lista os Tipos de Assinante',
    },
    tarefas: {
      endpoint: '/geral/tarefas/',
      methods: { listar: 'ListarTarefas' },
      label: 'Tarefas',
      description: 'Cria/consulta/lista tarefas',
    },
  },

  crm: {
    contas: {
      endpoint: '/crm/contas/',
      methods: {
        listar: 'ListarContas',
        consultar: 'ConsultarConta',
        incluir: 'IncluirConta',
        alterar: 'AlterarConta',
        upsert: 'UpsertConta',
        excluir: 'ExcluirConta',
      },
      label: 'Contas',
      description: 'Cria/edita/consulta Contas',
    },
    contasCaracteristicas: {
      endpoint: '/crm/contascaract/',
      methods: {
        incluir: 'IncluirCaractConta',
        alterar: 'AlterarCaractConta',
        consultar: 'ConsultarCaractConta',
        excluir: 'ExcluirCaractConta',
      },
      label: 'Contas - Características',
      description: 'Cria/edita/consulta características da conta',
    },
    contatos: {
      endpoint: '/crm/contatos/',
      methods: {
        listar: 'ListarContatos',
        consultar: 'ConsultarContato',
        incluir: 'IncluirContato',
        alterar: 'AlterarContato',
        upsert: 'UpsertContato',
        excluir: 'ExcluirContato',
      },
      label: 'Contatos',
      description: 'Cria/edita/consulta Contatos',
    },
    oportunidades: {
      endpoint: '/crm/oportunidades/',
      methods: {
        listar: 'ListarOportunidades',
        consultar: 'ConsultarOportunidade',
        incluir: 'IncluirOportunidade',
        alterar: 'AlterarOportunidade',
        upsert: 'UpsertOportunidade',
        excluir: 'ExcluirOportunidade',
      },
      label: 'Oportunidades',
      description: 'Cria/edita/consulta Oportunidades',
    },
    oportunidadesResumo: {
      endpoint: '/crm/oportunidades/',
      methods: { resumo: 'ResumoOportunidades' },
      label: 'Oportunidades - Resumo',
      description: 'Resumo de Oportunidades',
    },
    tarefas: {
      endpoint: '/crm/tarefas/',
      methods: {
        listar: 'ListarTarefas',
        consultar: 'ConsultarTarefa',
        incluir: 'IncluirTarefa',
        alterar: 'AlterarTarefa',
        excluir: 'ExcluirTarefa',
      },
      label: 'Tarefas',
      description: 'Cria/edita/consulta Tarefas',
    },
    tarefasResumo: {
      endpoint: '/crm/tarefas/',
      methods: { resumo: 'ResumoTarefas' },
      label: 'Tarefas - Resumo',
      description: 'Resumo de Tarefas',
    },
    solucoes: {
      endpoint: '/crm/solucoes/',
      methods: { listar: 'ListarSolucoes' },
      label: 'Soluções',
      description: 'Lista das soluções ofertadas',
    },
    fases: {
      endpoint: '/crm/fases/',
      methods: { listar: 'ListarFases' },
      label: 'Fases',
      description: 'Lista as fases da oportunidade',
    },
    usuarios: {
      endpoint: '/crm/usuarios/',
      methods: { listar: 'ListarUsuarios' },
      label: 'Usuários',
      description: 'Lista dos usuários do CRM',
    },
    status: {
      endpoint: '/crm/status/',
      methods: { listar: 'ListarStatus' },
      label: 'Status',
      description: 'Lista status possíveis de uma oportunidade',
    },
    motivos: {
      endpoint: '/crm/motivos/',
      methods: { listar: 'ListarMotivos' },
      label: 'Motivos',
      description: 'Lista motivos de conclusão de uma oportunidade',
    },
    tipos: {
      endpoint: '/crm/tipos/',
      methods: { listar: 'ListarTipos' },
      label: 'Tipos',
      description: 'Lista os tipos disponíveis de uma oportunidade',
    },
    parceiros: {
      endpoint: '/crm/parceiros/',
      methods: { listar: 'ListarParceiros' },
      label: 'Parceiros',
      description: 'Lista dos parceiros e equipes',
    },
    finders: {
      endpoint: '/crm/finders/',
      methods: { listar: 'ListarFinders' },
      label: 'Finders',
      description: 'Lista dos finders cadastrados',
    },
    origens: {
      endpoint: '/crm/origens/',
      methods: { listar: 'ListarOrigens' },
      label: 'Origens',
      description: 'Lista de origens disponíveis para a oportunidade',
    },
    concorrentes: {
      endpoint: '/crm/concorrentes/',
      methods: { listar: 'ListarConcorrentes' },
      label: 'Concorrentes',
      description: 'Lista dos concorrentes cadastrados',
    },
    verticais: {
      endpoint: '/crm/verticais/',
      methods: { listar: 'ListarVerticais' },
      label: 'Verticais',
      description: 'Lista das verticais atendidas',
    },
    vendedores: {
      endpoint: '/crm/vendedores/',
      methods: { listar: 'ListarVendedores' },
      label: 'Vendedores',
      description: 'Lista dos vendedores ativos no CRM',
    },
    telemarketing: {
      endpoint: '/crm/telemarketing/',
      methods: { listar: 'ListarTelemarketing' },
      label: 'Telemarketing',
      description: 'Lista dos atendentes de telemarketing',
    },
    preVendas: {
      endpoint: '/crm/prevendas/',
      methods: { listar: 'ListarPreVendas' },
      label: 'Pré-Vendas',
      description: 'Lista dos usuários de pré-venda',
    },
    tiposTarefa: {
      endpoint: '/crm/tipostarefa/',
      methods: {
        listar: 'ListarTiposTarefa',
        incluir: 'IncluirTipoTarefa',
        alterar: 'AlterarTipoTarefa',
        excluir: 'ExcluirTipoTarefa',
      },
      label: 'Tipos de Tarefas',
      description: 'Criar/edita/consulta e exclui Tipos de Tarefas',
    },
  },

  financas: {
    contasCorrentes: {
      endpoint: '/financas/contacorrente/',
      methods: {
        listar: 'ListarContasCorrentes',
        consultar: 'ConsultarContaCorrente',
        incluir: 'IncluirContaCorrente',
        alterar: 'AlterarContaCorrente',
      },
      label: 'Contas Correntes',
      description: 'Cria/edita/consulta o cadastro de contas correntes',
    },
    lancamentosCC: {
      endpoint: '/financas/contacorrentelancamentos/',
      methods: {
        listar: 'ListarLancCC',
        incluir: 'IncluirLancCC',
        alterar: 'AlterarLancCC',
        excluir: 'ExcluirLancCC',
      },
      label: 'Contas Correntes - Lançamentos',
      description: 'Cria/edita/consulta lançamentos na conta corrente',
    },
    contasPagar: {
      endpoint: '/financas/contapagar/',
      methods: {
        listar: 'ListarContasPagar',
        consultar: 'ConsultarContaPagar',
        incluir: 'IncluirContaPagar',
        alterar: 'AlterarContaPagar',
      },
      label: 'Contas a Pagar',
      description: 'Cria/edita/consulta títulos a pagar',
    },
    contasReceber: {
      endpoint: '/financas/contareceber/',
      methods: {
        listar: 'ListarContasReceber',
        consultar: 'ConsultarContaReceber',
        incluir: 'IncluirContaReceber',
        alterar: 'AlterarContaReceber',
      },
      label: 'Contas a Receber',
      description: 'Cria/edita/consulta títulos a receber',
    },
    boletos: {
      endpoint: '/financas/contareceberboleto/',
      methods: {
        gerar: 'GerarBoleto',
        obter: 'ObterBoleto',
        prorrogar: 'ProrrogarBoleto',
        cancelar: 'CancelarBoleto',
      },
      label: 'Boletos',
      description: 'Gera/Obtém/Prorroga e Cancela Boletos',
    },
    pix: {
      endpoint: '/financas/contareceberpix/',
      methods: {
        gerar: 'GerarPix',
        consultar: 'ConsultarPix',
        cancelar: 'CancelarPix',
      },
      label: 'PIX',
      description: 'Gera um PIX para um contas a receber do Omie.CASH',
    },
    extrato: {
      endpoint: '/financas/extratoconta/',
      methods: { listar: 'ListarExtrato' },
      label: 'Extrato de Conta Corrente',
      description: 'Listagem do extrato de conta corrente',
    },
    orcamentoCaixa: {
      endpoint: '/financas/orcamentodecaixa/',
      methods: { listar: 'ListarOrcamentoCaixa' },
      label: 'Orçamento de Caixa',
      description: 'Listagem do orçamento de caixa (Previsto x Realizado)',
    },
    pesquisarTitulos: {
      endpoint: '/financas/pesquisartitulos/',
      methods: { pesquisar: 'PesquisarLancamentos' },
      label: 'Pesquisar Títulos',
      description: 'Lista de títulos a pagar e receber',
    },
    movimentosFinanceiros: {
      endpoint: '/financas/mf/',
      methods: { consultar: 'ConsultarMovFinanceiro' },
      label: 'Movimentos Financeiros',
      description: 'Consulta de pagamentos, baixas, lançamentos no CC',
    },
    resumo: {
      endpoint: '/financas/resumo/',
      methods: { obter: 'ObterResumoFinancas' },
      label: 'Resumo',
      description: 'Resumo de Finanças',
    },
    bancos: {
      endpoint: '/financas/bancos/',
      methods: { listar: 'ListarBancos' },
      label: 'Bancos',
      description: 'Lista o cadastro de instituições bancárias',
    },
    tiposDocumento: {
      endpoint: '/financas/tiposdocumento/',
      methods: { listar: 'ListarTiposDocumento' },
      label: 'Tipos de Documento',
      description: 'Lista os tipos de documentos',
    },
    tiposCC: {
      endpoint: '/financas/tiposcc/',
      methods: { listar: 'ListarTiposCC' },
      label: 'Tipos de Contas Correntes',
      description: 'Lista os tipos de contas correntes',
    },
    contasDRE: {
      endpoint: '/financas/contasdre/',
      methods: { listar: 'ListarContasDRE' },
      label: 'Contas do DRE',
      description: 'Lista as Contas do DRE',
    },
    finalidadeTransferencia: {
      endpoint: '/financas/finalidadetransf/',
      methods: { listar: 'ListarFinalidadeTransf' },
      label: 'Finalidade de Transferência',
      description: 'Lista as Finalidades de Transferência do CNAB',
    },
    origemTitulos: {
      endpoint: '/financas/origemlanc/',
      methods: { listar: 'ListarOrigemLanc' },
      label: 'Origem dos Títulos',
      description: 'Lista as origens dos títulos',
    },
    bandeirasCartao: {
      endpoint: '/financas/bandeiracartao/',
      methods: { listar: 'ListarBandeirasCartao' },
      label: 'Bandeiras de Cartão',
      description: 'Lista as Bandeiras de Cartão de débito e crédito',
    },
  },

  compras: {
    produtos: {
      endpoint: '/geral/produtos/',
      methods: {
        listar: 'ListarProdutos',
        consultar: 'ConsultarProduto',
        incluir: 'IncluirProduto',
        alterar: 'AlterarProduto',
        upsert: 'UpsertProduto',
        excluir: 'ExcluirProduto',
      },
      label: 'Produtos',
      description: 'Cria/edita/consulta produtos',
    },
    produtosCaracteristicas: {
      endpoint: '/geral/prodcaract/',
      methods: {
        incluir: 'IncluirCaractProduto',
        alterar: 'AlterarCaractProduto',
        consultar: 'ConsultarCaractProduto',
        excluir: 'ExcluirCaractProduto',
      },
      label: 'Produtos - Características',
      description: 'Cria/edita/consulta características de produto',
    },
    produtosEstrutura: {
      endpoint: '/geral/prodestrutura/',
      methods: { consultar: 'ConsultarEstrutura' },
      label: 'Produtos - Estrutura',
      description: 'Consulta estrutura de um determinado produto',
    },
    produtosKit: {
      endpoint: '/geral/prodkit/',
      methods: {
        consultar: 'ConsultarKit',
        alterar: 'AlterarKit',
      },
      label: 'Produtos - Kit',
      description: 'Edita kit de produtos',
    },
    produtosVariacao: {
      endpoint: '/geral/prodvariacao/',
      methods: {
        listar: 'ListarVariacoes',
        incluir: 'IncluirVariacao',
        consultar: 'ConsultarVariacao',
      },
      label: 'Produtos - Variação',
      description: 'Cria/consulta/lista variações dos produtos',
    },
    produtosLote: {
      endpoint: '/geral/prodlote/',
      methods: {
        listar: 'ListarLotes',
        consultar: 'ConsultarLote',
      },
      label: 'Produtos - Lote',
      description: 'Consulta/lista lotes dos produtos',
    },
    requisicoesCompra: {
      endpoint: '/compras/requisicaocompra/',
      methods: {
        listar: 'ListarRequisicoesCompra',
        consultar: 'ConsultarRequisicaoCompra',
        incluir: 'IncluirRequisicaoCompra',
      },
      label: 'Requisições de Compra',
      description: 'Cria/edita/consulta requisições de compra',
    },
    pedidosCompra: {
      endpoint: '/compras/pedido/',
      methods: {
        listar: 'ListarPedidosCompra',
        consultar: 'ConsultarPedidoCompra',
        incluir: 'IncluirPedidoCompra',
        alterar: 'AlterarPedidoCompra',
      },
      label: 'Pedidos de Compra',
      description: 'Cria/edita/consulta pedidos de compra',
    },
    ordensProducao: {
      endpoint: '/compras/ordemproducao/',
      methods: {
        listar: 'ListarOrdensProducao',
        consultar: 'ConsultarOrdemProducao',
        incluir: 'IncluirOrdemProducao',
        alterar: 'AlterarOrdemProducao',
      },
      label: 'Ordens de Produção',
      description: 'Cria/edita/consulta ordens de produção',
    },
    notaEntrada: {
      endpoint: '/compras/notaentrada/',
      methods: {
        listar: 'ListarNotasEntrada',
        consultar: 'ConsultarNotaEntrada',
        incluir: 'IncluirNotaEntrada',
        alterar: 'AlterarNotaEntrada',
      },
      label: 'Nota de Entrada',
      description: 'Cria/Edita/Consulta Notas de Entrada',
    },
    notaEntradaFaturamento: {
      endpoint: '/compras/notaentradafat/',
      methods: {
        faturar: 'FaturarNotaEntrada',
        cancelar: 'CancelarFaturamento',
      },
      label: 'Nota de Entrada - Faturamento',
      description: 'Operações de faturamento de Notas de Entrada',
    },
    recebimentoNFe: {
      endpoint: '/compras/recebimentonfe/',
      methods: { alterar: 'AlterarRecebimentoNFe' },
      label: 'Recebimento de Nota Fiscal',
      description: 'Edita os dados do Recebimento de uma NF-e',
    },
    resumoCompras: {
      endpoint: '/compras/resumo/',
      methods: { obter: 'ObterResumoCompras' },
      label: 'Resumo',
      description: 'Resumo de compras',
    },
    familias: {
      endpoint: '/geral/familias/',
      methods: {
        listar: 'ListarFamilias',
        incluir: 'IncluirFamilia',
        alterar: 'AlterarFamilia',
        consultar: 'ConsultarFamilia',
      },
      label: 'Famílias de Produto',
      description: 'Cria/edita/consulta famílias de produto',
    },
    unidades: {
      endpoint: '/geral/unidade/',
      methods: { listar: 'ListarUnidades' },
      label: 'Unidades',
      description: 'Consulta unidades de medida',
    },
    compradores: {
      endpoint: '/compras/compradores/',
      methods: { listar: 'ListarCompradores' },
      label: 'Compradores',
      description: 'Consulta lista de compradores cadastrados',
    },
    produtoFornecedor: {
      endpoint: '/geral/prodfornec/',
      methods: { listar: 'ListarProdFornec' },
      label: 'Produto x Fornecedor',
      description: 'Lista relação entre produtos e fornecedores',
    },
    formasPagamento: {
      endpoint: '/compras/formaspagamento/',
      methods: { listar: 'ListarFormasPagCompra' },
      label: 'Formas de Pagamento',
      description: 'Lista as opções de forma de pagamento de uma compra',
    },
    ncm: {
      endpoint: '/geral/ncm/',
      methods: { listar: 'ListarNCM', consultar: 'ConsultarNCM' },
      label: 'NCM',
      description: 'Lista/consulta de códigos NCM',
    },
    cenarioImpostos: {
      endpoint: '/geral/cenarioimpostos/',
      methods: { listar: 'ListarCenarios' },
      label: 'Cenário de Impostos',
      description: 'Lista os Cenários de Impostos',
    },
    cfop: {
      endpoint: '/geral/cfop/',
      methods: { listar: 'ListarCFOP' },
      label: 'CFOP',
      description: 'Lista códigos CFOP',
    },
    icmsCst: {
      endpoint: '/geral/icms/',
      methods: { listar: 'ListarICMS_CST' },
      label: 'ICMS - CST',
      description: 'Lista ICMS CST',
    },
    icmsCsosn: {
      endpoint: '/geral/icms/',
      methods: { listarCsosn: 'ListarICMS_CSOSN' },
      label: 'ICMS - CSOSN',
      description: 'Lista ICMS CSOSN',
    },
    icmsOrigem: {
      endpoint: '/geral/icms/',
      methods: { listarOrigem: 'ListarICMS_Origem' },
      label: 'ICMS - Origem da Mercadoria',
      description: 'Lista ICMS Origem da Mercadoria',
    },
    pisCst: {
      endpoint: '/geral/pis/',
      methods: { listar: 'ListarPIS_CST' },
      label: 'PIS - CST',
      description: 'Lista PIS CST',
    },
    cofinsCst: {
      endpoint: '/geral/cofins/',
      methods: { listar: 'ListarCOFINS_CST' },
      label: 'COFINS - CST',
      description: 'Lista COFINS CST',
    },
    ipiCst: {
      endpoint: '/geral/ipi/',
      methods: { listar: 'ListarIPI_CST' },
      label: 'IPI - CST',
      description: 'Lista IPI CST',
    },
    ipiEnquadramento: {
      endpoint: '/geral/ipi/',
      methods: { listarEnq: 'ListarIPI_Enquadramento' },
      label: 'IPI - Enquadramento',
      description: 'Lista IPI Enquadramento',
    },
    tipoCalculo: {
      endpoint: '/geral/tipocalculo/',
      methods: { listar: 'ListarTipoCalculo' },
      label: 'Tipo de Cálculo',
      description: 'Lista Tipos de Cálculo',
    },
    cest: {
      endpoint: '/geral/cest/',
      methods: { listar: 'ListarCEST' },
      label: 'CEST',
      description: 'Lista códigos CEST',
    },
  },

  estoque: {
    ajustes: {
      endpoint: '/estoque/ajuste/',
      methods: {
        incluir: 'IncluirAjusteEstoque',
        excluir: 'ExcluirAjusteEstoque',
      },
      label: 'Ajustes de Estoque',
      description: 'Cria/exclui movimentações do estoque',
    },
    consulta: {
      endpoint: '/estoque/consulta/',
      methods: { consultar: 'ConsultarEstoqueProduto' },
      label: 'Consulta Estoque',
      description: 'Consulta consolidada do estoque do produto',
    },
    movimento: {
      endpoint: '/estoque/movestoque/',
      methods: { listar: 'ListarMovEstoque' },
      label: 'Movimento Estoque',
      description: 'Lista os movimentos de estoque de entrada/saida por período',
    },
    locais: {
      endpoint: '/estoque/local/',
      methods: { listar: 'ListarLocaisEstoque' },
      label: 'Locais de Estoque',
      description: 'Listagem dos Locais de Estoque',
    },
    resumo: {
      endpoint: '/estoque/resumo/',
      methods: { obter: 'ObterResumoEstoque' },
      label: 'Resumo do Estoque',
      description: 'Resumo do Estoque de um produto',
    },
  },

  vendas: {
    pedidosResumido: {
      endpoint: '/produtos/pedidovendafat/',
      methods: {
        listar: 'ListarPedidosFat',
        incluir: 'AdicionarPedido',
      },
      label: 'Pedidos de Venda - Resumido',
      description: 'Adiciona pedidos e itens de venda de produto',
    },
    pedidos: {
      endpoint: '/produtos/pedido/',
      methods: {
        listar: 'ListarPedidos',
        consultar: 'ConsultarPedido',
        incluir: 'IncluirPedido',
        alterar: 'AlterarPedidoVenda',
      },
      label: 'Pedidos de Venda',
      description: 'Cria/edita/consulta pedidos e orçamentos',
    },
    pedidosFaturamento: {
      endpoint: '/produtos/pedidovendafat/',
      methods: {
        faturar: 'FaturarPedidoVenda',
        cancelar: 'CancelarFaturamento',
      },
      label: 'Pedidos de Venda - Faturamento',
      description: 'Operações de faturamento de pedido',
    },
    pedidosEtapas: {
      endpoint: '/produtos/pedidovendaetapas/',
      methods: { consultar: 'ConsultarEtapasPedido' },
      label: 'Pedidos de Venda - Etapas',
      description: 'Consulta das etapas de pedido',
    },
    cte: {
      endpoint: '/produtos/cte/',
      methods: {
        incluir: 'IncluirCTe',
        cancelar: 'CancelarCTe',
      },
      label: 'CT-e / CT-e OS',
      description: 'Adiciona/Cancela Conhecimento de Transporte',
    },
    remessa: {
      endpoint: '/produtos/remessa/',
      methods: {
        listar: 'ListarRemessas',
        consultar: 'ConsultarRemessa',
        incluir: 'IncluirRemessa',
        alterar: 'AlterarRemessa',
      },
      label: 'Remessa de Produtos',
      description: 'Cria/edita uma NF de remessa de produto',
    },
    remessaFaturamento: {
      endpoint: '/produtos/remessafat/',
      methods: {
        faturar: 'FaturarRemessa',
        cancelar: 'CancelarFaturamentoRemessa',
      },
      label: 'Remessa de Produtos - Faturamento',
      description: 'Operações de faturamento da Remessa',
    },
    resumoVendas: {
      endpoint: '/produtos/resumovendas/',
      methods: { obter: 'ObterResumoVendas' },
      label: 'Resumo',
      description: 'Resumo de vendas de NF-e, CT-e e Cupom Fiscal',
    },
    documentos: {
      endpoint: '/produtos/documento/',
      methods: { obter: 'ObterDocumento' },
      label: 'Obter Documentos',
      description: 'Disponibiliza PDF e XML de documentos fiscais (NF-e, NFC-e, CT-e, etc)',
    },
    produtos: {
      endpoint: '/geral/produtos/',
      methods: {
        listar: 'ListarProdutos',
        consultar: 'ConsultarProduto',
        incluir: 'IncluirProduto',
        alterar: 'AlterarProduto',
      },
      label: 'Produtos',
      description: 'Cria/edita/consulta produtos',
    },
    produtosCaracteristicas: {
      endpoint: '/geral/prodcaract/',
      methods: {
        incluir: 'IncluirCaractProduto',
        alterar: 'AlterarCaractProduto',
        consultar: 'ConsultarCaractProduto',
      },
      label: 'Produtos - Características',
      description: 'Cria/edita/consulta características de produto',
    },
    produtosKit: {
      endpoint: '/geral/prodkit/',
      methods: { consultar: 'ConsultarKit', alterar: 'AlterarKit' },
      label: 'Produtos - Kit',
      description: 'Edita kit de produtos',
    },
    produtosVariacao: {
      endpoint: '/geral/prodvariacao/',
      methods: { listar: 'ListarVariacoes', consultar: 'ConsultarVariacao' },
      label: 'Produtos - Variação',
      description: 'Cria/consulta/lista variações dos produtos',
    },
    produtosLote: {
      endpoint: '/geral/prodlote/',
      methods: { listar: 'ListarLotes', consultar: 'ConsultarLote' },
      label: 'Produtos - Lote',
      description: 'Consulta/lista lotes dos produtos',
    },
    cupomAdicionar: {
      endpoint: '/produtos/cupomfiscal/',
      methods: { adicionar: 'AdicionarCupom' },
      label: 'Cupom Fiscal - Adicionar',
      description: 'Adicionar cupom fiscal/NFC-e/CF-e SAT',
    },
    cupomCancelar: {
      endpoint: '/produtos/cupomfiscalcancelar/',
      methods: {
        cancelar: 'CancelarCupom',
        excluir: 'ExcluirCupom',
        inutilizar: 'InutilizarCupom',
      },
      label: 'Cupom Fiscal - Cancelar/Excluir',
      description: 'Cancelar/excluir/inutilizar cupons fiscais',
    },
    cupomConsultar: {
      endpoint: '/produtos/cupomfiscalconsultar/',
      methods: { consultar: 'ConsultarCupom', listar: 'ListarCupons' },
      label: 'Cupom Fiscal - Consultar',
      description: 'Consultas de Cupom Fiscal',
    },
  },
}
