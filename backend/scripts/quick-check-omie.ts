import { omieCall, getOmieCredentials } from '../src/omie/client.js'

async function main() {
  const creds = await getOmieCredentials()
  if (!creds) { console.log('NO CREDS'); process.exit(1) }

  const codigos = [9682536034, 9682536089] // venda, bonificacao

  for (const cod of codigos) {
    console.log('\n===== PEDIDO ' + cod + ' =====')
    const resp: any = await omieCall('/produtos/pedido/', 'ConsultarPedido', [{ codigo_pedido: cod }], { skipCache: true, credentials: creds })
    const p = resp?.pedido_venda_produto || resp
    const cab = p?.cabecalho || {}
    console.log('tipo_pedido_integracao:', cab.codigo_pedido_integracao)
    console.log('codigo_cliente:', cab.codigo_cliente)
    console.log('codigo_parcela:', cab.codigo_parcela)
    console.log('cenario:', cab.codigo_cenario_impostos)
    console.log('numero_pedido:', cab.numero_pedido)

    const det = p?.det || []
    for (const d of det) {
      const pr = d?.produto || {}
      const inf = d?.inf_adic || {}
      console.log('  ITEM: desc=' + pr.descricao + ' cfop=' + pr.cfop + ' qtd=' + pr.quantidade + ' unidade=' + pr.unidade + ' peso_bruto=' + inf.peso_bruto + ' peso_liquido=' + inf.peso_liquido + ' valor=' + pr.valor_unitario)
    }

    const frete = p?.frete || {}
    console.log('frete_modalidade:', frete.modalidade, 'volumes:', frete.quantidade_volumes)

    const infAdic = p?.informacoes_adicionais || {}
    console.log('codVend:', infAdic.codVend, 'categoria:', infAdic.codigo_categoria)

    // Consultar cliente
    const codCli = cab.codigo_cliente
    if (codCli) {
      const cli: any = await omieCall('/geral/clientes/', 'ConsultarCliente', [{ codigo_cliente_omie: codCli }], { skipCache: true, credentials: creds })
      console.log('CLIENTE: ' + cli?.razao_social + ' | cnpj=' + cli?.cnpj_cpf + ' | email=' + (cli?.email || 'VAZIO') + ' | tel=' + (cli?.telefone1_numero || 'VAZIO') + ' | IE=' + (cli?.inscricao_estadual || 'VAZIO') + ' | UF=' + cli?.estado)
    }
  }

  console.log('\nDONE')
  process.exit(0)
}

main().catch(e => { console.error(e.message); process.exit(1) })
