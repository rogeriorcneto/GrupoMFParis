import { omieCall, getOmieCredentials, getOmieEmpresas, OmieCredentials } from './client.js'
import { supabase } from '../supabase.js'
import { log } from '../logger.js'

// ============================================
// Documentos fiscais do pedido (DfeDocs + Contador XML)
// Para um pedido do CRM vinculado ao Omie (omie_codigo):
//   - ObterPedVenda        → PDF do pedido de venda
//   - contador/xml ListarDocumentos (nIdPedido) → nIdNF, chave, XML
//   - ObterNfe (nIdNfe)    → XML da NF-e + link do DANFE simplificado
// Multi-empresa: tenta cada credencial até achar o pedido.
// ============================================

export interface PedidoDocumentos {
  pedidoId: number
  omieCodigo: number
  omieNumero?: string
  pdfPedido: string | null
  nfe: {
    nIdNfe: number
    numero: string
    serie: string
    chave: string
    valor: number | null
    emissao: string | null
    pdfDanfe: string | null
    linkPortal: string | null
    xml: string | null
  } | null
}

async function getCredList(): Promise<OmieCredentials[]> {
  const empresas = await getOmieEmpresas()
  if (empresas.length > 0) return empresas
  const single = await getOmieCredentials()
  return single ? [single] : []
}

export class PedidoDocsError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

/**
 * Garante que o usuário autenticado pode ver os documentos do pedido.
 * Gerente: tudo. Vendedor: apenas pedidos onde é o responsável.
 */
async function assertPermissaoPedido(pedidoId: number, authUserId: string): Promise<void> {
  const { data: vendedor } = await supabase
    .from('vendedores')
    .select('id, cargo')
    .eq('auth_id', authUserId)
    .maybeSingle()
  if (!vendedor) throw new PedidoDocsError('Acesso negado', 403)
  if (vendedor.cargo === 'gerente') return

  const { data: pedido } = await supabase
    .from('pedidos')
    .select('vendedor_id')
    .eq('id', pedidoId)
    .maybeSingle()
  if (!pedido) throw new PedidoDocsError('Pedido não encontrado', 404)
  if (pedido.vendedor_id !== vendedor.id) throw new PedidoDocsError('Acesso negado', 403)
}

export async function obterDocumentosPedido(pedidoId: number, authUserId?: string): Promise<PedidoDocumentos> {
  const { data: pedido, error } = await supabase
    .from('pedidos')
    .select('id, omie_codigo, omie_numero')
    .eq('id', pedidoId)
    .maybeSingle()

  if (error) throw new PedidoDocsError(`pedido: ${error.message}`, 500)
  if (!pedido) throw new PedidoDocsError('Pedido não encontrado', 404)
  if (!pedido.omie_codigo) throw new PedidoDocsError('Pedido não está vinculado ao Omie', 400)

  if (authUserId) await assertPermissaoPedido(pedidoId, authUserId)

  const creds = await getCredList()
  if (creds.length === 0) throw new Error('Credenciais Omie não configuradas')

  const nIdPed = Number(pedido.omie_codigo)

  // 1) Descobre a empresa certa via ObterPedVenda (retorna PDF do pedido)
  let cred: OmieCredentials | null = null
  let pdfPedido: string | null = null
  for (const c of creds) {
    try {
      const r = await omieCall<any>('/produtos/dfedocs/', 'ObterPedVenda', [{ nIdPed }], { credentials: c, skipCache: true })
      if (r?.cPdfPed || r?.cNumPed) { cred = c; pdfPedido = r.cPdfPed || null; break }
    } catch { /* pedido não está nesta empresa */ }
  }
  if (!cred) throw new PedidoDocsError('Pedido não encontrado no Omie', 404)

  // 2) Documentos fiscais do pedido (NF-e modelo 55)
  let nfe: PedidoDocumentos['nfe'] = null
  try {
    const docs = await omieCall<any>('/contador/xml/', 'ListarDocumentos', [{ nIdPedido: nIdPed, cModelo: '55' }], { credentials: cred, skipCache: true })
    const doc = docs?.documentosEncontrados?.[0]
    if (doc?.nIdNF) {
      let pdfDanfe: string | null = null
      let linkPortal: string | null = null
      let xml = doc.cXml || null
      try {
        const n = await omieCall<any>('/produtos/dfedocs/', 'ObterNfe', [{ nIdNfe: doc.nIdNF }], { credentials: cred, skipCache: true })
        pdfDanfe = n?.cPdf || null
        linkPortal = n?.cLinkPortal || null
        xml = n?.cXmlNfe || xml
      } catch (e: any) {
        log.warn({ pedidoId, nIdNfe: doc.nIdNF, err: e?.message }, 'ObterNfe falhou — seguindo sem PDF DANFE')
      }
      nfe = {
        nIdNfe: doc.nIdNF,
        numero: doc.nNumero ? String(doc.nNumero) : '',
        serie: doc.cSerie || '',
        chave: doc.nChave || '',
        valor: doc.nValor ?? null,
        emissao: doc.dEmissao || doc.dEmi || null,
        pdfDanfe,
        linkPortal,
        xml,
      }
    }
  } catch (e: any) {
    log.warn({ pedidoId, err: e?.message }, 'ListarDocumentos falhou — pedido provavelmente sem NF-e ainda')
  }

  return { pedidoId, omieCodigo: nIdPed, omieNumero: pedido.omie_numero || undefined, pdfPedido, nfe }
}

/** A API Omie devolve o XML com entidades HTML escapadas */
function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
}

/** Apenas o XML da NF-e (para download direto) */
export async function obterXmlNfePedido(pedidoId: number, authUserId?: string): Promise<{ xml: string; chave: string }> {
  const docs = await obterDocumentosPedido(pedidoId, authUserId)
  if (!docs.nfe?.xml) throw new PedidoDocsError('Pedido não possui NF-e emitida', 404)
  return { xml: unescapeXml(docs.nfe.xml), chave: docs.nfe.chave || `pedido-${pedidoId}` }
}
