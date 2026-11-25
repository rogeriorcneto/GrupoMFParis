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
  tipoFrete?: 'CIF' | 'FOB' | 'VISITA' | ''
  dataLancamento?: string
}

const LOGO_PATH = '/Logo_MFParis.png'

const EMISSOR = {
  nome: 'DMS COMERCIO E DISTRIBUICAO DE CAFE LTDA',
  cnpj: '33.174.960/0001-27',
  endereco: 'Rua Beta, 347, Vila Paris, Contagem - MG, 32372-090',
  email: 'vendas@mfparis.com.br',
}

let cachedLogoDataUrl: string | null | undefined = undefined

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/i.test(ua)) return true
  // iPadOS 13+ no Safari desktop-mode reporta MacIntel com múltiplos pontos de toque
  if (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1) return true
  return false
}

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

function safePdfText(value: string): string {
  return (value || '')
    .replace(/[✉☎▣•●▪◦]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
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
  if (cachedLogoDataUrl !== undefined) return cachedLogoDataUrl
  try {
    const response = await fetch(LOGO_PATH)
    if (!response.ok) {
      cachedLogoDataUrl = null
      return null
    }
    const blob = await response.blob()
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
    cachedLogoDataUrl = dataUrl
    return dataUrl
  } catch {
    cachedLogoDataUrl = null
    return null
  }
}

// Pré-aquece o logo em background quando o módulo é carregado no navegador
if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
  loadLogoDataUrl().catch(() => {})
}

/**
 * No iPhone / iPad (Safari, Chrome iOS CriOS e PWA), o WebKit bloqueia `<a download>`
 * assíncrono em `blob:` e exige gesto de toque síncrono direto do usuário para
 * `navigator.share({ files })` (WhatsApp / Salvar em Arquivos) ou abertura em nova aba.
 * Este visualizador modal apresenta o PDF pronto com botões de toque síncrono imediato.
 */
function abrirModalPdfIOS(blob: Blob, nomeArquivo: string): void {
  if (typeof document === 'undefined') return
  const existing = document.getElementById('crm-ios-pdf-viewer')
  if (existing) existing.remove()

  const blobUrl = URL.createObjectURL(blob)
  const pdfFile = typeof File !== 'undefined' ? new File([blob], nomeArquivo, { type: 'application/pdf' }) : null
  const canShareFile = Boolean(
    pdfFile &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [pdfFile] }))
  )

  const overlay = document.createElement('div')
  overlay.id = 'crm-ios-pdf-viewer'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-label', 'PDF da Proposta')
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,0.72);display:flex;flex-direction:column;justify-content:flex-end;padding:0;'

  const card = document.createElement('div')
  card.style.cssText = 'background:#ffffff;border-radius:20px 20px 0 0;max-height:92dvh;height:92dvh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 -10px 30px rgba(0,0,0,0.25);'

  const header = document.createElement('div')
  header.style.cssText = 'padding:14px 16px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0;'
  const titleWrap = document.createElement('div')
  titleWrap.style.cssText = 'min-width:0;flex:1;'
  const title = document.createElement('p')
  title.textContent = 'Proposta gerada com sucesso'
  title.style.cssText = 'margin:0;font-size:15px;font-weight:700;color:#111827;'
  const subtitle = document.createElement('p')
  subtitle.textContent = nomeArquivo
  subtitle.style.cssText = 'margin:2px 0 0;font-size:11px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
  titleWrap.appendChild(title)
  titleWrap.appendChild(subtitle)

  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.textContent = 'Fechar'
  closeBtn.style.cssText = 'padding:8px 12px;border-radius:10px;border:1px solid #d1d5db;background:#f9fafb;color:#374151;font-size:13px;font-weight:600;cursor:pointer;'

  const cleanup = () => {
    overlay.remove()
    setTimeout(() => URL.revokeObjectURL(blobUrl), 15000)
  }
  closeBtn.onclick = cleanup
  header.appendChild(titleWrap)
  header.appendChild(closeBtn)

  const actions = document.createElement('div')
  actions.style.cssText = 'padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e5e7eb;display:flex;flex-wrap:wrap;gap:8px;flex-shrink:0;'

  if (canShareFile && pdfFile) {
    const shareBtn = document.createElement('button')
    shareBtn.type = 'button'
    shareBtn.textContent = 'Compartilhar / WhatsApp / Salvar'
    shareBtn.style.cssText = 'flex:1;min-width:200px;padding:12px 14px;border-radius:12px;border:none;background:#16a34a;color:#ffffff;font-size:14px;font-weight:700;cursor:pointer;'
    shareBtn.onclick = () => {
      navigator.share({ files: [pdfFile], title: nomeArquivo }).catch(() => {})
    }
    actions.appendChild(shareBtn)
  }

  const openLink = document.createElement('a')
  openLink.href = blobUrl
  openLink.target = '_blank'
  openLink.rel = 'noopener noreferrer'
  openLink.textContent = 'Abrir PDF em tela cheia'
  openLink.style.cssText = 'flex:1;min-width:170px;padding:12px 14px;border-radius:12px;border:1px solid #4f46e5;background:#eef2ff;color:#4338ca;font-size:14px;font-weight:700;text-align:center;text-decoration:none;display:inline-block;'
  actions.appendChild(openLink)

  const previewWrap = document.createElement('div')
  previewWrap.style.cssText = 'flex:1;background:#e5e7eb;overflow:auto;-webkit-overflow-scrolling:touch;'
  const iframe = document.createElement('iframe')
  iframe.src = blobUrl
  iframe.title = nomeArquivo
  iframe.style.cssText = 'width:100%;height:100%;border:none;background:#ffffff;'
  previewWrap.appendChild(iframe)

  card.appendChild(header)
  card.appendChild(actions)
  card.appendChild(previewWrap)
  overlay.appendChild(card)
  document.body.appendChild(overlay)
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
    try {
      doc.setDrawColor(220, 223, 235)
      doc.setLineWidth(0.25)
      doc.roundedRect(logoX, logoY, logoSize, logoSize, 2, 2, 'S')
      const imgFormat = logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      doc.addImage(logoDataUrl, imgFormat, logoX + 1, logoY + 1, logoSize - 2, logoSize - 2)
    } catch {
      // Se a imagem falhar em algum WebKit específico, gera o PDF normalmente sem quebrar
    }
  }

  const headX = logoX + logoSize + 8
  doc.setTextColor(17, 24, 39)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(numeroProposta.toUpperCase().startsWith('BON-') ? 'BONIFICAÇÃO' : 'PROPOSTA', headX, y + 5)

  doc.setFontSize(12)
  doc.text(EMISSOR.nome, headX, y + 12)

  doc.setFontSize(8.5)
  doc.text(`CNPJ: ${EMISSOR.cnpj}`, headX, y + 18)
  doc.text(EMISSOR.endereco, headX, y + 24)
  doc.text(`${formatDateLong(now)} | Valida até: ${formatDate(validade)}`, headX, y + 30)

  y += 42

  const colGap = 8
  const colWidth = (usableWidth - colGap * 2) / 3
  const col1X = margin
  const col2X = margin + colWidth + colGap
  const col3X = margin + (colWidth + colGap) * 2

  const drawInfoCol = (title: string, lines: string[], x: number, width: number): number => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.3)
    doc.setTextColor(31, 41, 55)
    const titleLines = doc.splitTextToSize(safePdfText(title), Math.max(10, width - 1))
    doc.text(titleLines, x, y)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(75, 85, 99)
    let lineY = y + titleLines.length * 4.2 + 1
    for (const line of lines) {
      if (!line.trim()) continue
      const wrapped = doc.splitTextToSize(safePdfText(line), Math.max(10, width - 1))
      for (const textLine of wrapped) {
        doc.text(textLine, x, lineY)
        lineY += 4.5
      }
    }
    return lineY
  }

  const col1Bottom = drawInfoCol(
    `Proposta enviada por ${vendedorNome}`,
    [`Email: ${EMISSOR.email}`],
    col1X,
    colWidth
  )

  const col2Bottom = drawInfoCol(
    `Para: ${(cliente.contatoNome || cliente.razaoSocial || '').toUpperCase()}`,
    [
      cliente.contatoEmail ? `Email: ${cliente.contatoEmail}` : '',
      cliente.contatoCelular || cliente.contatoTelefone ? `Telefone: ${cliente.contatoCelular || cliente.contatoTelefone}` : '',
    ],
    col2X,
    colWidth
  )

  const col3Bottom = drawInfoCol(
    'Dados da empresa',
    [
      `Empresa: ${(cliente.nomeFantasia || cliente.razaoSocial || '').toUpperCase()}`,
      cliente.cnpj ? `CNPJ: ${cliente.cnpj}` : '',
      getClienteEndereco(cliente) ? `Endereço: ${getClienteEndereco(cliente)}` : '',
    ],
    col3X,
    colWidth
  )

  y = Math.max(col1Bottom, col2Bottom, col3Bottom) + 2
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
  const colUnit = margin + 82
  const colQtd = margin + 111
  const colDesc = margin + 132
  const colTotal = pageWidth - margin - 2
  const itemWidth = colUnit - colItem - 3

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(79, 84, 106)
  doc.text('Item', colItem, y + 5)
  doc.text('Preço unitário', colUnit, y + 5)
  doc.text('Quantidade', colQtd, y + 5)
  doc.text('Desconto', colDesc, y + 5)
  doc.text('Total', colTotal, y + 5, { align: 'right' })

  y += 12
  let subtotal = 0
  const desconto = 0

  for (const item of itens) {
    const itemTotal = Number(item.preco || 0) * Number(item.quantidade || 0)
    subtotal += itemTotal
    const itemLines = doc.splitTextToSize(safePdfText(`${item.sku || item.produtoId}\n${item.nomeProduto}`), itemWidth)
    const rowHeight = Math.max(7, itemLines.length * 4.2 + 2)

    if (y + rowHeight > 255) {
      doc.addPage()
      y = 20
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(31, 41, 55)
    doc.text(itemLines, colItem, y)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(75, 85, 99)
    doc.text(formatCurrency(Number(item.preco || 0)), colUnit, y)
    doc.text(String(item.quantidade), colQtd, y)
    doc.text('R$ 0,00', colDesc, y)
    doc.text(formatCurrency(itemTotal), colTotal, y, { align: 'right' })

    y += rowHeight
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
  const freteLabel = options.tipoFrete === 'VISITA' ? 'Entregue em Visita' : options.tipoFrete || 'A combinar'
  doc.text(`Condição de entrega: ${freteLabel}`, margin, y)
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

  const nomeArquivo = `Proposta_${numeroProposta}_${(cliente.razaoSocial || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`

  if (isIOSDevice()) {
    const blob = doc.output('blob')
    abrirModalPdfIOS(blob, nomeArquivo)
    return
  }

  doc.save(nomeArquivo)
}
