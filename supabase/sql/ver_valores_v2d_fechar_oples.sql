-- "Ver valores" no banco, onda V2d (24/11/2026; PLANO_VER_VALORES_NO_BANCO.md, seção 9): FECHAR. Depois desta migração o valor total e a mão de obra
-- da OP só existem em `oples_valores` (que só o Admin e quem tem a caixa "Ver valores" leem); as três colunas de `oples` ficam sempre nulas.
-- ESCRITO, NÃO APLICADO. Pré-requisitos: V2b e V2c publicadas (as telas já leem a tabela nova). Aplicar FORA DO HORÁRIO e só com o OK do usuário.
-- Antes: ensaio de custo (supabase/sql/ensaio_de_custo.sql, com este arquivo no lugar marcado, em grupo pequeno e fora do horário: o ensaio de 24/11 travou o sistema vivo).
-- Depois: conferência com a conta ZZTESTE (sem a caixa) e /saude-banco.
--
-- Como passa a funcionar:
--   * Quem gravar valor nas colunas antigas (o front de hoje faz isso) tem o valor DESVIADO por um gatilho para `oples_valores`, e a coluna fica nula na OP.
--   * Valor nulo na gravação NUNCA apaga o valor guardado (atualização de linha inteira com valor velho/nulo não apaga nada). Para zerar, grave 0.
--   * As marcas tem_mo_adaptacao / tem_mo_serralheria só mudam quando a mão de obra vem preenchida na gravação.
--   * Leituras da OP com `select *` passam a devolver os três campos nulos: quem precisa do valor chama `anexarValoresDasOps` (V2b e V2c).
set local lock_timeout = '3s';

-- 1) cópia de segurança do que está nas colunas antigas AGORA
create table if not exists public.oples_valores_antes_v2d as
  select id, valor_total, valor_mao_de_obra, valor_mao_de_obra_serralheria, now() as copiado_em
    from public.oples
   where valor_total is not null or valor_mao_de_obra is not null or valor_mao_de_obra_serralheria is not null;
alter table public.oples_valores_antes_v2d enable row level security;

-- 2) o espelho da V2a sai ANTES de zerar (senão o zeramento gravaria nulos na tabela nova)
drop trigger if exists oples_espelhar_valores_upd on public.oples;
drop trigger if exists oples_espelhar_valores_ins on public.oples;
drop trigger if exists oples_marcar_mao_de_obra on public.oples;

-- 3) a tabela nova passa a ter, sem exceção, o que estava nas colunas antigas (o espelho já fazia isso; aqui só se garante)
insert into public.oples_valores as v (op_id, valor_total, valor_mao_de_obra, valor_mao_de_obra_serralheria, atualizado_em)
select id, valor_total, valor_mao_de_obra, valor_mao_de_obra_serralheria, now() from public.oples
 where valor_total is not null or valor_mao_de_obra is not null or valor_mao_de_obra_serralheria is not null
on conflict (op_id) do update set
  valor_total = coalesce(v.valor_total, excluded.valor_total),
  valor_mao_de_obra = coalesce(v.valor_mao_de_obra, excluded.valor_mao_de_obra),
  valor_mao_de_obra_serralheria = coalesce(v.valor_mao_de_obra_serralheria, excluded.valor_mao_de_obra_serralheria);

-- 4) o gatilho que desvia: security definer (quem grava a OP pode não ver valores), sem direito para ninguém executar à mão
create or replace function public.oples_desviar_valores()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if new.valor_mao_de_obra is not null then new.tem_mo_adaptacao := new.valor_mao_de_obra > 0; end if;
  if new.valor_mao_de_obra_serralheria is not null then new.tem_mo_serralheria := new.valor_mao_de_obra_serralheria > 0; end if;
  insert into public.oples_valores as v (op_id, valor_total, valor_mao_de_obra, valor_mao_de_obra_serralheria, atualizado_em)
  values (new.id, new.valor_total, new.valor_mao_de_obra, new.valor_mao_de_obra_serralheria, now())
  on conflict (op_id) do update set
    valor_total = coalesce(excluded.valor_total, v.valor_total),
    valor_mao_de_obra = coalesce(excluded.valor_mao_de_obra, v.valor_mao_de_obra),
    valor_mao_de_obra_serralheria = coalesce(excluded.valor_mao_de_obra_serralheria, v.valor_mao_de_obra_serralheria),
    atualizado_em = now();
  new.valor_total := null; new.valor_mao_de_obra := null; new.valor_mao_de_obra_serralheria := null;
  return new;
end;
$function$;
revoke all on function public.oples_desviar_valores() from public, anon, authenticated;
create trigger oples_desviar_valores before insert or update of valor_total, valor_mao_de_obra, valor_mao_de_obra_serralheria on public.oples
  for each row when (new.valor_total is not null or new.valor_mao_de_obra is not null or new.valor_mao_de_obra_serralheria is not null)
  execute function public.oples_desviar_valores();
drop function if exists public.oples_espelhar_valores();
drop function if exists public.oples_marcar_mao_de_obra();

-- 5) zera as colunas antigas (o gatilho acima não dispara: o valor novo é nulo)
update public.oples set valor_total = null, valor_mao_de_obra = null, valor_mao_de_obra_serralheria = null
 where valor_total is not null or valor_mao_de_obra is not null or valor_mao_de_obra_serralheria is not null;

-- 6) conferência: se algo não bate, tudo é desfeito
do $$
declare a int; b int; c int; d numeric; e numeric;
begin
  select count(*) into a from public.oples where valor_total is not null or valor_mao_de_obra is not null or valor_mao_de_obra_serralheria is not null;
  if a <> 0 then raise exception 'V2d: % OPs ainda com valor nas colunas antigas', a; end if;
  select count(*) into b from public.oples_valores_antes_v2d;
  select count(*) into c from public.oples_valores v join public.oples_valores_antes_v2d x on x.id = v.op_id
   where v.valor_total is not distinct from x.valor_total and v.valor_mao_de_obra is not distinct from x.valor_mao_de_obra
     and v.valor_mao_de_obra_serralheria is not distinct from x.valor_mao_de_obra_serralheria;
  if b <> c then raise exception 'V2d: a tabela nova difere da cópia em % de % OPs', b - c, b; end if;
  select coalesce(sum(valor_total),0) into d from public.oples_valores; select coalesce(sum(valor_total),0) into e from public.oples_valores_antes_v2d;
  if d < e then raise exception 'V2d: soma dos valores caiu (% contra %)', d, e; end if;
  if (select count(*) from public.oples where tem_mo_adaptacao) < (select count(*) from public.oples_valores_antes_v2d where coalesce(valor_mao_de_obra,0) > 0)
    then raise exception 'V2d: marcas de mão de obra perdidas'; end if;
end $$;

-- Reverter (devolve os valores às colunas antigas; o front de hoje volta a funcionar, só sem o desvio):
--   drop trigger oples_desviar_valores on public.oples;
--   update public.oples o set valor_total = v.valor_total, valor_mao_de_obra = v.valor_mao_de_obra, valor_mao_de_obra_serralheria = v.valor_mao_de_obra_serralheria
--     from public.oples_valores v where v.op_id = o.id;
--   (e recriar o espelho e o gatilho das marcas pelo arquivo ver_valores_v2a_oples_valores.sql, seções 3 e 4)
