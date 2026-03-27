import jsPDF from 'jspdf'
import type { Cliente, Produto } from '../types'

interface PropostaItem {
  produtoId: number
  nomeProduto: string
  sku?: string
  unidade: string
  preco: number
  quantidade: number
}

export function gerarPropostaPDF(
  cliente: Cliente,
  itens: PropostaItem[],
  observacoes: string,
  vendedorNome: string,
  numeroProposta: string
): void {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 20

  // Header - Logo e título
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('PROPOSTA COMERCIAL', pageWidth / 2, y, { align: 'center' })
  
  y += 10
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Grupo MF Paris', pageWidth / 2, y, { align: 'center' })
  
  y += 15
  doc.setDrawColor(30, 58, 138)
  doc.setLineWidth(0.5)
  doc.line(20, y, pageWidth - 20, y)
  
  // Informações da proposta
  y += 10
  doc.setFontSize(9)
  doc.setTextColor(100)
  doc.text(`Proposta Nº: ${numeroProposta}`, 20, y)
  doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, pageWidth - 20, y, { align: 'right' })
  
  // Dados do cliente
  y += 10
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0)
  doc.text('DADOS DO CLIENTE', 20, y)
  
  y += 7
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Cliente: ${cliente.razaoSocial}`, 20, y)
  
  if (cliente.nomeFantasia) {
    y += 5
    doc.text(`Nome Fantasia: ${cliente.nomeFantasia}`, 20, y)
  }
  
  if (cliente.cnpj) {
    y += 5
    doc.text(`CNPJ: ${cliente.cnpj}`, 20, y)
  }
  
  if (cliente.contatoNome) {
    y += 5
    doc.text(`Contato: ${cliente.contatoNome}`, 20, y)
  }
  
  if (cliente.contatoTelefone || cliente.contatoCelular) {
    y += 5
    doc.text(`Telefone: ${cliente.contatoCelular || cliente.contatoTelefone}`, 20, y)
  }
  
  if (cliente.contatoEmail) {
    y += 5
    doc.text(`Email: ${cliente.contatoEmail}`, 20, y)
  }
  
  // Endereço
  if (cliente.enderecoRua) {
    y += 5
    const endereco = `${cliente.enderecoRua}${cliente.enderecoNumero ? ', ' + cliente.enderecoNumero : ''}${cliente.enderecoBairro ? ' - ' + cliente.enderecoBairro : ''}`
    doc.text(`Endereço: ${endereco}`, 20, y)
    
    if (cliente.enderecoCidade && cliente.enderecoEstado) {
      y += 5
      doc.text(`${cliente.enderecoCidade} - ${cliente.enderecoEstado}${cliente.enderecoCep ? ' - CEP: ' + cliente.enderecoCep : ''}`, 20, y)
    }
  }
  
  // Tabela de produtos
  y += 15
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('PRODUTOS E SERVIÇOS', 20, y)
  
  y += 7
  
  // Cabeçalho da tabela
  doc.setFillColor(30, 58, 138)
  doc.rect(20, y - 4, pageWidth - 40, 7, 'F')
  
  doc.setTextColor(255)
  doc.setFontSize(8)
  doc.text('Código', 22, y)
  doc.text('Descrição', 45, y)
  doc.text('Qtd', 120, y)
  doc.text('Unid', 135, y)
  doc.text('Valor Unit.', 150, y)
  doc.text('Total', pageWidth - 22, y, { align: 'right' })
  
  y += 7
  doc.setTextColor(0)
  doc.setFont('helvetica', 'normal')
  
  // Itens
  let subtotal = 0
  for (const item of itens) {
    if (y > 270) {
      doc.addPage()
      y = 20
    }
    
    const total = item.preco * item.quantidade
    subtotal += total
    
    doc.text(item.sku || '-', 22, y)
    
    // Quebra de linha para descrição longa
    const descricao = item.nomeProduto
    if (descricao.length > 35) {
      const lines = doc.splitTextToSize(descricao, 70)
      doc.text(lines[0], 45, y)
      if (lines[1]) {
        y += 4
        doc.text(lines[1], 45, y)
      }
    } else {
      doc.text(descricao, 45, y)
    }
    
    doc.text(item.quantidade.toString(), 120, y)
    doc.text(item.unidade, 135, y)
    doc.text(`R$ ${item.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 150, y)
    doc.text(`R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - 22, y, { align: 'right' })
    
    y += 7
  }
  
  // Linha separadora
  y += 2
  doc.setDrawColor(200)
  doc.line(20, y, pageWidth - 20, y)
  
  // Total
  y += 7
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('VALOR TOTAL DA PROPOSTA:', 120, y)
  doc.setFontSize(12)
  doc.setTextColor(30, 58, 138)
  doc.text(`R$ ${subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - 22, y, { align: 'right' })
  
  // Observações
  if (observacoes.trim()) {
    y += 15
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0)
    doc.text('OBSERVAÇÕES:', 20, y)
    
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const obsLines = doc.splitTextToSize(observacoes, pageWidth - 40)
    doc.text(obsLines, 20, y)
    y += obsLines.length * 5
  }
  
  // Condições gerais
  y += 15
  if (y > 250) {
    doc.addPage()
    y = 20
  }
  
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('CONDIÇÕES GERAIS:', 20, y)
  
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(80)
  
  const condicoes = [
    '• Validade da proposta: 15 dias',
    '• Forma de pagamento: A combinar',
    '• Prazo de entrega: A combinar',
    '• Frete: A combinar',
  ]
  
  for (const cond of condicoes) {
    doc.text(cond, 20, y)
    y += 5
  }
  
  // Footer
  y = doc.internal.pageSize.getHeight() - 20
  doc.setDrawColor(30, 58, 138)
  doc.line(20, y - 5, pageWidth - 20, y - 5)
  
  doc.setFontSize(8)
  doc.setTextColor(100)
  doc.text('Grupo MF Paris - Distribuidora de Alimentos', pageWidth / 2, y, { align: 'center' })
  doc.text(`Vendedor: ${vendedorNome}`, pageWidth / 2, y + 4, { align: 'center' })
  
  // Salvar PDF
  const nomeArquivo = `Proposta_${numeroProposta}_${cliente.razaoSocial.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
  doc.save(nomeArquivo)
}
