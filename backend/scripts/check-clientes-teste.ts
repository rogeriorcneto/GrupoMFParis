import { supabase } from '../src/supabase.js'

async function main() {
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, razao_social, cnpj, cpf, omie_codigo, etapa, novo_ciclo, ciclo_numero, criado_em')
    .ilike('razao_social', '%Teste%')
    .order('id', { ascending: false })
    .limit(15)
  console.log(JSON.stringify(clientes, null, 2))
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
