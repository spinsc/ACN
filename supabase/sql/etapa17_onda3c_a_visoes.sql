-- Etapa 17b, onda 3c, parte A (04/11/2026) — as visões básicas dos cards (CRM e Licitações). SÓ ACRESCENTA: nada fecha nesta parte.
--
-- Por que existe: os cards (crm_oportunidades e licitacoes) são lidos por mais de 20 telas, mas quase todas só procuram o card (título, órgão, pedido de venda, responsável, datas).
-- Valores, contatos, e-mails e dados de negociação só interessam ao CRM, às Licitações e ao Telecom. Mesma ideia do RH (rh_funcionarios_basico): uma visão com o necessário para
-- todo mundo que entrou, e a tabela cheia só para quem tem a aba (parte B, depois que as telas já leem pela visão). Decisão do usuário em 04/11/2026 ("Visão básica dos cards").
--
-- Como protege: a visão roda com o poder do dono (como as outras visões do banco) e MASCARA três colunas conforme quem pergunta: o valor registrado só aparece a quem tem
-- CRM, Telecom ou Licitações (ou Admin); nome e telefone do contato só a quem tem uma dessas abas ou é o responsável do próprio card (os alertas de retorno mostram o contato
-- do cliente ao vendedor dele). A chave pública não lê as visões.
-- Para voltar atrás: etapa17_onda3c_reverter.sql.

-- nome da pessoa que está perguntando (o card guarda o responsável pelo NOME, não pelo código)
create or replace function public.nome_do_usuario_atual()
returns text language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  select u.nome from public.auth_usuarios u where u.auth_id = auth.uid() and coalesce(u.ativo, false) limit 1;
$f$;
revoke all on function public.nome_do_usuario_atual() from public, anon;
grant execute on function public.nome_do_usuario_atual() to authenticated;

create or replace view public.crm_oportunidades_basico as
select o.id, o.funil, o.titulo, o.numero_edital, o.orgao, o.data_sessao, o.hora_sessao, o.responsavel_id, o.responsavel_nome, o.cliente_id, o.cliente_final,
       o.estagio_id, o.licitacao_processo_id, o.numero_pv, o.tipo_negocio, o.setor_venda, o.prox_contato, o.hora_prox_contato, o.criado_em, o.atualizado_em,
       o.titulo_norm, o.numero_edital_norm, o.orgao_norm, o.responsavel_nome_norm,
       case when public.tem_alguma_aba(array['crm', 'telecom', 'licitacoes']) or o.responsavel_nome = public.nome_do_usuario_atual() then o.nome_contato end as nome_contato,
       case when public.tem_alguma_aba(array['crm', 'telecom', 'licitacoes']) or o.responsavel_nome = public.nome_do_usuario_atual() then o.contato end as contato,
       case when public.tem_alguma_aba(array['crm', 'telecom', 'licitacoes']) then o.valor_registrado end as valor_registrado,
       o.participantes   -- o Calendário mostra os retornos em que a pessoa foi adicionada como participante (acrescentada depois, no fim da lista: a visão já existia)
  from public.crm_oportunidades o;
revoke all on public.crm_oportunidades_basico from public, anon;
grant select on public.crm_oportunidades_basico to authenticated;

create or replace view public.licitacoes_basico as
select l.id, l.numero, l.nome_projeto, l.objeto_principal, l.orgao, l.status, l.data_disputa, l.horario_sessao, l.operador, l.analista_nome, l.criado_em, l.atualizado_em,
       l.numero_norm, l.nome_projeto_norm, l.orgao_norm
  from public.licitacoes l;
revoke all on public.licitacoes_basico from public, anon;
grant select on public.licitacoes_basico to authenticated;

-- O gatilho que "toca" a licitação quando se anexa um documento rodava com o poder de quem anexa (compras, financeiro e logística anexam documentos). Fechada a tabela por aba, a
-- atualização da data passaria a não pegar ninguém, sem erro nenhum; com o poder do dono ela continua igual. A chave pública não executa.
alter function public.licitacao_doc_touch_licitacao() security definer set search_path to 'public', 'pg_temp';
revoke all on function public.licitacao_doc_touch_licitacao() from public, anon;
