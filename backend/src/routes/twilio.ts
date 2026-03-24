import { Router, Request, Response } from 'express'
import twilio from 'twilio'
import { loadConfig, saveConfig, invalidateConfigCache } from '../config-store.js'
import { log } from '../logger.js'

const router = Router()

// ── Twilio Config (gerente only) ──

router.get('/config', async (_req: Request, res: Response) => {
  try {
    const cfg = await loadConfig()
    res.json({
      accountSid: cfg.twilioAccountSid || '',
      phoneNumber: cfg.twilioPhoneNumber || '',
      twimlAppSid: cfg.twilioTwimlAppSid || '',
      apiKey: cfg.twilioApiKey || '',
      // Never expose secrets
      hasAuthToken: !!cfg.twilioAuthToken,
      hasApiSecret: !!cfg.twilioApiSecret,
      configured: !!(cfg.twilioAccountSid && cfg.twilioAuthToken && cfg.twilioPhoneNumber),
    })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao carregar config' })
  }
})

router.post('/config', async (req: Request, res: Response) => {
  try {
    const { accountSid, authToken, phoneNumber, twimlAppSid, apiKey, apiSecret } = req.body
    const updates: any = {}
    if (accountSid !== undefined) updates.twilioAccountSid = accountSid
    if (authToken !== undefined) updates.twilioAuthToken = authToken
    if (phoneNumber !== undefined) updates.twilioPhoneNumber = phoneNumber
    if (twimlAppSid !== undefined) updates.twilioTwimlAppSid = twimlAppSid
    if (apiKey !== undefined) updates.twilioApiKey = apiKey
    if (apiSecret !== undefined) updates.twilioApiSecret = apiSecret
    await saveConfig(updates)
    invalidateConfigCache()
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao salvar config' })
  }
})

// ── Generate Access Token for Twilio Client SDK ──

router.post('/token', async (req: Request, res: Response) => {
  try {
    const cfg = await loadConfig()
    if (!cfg.twilioAccountSid || !cfg.twilioApiKey || !cfg.twilioApiSecret) {
      res.status(400).json({ error: 'Twilio não configurado. Configure Account SID, API Key e API Secret.' })
      return
    }
    if (!cfg.twilioTwimlAppSid) {
      res.status(400).json({ error: 'TwiML App SID não configurado.' })
      return
    }

    const vendedorId = (req as any).vendedorId || (req as any).userId
    const identity = `vendedor_${vendedorId}`

    const AccessToken = twilio.jwt.AccessToken
    const VoiceGrant = AccessToken.VoiceGrant

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: cfg.twilioTwimlAppSid,
      incomingAllow: true,
    })

    const token = new AccessToken(
      cfg.twilioAccountSid,
      cfg.twilioApiKey,
      cfg.twilioApiSecret,
      { identity, ttl: 3600 }
    )
    token.addGrant(voiceGrant)

    log.info(`📞 Twilio token generated for identity=${identity}`)
    res.json({ token: token.toJwt(), identity })
  } catch (err: any) {
    log.error({ err }, 'Erro ao gerar token Twilio')
    res.status(500).json({ error: err?.message || 'Erro ao gerar token' })
  }
})

// ── TwiML Voice endpoint (called by Twilio when outbound call connects) ──

router.post('/voice', async (req: Request, res: Response) => {
  try {
    const cfg = await loadConfig()
    const to = req.body.To || req.body.to
    const from = cfg.twilioPhoneNumber

    if (!to) {
      const twiml = new twilio.twiml.VoiceResponse()
      twiml.say({ language: 'pt-BR' }, 'Nenhum número de destino informado.')
      res.type('text/xml').send(twiml.toString())
      return
    }

    // Format Brazilian number
    let formattedTo = String(to).replace(/\D/g, '')
    if (!formattedTo.startsWith('+')) {
      if (!formattedTo.startsWith('55')) formattedTo = `55${formattedTo}`
      formattedTo = `+${formattedTo}`
    }

    log.info(`📞 TwiML voice: dialing ${formattedTo} from ${from}`)

    const twiml = new twilio.twiml.VoiceResponse()
    const dial = twiml.dial({
      callerId: from,
      record: 'record-from-answer-dual',
      recordingStatusCallback: `${getBaseUrl(req)}/api/twilio/recording-callback`,
      recordingStatusCallbackMethod: 'POST',
    })
    dial.number(formattedTo)

    res.type('text/xml').send(twiml.toString())
  } catch (err: any) {
    log.error({ err }, 'Erro no TwiML voice')
    const twiml = new twilio.twiml.VoiceResponse()
    twiml.say({ language: 'pt-BR' }, 'Erro ao processar a chamada.')
    res.type('text/xml').send(twiml.toString())
  }
})

// ── Recording callback (Twilio posts recording URL here) ──

router.post('/recording-callback', async (req: Request, res: Response) => {
  try {
    const { RecordingUrl, RecordingSid, CallSid, RecordingDuration } = req.body
    log.info(`📞 Recording callback: CallSid=${CallSid} RecordingSid=${RecordingSid} duration=${RecordingDuration}s url=${RecordingUrl}`)

    // Store recording info — we'll use this when the call status updates
    if (CallSid && RecordingUrl) {
      callRecordings.set(CallSid, {
        recordingUrl: `${RecordingUrl}.mp3`,
        recordingSid: RecordingSid,
        duration: parseInt(RecordingDuration || '0', 10),
      })
    }

    res.status(204).send()
  } catch (err: any) {
    log.error({ err }, 'Erro no recording callback')
    res.status(500).send()
  }
})

// ── Call status callback ──

router.post('/status-callback', async (req: Request, res: Response) => {
  try {
    const { CallSid, CallStatus, CallDuration, To, From } = req.body
    log.info(`📞 Call status: CallSid=${CallSid} status=${CallStatus} duration=${CallDuration}s to=${To} from=${From}`)
    res.status(204).send()
  } catch (err: any) {
    log.error({ err }, 'Erro no status callback')
    res.status(500).send()
  }
})

// ── Get call recording info ──

router.get('/recording/:callSid', async (req: Request, res: Response) => {
  const { callSid } = req.params
  const recording = callRecordings.get(callSid)
  if (recording) {
    res.json(recording)
  } else {
    // Try fetching from Twilio API
    try {
      const cfg = await loadConfig()
      if (cfg.twilioAccountSid && cfg.twilioAuthToken) {
        const client = twilio(cfg.twilioAccountSid, cfg.twilioAuthToken)
        const recordings = await client.recordings.list({ callSid, limit: 1 })
        if (recordings.length > 0) {
          const rec = recordings[0]
          const info = {
            recordingUrl: `https://api.twilio.com/2010-04-01/Accounts/${cfg.twilioAccountSid}/Recordings/${rec.sid}.mp3`,
            recordingSid: rec.sid,
            duration: parseInt(rec.duration || '0', 10),
          }
          callRecordings.set(callSid, info)
          res.json(info)
          return
        }
      }
    } catch (err) {
      log.warn({ err }, 'Could not fetch recording from Twilio API')
    }
    res.json(null)
  }
})

// ── Auto-setup: create TwiML App + API Key if not exists ──

router.post('/auto-setup', async (req: Request, res: Response) => {
  try {
    const cfg = await loadConfig()
    if (!cfg.twilioAccountSid || !cfg.twilioAuthToken) {
      res.status(400).json({ error: 'Configure Account SID e Auth Token primeiro.' })
      return
    }

    const client = twilio(cfg.twilioAccountSid, cfg.twilioAuthToken)
    const baseUrl = req.body.baseUrl || getBaseUrl(req)
    const updates: any = {}

    // Create TwiML App if not exists
    if (!cfg.twilioTwimlAppSid) {
      log.info('📞 Creating TwiML App...')
      const app = await client.applications.create({
        friendlyName: 'CRM MF Paris Voice',
        voiceUrl: `${baseUrl}/api/twilio/voice`,
        voiceMethod: 'POST',
        statusCallback: `${baseUrl}/api/twilio/status-callback`,
        statusCallbackMethod: 'POST',
      })
      updates.twilioTwimlAppSid = app.sid
      log.info(`📞 TwiML App created: ${app.sid}`)
    }

    // Create API Key if not exists
    if (!cfg.twilioApiKey) {
      log.info('📞 Creating API Key...')
      const key = await client.newKeys.create({ friendlyName: 'CRM MF Paris' })
      updates.twilioApiKey = key.sid
      updates.twilioApiSecret = key.secret
      log.info(`📞 API Key created: ${key.sid}`)
    }

    if (Object.keys(updates).length > 0) {
      await saveConfig(updates)
      invalidateConfigCache()
    }

    const finalCfg = await loadConfig()
    res.json({
      success: true,
      twimlAppSid: finalCfg.twilioTwimlAppSid,
      apiKey: finalCfg.twilioApiKey,
      hasApiSecret: !!finalCfg.twilioApiSecret,
      phoneNumber: finalCfg.twilioPhoneNumber,
    })
  } catch (err: any) {
    log.error({ err }, 'Erro no auto-setup Twilio')
    res.status(500).json({ error: err?.message || 'Erro no auto-setup' })
  }
})

// ── In-memory recording cache ──
const callRecordings = new Map<string, { recordingUrl: string; recordingSid: string; duration: number }>()

function getBaseUrl(req: Request): string {
  // Use X-Forwarded headers in production (behind Railway proxy)
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3001'
  return `${proto}://${host}`
}

export default router
