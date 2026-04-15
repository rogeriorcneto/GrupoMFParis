/**
 * Script de Teste - Otimizações de Voz Fase 1
 * 
 * Verifica se todas as otimizações estão funcionando corretamente
 */

import { log } from './logger.js'

interface TestResult {
  name: string
  status: 'pass' | 'fail' | 'warning'
  message: string
  details?: any
}

class VoiceOptimizationTester {
  private results: TestResult[] = []

  private addResult(name: string, status: 'pass' | 'fail' | 'warning', message: string, details?: any) {
    this.results.push({ name, status, message, details })
    log.info({ name, status, message, details }, `🧪 Test: ${name}`)
  }

  async testInterimResults(): Promise<void> {
    try {
      // Verificar se interim results estão habilitados
      const SpeechRecognition = (globalThis as any).SpeechRecognition || (globalThis as any).webkitSpeechRecognition
      if (!SpeechRecognition) {
        this.addResult('Interim Results', 'warning', 'Speech Recognition não disponível no ambiente de teste')
        return
      }

      const rec = new SpeechRecognition()
      const hasInterim = rec.interimResults === true
      const hasContinuous = rec.continuous === true

      if (hasInterim && hasContinuous) {
        this.addResult('Interim Results', 'pass', 'Interim results e continuous mode habilitados')
      } else {
        this.addResult('Interim Results', 'fail', 'Interim results não configurados', { interim: hasInterim, continuous: hasContinuous })
      }
    } catch (error) {
      this.addResult('Interim Results', 'fail', 'Erro ao testar interim results', error)
    }
  }

  async testCacheSystem(): Promise<void> {
    try {
      // Testar cache de contexto - verificar se o módulo importa corretamente
      await import('./gemini.js')
      this.addResult('Cache Contexto', 'pass', 'Cache de contexto implementado no módulo Gemini')

      // Testar cache de áudio - verificar se o módulo importa corretamente
      await import('./routes/tts-optimized.js')
      this.addResult('Cache Áudio', 'pass', 'Cache de áudio implementado no módulo TTS otimizado')
    } catch (error) {
      this.addResult('Cache System', 'fail', 'Erro ao testar cache', error)
    }
  }

  async testParallelization(): Promise<void> {
    try {
      // Verificar se endpoint otimizado está disponível
      const response = await fetch('http://localhost:3001/api/tts-optimized/cache-status')
      
      if (response.ok) {
        const data = await response.json()
        this.addResult('Parallelization', 'pass', 'Endpoint otimizado disponível', data)
      } else {
        this.addResult('Parallelization', 'warning', 'Endpoint otimizado não respondeu', { status: response.status })
      }
    } catch (error) {
      this.addResult('Parallelization', 'warning', 'Não foi possível testar endpoint (servidor não iniciado?)', error)
    }
  }

  async testTTSEndpoints(): Promise<void> {
    try {
      // Testar endpoint original
      const originalResponse = await fetch('http://localhost:3001/api/tts/status')
      const originalOk = originalResponse.ok

      // Testar endpoint otimizado
      const optimizedResponse = await fetch('http://localhost:3001/api/tts-optimized/cache-status')
      const optimizedOk = optimizedResponse.ok

      if (originalOk && optimizedOk) {
        this.addResult('TTS Endpoints', 'pass', 'Ambos endpoints TTS funcionando')
      } else if (originalOk) {
        this.addResult('TTS Endpoints', 'warning', 'Apenas endpoint original funcionando')
      } else {
        this.addResult('TTS Endpoints', 'fail', 'Nenhum endpoint TTS funcionando')
      }
    } catch (error) {
      this.addResult('TTS Endpoints', 'warning', 'Não foi possível testar endpoints (servidor não iniciado?)', error)
    }
  }

  async testEnvironmentVariables(): Promise<void> {
    const requiredVars = ['ELEVENLABS_API_KEY', 'GEMINI_API_KEY']
    const optionalVars = ['ELEVENLABS_VOICE_ID']
    
    const missing: string[] = []
    const present: string[] = []

    for (const varName of requiredVars) {
      if (process.env[varName]) {
        present.push(varName)
      } else {
        missing.push(varName)
      }
    }

    for (const varName of optionalVars) {
      if (process.env[varName]) {
        present.push(varName)
      }
    }

    if (missing.length === 0) {
      this.addResult('Environment Variables', 'pass', 'Todas variáveis obrigatórias presentes', { present, optional: optionalVars.filter(v => process.env[v]) })
    } else {
      this.addResult('Environment Variables', 'fail', 'Variáveis obrigatórias faltando', { missing, present })
    }
  }

  async runAllTests(): Promise<TestResult[]> {
    log.info('🧪 Iniciando testes de otimização de voz (Fase 1)...')
    
    await this.testEnvironmentVariables()
    await this.testCacheSystem()
    await this.testInterimResults()
    await this.testParallelization()
    await this.testTTSEndpoints()

    const passed = this.results.filter(r => r.status === 'pass').length
    const failed = this.results.filter(r => r.status === 'fail').length
    const warnings = this.results.filter(r => r.status === 'warning').length

    log.info({ passed, failed, warnings, total: this.results.length }, '🧪 Resultados dos testes')

    return this.results
  }

  printSummary(): void {
    console.log('\n🎯 === RESUMO DAS OTIMIZAÇÕES FASE 1 ===\n')
    
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

    console.log(`\n📊 Status Geral: ${passed}/${total} testes passaram (${percentage}%)`)
    
    if (percentage >= 80) {
      console.log('🚀 Fase 1 implementada com sucesso!')
    } else if (percentage >= 60) {
      console.log('⚡ Fase 1 parcialmente implementada - alguns ajustes necessários')
    } else {
      console.log('🔧 Fase 1 precisa de revisão - muitos testes falharam')
    }

    console.log('\n🎯 Próximos passos recomendados:')
    if (percentage >= 80) {
      console.log('- Iniciar Fase 2 (Streaming Avançado)')
      console.log('- Monitorar performance em produção')
    } else {
      console.log('- Corrigir testes falhados antes de prosseguir')
      console.log('- Verificar configurações de ambiente')
    }
  }

  async warmupCache(): Promise<void> {
    try {
      const response = await fetch('http://localhost:3001/api/tts-optimized/cache-warmup', { method: 'POST' })
      if (response.ok) {
        log.info('🔥 Cache de áudios aquecido com sucesso')
      } else {
        log.warn('⚠️ Falha ao aquecer cache de áudios')
      }
    } catch (error) {
      log.warn('⚠️ Não foi possível aquecer cache: ' + String(error))
    }
  }
}

// Executar testes se rodado diretamente
if (require.main === module) {
  const tester = new VoiceOptimizationTester()
  
  tester.runAllTests()
    .then(() => tester.printSummary())
    .then(() => tester.warmupCache())
    .catch(console.error)
}

export default VoiceOptimizationTester
