-- Migration: auditoria de mudanças no vendedor_id dos clientes
-- Cria tabela de log e trigger que registra toda alteração de vendedor_id

begin;

create table if not exists public.log_vendedor_cliente (
  id bigserial primary key,
  cliente_id bigint not null references public.clientes(id) on delete cascade,
  vendedor_id_antigo int,
  vendedor_id_novo int,
  alterado_por uuid default auth.uid(),
  alterado_em timestamptz default now()
);

comment on table public.log_vendedor_cliente is 'Auditoria de alterações no vendedor_id dos clientes';

create index if not exists idx_log_vendedor_cliente_cliente_id on public.log_vendedor_cliente(cliente_id);
create index if not exists idx_log_vendedor_cliente_alterado_em on public.log_vendedor_cliente(alterado_em desc);

-- Função que grava no log quando o vendedor_id muda

create or replace function public.fn_log_vendedor_cliente()
returns trigger
language plpgsql
security definer
as $$
begin
  if old.vendedor_id is distinct from new.vendedor_id then
    insert into public.log_vendedor_cliente (
      cliente_id,
      vendedor_id_antigo,
      vendedor_id_novo
    )
    values (
      new.id,
      old.vendedor_id,
      new.vendedor_id
    );
  end if;

  return new;
end;
$$;

-- Trigger que dispara a função em todo UPDATE de vendedor_id

drop trigger if exists trg_log_vendedor_cliente on public.clientes;

create trigger trg_log_vendedor_cliente
after update of vendedor_id on public.clientes
for each row
execute function public.fn_log_vendedor_cliente();

-- Política: só gerentes conseguem ver o log (RLS)

alter table public.log_vendedor_cliente enable row level security;

drop policy if exists log_vendedor_cliente_select_gerente on public.log_vendedor_cliente;

create policy log_vendedor_cliente_select_gerente
on public.log_vendedor_cliente
for select
to authenticated
using (is_gerente());

commit;
