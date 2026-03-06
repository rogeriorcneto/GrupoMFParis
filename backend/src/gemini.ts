import type { Request, Response } from 'express'
import { log } from './logger.js'

interface GeminiRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  systemInstruction: string
}

/**
 * Endpoint seguro para Gemini API
 * POST /api/gemini
 */
export async function geminiHandler(req: Request, res: Response): Promise<void> {
  // API Key lida em runtime para garantir que dotenv já carregou
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    log.error('GEMINI_API_KEY não configurada no backend')
    res.status(500).json({ 
      success: false, 
      error: 'Erro de configuração do servidor. Contate o administrador.' 
    })
    return
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`

  try {
    const { messages, systemInstruction }: GeminiRequest = req.body

    if (!messages || !systemInstruction) {
      res.status(400).json({ 
        success: false, 
        error: 'messages e systemInstruction são obrigatórios' 
      })
      return
    }

    // Construir payload para Gemini API
    const contents = [
      { role: 'user', parts: [{ text: systemInstruction }] },
      { role: 'model', parts: [{ text: 'Entendido, tenho acesso a todos os dados do CRM. Vou responder de forma direta e natural.' }] },
      ...messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    ]

    const body = {
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    }

    // Chamar Gemini API com a chave segura
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text()
      log.error({ error: errorText }, 'Erro na Gemini API')
      throw new Error(`Gemini API error ${geminiResponse.status}: ${errorText}`)
    }

    const geminiData = await geminiResponse.json()
    const response = geminiData.candidates[0]?.content?.parts[0]?.text || 'Sem resposta da IA.'

    res.json({ 
      success: true, 
      response 
    })

  } catch (error: any) {
    log.error({ error, req }, 'Erro no endpoint Gemini')
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Erro interno ao processar requisição' 
    })
  }
}
