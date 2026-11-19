-- Avisos do calendário saem de Menções e vão para o painel Avisos; um aviso por licitação; o que a pessoa dispensa não volta (pedido do usuário, 17/11/2026).
--
-- Origem: a Renata (Licitações) via "muitas menções" que não eram menções: eram os avisos da rotina `calendario_avisar` (12/11/2026), um por data de cada
-- licitação aberta, 20 avisos para 9 licitações; ela os marcava como resolvidos e a rotina os recriava no dia útil seguinte (a licitação seguia "Em Andamento"
-- com a data vencida e a rotina só respeitava o "resolvido" do próprio sistema). Decisões do usuário no mesmo dia:
--   1) aviso do calendário não é menção: aparece no painel Avisos (o contexto continua `calendario` na tabela `mencoes`; a tela de Menções passou a ignorá-lo);
--   2) o que a pessoa dispensa ("Já cuidei") não volta mais: o mesmo item na mesma data fica resolvido para ela; só volta se a data do item mudar;
--   3) um aviso por licitação, com texto claro: "Licitação X em andamento com a data vencida (...). Manter atualizada.".
--
-- O que muda aqui (só a rotina, que roda 1 vez por dia útil às 8h; ninguém lê estas funções):
--   calendario_alvos  — a licitação sai agrupada (uma linha por pessoa e licitação, a data é a MAIS RECENTE das vencidas ou de hoje) e vem com `texto_pronto`;
--                       as outras fontes seguem como eram (`texto_pronto` nulo, a rotina monta "Hoje:" / "Atrasado há N dias:" como antes).
--   calendario_avisar — não cria nem renova aviso que a pessoa já dispensou; usa `texto_pronto` quando há.
-- A chave do aviso da licitação passa a ser `licitacao:<id>:<dia>` (antes `licitacao:<id>#<tipo>:<dia>`); os avisos de chave antiga que ainda estão
-- pendentes são resolvidos pela rotina ("Sistema") e substituídos; o que a pessoa já dispensou na chave antiga também vale (a conferência olha o id da licitação
-- e a data, não a forma da chave).
--
-- Para desfazer: reaplicar as definições de `calendario_eventos.sql` (calendario_alvos e calendario_avisar originais); os avisos já gravados continuam válidos.

drop function if exists public.calendario_alvos(date);
create function public.calendario_alvos(p_hoje date)
returns table (usuario_id uuid, usuario_nome text, fonte text, ref_id text, dia date, titulo text, detalhe text, aba_destino text, dias_atraso integer, texto_pronto text)
language sql stable security definer set search_path = public, pg_temp
as $$
  with x as (
    select u.id as uid, u.nome as unome, b.fonte, b.ref_id, b.dia, b.titulo, b.detalhe,
           case b.fonte
             when 'crm_retorno' then 'crm' when 'crm_limite' then 'crm' when 'op_entrega' then 'crm' when 'telecom_retorno' then 'telecom'
             when 'licitacao' then 'licitacoes' when 'demanda_avulsa' then 'ajustes' when 'demanda_etapa' then 'ajustes' when 'sac_prazo' then 'sac' when 'sac_chegada_veiculo' then 'sac'
             when 'desenvolvimento_etapa' then 'engenharia'
             when 'op_chegada_veiculo' then 'almoxarifado'
             when 'vistoria_retorno' then 'vistorias' when 'compra_entrega' then 'compras' when 'tarefa_financeiro' then 'financeiro' when 'agendamento' then 'producao'
             else 'calendario' end as aba,
           (p_hoje - b.dia) as atraso,
           array_position(array['esclarecimentos', 'proposta', 'analise', 'disputa'], split_part(b.ref_id, '#', 2)) as ordem   -- a ordem em que as datas de uma licitação acontecem
      from public.calendario_eventos_base(p_hoje - 15, p_hoje) b
      join public.auth_usuarios u
        on coalesce(u.ativo, false) and lower(u.email) not like '%@teste.acn.invalid'
       and (lower(trim(u.email)) = any (b.emails) or lower(trim(u.nome)) = any (b.nomes) or u.perfil = any (b.perfis))
     where b.alerta and not b.concluido
  )
  select x.uid, x.unome, x.fonte, x.ref_id, x.dia, x.titulo, x.detalhe, x.aba, x.atraso, null::text
    from x where x.fonte <> 'licitacao'
  union all
  -- licitação: um aviso por pessoa e licitação. O título de cada data é "<rótulo> — <número>"; o número é igual em todas as datas da licitação.
  select x.uid, x.unome, 'licitacao', split_part(x.ref_id, '#', 1), max(x.dia),
         max(substr(x.titulo, strpos(x.titulo, ' — ') + 3)),
         null::text, 'licitacoes', (p_hoje - max(x.dia)),
         'Licitação ' || max(substr(x.titulo, strpos(x.titulo, ' — ') + 3))
         || case
              when count(*) filter (where x.dia < p_hoje) > 0 then
                ' em andamento com a data vencida ('
                || string_agg(lower(split_part(x.titulo, ' — ', 1)) || ' ' || to_char(x.dia, 'DD/MM'), ', ' order by x.dia, x.ordem) filter (where x.dia < p_hoje)
                || '). Manter atualizada.'
                || coalesce(' Hoje: ' || string_agg(lower(split_part(x.titulo, ' — ', 1)), ', ' order by x.ordem) filter (where x.dia = p_hoje) || '.', '')
              else
                ' tem data hoje: ' || string_agg(lower(split_part(x.titulo, ' — ', 1)), ', ' order by x.ordem) || '.'
            end
    from x where x.fonte = 'licitacao'
   group by x.uid, x.unome, split_part(x.ref_id, '#', 1)
$$;
revoke all on function public.calendario_alvos(date) from public, anon, authenticated;

create or replace function public.calendario_avisar()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  r record; chave text; texto text; achou integer;
  novos integer := 0; renovados integer := 0; resolvidos integer := 0; dispensados integer := 0;
begin
  if extract(isodow from hoje) > 5 then return jsonb_build_object('fim_de_semana', true); end if;
  drop table if exists _cal_alvos2;
  create temp table _cal_alvos2 on commit drop as select * from public.calendario_alvos(hoje);
  for r in select * from _cal_alvos2 loop
    chave := r.fonte || ':' || r.ref_id || ':' || r.dia::text;
    -- o que a pessoa já dispensou não volta. Vale a mesma chave; na licitação vale também a chave antiga (por data) e qualquer dispensa de uma data igual ou mais nova
    if exists (
      select 1 from public.mencoes d
       where d.mencionado_id = r.usuario_id::text and d.contexto = 'calendario' and d.resolvida
         and coalesce(d.resolvida_por, '') <> 'Sistema'
         and (d.contexto_id = chave
              or (r.fonte = 'licitacao' and d.contexto_id like 'licitacao:' || r.ref_id || '%' and right(d.contexto_id, 10) >= r.dia::text))
    ) then
      dispensados := dispensados + 1;
      -- sobra de antes da regra: o mesmo item pendente, recriado depois de dispensado, também sai da frente da pessoa
      update public.mencoes set resolvida = true, resolvida_em = now(), resolvida_por = 'Sistema'
       where mencionado_id = r.usuario_id::text and contexto = 'calendario' and contexto_id = chave and not resolvida;
      continue;
    end if;
    texto := coalesce(r.texto_pronto,
             case when r.dias_atraso = 0 then 'Hoje: ' else 'Atrasado há ' || r.dias_atraso || case when r.dias_atraso = 1 then ' dia: ' else ' dias: ' end end
             || r.titulo || coalesce(' (' || nullif(r.detalhe, '') || ')', ''));
    update public.mencoes set texto_trecho = texto, lida = false, criado_em = now()
     where mencionado_id = r.usuario_id::text and contexto = 'calendario' and contexto_id = chave and not resolvida;
    get diagnostics achou = row_count;
    if achou > 0 then
      renovados := renovados + 1;
    else
      insert into public.mencoes (mencionado_id, mencionado_nome, mencionante_id, mencionante_nome, contexto, contexto_id, contexto_descricao, campo, texto_trecho, aba_destino, lida)
      values (r.usuario_id::text, r.usuario_nome, '', 'Sistema', 'calendario', chave, 'Calendário', 'data', texto, r.aba_destino, false);
      novos := novos + 1;
    end if;
  end loop;
  -- some sozinho o aviso pendente cujo item foi resolvido, mudou de data, passou de 15 dias (ou é de chave antiga da licitação)
  update public.mencoes m set resolvida = true, resolvida_em = now(), resolvida_por = 'Sistema'
   where m.contexto = 'calendario' and not m.resolvida
     and not exists (select 1 from _cal_alvos2 a where a.usuario_id::text = m.mencionado_id and a.fonte || ':' || a.ref_id || ':' || a.dia::text = m.contexto_id);
  get diagnostics resolvidos = row_count;
  return jsonb_build_object('novos', novos, 'renovados', renovados, 'resolvidos', resolvidos, 'dispensados_que_nao_voltam', dispensados);
end;
$$;
revoke all on function public.calendario_avisar() from public, anon, authenticated;
