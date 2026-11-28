import React, { useEffect, useMemo, useState } from 'react'
import { CheckCircleIcon, LockClosedIcon, PlusIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline'
import { supabase } from '../../lib/supabase'
import { callAI } from '../../lib/gemini'
import { fetchAcademiaData, fetchAcademiaEquipe, chaveAtiva, estadoBloco, upsertProgresso, registrarNotaBloco, aceitarTermo, saveRow, deleteRow, logAcademia, FUNCOES, FASES, ESTADOS, type AcademiaData } from '../../lib/academia'
import type { Vendedor } from '../../types'

const input='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white dark:bg-gray-700 dark:border-gray-600'
const btn='px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium disabled:opacity-50'
const secao='bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4'
const funcaoLabel=(v?:string|null)=>FUNCOES.find(f=>f[0]===v)?.[1]||v||'—'
const arr=(x:any)=>Array.isArray(x)?x:[]
const filtraFuncao=(rows:any[],v:Vendedor)=>rows.filter(r=>!r.funcoes?.length||r.funcoes.includes(v.funcao||'vendedor_industria'))

function useAcademia(vendedorId?:number){
 const [data,setData]=useState<AcademiaData|null>(null);const [loading,setLoading]=useState(true);const [erro,setErro]=useState('')
 const reload=async()=>{setLoading(true);try{setData(await fetchAcademiaData(vendedorId));setErro('')}catch(e:any){setErro(e.message)}finally{setLoading(false)}}
 useEffect(()=>{reload()},[vendedorId])
 return {data,loading,erro,reload}
}

function Crud({titulo,table,rows,campos,reload,extras}:any){
 const [ed,setEd]=useState<any>(null)
 const novo=()=>{const r:any={};if(table!=='academia_biblioteca')r.ativo=true;campos.forEach((c:any)=>r[c.k]=c.def??(c.type==='checkbox'?false:''));setEd(r)}
 async function salvar(){try{const row={...ed};for(const k of ['funcoes','alternativas']){if(typeof row[k]==='string')row[k]=row[k].split(',').map((x:string)=>x.trim()).filter(Boolean)};if(row.funcao==='')row.funcao=null;for(const k of ['bloco_id','competencia_id','biblioteca_id','produto_id']){if(row[k]!==undefined&&row[k]!==''&&row[k]!==null)row[k]=Number(row[k]);if(row[k]==='')row[k]=null};await saveRow(table,row);setEd(null);await reload()}catch(e:any){alert(e.message||'Erro ao salvar')}}
 return <div className={secao}><div className="flex items-center justify-between mb-3"><h3 className="font-semibold">{titulo}</h3><button onClick={novo} className={btn}><PlusIcon className="h-4 w-4 inline"/> Novo</button></div>
 {ed&&<div className="mb-4 p-3 border rounded-lg bg-gray-50 dark:bg-gray-900 grid grid-cols-1 md:grid-cols-2 gap-3">
  {campos.map((c:any)=><label key={c.k} className={c.type==='textarea'?'md:col-span-2':''}><span className="text-xs text-gray-500">{c.label}</span>{c.type==='checkbox'?<input type="checkbox" checked={!!ed[c.k]} onChange={e=>setEd({...ed,[c.k]:e.target.checked})} className="ml-2"/>:c.type==='textarea'?<textarea className={input} rows={4} value={ed[c.k]||''} onChange={e=>setEd({...ed,[c.k]:e.target.value})}/>:c.options?<select className={input} value={Array.isArray(ed[c.k])?ed[c.k].join(', '):(ed[c.k]??'')} onChange={e=>setEd({...ed,[c.k]:e.target.value})}><option value="">—</option>{c.options.map((o:any)=><option key={o[0]||o} value={o[0]||o}>{o[1]||o}</option>)}</select>:<input className={input} type={c.type||'text'} value={Array.isArray(ed[c.k])?ed[c.k].join(', '):(ed[c.k]??'')} onChange={e=>setEd({...ed,[c.k]:c.type==='number'?Number(e.target.value):e.target.value})}/>}</label>)}
  <div className="md:col-span-2 flex gap-2"><button className={btn} onClick={salvar}>Salvar</button><button className="px-3 py-2 border rounded-lg" onClick={()=>setEd(null)}>Cancelar</button></div>
 </div>}
 <div className="space-y-2">{rows.map((r:any)=><div key={r.id||r.codigo} className="flex items-center gap-2 border rounded-lg p-2 text-sm"><div className="flex-1"><b>{r.nome||r.titulo||r.pergunta||r.codigo}</b><p className="text-xs text-gray-500">{Object.entries(r).filter(([k,v])=>!['id','created_at','updated_at'].includes(k)&&typeof v!=='object').map(([k,v])=>`${k}: ${v}`).slice(0,5).join(' · ')}</p></div><button onClick={()=>setEd({...r})} className="p-2 text-blue-600"><PencilIcon className="h-4 w-4"/></button>{r.id&&<button onClick={async()=>{if(confirm('Excluir?')){await deleteRow(table,r.id);await reload()}}} className="p-2 text-red-600"><TrashIcon className="h-4 w-4"/></button>}</div>)}</div>{extras}</div>
}

function AulaCard({aula,data}:{aula:any,data:AcademiaData}){
 const [explicacao,setExplicacao]=useState('');const [carregando,setCarregando]=useState(false)
 const bib=data.biblioteca.find(x=>String(x.id)===String(aula.biblioteca_id))
 const fonte=bib?.status==='aprovado'?(bib.conteudo||bib.url||''):''
 async function explicar(){
  setCarregando(true)
  try{
   if(!fonte){setExplicacao('Não posso confirmar esta informação porque ela ainda não está em um item aprovado da Biblioteca.');return}
   const resp=await callAI([{role:'user',content:`Explique esta aula em até 5 linhas, com linguagem simples e exemplo prático. Título: ${aula.titulo}\nConteúdo aprovado:\n${fonte}`}],'Você é o professor IA da Academia MF Paris. Use somente o conteúdo aprovado enviado. Se algo não estiver no conteúdo, diga que não pode confirmar. Nunca invente composição, rendimento, preço, prazo ou condição.')
   setExplicacao(resp)
  }catch{setExplicacao('Não foi possível gerar a explicação agora.')}finally{setCarregando(false)}
 }
 return <div className="border rounded-lg p-3 space-y-2"><b>{aula.titulo}</b>{aula.conteudo&&<p className="text-sm whitespace-pre-wrap mt-1">{aula.conteudo}</p>}{bib&&<p className="text-xs text-gray-500">Fonte da Biblioteca: {bib.titulo} · status {bib.status} {bib.url&&<a className="text-primary-600 underline ml-2" target="_blank" href={bib.url}>abrir material</a>}</p>}<button className="px-3 py-1.5 border rounded-lg text-sm" onClick={explicar} disabled={carregando}>{carregando?'Gerando...':'Explicação do professor IA'}</button>{explicacao&&<p className="text-sm whitespace-pre-wrap border-l-4 border-primary-200 pl-3">{explicacao}</p>}</div>
}

export function AcademiaInicio({vendedor,irTreinar,totalTreinos=0,minutosTotais=0}:{vendedor:Vendedor,irTreinar:()=>void,totalTreinos?:number,minutosTotais?:number}){
 const {data,loading,erro,reload}=useAcademia(vendedor.id);const [blocoSel,setBlocoSel]=useState<any>(null);const [resp,setResp]=useState<Record<number,string>>({})
 const blocoAtual=useMemo(()=>data?.blocos.find(b=>['disponivel','em_andamento','em_reforco'].includes(estadoBloco(data,b)))||data?.blocos[data.blocos.length-1],[data])
 if(loading)return <div className="p-8 text-center text-gray-500">Carregando Academia...</div>
 if(erro)return <div className="p-8 text-center text-red-600">{erro}</div>
 if(!data)return null
 if(!chaveAtiva(data,vendedor,'acesso'))return <div className="p-8 text-center text-gray-500">Seu acesso à Academia está desativado.</div>
 const aberto=blocoSel||blocoAtual
 const prog=aberto?data.progresso.find(p=>p.bloco_id===aberto.id):null
 const etapa=prog?.etapa_atual||'aulas'
 const aulas=filtraFuncao(data.aulas.filter(a=>a.bloco_id===aberto?.id&&a.ativo),vendedor)
 const questoes=filtraFuncao(data.questoes.filter(q=>q.bloco_id===aberto?.id&&q.ativo&&(q.tipo===(etapa==='quiz'?'quiz':'avaliacao')||etapa!=='quiz'&&etapa!=='avaliacao')),vendedor)
 const termo=data.termos.find(t=>t.ativo&&t.vinculo===(vendedor.vinculo||'clt')&&(!t.funcao||t.funcao===vendedor.funcao))
 async function concluirEtapa(nova:string){if(!aberto)return;await upsertProgresso(vendedor.id,aberto.id,{estado:'em_andamento',etapa_atual:nova,iniciado_em:prog?.iniciado_em||new Date().toISOString()});await reload()}
 async function avaliar(tipo:string){
  const qs=filtraFuncao(data!.questoes.filter(q=>q.bloco_id===aberto.id&&q.ativo&&q.tipo===tipo),vendedor)
  if(!qs.length)return alert('Nenhuma questão cadastrada.')
  const faltam=qs.filter(q=>!resp[q.id])
  if(faltam.length)return alert(`Responda todas as questões antes de enviar. Faltam ${faltam.length}.`)
  let acertos=0;const abaixo:any[]=[];const porComp:Record<string,{total:number,acertos:number}>= {}
  qs.forEach(q=>{
   const norm=(x:any)=>String(x||'').trim().toLowerCase();const ok=norm(resp[q.id])===norm(q.resposta_correta);const comp=String(q.competencia_id||'sem_competencia')
   if(!porComp[comp])porComp[comp]={total:0,acertos:0}
   porComp[comp].total++
   if(ok){acertos++;porComp[comp].acertos++}else abaixo.push({competencia_id:q.competencia_id,competencia:data!.competencias.find(c=>String(c.id)===String(q.competencia_id))?.nome||'Competência não informada',pergunta:q.pergunta})
  })
  const notasCompetencias:Record<string,number>={};Object.entries(porComp).forEach(([k,v])=>{notasCompetencias[k]=Math.round(v.acertos/v.total*100)})
  const nota=Math.round(acertos/qs.length*100)
  if(tipo==='quiz'){alert('Nota do quiz: '+nota);await concluirEtapa('avaliacao')}
  else{await registrarNotaBloco(vendedor,aberto,nota,abaixo,notasCompetencias);await reload()}
 }
 return <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 space-y-5">
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
   <div className={secao+' lg:col-span-2'}><p className="text-xs text-gray-500">Fase atual</p><h2 className="text-xl font-bold">{FASES[vendedor.academiaFase||'reciclagem']||'Reciclagem'}: bloco {blocoAtual?.ordem||1} de {data.blocos.length}</h2><p className="text-sm text-gray-500 mt-1">Próxima ação: {etapa==='aulas'?'assistir/ler aulas':etapa==='pratica'?'praticar no Treinar/Ligar':etapa==='quiz'?'responder quiz':etapa==='avaliacao'?'fazer avaliação final':etapa==='termo'?'aceitar termo de responsabilidade':'trilha concluída'}</p>{aberto&&<button className={btn+' mt-3'} onClick={()=>setBlocoSel(aberto)}>Continuar trilha</button>}</div>
   <div className={secao}><p className="text-xs text-gray-500">Pendências</p><ul className="text-sm mt-2 space-y-1">{chaveAtiva(data,vendedor,'cobranca_inicio')&&data.progresso.filter(p=>p.estado==='em_reforco').map(p=><li key={p.id}>• Avaliação em reforço</li>)}{chaveAtiva(data,vendedor,'treino_atribuido')&&data.atribuidos.filter(a=>a.status==='pendente').map(a=><li key={a.id}>• Treino atribuído: {a.titulo}</li>)}{blocoAtual?.ordem===8&&!vendedor.academiaTermoAceitoEm&&<li>• Termo de responsabilidade</li>}</ul></div>
  </div>
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{data.blocos.map(b=>{const est=estadoBloco(data,b);const p=data.progresso.find(x=>x.bloco_id===b.id);return <button key={b.id} disabled={est==='bloqueado'} onClick={()=>setBlocoSel(b)} className={`p-4 rounded-xl border text-left bg-white dark:bg-gray-800 disabled:opacity-50 ${aberto?.id===b.id?'border-primary-500':'border-gray-200 dark:border-gray-700'}`}><div className="flex justify-between gap-2"><b className="text-sm">{b.ordem}. {b.nome}</b>{est==='bloqueado'?<LockClosedIcon className="h-4 w-4"/>:est==='concluido'?<CheckCircleIcon className="h-4 w-4 text-green-600"/>:null}</div><p className="text-xs text-gray-500 mt-1">{ESTADOS[est]}{p?.nota!=null?` · nota ${p.nota}`:''}</p></button>})}</div>
  {aberto&&estadoBloco(data,aberto)!=='bloqueado'&&<div className={secao}><h3 className="font-bold text-lg">{aberto.nome}</h3>
   {etapa==='aulas'&&<div className="space-y-3 mt-3">{aulas.map(a=><AulaCard key={a.id} aula={a} data={data}/>)}{!aulas.length&&<p className="text-sm text-gray-500">Nenhuma aula cadastrada para sua função neste bloco.</p>}<button className={btn} onClick={()=>concluirEtapa('pratica')}>Concluir aulas</button></div>}
   {etapa==='pratica'&&<div className="mt-3 space-y-3"><p className="text-sm">Prática do bloco: use o Treinar/Ligar atual com o tema <b>{aberto.nome}</b>.</p><button className={btn} onClick={irTreinar}>Abrir Treinar/Ligar</button><button className={btn+' ml-2'} onClick={()=>concluirEtapa('quiz')}>Ir para o quiz</button></div>}
   {(etapa==='quiz'||etapa==='avaliacao')&&<div className="mt-3 space-y-4">{questoes.filter(q=>q.tipo===etapa).map(q=><div key={q.id} className="border rounded-lg p-3"><p className="font-medium">{q.pergunta}</p><div className="mt-2 space-y-1">{arr(q.alternativas).map((a:string)=><label key={a} className="block text-sm"><input type="radio" className="mr-2" checked={resp[q.id]===a} onChange={()=>setResp({...resp,[q.id]:a})}/>{a}</label>)}</div></div>)}{!questoes.filter(q=>q.tipo===etapa).length&&<p className="text-sm text-gray-500">Nenhuma questão cadastrada nesta etapa.</p>}<button className={btn} onClick={()=>avaliar(etapa)}>Enviar {etapa==='quiz'?'quiz':'avaliação'}</button></div>}
   {etapa==='concluido'&&<div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">Bloco concluído{prog?.nota!=null?` com nota ${prog.nota}`:''}{prog?.concluido_em?` em ${new Date(prog.concluido_em).toLocaleDateString('pt-BR')}`:''}.</div>}
   {prog?.estado==='em_reforco'&&<div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">Bloco em reforço. Competências abaixo: {arr(prog.competencias_abaixo).map((x:any)=>x.competencia||x.competencia_id).join(', ')||'não detalhadas'}. Revise e tente novamente.</div>}
   {(etapa==='termo'||(aberto.ordem===8&&prog?.estado==='concluido'))&&chaveAtiva(data,vendedor,'termo_exigido')&&!vendedor.academiaTermoAceitoEm&&<div className="mt-4 p-4 border rounded-xl"><h4 className="font-semibold">Termo de responsabilidade</h4>{termo?<><a className="text-primary-600 text-sm underline" target="_blank" href={termo.pdf_url}>Abrir PDF do termo {termo.versao}</a><br/><button className={btn+' mt-3'} onClick={async()=>{await aceitarTermo(vendedor,termo);location.reload()}}>Li e aceito o termo</button></>:<p className="text-sm text-red-600">Nenhum termo ativo cadastrado.</p>}</div>}
  </div>}
  <div className="grid grid-cols-2 gap-3"><div className={secao}><p className="text-xs text-gray-500">Treinos</p><p className="text-xl font-bold">{totalTreinos}</p></div><div className={secao}><p className="text-xs text-gray-500">Minutos treinados</p><p className="text-xl font-bold">{minutosTotais}</p></div></div>
 </div>
}

export function AcademiaBiblioteca({canEdit=false}:{canEdit?:boolean}){
 const {data,loading,erro,reload}=useAcademia()
 const [busca,setBusca]=useState('')
 const [sec,setSec]=useState('')
 const [seg,setSeg]=useState('')
 const [tipo,setTipo]=useState('')
 if(loading)return <div className="p-8 text-center text-gray-500">Carregando Biblioteca...</div>
 if(erro)return <div className="p-8 text-center text-red-600">{erro}</div>
 if(!data)return null
 const base=canEdit?data.biblioteca:data.biblioteca.filter(x=>x.status==='aprovado')
 const rows=base.filter(x=>JSON.stringify(x).toLowerCase().includes(busca.toLowerCase())&&(!sec||x.secao===sec)&&(!seg||x.segmento===seg)&&(!tipo||x.tipo===tipo))
 const segs=Array.from(new Set(base.map(x=>x.segmento).filter(Boolean)))
 const secoes=['Empresa','Produtos','Processo do cliente','Concorrentes','Canais','Políticas e procedimentos','Calculadoras']
 const campos=[{k:'titulo',label:'Título'},{k:'secao',label:'Seção',options:secoes},{k:'segmento',label:'Segmento'},{k:'tipo',label:'Tipo',options:['texto','pdf','video','link']},{k:'url',label:'URL'},{k:'responsavel',label:'Responsável'},{k:'status',label:'Status',options:['rascunho','aprovado','vencido'],def:'rascunho'},{k:'interno',label:'Interno',type:'checkbox'},{k:'conteudo',label:'Conteúdo',type:'textarea'}]
 return <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 space-y-4">
  <div><h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Biblioteca</h2><p className="text-sm text-gray-500">{canEdit?'Cadastre, revise e aprove o conteúdo que alimenta a IA.':'Somente conteúdo aprovado aparece nesta visão.'}</p></div>
  <div className="grid grid-cols-1 md:grid-cols-4 gap-2"><input className={input} placeholder="Buscar na Biblioteca" value={busca} onChange={e=>setBusca(e.target.value)}/><select className={input} value={sec} onChange={e=>setSec(e.target.value)}><option value="">Todas as seções</option>{secoes.map(x=><option key={x}>{x}</option>)}</select><select className={input} value={seg} onChange={e=>setSeg(e.target.value)}><option value="">Todos os segmentos</option>{segs.map((x:any)=><option key={x}>{x}</option>)}</select><select className={input} value={tipo} onChange={e=>setTipo(e.target.value)}><option value="">Todos os tipos</option>{['texto','pdf','video','link'].map(x=><option key={x}>{x}</option>)}</select></div>
  {canEdit?<Crud titulo="Itens da Biblioteca" table="academia_biblioteca" rows={rows} reload={reload} campos={campos}/>:<div className="grid grid-cols-1 md:grid-cols-2 gap-3">{rows.map((r:any)=><div key={r.id} className={secao}><div className="flex flex-wrap items-center gap-2"><b>{r.titulo}</b><span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Aprovado</span>{r.interno&&<span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Interno</span>}</div><p className="text-xs text-gray-500 mt-1">{r.secao}{r.segmento?` · ${r.segmento}`:''} · {r.tipo}{r.responsavel?` · ${r.responsavel}`:''}</p>{r.conteudo&&<p className="text-sm whitespace-pre-wrap mt-2">{r.conteudo}</p>}{r.url&&<a href={r.url} target="_blank" className="inline-block mt-2 text-sm text-primary-600 underline">Abrir material</a>}</div>)}{!rows.length&&<div className={secao+' md:col-span-2 text-center text-gray-500'}>Nenhum conteúdo aprovado encontrado.</div>}</div>}
 </div>
}

function blocoAtualEquipe(v:any,blocos:any[],progresso:any[]){
 const ps=progresso.filter(p=>p.vendedor_id===v.id)
 for(const b of blocos){
  const p=ps.find(x=>x.bloco_id===b.id)
  if(!p){
   const ant=blocos.find(x=>x.ordem===b.ordem-1);const pa=ant&&ps.find(x=>x.bloco_id===ant.id)
   if(b.ordem===1||pa?.estado==='concluido')return {bloco:b,prog:null,estado:'disponivel'}
   return {bloco:b,prog:null,estado:'bloqueado'}
  }
  if(p.estado!=='concluido')return {bloco:b,prog:p,estado:p.estado}
 }
 const ult=blocos[blocos.length-1]
 return {bloco:ult,prog:ps.find(x=>x.bloco_id===ult?.id),estado:'concluido'}
}

export function AcademiaGerenteTrilha(){
 const [d,setD]=useState<any>(null);const [atras,setAtras]=useState(false);const [aberto,setAberto]=useState<number|null>(null)
 const load=()=>fetchAcademiaEquipe().then(setD);useEffect(()=>{load()},[])
 if(!d)return <div className="p-8 text-center">Carregando...</div>
 const rows=d.vendedores.filter((v:any)=>v.ativo).map((v:any)=>{
  const ps=d.progresso.filter((p:any)=>p.vendedor_id===v.id)
  const atual=blocoAtualEquipe(v,d.blocos,d.progresso)
  const excecao=d.chavesPessoa.find((x:any)=>x.vendedor_id===v.id&&x.chave==='alerta_atraso')
  const padrao=d.chavesFuncao.find((x:any)=>x.funcao===(v.funcao||'vendedor_industria')&&x.chave==='alerta_atraso')
  const alerta=excecao?!!excecao.ativo:!!padrao?.ativo
  const ini=atual.prog?.iniciado_em?new Date(atual.prog.iniciado_em).getTime():null
  const atrasado=!!(alerta&&ini&&atual.bloco?.prazo_dias&&(Date.now()-ini)>atual.bloco.prazo_dias*86400000&&atual.estado!=='concluido')
  const porComp:Record<string,number[]>={}
  ps.forEach((p:any)=>Object.entries(p.notas_competencias||{}).forEach(([k,val])=>{(porComp[k] ||= []).push(Number(val))}))
  const comp=Object.entries(porComp).map(([k,vals])=>{const c=d.competencias.find((x:any)=>String(x.id)===k);return {id:k,nota:Math.round(vals.reduce((x,y)=>x+y,0)/vals.length),nome:c?`${c.grupo} — ${c.nome}`:'Sem competência'}})
  const ultima=ps.map((p:any)=>p.ultima_atividade_em).filter(Boolean).sort().reverse()[0]
  return {v,atual,atrasado,comp,ultima,ps}
 }).filter((r:any)=>!atras||r.atrasado)
 async function acao(tipo:string,v:any,bloco:any){
  try{
   if(tipo==='reabrir'){await upsertProgresso(v.id,bloco.id,{estado:'disponivel',etapa_atual:'aulas',nota:null,concluido_em:null});await logAcademia('progresso','reabrir_bloco',{vendedorId:v.id,entidadeId:String(bloco.id),campo:'estado',valorAnterior:'concluido',valorNovo:'disponivel'})}
   if(tipo==='treino'){const titulo=prompt('Treino a atribuir:');if(titulo){await supabase.from('academia_treinos_atribuidos').insert({vendedor_id:v.id,titulo});await logAcademia('treino_atribuido','atribuir',{vendedorId:v.id,valorNovo:titulo})}}
   if(tipo==='um'){const texto=prompt('Registro do 1:1:');if(texto){await supabase.from('academia_um_a_um').insert({vendedor_id:v.id,texto});await logAcademia('um_a_um','registro',{vendedorId:v.id,valorNovo:texto.slice(0,200)})}}
   await load()
  }catch(e:any){alert(e.message||'Erro ao executar ação')}
 }
 return <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Acompanhamento da trilha</h2><p className="text-sm text-gray-500">Progresso, notas e ações gerenciais da equipe.</p></div><label className="text-sm"><input type="checkbox" className="mr-2" checked={atras} onChange={e=>setAtras(e.target.checked)}/>Mostrar só atrasados</label></div>
  <div className={secao}><div className="overflow-auto"><table className="w-full text-sm min-w-[900px]"><thead><tr className="text-left text-xs text-gray-500"><th className="py-2">Vendedor</th><th>Função</th><th>Fase</th><th>Bloco atual</th><th>Estado</th><th>Nota</th><th>Última atividade</th><th>Ações</th></tr></thead><tbody>{rows.map((r:any)=><React.Fragment key={r.v.id}>
   <tr className="border-t"><td className="py-2"><button className="font-medium text-primary-700" onClick={()=>setAberto(aberto===r.v.id?null:r.v.id)}>{r.v.nome}</button></td><td>{funcaoLabel(r.v.funcao)}</td><td>{FASES[r.v.academia_fase||'reciclagem']}</td><td>{r.atual.bloco?.ordem}. {r.atual.bloco?.nome}</td><td>{ESTADOS[r.atual.estado]}{r.atrasado?' · atrasado':''}</td><td>{r.atual.prog?.nota??'—'}</td><td>{r.ultima?new Date(r.ultima).toLocaleDateString('pt-BR'):'—'}</td><td className="space-x-2 whitespace-nowrap"><button className="text-blue-600" onClick={()=>acao('reabrir',r.v,r.atual.bloco)}>Reabrir</button><button className="text-blue-600" onClick={()=>acao('treino',r.v,r.atual.bloco)}>Atribuir treino</button><button className="text-blue-600" onClick={()=>acao('um',r.v,r.atual.bloco)}>1:1</button></td></tr>
   {aberto===r.v.id&&<tr className="border-t bg-gray-50 dark:bg-gray-900"><td colSpan={8} className="p-3"><div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div><p className="text-xs font-semibold text-gray-500 mb-1">Notas por bloco</p><div className="flex flex-wrap gap-2">{d.blocos.map((b:any)=>{const p=r.ps.find((x:any)=>x.bloco_id===b.id);return <span key={b.id} className="text-xs px-2 py-1 rounded-full border">{b.ordem}. {p?.nota??'—'}</span>})}</div></div><div><p className="text-xs font-semibold text-gray-500 mb-1">Notas por competência</p>{r.comp.length?<div className="flex flex-wrap gap-2">{r.comp.map((c:any)=><span key={c.id} className="text-xs px-2 py-1 rounded-full border">{c.nome}: {c.nota}</span>)}</div>:<p className="text-xs text-gray-400">Sem avaliações com competência registradas.</p>}</div></div></td></tr>}
  </React.Fragment>)}</tbody></table></div></div>
 </div>
}

export function AcademiaConfigRodada1({vendedores}:{vendedores:Vendedor[]}){
 const {data,reload}=useAcademia();const [pessoa,setPessoa]=useState('')
 if(!data)return <div className="p-8 text-center">Carregando...</div>
 async function chaveFuncao(f:string,c:string,atual:boolean){await supabase.from('academia_chaves_funcao').upsert({funcao:f,chave:c,ativo:!atual});await logAcademia('chaves','alteracao_chave',{campo:`${f}.${c}`,valorAnterior:String(atual),valorNovo:String(!atual)});await reload()}
 async function chavePessoa(v:number,c:string,atual:boolean|undefined){if(atual===undefined)await supabase.from('academia_chaves_pessoa').insert({vendedor_id:v,chave:c,ativo:true});else if(atual)await supabase.from('academia_chaves_pessoa').upsert({vendedor_id:v,chave:c,ativo:false});else await supabase.from('academia_chaves_pessoa').delete().eq('vendedor_id',v).eq('chave',c);await logAcademia('chaves','excecao_pessoa',{vendedorId:v,campo:c});await reload()}
 const comum=(rows:any,table:string,titulo:string,campos:any[])=><Crud titulo={titulo} table={table} rows={rows} reload={reload} campos={campos}/>
 return <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 space-y-5">
  {comum(data.competencias,'academia_competencias','Competências',[{k:'grupo',label:'Grupo'},{k:'nome',label:'Nome'},{k:'ordem',label:'Ordem',type:'number'},{k:'ativo',label:'Ativo',type:'checkbox',def:true}])}
  {comum(data.biblioteca,'academia_biblioteca','Biblioteca — conteúdo e aprovação',[{k:'titulo',label:'Título'},{k:'secao',label:'Seção',options:['Empresa','Produtos','Processo do cliente','Concorrentes','Canais','Políticas e procedimentos','Calculadoras']},{k:'segmento',label:'Segmento'},{k:'tipo',label:'Tipo',options:['texto','pdf','video','link']},{k:'url',label:'URL'},{k:'responsavel',label:'Responsável'},{k:'status',label:'Status',options:['rascunho','aprovado','vencido'],def:'rascunho'},{k:'interno',label:'Interno',type:'checkbox'},{k:'conteudo',label:'Conteúdo',type:'textarea'}])}
  {comum(data.blocos,'academia_blocos','Blocos da trilha',[{k:'ordem',label:'Ordem',type:'number'},{k:'nome',label:'Nome'},{k:'nota_corte',label:'Nota de corte',type:'number',def:70},{k:'prazo_dias',label:'Prazo em dias',type:'number'},{k:'ativo',label:'Ativo',type:'checkbox',def:true}])}
  {comum(data.aulas,'academia_aulas','Aulas',[{k:'bloco_id',label:'Bloco',options:data.blocos.map((b:any)=>[String(b.id),`${b.ordem}. ${b.nome}`])},{k:'titulo',label:'Título'},{k:'biblioteca_id',label:'Item da Biblioteca',options:data.biblioteca.map((b:any)=>[String(b.id),b.titulo])},{k:'tipo',label:'Tipo',options:['texto','pdf','video','link']},{k:'funcoes',label:'Funções JSON/vírgula'},{k:'ordem',label:'Ordem',type:'number'},{k:'ativo',label:'Ativo',type:'checkbox',def:true},{k:'conteudo',label:'Conteúdo',type:'textarea'}])}
  {comum(data.questoes,'academia_questoes','Questões',[{k:'bloco_id',label:'Bloco',options:data.blocos.map((b:any)=>[String(b.id),`${b.ordem}. ${b.nome}`])},{k:'tipo',label:'Tipo',options:['quiz','avaliacao']},{k:'competencia_id',label:'Competência',options:data.competencias.map((c:any)=>[String(c.id),`${c.grupo} — ${c.nome}`])},{k:'pergunta',label:'Pergunta',type:'textarea'},{k:'alternativas',label:'Alternativas JSON'},{k:'resposta_correta',label:'Resposta correta'},{k:'funcoes',label:'Funções'},{k:'ordem',label:'Ordem',type:'number'},{k:'ativo',label:'Ativo',type:'checkbox',def:true}])}
  {comum(data.termos,'academia_termos','Termos de responsabilidade',[{k:'vinculo',label:'Vínculo',options:['clt','rca']},{k:'funcao',label:'Função (opcional)',options:FUNCOES.map(f=>[f[0],f[1]])},{k:'versao',label:'Versão'},{k:'pdf_url',label:'URL do PDF'},{k:'ativo',label:'Ativo',type:'checkbox',def:true}])}
  <div className={secao}><h3 className="font-semibold mb-3">Comportamento por função</h3><div className="overflow-auto"><table className="text-xs"><thead><tr><th className="text-left p-1">Chave</th>{FUNCOES.map(f=><th className="p-1" key={f[0]}>{f[1]}</th>)}</tr></thead><tbody>{data.chaves.map(c=><tr key={c.codigo} className="border-t"><td className="p-1">{c.nome}</td>{FUNCOES.map(f=>{const row=data.chavesFuncao.find(x=>x.funcao===f[0]&&x.chave===c.codigo);return <td className="p-1 text-center" key={f[0]}><input type="checkbox" checked={!!row?.ativo} onChange={()=>chaveFuncao(f[0],c.codigo,!!row?.ativo)}/></td>})}</tr>)}</tbody></table></div>
  <h3 className="font-semibold mt-5">Exceções por pessoa</h3><select className={input} value={pessoa} onChange={e=>setPessoa(e.target.value)}><option value="">Escolha o vendedor</option>{vendedores.map(v=><option key={v.id} value={v.id}>{v.nome}</option>)}</select>{pessoa&&<div className="grid md:grid-cols-2 gap-2 mt-3">{data.chaves.map(c=>{const row=data.chavesPessoa.find(x=>x.vendedor_id===Number(pessoa)&&x.chave===c.codigo);return <button key={c.codigo} className="border rounded-lg p-2 text-left text-sm" onClick={()=>chavePessoa(Number(pessoa),c.codigo,row?.ativo)}>{c.nome}: <b>{row?(row.ativo?'Ligada':'Desligada'):'Padrão da função'}</b>{row?' (exceção)':''}</button>})}</div>}</div>
  <div className={secao}><h3 className="font-semibold mb-3">Perfis e permissões</h3><div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm"><div className="border rounded-lg p-3"><b>Vendedor</b><p className="text-xs text-gray-500 mt-1">Acessa Início, trilha, Biblioteca aprovada, Treinar/Ligar, Quiz e próprio histórico.</p></div><div className="border rounded-lg p-3"><b>Tutor</b><p className="text-xs text-gray-500 mt-1">Cadastrado na ficha do vendedor; acompanhamento operacional nesta rodada.</p></div><div className="border rounded-lg p-3"><b>Gerente/supervisor</b><p className="text-xs text-gray-500 mt-1">Acompanha equipe, reabre blocos, atribui treinos e registra 1:1.</p></div><div className="border rounded-lg p-3"><b>Administrador</b><p className="text-xs text-gray-500 mt-1">Cargo gerente no CRM atual; edita esta Configuração.</p></div></div></div>
  <div className={secao}><h3 className="font-semibold mb-2">Histórico de alterações</h3><div className="max-h-72 overflow-auto space-y-1">{data.historico.sort((a,b)=>b.alterado_em.localeCompare(a.alterado_em)).map(h=><p key={h.id} className="text-xs text-gray-600">{new Date(h.alterado_em).toLocaleString('pt-BR')} · {h.alterado_por_nome} · {h.entidade} · {h.acao} · {h.campo||''}{h.valor_anterior||h.valor_novo?` · ${h.valor_anterior||'—'} → ${h.valor_novo||'—'}`:''}</p>)}</div></div>
 </div>
}
