exports.handler = async (event, context) => {
  // API Key segura via environment variables
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  
  if (!GEMINI_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: 'GEMINI_API_KEY não configurada' })
    }
  }

  try {
    const { messages, systemInstruction } = JSON.parse(event.body)
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: systemInstruction }] },
          { role: 'model', parts: [{ text: 'Entendido, tenho acesso a todos os dados do CRM. Vou responder de forma direta e natural.' }] },
          ...messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          }))
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      })
    })

    const data = await response.json()
    const result = data.candidates[0]?.content?.parts[0]?.text || 'Sem resposta da IA.'

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, response: result })
    }
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
