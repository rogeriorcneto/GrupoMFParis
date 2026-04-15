import type { Request, Response } from 'express'
import { log } from './logger.js'
import { FUNCTION_DECLARATIONS, executeFunction, type AIFunctionResult } from './ai-functions.js'
import { getVendedorByAuthId } from './database.js'
import { sendUserWhatsAppMessage, getUserWhatsAppSession } from './whatsapp-multi.js'
import { sendEmail } from './email.js'

interface Attachment {
  mimeType: string  // e.g. 'image/jpeg', 'audio/webm', 'audio/mp4'
  data: string      // base64-encoded
}

interface GeminiRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string; attachments?: Attachment[] }>
  systemInstruction: string
}

const MAX_FUNCTION_CALLS = 5 // Safety limit to prevent infinite loops

// ── Cache de Contexto (Fase 1 Otimização) ───────────────────────────────────────

interface CachedVendedorData {
  vendedor: any
  clientes: any[]
  timestamp: number
}

const vendedorCache = new Map<number, CachedVendedorData>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

async function getCachedVendedorData(userId: string): Promise<CachedVendedorData> {
  const cached = vendedorCache.get(Number(userId))
  const now = Date.now()
  
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return cached
  }
  
  // Carregar dados do vendedor e clientes relacionados
  const vendedor = await getVendedorByAuthId(userId)
  const { fetchClientesByVendedor } = await import('./database.js')
  const clientes = vendedor ? await fetchClientesByVendedor(vendedor.id) : []
  
  const data = {
    vendedor,
    clientes,
    timestamp: now
  }
  
  vendedorCache.set(Number(userId), data)
  
  // Cleanup automático
  setTimeout(() => {
    vendedorCache.delete(Number(userId))
  }, CACHE_TTL)
  
  return data
}

/**
 * Call Gemini API with optional tools (function calling)
 */
async function callGemini(
  apiKey: string,
  contents: any[],
  tools?: any[],
  systemInstruction?: string,
): Promise<any> {
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash']

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

  if (tools && tools.length > 0) {
    body.tools = tools
    body.tool_config = { function_calling_config: { mode: 'AUTO' } }
  }

  let lastError: Error | null = null
  for (const model of models) {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text()
      log.warn({ error: errorText, model }, `Gemini API error com modelo ${model}, tentando próximo...`)
      lastError = new Error(`Gemini API error ${geminiResponse.status}: ${errorText}`)
      continue
    }

    return geminiResponse.json()
  }

  throw lastError ?? new Error('Todos os modelos Gemini falharam')
}

/**
 * Endpoint seguro para Gemini API com Function Calling
 * POST /api/gemini
 */
export async function geminiHandler(req: Request, res: Response): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    log.error('GEMINI_API_KEY não configurada no backend')
    res.status(500).json({ 
      success: false, 
      error: 'Erro de configuração do servidor. Contate o administrador.' 
    })
    return
  }

  try {
    const { messages, systemInstruction }: GeminiRequest = req.body

    if (!messages || !systemInstruction) {
      res.status(400).json({ 
        success: false, 
        error: 'messages e systemInstruction são obrigatórios' 
      })
      return
    }

    // Get logged-in vendedor for permission checks (Fase 1 otimização)
    const userId = (req as any).userId
    let vendedor = null
    let cachedData = null
    
    if (userId) {
      // Usar cache para dados do vendedor
      try {
        cachedData = await getCachedVendedorData(userId)
        vendedor = cachedData.vendedor
      } catch (e) {
        // Fallback para consulta direta
        vendedor = await getVendedorByAuthId(userId)
      }
    }

    // Build tools array with function declarations
    const tools = vendedor ? [{ functionDeclarations: FUNCTION_DECLARATIONS }] : []

    // Build contents — systemInstruction vai como campo separado, nao no contents
    const contents: any[] = [
      ...messages.map(m => {
        const parts: any[] = []
        // Add any attachments (images/audio) as inline_data
        if (m.attachments && m.attachments.length > 0) {
          for (const att of m.attachments) {
            parts.push({ inline_data: { mime_type: att.mimeType, data: att.data } })
          }
        }
        // Add text part
        if (m.content) {
          parts.push({ text: m.content })
        }
        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts,
        }
      }),
    ]

    // Collect UI actions from function calls to send back to frontend
    const uiActions: AIFunctionResult['uiAction'][] = []
    const executedActions: string[] = []

    // Function calling loop: Gemini may call functions, we execute them and feed results back
    let callCount = 0
    while (callCount < MAX_FUNCTION_CALLS) {
      const geminiData = await callGemini(apiKey, contents, tools, systemInstruction)
      const candidate = geminiData.candidates?.[0]
      if (!candidate?.content?.parts) break

      const parts = candidate.content.parts

      // Check if Gemini wants to call a function
      const functionCallPart = parts.find((p: any) => p.functionCall)
      if (!functionCallPart?.functionCall) {
        // No function call — this is the final text response
        const textResponse = parts.find((p: any) => p.text)?.text || 'Sem resposta da IA.'
        res.json({ 
          success: true, 
          response: textResponse,
          actions: executedActions,
          uiActions: uiActions.filter(Boolean),
        })
        return
      }

      // Execute the function call
      const { name, args } = functionCallPart.functionCall
      log.info({ functionName: name, args, vendedor: vendedor?.nome }, 'IA chamou função')

      let result: AIFunctionResult

      if (!vendedor) {
        result = { success: false, message: 'Usuário não autenticado. Faça login novamente.' }
      } else {
        // Build WhatsApp send function for this vendedor's session
        const sendWhatsAppFn = async (number: string, text: string, clienteId?: number) => {
          const session = getUserWhatsAppSession(vendedor.id)
          if (!session?.sock) return { success: false, error: 'WhatsApp não conectado' }
          try {
            await sendUserWhatsAppMessage(vendedor.id, number, text)
            return { success: true }
          } catch (err: any) {
            return { success: false, error: err?.message || 'Erro ao enviar' }
          }
        }

        // Build email send function
        const sendEmailFn = async (to: string, subject: string, body: string, clienteId?: number, vendedorNome?: string) => {
          try {
            const result = await sendEmail({ to, subject, body, clienteId, vendedorNome })
            return result
          } catch (err: any) {
            return { success: false, error: err?.message || 'Erro ao enviar email' }
          }
        }

        result = await executeFunction({ name, args }, vendedor, sendWhatsAppFn, sendEmailFn)
      }

      // Collect UI actions and log
      if (result.uiAction) uiActions.push(result.uiAction)
      executedActions.push(`${name}: ${result.message}`)
      log.info({ functionName: name, success: result.success, message: result.message }, 'Resultado função IA')

      // Append the function call + result to the conversation so Gemini can continue
      contents.push({
        role: 'model',
        parts: [{ functionCall: { name, args } }],
      })
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name,
            response: {
              success: result.success,
              message: result.message,
              data: result.data || null,
            },
          },
        }],
      })

      callCount++
    }

    // Safety: if we hit the loop limit, ask Gemini for a final text response without tools
    const geminiData = await callGemini(apiKey, contents, undefined, systemInstruction)
    const textResponse = geminiData.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || 'Ações executadas.'
    res.json({ 
      success: true, 
      response: textResponse,
      actions: executedActions,
      uiActions: uiActions.filter(Boolean),
    })

  } catch (error: any) {
    log.error({ error, req }, 'Erro no endpoint Gemini')
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Erro interno ao processar requisição' 
    })
  }
}
