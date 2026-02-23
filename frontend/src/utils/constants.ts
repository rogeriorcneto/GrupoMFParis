import type { Template, TemplateMsg, Cadencia, Campanha, Vendedor, Produto } from '../types'

export const defaultTemplates: Template[] = [
  { id: 1, nome: 'Primeiro Contato', canal: 'email', etapa: 'prospecção', assunto: 'Apresentação MF Paris — Soluções para seu negócio', corpo: 'Olá {nome},\n\nSou {vendedor} da MF Paris. Gostaria de apresentar nossas soluções em lácteos, compostos e café para {empresa}.\n\nPodemos agendar uma conversa?\n\nAtt,\n{vendedor}' },
  { id: 2, nome: 'Envio de Amostra', canal: 'email', etapa: 'amostra', assunto: 'Confirmação de envio de amostras — MF Paris', corpo: 'Olá {nome},\n\nConfirmamos o envio das amostras solicitadas para {empresa}. Prazo estimado: 3 dias úteis.\n\nQualquer dúvida, estou à disposição.\n\nAtt,\n{vendedor}' },
  { id: 3, nome: 'Follow-up Homologação', canal: 'email', etapa: 'homologado', assunto: 'Como foi a avaliação? — MF Paris', corpo: 'Olá {nome},\n\nGostaria de saber como foi a avaliação dos nossos produtos em {empresa}. Podemos agendar uma reunião para discutir os próximos passos?\n\nAtt,\n{vendedor}' },
  { id: 4, nome: 'Proposta Comercial', canal: 'email', etapa: 'negociacao', assunto: 'Proposta Comercial — MF Paris para {empresa}', corpo: 'Olá {nome},\n\nSegue em anexo nossa proposta comercial personalizada para {empresa}.\n\nCondições especiais válidas até o final do mês.\n\nAtt,\n{vendedor}' },
  { id: 5, nome: 'Boas-vindas Pós-Venda', canal: 'email', etapa: 'pos_venda', assunto: 'Bem-vindo à MF Paris! 🎉', corpo: 'Olá {nome},\n\nÉ com grande satisfação que damos boas-vindas a {empresa} como nosso novo parceiro!\n\nSeu gerente de conta é {vendedor}. Qualquer necessidade, conte conosco.\n\nAtt,\nEquipe MF Paris' },
  { id: 6, nome: 'Primeiro Contato WhatsApp', canal: 'whatsapp', etapa: 'prospecção', corpo: 'Olá {nome}! 👋\nSou {vendedor} da *MF Paris*. Temos soluções em lácteos, compostos e café para {empresa}.\nPosso enviar nosso catálogo? 📋' },
  { id: 7, nome: 'Lembrete de Amostra', canal: 'whatsapp', etapa: 'amostra', corpo: 'Olá {nome}! 📦\nAs amostras da *MF Paris* já foram enviadas para {empresa}. Previsão de chegada: 3 dias úteis.\nQualquer dúvida, estou aqui! 😊' },
  { id: 8, nome: 'Follow-up WhatsApp', canal: 'whatsapp', etapa: 'negociacao', corpo: 'Olá {nome}! 🤝\nComo está a análise da nossa proposta para {empresa}?\nTemos condições especiais este mês. Posso ajudar em algo? 💬' },
]

export const defaultTemplatesMsgs: TemplateMsg[] = [
  { id: 1, canal: 'whatsapp', nome: 'Primeiro contato (WhatsApp)', conteudo: 'Olá {nome}, tudo bem? Aqui é da MF Paris. Posso te enviar nosso catálogo e condições para sua região?' },
  { id: 2, canal: 'email', nome: 'Catálogo (Email)', conteudo: 'Olá {nome},\n\nSegue nosso catálogo MF Paris e condições comerciais.\n\nSe preferir, agendamos uma ligação rápida.\n\nAbraços,' },
  { id: 3, canal: 'linkedin', nome: 'Conexão (LinkedIn)', conteudo: 'Olá {nome}, vi a empresa {empresa} e queria compartilhar nosso portfólio MF Paris. Podemos conversar?' },
  { id: 4, canal: 'instagram', nome: 'Apresentação (Instagram)', conteudo: 'Olá {nome}! Posso te enviar novidades e promoções MF Paris para {empresa}?' }
]

export const defaultCadencias: Cadencia[] = [
  { id: 1, nome: 'Prospecção 7 dias (WhatsApp + Email + LinkedIn)', pausarAoResponder: true, steps: [
    { id: 1, canal: 'whatsapp', delayDias: 0, templateId: 1 },
    { id: 2, canal: 'email', delayDias: 2, templateId: 2 },
    { id: 3, canal: 'linkedin', delayDias: 5, templateId: 3 }
  ] }
]

export const defaultCampanhas: Campanha[] = [
  { id: 1, nome: 'Reativação (30+ dias inativo)', cadenciaId: 1, diasInativoMin: 30, status: 'rascunho' }
]

export const defaultVendedores: Vendedor[] = [
  { id: 1, nome: 'Rafael', email: 'rafael@mfparis.com.br', telefone: '(31) 99999-0001', cargo: 'gerente', avatar: 'RA', usuario: 'admin', senha: 'admin123', metaVendas: 500000, metaLeads: 20, metaConversao: 15, ativo: true }
]

export const defaultProdutos: Produto[] = [
  // SACARIA 25kg — Linha Horizonte
  { id: 1, nome: 'Leite em Pó Integral 25kg', descricao: 'Rico em nutrientes essenciais, ideal para consumo direto e aplicações industriais. Produto possui SIF.', categoria: 'sacaria', preco: 650.00, unidade: 'sc', foto: '', sku: 'SAC-001', estoque: 200, pesoKg: 25, margemLucro: 18, ativo: true, destaque: true, dataCadastro: '2024-01-01' },
  { id: 2, nome: 'Leite em Pó Desnatado 25kg', descricao: 'Alternativa saudável com menor teor de gordura, preservando o sabor e os benefícios do leite.', categoria: 'sacaria', preco: 620.00, unidade: 'sc', foto: '', sku: 'SAC-002', estoque: 180, pesoKg: 25, margemLucro: 17, ativo: true, destaque: false, dataCadastro: '2024-01-01' },
  { id: 3, nome: 'Soro de Leite 25kg', descricao: 'Ingrediente valioso utilizado em indústrias alimentícias, conhecido por suas propriedades nutricionais e funcionais.', categoria: 'sacaria', preco: 280.00, unidade: 'sc', foto: '', sku: 'SAC-003', estoque: 300, pesoKg: 25, margemLucro: 22, ativo: true, destaque: false, dataCadastro: '2024-01-01' },
  { id: 4, nome: 'Maltodextrina 25kg', descricao: 'Melhora a textura ou o sabor, preserva alimentos e aumenta sua vida útil.', categoria: 'sacaria', preco: 190.00, unidade: 'sc', foto: '', sku: 'SAC-004', estoque: 250, pesoKg: 25, margemLucro: 20, ativo: true, destaque: false, dataCadastro: '2024-01-01' },
  { id: 5, nome: 'Glucose 25kg', descricao: 'Seu principal uso é no mundo da confeitaria, mas sua aplicação é vasta.', categoria: 'sacaria', preco: 160.00, unidade: 'sc', foto: '', sku: 'SAC-005', estoque: 220, pesoKg: 25, margemLucro: 25, ativo: true, destaque: false, dataCadastro: '2024-01-01' },
  // Linha Okey Lac 25kg
  { id: 6, nome: 'Okey Lac Cream 25kg', descricao: 'Linha Okey Lac desenvolvida para substituição do leite em panificação, foodservice, indústrias de sorvetes e indústrias doces.', categoria: 'okey_lac', preco: 320.00, unidade: 'sc', foto: '', sku: 'OKL-001', estoque: 150, pesoKg: 25, margemLucro: 28, ativo: true, destaque: true, dataCadastro: '2024-01-05' },
  { id: 7, nome: 'Okey Lac Pro 25kg', descricao: 'Composto lácteo para aplicações profissionais em panificação e foodservice.', categoria: 'okey_lac', preco: 310.00, unidade: 'sc', foto: '', sku: 'OKL-002', estoque: 140, pesoKg: 25, margemLucro: 27, ativo: true, destaque: false, dataCadastro: '2024-01-05' },
  { id: 8, nome: 'Okey Lac Gourmet 25kg', descricao: 'Composto lácteo premium para aplicações gourmet e confeitaria.', categoria: 'okey_lac', preco: 340.00, unidade: 'sc', foto: '', sku: 'OKL-003', estoque: 120, pesoKg: 25, margemLucro: 30, ativo: true, destaque: false, dataCadastro: '2024-01-05' },
  { id: 9, nome: 'Okey Lac Açaí 25kg', descricao: 'Composto lácteo especial para preparo de açaí e sorvetes.', categoria: 'okey_lac', preco: 330.00, unidade: 'sc', foto: '', sku: 'OKL-004', estoque: 100, pesoKg: 25, margemLucro: 29, ativo: true, destaque: false, dataCadastro: '2024-01-05' },
  // VAREJO — Okey Lac
  { id: 10, nome: 'Okey Lac Panificação e Culinária 1kg', descricao: 'Ideal para pães, bolos, cremes doces e salgados e massas de pizza.', categoria: 'varejo_lacteo', preco: 18.90, unidade: 'un', foto: '', sku: 'VAR-001', estoque: 500, pesoKg: 1, margemLucro: 32, ativo: true, destaque: true, dataCadastro: '2024-01-10' },
  { id: 11, nome: 'Leite em Pó e Composto Lácteo 1kg', descricao: 'Fonte de cálcio e muito sabor. Feito sob medida para você. Disponível em 1kg, 400g e 200g.', categoria: 'varejo_lacteo', preco: 32.50, unidade: 'un', foto: '', sku: 'VAR-002', estoque: 600, pesoKg: 1, margemLucro: 25, ativo: true, destaque: false, dataCadastro: '2024-01-10' },
  { id: 12, nome: 'Okey Lac 1kg', descricao: 'Produto desenvolvido como excelente acréscimo para açaí.', categoria: 'varejo_lacteo', preco: 16.90, unidade: 'un', foto: '', sku: 'VAR-003', estoque: 400, pesoKg: 1, margemLucro: 30, ativo: true, destaque: false, dataCadastro: '2024-01-10' },
  { id: 13, nome: 'Chocominas 400g', descricao: 'Mistura de Cacau em pó para dissolução em leite.', categoria: 'varejo_lacteo', preco: 12.50, unidade: 'un', foto: '', sku: 'VAR-004', estoque: 800, pesoKg: 0.4, margemLucro: 35, ativo: true, destaque: false, dataCadastro: '2024-01-10' },
  // CAFÉ
  { id: 14, nome: 'Café Belveder 250g', descricao: 'Café Tradicional possui uma fragrância marcante e um aroma intenso, oriundo da torra de grãos selecionados. Disponível em 250g e 500g.', categoria: 'cafe', preco: 14.90, unidade: 'un', foto: '', sku: 'CAF-001', estoque: 350, pesoKg: 0.25, margemLucro: 28, ativo: true, destaque: false, dataCadastro: '2024-01-15' },
  { id: 15, nome: 'Café Molito 250g', descricao: 'Torra moderadamente escura a moderadamente clara — Moagem fina a média. Disponível em 250g e 500g.', categoria: 'cafe', preco: 13.50, unidade: 'un', foto: '', sku: 'CAF-002', estoque: 400, pesoKg: 0.25, margemLucro: 26, ativo: true, destaque: false, dataCadastro: '2024-01-15' },
  { id: 16, nome: 'Café Grão de Minas 250g', descricao: 'Tradicional e Extraforte. Disponível em 250g e 500g.', categoria: 'cafe', preco: 11.90, unidade: 'un', foto: '', sku: 'CAF-003', estoque: 450, pesoKg: 0.25, margemLucro: 24, ativo: true, destaque: false, dataCadastro: '2024-01-15' },
]

export const stageLabels: Record<string, string> = {
  'prospecção': 'Prospecção',
  'amostra': 'Amostra',
  'homologado': 'Homologado',
  'negociacao': 'Negociação',
  'pos_venda': 'Pós-Venda',
  'perdido': 'Perdido'
}

export const transicoesPermitidas: Record<string, string[]> = {
  'prospecção': ['amostra', 'perdido'],
  'amostra': ['homologado', 'perdido'],
  'homologado': ['negociacao', 'perdido'],
  'negociacao': ['pos_venda', 'homologado', 'perdido'],
  'pos_venda': ['negociacao'],
  'perdido': ['prospecção']
}
