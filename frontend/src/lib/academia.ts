import { supabase } from './supabase'
import type { Vendedor } from '../types'

export type AcademiaData = {
  blocos: any[]; competencias: any[]; biblioteca: any[]; aulas: any[]; questoes: any[];
  progresso: any[]; chaves: any[]; chavesFuncao: any[]; chavesPessoa: any[]; termos: any[];
  atribuidos: any[]; historico: any[]
}

export const FUNCOES = [
  ['vendedor_industria','Vendedor de Indústria'],['executiva_contas','Executiva de contas'],['interno','Interno'],['rca','RCA']
] as const
export const FASES: Record<string,string> = { reciclagem:'Reciclagem', formacao:'Formação', diagnostico:'Diagnóstico', adaptavel:'Adaptável' }
export const ESTADOS: Record<string,string> = { bloqueado:'Bloqueado', disponivel:'Disponível', em_andamento:'Em andamento', em_reforco:'Em reforço', concluido:'Concluído' }

async function q(table:string, query='*') {
  const { data, error } = await supabase.from(table).select(query)
  if (error) throw error
  return data || []
}

export async function fetchAcademiaData(vendedorId?: number): Promise<AcademiaData> {
  const [blocos,competencias,biblioteca,aulas,questoes,chaves,chavesFuncao,termos,historico] = await Promise.all([
    q('academia_blocos'),q('academia_competencias'),q('academia_biblioteca'),q('academia_aulas'),q('academia_questoes'),q('academia_chaves'),q('academia_chaves_funcao'),q('academia_termos'),q('academia_historico')
  ])
  let progresso:any[]=[],chavesPessoa:any[]=[],atribuidos:any[]=[]
  if (vendedorId) {
    const [p,cp,a] = await Promise.all([
      supabase.from('academia_progresso').select('*').eq('vendedor_id',vendedorId),
      supabase.from('academia_chaves_pessoa').select('*').eq('vendedor_id',vendedorId),
      supabase.from('academia_treinos_atribuidos').select('*').eq('vendedor_id',vendedorId)
    ])
    progresso=p.data||[]; chavesPessoa=cp.data||[]; atribuidos=a.data||[]
  }
  const sort=(x:any[])=>x.sort((a,b)=>(a.ordem||0)-(b.ordem||0))
  return { blocos:sort(blocos),competencias:sort(competencias),biblioteca,aulas:sort(aulas),questoes:sort(questoes),progresso,chaves:sort(chaves),chavesFuncao,chavesPessoa,termos,atribuidos,historico }
}

export async function fetchAcademiaEquipe() {
  const [vendedores,progresso,blocos,chavesPessoa,chavesFuncao,competencias] = await Promise.all([
    q('vendedores'),q('academia_progresso'),q('academia_blocos'),q('academia_chaves_pessoa'),q('academia_chaves_funcao'),q('academia_competencias')
  ])
  return { vendedores, progresso, blocos: (blocos as any[]).sort((a:any,b:any)=>(a.ordem||0)-(b.ordem||0)), chavesPessoa, chavesFuncao, competencias }
}

export function chaveAtiva(data:AcademiaData, vendedor:Vendedor, codigo:string) {
  const p=data.chavesPessoa.find(x=>x.chave===codigo)
  if (p) return !!p.ativo
  const f=data.chavesFuncao.find(x=>x.funcao===(vendedor.funcao||'vendedor_industria')&&x.chave===codigo)
  return !!f?.ativo
}

export function estadoBloco(data:AcademiaData, bloco:any) {
  const ex=data.progresso.find(p=>p.bloco_id===bloco.id)
  if (ex) return ex.estado
  if (bloco.ordem===1) return 'disponivel'
  const anterior=data.blocos.find(b=>b.ordem===bloco.ordem-1)
  const pa=anterior&&data.progresso.find(p=>p.bloco_id===anterior.id)
  return pa?.estado==='concluido' ? 'disponivel' : 'bloqueado'
}


export async function verificarAcessoAcademia(vendedor:Vendedor) {
  const [{ data:cf },{ data:cp }] = await Promise.all([
    supabase.from('academia_chaves_funcao').select('ativo').eq('funcao',vendedor.funcao||'vendedor_industria').eq('chave','acesso').maybeSingle(),
    supabase.from('academia_chaves_pessoa').select('ativo').eq('vendedor_id',vendedor.id).eq('chave','acesso').maybeSingle()
  ])
  return cp ? !!cp.ativo : !!cf?.ativo
}

export async function logAcademia(entidade:string, acao:string, opts:any={}) {
  const { data: auth } = await supabase.auth.getUser()
  let nome='Sistema', id=null
  if (auth.user?.email) {
    const { data:v } = await supabase.from('vendedores').select('id,nome').eq('email',auth.user.email).maybeSingle()
    nome=v?.nome||auth.user.email; id=v?.id||null
  }
  await supabase.from('academia_historico').insert({ entidade, entidade_id:opts.entidadeId||null, vendedor_id:opts.vendedorId||null, acao, campo:opts.campo||null, valor_anterior:opts.valorAnterior||null, valor_novo:opts.valorNovo||null, alterado_por:id, alterado_por_nome:nome })
}

export async function upsertProgresso(vendedorId:number, blocoId:number, patch:any) {
  const row={ vendedor_id:vendedorId, bloco_id:blocoId, ...patch, ultima_atividade_em:new Date().toISOString() }
  const { error } = await supabase.from('academia_progresso').upsert(row,{onConflict:'vendedor_id,bloco_id'})
  if (error) throw error
}

async function termoExigido(vendedor:Vendedor) {
  const [{ data:cf },{ data:cp }] = await Promise.all([
    supabase.from('academia_chaves_funcao').select('ativo').eq('funcao',vendedor.funcao||'vendedor_industria').eq('chave','termo_exigido').maybeSingle(),
    supabase.from('academia_chaves_pessoa').select('ativo').eq('vendedor_id',vendedor.id).eq('chave','termo_exigido').maybeSingle()
  ])
  return cp ? !!cp.ativo : !!cf?.ativo
}

async function blocoFinal() {
  const { data } = await supabase.from('academia_blocos').select('id,ordem').eq('ativo',true).order('ordem',{ascending:false}).limit(1).maybeSingle()
  return data
}

export async function registrarNotaBloco(vendedor:Vendedor, bloco:any, nota:number, abaixo:any[], notasCompetencias:Record<string,number>={}) {
  const passou=nota>=Number(bloco.nota_corte||70)
  const final=await blocoFinal()
  const ehFinal=final?.id===bloco.id
  let estado=passou?'concluido':'em_reforco'
  let etapa=passou?'concluido':'avaliacao'
  let exigido=false
  if (passou && ehFinal) {
    exigido=await termoExigido(vendedor)
    if (exigido) { estado='em_andamento'; etapa='termo' }
  }
  const agora=new Date().toISOString()
  await upsertProgresso(vendedor.id,bloco.id,{ estado, nota, competencias_abaixo:abaixo, notas_competencias:notasCompetencias, concluido_em:passou&&!exigido?agora:null, etapa_atual:etapa })
  await logAcademia('progresso','avaliacao',{vendedorId:vendedor.id,entidadeId:String(bloco.id),campo:'nota',valorNovo:String(nota)})
  if (passou && ehFinal && !exigido) await supabase.from('vendedores').update({academia_fase:'diagnostico'}).eq('id',vendedor.id)
}

export async function aceitarTermo(vendedor:Vendedor, termo:any) {
  const agora=new Date().toISOString()
  const { error: erroAceite } = await supabase.from('academia_termos_aceites').insert({vendedor_id:vendedor.id,termo_id:termo.id,versao:termo.versao})
  if (erroAceite) throw erroAceite
  await supabase.from('vendedores').update({academia_termo_versao:termo.versao,academia_termo_aceito_em:agora,academia_fase:'diagnostico'}).eq('id',vendedor.id)
  const final=await blocoFinal()
  if (final?.id) await supabase.from('academia_progresso').update({estado:'concluido',etapa_atual:'concluido',concluido_em:agora,ultima_atividade_em:agora}).eq('vendedor_id',vendedor.id).eq('bloco_id',final.id)
  await logAcademia('vendedor','aceite_termo',{vendedorId:vendedor.id,campo:'termo',valorNovo:termo.versao})
}

export async function saveRow(table:string, row:any, actorNote?:string) {
  const clean={...row}; if (!clean.id) delete clean.id; delete clean.created_at; delete clean.updated_at
  let anterior:any=null
  if (row.id) anterior=(await supabase.from(table).select('*').eq('id',row.id).maybeSingle()).data
  const { data: salvo, error } = row.id
    ? await supabase.from(table).update(clean).eq('id',row.id).select().maybeSingle()
    : await supabase.from(table).insert(clean).select().maybeSingle()
  if (error) throw error
  await logAcademia(table,row.id?'edicao':'criacao',{entidadeId:String((salvo as any)?.id||row.id||''),valorAnterior:anterior?JSON.stringify(anterior).slice(0,1000):'',valorNovo:actorNote||row.nome||row.titulo||row.pergunta||row.codigo||JSON.stringify(clean).slice(0,1000)})
  return salvo
}

export async function deleteRow(table:string,id:number) {
  const { error } = await supabase.from(table).delete().eq('id',id)
  if (error) throw error
  await logAcademia(table,'exclusao',{entidadeId:String(id)})
}
