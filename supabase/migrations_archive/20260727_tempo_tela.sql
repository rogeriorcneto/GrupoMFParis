-- Tempo de tela por vendedor (CRM aberto no navegador)
create table if not exists tempo_tela (
  id bigint generated always as identity primary key,
  vendedor_id bigint not null references vendedores(id) on delete cascade,
  inicio timestamp with time zone not null,
  fim timestamp with time zone not null,
  duracao_segundos integer not null check (duracao_segundos >= 0),
  data date not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_tempo_tela_vendedor_data
  on tempo_tela(vendedor_id, data);

create index if not exists idx_tempo_tela_data
  on tempo_tela(data);

-- View agregada para relatório gerencial
-- Mantém compatibilidade; pode ser chamada via RPC se preferir
create or replace view tempo_tela_por_dia as
select
  vendedor_id,
  data,
  count(*) as batimentos,
  sum(duracao_segundos) as total_segundos
from tempo_tela
group by vendedor_id, data;
