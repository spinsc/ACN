-- Desfaz ponto_p3.sql: tira o ramo do ponto do calendário, a linha da aba e as duas funções. A coluna rh_funcionarios.nao_bate_ponto FICA (tirá-la apagaria as marcas que o RH fez).
-- Os avisos `ponto_dia` que já estiverem na caixa de Avisos são resolvidos como "Sistema" na próxima rodada de `calendario_avisar` (a fonte deixa de existir).
set local lock_timeout = '5s';
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.calendario_eventos_base(date,date)'::regprocedure);
  d := replace(d, E'  union all\n  select * from public.calendario_eventos_ponto(p_inicio, p_fim)\n', E'');
  execute d;
  d := pg_get_functiondef('public.calendario_alvos(date)'::regprocedure);
  d := replace(d, $m$ when 'ponto_dia' then 'rh'$m$, '');
  execute d;
end $do$;
drop function if exists public.calendario_eventos_ponto(date, date);
drop function if exists public.ponto_ocorrencia_do_dia(jsonb, date, date);
