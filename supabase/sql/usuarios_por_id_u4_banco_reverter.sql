-- Desfaz usuarios_por_id_u4_banco.sql: o texto gravado volta a ser o que foi escrito (so o ID e achado pelo apelido).
set local lock_timeout = '5s';
do $do$
declare d text; o text; n text;
begin
  d := pg_get_functiondef('public.pessoa_sincronizar(boolean,text,text,uuid,uuid,text)'::regprocedure);
  n := $a$    if r is not null then pid := r;
    elsif$a$;
  o := $a$    if r is not null then
      pid := r;
      if p_kind = 'nome' and position('@' in p_new_txt) = 0 then
        c := public.pessoa_canonica(r);
        if c is not null and exists (select 1 from public.auth_usuarios au where au.id = c) then txt := public.pessoa_nome(c); end if;
      end if;
    elsif$a$;
  d := replace(d, o, n);
  execute d;
end $do$;
