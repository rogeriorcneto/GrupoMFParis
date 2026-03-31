import jsPDF from 'jspdf'
import type { Cliente } from '../types'

interface PropostaItem {
  produtoId: number
  nomeProduto: string
  sku?: string
  unidade: string
  preco: number
  quantidade: number
}

interface PropostaPdfOptions {
  formaPagamento?: string
  tipoFrete?: 'CIF' | 'FOB' | ''
  prazoEntrega?: string
}

const LOGO_PATH = '/Logo_MFParis.jpg'

function formatCurrency(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR')
}

function formatDateLong(date: Date): string {
  const raw = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

function getClienteEndereco(cliente: Cliente): string {
  const parts = [
    cliente.enderecoRua,
    cliente.enderecoNumero,
    cliente.enderecoBairro,
    cliente.enderecoCidade,
    cliente.enderecoEstado,
    cliente.enderecoCep ? `CEP ${cliente.enderecoCep}` : '',
  ].filter(Boolean)
  return parts.join(', ')
}

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const response = await fetch(LOGO_PATH)
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function gerarPropostaPDF(
  cliente: Cliente,
  itens: PropostaItem[],
  observacoes: string,
  vendedorNome: string,
  numeroProposta: string,
  options: PropostaPdfOptions = {}
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 12
  const usableWidth = pageWidth - margin * 2
  const now = new Date()
  const validade = new Date(now)
  validade.setDate(validade.getDate() + 15)
  let y = 16

  const logoDataUrl = await loadLogoDataUrl()

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(110, 114, 128)
  doc.text(`proposta_${numeroProposta.toLowerCase()}-${formatDate(now).replace(/\//g, '-')}`, pageWidth - margin, y, { align: 'right' })

  y += 8
  const logoX = margin
  const logoY = y
  const logoSize = 24

  if (logoDataUrl) {
    doc.setDrawColor(220, 223, 235)
    doc.setLineWidth(0.25)
    doc.roundedRect(logoX, logoY, logoSize, logoSize, 2, 2, 'S')
    doc.addImage(logoDataUrl, 'JPEG', logoX + 1, logoY + 1, logoSize - 2, logoSize - 2)
  }

  const headX = logoX + logoSize + 8
  doc.setTextColor(17, 24, 39)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('PROPOSTA', headX, y + 5)

  doc.setFontSize(12)
  doc.text((cliente.razaoSocial || '').toUpperCase(), headX, y + 12)

  doc.setFontSize(8.5)
  doc.text(`CNPJ: ${cliente.cnpj || '-'}`, headX, y + 18)
  doc.text(getClienteEndereco(cliente) || 'Endereço não informado', headX, y + 24)
  doc.text(`${formatDateLong(now)} | Valida até: ${formatDate(validade)}`, headX, y + 30)

  y += 42

  const colGap = 8
  const colWidth = (usableWidth - colGap * 2) / 3
  const col1X = margin
  const col2X = margin + colWidth + colGap
  const col3X = margin + (colWidth + colGap) * 2

  const drawInfoCol = (title: string, lines: string[], x: number) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.3)
    doc.setTextColor(31, 41, 55)
    doc.text(title, x, y)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(75, 85, 99)
    let lineY = y + 5
    for (const line of lines) {
      if (!line.trim()) continue
      doc.text(line, x, lineY)
      lineY += 4.5
    }
  }

  drawInfoCol(
    `Proposta enviada por ${vendedorNome}`,
    ['✉ vendas@mfparis.com.br'],
    col1X
  )

  drawInfoCol(
    `Para: ${(cliente.contatoNome || cliente.razaoSocial || '').toUpperCase()}`,
    [
      cliente.contatoEmail ? `✉ ${cliente.contatoEmail}` : '',
      cliente.contatoCelular || cliente.contatoTelefone ? `☎ ${cliente.contatoCelular || cliente.contatoTelefone}` : '',
    ],
    col2X
  )

  drawInfoCol(
    'Dados da empresa',
    [
      `▣ ${(cliente.nomeFantasia || cliente.razaoSocial || '').toUpperCase()}`,
      cliente.cnpj ? `▣ ${cliente.cnpj}` : '',
      getClienteEndereco(cliente) ? `▣ ${getClienteEndereco(cliente)}` : '',
    ],
    col3X
  )

  y += 18
  doc.setDrawColor(217, 220, 232)
  doc.setLineWidth(0.25)
  doc.line(margin, y, pageWidth - margin, y)

  y += 8
  doc.setTextColor(31, 41, 55)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Produtos e serviços', margin, y)

  y += 5
  doc.setFillColor(238, 238, 247)
  doc.roundedRect(margin, y, usableWidth, 8, 0.8, 0.8, 'F')

  const colItem = margin + 2
  const colUnit = margin + 92
  const colQtd = margin + 120
  const colTotal = margin + 138
  const colDesc = margin + 165
  const colTotalDesc = pageWidth - margin - 2

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(79, 84, 106)
  doc.text('Item', colItem, y + 5)
  doc.text('Preço unitário', colUnit, y + 5)
  doc.text('Quantidade', colQtd, y + 5)
  doc.text('Total', colTotal, y + 5)
  doc.text('Desconto', colDesc, y + 5)
  doc.text('Total com desconto', colTotalDesc, y + 5, { align: 'right' })

  y += 12
  let subtotal = 0
  const desconto = 0

  for (const item of itens) {
    const itemTotal = item.preco * item.quantidade
    subtotal += itemTotal

    if (y > 255) {
      doc.addPage()
      y = 20
    }

    const itemNome = `${item.sku || item.produtoId} - ${item.nomeProduto}`
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(31, 41, 55)
    doc.text(doc.splitTextToSize(itemNome, 82), colItem, y)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(75, 85, 99)
    doc.text(formatCurrency(item.preco), colUnit, y)
    doc.text(String(item.quantidade), colQtd, y)
    doc.text(formatCurrency(itemTotal), colTotal, y)
    doc.text('R$ 0,00', colDesc, y)
    doc.text(formatCurrency(itemTotal), colTotalDesc, y, { align: 'right' })

    y += 7
  }

  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(79, 84, 106)
  doc.text(`Valor ${formatCurrency(subtotal)}`, colDesc, y)
  y += 4.5
  doc.text(`Valor do desconto - ${formatCurrency(desconto)}`, colDesc, y)
  y += 4.5
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(31, 41, 55)
  doc.text(`Valor total ${formatCurrency(subtotal - desconto)}`, colDesc, y)

  y += 7
  doc.setDrawColor(217, 220, 232)
  doc.setLineWidth(0.25)
  doc.line(margin, y, pageWidth - margin, y)

  y += 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(31, 41, 55)
  doc.text('Detalhes da proposta', margin, y)

  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.2)
  doc.setTextColor(75, 85, 99)
  doc.text(`PRAZO: ${options.prazoEntrega || '28/35/42 dias'}`, margin, y)
  y += 4.8
  doc.text(`Condição de entrega: ${options.tipoFrete || 'A combinar'}`, margin, y)
  y += 4.8
  doc.text(`Forma de pagamento: ${options.formaPagamento || 'A combinar'}`, margin, y)

  if (observacoes.trim()) {
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(31, 41, 55)
    doc.text('Observações:', margin, y)
    y += 4.5
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(75, 85, 99)
    doc.text(doc.splitTextToSize(observacoes.trim(), usableWidth), margin, y)
  }

  const nomeArquivo = `Proposta_${numeroProposta}_${cliente.razaoSocial.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
  doc.save(nomeArquivo)
}
