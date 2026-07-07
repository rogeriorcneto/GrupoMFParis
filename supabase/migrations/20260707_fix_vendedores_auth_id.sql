-- ============================================================
-- Corrige inconsistências entre vendedores.auth_id e o usuário
-- real de autenticação (auth.users), causando falha de login
-- em dispositivos sem sessão em cache ("Usuário não encontrado
-- na equipe" após login bem-sucedido no Supabase Auth).
-- ============================================================

-- 1. DIAGNÓSTICO — rode primeiro para ver quais vendedores estão com problema
select
  v.id,
  v.nome,
  v.email,
  v.auth_id as auth_id_atual,
  v.auth_user_id as auth_user_id_legado,
  au.id as auth_users_id_pelo_email
from vendedores v
left join auth.users au on au.email = v.email
where v.auth_id is null
   or v.auth_id <> au.id;

-- 2. CORREÇÃO — sincroniza auth_id usando auth_user_id (coluna legada), quando existir e for válido
update vendedores v
set auth_id = v.auth_user_id
where v.auth_id is null
  and v.auth_user_id is not null
  and exists (select 1 from auth.users au where au.id = v.auth_user_id);

-- 3. CORREÇÃO — para os que ainda ficaram sem auth_id, sincroniza pelo e-mail
update vendedores v
set auth_id = au.id
from auth.users au
where v.auth_id is null
  and au.email = v.email;

-- 4. Verificação final — deve retornar 0 linhas (todos os vendedores com login vinculado corretamente)
select id, nome, email, auth_id
from vendedores
where auth_id is null;
