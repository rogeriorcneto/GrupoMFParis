/**
 * Gemini Edge Function - Fase 3 Otimização
 * 
 * Netlify Function para Gemini streaming com cache global
 */

// Cache edge para contextos e respostas
const contextCache = new Map()
const responseCache = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

// Headers para cache edge
const ALLOWED_ORIGIN = process.env.FRONTEND_URL || 'https://mfparis.netlify.app'
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=300, s-maxage=300', // 5 minutos
  'Netlify-Vary': 'query',
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

exports.handler = async (event, context) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      }
    }
  }

  // Auth validation
  const authHeader = event.headers?.authorization || event.headers?.Authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' })
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
    const { messages, systemInstruction, useEdgeCache = true } = JSON.parse(event.body)

    if (!messages || !systemInstruction) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'messages e systemInstruction são obrigatórios' })
      }
    }

    // Gerar chave de cache baseada no contexto
    const contextKey = generateContextKey(messages, systemInstruction)
    
    // Verificar cache edge
    if (useEdgeCache) {
      const cached = responseCache.get(contextKey)
      if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        console.log('🎯 Gemini Edge cache HIT:', contextKey.slice(0, 50))
        
        // Retornar resposta cacheada como streaming
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache', // Streaming não pode ter cache
            'Connection': 'keep-alive',
            'X-Cache': 'EDGE-HIT',
            ...CACHE_HEADERS
          },
          body: formatStreamResponse(cached.response),
          isBase64Encoded: false
        }
      }
    }

    // Processar streaming do Gemini
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'GEMINI_API_KEY não configurada' })
      }
    }

    const streamResponse = await callGeminiStream(apiKey, messages, systemInstruction)
    
    // Salvar no cache edge (apenas se for resposta completa)
    if (useEdgeCache && streamResponse.fullResponse) {
      responseCache.set(contextKey, {
        response: streamResponse.fullResponse,
        timestamp: Date.now()
      })
      
      // Limitar tamanho do cache
      if (responseCache.size > 50) {
        const oldestKey = responseCache.keys().next().value
        responseCache.delete(oldestKey)
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Cache': 'MISS',
        ...CACHE_HEADERS
      },
      body: streamResponse.streamData,
      isBase64Encoded: false
    }
  } catch (error) {
    console.error('❌ Erro no Gemini Edge:', error)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    }
  }
}

// Gerar chave de cache baseada no contexto
function generateContextKey(messages, systemInstruction) {
  const lastMessages = messages.slice(-3) // Últimas 3 mensagens
  const context = lastMessages.map(m => `${m.role}:${m.content}`).join('|')
  const hash = require('crypto').createHash('md5').update(context + systemInstruction).digest('hex')
  return `gemini_${hash}`
}

// Chamar Gemini streaming
async function callGeminiStream(apiKey, messages, systemInstruction) {
  const model = 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent`
  
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))

  const body = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
    systemInstruction: { parts: [{ text: systemInstruction }] }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    throw new Error(`Gemini API error ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullResponse = ''
  const chunks = []

  while (true) {
    const { done, value } = await reader.read()
    
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data === '[DONE]') continue
        
        try {
          const parsed = JSON.parse(data)
          if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
            const text = parsed.candidates[0].content.parts[0].text
            fullResponse += text
            chunks.push(text)
          }
        } catch (e) {
          // Ignorar erros de parse
        }
      }
    }
  }

  return {
    fullResponse,
    streamData: formatStreamResponse(fullResponse)
  }
}

// Formatar resposta como streaming
function formatStreamResponse(fullResponse) {
  const chunks = splitIntoChunks(fullResponse, 10) // Dividir em chunks de 10 caracteres
  let streamData = ''
  
  chunks.forEach((chunk, index) => {
    streamData += `data: ${JSON.stringify({ text: chunk, accumulated: chunks.slice(0, index + 1).join('') })}\n\n`
  })
  
  streamData += `data: ${JSON.stringify({ done: true })}\n\n`
  return streamData
}

// Dividir texto em chunks
function splitIntoChunks(text, chunkSize) {
  const chunks = []
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize))
  }
  return chunks.length > 0 ? chunks : ['']
}

// Endpoint para cache warming
exports.warmup = async () => {
  console.log('🔥 Iniciando warmup do cache Gemini Edge...')
  
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.log('⚠️ GEMINI_API_KEY não configurada, pulando warmup')
    return
  }

  const commonQueries = [
    { messages: [{ role: 'user', content: 'Olá' }], systemInstruction: 'Responda de forma simples e educada' },
    { messages: [{ role: 'user', content: 'Tudo bem?' }], systemInstruction: 'Responda de forma simples e educada' },
    { messages: [{ role: 'user', content: 'Obrigado' }], systemInstruction: 'Responda de forma simples e educada' }
  ]

  for (const query of commonQueries) {
    try {
      const contextKey = generateContextKey(query.messages, query.systemInstruction)
      const response = await callGeminiStream(apiKey, query.messages, query.systemInstruction)
      
      responseCache.set(contextKey, {
        response: response.fullResponse,
        timestamp: Date.now()
      })
      
      console.log(`✅ Gemini cache warmup: ${query.messages[0].content}`)
    } catch (error) {
      console.warn(`⚠️ Gemini warmup falhou:`, error.message)
    }
  }
  
  console.log('🔥 Warmup do cache Gemini Edge concluído')
}
