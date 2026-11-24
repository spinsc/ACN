-- CHEGADA DO VEÍCULO À MATRIZ E PRAZO EM DIAS (pedido do usuário em 24/11/2026)
--
-- Por quê: a "Previsão de entrega" da OP era uma data digitada pelo Comercial na abertura, quando ainda ninguém sabia o dia em que o carro
-- chegaria. Agora o Comercial diz QUANTOS DIAS a fábrica leva da chegada do carro até a conclusão (1, 2, 10, 30, 60... número inteiro, livre) e a
-- data de entrega é calculada: chegada do veículo + dias. Antes de o carro chegar vale a previsão de chegada (se houver); quando alguém aciona o
-- botão "Veículo chegou à matriz" na janela da OP, vale a chegada de verdade.
--
-- Três colunas novas em oples:
--   prazo_dias_apos_chegada  inteiro de 0 a 3650 (nulo = OP antiga ou de envio: nada muda, a data segue sendo digitada)
--   veiculo_chegou_em        o instante em que o botão foi acionado (nulo = o carro ainda não chegou)
--   veiculo_chegou_por       quem acionou (nome, para o histórico e a janela)
--
-- O gatilho recalcula data_prevista_entrega SÓ quando muda um dos números de que ela depende (os dias, a chegada de verdade ou, enquanto o carro
-- não chegou, a previsão de chegada). Quem corrige a data à mão na janela da OP continua podendo: a correção vale até a próxima mudança desses números.
-- Nenhuma OP que já existe é recalculada: todas têm prazo_dias_apos_chegada nulo.

alter table public.oples
  add column if not exists prazo_dias_apos_chegada integer,
  add column if not exists veiculo_chegou_em timestamptz,
  add column if not exists veiculo_chegou_por text;

alter table public.oples drop constraint if exists oples_prazo_dias_apos_chegada_ck;
alter table public.oples add constraint oples_prazo_dias_apos_chegada_ck
  check (prazo_dias_apos_chegada is null or (prazo_dias_apos_chegada >= 0 and prazo_dias_apos_chegada <= 3650));

comment on column public.oples.prazo_dias_apos_chegada is 'Dias da chegada do veículo até a conclusão/entrega, definidos pelo Comercial na abertura da OP. data_prevista_entrega = chegada + dias.';
comment on column public.oples.veiculo_chegou_em is 'Quando o botão "Veículo chegou à matriz" foi acionado na janela da OP (chegada real, diferente da previsão em data_chegada_veiculo).';
comment on column public.oples.veiculo_chegou_por is 'Nome de quem acionou o botão de chegada do veículo.';

create or replace function public.oples_calcular_entrega_pela_chegada()
returns trigger
language plpgsql
as $$
declare
  base date;
  mudou boolean;
begin
  if new.prazo_dias_apos_chegada is null then
    return new;
  end if;

  if new.veiculo_chegou_em is not null then
    -- o carro já chegou: vale o dia em que chegou (no horário de Brasília) e só reage aos dias ou à chegada
    base := (new.veiculo_chegou_em at time zone 'America/Sao_Paulo')::date;
    mudou := tg_op = 'INSERT'
      or new.prazo_dias_apos_chegada is distinct from old.prazo_dias_apos_chegada
      or new.veiculo_chegou_em is distinct from old.veiculo_chegou_em;
  else
    -- ainda não chegou: vale a previsão de chegada, se alguém a informou
    base := new.data_chegada_veiculo;
    mudou := tg_op = 'INSERT'
      or new.prazo_dias_apos_chegada is distinct from old.prazo_dias_apos_chegada
      or new.data_chegada_veiculo is distinct from old.data_chegada_veiculo;
  end if;

  if base is not null and mudou then
    new.data_prevista_entrega := base + new.prazo_dias_apos_chegada;
  end if;
  return new;
end;
$$;

-- gatilho dispara sem precisar de direito de execução: ninguém chama a função de fora (regra do projeto para função de gatilho)
revoke all on function public.oples_calcular_entrega_pela_chegada() from public, anon, authenticated;

drop trigger if exists oples_calcular_entrega_pela_chegada on public.oples;
create trigger oples_calcular_entrega_pela_chegada
  before insert or update on public.oples
  for each row execute function public.oples_calcular_entrega_pela_chegada();
