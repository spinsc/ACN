-- Plano "toda pessoa por ID", etapa U4 (parte do banco) — 24/11/2026.
-- Quem grava um nome ANTIGO de um usuario (uma sessao que ficou aberta durante um renome, ou um nome curto digitado) tinha o ID achado pelo apelido, mas o TEXTO
-- ficava como foi escrito (o nome velho voltava para a coluna). Agora, quando o nome escrito e de um USUARIO do sistema, o texto gravado e o nome ATUAL dele
-- (decisao do usuario em 24/11/2026: "o historico mostra sempre o nome atual pelo ID"). Pessoa so do RH (sem usuario), e-mail e sistema nao mudam.
-- So `create or replace` de uma funcao estavel (nenhuma tabela e travada). Desfazer: usuarios_por_id_u4_banco_reverter.sql.
set local lock_timeout = '5s';

do $do$
declare d text; o text; n text;
begin
  d := pg_get_functiondef('public.pessoa_sincronizar(boolean,text,text,uuid,uuid,text)'::regprocedure);
  if position('pessoa_nome(c)' in substring(d from position('r := public.pessoa_id_por_texto' in d))) = 0 then
    o := $a$    if r is not null then pid := r;
    elsif$a$;
    n := $a$    if r is not null then
      pid := r;
      if p_kind = 'nome' and position('@' in p_new_txt) = 0 then
        c := public.pessoa_canonica(r);
        if c is not null and exists (select 1 from public.auth_usuarios au where au.id = c) then txt := public.pessoa_nome(c); end if;
      end if;
    elsif$a$;
    if position(o in d) = 0 or (length(d) - length(replace(d, o, ''))) / length(o) <> 1 then raise exception 'pessoa_sincronizar: trecho nao achado ou repetido'; end if;
    d := replace(d, o, n);
    execute d;
  end if;
end $do$;
