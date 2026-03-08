import type { Context } from "@netlify/functions"

interface GeminiRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
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

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`

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
