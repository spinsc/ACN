-- Telefones no padrão brasileiro "(51) 98644-0747" / "(51) 3000-0000" (pedido do usuário em 04/11/2026: todo telefone do sistema com
-- máscara de telefone, e os que já estavam gravados reformatados de uma vez).
--
-- Regra (a mesma de src/Telefone.ts): tira o +55 e o zero na frente do DDD; só reformata o que tem 10 ou 11 dígitos, DDD de 11 a 99, celular
-- começando em 9 depois do DDD e fixo não começando em 0 ou 1. Valor com letra ou "@" (e-mail, ramal, nome junto) e número incompleto ficam COMO ESTÃO.
-- NÃO entram: auth_usuarios.whatsapp e crm_contatos.whatsapp (o envio de mensagem espera só dígitos com 55 na frente) e as cópias de segurança
-- (oples_apagadas_*, rh_funcionarios_antes_*). O valor antigo de cada linha mudada fica em telefones_antes_formatacao_20261104 (para desfazer).
-- Os gatilhos das tabelas são desligados durante a troca (nada deles tem a ver com telefone, e alguns mexem em datas), e religados no fim.

create table if not exists public.telefones_antes_formatacao_20261104 (
  tabela text not null, coluna text not null, registro_id text not null, valor_antigo text, feito_em timestamptz not null default now()
);
alter table public.telefones_antes_formatacao_20261104 enable row level security;

create or replace function pg_temp.fmt_tel(x text) returns text language plpgsql immutable as $$
declare d text; n int;
begin
  if x is null or x ~ '[A-Za-z@]' then return null; end if;
  d := regexp_replace(x, '\D', '', 'g');
  d := regexp_replace(d, '^0+', '');
  if length(d) > 11 and left(d,2) = '55' then d := substr(d,3); end if;
  n := length(d);
  if n not in (10,11) then return null; end if;
  if left(d,2)::int < 11 then return null; end if;
  if n = 11 and substr(d,3,1) <> '9' then return null; end if;
  if n = 10 and substr(d,3,1) in ('0','1') then return null; end if;
  if n = 11 then return '(' || left(d,2) || ') ' || substr(d,3,5) || '-' || substr(d,8); end if;
  return '(' || left(d,2) || ') ' || substr(d,3,4) || '-' || substr(d,7);
end $$;

do $$
declare r record; t text;
begin
  foreach t in array array['chamados_suporte','crm_clientes','crm_contatos','crm_oportunidades','garantia_atendimentos','oples','pcp_fretes','rh_funcionarios','sac_ordens_servico','clientes','licitacao_contatos'] loop
    execute format('alter table public.%I disable trigger user', t);
  end loop;

  for r in select * from (values
    ('chamados_suporte','contato_telefone'), ('crm_clientes','telefone'), ('crm_contatos','telefone'), ('crm_oportunidades','contato'),
    ('garantia_atendimentos','cliente_contato'), ('oples','destino_telefone'), ('pcp_fretes','destino_telefone'),
    ('rh_funcionarios','emergencia_telefone'), ('sac_ordens_servico','telefone')) as v(tabela, coluna)
  loop
    execute format('insert into public.telefones_antes_formatacao_20261104 (tabela, coluna, registro_id, valor_antigo) select %L, %L, id::text, %I from public.%I where pg_temp.fmt_tel(%I) is not null and pg_temp.fmt_tel(%I) <> %I',
      r.tabela, r.coluna, r.coluna, r.tabela, r.coluna, r.coluna, r.coluna);
    execute format('update public.%I set %I = pg_temp.fmt_tel(%I) where pg_temp.fmt_tel(%I) is not null and pg_temp.fmt_tel(%I) <> %I',
      r.tabela, r.coluna, r.coluna, r.coluna, r.coluna, r.coluna);
  end loop;

  -- listas de telefones em jsonb: [{ "numero": "...", "tipo": "..." }]
  for r in select * from (values ('clientes'), ('licitacao_contatos')) as v(tabela)
  loop
    execute format($f$insert into public.telefones_antes_formatacao_20261104 (tabela, coluna, registro_id, valor_antigo)
      select %L, 'telefones', id::text, telefones::text from public.%I
      where jsonb_typeof(telefones) = 'array' and exists (select 1 from jsonb_array_elements(telefones) e where pg_temp.fmt_tel(e->>'numero') is not null and pg_temp.fmt_tel(e->>'numero') <> e->>'numero')$f$, r.tabela, r.tabela);
    execute format($f$update public.%I c set telefones = (
        select jsonb_agg(case when pg_temp.fmt_tel(e->>'numero') is not null then jsonb_set(e, '{numero}', to_jsonb(pg_temp.fmt_tel(e->>'numero'))) else e end order by ord)
        from jsonb_array_elements(c.telefones) with ordinality as t(e, ord))
      where jsonb_typeof(c.telefones) = 'array' and exists (select 1 from jsonb_array_elements(c.telefones) e where pg_temp.fmt_tel(e->>'numero') is not null and pg_temp.fmt_tel(e->>'numero') <> e->>'numero')$f$, r.tabela);
  end loop;

  foreach t in array array['chamados_suporte','crm_clientes','crm_contatos','crm_oportunidades','garantia_atendimentos','oples','pcp_fretes','rh_funcionarios','sac_ordens_servico','clientes','licitacao_contatos'] loop
    execute format('alter table public.%I enable trigger user', t);
  end loop;
end $$;
