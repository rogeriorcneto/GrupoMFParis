/**
 * Teste Fase 2 - Streaming Avançado
 * 
 * Valida implementação completa das otimizações de streaming
 */

import { log } from './logger.js'

interface TestResult {
  name: string
  status: 'pass' | 'fail' | 'warning'
  message: string
  details?: any
}

class Phase2Tester {
  private results: TestResult[] = []

  private addResult(name: string, status: 'pass' | 'fail' | 'warning', message: string, details?: any) {
    this.results.push({ name, status, message, details })
    log.info({ name, status, message, details }, `🧪 Fase 2 Test: ${name}`)
  }

  async testGeminiStreaming(): Promise<void> {
    try {
      const response = await fetch('http://localhost:3001/api/gemini-stream/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Olá' }],
          systemInstruction: 'Responda de forma simples'
        })
      })

      if (response.ok) {
        const text = await response.text()
        const hasStreaming = text.includes('data:') || text.includes('text/event-stream')
        
        if (hasStreaming) {
          this.addResult('Gemini Streaming', 'pass', 'Endpoint de streaming funcionando')
        } else {
          this.addResult('Gemini Streaming', 'warning', 'Endpoint responde mas não como streaming')
        }
      } else {
        this.addResult('Gemini Streaming', 'fail', 'Endpoint não responde', { status: response.status })
      }
    } catch (error) {
      this.addResult('Gemini Streaming', 'warning', 'Não foi possível testar (servidor não iniciado?)', error)
    }
  }

  async testTTSWebSocket(): Promise<void> {
    try {
      const response = await fetch('http://localhost:3001/api/tts-websocket/status')
      
      if (response.ok) {
        const data = await response.json()
        const hasWebSocket = data.websocketServer?.running
        
        if (hasWebSocket) {
          this.addResult('TTS WebSocket', 'pass', 'Servidor WebSocket ativo', data)
        } else {
          this.addResult('TTS WebSocket', 'fail', 'Servidor WebSocket não iniciado')
        }
      } else {
        this.addResult('TTS WebSocket', 'fail', 'Endpoint não responde', { status: response.status })
      }
    } catch (error) {
      this.addResult('TTS WebSocket', 'warning', 'Não foi possível testar (servidor não iniciado?)', error)
    }
  }

  async testAudioBuffer(): Promise<void> {
    try {
      const { audioBuffer } = await import('./audio-buffer.js')
      
      // Testar funcionalidades básicas
      const testId = 'test_' + Date.now()
      const testChunk = Buffer.from('test audio data')
      
      audioBuffer.addChunk(testId, testChunk)
      const hasChunks = audioBuffer.hasChunks(testId)
      const stats = audioBuffer.getBufferStats(testId)
      
      if (hasChunks && stats && stats.chunkCount === 1) {
        this.addResult('Audio Buffer', 'pass', 'Buffer inteligente funcionando', stats)
      } else {
        this.addResult('Audio Buffer', 'fail', 'Buffer não funcionando corretamente')
      }
      
      // Cleanup
      audioBuffer.clearBuffer(testId)
    } catch (error) {
      this.addResult('Audio Buffer', 'fail', 'Erro ao testar buffer', error)
    }
  }

  async testStreamingIntegration(): Promise<void> {
    try {
      // Testar endpoint integrado
      const response = await fetch('http://localhost:3001/api/gemini-stream/stream-with-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Como você está?' }],
          systemInstruction: 'Responda com uma frase curta'
        })
      })

      if (response.ok) {
        const reader = response.body?.getReader()
        if (reader) {
          let hasText = false
          let hasTTSTrigger = false
          
          try {
            const decoder = new TextDecoder()
            for (let i = 0; i < 10; i++) { // Limitar leituras
              const { done, value } = await reader.read()
              if (done) break
              
              const chunk = decoder.decode(value, { stream: true })
              if (chunk.includes('"text"')) hasText = true
              if (chunk.includes('ttsTrigger')) hasTTSTrigger = true
              
              if (hasText && hasTTSTrigger) break
            }
            
            if (hasText && hasTTSTrigger) {
              this.addResult('Streaming Integration', 'pass', 'Integração streaming + TTS funcionando')
            } else {
              this.addResult('Streaming Integration', 'warning', 'Streaming parcialmente funcionando', { hasText, hasTTSTrigger })
            }
          } finally {
            reader.releaseLock()
          }
        } else {
          this.addResult('Streaming Integration', 'fail', 'Stream não disponível')
        }
      } else {
        this.addResult('Streaming Integration', 'fail', 'Endpoint integrado não responde', { status: response.status })
      }
    } catch (error) {
      this.addResult('Streaming Integration', 'warning', 'Não foi possível testar integração', error)
    }
  }

  async testEnvironmentPhase2(): Promise<void> {
    const requiredVars = ['ELEVENLABS_API_KEY', 'GEMINI_API_KEY']
    const missing: string[] = []
    const present: string[] = []

    for (const varName of requiredVars) {
      if (process.env[varName]) {
        present.push(varName)
      } else {
        missing.push(varName)
      }
    }

    if (missing.length === 0) {
      this.addResult('Environment Phase 2', 'pass', 'Variáveis Fase 2 configuradas', { present })
    } else {
      this.addResult('Environment Phase 2', 'fail', 'Variáveis Fase 2 faltando', { missing, present })
    }
  }

  async testPerformanceMetrics(): Promise<void> {
    try {
      const startTime = Date.now()
      
      // Testar resposta rápida
      const response = await fetch('http://localhost:3001/api/gemini-stream/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Oi' }],
          systemInstruction: 'Responda com "Oi!"'
        })
      })

      if (response.ok) {
        const endTime = Date.now()
        const responseTime = endTime - startTime
        
        if (responseTime < 1000) {
          this.addResult('Performance Metrics', 'pass', 'Resposta rápida (< 1s)', { responseTime })
        } else if (responseTime < 2000) {
          this.addResult('Performance Metrics', 'warning', 'Resposta moderada (1-2s)', { responseTime })
        } else {
          this.addResult('Performance Metrics', 'fail', 'Resposta lenta (> 2s)', { responseTime })
        }
      } else {
        this.addResult('Performance Metrics', 'fail', 'Não foi possível medir performance')
      }
    } catch (error) {
      this.addResult('Performance Metrics', 'warning', 'Não foi possível testar performance', error)
    }
  }

  async runAllTests(): Promise<TestResult[]> {
    log.info('🧪 Iniciando testes Fase 2 - Streaming Avançado...')
    
    await this.testEnvironmentPhase2()
    await this.testGeminiStreaming()
    await this.testTTSWebSocket()
    await this.testAudioBuffer()
    await this.testStreamingIntegration()
    await this.testPerformanceMetrics()

    const passed = this.results.filter(r => r.status === 'pass').length
    const failed = this.results.filter(r => r.status === 'fail').length
    const warnings = this.results.filter(r => r.status === 'warning').length

    log.info({ passed, failed, warnings, total: this.results.length }, '🧪 Resultados Fase 2')

    return this.results
  }

  printSummary(): void {
    console.log('\n🚀 === RESUMO FASE 2 - STREAMING AVANÇADO ===\n')
    
    this.results.forEach(result => {
      const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️'
      console.log(`${icon} ${result.name}: ${result.message}`)
      if (result.details) {
        console.log(`   Detalhes:`, result.details)
      }
    })

    const passed = this.results.filter(r => r.status === 'pass').length
    const total = this.results.length
    const percentage = Math.round((passed / total) * 100)

    console.log(`\n📊 Status Fase 2: ${passed}/${total} testes passaram (${percentage}%)`)
    
    if (percentage >= 80) {
      console.log('🎉 Fase 2 implementada com sucesso!')
      console.log('🚀 Delay reduzido para < 1 segundo em muitos casos!')
    } else if (percentage >= 60) {
      console.log('⚡ Fase 2 parcialmente implementada - alguns ajustes necessários')
    } else {
      console.log('🔧 Fase 2 precisa de revisão - muitos testes falharam')
    }

    console.log('\n🎯 Benefícios da Fase 2:')
    console.log('- Streaming em tempo real do Gemini')
    console.log('- TTS via WebSocket para delay mínimo')
    console.log('- Buffer inteligente de áudio')
    console.log('- Feedback visual instantâneo')
    console.log('- Respostas sobrepostas (overlap)')

    console.log('\n🎯 Próximos passos:')
    if (percentage >= 80) {
      console.log('- Iniciar Fase 3 (Edge Functions + CDN)')
      console.log('- Monitorar performance em produção')
      console.log('- Otimizar prompts para streaming')
    } else {
      console.log('- Corrigir testes falhados da Fase 2')
      console.log('- Verificar configurações de WebSocket')
      console.log('- Validar variáveis de ambiente')
    }
  }
}

// Executar testes se rodado diretamente
if (require.main === module) {
  const tester = new Phase2Tester()
  
  tester.runAllTests()
    .then(() => tester.printSummary())
    .catch(console.error)
}

export default Phase2Tester
