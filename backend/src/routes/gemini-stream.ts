/**
 * Gemini Streaming API - Fase 2 Otimização
 * 
 * Implementa streaming de respostas do Gemini para reduzir delay
 */

import { Router, Request, Response } from 'express'
import { log } from '../logger.js'
import { getVendedorByAuthId } from '../database.js'

const router = Router()

// ── Gemini Streaming Implementation ───────────────────────────────────────

interface StreamChunk {
  text?: string
  done?: boolean
  error?: string
}

async function* callGeminiStream(
  apiKey: string,
  contents: any[],
  systemInstruction?: string,
): AsyncGenerator<StreamChunk, void, unknown> {
  const model = 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent`
  
  const body: any = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
  }

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] }
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`Gemini API error ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Stream não disponível')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      
      if (done) {
        if (buffer.trim()) {
          // Processar último chunk
          try {
            const lines = buffer.trim().split('\n')
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6)
                if (data === '[DONE]') continue
                try {
                  const parsed = JSON.parse(data)
                  if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
                    yield { text: parsed.candidates[0].content.parts[0].text }
                  }
                } catch (e) {
                  // Ignorar erros de parse
                }
              }
            }
          } catch (e) {
            // Ignorar erros no buffer final
          }
        }
        yield { done: true }
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Manter última linha incompleta

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue
          
          try {
            const parsed = JSON.parse(data)
            if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
              yield { text: parsed.candidates[0].content.parts[0].text }
            }
          } catch (e) {
            // Ignorar erros de parse
          }
        }
      }
    }
  } catch (error) {
    log.error({ error }, '❌ Erro no Gemini streaming')
    yield { error: String(error) }
  }
}

// ── Endpoints ─────────────────────────────────────────────────────────────────────

router.post('/stream', async (req: Request, res: Response) => {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY não configurada' })
    return
  }

  try {
    const { messages, systemInstruction } = req.body

    if (!messages || !systemInstruction) {
      res.status(400).json({ error: 'messages e systemInstruction são obrigatórios' })
      return
    }

    // Get vendedor for permissions
    const userId = (req as any).userId
    const vendedor = userId ? await getVendedorByAuthId(userId) : null

    if (!vendedor) {
      res.status(401).json({ error: 'Não autorizado' })
      return
    }

    // Build contents for Gemini
    const contents = messages.map((m: any) => {
      const parts: any[] = []
      if (m.content) {
        parts.push({ text: m.content })
      }
      if (m.attachments && m.attachments.length > 0) {
        for (const att of m.attachments) {
          parts.push({ inline_data: { mime_type: att.mimeType, data: att.data } })
        }
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts
      }
    })

    // Set headers for streaming
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    })

    // Stream response
    const stream = callGeminiStream(apiKey, contents, systemInstruction)
    
    try {
      for await (const chunk of stream) {
        if (chunk.error) {
          res.write(`data: ${JSON.stringify({ error: chunk.error })}\n\n`)
          break
        }
        
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`)
        }
        
        if (chunk.done) {
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
          break
        }
      }
    } catch (error) {
      log.error({ error }, '❌ Erro durante streaming')
      res.write(`data: ${JSON.stringify({ error: 'Erro durante streaming' })}\n\n`)
    }

    res.end()
  } catch (error) {
    log.error({ error }, '❌ Erro no endpoint de streaming')
    res.status(500).json({ error: 'Erro interno no servidor' })
  }
})

// Endpoint para streaming com TTS integrado
router.post('/stream-with-tts', async (req: Request, res: Response) => {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY não configurada' })
    return
  }

  try {
    const { messages, systemInstruction } = req.body

    if (!messages || !systemInstruction) {
      res.status(400).json({ error: 'messages e systemInstruction são obrigatórios' })
      return
    }

    // Get vendedor for permissions
    const userId = (req as any).userId
    const vendedor = userId ? await getVendedorByAuthId(userId) : null

    if (!vendedor) {
      res.status(401).json({ error: 'Não autorizado' })
      return
    }

    // Build contents for Gemini
    const contents = messages.map((m: any) => {
      const parts: any[] = []
      if (m.content) {
        parts.push({ text: m.content })
      }
      if (m.attachments && m.attachments.length > 0) {
        for (const att of m.attachments) {
          parts.push({ inline_data: { mime_type: att.mimeType, data: att.data } })
        }
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts
      }
    })

    // Set headers for streaming
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    })

    // Stream response com buffer para TTS
    const stream = callGeminiStream(apiKey, contents, systemInstruction)
    let accumulatedText = ''
    const sentenceBuffer: string[] = []
    
    try {
      for await (const chunk of stream) {
        if (chunk.error) {
          res.write(`data: ${JSON.stringify({ error: chunk.error })}\n\n`)
          break
        }
        
        if (chunk.text) {
          accumulatedText += chunk.text
          sentenceBuffer.push(chunk.text)
          
          // Enviar chunk de texto
          res.write(`data: ${JSON.stringify({ text: chunk.text, accumulated: accumulatedText })}\n\n`)
          
          // Verificar se temos uma frase completa para TTS
          const fullText = sentenceBuffer.join('')
          const sentences = fullText.split(/[.!?]+/)
          
          if (sentences.length > 1) {
            // Temos pelo menos uma frase completa
            const completeSentence = sentences[0] + '.'
            sentenceBuffer.splice(0, sentences[0].length + 1)
            
            // Enviar sinal para TTS
            res.write(`data: ${JSON.stringify({ 
              ttsTrigger: true, 
              sentence: completeSentence.trim(),
              sentenceIndex: Date.now()
            })}\n\n`)
          }
        }
        
        if (chunk.done) {
          // Enviar resto do texto para TTS
          if (sentenceBuffer.length > 0) {
            const remainingText = sentenceBuffer.join('').trim()
            if (remainingText) {
              res.write(`data: ${JSON.stringify({ 
                ttsTrigger: true, 
                sentence: remainingText,
                final: true
              })}\n\n`)
            }
          }
          
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
          break
        }
      }
    } catch (error) {
      log.error({ error }, '❌ Erro durante streaming com TTS')
      res.write(`data: ${JSON.stringify({ error: 'Erro durante streaming' })}\n\n`)
    }

    res.end()
  } catch (error) {
    log.error({ error }, '❌ Erro no endpoint de streaming com TTS')
    res.status(500).json({ error: 'Erro interno no servidor' })
  }
})

export default router
