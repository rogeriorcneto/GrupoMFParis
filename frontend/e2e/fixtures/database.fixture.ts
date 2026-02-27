import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.e2e')
}

/**
 * Supabase client autenticado para setup/teardown de dados de teste.
 * Usa as credenciais do gerente para ter acesso completo.
 */
export async function getAuthenticatedClient() {
  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })

  const email = process.env.E2E_GERENTE_EMAIL || ''
  const senha = process.env.E2E_GERENTE_SENHA || ''

  const { error } = await client.auth.signInWithPassword({ email, password: senha })
  if (error) throw new Error(`Falha ao autenticar fixture client: ${error.message}`)

  return client
}

/**
 * CNPJ único para cada execução de teste — evita conflitos
 */
export function gerarCnpjTeste(): string {
  const ts = Date.now().toString().slice(-8)
  return `99.999.${ts.slice(0, 3)}/${ts.slice(3, 7)}-00`
}

/**
 * Cria um cliente de teste e retorna o id para cleanup posterior.
 */
export async function criarClienteTeste(overrides: Record<string, any> = {}) {
  const client = await getAuthenticatedClient()
  const cnpj = gerarCnpjTeste()

  const { data, error } = await client.from('clientes').insert({
    razao_social: `E2E Teste ${Date.now()}`,
    cnpj,
    contato_nome: 'Contato E2E',
    contato_telefone: '(31) 99999-0001',
    contato_email: 'e2e@teste.com',
    etapa: 'prospecção',
    score: 10,
    dias_inativo: 0,
    ...overrides,
  }).select('id').single()

  if (error) throw new Error(`Falha ao criar cliente de teste: ${error.message}`)
  return { id: data.id, cnpj, client }
}

/**
 * Limpa um cliente de teste pelo id.
 * Remove também interacoes, historico_etapas, tarefas e notificacoes associados.
 */
export async function limparClienteTeste(clienteId: number) {
  const client = await getAuthenticatedClient()

  // Deleta dependências primeiro (ordem importa por FK)
  await client.from('notificacoes').delete().eq('cliente_id', clienteId)
  await client.from('tarefas').delete().eq('cliente_id', clienteId)
  await client.from('interacoes').delete().eq('cliente_id', clienteId)
  await client.from('historico_etapas').delete().eq('cliente_id', clienteId)
  await client.from('jobs_automacao').delete().eq('cliente_id', clienteId)

  // Deleta o cliente
  const { error } = await client.from('clientes').delete().eq('id', clienteId)
  if (error) throw new Error(`Falha ao limpar cliente de teste: ${error.message}`)
}

/**
 * Limpa múltiplos clientes de teste.
 */
export async function limparClientesTeste(ids: number[]) {
  for (const id of ids) {
    await limparClienteTeste(id)
  }
}
