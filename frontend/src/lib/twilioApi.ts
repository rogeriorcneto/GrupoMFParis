import { authFetch } from './botApi'

const BOT_URL = (import.meta as any).env?.VITE_BOT_URL || 'http://localhost:3002'

// ── Config ──

export interface TwilioConfig {
  accountSid: string
  phoneNumber: string
  twimlAppSid: string
  apiKey: string
  hasAuthToken: boolean
  hasApiSecret: boolean
  configured: boolean
}

export async function getTwilioConfig(): Promise<TwilioConfig> {
  const res = await authFetch(`${BOT_URL}/api/twilio/config`)
  return res.json()
}

export async function saveTwilioConfig(data: {
  accountSid?: string
  authToken?: string
  phoneNumber?: string
  twimlAppSid?: string
  apiKey?: string
  apiSecret?: string
}): Promise<{ success: boolean }> {
  const res = await authFetch(`${BOT_URL}/api/twilio/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function twilioAutoSetup(baseUrl?: string): Promise<{
  success: boolean
  twimlAppSid?: string
  apiKey?: string
  hasApiSecret?: boolean
  phoneNumber?: string
  error?: string
}> {
  const res = await authFetch(`${BOT_URL}/api/twilio/auto-setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl }),
  })
  return res.json()
}

// ── Token ──

export async function getTwilioToken(): Promise<{ token: string; identity: string }> {
  const res = await authFetch(`${BOT_URL}/api/twilio/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  return res.json()
}

// ── Recording ──

export async function getCallRecording(callSid: string): Promise<{
  recordingUrl: string
  recordingSid: string
  duration: number
} | null> {
  const res = await authFetch(`${BOT_URL}/api/twilio/recording/${callSid}`)
  return res.json()
}
