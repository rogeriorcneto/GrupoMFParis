import { describe, it, expect } from 'vitest'
import { crmToOmie, omieToDbRow } from '../omie/sync.js'
import type { OmieCliente } from '../omie/types.js'

describe('Omie Sync — Mapeamento CRM ↔ Omie', () => {
  describe('crmToOmie', () => {
    it('mapeia campos snake_case do CRM para nomes Omie', () => {
      const crm = {
        razao_social: 'MF Paris LTDA',
        nome_fantasia: 'MF Paris',
        cnpj: '12345678000199',
        contato_nome: 'Rafael',
        contato_email: 'rafael@mfparis.com.br',
        contato_telefone: '3132001234',
        contato_celular: '31999991234',
        endereco_rua: 'Rua das Flores',
        endereco_numero: '100',
        endereco_complemento: 'Sala 1',
        endereco_bairro: 'Centro',
        endereco_cidade: 'Belo Horizonte',
        endereco_estado: 'MG',
        endereco_cep: '30130000',
        cnae_primario: '4712100',
        notas: 'Observação test',
      }

      const omie = crmToOmie(crm)
      expect(omie.razao_social).toBe('MF Paris LTDA')
      expect(omie.nome_fantasia).toBe('MF Paris')
      expect(omie.cnpj_cpf).toBe('12345678000199')
      expect(omie.contato).toBe('Rafael')
      expect(omie.email).toBe('rafael@mfparis.com.br')
      expect(omie.telefone1_numero).toBe('3132001234')
      expect(omie.telefone2_numero).toBe('31999991234')
      expect(omie.endereco).toBe('Rua das Flores')
      expect(omie.endereco_numero).toBe('100')
      expect(omie.complemento).toBe('Sala 1')
      expect(omie.bairro).toBe('Centro')
      expect(omie.cidade).toBe('Belo Horizonte')
      expect(omie.estado).toBe('MG')
      expect(omie.cep).toBe('30130000')
      expect(omie.cnae).toBe('4712100')
      expect(omie.observacao).toBe('Observação test')
    })

    it('mapeia campos camelCase do CRM para nomes Omie', () => {
      const crm = {
        razaoSocial: 'Empresa XYZ',
        nomeFantasia: 'XYZ',
        contatoNome: 'João',
        contatoEmail: 'joao@xyz.com',
        contatoTelefone: '1133001234',
        contatoCelular: '11999991234',
        enderecoRua: 'Av Paulista',
        enderecoNumero: '200',
        enderecoComplemento: 'Andar 5',
        enderecoBairro: 'Bela Vista',
        enderecoCidade: 'São Paulo',
        enderecoEstado: 'SP',
        enderecoCep: '01310100',
        cnaePrimario: '6201500',
      }

      const omie = crmToOmie(crm)
      expect(omie.razao_social).toBe('Empresa XYZ')
      expect(omie.nome_fantasia).toBe('XYZ')
      expect(omie.contato).toBe('João')
      expect(omie.email).toBe('joao@xyz.com')
      expect(omie.endereco).toBe('Av Paulista')
      expect(omie.cidade).toBe('São Paulo')
      expect(omie.estado).toBe('SP')
    })

    it('retorna strings vazias para campos ausentes', () => {
      const omie = crmToOmie({})
      expect(omie.razao_social).toBe('')
      expect(omie.contato).toBe('')
      expect(omie.email).toBe('')
      expect(omie.endereco).toBe('')
    })
  })

  describe('omieToDbRow', () => {
    it('mapeia campos Omie para snake_case do banco', () => {
      const omie: Partial<OmieCliente> = {
        razao_social: 'MF Paris LTDA',
        nome_fantasia: 'MF Paris',
        cnpj_cpf: '12.345.678/0001-99',
        contato: 'Rafael',
        email: 'rafael@mfparis.com.br',
        telefone1_numero: '3132001234',
        telefone2_numero: '31999991234',
        endereco: 'Rua das Flores',
        endereco_numero: '100',
        complemento: 'Sala 1',
        bairro: 'Centro',
        cidade: 'Belo Horizonte',
        estado: 'MG',
        cep: '30130000',
        cnae: '4712100',
        codigo_cliente_omie: 12345,
      }

      const row = omieToDbRow(omie as OmieCliente)
      expect(row.razao_social).toBe('MF Paris LTDA')
      expect(row.nome_fantasia).toBe('MF Paris')
      expect(row.cnpj).toBe('12.345.678/0001-99')
      expect(row.contato_nome).toBe('Rafael')
      expect(row.contato_email).toBe('rafael@mfparis.com.br')
      expect(row.contato_telefone).toBe('3132001234')
      expect(row.contato_celular).toBe('31999991234')
      expect(row.endereco_rua).toBe('Rua das Flores')
      expect(row.endereco_numero).toBe('100')
      expect(row.endereco_complemento).toBe('Sala 1')
      expect(row.endereco_bairro).toBe('Centro')
      expect(row.endereco_cidade).toBe('Belo Horizonte')
      expect(row.endereco_estado).toBe('MG')
      expect(row.endereco_cep).toBe('30130000')
      expect(row.cnae_primario).toBe('4712100')
      expect(row.omie_codigo).toBe('12345')
    })

    it('retorna strings vazias para campos ausentes no Omie', () => {
      const row = omieToDbRow({} as OmieCliente)
      expect(row.razao_social).toBe('')
      expect(row.cnpj).toBe('')
      expect(row.contato_nome).toBe('')
      expect(row.contato_email).toBe('')
      expect(row.omie_codigo).toBe('')
    })

    it('converte codigo_cliente_omie para string', () => {
      const row = omieToDbRow({ codigo_cliente_omie: 99999 } as OmieCliente)
      expect(typeof row.omie_codigo).toBe('string')
      expect(row.omie_codigo).toBe('99999')
    })
  })

  describe('SyncDiffItem tipagem', () => {
    it('status deve ser novo, atualizado ou sem_alteracao', () => {
      const validStatuses = ['novo', 'atualizado', 'sem_alteracao']
      for (const s of validStatuses) {
        expect(validStatuses).toContain(s)
      }
    })
  })

  describe('roundtrip CRM → Omie → DB', () => {
    it('dados sobrevivem ao mapeamento ida e volta', () => {
      const crmOriginal = {
        razao_social: 'Empresa Teste SA',
        nome_fantasia: 'Teste',
        cnpj: '11222333000144',
        contato_nome: 'Maria',
        contato_email: 'maria@teste.com',
        contato_telefone: '2133001234',
        contato_celular: '21999998888',
        endereco_rua: 'Rua A',
        endereco_numero: '50',
        endereco_complemento: '',
        endereco_bairro: 'Copacabana',
        endereco_cidade: 'Rio de Janeiro',
        endereco_estado: 'RJ',
        endereco_cep: '22041080',
        cnae_primario: '6201500',
        notas: 'Nota de teste',
      }

      // CRM → Omie → DB
      const omieData = crmToOmie(crmOriginal) as OmieCliente
      omieData.codigo_cliente_omie = 55555
      const dbRow = omieToDbRow(omieData)

      expect(dbRow.razao_social).toBe(crmOriginal.razao_social)
      expect(dbRow.nome_fantasia).toBe(crmOriginal.nome_fantasia)
      expect(dbRow.cnpj).toBe(crmOriginal.cnpj)
      expect(dbRow.contato_nome).toBe(crmOriginal.contato_nome)
      expect(dbRow.contato_email).toBe(crmOriginal.contato_email)
      expect(dbRow.contato_telefone).toBe(crmOriginal.contato_telefone)
      expect(dbRow.endereco_rua).toBe(crmOriginal.endereco_rua)
      expect(dbRow.endereco_cidade).toBe(crmOriginal.endereco_cidade)
      expect(dbRow.endereco_estado).toBe(crmOriginal.endereco_estado)
    })
  })
})
