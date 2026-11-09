-- Tela Início: quem edita volta a ser o Admin e quem recebeu a marca no cadastro (09/11/2026, decisão final do usuário).
--
-- Por que existe: na manhã de 09/11/2026 o usuário escolheu "uma marca no cadastro de usuários" (inicio_carrossel.sql, seção 2). Minutos depois pensou em "só o perfil RH e o Admin"
-- e a função foi trocada (migração inicio_carrossel_somente_rh_e_admin, de poucos minutos de vida, sem nenhum slide postado nesse intervalo). Em seguida ele voltou atrás:
-- "todos podem ver a tela Início; editar somente os Admins e quem receber a permissão lá no Admin". Este arquivo devolve o corpo da função ao que ele era, igual ao da seção 2 de inicio_carrossel.sql.
-- As regras das duas tabelas (inicio_slides, inicio_datas) e do bucket acn-inicio já chamam `pode_postar_inicio()`: trocar o corpo basta, nenhuma política é refeita.
-- Ler continua aberto a todo usuário que entrou. A coluna `auth_usuarios.pode_postar_inicio` (nasce falsa para todos) é a marca que o Admin liga em Admin → Usuários.
-- Nenhuma linha de dado foi alterada. O perfil RH sozinho NÃO dá o direito: o RH pede ao Admin a caixa "Pode postar na tela Início".
create or replace function public.pode_postar_inicio()
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  select coalesce((select u.perfil = 'Admin' or coalesce(u.pode_postar_inicio, false)
                   from public.auth_usuarios u where u.auth_id = auth.uid() and coalesce(u.ativo, false) limit 1), false);
$f$;
revoke all on function public.pode_postar_inicio() from public, anon;
grant execute on function public.pode_postar_inicio() to authenticated;
