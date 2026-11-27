import nodemailer from 'nodemailer'
import { supabase } from './supabase.js'
import { encrypt, decrypt } from './crypto.js'
import { log } from './logger.js'

export interface UserEmailCredentials {
  email: string
  displayName?: string
  password: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  imapHost: string
  imapPort: number
  imapSecure: boolean
}

export interface EmailAttachmentPayload {
  filename: string
  contentBase64: string
  contentType?: string
  part?: string
  size?: number
  cid?: string
}

export interface UserEmailSignature {
  enabled: boolean
  text: string
  fields: {
    nome?: string
    cargo?: string
    empresa?: string
    telefone?: string
    email?: string
    site?: string
    endereco?: string
  }
  image?: EmailAttachmentPayload
  updatedAt?: string
}

export interface UserMailItem {
  id: string
  uid?: number
  folder: 'inbox' | 'sent' | 'outbox'
  from: string
  fromEmail: string
  to: string
  cc?: string
  subject: string
  date: string
  snippet: string
  bodyText?: string
  bodyHtml?: string
  unread: boolean
  status?: 'queued' | 'sending' | 'failed' | 'draft' | 'sent'
  error?: string
  messageId?: string
  hasAttachments?: boolean
  attachments?: EmailAttachmentPayload[]
}

const UNREAD_CACHE_TTL_MS = 45_000
const unreadCache = new Map<number, { count: number; latestUid: number; ts: number }>()

/** Auto-detecta servidores IMAP/SMTP a partir do domínio do e-mail quando o usuário não preenche manualmente */
export function inferEmailServers(email: string): {
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  imapHost: string
  imapPort: number
  imapSecure: boolean
} {
  const domain = (email.split('@')[1] || '').trim().toLowerCase()
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return { smtpHost: 'smtp.gmail.com', smtpPort: 465, smtpSecure: true, imapHost: 'imap.gmail.com', imapPort: 993, imapSecure: true }
  }
  if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'office365.com'].includes(domain)) {
    return { smtpHost: 'smtp.office365.com', smtpPort: 587, smtpSecure: false, imapHost: 'outlook.office365.com', imapPort: 993, imapSecure: true }
  }
  if (domain.includes('zoho.')) {
    return { smtpHost: 'smtp.zoho.com', smtpPort: 465, smtpSecure: true, imapHost: 'imap.zoho.com', imapPort: 993, imapSecure: true }
  }
  if (domain === 'uol.com.br') {
    return { smtpHost: 'smtps.uol.com.br', smtpPort: 465, smtpSecure: true, imapHost: 'imap.uol.com.br', imapPort: 993, imapSecure: true }
  }
  if (domain === 'terra.com.br') {
    return { smtpHost: 'smtp.terra.com.br', smtpPort: 587, smtpSecure: false, imapHost: 'imap.terra.com.br', imapPort: 993, imapSecure: true }
  }
  if (domain === 'yahoo.com' || domain === 'yahoo.com.br') {
    return { smtpHost: 'smtp.mail.yahoo.com', smtpPort: 465, smtpSecure: true, imapHost: 'imap.mail.yahoo.com', imapPort: 993, imapSecure: true }
  }
  const baseHost = domain ? `mail.${domain}` : ''
  return {
    smtpHost: baseHost,
    smtpPort: 465,
    smtpSecure: true,
    imapHost: baseHost,
    imapPort: 993,
    imapSecure: true,
  }
}

function credsKey(vendedorId: number): string {
  return `email_creds:user_${vendedorId}`
}

function sentStoreKey(vendedorId: number): string {
  return `email_sent:user_${vendedorId}`
}

function outboxStoreKey(vendedorId: number): string {
  return `email_outbox:user_${vendedorId}`
}

function signatureStoreKey(vendedorId: number): string {
  return `email_signature:user_${vendedorId}`
}

export async function getUserEmailCredentials(vendedorId: number): Promise<UserEmailCredentials | null> {
  const { data } = await supabase
    .from('whatsapp_session')
    .select('value')
    .eq('key', credsKey(vendedorId))
    .maybeSingle()
  if (!data?.value) return null
  try {
    const parsed = JSON.parse(data.value)
    if (!parsed?.email || !parsed?.passwordEnc) return null
    const password = decrypt(parsed.passwordEnc)
    if (!password) return null
    return {
      email: parsed.email,
      displayName: parsed.displayName || '',
      password,
      smtpHost: parsed.smtpHost,
      smtpPort: Number(parsed.smtpPort) || 465,
      smtpSecure: parsed.smtpSecure ?? Number(parsed.smtpPort) === 465,
      imapHost: parsed.imapHost,
      imapPort: Number(parsed.imapPort) || 993,
      imapSecure: parsed.imapSecure ?? true,
    }
  } catch {
    return null
  }
}

async function readJsonList<T>(key: string): Promise<T[]> {
  const { data } = await supabase.from('whatsapp_session').select('value').eq('key', key).maybeSingle()
  if (!data?.value) return []
  try {
    const arr = JSON.parse(data.value)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

async function writeJsonList<T>(key: string, list: T[]): Promise<void> {
  await supabase
    .from('whatsapp_session')
    .upsert({ key, value: JSON.stringify(list.slice(0, 150)), updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

function escapeEmailHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildUserSignaturePlain(signature: UserEmailSignature): string {
  const freeText = String(signature.text || '').trim()
  if (freeText) return freeText
  const f = signature.fields || {}
  return [f.nome, f.cargo, f.empresa, f.telefone, f.email, f.site, f.endereco]
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .join('\n')
}

export function buildUserSignatureHtml(signature: UserEmailSignature): string {
  const plain = buildUserSignaturePlain(signature)
  if (!plain) return ''
  const textHtml = escapeEmailHtml(plain).replace(/\n/g, '<br>')
  const imgHtml = signature.image?.contentBase64
    ? `<td style="vertical-align:top;padding-right:14px;"><img src="cid:email-signature-image" alt="" style="display:block;width:92px;max-width:92px;height:auto;border-radius:10px;"></td>`
    : ''
  return `<div style="margin-top:18px;padding-top:14px;border-top:1px solid #d8dee9;"><table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>${imgHtml}<td style="vertical-align:top;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;line-height:1.48;color:#1f2937;">${textHtml}</td></tr></table></div>`
}

export function mergeSignatureIntoBody(body: string, signature: UserEmailSignature | null): {
  text: string
  mainText: string
  quoteText: string
  signatureText: string
} {
  const rawBody = String(body || '')
  if (!signature?.enabled) return { text: rawBody, mainText: rawBody, quoteText: '', signatureText: '' }
  const signatureText = buildUserSignaturePlain(signature)
  if (!signatureText) return { text: rawBody, mainText: rawBody, quoteText: '', signatureText: '' }

  const normalizedBody = rawBody.toLowerCase().replace(/\s+/g, ' ').trim()
  const signatureProbe = signatureText.toLowerCase().replace(/\s+/g, ' ').slice(0, 80).trim()
  if (signatureProbe.length >= 12 && normalizedBody.includes(signatureProbe)) {
    return { text: rawBody, mainText: rawBody, quoteText: '', signatureText: '' }
  }

  const markers = ['\n\n---\nEm ', '\n\n---------- Mensagem encaminhada ----------']
  let splitIndex = -1
  for (const marker of markers) {
    const idx = rawBody.indexOf(marker)
    if (idx >= 0 && (splitIndex < 0 || idx < splitIndex)) splitIndex = idx
  }
  const mainText = (splitIndex >= 0 ? rawBody.slice(0, splitIndex) : rawBody).trimEnd()
  const quoteText = splitIndex >= 0 ? rawBody.slice(splitIndex) : ''
  const text = `${mainText}\n\n--\n${signatureText}${quoteText}`
  return { text, mainText, quoteText, signatureText }
}

export async function getUserEmailSignature(vendedorId: number): Promise<UserEmailSignature | null> {
  const { data } = await supabase
    .from('whatsapp_session')
    .select('value')
    .eq('key', signatureStoreKey(vendedorId))
    .maybeSingle()
  if (!data?.value) return null
  try {
    const parsed = JSON.parse(data.value)
    return {
      enabled: parsed.enabled !== false,
      text: String(parsed.text || ''),
      fields: parsed.fields || {},
      image: parsed.image || undefined,
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return null
  }
}

export async function saveUserEmailSignature(
  vendedorId: number,
  input: Partial<UserEmailSignature>
): Promise<{ success: boolean; signature?: UserEmailSignature; error?: string }> {
  const text = String(input.text || '').trim().slice(0, 3000)
  const image = input.image
  if (image) {
    const type = String(image.contentType || '').toLowerCase()
    if (!type.startsWith('image/')) return { success: false, error: 'A assinatura aceita apenas arquivos de imagem.' }
    const estimatedBytes = Math.floor(String(image.contentBase64 || '').length * 0.75)
    if (!image.contentBase64 || estimatedBytes > 650 * 1024) {
      return { success: false, error: 'A imagem da assinatura deve ter no máximo 650 KB.' }
    }
  }
  const signature: UserEmailSignature = {
    enabled: input.enabled !== false,
    text,
    fields: {
      nome: String(input.fields?.nome || '').trim().slice(0, 120),
      cargo: String(input.fields?.cargo || '').trim().slice(0, 120),
      empresa: String(input.fields?.empresa || '').trim().slice(0, 160),
      telefone: String(input.fields?.telefone || '').trim().slice(0, 60),
      email: String(input.fields?.email || '').trim().slice(0, 160),
      site: String(input.fields?.site || '').trim().slice(0, 160),
      endereco: String(input.fields?.endereco || '').trim().slice(0, 220),
    },
    image: image ? {
      filename: String(image.filename || 'assinatura.png').slice(0, 160),
      contentBase64: image.contentBase64,
      contentType: image.contentType,
    } : undefined,
    updatedAt: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('whatsapp_session')
    .upsert({ key: signatureStoreKey(vendedorId), value: JSON.stringify(signature), updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return { success: false, error: error.message }
  return { success: true, signature }
}

export async function connectAndSaveUserEmail(
  vendedorId: number,
  input: Partial<UserEmailCredentials>
): Promise<{ success: boolean; error?: string }> {
  const email = String(input.email || '').trim().toLowerCase()
  const password = String(input.password || '')
  if (!email || !email.includes('@') || !password) {
    return { success: false, error: 'Informe um e-mail válido e a senha (ou senha de aplicativo).' }
  }

  const inferred = inferEmailServers(email)
  const smtpHost = String(input.smtpHost || inferred.smtpHost).trim()
  const smtpPort = Number(input.smtpPort || inferred.smtpPort) || 465
  const smtpSecure = input.smtpSecure ?? (smtpPort === 465)
  const imapHost = String(input.imapHost || inferred.imapHost).trim()
  const imapPort = Number(input.imapPort || inferred.imapPort) || 993
  const imapSecure = input.imapSecure ?? (imapPort === 993)

  if (!smtpHost || !imapHost) {
    return { success: false, error: 'Informe os servidores SMTP e IMAP do seu provedor de e-mail.' }
  }

  // 1) Validar SMTP
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: email, pass: password },
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 15_000,
    tls: { rejectUnauthorized: false },
  })
  try {
    await transporter.verify()
  } catch (err: any) {
    const msg = String(err?.message || '')
    const ehTimeout = /timeout|ETIMEDOUT|ESOCKET/i.test(msg) || /timeout/i.test(String(err?.code || ''))
    if (ehTimeout) {
      // Item 5 spec CRM 1.0: orientar o usuario, nao so o erro tecnico.
      // Timeout de TCP = a conexao nem chegou no servidor de e-mail. Na maioria dos casos e
      // bloqueio de SMTP de saida na hospedagem do CRM (Railway bloqueia portas 465/587 fora do plano Pro),
      // NAO senha errada — a senha nem chega a ser testada nesse caso.
      return { success: false, error: 'Nao foi possivel nem alcancar o servidor de e-mail (timeout de conexao). Isso NAO e senha errada — a senha nem chega a ser testada. A hospedagem do CRM pode estar bloqueando o envio direto de e-mail. Avise o administrador do sistema para verificar a liberacao de SMTP ou a configuracao alternativa de envio.' }
    }
    const ehAuth = /auth|credencial|password|535|534/i.test(msg) || /EAUTH/i.test(String(err?.code || ''))
    if (ehAuth) {
      return { success: false, error: 'Servidor de e-mail alcancado, mas o login foi recusado. Verifique a senha — se o seu e-mail usa verificacao em duas etapas, crie uma "senha de aplicativo" no painel do seu provedor e use ela aqui no lugar da senha normal.' }
    }
    return { success: false, error: `Falha no servidor de envio (SMTP ${smtpHost}:${smtpPort}): ${msg || 'verifique host e porta com quem administra seu e-mail'}` }
  }

  // 2) Validar IMAP
  try {
    const { ImapFlow } = await import('imapflow')
    const client = new ImapFlow({
      host: imapHost,
      port: imapPort,
      secure: imapSecure,
      auth: { user: email, pass: password },
      logger: false,
      tls: { rejectUnauthorized: false },
    })
    await client.connect()
    await client.mailboxOpen('INBOX')
    await client.logout().catch(() => {})
  } catch (err: any) {
    const msgI = String(err?.message || '')
    if (/timeout|ETIMEDOUT|ESOCKET/i.test(msgI)) {
      return { success: false, error: 'Nao foi possivel alcancar o servidor de entrada de e-mails (timeout). Verifique com quem administra seu e-mail se ha bloqueio de acesso por IP, ou se o IMAP esta habilitado na sua conta.' }
    }
    if (/auth|credencial|password|AUTHENTICATIONFAILED/i.test(msgI)) {
      return { success: false, error: 'Login IMAP recusado. Verifique a senha (ou senha de aplicativo, se houver verificacao em duas etapas).' }
    }
    return { success: false, error: `Falha no servidor de entrada (IMAP ${imapHost}:${imapPort}): ${msgI || 'verifique host/porta ou habilite IMAP'}` }
  }

  const payload = {
    email,
    displayName: String(input.displayName || '').trim(),
    passwordEnc: encrypt(password),
    smtpHost,
    smtpPort,
    smtpSecure,
    imapHost,
    imapPort,
    imapSecure,
  }
  const { error } = await supabase
    .from('whatsapp_session')
    .upsert({ key: credsKey(vendedorId), value: JSON.stringify(payload), updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return { success: false, error: error.message }

  unreadCache.delete(vendedorId)
  return { success: true }
}

export async function disconnectUserEmail(vendedorId: number): Promise<void> {
  unreadCache.delete(vendedorId)
  await supabase.from('whatsapp_session').delete().eq('key', credsKey(vendedorId))
}

export function parseMimeParts(rawSource: string): { text: string; html: string } {
  const normalized = rawSource.replace(/\r\n/g, '\n')
  const decodeQP = (str: string) => {
    try {
      const cleaned = str.replace(/=\n/g, '')
      const bytes: number[] = []
      for (let i = 0; i < cleaned.length; i++) {
        if (cleaned[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(cleaned.slice(i + 1, i + 3))) {
          bytes.push(parseInt(cleaned.slice(i + 1, i + 3), 16))
          i += 2
        } else {
          bytes.push(cleaned.charCodeAt(i))
        }
      }
      return Buffer.from(bytes).toString('utf8')
    } catch {
      return str
    }
  }

  const stripHtml = (h: string) =>
    h
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

  const headerEnd = normalized.indexOf('\n\n')
  if (headerEnd < 0) return { text: '', html: '' }
  const headers = normalized.slice(0, headerEnd)
  const bodyRaw = normalized.slice(headerEnd + 2)

  const boundaryMatch = headers.match(/boundary="?([^"\n;]+)"?/i)
  if (boundaryMatch?.[1]) {
    const boundary = boundaryMatch[1]
    const parts = bodyRaw.split(`--${boundary}`)
    let foundText = ''
    let foundHtml = ''
    for (const part of parts) {
      const pIdx = part.indexOf('\n\n')
      if (pIdx < 0) continue
      const pHead = part.slice(0, pIdx).toLowerCase()
      let pBody = part.slice(pIdx + 2).replace(/--\s*$/, '').trim()
      if (pHead.includes('content-transfer-encoding: base64')) {
        try { pBody = Buffer.from(pBody.replace(/\s+/g, ''), 'base64').toString('utf8') } catch { /* ignore */ }
      } else if (pHead.includes('quoted-printable')) {
        pBody = decodeQP(pBody)
      }
      if (pHead.includes('text/html') && !foundHtml) foundHtml = pBody
      else if (pHead.includes('text/plain') && !foundText) foundText = pBody
    }
    if (!foundText && foundHtml) foundText = stripHtml(foundHtml)
    return { text: foundText.trim(), html: foundHtml.trim() }
  }

  let decoded = bodyRaw
  const headLower = headers.toLowerCase()
  if (headLower.includes('content-transfer-encoding: base64')) {
    try { decoded = Buffer.from(bodyRaw.replace(/\s+/g, ''), 'base64').toString('utf8') } catch { /* ignore */ }
  } else if (headLower.includes('quoted-printable')) {
    decoded = decodeQP(bodyRaw)
  }

  if (headLower.includes('text/html') || /<[a-z][\s\S]*>/i.test(decoded)) {
    return { text: stripHtml(decoded), html: decoded }
  }
  return { text: decoded.trim(), html: '' }
}

function collectImapAttachmentParts(node: any, acc: { part: string; filename: string; contentType?: string; size?: number }[] = []): { part: string; filename: string; contentType?: string; size?: number }[] {
  if (!node || typeof node !== 'object') return acc
  const filename = String(node.dispositionParameters?.filename || node.parameters?.name || '').trim()
  if (filename && node.part && !String(node.type || '').toLowerCase().startsWith('multipart/')) {
    acc.push({ part: String(node.part), filename, contentType: node.type || undefined, size: Number(node.size) || undefined })
  }
  for (const child of node.childNodes || []) collectImapAttachmentParts(child, acc)
  return acc
}

async function openImapClient(creds: UserEmailCredentials) {
  const { ImapFlow } = await import('imapflow')
  const client = new ImapFlow({
    host: creds.imapHost,
    port: creds.imapPort,
    secure: creds.imapSecure,
    auth: { user: creds.email, pass: creds.password },
    logger: false,
    tls: { rejectUnauthorized: false },
  })
  await client.connect()
  return client
}

async function resolveSentMailboxPath(client: any): Promise<string | null> {
  try {
    const boxes = await client.list()
    const sentSpecial = boxes.find((b: any) => b.specialUse === '\\Sent' || String(b.flags || '').includes('\\Sent'))
    if (sentSpecial?.path) return sentSpecial.path
    const byName = boxes.find((b: any) => /^(sent|enviados|itens enviados|inbox\.sent|\[gmail\]\/e-mails enviados|\[gmail\]\/sent mail)$/i.test(String(b.path || b.name || '')))
    return byName?.path || null
  } catch {
    return null
  }
}

export async function getUserEmailStatus(vendedorId: number, forceCheck = false): Promise<{
  connected: boolean
  email?: string
  displayName?: string
  smtpHost?: string
  smtpPort?: number
  imapHost?: string
  imapPort?: number
  unreadCount: number
  outboxCount: number
}> {
  const creds = await getUserEmailCredentials(vendedorId)
  if (!creds) return { connected: false, unreadCount: 0, outboxCount: 0 }

  const outbox = await readJsonList<UserMailItem>(outboxStoreKey(vendedorId))
  const cached = unreadCache.get(vendedorId)
  if (!forceCheck && cached && Date.now() - cached.ts < UNREAD_CACHE_TTL_MS) {
    return {
      connected: true,
      email: creds.email,
      displayName: creds.displayName,
      smtpHost: creds.smtpHost,
      smtpPort: creds.smtpPort,
      imapHost: creds.imapHost,
      imapPort: creds.imapPort,
      unreadCount: cached.count,
      outboxCount: outbox.length,
    }
  }

  let unreadCount = cached?.count ?? 0
  try {
    const client = await openImapClient(creds)
    try {
      const status = await client.status('INBOX', { unseen: true, uidNext: true })
      unreadCount = Number(status?.unseen || 0)
      unreadCache.set(vendedorId, { count: unreadCount, latestUid: Number(status?.uidNext || 0), ts: Date.now() })
    } finally {
      await client.logout().catch(() => {})
    }
  } catch (err) {
    log.warn({ err, vendedorId }, 'Falha rápida ao consultar unseen IMAP')
  }

  return {
    connected: true,
    email: creds.email,
    displayName: creds.displayName,
    smtpHost: creds.smtpHost,
    smtpPort: creds.smtpPort,
    imapHost: creds.imapHost,
    imapPort: creds.imapPort,
    unreadCount,
    outboxCount: outbox.length,
  }
}

function stripAttachmentContentForList(list: UserMailItem[]): UserMailItem[] {
  return list.map(item => item.attachments?.length
    ? { ...item, attachments: item.attachments.map(att => ({ ...att, contentBase64: '' })) }
    : item)
}

export async function listUserFolderEmails(
  vendedorId: number,
  params: { folder: 'inbox' | 'sent' | 'outbox'; search?: string; clienteEmail?: string; limit?: number }
): Promise<{ success: boolean; items: UserMailItem[]; unreadCount?: number; error?: string }> {
  const creds = await getUserEmailCredentials(vendedorId)
  if (!creds) return { success: false, items: [], error: 'Conecte sua conta de e-mail primeiro.' }

  const limit = Math.max(1, Math.min(80, Number(params.limit) || 40))
  const q = String(params.search || '').trim().toLowerCase()
  const filterEmail = String(params.clienteEmail || '').trim().toLowerCase()

  const applyLocalFilter = (list: UserMailItem[]) =>
    list.filter(item => {
      if (filterEmail) {
        const hay = `${item.fromEmail} ${item.from} ${item.to} ${item.cc || ''}`.toLowerCase()
        if (!hay.includes(filterEmail)) return false
      }
      if (q) {
        const hay = `${item.subject} ${item.from} ${item.to} ${item.snippet}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })

  if (params.folder === 'outbox') {
    const outbox = await readJsonList<UserMailItem>(outboxStoreKey(vendedorId))
    return { success: true, items: applyLocalFilter(stripAttachmentContentForList(outbox)).slice(0, limit) }
  }

  if (params.folder === 'sent') {
    const localSent = await readJsonList<UserMailItem>(sentStoreKey(vendedorId))
    const imapSent: UserMailItem[] = []
    try {
      const client = await openImapClient(creds)
      try {
        const sentPath = await resolveSentMailboxPath(client)
        if (sentPath) {
          const mailbox = await client.mailboxOpen(sentPath)
          const total = Number(mailbox?.exists || 0)
          if (total > 0) {
            const startSeq = Math.max(1, total - 60)
            for await (const msg of client.fetch(`${startSeq}:*`, { envelope: true, internalDate: true, flags: true, uid: true })) {
              const fromAddr = msg.envelope?.from?.[0]
              const fromEmail = String(fromAddr?.address || creds.email).toLowerCase()
              const fromLabel = fromAddr?.name ? `${fromAddr.name} <${fromEmail}>` : fromEmail
              const toLabel = (msg.envelope?.to || []).map((t: any) => t.address || t.name || '').filter(Boolean).join(', ')
              imapSent.push({
                id: `imap-sent-${msg.uid}`,
                uid: msg.uid,
                folder: 'sent',
                from: fromLabel,
                fromEmail,
                to: toLabel,
                subject: msg.envelope?.subject || '(Sem assunto)',
                date: (msg.internalDate ? new Date(msg.internalDate) : new Date()).toISOString(),
                snippet: `Para: ${toLabel}`,
                unread: false,
                status: 'sent',
                messageId: msg.envelope?.messageId,
              })
            }
          }
        }
      } finally {
        await client.logout().catch(() => {})
      }
    } catch {
      // Mantém enviados locais caso o servidor não exponha pasta Sent padrão
    }

    const seenKeys = new Set<string>()
    const merged: UserMailItem[] = []
    for (const item of [...localSent, ...imapSent]) {
      const dedupKey = item.messageId || `${item.subject}|${item.to}|${item.date.slice(0, 16)}`
      if (seenKeys.has(dedupKey)) continue
      seenKeys.add(dedupKey)
      merged.push(item)
    }
    merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return { success: true, items: applyLocalFilter(stripAttachmentContentForList(merged)).slice(0, limit) }
  }

  // folder === 'inbox'
  try {
    const client = await openImapClient(creds)
    try {
      const mailbox = await client.mailboxOpen('INBOX')
      const total = Number(mailbox?.exists || 0)
      if (total === 0) {
        unreadCache.set(vendedorId, { count: 0, latestUid: 0, ts: Date.now() })
        return { success: true, items: [], unreadCount: 0 }
      }
      const windowSize = filterEmail || q ? 120 : 60
      const startSeq = Math.max(1, total - windowSize + 1)
      const items: UserMailItem[] = []

      for await (const msg of client.fetch(`${startSeq}:*`, { envelope: true, internalDate: true, flags: true, uid: true })) {
        const fromObj = msg.envelope?.from?.[0]
        const fromEmail = String(fromObj?.address || '').toLowerCase()
        const fromLabel = fromObj?.name ? `${fromObj.name} <${fromEmail}>` : (fromEmail || '-')
        const toLabel = (msg.envelope?.to || []).map((t: any) => t.address || '').filter(Boolean).join(', ')
        const ccLabel = (msg.envelope?.cc || []).map((t: any) => t.address || '').filter(Boolean).join(', ')
        const flags: Set<string> = msg.flags || new Set()
        const unread = !flags.has('\\Seen')

        items.push({
          id: `inbox-${msg.uid}`,
          uid: msg.uid,
          folder: 'inbox',
          from: fromLabel,
          fromEmail,
          to: toLabel,
          cc: ccLabel || undefined,
          subject: msg.envelope?.subject || '(Sem assunto)',
          date: (msg.internalDate ? new Date(msg.internalDate) : new Date()).toISOString(),
          snippet: fromObj?.name ? `${fromObj.name} — ${msg.envelope?.subject || ''}` : (msg.envelope?.subject || ''),
          unread,
          messageId: msg.envelope?.messageId,
        })
      }

      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      const status = await client.status('INBOX', { unseen: true, uidNext: true }).catch(() => null)
      const unreadCount = status?.unseen != null ? Number(status.unseen) : items.filter(i => i.unread).length
      unreadCache.set(vendedorId, { count: unreadCount, latestUid: Number(status?.uidNext || 0), ts: Date.now() })
      return { success: true, items: applyLocalFilter(items).slice(0, limit), unreadCount }
    } finally {
      await client.logout().catch(() => {})
    }
  } catch (err: any) {
    return { success: false, items: [], error: err?.message || 'Erro ao ler caixa de entrada IMAP.' }
  }
}

export async function readUserEmailDetail(
  vendedorId: number,
  params: { id: string; uid?: number; folder: 'inbox' | 'sent' | 'outbox' }
): Promise<{ success: boolean; item?: UserMailItem; error?: string }> {
  if (params.folder === 'outbox') {
    const outbox = await readJsonList<UserMailItem>(outboxStoreKey(vendedorId))
    const found = outbox.find(i => i.id === params.id)
    return found ? { success: true, item: found } : { success: false, error: 'Item não encontrado na Caixa de Saída.' }
  }
  if (params.folder === 'sent' && !params.uid) {
    const sent = await readJsonList<UserMailItem>(sentStoreKey(vendedorId))
    const found = sent.find(i => i.id === params.id)
    return found ? { success: true, item: found } : { success: false, error: 'E-mail enviado não encontrado.' }
  }

  const creds = await getUserEmailCredentials(vendedorId)
  if (!creds) return { success: false, error: 'Conta de e-mail não conectada.' }
  const uid = Number(params.uid || String(params.id).replace(/^(inbox|imap-sent)-/, ''))
  if (!Number.isFinite(uid) || uid <= 0) return { success: false, error: 'UID de mensagem inválido.' }

  try {
    const client = await openImapClient(creds)
    try {
      const boxPath = params.folder === 'sent' ? (await resolveSentMailboxPath(client)) || 'INBOX' : 'INBOX'
      await client.mailboxOpen(boxPath)
      const msg = await client.fetchOne(String(uid), { envelope: true, internalDate: true, flags: true, source: true, uid: true, bodyStructure: true }, { uid: true })
      if (!msg) return { success: false, error: 'Mensagem não encontrada no servidor.' }

      if (params.folder === 'inbox' && !(msg.flags || new Set()).has('\\Seen')) {
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {})
        const c = unreadCache.get(vendedorId)
        if (c && c.count > 0) unreadCache.set(vendedorId, { ...c, count: c.count - 1 })
      }

      const raw = Buffer.isBuffer(msg.source) ? msg.source.toString('utf8') : String(msg.source || '')
      const { text, html } = parseMimeParts(raw)
      const attachmentParts = collectImapAttachmentParts(msg.bodyStructure)
      let attachments: EmailAttachmentPayload[] = []
      const downloadable = attachmentParts.filter(p => (p.size || 0) <= 8 * 1024 * 1024).slice(0, 8)
      if (downloadable.length > 0) {
        try {
          const downloaded = await client.downloadMany(String(uid), downloadable.map(p => p.part), { uid: true })
          attachments = attachmentParts.slice(0, 8).map(part => ({
            filename: part.filename,
            contentType: part.contentType,
            size: part.size,
            part: part.part,
            contentBase64: downloaded[part.part]?.content ? downloaded[part.part]!.content!.toString('base64') : '',
          }))
        } catch {
          attachments = attachmentParts.slice(0, 8).map(part => ({ filename: part.filename, contentType: part.contentType, size: part.size, part: part.part, contentBase64: '' }))
        }
      } else if (attachmentParts.length > 0) {
        attachments = attachmentParts.slice(0, 8).map(part => ({ filename: part.filename, contentType: part.contentType, size: part.size, part: part.part, contentBase64: '' }))
      }
      const fromObj = msg.envelope?.from?.[0]
      const fromEmail = String(fromObj?.address || '').toLowerCase()
      const fromLabel = fromObj?.name ? `${fromObj.name} <${fromEmail}>` : (fromEmail || '-')
      const toLabel = (msg.envelope?.to || []).map((t: any) => t.address || '').filter(Boolean).join(', ')
      const ccLabel = (msg.envelope?.cc || []).map((t: any) => t.address || '').filter(Boolean).join(', ')

      return {
        success: true,
        item: {
          id: `${params.folder === 'sent' ? 'imap-sent' : 'inbox'}-${uid}`,
          uid,
          folder: params.folder,
          from: fromLabel,
          fromEmail,
          to: toLabel,
          cc: ccLabel || undefined,
          subject: msg.envelope?.subject || '(Sem assunto)',
          date: (msg.internalDate ? new Date(msg.internalDate) : new Date()).toISOString(),
          snippet: text.slice(0, 200),
          bodyText: text,
          bodyHtml: html,
          unread: false,
          messageId: msg.envelope?.messageId,
          hasAttachments: attachments.length > 0,
          attachments,
        },
      }
    } finally {
      await client.logout().catch(() => {})
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao abrir conteúdo do e-mail.' }
  }
}

export async function saveUserDraftOrOutbox(
  vendedorId: number,
  draft: { id?: string; to: string; cc?: string; subject: string; bodyText: string; status?: 'draft' | 'queued' | 'sending' | 'failed'; error?: string; attachments?: EmailAttachmentPayload[] }
): Promise<UserMailItem> {
  const creds = await getUserEmailCredentials(vendedorId)
  const outbox = await readJsonList<UserMailItem>(outboxStoreKey(vendedorId))
  const id = draft.id || `out-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const item: UserMailItem = {
    id,
    folder: 'outbox',
    from: creds?.email || '',
    fromEmail: creds?.email || '',
    to: draft.to,
    cc: draft.cc,
    subject: draft.subject || '(Sem assunto)',
    date: new Date().toISOString(),
    snippet: draft.bodyText.slice(0, 180),
    bodyText: draft.bodyText,
    unread: false,
    status: draft.status || 'draft',
    error: draft.error,
    hasAttachments: !!(draft.attachments && draft.attachments.length > 0),
    attachments: draft.attachments || [],
  }
  const next = [item, ...outbox.filter(x => x.id !== id)]
  await writeJsonList(outboxStoreKey(vendedorId), next)
  return item
}

export async function deleteUserOutboxItem(vendedorId: number, id: string): Promise<void> {
  const outbox = await readJsonList<UserMailItem>(outboxStoreKey(vendedorId))
  await writeJsonList(outboxStoreKey(vendedorId), outbox.filter(x => x.id !== id))
}

export async function sendUserPersonalEmail(
  vendedorId: number,
  params: {
    outboxId?: string
    to: string
    cc?: string
    subject: string
    body: string
    inReplyTo?: string
    clienteId?: number
    attachments?: EmailAttachmentPayload[]
  }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const creds = await getUserEmailCredentials(vendedorId)
  if (!creds) return { success: false, error: 'Conecte sua conta de e-mail primeiro.' }
  const to = String(params.to || '').trim()
  const subject = String(params.subject || '').trim()
  if (!to || !subject) return { success: false, error: 'Preencha destinatário (Para) e Assunto.' }

  // Coloca na Caixa de Saída durante o envio (se falhar, permanece lá para reenviar com 1 clique!)
  const queuedItem = await saveUserDraftOrOutbox(vendedorId, {
    id: params.outboxId,
    to,
    cc: params.cc,
    subject,
    bodyText: params.body,
    status: 'sending',
    attachments: params.attachments || [],
  })

  const transporter = nodemailer.createTransport({
    host: creds.smtpHost,
    port: creds.smtpPort,
    secure: creds.smtpSecure,
    auth: { user: creds.email, pass: creds.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 25_000,
    tls: { rejectUnauthorized: false },
  })

  const signature = await getUserEmailSignature(vendedorId)
  const mergedBody = mergeSignatureIntoBody(params.body, signature)
  const signatureHtml = signature?.enabled ? buildUserSignatureHtml(signature) : ''
  const bodyLooksHtml = /<[a-z][\s\S]*>/i.test(params.body)
  const htmlBody = bodyLooksHtml
    ? `${params.body}${signatureHtml}`
    : `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.55;color:#111827;white-space:pre-wrap;">${escapeEmailHtml(mergedBody.mainText)}${signatureHtml}${escapeEmailHtml(mergedBody.quoteText)}</div>`

  try {
    const fromHeader = creds.displayName
      ? `"${creds.displayName.replace(/"/g, '')}" <${creds.email}>`
      : creds.email

    const info = await transporter.sendMail({
      from: fromHeader,
      to,
      cc: params.cc?.trim() || undefined,
      subject,
      text: mergedBody.text,
      html: htmlBody,
      inReplyTo: params.inReplyTo || undefined,
      references: params.inReplyTo ? [params.inReplyTo] : undefined,
      attachments: [
        ...(params.attachments || []).map(a => ({
          filename: a.filename,
          content: Buffer.from(a.contentBase64, 'base64'),
          contentType: a.contentType || undefined,
        })),
        ...(signature?.enabled && signature.image?.contentBase64 ? [{
          filename: signature.image.filename || 'assinatura.png',
          content: Buffer.from(signature.image.contentBase64, 'base64'),
          contentType: signature.image.contentType || 'image/png',
          cid: 'email-signature-image',
        }] : []),
      ],
    })

    // Remove da Caixa de Saída e grava em Enviados
    await deleteUserOutboxItem(vendedorId, queuedItem.id)
    const sentList = await readJsonList<UserMailItem>(sentStoreKey(vendedorId))
    const sentRecord: UserMailItem = {
      id: `sent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      folder: 'sent',
      from: fromHeader,
      fromEmail: creds.email,
      to,
      cc: params.cc?.trim() || undefined,
      subject,
      date: new Date().toISOString(),
      snippet: mergedBody.text.slice(0, 200),
      bodyText: mergedBody.text,
      bodyHtml: htmlBody,
      unread: false,
      status: 'sent',
      messageId: info.messageId,
      hasAttachments: !!(params.attachments && params.attachments.length > 0),
      attachments: params.attachments || [],
    }
    await writeJsonList(sentStoreKey(vendedorId), [sentRecord, ...sentList])

    if (params.clienteId) {
      try {
        const db = await import('./database.js')
        await db.updateCliente(params.clienteId, { ultimaInteracao: new Date().toISOString().split('T')[0] })
      } catch { /* non-critical */ }
    }

    return { success: true, messageId: info.messageId }
  } catch (err: any) {
    const errMsg = err?.message || 'Erro ao enviar e-mail'
    await saveUserDraftOrOutbox(vendedorId, {
      id: queuedItem.id,
      to,
      cc: params.cc,
      subject,
      bodyText: params.body,
      status: 'failed',
      error: errMsg,
      attachments: params.attachments || [],
    })
    return { success: false, error: errMsg }
  }
}
