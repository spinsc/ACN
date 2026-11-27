-- Etapa 17, onda 5a, parte a (26/11/2026): os dois portais do cliente (portal.html por link com token e veiculo.html pela etiqueta NFC com o chassi) passam a ser
-- servidos por funções do banco, que só entregam o veículo de quem tem o link ou o chassi.
-- Por que: hoje a chave pública (a do navegador) lê TODOS os veículos ativos, com o `portal_token` e o `pin_acesso` de cada um, todos os serviços e todos os
-- chamados (nome e telefone de quem abriu), e ainda insere chamado com qualquer conteúdo. O PIN da área restrita era conferido no navegador, depois de baixar o PIN.
-- Esta parte só ACRESCENTA: nada do que existe deixa de funcionar. A parte b (etapa17_onda5a_b_fechar_portal.sql) fecha a chave pública depois das páginas novas no ar.
-- Decidido pelo usuário em 26/11/2026: o PIN é conferido no servidor, com bloqueio de 15 min após 5 erros seguidos naquele veículo.
-- Exceção CONSCIENTE à regra "função nova: a chave pública não executa": estas quatro são o próprio portal; cada uma confere o que recebe e devolve só o veículo pedido.
-- Como desfazer: etapa17_onda5a_reverter.sql.

-- ── tentativas de PIN por veículo (só as funções abaixo mexem; sem política = ninguém lê) ──
create table if not exists public.nfc_pin_tentativas (
  veiculo_id uuid primary key references public.veiculos_nfc(id) on delete cascade,
  falhas integer not null default 0,
  bloqueado_ate timestamptz,
  atualizado_em timestamptz not null default now()
);
alter table public.nfc_pin_tentativas enable row level security;
revoke all on public.nfc_pin_tentativas from public, anon, authenticated;

-- ── portal.html: o veículo e os chamados dele, pelo token do link ──
create or replace function public.portal_veiculo_por_token(p_token uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $f$
declare v record;
begin
  if p_token is null then return null; end if;
  select * into v from public.veiculos_nfc where portal_token = p_token and ativo is true limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'veiculo', jsonb_build_object(
      'chassi', v.chassi, 'placa', v.placa, 'modelo', v.modelo, 'orgao_cliente', v.orgao_cliente,
      'opl_numero', v.opl_numero, 'data_entrega', v.data_entrega, 'data_fim_garantia', v.data_fim_garantia,
      'manual_pdf_url', v.manual_pdf_url),
    -- o telefone de quem abriu NÃO sai (o portal nunca o mostrou)
    'chamados', coalesce((
      select jsonb_agg(jsonb_build_object(
               'created_at', c.created_at, 'nome_solicitante', c.nome_solicitante, 'status', c.status,
               'descricao_defeito', c.descricao_defeito, 'notas_atendimento', c.notas_atendimento,
               'atendido_por', c.atendido_por) order by c.created_at desc)
        from (select * from public.chamados_suporte where veiculo_id = v.id order by created_at desc limit 20) c
    ), '[]'::jsonb));
end $f$;

-- ── veiculo.html: a parte aberta (sem PIN), pelo chassi da etiqueta ──
create or replace function public.nfc_veiculo_por_chassi(p_chassi text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $f$
declare v record;
begin
  if coalesce(trim(p_chassi), '') = '' then return null; end if;
  select * into v from public.veiculos_nfc where chassi = trim(p_chassi) and ativo is true limit 1;
  if not found then return null; end if;
  return jsonb_build_object('veiculo', jsonb_build_object(
    'chassi', v.chassi, 'placa', v.placa, 'modelo', v.modelo, 'orgao_cliente', v.orgao_cliente,
    'data_entrega', v.data_entrega, 'data_fim_garantia', v.data_fim_garantia, 'manual_pdf_url', v.manual_pdf_url));
end $f$;

-- ── veiculo.html: a área restrita; o PIN é conferido AQUI (o do veículo ou o global; nunca um padrão embutido) ──
create or replace function public.nfc_area_restrita(p_chassi text, p_pin text)
returns jsonb
language plpgsql volatile security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
  v record; t record; pin_v text; pin_g text; digitado text := trim(coalesce(p_pin, ''));
  max_falhas constant integer := 5; bloqueio constant interval := interval '15 minutes'; n integer;
begin
  if coalesce(trim(p_chassi), '') = '' then return jsonb_build_object('ok', false, 'motivo', 'nao_encontrado'); end if;
  select * into v from public.veiculos_nfc where chassi = trim(p_chassi) and ativo is true limit 1;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'nao_encontrado'); end if;

  -- trava a linha de tentativas deste veículo (duas conferências ao mesmo tempo não furam a contagem)
  insert into public.nfc_pin_tentativas (veiculo_id) values (v.id) on conflict (veiculo_id) do nothing;
  select * into t from public.nfc_pin_tentativas where veiculo_id = v.id for update;
  if t.bloqueado_ate is not null and t.bloqueado_ate > now() then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'ate', t.bloqueado_ate);
  end if;

  pin_v := nullif(trim(coalesce(v.pin_acesso, '')), '');
  select nullif(trim(coalesce(valor, '')), '') into pin_g from public.configuracoes_sistema where chave = 'nfc_pin_global' limit 1;

  if digitado <> '' and (digitado = pin_v or digitado = pin_g) then
    update public.nfc_pin_tentativas set falhas = 0, bloqueado_ate = null, atualizado_em = now() where veiculo_id = v.id;
    return jsonb_build_object(
      'ok', true,
      'opl_numero', v.opl_numero,
      'servicos', coalesce((select jsonb_agg(jsonb_build_object(
                   'item_servico', s.item_servico, 'descricao_tecnica', s.descricao_tecnica, 'categoria', s.categoria)
                   order by s.ordem, s.criado_em) from public.servicos_executados_nfc s where s.veiculo_id = v.id), '[]'::jsonb),
      'chamados', coalesce((select jsonb_agg(jsonb_build_object(
                   'created_at', c.created_at, 'nome_solicitante', c.nome_solicitante, 'contato_telefone', c.contato_telefone,
                   'status', c.status, 'descricao_defeito', c.descricao_defeito) order by c.created_at desc)
                   from (select * from public.chamados_suporte where veiculo_id = v.id order by created_at desc limit 10) c), '[]'::jsonb));
  end if;

  n := t.falhas + 1;
  if n >= max_falhas then
    update public.nfc_pin_tentativas set falhas = 0, bloqueado_ate = now() + bloqueio, atualizado_em = now() where veiculo_id = v.id;
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'ate', now() + bloqueio);
  end if;
  update public.nfc_pin_tentativas set falhas = n, atualizado_em = now() where veiculo_id = v.id;
  return jsonb_build_object('ok', false, 'motivo', 'pin', 'restantes', max_falhas - n);
end $f$;

-- ── os dois portais: abrir chamado (o veículo vem do token OU do chassi; o servidor copia placa, modelo e órgão e fixa o status) ──
create or replace function public.portal_abrir_chamado(p_token uuid, p_chassi text, p_nome text, p_telefone text, p_descricao text)
returns jsonb
language plpgsql volatile security definer
set search_path to 'public', 'pg_temp'
as $f$
declare v public.veiculos_nfc%rowtype; nome text := trim(coalesce(p_nome, '')); tel text := trim(coalesce(p_telefone, '')); descr text := trim(coalesce(p_descricao, '')); digitos text; recentes integer;
begin
  if p_token is not null then
    select * into v from public.veiculos_nfc where portal_token = p_token and ativo is true limit 1;
  elsif coalesce(trim(p_chassi), '') <> '' then
    select * into v from public.veiculos_nfc where chassi = trim(p_chassi) and ativo is true limit 1;
  end if;
  if v.id is null then return jsonb_build_object('ok', false, 'erro', 'Veículo não encontrado.'); end if;

  digitos := regexp_replace(tel, '\D', '', 'g');
  if char_length(nome) < 2 or char_length(nome) > 120 then return jsonb_build_object('ok', false, 'erro', 'Informe o seu nome.'); end if;
  if length(digitos) not in (10, 11) then return jsonb_build_object('ok', false, 'erro', 'Informe o telefone completo, com DDD.'); end if;
  if char_length(descr) < 5 or char_length(descr) > 2000 then return jsonb_build_object('ok', false, 'erro', 'Descreva o problema (até 2.000 letras).'); end if;

  -- freio contra enchente de chamados falsos: até 5 por veículo a cada hora
  select count(*) into recentes from public.chamados_suporte where veiculo_id = v.id and created_at > now() - interval '1 hour';
  if recentes >= 5 then return jsonb_build_object('ok', false, 'erro', 'Já recebemos vários chamados deste veículo na última hora. Aguarde um pouco ou ligue para a ACN.'); end if;

  insert into public.chamados_suporte (veiculo_id, chassi, placa, modelo, orgao_cliente, nome_solicitante, contato_telefone, descricao_defeito, status, created_at, atualizado_em)
  values (v.id, v.chassi, v.placa, v.modelo, v.orgao_cliente, left(nome, 120), left(tel, 30), descr, 'Aberto', now(), now());
  return jsonb_build_object('ok', true);
end $f$;

revoke all on function public.portal_veiculo_por_token(uuid) from public;
revoke all on function public.nfc_veiculo_por_chassi(text) from public;
revoke all on function public.nfc_area_restrita(text, text) from public;
revoke all on function public.portal_abrir_chamado(uuid, text, text, text, text) from public;
grant execute on function public.portal_veiculo_por_token(uuid) to anon, authenticated;
grant execute on function public.nfc_veiculo_por_chassi(text) to anon, authenticated;
grant execute on function public.nfc_area_restrita(text, text) to anon, authenticated;
grant execute on function public.portal_abrir_chamado(uuid, text, text, text, text) to anon, authenticated;
