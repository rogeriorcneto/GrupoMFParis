import type { Context } from "@netlify/functions"

interface Attachment {
  mimeType: string
  data: string
}

interface GeminiRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string; attachments?: Attachment[] }>
  systemInstruction: string
}

export default async (req: Request, _context: Context) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  if (req.method !== 'POST') {
    return Response.json({ success: false, error: 'Method not allowed' }, { status: 405 })
  }

  const apiKey = Netlify.env.get('GEMINI_API_KEY')
  if (!apiKey) {
    return Response.json(
      { success: false, error: 'GEMINI_API_KEY não configurada.' },
      { status: 500 }
    )
  }

  try {
    const { messages, systemInstruction }: GeminiRequest = await req.json()

    if (!messages || !systemInstruction) {
      return Response.json(
        { success: false, error: 'messages e systemInstruction são obrigatórios' },
        { status: 400 }
      )
    }

    const contents = [
      { role: 'user', parts: [{ text: systemInstruction }] },
      { role: 'model', parts: [{ text: 'Entendido, tenho acesso a todos os dados do CRM. Vou responder de forma direta e natural.' }] },
      ...messages.map(m => {
        const parts: any[] = []
        if (m.attachments && m.attachments.length > 0) {
          for (const att of m.attachments) {
            parts.push({ inline_data: { mime_type: att.mimeType, data: att.data } })
          }
        }
        if (m.content) {
          parts.push({ text: m.content })
        }
        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts,
        }
      }),
    ]

    const body = {
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text()
      console.error('Gemini API error:', errorText)
      return Response.json(
        { success: false, error: `Gemini API error ${geminiResponse.status}` },
        { status: 502 }
      )
    }

    const geminiData = await geminiResponse.json()
    const response = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta da IA.'

    return Response.json({ success: true, response })

  } catch (error: any) {
    console.error('Gemini function error:', error)
    return Response.json(
      { success: false, error: error.message || 'Erro interno' },
      { status: 500 }
    )
  }
}
