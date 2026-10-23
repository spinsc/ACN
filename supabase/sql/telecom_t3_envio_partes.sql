-- Telecom, fatia T3 (pedido do usuário em 22/10/2026): venda composta (rádio + material de adaptação na mesma OP) tem DUAS separações e UM SÓ frete.
-- Aplicada pelo apply_migration "telecom_t3_oples_envio_partes" e "telecom_t3_funcao_gravar_parte_envio" em 22/10/2026 (coluna nova e opcional, vazia em toda OP existente: nenhuma linha mudou).
-- Cada setor embala a sua parte e a guarda aqui, por setor: { "Almoxarifado": { concluida_em, por, seriais, seriais_itens, peso_total, volumes, altura, largura, comprimento, observacoes }, "Telecom": { ... } }.
-- O setor que termina primeiro guarda a parte e a OP some da fila dele; quando o último termina nasce o frete único (peso e volumes somados) e a OP segue como hoje.
alter table public.oples add column if not exists envio_partes jsonb;

comment on column public.oples.envio_partes is
  'Venda composta de envio de material (Telecom, T3, 22/10/2026): a parte embalada por cada setor, por nome do setor. Vazio = OP que não é composta ou que ainda não teve nenhuma parte embalada.';

-- Grava (ou tira) a parte de UM setor sem pisar na do outro. Por que no banco: os dois setores podem embalar ao mesmo tempo; ler o JSON, mudar no navegador e gravar de volta
-- perderia a parte de quem gravou primeiro. Aqui a gravação é uma só, com a linha da OP travada, e devolve o JSON inteiro: é essa leitura ("o outro setor já terminou?") que decide
-- quem abre o frete único. p_parte nulo = o setor refaz a parte dele. Só mexe em OP que ainda está na separação. Executa quem entrou (authenticated); a chave pública (anon) não.
create or replace function public.oples_gravar_parte_envio(p_id uuid, p_setor text, p_parte jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_partes jsonb;
begin
  if p_setor not in ('Almoxarifado', 'Telecom') then
    raise exception 'Setor inválido para a parte da venda composta: %', p_setor;
  end if;
  select status_geral into v_status from public.oples where id = p_id for update;
  if not found then
    raise exception 'OP não encontrada';
  end if;
  if v_status not in ('Aguardando Almox', 'Aguardando Embalagem') then
    raise exception 'A OP não está mais na separação (status atual: %)', v_status;
  end if;
  update public.oples
     set envio_partes = case
           when p_parte is null then nullif(coalesce(envio_partes, '{}'::jsonb) - p_setor, '{}'::jsonb)
           else coalesce(envio_partes, '{}'::jsonb) || jsonb_build_object(p_setor, p_parte)
         end
   where id = p_id
   returning envio_partes into v_partes;
  return coalesce(v_partes, '{}'::jsonb);
end;
$$;

revoke all on function public.oples_gravar_parte_envio(uuid, text, jsonb) from public, anon;
grant execute on function public.oples_gravar_parte_envio(uuid, text, jsonb) to authenticated, service_role;

comment on function public.oples_gravar_parte_envio(uuid, text, jsonb) is
  'Telecom T3 (22/10/2026): grava a parte embalada de um setor em oples.envio_partes (ou a tira, com p_parte nulo) sem pisar na parte do outro; devolve o JSON inteiro.';

-- Para desfazer (a coluna e a função são novas e só o Telecom as usa):
--   drop function if exists public.oples_gravar_parte_envio(uuid, text, jsonb);
--   alter table public.oples drop column if exists envio_partes;
