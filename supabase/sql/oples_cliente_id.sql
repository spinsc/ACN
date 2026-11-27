-- Liga a OP ao cliente do cadastro (módulo fiscal, 27/11/2026, pedido do usuário: "ligar a OP ao cliente do cadastro").
-- Por quê: a OP só guardava o NOME escrito do cliente (`cliente_nome`, texto livre); a nota fiscal precisa dos dados fiscais do cadastro (IE, IBGE, tipo de órgão...), e em 26/11/2026
-- só 8 das 42 OPs que aguardavam nota achavam o cliente pelo nome. A coluna é opcional (nula = "ninguém ligou ainda"): nenhuma OP existente é mexida por esta migração.
--
-- Regra do gatilho: se o NOME do cliente muda e a ligação não foi mexida junto, a ligação é desfeita. O id guardado era do cliente que o nome antigo dizia; deixá-lo com o nome novo
-- faria a OP mostrar um cliente e faturar para outro. Quem muda o nome E escolhe o cadastro na mesma gravação (Nova OP, cópia) mantém a ligação. Assim as três telas que editam o
-- nome como texto (edição completa, edição em lote e edição do Comercial) continuam coerentes sem ter sido mexidas.
-- O gatilho só dispara quando `cliente_nome` está entre as colunas do UPDATE e o valor mudou (custo desprezível); roda com os direitos de quem grava e não precisa de mais nenhum.
set local lock_timeout = '3s';

alter table public.oples add column if not exists cliente_id uuid references public.clientes(id) on delete set null;

comment on column public.oples.cliente_id is 'Cadastro (clientes.id) a que o cliente da OP está ligado; nulo = ninguém ligou. Desfeita sozinha se o nome do cliente muda sem a ligação mudar junto (gatilho oples_cliente_id_acompanha_o_nome). Usada pela prontidão fiscal da OP.';

create index if not exists oples_cliente_id_idx on public.oples (cliente_id) where cliente_id is not null;

create or replace function public.oples_cliente_id_acompanha_o_nome()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cliente_id is not distinct from old.cliente_id then
    new.cliente_id := null;
  end if;
  return new;
end;
$$;

-- função de gatilho: dispara sem direito nenhum (regra do projeto, `revoke all` de quem entra e da chave pública)
revoke all on function public.oples_cliente_id_acompanha_o_nome() from public, anon, authenticated;

drop trigger if exists oples_cliente_id_acompanha_o_nome on public.oples;
create trigger oples_cliente_id_acompanha_o_nome
  before update of cliente_nome on public.oples
  for each row
  when (old.cliente_nome is distinct from new.cliente_nome)
  execute function public.oples_cliente_id_acompanha_o_nome();
