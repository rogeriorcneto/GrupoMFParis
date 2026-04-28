/**
 * test-voice-live.ts
 * Teste real da cadeia de voz: TTS + Gemini AI
 * Executa contra o Railway (produção) com credenciais reais.
 *
 * Uso: npx tsx src/test-voice-live.ts [email] [senha]
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Carregar .env manualmente (compatibilidade tsx sem dotenv)
try {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env')
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim()
  }
} catch {}

const BOT_URL = 'https://grupomfparis-production.up.railway.app'
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ''
// Aceita email/senha via args da linha de comando
const TEST_EMAIL = process.argv[2] || process.env.TEST_EMAIL || ''
const TEST_PASSWORD = process.argv[3] || process.env.TEST_PASSWORD || ''

const pass = (label: string, info = '') => console.log(`  ✅ ${label}${info ? ` — ${info}` : ''}`)
const fail = (label: string, info = '') => console.error(`  ❌ ${label}${info ? ` — ${info}` : ''}`)
const section = (label: string) => console.log(`\n─── ${label} ───`)

async function getToken(): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TEST_EMAIL || !TEST_PASSWORD) {
    console.warn('  ⚠️  Variáveis SUPABASE_URL / SUPABASE_ANON_KEY / TEST_EMAIL / TEST_PASSWORD não configuradas')
    console.warn('  ⚠️  Testes autenticados serão pulados.')
    return null
  }
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data, error } = await client.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD })
  if (error || !data.session?.access_token) {
    console.error('  ❌ Login falhou:', error?.message)
    return null
  }
  pass('Login Supabase', data.user?.email || '')
  return data.session.access_token
}

// ── 1. Backend health ─────────────────────────────────────────────────────────
async function testHealth() {
  section('1. Backend Health')
  try {
    const res = await fetch(`${BOT_URL}/health`, { signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const body = await res.json().catch(() => ({}))
      pass('GET /health', `status ${res.status} — ${JSON.stringify(body).slice(0, 80)}`)
    } else {
      fail('GET /health', `status ${res.status}`)
    }
  } catch (e: any) {
    fail('GET /health', e.message)
  }
}

// ── 2. TTS /api/tts ───────────────────────────────────────────────────────────
async function testTTS(token: string | null) {
  section('2. TTS — POST /api/tts')
  const text = 'Olá! Estou funcionando perfeitamente.'

  // Sem auth (deve retornar 401)
  try {
    const res = await fetch(`${BOT_URL}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10000),
    })
    if (res.status === 401) {
      pass('POST /api/tts sem auth → 401 (esperado)')
    } else if (res.ok) {
      const ct = res.headers.get('content-type') || ''
      const buf = await res.arrayBuffer()
      pass(`POST /api/tts sem auth → ${res.status} (audio bytes: ${buf.byteLength}, content-type: ${ct})`)
    } else {
      fail('POST /api/tts sem auth', `status ${res.status}`)
    }
  } catch (e: any) {
    fail('POST /api/tts (timeout/network)', e.message)
  }

  if (!token) { console.log('  ⏭️  Pulando teste autenticado (sem token)'); return }

  // Com auth
  try {
    const t0 = Date.now()
    const res = await fetch(`${BOT_URL}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(20000),
    })
    const elapsed = Date.now() - t0
    if (res.ok) {
      const ct = res.headers.get('content-type') || ''
      const buf = await res.arrayBuffer()
      if (buf.byteLength > 1000) {
        pass(`POST /api/tts autenticado`, `${buf.byteLength} bytes, content-type: ${ct}, ${elapsed}ms`)
      } else {
        fail('POST /api/tts autenticado', `bytes muito pequenos: ${buf.byteLength} — provável erro de TTS silencioso`)
      }
    } else {
      const body = await res.text()
      fail('POST /api/tts autenticado', `status ${res.status} — ${body.slice(0, 200)}`)
    }
  } catch (e: any) {
    fail('POST /api/tts autenticado (timeout/network)', e.message)
  }
}

// ── 3. TTS otimizado /api/tts-optimized ──────────────────────────────────────
async function testTTSOptimized(token: string | null) {
  section('3. TTS Otimizado — POST /api/tts-optimized')
  if (!token) { console.log('  ⏭️  Pulando (sem token)'); return }

  try {
    const t0 = Date.now()
    const res = await fetch(`${BOT_URL}/api/tts-optimized`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ text: 'Entendido.', useCache: true }),
      signal: AbortSignal.timeout(15000),
    })
    const elapsed = Date.now() - t0
    if (res.ok) {
      const buf = await res.arrayBuffer()
      const cacheHit = res.headers.get('X-Cache') === 'HIT'
      pass('POST /api/tts-optimized', `${buf.byteLength} bytes, cache: ${cacheHit ? 'HIT' : 'MISS'}, ${elapsed}ms`)
    } else {
      const body = await res.text()
      fail('POST /api/tts-optimized', `status ${res.status} — ${body.slice(0, 200)}`)
    }
  } catch (e: any) {
    fail('POST /api/tts-optimized', e.message)
  }
}

// ── 4. Gemini /api/gemini ─────────────────────────────────────────────────────
async function testGemini(token: string | null) {
  section('4. Gemini AI — POST /api/gemini')

  // Testar sem auth primeiro para ver comportamento
  try {
    const res = await fetch(`${BOT_URL}/api/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'ok' }], systemInstruction: 'Responda: ok' }),
      signal: AbortSignal.timeout(15000),
    })
    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      pass('POST /api/gemini sem auth → ACEITA sem auth!', `"${(data.response || data.message || '').slice(0, 60)}"`)
    } else {
      console.log(`  ℹ️  POST /api/gemini sem auth → ${res.status} (esperado se exige auth)`)
    }
  } catch (e: any) {
    fail('POST /api/gemini sem auth', e.message)
  }

  if (!token) { console.log('  ⏭️  Pulando teste autenticado (sem token)'); return }

  try {
    const t0 = Date.now()
    const res = await fetch(`${BOT_URL}/api/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Responda em 1 palavra: qual é a capital do Brasil?' }],
        systemInstruction: 'Você é um assistente de CRM. Responda muito brevemente.',
      }),
      signal: AbortSignal.timeout(20000),
    })
    const elapsed = Date.now() - t0
    if (res.ok) {
      const data = await res.json()
      const reply = data.response || data.message || JSON.stringify(data)
      pass('POST /api/gemini', `"${reply.slice(0, 80)}" (${elapsed}ms)`)
    } else {
      const body = await res.text()
      fail('POST /api/gemini', `status ${res.status} — ${body.slice(0, 200)}`)
    }
  } catch (e: any) {
    fail('POST /api/gemini (timeout/network)', e.message)
  }
}

// ── 5. Gemini Stream /api/gemini-stream ──────────────────────────────────────
async function testGeminiStream(token: string | null) {
  section('5. Gemini Stream — POST /api/gemini-stream/stream-with-tts')
  if (!token) { console.log('  ⏭️  Pulando (sem token)'); return }

  try {
    const t0 = Date.now()
    const res = await fetch(`${BOT_URL}/api/gemini-stream/stream-with-tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Diga apenas: funcionando.' }],
        systemInstruction: 'Responda em 1 palavra.',
      }),
      signal: AbortSignal.timeout(25000),
    })
    if (res.ok) {
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let chunks = 0
      let text = ''
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value)
          chunks++
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ')) {
              try {
                const d = JSON.parse(line.slice(6))
                if (d.text) text += d.text
              } catch {}
            }
          }
        }
        reader.releaseLock()
      }
      pass('POST /api/gemini-stream/stream-with-tts', `${chunks} chunks, texto: "${text.slice(0, 60)}", ${Date.now() - t0}ms`)
    } else {
      const body = await res.text()
      fail('POST /api/gemini-stream/stream-with-tts', `status ${res.status} — ${body.slice(0, 200)}`)
    }
  } catch (e: any) {
    fail('POST /api/gemini-stream/stream-with-tts', e.message)
  }
}

// ── 6. Netlify Edge /api/gemini-edge ─────────────────────────────────────────
async function testNetlifyEdge(token: string | null) {
  section('6. Netlify Edge — POST /api/gemini-edge')
  if (!token) { console.log('  ⏭️  Pulando (sem token)'); return }

  try {
    const t0 = Date.now()
    const res = await fetch('https://crm-grupomfparis.netlify.app/api/gemini-edge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Diga apenas: ok' }],
        systemInstruction: 'Responda em 1 palavra.',
        useEdgeCache: true,
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      pass('/api/gemini-edge', `status ${res.status}, ${Date.now() - t0}ms — ${JSON.stringify(data).slice(0, 80)}`)
    } else {
      fail('/api/gemini-edge', `status ${res.status} — endpoint pode não existir no Netlify`)
    }
  } catch (e: any) {
    fail('/api/gemini-edge', `${e.message} — endpoint pode não existir`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════')
  console.log('  TESTE DE VOZ — CRM MF Paris')
  console.log(`  BOT_URL: ${BOT_URL}`)
  console.log('═══════════════════════════════════════════')

  const token = await getToken().catch(() => null)

  await testHealth()
  await testTTS(token)
  await testTTSOptimized(token)
  await testGemini(token)
  await testGeminiStream(token)
  await testNetlifyEdge(token)

  console.log('\n═══════════════════════════════════════════')
  console.log('  Teste concluído.')
  console.log('  ✅ = OK   ❌ = Falhou   ⚠️ = Aviso')
  console.log('═══════════════════════════════════════════\n')
}

main().catch(console.error)
