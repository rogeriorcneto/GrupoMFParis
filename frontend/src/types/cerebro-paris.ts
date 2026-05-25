// Tipos para o Cérebro Paris - ERP Integrado do Grupo Paris

export type ModuloERP = 
  | 'dashboard-executivo'
  | 'crm'
  | 'financeiro'
  | 'logistica'
  | 'producao'
  | 'rh'
  | 'bi'
  | 'automacoes'
  | 'ia-contextual'
  | 'configuracoes'
  // Módulos existentes do CRM
  | 'dashboard'
  | 'funil'
  | 'clientes'
  | 'pedidos'
  | 'tarefas'
  | 'ia'
  | 'integracoes'
  | 'relatorios'
  | 'equipe'
  | 'produtos'
  | 'criar-automacao'
  | 'automacoes-empresariais'
  | 'templates'
  | 'treinamento'
  | 'prospeccao'
  | 'baseleads'

export interface UsuarioERP {
  id: number
  nome: string
  email: string
  cargo: 'ceo' | 'diretor' | 'gerente' | 'supervisor' | 'analista' | 'operacional'
  departamento: string
  modulosPermitidos: ModuloERP[]
  permissoes: PermissoesModulo[]
  ativo: boolean
  dataCriacao: string
  ultimoAcesso: string
  // Propriedades do Vendedor para compatibilidade total (obrigatórias)
  telefone: string
  avatar: string
  usuario: string
  metaVendas: number
  taxaComissao: number
  metaLeads: number
  metaConversao: number
  auth_user_id: string
}

export interface PermissoesModulo {
  modulo: ModuloERP
  nivel: 'leitura' | 'escrita' | 'aprovacao' | 'administracao'
  restricoes?: string[]
}

// Dashboard Executivo
export interface DashboardExecutivo {
  kpisPrincipais: KPIPrincipal[]
  alertasInteligentes: AlertaInteligente[]
  previsoes: Previsao[]
  recomendacoesIA: RecomendacaoIA[]
  resumoModulos: ResumoModulo[]
}

export interface KPIPrincipal {
  id: string
  nome: string
  valor: number | string
  meta?: number
  variacaoPercentual: number
  tendencia: 'alta' | 'baixa' | 'estavel'
  status: 'positivo' | 'atencao' | 'critico'
  moduloOrigem: ModuloERP
  dataAtualizacao: string
}

export interface AlertaInteligente {
  id: string
  titulo: string
  descricao: string
  severidade: 'baixa' | 'media' | 'alta' | 'critica'
  modulo: ModuloERP
  dadosRelacionados: any
  acoesSugeridas: string[]
  criadoEm: string
  lido: boolean
}

export interface Previsao {
  id: string
  titulo: string
  periodo: string
  valorPrevisto: number
  confianca: number
  cenario: 'otimista' | 'realista' | 'pessimista'
  modulo: ModuloERP
  dados: any[]
}

export interface RecomendacaoIA {
  id: string
  titulo: string
  descricao: string
  impacto: 'baixo' | 'medio' | 'alto' | 'transformador'
  esforco: 'baixo' | 'medio' | 'alto'
  modulo: ModuloERP
  contexto: string
  acoes: AcaoRecomendada[]
}

export interface AcaoRecomendada {
  id: string
  descricao: string
  tipo: 'manual' | 'automacao' | 'analise'
  prioridade: number
}

export interface ResumoModulo {
  modulo: ModuloERP
  status: 'normal' | 'atencao' | 'critico'
  kpisChave: { nome: string; valor: number | string }[]
  tarefasPendentes: number
  alertasAtivos: number
  ultimaAtualizacao: string
}

// Financeiro
export interface Financeiro {
  fluxoCaixa: FluxoCaixa
  contasPagarReceber: Conta[]
  dreBalancete: DREBalancete
  analises: AnaliseFinanceira[]
  projecoes: ProjecaoFinanceira[]
}

export interface FluxoCaixa {
  saldoInicial: number
  entradas: Movimentacao[]
  saidas: Movimentacao[]
  saldoFinal: number
  projecao30dias: number
  projecao90dias: number
}

export interface Movimentacao {
  id: string
  descricao: string
  valor: number
  data: string
  categoria: string
  tipo: 'entrada' | 'saida'
  recorrente: boolean
}

export interface Conta {
  id: string
  documento: string
  valor: number
  vencimento: string
  status: 'aberto' | 'pago' | 'vencido' | 'cancelado'
  clienteFornecedor: string
  tipo: 'pagar' | 'receber'
  categoria: string
}

export interface DREBalancete {
  periodo: string
  receitas: Lancamento[]
  custos: Lancamento[]
  despesas: Lancamento[]
  resultadoLiquido: number
  margemLucro: number
}

export interface Lancamento {
  conta: string
  valor: number
  percentual: number
}

export interface AnaliseFinanceira {
  id: string
  titulo: string
  tipo: 'rentabilidade' | 'custos' | 'fluxo' | 'investimento'
  resultado: string
  insights: string[]
  recomendacoes: string[]
}

export interface ProjecaoFinanceira {
  periodo: string
  cenario: string
  receitaPrevista: number
  custoPrevisto: number
  lucroPrevisto: number
  confianca: number
}

// Logística
export interface Logistica {
  estoque: Estoque[]
  frota: Frota[]
  armazens: Armazem[]
  transportadoras: Transportadora[]
  rotas: Rota[]
}

export interface Estoque {
  id: string
  produto: string
  quantidade: number
  quantidadeMinima: number
  valorUnitario: number
  valorTotal: number
  localizacao: string
  ultimaMovimentacao: string
  status: 'normal' | 'baixo' | 'critico'
}

export interface Frota {
  id: string
  veiculo: string
  placa: string
  motorista: string
  status: 'disponivel' | 'em_uso' | 'manutencao'
  localizacao: { lat: number; lng: number }
  capacidade: number
  consumo: number
  proximaManutencao: string
}

export interface Armazem {
  id: string
  nome: string
  capacidade: number
  ocupacao: number
  localizacao: string
  produtos: ProdutoEstoque[]
  operacoes: OperacaoArmazem[]
}

export interface ProdutoEstoque {
  produto: string
  quantidade: number
  posicao: string
}

export interface OperacaoArmazem {
  id: string
  tipo: 'entrada' | 'saida' | 'transferencia'
  produto: string
  quantidade: number
  data: string
  responsavel: string
}

export interface Transportadora {
  id: string
  nome: string
  cnpj: string
  status: 'ativa' | 'inativa'
  performance: {
    entregues: number
    atrasadas: number
    mediaDias: number
  }
  tarifas: Tarifa[]
}

export interface Tarifa {
  rota: string
  valor: number
  modalidade: string
}

export interface Rota {
  id: string
  origem: string
  destino: string
  distancia: number
  tempoPrevisto: number
  custo: number
  veiculos: string[]
  frequencia: string
}

// Produção
export interface Producao {
  planejamento: PlanejamentoMRP
  ordensProducao: OrdemProducao[]
  controleQualidade: ControleQualidade[]
  manutencao: Manutencao[]
  oee: OEE
}

export interface PlanejamentoMRP {
  periodo: string
  demanda: DemandaItem[]
  capacidade: CapacidadeProducao[]
  necessidades: NecesidadeMaterial[]
  plano: PlanoProducao[]
}

export interface DemandaItem {
  produto: string
  quantidade: number
  dataPrevista: string
  prioridade: number
}

export interface CapacidadeProducao {
  recurso: string
  capacidade: number
  disponibilidade: number
  eficiencia: number
}

export interface NecesidadeMaterial {
  material: string
  quantidade: number
  dataNecessidade: string
  fornecedor: string
}

export interface PlanoProducao {
  id: string
  produto: string
  quantidade: number
  dataInicio: string
  dataFim: string
  recursos: string[]
}

export interface OrdemProducao {
  id: string
  produto: string
  quantidade: number
  status: 'planejada' | 'em_andamento' | 'finalizada' | 'cancelada'
  dataInicio: string
  dataFimPrevista: string
  recursos: RecursoProducao[]
}

export interface RecursoProducao {
  tipo: string
  nome: string
  tempo: number
}

export interface ControleQualidade {
  id: string
  produto: string
  lote: string
  testes: TesteQualidade[]
  resultado: 'aprovado' | 'reprovado' | 'pendente'
  data: string
  responsavel: string
}

export interface TesteQualidade {
  nome: string
  especificacao: string
  resultado: string
  status: 'conforme' | 'nao_conforme'
}

export interface Manutencao {
  id: string
  equipamento: string
  tipo: 'preventiva' | 'corretiva' | 'preditiva'
  status: 'planejada' | 'em_andamento' | 'concluida'
  dataProgramada: string
  custo: number
  responsavel: string
}

export interface OEE {
  data: string
  disponibilidade: number
  performance: number
  qualidade: number
  oeeTotal: number
}

// Recursos Humanos
export interface RH {
  funcionarios: Funcionario[]
  folhaPagamento: FolhaPagamento[]
  beneficios: Beneficio[]
  treinamentos: Treinamento[]
  performance: Performance[]
}

export interface Funcionario {
  id: string
  nome: string
  cpf: string
  cargo: string
  departamento: string
  dataAdmissao: string
  salario: number
  status: 'ativo' | 'inativo' | 'ferias'
  habilidades: string[]
  avaliacoes: Avaliacao[]
}

export interface FolhaPagamento {
  mes: string
  funcionarios: LancamentoFolha[]
  totalProventos: number
  totalDescontos: number
  totalLiquido: number
}

export interface LancamentoFolha {
  funcionarioId: string
  proventos: ItemLancamento[]
  descontos: ItemLancamento[]
  salarioLiquido: number
}

export interface ItemLancamento {
  descricao: string
  valor: number
  tipo: string
}

export interface Beneficio {
  id: string
  nome: string
  tipo: 'saude' | 'odontologico' | 'transporte' | 'alimentacao' | 'outro'
  valor: number
  funcionarios: string[]
}

export interface Treinamento {
  id: string
  titulo: string
  descricao: string
  tipo: 'interno' | 'externo' | 'online'
  duracao: number
  funcionarios: string[]
  status: 'planejado' | 'em_andamento' | 'concluido'
}

export interface Performance {
  funcionarioId: string
  periodo: string
  metas: Meta[]
  resultado: number
  feedback: string
}

export interface Meta {
  descricao: string
  peso: number
  atingido: number
  alvo: number
}

export interface Avaliacao {
  data: string
  avaliador: string
  notas: NotaAvaliacao[]
  comentario: string
  planoAcao: string[]
}

export interface NotaAvaliacao {
  competencia: string
  nota: number
  peso: number
}

// Business Intelligence
export interface BI {
  dashboards: Dashboard[]
  relatorios: Relatorio[]
  analises: Analise[]
  alertaDados: AlertaDados[]
}

export interface Dashboard {
  id: string
  nome: string
  descricao: string
  widgets: Widget[]
  filtros: Filtro[]
  compartilhamento: Compartilhamento[]
}

export interface Widget {
  id: string
  tipo: 'grafico' | 'tabela' | 'kpi' | 'mapa'
  titulo: string
  fonte: string
  configuracao: any
  posicao: { x: number; y: number; w: number; h: number }
}

export interface Filtro {
  campo: string
  tipo: 'data' | 'texto' | 'numero' | 'lista'
  valor: any
}

export interface Compartilhamento {
  usuario: string
  nivel: 'leitura' | 'edicao'
}

export interface Relatorio {
  id: string
  nome: string
  descricao: string
  query: string
  parametros: Parametro[]
  agendamento?: Agendamento
}

export interface Parametro {
  nome: string
  tipo: string
  obrigatorio: boolean
}

export interface Agendamento {
  frequencia: string
  destinatarios: string[]
  proximaExecucao: string
}

export interface Analise {
  id: string
  titulo: string
  descricao: string
  tipo: 'descritiva' | 'preditiva' | 'prescritiva'
  dados: any[]
  insights: string[]
  recomendacoes: string[]
}

export interface AlertaDados {
  id: string
  nome: string
  condicao: string
  severidade: string
  acoes: string[]
}

// Automações Empresariais
export interface AutomacaoEmpresarial {
  id: string
  nome: string
  descricao: string
  modulo: ModuloERP
  gatilhos: Gatilho[]
  acoes: Acao[]
  status: 'ativa' | 'inativa' | 'erro'
  execucoes: Execucao[]
  criadaPor: string
  dataCriacao: string
}

export interface Gatilho {
  id: string
  tipo: 'evento' | 'tempo' | 'condicao'
  configuracao: any
}

export interface Acao {
  id: string
  tipo: 'notificacao' | 'atualizacao' | 'integracao' | 'analise'
  configuracao: any
  ordem: number
}

export interface Execucao {
  id: string
  data: string
  status: 'sucesso' | 'erro' | 'parcial'
  resultado: any
  duracao: number
}

// IA Contextual
export interface IAContextual {
  baseConhecimento: BaseConhecimento
  agentes: AgenteIA[]
  conversas: ConversaIA[]
  analises: AnaliseIA[]
}

export interface BaseConhecimento {
  dadosEstruturais: DadoEstrutural[]
  documentos: Documento[]
  regras: RegraNegocio[]
  historico: HistoricoEvento[]
}

export interface DadoEstrutural {
  tipo: string
  valor: any
  fonte: string
  atualizacao: string
}

export interface Documento {
  id: string
  titulo: string
  tipo: string
  conteudo: string
  tags: string[]
}

export interface RegraNegocio {
  id: string
  nome: string
  condicao: string
  acao: string
  ativa: boolean
}

export interface HistoricoEvento {
  id: string
  tipo: string
  dados: any
  data: string
  impacto: string
}

export interface AgenteIA {
  id: string
  nome: string
  especialidade: ModuloERP
  capacidades: string[]
  status: 'ativo' | 'inativo'
  performance: PerformanceIA
}

export interface PerformanceIA {
  precisao: number
  respostaMedia: number
  satisfacao: number
}

export interface ConversaIA {
  id: string
  usuario: string
  agente: string
  mensagens: Mensagem[]
  contexto: string
  data: string
}

export interface Mensagem {
  papel: 'usuario' | 'assistente'
  conteudo: string
  dados?: any
}

export interface AnaliseIA {
  id: string
  titulo: string
  tipo: 'correlacao' | 'predicao' | 'otimizacao' | 'diagnostico'
  dados: any[]
  resultado: string
  confianca: number
  recomendacoes: string[]
}

// Contexto Empresarial Unificado
export interface ContextoEmpresarial {
  empresa: Empresa
  operacoes: Operacao[]
  financeiro: DadosFinanceiros
  pessoas: DadosPessoas
  mercado: DadosMercado
}

export interface Empresa {
  nome: string
  cnpj: string
  estrutura: EstruturaOrganizacional
  processos: Processo[]
  metas: MetaEmpresa[]
}

export interface EstruturaOrganizacional {
  departamentos: Departamento[]
  hierarquia: Hierarquia[]
  roles: Role[]
}

export interface Departamento {
  id: string
  nome: string
  responsavel: string
  metas: string[]
}

export interface Hierarquia {
  nivel: number
  cargo: string
  superiores: string[]
  subordinados: string[]
}

export interface Role {
  nome: string
  permissoes: string[]
  responsabilidades: string[]
}

export interface Processo {
  id: string
  nome: string
  descricao: string
  entradas: string[]
  saidas: string[]
  dono: string
  kpis: string[]
}

export interface MetaEmpresa {
  id: string
  descricao: string
  valor: number
  dataLimite: string
  responsavel: string
}

export interface Operacao {
  id: string
  tipo: string
  dados: any
  data: string
  impacto: string
}

export interface DadosFinanceiros {
  receita: number
  custos: number
  lucro: number
  fluxo: number
  investimentos: number
}

export interface DadosPessoas {
  funcionarios: number
  turnover: number
  satisfacao: number
  produtividade: number
}

export interface DadosMercado {
  share: number
  concorrentes: string[]
  tendencias: string[]
  oportunidades: string[]
}
