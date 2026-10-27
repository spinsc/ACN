-- Pedido do usuário em 27/10/2026: ao abrir o Almoxarifado, um alerta grande avisa que a pendência de uma OP foi sanada (compra recebida, fabricação concluída).
-- Cada pessoa do Almoxarifado vê o aviso até clicar "Entendi" (decidido com o usuário): esta tabela guarda quem já viu o quê, para o aviso não voltar em outro computador.
-- A chave é pessoa + pendência (id da compra ou da demanda), então uma pendência nova da mesma OP avisa de novo.
create table if not exists public.almox_avisos_pendencia_sanada_vistos (
  usuario_chave text not null,
  pendencia_id  text not null,
  opl_id        text,
  visto_em      timestamptz not null default now(),
  primary key (usuario_chave, pendencia_id)
);
alter table public.almox_avisos_pendencia_sanada_vistos enable row level security;
create policy etapa17_logado on public.almox_avisos_pendencia_sanada_vistos
  for all to authenticated using (public.esta_logado()) with check (public.esta_logado());
revoke all on public.almox_avisos_pendencia_sanada_vistos from anon;
