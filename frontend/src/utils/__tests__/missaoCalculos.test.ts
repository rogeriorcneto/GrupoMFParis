import { describe, it, expect } from 'vitest'
import {
  avaliarCheckinVisita,
  calcularCustoPrevistoMissao,
  calcularDiasMissao,
  calcularKmRoteiroPorCoordenadas,
  classificarPlanilhaLeadsPorCnpj,
  filtrarClientesParaMissao,
  formatarDistanciaHumana,
  reordenarVisitasPorDia,
  resumirDespesasMissao,
  CUSTO_ESTIMADO_IA_POR_HORA_USD,
} from '../missaoCalculos'
import { construirMapaCidadesConhecidas } from '../cidadesCoordenadas'

describe('Aba Missões — Regras determinísticas e Critérios de Aceite', () => {
  it('Aceite 1: importa planilha de leads sem duplicar CNPJ que já existe no CRM (mesmo com máscara diferente)', () => {
    const cnpjsNoCrm = ['02.687.843/0001-33', '61066809000100']
    const planilha = [
      { CNPJ: '02687843000133', RAZAO_SOCIAL: 'GRACIALY JA EXISTE', MUNICIPIO: 'TIMOTEO', ESTADO_SIGLA: 'MG' },
      { CNPJ: '22.165.179/0017-37', NOME_FANTASIA: 'TARUMA NOVO LEAD', MUNICIPIO: 'UBERLANDIA', ESTADO_SIGLA: 'MG', TELEFONE: '(34) 3215-1544' },
      { CNPJ: '22165179001737', RAZAO_SOCIAL: 'TARUMA REPETIDO NA PLANILHA', MUNICIPIO: 'UBERLANDIA', ESTADO_SIGLA: 'MG' },
      { CNPJ: '123', RAZAO_SOCIAL: 'CNPJ INVALIDO' },
    ]

    const res = classificarPlanilhaLeadsPorCnpj(planilha, cnpjsNoCrm)
    expect(res.novosLeads).toHaveLength(1)
    expect(res.novosLeads[0].cnpjFormatado).toBe('22.165.179/0017-37')
    expect(res.novosLeads[0].enderecoCidade).toBe('UBERLANDIA')
    expect(res.duplicadosNoCrm).toHaveLength(1)
    expect(res.duplicadosNoCrm[0].cnpj).toBe('02.687.843/0001-33')
    expect(res.duplicadosNaPlanilha).toHaveLength(1)
    expect(res.invalidosSemCnpj).toBe(1)
  })

  it('Aceite 2: filtra leads escolhendo duas cidades e um raio de 50 km', () => {
    const mapa = construirMapaCidadesConhecidas()
    const uberlandia = mapa.get('uberlandia|MG')!
    const ipatinga = mapa.get('ipatinga|MG')!

    const carteira = [
      // Araguari fica a ~32 km de Uberlândia → DEVE entrar pelo raio de 50 km
      { id: 1, razaoSocial: 'Cliente Araguari', enderecoCidade: 'Araguari', enderecoEstado: 'MG' },
      // Timóteo fica a ~16 km de Ipatinga → DEVE entrar pelo raio de 50 km
      { id: 2, razaoSocial: 'Cliente Timoteo', enderecoCidade: 'Timóteo', enderecoEstado: 'MG' },
      // Uberaba fica a ~100 km de Uberlândia → FORA do raio de 50 km
      { id: 3, razaoSocial: 'Cliente Uberaba', enderecoCidade: 'Uberaba', enderecoEstado: 'MG' },
      // Montes Claros fica a >350 km → FORA
      { id: 4, razaoSocial: 'Cliente Montes Claros', enderecoCidade: 'Montes Claros', enderecoEstado: 'MG' },
    ]

    const filtrados = filtrarClientesParaMissao(
      carteira,
      {
        cidades: ['Uberlândia', 'Ipatinga'],
        cidadesCentroRaio: [uberlandia, ipatinga],
        raioKm: 50,
      },
      mapa,
    )

    expect(filtrados.map(c => c.id)).toEqual([1, 2])
  })

  it('Aceite 2 + Item 3: reordena visitas e recalcula o km total do roteiro e o custo previsto', () => {
    const mapa = construirMapaCidadesConhecidas()
    const bh = mapa.get('belo horizonte|MG')!
    const divinopolis = mapa.get('divinopolis|MG')!
    const uberlandia = mapa.get('uberlandia|MG')!

    // Ordem linear lógica: BH -> Divinópolis -> Uberlândia -> BH
    const kmOrdemDireta = calcularKmRoteiroPorCoordenadas(bh, [divinopolis, uberlandia], bh)
    // Ordem com zigue-zague: BH -> Uberlândia -> Divinópolis -> BH -> Contagem -> Uberlândia -> BH
    const contagem = mapa.get('contagem|MG')!
    const kmZigueZague = calcularKmRoteiroPorCoordenadas(bh, [uberlandia, contagem, divinopolis], bh)

    expect(kmOrdemDireta).toBeGreaterThan(900)
    expect(kmZigueZague).toBeGreaterThan(kmOrdemDireta)

    // Reordenação por dia mantém numeração sequencial 1..N
    const visitas = [
      { id: 10, diaNumero: 1, ordem: 1 },
      { id: 20, diaNumero: 1, ordem: 2 },
      { id: 30, diaNumero: 2, ordem: 1 },
    ]
    const reordenadas = reordenarVisitasPorDia(visitas, 30, 1, 0)
    expect(reordenadas).toEqual([
      { id: 30, diaNumero: 1, ordem: 1 },
      { id: 10, diaNumero: 1, ordem: 2 },
      { id: 20, diaNumero: 1, ordem: 3 },
    ])

    // Custo previsto = km * valor_km + diarias * dias + hospedagem
    const dias = calcularDiasMissao('2026-12-01', '2026-12-03')
    expect(dias).toBe(3)
    const custo = calcularCustoPrevistoMissao({
      kmTotal: 500,
      valorKm: 1.5,
      valorDiaria: 120,
      dias,
      hospedagem: 450,
    })
    // 500*1.5 (=750) + 120*3 (=360) + 450 = 1560
    expect(custo).toEqual({
      custoKm: 750,
      custoDiarias: 360,
      custoHospedagem: 450,
      custoPrevistoTotal: 1560,
    })
  })

  it('Aceite 3: check-in na porta do cliente (<=300m) fica válido; a 2 km é aceito e marcado "Fora do local" com a distância', () => {
    const clienteCoord = { lat: -18.9186, lon: -48.2772 }
    // ~45 metros de distância (na porta)
    const naPorta = { lat: -18.9182, lon: -48.2772 }
    const checkValido = avaliarCheckinVisita(naPorta, clienteCoord, 300)
    expect(checkValido.validoNoRaio).toBe(true)
    expect(checkValido.foraDoLocal).toBe(false)
    expect(checkValido.distanciaMetros).toBeLessThanOrEqual(300)

    // ~2 km (0.018 grau de latitude ≈ 2.001 m)
    const aDoisKm = { lat: -18.9006, lon: -48.2772 }
    const checkFora = avaliarCheckinVisita(aDoisKm, clienteCoord, 300)
    expect(checkFora.validoNoRaio).toBe(false)
    expect(checkFora.foraDoLocal).toBe(true)
    expect(checkFora.distanciaMetros).toBeGreaterThan(1900)
    expect(checkFora.distanciaMetros).toBeLessThan(2100)
    expect(formatarDistanciaHumana(checkFora.distanciaMetros)).toBe('2,0 km')
  })

  it('Item 6: agrupa despesas nas 8 classes oficiais e compara previsto x realizado', () => {
    const resumo = resumirDespesasMissao(
      [
        { tipo: 'COMBUSTIVEL', valor: 320.5 },
        { tipo: 'PEDAGIO', valor: 49.5 },
        { tipo: 'HOSPEDAGEM', valor: 400 },
        { tipo: 'REFEICAO', valor: 95 },
        { tipo: 'PECAS_SERV', valor: 150 },
      ],
      1500,
    )
    expect(resumo.porClasse.COMBUSTIVEL).toBe(320.5)
    expect(resumo.porClasse.PEDAGIO).toBe(49.5)
    expect(resumo.porClasse.HOSPEDAGEM).toBe(400)
    expect(resumo.porClasse.REFEICAO).toBe(95)
    expect(resumo.porClasse.PECAS_SERV).toBe(150)
    expect(resumo.porClasse.PASSAGEM).toBe(0)
    expect(resumo.totalRealizado).toBe(1015)
    expect(resumo.saldoPrevistoMenosRealizado).toBe(485)
    expect(CUSTO_ESTIMADO_IA_POR_HORA_USD).toBeCloseTo(0.15, 2)
  })
})
