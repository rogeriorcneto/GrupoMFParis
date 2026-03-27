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

/**
 * Call Gemini API with optional tools (function calling)
 */
async function callGemini(
  apiKey: string,
  contents: any[],
  tools?: any[],
): Promise<any> {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`

  const body: any = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  }

  if (tools && tools.length > 0) {
    body.tools = tools
    // AUTO lets Gemini decide whether to call a function or respond with text
    body.tool_config = { function_calling_config: { mode: 'AUTO' } }
  }

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

  return geminiResponse.json()
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

    // Get logged-in vendedor for permission checks
    const userId = (req as any).userId
    const vendedor = userId ? await getVendedorByAuthId(userId) : null

    // Build tools array with function declarations
    const tools = vendedor ? [{ functionDeclarations: FUNCTION_DECLARATIONS }] : []

    // Build contents with system instruction
    const contents: any[] = [
      { role: 'user', parts: [{ text: systemInstruction }] },
      { role: 'model', parts: [{ text: 'Entendido, tenho acesso a todos os dados do CRM e posso executar ações. Vou responder de forma direta e natural.' }] },
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
      const geminiData = await callGemini(apiKey, contents, tools)
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
    const geminiData = await callGemini(apiKey, contents)
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
