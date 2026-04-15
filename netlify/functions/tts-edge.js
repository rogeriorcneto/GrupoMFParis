/**
 * TTS Edge Function - Fase 3 Otimização
 * 
 * Netlify Function para TTS streaming com cache global
 */

const fetch = require('node-fetch')

// Cache edge para respostas comuns
const edgeCache = new Map()
const EDGE_CACHE_TTL = 10 * 60 * 1000 // 10 minutos

const COMMON_RESPONSES = {
  loading: 'Processando...',
  error: 'Ocorreu um erro. Pode repetir?',
  thinking: 'Deixe me pensar...',
  thanks: 'Obrigado!',
  bye: 'Até logo!',
  welcome: 'Bem-vindo!',
  ok: 'Entendido.',
  oneMoment: 'Um momento, por favor.',
  hi: 'Oi!',
  yes: 'Sim.',
  no: 'Não.',
  please: 'Por favor.',
  sorry: 'Desculpe.',
  hello: 'Olá!',
  goodbye: 'Tchau!'
}

// Headers para cache edge
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=600, s-maxage=600', // 10 minutos cache
  'Netlify-Vary': 'query', // Variar por query params
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

exports.handler = async (event, context) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      }
    }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  try {
    const { text, voiceId, useEdgeCache = true } = JSON.parse(event.body)

    if (!text?.trim()) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Text is required' })
      }
    }

    const cleanText = text.trim().slice(0, 800)
    const cacheKey = cleanText.toLowerCase().replace(/\s+/g, '_')

    // Verificar cache edge primeiro
    if (useEdgeCache) {
      const cached = edgeCache.get(cacheKey)
      if (cached && (Date.now() - cached.timestamp) < EDGE_CACHE_TTL) {
        console.log('🎯 Edge cache HIT:', cacheKey)
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': cached.data.length,
            'X-Cache': 'EDGE-HIT',
            ...CACHE_HEADERS
          },
          body: cached.data.toString('base64'),
          isBase64Encoded: true
        }
      }

      // Verificar se é resposta comum
      const commonKey = Object.keys(COMMON_RESPONSES).find(key => 
        cleanText.toLowerCase().includes(COMMON_RESPONSES[key].toLowerCase())
      )
      
      if (commonKey) {
        const commonText = COMMON_RESPONSES[commonKey]
        const commonCacheKey = `common_${commonKey}`
        const commonCached = edgeCache.get(commonCacheKey)
        
        if (commonCached && (Date.now() - commonCached.timestamp) < EDGE_CACHE_TTL) {
          console.log('🎯 Common response cache HIT:', commonKey)
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'audio/mpeg',
              'Content-Length': commonCached.data.length,
              'X-Cache': 'COMMON-HIT',
              ...CACHE_HEADERS
            },
            body: commonCached.data.toString('base64'),
            isBase64Encoded: true
          }
        }
      }
    }

    // Gerar áudio novo
    const elevenKey = process.env.ELEVENLABS_API_KEY
    if (!elevenKey) {
      // Fallback para Google TTS
      return await generateGoogleTTS(cleanText)
    }

    const VOICE_ID = voiceId || process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'
    
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': elevenKey,
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      })

      if (!response.ok) {
        throw new Error(`ElevenLabs ${response.status}`)
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      
      // Salvar no cache edge
      if (useEdgeCache) {
        edgeCache.set(cacheKey, {
          data: buffer,
          timestamp: Date.now()
        })
        
        // Limitar tamanho do cache
        if (edgeCache.size > 100) {
          const oldestKey = edgeCache.keys().next().value
          edgeCache.delete(oldestKey)
        }
      }

      console.log('🔊 TTS Edge gerado:', cleanText.slice(0, 30))
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': buffer.length,
          'X-Cache': 'MISS',
          ...CACHE_HEADERS
        },
        body: buffer.toString('base64'),
        isBase64Encoded: true
      }
    } catch (elevenError) {
      console.warn('⚠️ ElevenLabs falhou no edge:', elevenError.message)
      return await generateGoogleTTS(cleanText)
    }
  } catch (error) {
    console.error('❌ Erro no TTS Edge:', error)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    }
  }
}

// Fallback para Google TTS
async function generateGoogleTTS(text) {
  try {
    // Chamar backend para Google TTS
    const response = await fetch(`${process.env.BACKEND_URL || 'https://mf-paris-backend.railway.app'}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })

    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer())
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': buffer.length,
          'X-Cache': 'FALLBACK',
          ...CACHE_HEADERS
        },
        body: buffer.toString('base64'),
        isBase64Encoded: true
      }
    }
  } catch (error) {
    console.warn('⚠️ Google TTS fallback falhou:', error)
  }

  // Erro final
  return {
    statusCode: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'TTS service unavailable' })
  }
}

// Warmup cache na inicialização
exports.init = async () => {
  console.log('🔥 Iniciando warmup do cache TTS Edge...')
  
  const elevenKey = process.env.ELEVENLABS_API_KEY
  if (!elevenKey) {
    console.log('⚠️ ELEVENLABS_API_KEY não configurada, pulando warmup')
    return
  }

  const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'
  
  for (const [key, text] of Object.entries(COMMON_RESPONSES)) {
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': elevenKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      })

      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer())
        edgeCache.set(`common_${key}`, {
          data: buffer,
          timestamp: Date.now()
        })
        console.log(`✅ Cache warmup: ${key}`)
      }
    } catch (error) {
      console.warn(`⚠️ Warmup falhou para ${key}:`, error.message)
    }
  }
  
  console.log('🔥 Warmup do cache TTS Edge concluído')
}
