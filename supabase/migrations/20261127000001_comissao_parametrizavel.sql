-- Item 3 — Comissão parametrizável por produto, tabela de preço e tipo de vendedor (CLT/RCA)
-- Não traz valores preenchidos: o gestor cadastra os percentuais em Parâmetros.

-- Tipo do vendedor: CLT ou RCA (a comissão de cada tipo é diferente)
alter table public.vendedores
  add column if not exists tipo_comissao text;

comment on column public.vendedores.tipo_comissao is 'clt | rca — define a coluna de comissão aplicada ao vendedor';

-- Percentuais de comissão por produto (4 colunas editáveis pelo gestor)
create table if not exists public.comissao_produtos (
  produto_id bigint primary key references public.produtos(id) on delete cascade,
  pct_a_clt numeric,
  pct_b_clt numeric,
  pct_a_rca numeric,
  pct_b_rca numeric,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

-- Auditoria: quem alterou, quando, valor antigo e novo
create table if not exists public.comissao_produtos_log (
  id bigint generated always as identity primary key,
  produto_id bigint not null,
  campo text not null,
  valor_antigo numeric,
  valor_novo numeric,
  alterado_por text,
  alterado_em timestamptz not null default now()
);

-- Snapshot da comissão no item do pedido: pedido confirmado mantém o percentual da época
alter table public.itens_pedido
  add column if not exists comissao_pct numeric,
  add column if not exists comissao_calculada_em timestamptz;

-- RLS
alter table public.comissao_produtos enable row level security;
alter table public.comissao_produtos_log enable row level security;

create policy "autenticados_leem_comissao_produtos"
  on public.comissao_produtos for select to authenticated using (true);

create policy "gerentes_editam_comissao_produtos"
  on public.comissao_produtos for all to authenticated
  using (exists (select 1 from public.vendedores where auth_id = auth.uid() and cargo = 'gerente'))
  with check (exists (select 1 from public.vendedores where auth_id = auth.uid() and cargo = 'gerente'));

create policy "autenticados_leem_comissao_log"
  on public.comissao_produtos_log for select to authenticated using (true);

create policy "gerentes_inserem_comissao_log"
  on public.comissao_produtos_log for insert to authenticated
  with check (exists (select 1 from public.vendedores where auth_id = auth.uid() and cargo = 'gerente'));
