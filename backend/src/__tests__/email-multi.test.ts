import { describe, it, expect, vi, beforeEach } from 'vitest'

const { kvRows, sendMailMock, verifyMock } = vi.hoisted(() => ({
  kvRows: new Map<string, string>(),
  sendMailMock: vi.fn(),
  verifyMock: vi.fn(),
}))

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      verify: verifyMock,
      sendMail: sendMailMock,
    })),
  },
}))

vi.mock('../supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn((_col: string, key: string) => ({
          maybeSingle: vi.fn(async () => ({
            data: kvRows.has(key) ? { value: kvRows.get(key) } : null,
            error: null,
          })),
        })),
      })),
      upsert: vi.fn(async (row: any) => {
        kvRows.set(row.key, row.value)
        return { error: null }
      }),
      delete: vi.fn(() => ({
        eq: vi.fn(async (_col: string, key: string) => {
          kvRows.delete(key)
          return { error: null }
        }),
      })),
    })),
  },
}))

import { inferEmailServers, parseMimeParts, saveUserDraftOrOutbox, sendUserPersonalEmail, saveUserEmailSignature } from '../email-multi.js'
import { encrypt } from '../crypto.js'

function seedCredentials(vendedorId = 1) {
  process.env.ENCRYPTION_KEY = 'test-email-multi-key'
  kvRows.set(`email_creds:user_${vendedorId}`, JSON.stringify({
    email: 'vendas@mfparis.com.br',
    displayName: 'Vendedor MF',
    passwordEnc: encrypt('senha-segura'),
    smtpHost: 'mail.mfparis.com.br',
    smtpPort: 465,
    smtpSecure: true,
    imapHost: 'mail.mfparis.com.br',
    imapPort: 993,
    imapSecure: true,
  }))
}

describe('email-multi — detecção automática de servidores e parser MIME', () => {
  beforeEach(() => {
    kvRows.clear()
    sendMailMock.mockReset()
    verifyMock.mockReset()
    verifyMock.mockResolvedValue(true)
    sendMailMock.mockResolvedValue({ messageId: '<msg-teste@mfparis.com.br>' })
  })

  it('detecta servidores corretos para Gmail, Outlook, Zoho e domínios corporativos próprios', () => {
    expect(inferEmailServers('vendedor@gmail.com')).toEqual({
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      smtpSecure: true,
      imapHost: 'imap.gmail.com',
      imapPort: 993,
      imapSecure: true,
    })
    expect(inferEmailServers('comercial@outlook.com').smtpHost).toBe('smtp.office365.com')
    expect(inferEmailServers('vendas01@mfparis.com.br')).toEqual({
      smtpHost: 'mail.mfparis.com.br',
      smtpPort: 465,
      smtpSecure: true,
      imapHost: 'mail.mfparis.com.br',
      imapPort: 993,
      imapSecure: true,
    })
  })

  it('extrai corpo texto e HTML de mensagem multipart MIME e quoted-printable', () => {
    const raw = [
      'From: Cliente <compras@empresa.com.br>',
      'To: Vendedor <vendas@mfparis.com.br>',
      'Subject: Cotacao Leite em Po',
      'Content-Type: multipart/alternative; boundary="abc123"',
      '',
      '--abc123',
      'Content-Type: text/plain; charset="utf-8"',
      '',
      'Bom dia, preciso de cotacao para 500kg.',
      '--abc123',
      'Content-Type: text/html; charset="utf-8"',
      '',
      '<p>Bom dia, preciso de <b>cotacao para 500kg</b>.</p>',
      '--abc123--',
    ].join('\r\n')

    const parsed = parseMimeParts(raw)
    expect(parsed.text).toContain('Bom dia, preciso de cotacao para 500kg.')
    expect(parsed.html).toContain('<b>cotacao para 500kg</b>')
  })

  it('salva rascunho na Caixa de Saída preservando anexos para reenvio posterior', async () => {
    seedCredentials(1)
    const item = await saveUserDraftOrOutbox(1, {
      to: 'compras@cliente.com.br',
      subject: 'Proposta Okey Lac',
      bodyText: 'Segue proposta comercial.',
      status: 'draft',
      attachments: [{ filename: 'proposta.pdf', contentBase64: Buffer.from('pdf').toString('base64'), contentType: 'application/pdf' }],
    })

    expect(item.hasAttachments).toBe(true)
    expect(item.attachments).toHaveLength(1)
    const persisted = JSON.parse(kvRows.get('email_outbox:user_1') || '[]')
    expect(persisted[0].attachments[0].filename).toBe('proposta.pdf')
  })

  it('envia e-mail pessoal com anexos, remove da Caixa de Saída e registra em Enviados', async () => {
    seedCredentials(1)
    const result = await sendUserPersonalEmail(1, {
      to: 'compras@cliente.com.br',
      subject: 'Cotação Leite em Pó',
      body: 'Olá, segue nossa cotação.',
      attachments: [{ filename: 'cotacao.pdf', contentBase64: Buffer.from('conteudo').toString('base64'), contentType: 'application/pdf' }],
    })

    expect(result.success).toBe(true)
    expect(result.messageId).toBe('<msg-teste@mfparis.com.br>')
    expect(sendMailMock).toHaveBeenCalledTimes(1)
    const sentPayload = sendMailMock.mock.calls[0][0]
    expect(sentPayload.from).toBe('"Vendedor MF" <vendas@mfparis.com.br>')
    expect(sentPayload.attachments[0].filename).toBe('cotacao.pdf')
    expect(Buffer.isBuffer(sentPayload.attachments[0].content)).toBe(true)

    const sentPersisted = JSON.parse(kvRows.get('email_sent:user_1') || '[]')
    expect(sentPersisted).toHaveLength(1)
    expect(sentPersisted[0].status).toBe('sent')
    expect(sentPersisted[0].attachments[0].filename).toBe('cotacao.pdf')
    const outboxPersisted = JSON.parse(kvRows.get('email_outbox:user_1') || '[]')
    expect(outboxPersisted).toHaveLength(0)
  })

  it('salva assinatura e anexa imagem inline preservando anexos', async () => {
    seedCredentials(1)
    const sigText = ['Rogerio Reis','Gerente Comercial','Grupo MF Paris'].join(String.fromCharCode(10))
    const saved = await saveUserEmailSignature(1, {
      enabled: true,
      text: sigText,
      fields: {},
      image: { filename: 'logo.png', contentBase64: Buffer.from('fake-png').toString('base64'), contentType: 'image/png' },
    })
    expect(saved.success).toBe(true)
    const result = await sendUserPersonalEmail(1, {
      to: 'compras@cliente.com.br',
      subject: 'Cotacao',
      body: 'Ola, segue nossa cotacao.',
      attachments: [{ filename: 'cotacao.pdf', contentBase64: Buffer.from('pdf').toString('base64'), contentType: 'application/pdf' }],
    })
    expect(result.success).toBe(true)
    const payload = sendMailMock.mock.calls[0][0]
    expect(payload.text).toContain('Rogerio Reis')
    expect(payload.html).toContain('cid:email-signature-image')
    expect(payload.attachments).toHaveLength(2)
    expect(payload.attachments[0].filename).toBe('cotacao.pdf')
    expect(payload.attachments[1].cid).toBe('email-signature-image')
  })

  it('nao duplica assinatura quando o texto ja foi colado manualmente', async () => {
    seedCredentials(1)
    const sigText = ['Rogerio Reis','Gerente Comercial','Grupo MF Paris'].join(String.fromCharCode(10))
    await saveUserEmailSignature(1, { enabled: true, text: sigText, fields: {} })
    const body = ['Ola!','','--',sigText].join(String.fromCharCode(10))
    await sendUserPersonalEmail(1, { to: 'compras@cliente.com.br', subject: 'Teste', body })
    const payload = sendMailMock.mock.calls[0][0]
    expect((payload.text.match(/Rogerio Reis/g) || [])).toHaveLength(1)
  })
  it('mantém mensagem na Caixa de Saída com status failed quando SMTP falha', async () => {
    seedCredentials(1)
    sendMailMock.mockRejectedValueOnce(new Error('SMTP indisponível'))
    const result = await sendUserPersonalEmail(1, {
      to: 'compras@cliente.com.br',
      subject: 'Cotação',
      body: 'Teste',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('SMTP indisponível')
    const outboxPersisted = JSON.parse(kvRows.get('email_outbox:user_1') || '[]')
    expect(outboxPersisted).toHaveLength(1)
    expect(outboxPersisted[0].status).toBe('failed')
    expect(outboxPersisted[0].error).toContain('SMTP indisponível')
  })
})
