import { supabase } from '../supabase.js'
import * as fs from 'fs/promises'
import * as path from 'path'

const CNAE_SORVETERIAS = '1053800'
const UF = 'MG'

const MUNICIPIOS_TEXTO = `Zona da Mata

Abre Campo, Acaiaca, Além Paraíba, Alto Caparaó, Alto Jequitibá, Alto Rio Doce, Amparo da Serra, Antônio Prado de Minas, Aracitaba, Araponga, Argirita, Astolfo Dutra, Barão de Monte Alto, Belmiro Braga, Bias Fortes, Bicas, Brás Pires, Caiana, Cajuri, Canaã, Caparaó, Caputira, Carangola, Chácara, Chalé, Chiador, Cipotânea, Coimbra, Coronel Pacheco, Descoberto, Diogo de Vasconcelos, Divinésia, Divino, Dom Silvério, Dona Euzébia, Dores do Turvo, Durandé, Ervália, Espera Feliz, Estrela Dalva, Eugenópolis, Ewbank da Câmara, Faria Lemos, Fervedouro, Goianá, Guaraciaba, Guarani, Guarará, Guidoval, Guiricema, Itamarati de Minas, Jequeri, Juiz de Fora, Lajinha, Laranjal, Leopoldina, Lima Duarte, Luisburgo, Manhuaçu, Manhumirim, Mar de Espanha, Maripá de Minas, Martins Soares, Matias Barbosa, Matipó, Mercês, Miradouro, Miraí, Muriaé, Olaria, Oratórios, Paiva, Palma, Patrocínio do Muriaé, Paula Cândido, Pedra Bonita, Pedra do Anta, Pedra Dourada, Pedro Teixeira, Pequeri, Piau, Piedade de Ponte Nova, Piraúba, Pirapetinga, Ponte Nova, Porto Firme, Raul Soares, Recreio, Reduto, Rio Casca, Rio Doce, Rio Espera, Rio Novo, Rio Pomba, Rio Preto, Rochedo de Minas, Rodeiro, Rosário da Limeira, Santa Bárbara do Monte Verde, Santa Cruz do Escalvado, Santa Margarida, Santa Rita de Ibitipoca, Santana de Cataguases, Santana do Deserto, Santana do Manhuaçu, Santo Antônio do Aventureiro, Santos Dumont, São Francisco do Glória, São Geraldo, São João do Manhuaçu, São João Nepomuceno, São José do Mantimento, São Miguel do Anta, São Pedro dos Ferros, São Sebastião da Vargem Alegre, Sem-Peixe, Senador Cortes, Senador Firmino, Sericita, Silveirânia, Simonésia, Tabuleiro, Teixeiras, Tocantins, Tombos, Ubá, Urucânia, Vermelho Novo, Viçosa, Vieiras, Visconde do Rio Branco e Volta Grande. 

Vale do Rio Doce

Açucena, Aimorés, Alpercata, Alvarenga, Antônio Dias, Belo Oriente, Bom Jesus do Galho, Braúnas, Bugre, Campanário, Cantagalo, Capitão Andrade, Caratinga, Central de Minas, Coluna, Conselheiro Pena, Coroaci, Coronel Fabriciano, Córrego Novo, Cuparaque, Divino das Laranjeiras, Divinolândia de Minas, Dom Cavati, Engenheiro Caldas, Fernandes Tourinho, Frei Inocêncio, Galileia, Goiabeira, Gonzaga, Governador Valadares, Iapu, Inhapim, Ipaba, Ipatinga, Itabira, Itambacuri, Itanhomi, Jampruca, Joanésia, José Raydan, Marilac, Marliéria, Materlândia, Mathias Lobato, Mesquita, Naque, Nacip Raydan, Nova Belém, Nova Era, Nova Módica, Pescador, Peçanha, Periquito, Resplendor, Rio Piracicaba, Sabinópolis, Santa Bárbara do Leste, Santa Efigênia de Minas, Santa Maria de Itabira, Santa Rita de Minas, Santana do Paraíso, São Domingos das Dores, São Geraldo da Piedade, São Geraldo do Baixio, São João do Oriente, São João Evangelista, São José da Safira, São José do Goiabal, São José do Jacuri, São Pedro do Suaçuí, São Sebastião do Anta, Sardoá, Senhora do Porto, Serra Azul de Minas, Tarumirim, Timóteo, Tumiritinga, Ubaporanga, Vargem Alegre, Virginópolis e Virgolândia. 

Vale do Mucuri

Águas Formosas, Bertópolis, Carlos Chagas, Catuji, Crisólita, Fronteira dos Vales, Itaipé, Ladainha, Machacalis, Malacacheta, Nanuque, Ouro Verde de Minas, Pavão, Poté, Serra dos Aimorés, Setubinha, Teófilo Otoni e Umburatiba. 

Vale do Jequitinhonha

Almenara, Angelândia, Araçuaí, Aricanduva, Bandeira, Berilo, Cachoeira de Pajeú, Capelinha, Caraí, Carbonita, Chapada do Norte, Comercinho, Coronel Murta, Couto de Magalhães de Minas, Datas, Diamantina, Felício dos Santos, Francisco Badaró, Gouveia, Itaobim, Itinga, Jacinto, Jequitinhonha, Jenipapo de Minas, Joaíma, Jordânia, José Gonçalves de Minas, Leme do Prado, Mata Verde, Medina, Minas Novas, Monte Formoso, Novo Cruzeiro, Padre Paraíso, Palmópolis, Pedra Azul, Ponto dos Volantes, Presidente Kubitschek, Rio do Prado, Rubelita, Salto da Divisa, Santa Maria do Salto, Santo Antônio do Jacinto, Senador Modestino Gonçalves, Turmalina, Veredinha e Virgem da Lapa.`

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;]+$/, '')
}

const EXCLUIR = new Set([
  '',
  'ZONA DA MATA',
  'VALE DO RIO DOCE',
  'VALE DO MUCURI',
  'VALE DO JEQUITINHONHA',
])

const citySet = new Set<string>()
const tokens = MUNICIPIOS_TEXTO.split(/,|\n|\s+e\s+/i)
for (const raw of tokens) {
  const t = normalize(raw)
  if (EXCLUIR.has(t)) continue
  citySet.add(t)
}

async function fetchAll() {
  const rows: any[] = []
  const page = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('leads_rf')
      .select('cnpj,razao_social,nome_fantasia,cnae,municipio,uf,logradouro,bairro,cep,telefone,email,importado')
      .eq('cnae', CNAE_SORVETERIAS)
      .eq('uf', UF)
      .order('municipio', { ascending: true })
      .order('razao_social', { ascending: true })
      .range(from, from + page - 1)
    if (error) {
      console.error('Erro na consulta ao Supabase:', error)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    rows.push(...data)
    from += page
    if (data.length < page) break
  }
  return rows
}

async function main() {
  const all = await fetchAll()
  const filtered = all.filter((r: any) => citySet.has(normalize(r.municipio || '')))

  console.log(`Total de sorveterias carregadas de MG: ${all.length}`)
  console.log(`Filtradas pelos municípios solicitados: ${filtered.length}`)

  const cols = ['CNPJ','Razão Social','Nome Fantasia','CNAE','Município','UF','Logradouro','Bairro','CEP','Telefone','Email']
  const rows = [cols]
  for (const l of filtered) {
    rows.push([
      (l.cnpj || '').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'),
      l.razao_social || '',
      l.nome_fantasia || '',
      l.cnae || '',
      l.municipio || '',
      l.uf || '',
      l.logradouro || '',
      l.bairro || '',
      (l.cep || '').replace(/(\d{5})(\d{3})/, '$1-$2'),
      l.telefone || '',
      l.email || '',
    ])
  }

  const bom = '\uFEFF'
  const csv = bom + rows.map(r => r.map(v => `"${(v || '').toString().replace(/"/g,'""')}"`).join(';')).join('\n')

  const outDir = path.resolve(process.cwd(), 'exports')
  await fs.mkdir(outDir, { recursive: true })
  const file = path.join(outDir, 'sorveterias_mg_zonas.csv')
  await fs.writeFile(file, csv, 'utf-8')
  console.log(`Arquivo salvo em: ${file}`)
}

main().catch((err) => {
  console.error('Erro inesperado:', err)
  process.exit(1)
})
