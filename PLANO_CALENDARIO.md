# PLANO — Calendário integrado: toda data do sistema aparece para os envolvidos e gera alerta

> Criado em 12/11/2026, a partir do pedido do usuário: *"Tudo no sistema que envolver data, deve aparecer no calendário dos envolvidos aquela demanda, tarefa ou ação e gerar alertas do calendário. Prazos de demandas avulsas, contato com cliente, recebimento de carros, recebimento de material e etc."*
> Este arquivo é o ponto de partida de qualquer sessão que retome o assunto. O que foi construído está no quadro da seção 9.

## 1. O que existe hoje (medido em 12/11/2026)

- **Tela Calendário** (`CalendarioTab.tsx`, aba `calendario`, 14 pessoas ativas a têm): mês e semana; mostra os **compromissos** (`agenda_compromissos`, com participantes e @menção), os **retornos do CRM** (`prox_contato` dos cards de venda direta), as **tarefas do Financeiro** (vencimento), as **tarefas da Engenharia** (início/criação) e os **agendamentos de manutenção**. Cada pessoa vê só o que é dela (dona ou participante); Admin e gerentes têm o botão "Todos os usuários".
- **Alerta**: só a **Agenda dos setores** (`AgendaWidget.tsx`) avisa (selo "em 15 min" / "em 24 h", atualização a cada 30 s) e só para compromissos. O calendário em si **não alerta nada**, e nenhuma das outras datas do sistema chega nele.
- **Rotinas do banco** (`pg_cron`) que já avisam por data: `fretes-avisar-sem-entrega` (8h, dias úteis) e `viagens-avisar-saida-proxima`. Cada uma escreve na caixa de **Menções** (`mencoes`) e marca o que já avisou. É o modelo a seguir.

## 2. Decisões do usuário (12/11/2026)

| Assunto | Decisão |
|---|---|
| Datas da primeira entrega | **As quatro famílias:** prazos de demandas, contato com cliente, recebimento de carros e recebimento de material. As demais ("etc.") vêm depois, uma família por vez. |
| Quem são os envolvidos | **Responsável + participantes + o setor que age** naquela etapa. Cada pessoa só vê o que já pode ver hoje (crachá e abas). |
| Forma do alerta | **Caixa de Menções + selo no calendário e no "Para você hoje" da tela Início.** Sem e-mail nem WhatsApp. |
| Quando avisa | **No dia** e **atrasado, todo dia útil até resolver.** (Não foram escolhidos: "1 dia útil antes" e "minutos antes".) |
| Aviso por item | **Um aviso por item** (não um resumo por pessoa). Para a caixa não encher, o aviso de cada item é **um só, que se renova** a cada dia útil enquanto estiver atrasado (volta a ficar "não lido" com o número de dias), e some quando o item é resolvido. |
| Limite de atraso | **15 dias.** Atrasado de até 15 dias reavisa todo dia útil; o que passou disso continua em vermelho no calendário, mas para de avisar. |
| Recebimento de carros | O campo "Data de Recebimento do Veículo" da OP **é a previsão**, preenchida antes: o calendário e o alerta o usam como está, só enquanto o veículo ainda não foi recebido. Data passada de OP que já passou do recebimento não alerta. |
| Setor que age | **O setor vê tudo da sua área** (Almoxarifado e Logística veem todos os carros e materiais a chegar; PCP e os demais, o que é da área deles). Responsável e participantes veem sempre. |

## 3. Como vai funcionar (o desenho)

**Uma fonte única de datas, no banco.** Uma função `calendario_eventos(inicio, fim)` junta todas as datas do sistema numa lista só — fonte, registro, dia, hora (se tiver), título, quem são os envolvidos, o setor que age, se já foi resolvida e para onde o clique leva. O **calendário** e a **rotina de alertas** leem a mesma função, então a tela e o aviso nunca discordam.

- **Não se copia nada para `agenda_compromissos`.** A data continua morando onde nasce (o prazo na demanda, a chegada na OP, a entrega na compra): mudou lá, mudou no calendário e no alerta. Duplicar criaria datas velhas.
- **O compromisso digitado à mão continua como está** (é a única fonte que se cria no próprio calendário).
- **Quem vê o quê:** a função roda com o crachá de quem pergunta e só devolve itens em que a pessoa é responsável, participante ou do setor que age **e** que ela já pode ler (as abas fechadas do banco continuam fechadas: o que vem de CRM e Licitações usa as visões básicas).
- **Resolvida = sai do alerta.** Cada fonte tem a sua regra de "resolvida" (demanda concluída ou cancelada, veículo recebido, compra recebida, retorno do cliente marcado de novo para outra data...). Nenhum alerta é gravado como pendente: ele nasce da leitura do dia.

**Alertas (rotina de dia útil, 8h de Brasília):** para cada pessoa, **um aviso só** na caixa de Menções, no estilo "Hoje: 3 datas · Atrasadas: 5", com a lista curta e o clique abrindo o calendário no dia. O aviso do dia anterior é marcado como resolvido quando o novo chega (a caixa não acumula). Os itens atrasados e os do dia também ganham **selo vermelho** no calendário ("vence hoje", "atrasado há N dias") e entram em "Para você hoje" da tela Início.

## 4. Catálogo das datas (as quatro famílias)

"Resolvida" é o que tira o item do alerta. **Quem age** é o setor além do responsável e dos participantes. Colunas e números conferidos no banco em 12/11/2026.

### 4.1 Prazos de demandas

| Data | Origem | Quem vê | Resolvida quando | Números hoje |
|---|---|---|---|---|
| Prazo da demanda avulsa | `demandas_avulsas.prazo` | responsável (`responsavel_email`), participantes/membros, o setor de destino | status Concluída ou Cancelada | 19 em aberto com prazo (12 pendentes, 7 em andamento); vários vencidos desde setembro |
| Prazo das etapas da demanda composta | `demandas_avulsas.etapas[]` (a conferir se as etapas têm prazo próprio) | idem | etapa concluída | a medir |
| Data prevista de recebimento da demanda de compra/setor | `demandas_setoriais.data_prevista_recebimento` | solicitante, setor de destino | demanda concluída | a medir |
| Prazo de orçamento e entrega da OS do SAC | `sac_ordens_servico.prazo_orcamento`, `data_prevista_entrega`, `data_prevista_pos_aprovacao` | responsável da OS, SAC | OS sai da etapa a que o prazo se refere, entregue ou cancelada | a medir |

### 4.2 Contato com cliente

| Data | Origem | Quem vê | Resolvida quando | Números hoje |
|---|---|---|---|---|
| Próximo contato (com hora) | `crm_oportunidades.prox_contato` + `hora_prox_contato` (visão `crm_oportunidades_basico`) | responsável do card, participantes | card em Perdido, Desistência ou Faturado; ou o retorno é remarcado | 46 cards têm data, **43 vencidos** (muitos em cards já encerrados: a regra tem de ignorá-los) |
| Retorno do Telecom Vendas | mesmo campo, cards `setor_venda = 'telecom'` | operador de vendas | idem | incluído no anterior |
| Limite de proposta, de análise e de esclarecimentos das licitações | `licitacoes.data_limite_proposta`, `data_limite_analise_tecnica`, `data_limite_esclarecimentos` (visão `licitacoes_basico`) | responsável do card ligado, equipe de Licitações | licitação Perdida, Descartada, Vencida ou Suspensa; ou proposta enviada | 24 abertas, 21 com limite de proposta futuro |
| Limite de proposta/análise do card do CRM | `crm_oportunidades.data_limite_proposta`, `data_limite_analise` | responsável do card | card sai da etapa | a medir |

### 4.3 Recebimento de carros

| Data | Origem | Quem vê | Resolvida quando | Números hoje |
|---|---|---|---|---|
| Data de recebimento do veículo (prevista) | `oples.data_chegada_veiculo` (campo "Data de Recebimento do Veículo" da OP; **só OP de adaptação**, a de envio não tem) | vendedor/responsável comercial da OP, **Almoxarifado**, PCP | a OP passa de "Aguardando Almox" (veículo recebido e kit fechado) ou é cancelada | 79 OPs de adaptação em etapa antes da produção, 2 com data **futura**: **a data é, na maioria, a do dia em que o carro já chegou** (o campo é preenchido depois). **A confirmar com o usuário:** o campo é "previsto" ou "real"? Se for só o real, falta um campo de "previsão de chegada". |
| Chegada do veículo da OS do SAC | `sac_ordens_servico.previsao_chegada_veiculo` (campo novo, 12/11/2026; a `data_chegada_veiculo` continua sendo a data REAL, gravada pela Produção) | quem abriu a OS, responsável, Almoxarifado, Gerente Produção | a Produção confirma a chegada, ou a OS é cancelada, concluída ou segue ao Fiscal | ✅ |
| Retorno de saída da vistoria de pátio | `vistorias_patio.previsao_retorno` | quem pediu a saída, Logística | status diferente de "Saiu" (retornou) | a medir |
| Prazo de entrega da OP ao cliente | `oples.data_prevista_entrega` (e `prazo_entrega_producao`, `prazo_entrega_comercial`) | vendedor, PCP, Produção | OP em Faturado, Entregue ou Cancelado | 122 OPs com data prevista |

### 4.4 Recebimento de material

| Data | Origem | Quem vê | Resolvida quando | Números hoje |
|---|---|---|---|---|
| Entrega prevista da compra | `pcp_pedidos_compra.data_prevista_recebimento` / `prazo_prometido_entrega` | comprador (`comprador_email`), solicitante, **Almoxarifado/Logística** | `status_compra` Recebido ou Descartada | 15 "Comprado" com data; 1 coleta marcada e não feita |
| Coleta marcada | mesmo pedido, `forma_recebimento = 'coleta'` e `coletado_em` vazio | comprador | coleta registrada | 1 |
| Entrega prevista de chicotes e serralheria | `pcp_pedidos_chicotes`, `pcp_pedidos_serralheria`, `chicotes_fabricacao`, `serralheria_trabalhos` (`data_prevista_entrega`, `data_entrega_real`) | quem pediu, setor que fabrica | `data_entrega_real` preenchida | a medir |
| Frete com data prevista | `pcp_fretes.data_prevista` (saída e entrada) | vendedor da OP, Logística | frete Entregue ou Cancelado (**já existe o aviso de "frete sem entrega"**: não duplicar) | a medir |
| Saída da viagem e reserva de veículo | `viagens.data_saida`, `frota_reservas.data_inicio/data_fim` | equipe da viagem, quem reservou | viagem Finalizada/Cancelada; reserva cancelada | a medir (já há aviso de saída próxima: não duplicar) |

### 4.5 O que já está no calendário e fica
Compromissos, tarefas do Financeiro, tarefas da Engenharia e agendamentos de manutenção continuam, só passam a vir pela função única e a gerar alerta.

### 4.6 Fora desta rodada ("etc.")
Vencimento de contas e de nota (Financeiro), validade de ata e prazo de garantia, aniversários e datas da empresa (já estão na tela Início), manutenção programada da frota, entrega de uniformes, férias e atestados (RH), reposição de estoque. Entram por família, a pedido.

## 5. Regras que não se quebram
1. **A data continua morando na origem.** Nenhuma cópia em `agenda_compromissos`.
2. **Cada pessoa só vê o que já vê hoje.** Nada de abrir tabela fechada por aba; as visões básicas existem para isso.
3. **O alerta é calculado, não guardado como pendente.** O banco só guarda o aviso já enviado (Menções), com a marca do dia, para não repetir.
4. **Leitura que falha nunca vira "calendário vazio":** faixa vermelha dizendo qual fonte não leu (como já é hoje).
5. **Alerta é vermelho** (regra do projeto). **Datas como texto AAAA-MM-DD**, nunca `new Date` para o dia; `hojeISO`/`diaISO` de `Interface.tsx`.
6. **Nenhum dado real é alterado.** A rotina só lê as datas e escreve avisos na caixa de Menções; os 43 retornos vencidos do CRM e as demandas atrasadas **não são mexidos**.
7. Valem as regras do projeto: português do Brasil, `npx vite build`, teste com gravações bloqueadas, push só com a pergunta clicável.

## 6. Riscos e como evitá-los
- **Avalanche no primeiro dia.** Há demandas vencidas desde setembro e 43 retornos do CRM vencidos. Como o usuário quer **um aviso por item**, o risco é real: a rotina só avisa item **em aberto** e vencido **há até 15 dias**, e cada item tem **um aviso só**, que se renova (não acumula um por dia). Antes de ligar a rotina, mostrar ao usuário **quantos avisos cada pessoa receberia no primeiro dia** (simulação só de leitura) e ligar só com o OK dele.
- **Dois alertas para a mesma coisa.** O frete sem entrega e a saída próxima da viagem já avisam: a nova rotina **não os repete**; eles só ganham a data no calendário.
- **Calendário pesado.** Cada fonte lê só o período mostrado e no máximo 500 linhas, como hoje.
- **Quem é "o setor que age" errado.** A regra de cada fonte está na tabela 4 e deve ser conferida pelo usuário antes de a rotina ligar.

## 7. Dúvidas em aberto (a decidir com o usuário)
Respondidas em 12/11/2026 e já passadas para a seção 2: o campo de recebimento do veículo é a previsão; um aviso por item; limite de 15 dias; o setor vê tudo da sua área.

Ainda em aberto (sigo com a suposição, **a confirmar**):
1. **Horário** do alerta: 8h de Brasília, dias úteis, igual às outras rotinas.
2. **Prazo sem responsável** (demanda sem `responsavel_email`): vai para o setor de destino e, se não houver, para quem abriu.
3. **Setor que age de cada fonte** (coluna "Quem vê" da seção 4): conferir a tabela com o usuário antes de ligar a rotina (C5).

## 8. Etapas

| Etapa | O que é | Depende de |
|---|---|---|
| **C0** | Função do banco `calendario_eventos` com as fontes que **já aparecem** no calendário (compromissos, retorno do CRM, tarefas Financeiro/Engenharia, manutenção), `CalendarioTab` passando a lê-la, e o **selo** "hoje" / "atrasado" nos eventos. Sem rotina de alerta ainda. | — |
| **C1** | **Prazos de demandas** (4.1) na função, no calendário e no alerta. | C0 |
| **C2** | **Contato com cliente** (4.2): licitações e limites do CRM; retorno atrasado só de card vivo. | C0 |
| **C3** | **Recebimento de carros** (4.3). | C0 e a dúvida 1 |
| **C4** | **Recebimento de material** (4.4). | C0 |
| **C5** | **Rotina de alertas** (resumo diário nas Menções, `pg_cron`, 8h) + "Para você hoje" na tela Início + simulação do primeiro dia antes de ligar. | C1 a C4 (pode sair já com C0 e crescer) |

Cada etapa vai para produção sozinha, com teste (gravações bloqueadas, respostas simuladas) e este plano atualizado no mesmo commit. Quando uma etapa mexer em tela com manual, o manual muda junto.

## 9. Quadro de acompanhamento

| Etapa | Situação |
|---|---|
| C0 — função única e tela | ✅ 12/11/2026. Funções `calendario_eventos_base` / `calendario_eventos` aplicadas (`supabase/sql/calendario_eventos.sql`); `CalendarioTab.tsx` lê só por ela e mostra o selo "Vence hoje" / "Atrasado há N dias" (vermelho) e o botão "Abrir". Cada pessoa vê só o que é dela (testado com 4 perfis: Almoxarifado vê carros e compras; Compras vê compras; Comercial vê os seus; Admin com "todos" vê tudo). Teste de navegador 9/9. |
| C1 — prazos de demandas | ✅ demanda avulsa (prazo), prazo de cada etapa da demanda composta (12/11/2026, com alerta) e OS do SAC (orçamento e entrega). `demandas_setoriais.data_prevista_recebimento` ficou de fora: em 12/11/2026 só as 26 demandas já concluídas a tinham, nenhuma em aberto. |
| C2 — contato com cliente | ✅ retorno do CRM e do Telecom Vendas (só card vivo: perdido, desistência e faturado saem), limite de proposta e de análise do card, e as quatro datas das licitações abertas (esclarecimentos, proposta, análise técnica, disputa). |
| C3 — recebimento de carros | ✅ (com um limite) chegada do veículo da OP de adaptação (previsão, só enquanto não há chassi lançado), entrega ao cliente da OP e retorno da vistoria de pátio feitos. **Feito em 12/11/2026 (pedido do usuário):** a OS do SAC ganhou o campo **Previsão de chegada do veículo** (`sac_ordens_servico.previsao_chegada_veiculo`, na Nova OS de veículo que vem à fábrica, não remota, e no menu ⋯ da OS enquanto o carro não chegou; não aceita dia passado), com a fonte `sac_chegada_veiculo` no calendário (alerta). Na OP **não há campo novo**: o `oples.data_chegada_veiculo` já era a previsão e só mudou o rótulo para "Previsão de chegada do veículo" (Nova OP, edição, detalhe e troca de fluxo). Testado no banco com a linha desfeita: antes 0, com a previsão 1 (3 pessoas avisadas), depois da chegada 0. As OS que já existiam ficam sem previsão (nenhuma foi mexida). |
| C4 — recebimento de material | ✅ entrega e coleta da compra já comprada e não recebida (com alerta); frete com data prevista, saída da viagem e reserva de veículo da frota entraram **só no calendário, sem alerta** (frete e viagem já têm aviso próprio). **Chicotes e serralheria:** as tabelas de pedido com data prevista estão vazias; o trabalho deles anda pelas demandas de setor, que não têm data prevista em aberto, então não há data a mostrar. |
| C5 — rotina de alertas | ✅ **Ligada em 12/11/2026 com o OK do usuário:** rodada uma vez à mão (153 avisos novos para 18 pessoas; a segunda rodada renovou os mesmos 153 sem duplicar) e agendada (`calendario-avisar`, job 3, dias úteis às 8h de Brasília). Simulação feita antes (15 dias de atraso): **149 avisos para 18 pessoas** — 47 de entrega de OP, 34 de compras (9 compras), 32 de licitações (16), 12 do Financeiro (7), 11 do SAC, 8 de retorno do CRM, 6 de compromissos, 2 de chegada de carro, 1 de demanda; a maior caixa é de 24 avisos (duas pessoas do Comercial). Para ligar: `select cron.schedule('calendario-avisar', '0 11 * * 1-5', 'select public.calendario_avisar()')`; para desligar: `select cron.unschedule('calendario-avisar')`. |

**O que chega na caixa de Menções:** contexto `calendario`, um aviso por item e por pessoa (chave `fonte:registro:dia`), "Hoje: …" ou "Atrasado há N dias: …", que se renova a cada dia útil (volta a não lido) e é marcado como resolvido pelo banco quando o item deixa de ser alerta. O "Para você hoje" da tela Início já conta as Menções não lidas, então não precisou de código novo.

**Fora do alerta, de propósito:** as tarefas da Engenharia (só aparecem no calendário) e o frete sem entrega e a saída da viagem (já têm aviso próprio, não foram incluídos).
