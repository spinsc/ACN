-- Viagens: reserva do veículo para uso interno (pedido do usuário em 04/11/2026).
-- O carro da frota às vezes fica ocupado um dia ou mais fora de viagem (buscar material, levar material, visita, reparo). Isso precisa aparecer na Agenda como ocupação do veículo,
-- para a Adaptação enxergar o conflito com as viagens e remanejar (outro carro ou outra data). Decidido com o usuário:
--  • quem marca: quem tem a aba Viagens (pela Agenda) e quem abre uma demanda geral (pelo quadro "Veículo" da demanda), por isso a política é a de quem entrou (etapa17_logado);
--  • a reserva em cima de uma viagem GRAVA e avisa em vermelho; é a viagem que fica travada na saída ("A equipe saiu") até trocar o carro ou a data;
--  • nada se apaga: a reserva errada se CANCELA (quem e quando ficam guardados);
--  • a reserva ligada a uma demanda geral se cancela sozinha quando a demanda é cancelada (gatilho abaixo).

create table if not exists public.frota_reservas (
  id uuid primary key default gen_random_uuid(),
  frota_id uuid not null references public.frota_veiculos(id) on delete restrict,   -- nunca apaga o veículo que tem reserva
  data_inicio date not null,
  data_fim date not null,                    -- os dois dias valem (inclusive)
  motivo text not null,                      -- da lista da tela (buscar material, levar material, ...); sem check de propósito: a lista pode crescer
  observacao text,
  responsavel_nome text,                     -- quem vai estar com o carro, para saber com quem falar para remanejar
  demanda_id uuid references public.demandas_avulsas(id) on delete set null,   -- quando a reserva nasce de uma demanda geral
  demanda_titulo text,                       -- o título da demanda na hora da reserva (a Agenda mostra sem precisar ler a demanda)
  status text not null default 'ativa' check (status in ('ativa', 'cancelada')),
  cancelada_em timestamptz,
  cancelada_por_nome text,
  motivo_cancelamento text,
  criado_em timestamptz not null default now(),
  criado_por_nome text,
  atualizado_em timestamptz,
  atualizado_por_nome text,
  constraint frota_reservas_periodo_ck check (data_fim >= data_inicio)
);
create index if not exists frota_reservas_frota_idx on public.frota_reservas (frota_id, data_inicio);
create index if not exists frota_reservas_demanda_idx on public.frota_reservas (demanda_id) where demanda_id is not null;

alter table public.frota_reservas enable row level security;
drop policy if exists etapa17_logado on public.frota_reservas;
create policy etapa17_logado on public.frota_reservas for all to authenticated using (public.esta_logado()) with check (public.esta_logado());
revoke all on table public.frota_reservas from anon;
comment on table public.frota_reservas is 'Reservas de veículo da frota para uso interno (fora de viagem): ocupam o carro na Agenda das Viagens e travam a saída de uma viagem que caia em cima.';

-- a demanda geral cancelada solta o carro ---------------------------------------------------------------------------------------------------------
create or replace function public.demandas_cancelar_reservas_de_veiculo()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.status = 'Cancelada' and old.status is distinct from 'Cancelada' then
    update public.frota_reservas
       set status = 'cancelada', cancelada_em = now(), cancelada_por_nome = 'Sistema (demanda cancelada)',
           motivo_cancelamento = 'A demanda "' || coalesce(new.titulo, '') || '" foi cancelada.', atualizado_em = now()
     where demanda_id = new.id and status = 'ativa';
  end if;
  return new;
end;
$function$;
-- função de gatilho: dispara sem direito de executar (a chave pública e quem entrou não a chamam à mão)
revoke all on function public.demandas_cancelar_reservas_de_veiculo() from public, anon, authenticated;

drop trigger if exists demandas_cancelar_reservas_de_veiculo on public.demandas_avulsas;
create trigger demandas_cancelar_reservas_de_veiculo after update of status on public.demandas_avulsas
  for each row execute function public.demandas_cancelar_reservas_de_veiculo();
