# PLANO — "Ver valores" valendo no banco (proposto em 24/11/2026, nada construído)

> Origem: etapa 6 da revisão de permissões. A caixa **"Ver valores financeiros"** do cadastro de usuário (`auth_usuarios.ver_valores`) hoje só **esconde o número na tela**
> (`podeVerValores`, usado em ~26 arquivos). O banco entrega o valor a qualquer pessoa que entrou: quem chamar o banco por fora, ou abrir o que a tela esquece de esconder, vê tudo.
> Este plano diz o que seria preciso para o banco também esconder, e **pede decisões antes de começar** (seção 4).

## 1. Onde estamos

- **Quem está sem a caixa hoje (24/11/2026):** Jairo Borges (Almoxarifado) e Marlon de Amorim (Chicote), cada um com 6 telas (Demandas gerais, Almoxarifado ou Chicotes, Logística, Vistorias, Calendário, Dashboard). A conta de teste ZZTESTE também está sem a caixa.
- **O que o banco já protege por aba (Etapa 17):** Financeiro, conciliação, centros de custo e orçamento, cotações de fornecedor do Compras, frete (cotações e aprovações), card do CRM, licitações e Formação de Preços só abrem para quem tem a aba. Jairo e Marlon **não** têm essas abas, então não leem essas tabelas.
- **O que ainda chega a eles pelo banco** (tabelas lidas por qualquer pessoa que entrou, com coluna de dinheiro): `oples` (valor total, mão de obra, mão de obra da serralheria), `pcp_pedidos_compra` e `demandas_setoriais` (valor da compra), `pcp_fretes` (valor do frete e da nota), `pcp_pedidos_faturamento` (valor), `cadastro_itens` (custo unitário, embalagem, custo fixo e markup: **a fórmula do preço**), `compras_requisicoes`, `terceiros_servicos` (valor combinado e final), `sac_ordens_servico` (orçamento e valor), `viagens` (custos), `garantia_atendimentos` (custos), `frota_manutencoes` (custo), `vouchers_servico`, `cotacoes_propostas` e `crm_vendas`. São cerca de 30 tabelas.
- **Já fechado por perfil e fora deste plano:** salário e dados do RH (`rh_funcionarios`, comissões), ponto.

## 2. Por que não é um interruptor

O Supabase usa **um só papel de banco para todos os usuários** (o "crachá" só diz quem é a pessoa). Por isso:
- não dá para tirar a coluna de dinheiro de uma pessoa só com permissão de coluna;
- uma regra por linha esconde linhas, não colunas;
- esconder valor de verdade exige **tirar a coluna da tabela comum e pô-la onde só quem pode ver consegue ler**.

## 3. Como seria (o desenho proposto)

**Tabela-irmã de valores, uma por tabela protegida** (padrão `<tabela>_valores`: o `id` da linha + só as colunas de dinheiro), com a regra: lê e grava quem entrou **e** `ver_valores` ligado (função `pode_ver_valores()`, usando `uid_efetivo()` e `(select ...)` como manda o CLAUDE.md). A tabela comum perde as colunas de dinheiro.

- **Telas que mostram valor:** passam a ler a tabela-irmã junto (uma consulta a mais, ou uma visão que junta as duas **só para quem pode**). Quem não pode recebe a linha sem o valor, o que a tela já sabe tratar (`podeVerValores` falso).
- **Telas que gravam valor** (nova OP, cotação, pedido de compra, serviço de terceiro): gravam nas duas tabelas por **uma função do banco, tudo ou nada**. Quem não pode ver valor não grava valor (hoje isso também não acontece pela tela).
- **Cálculos que dependem do valor** (comissão, relatórios, conciliação, gatilhos): conferir um a um, porque passam a ler outra tabela. Funções e gatilhos de servidor leem a tabela-irmã com o poder do dono, então seguem funcionando.
- **Alternativa mais leve, por tabela, quando só a leitura importa:** manter a coluna e criar uma visão "básica" sem o dinheiro para quem não pode (como já existe em `crm_oportunidades_basico` e `licitacoes_basico`), e fechar a tabela cheia por aba. Só serve onde as telas de quem não pode ver valor leem a visão.

## 4. Decisões que preciso de você ANTES de construir

1. **Vale a pena?** Hoje só 2 pessoas estão sem a caixa e nenhuma tem tela financeira. Escolha:
   - **(A) Deixar como está e escrever isso no manual:** "ver valores" é para não poluir a tela, não é sigilo. Custo zero.
   - **(B) Proteger só o que é sensível de verdade:** a **fórmula do preço** (`cadastro_itens`: custo, markup, custo fixo), `oples` (valor total e mão de obra), `pcp_pedidos_compra` / `demandas_setoriais` (valor da compra) e `pcp_fretes`. Recomendado se for fazer.
   - **(C) Todas as ~30 tabelas.** Só se houver exigência de auditoria ou de contrato.
2. **Quem vê para a Engenharia, o PCP e o Compras?** Os que hoje têm a caixa continuam vendo. Confirmar que **nenhuma tela de quem não vê valor precisa do número para calcular** (o Almoxarifado e a Logística usam quantidade, não valor, mas conferir).
3. **O Admin sempre vê?** A caixa também pode ser desmarcada para um Admin (a tela passa a esconder). Proposta: **o Admin vê sempre** no banco (a caixa dele só esconde na tela), para nunca ficar sem acesso ao que administra.
4. **Pode ficar uma semana com tela e banco diferentes?** A construção é por onda e cada onda tem uma janela em que a tela lê dos dois lugares (ver seção 5).

## 5. Ondas (se a decisão for B)

Cada onda: **ensaio de custo antes** (`supabase/sql/ensaio_de_custo.sql`) e **`/saude-banco` depois**; cópia dos valores em tabela `*_antes_<data>`; teste com a conta ZZTESTE com gravações bloqueadas; uma tabela por vez; **nada é apagado da tabela comum até a tela nova estar publicada e conferida** (as colunas antigas saem só numa onda final, com o seu OK).

| Onda | Tabela | O que muda | Risco |
|---|---|---|---|
| V0 | — | Inventário: para cada tabela, **quem lê, quem grava, quais gatilhos e funções usam a coluna** (busca no código e no banco); função `pode_ver_valores()`; medir o custo | baixo |
| V1 | `cadastro_itens` | Custo unitário, embalagem, custo fixo e markup para `cadastro_itens_valores`. É a mais lida (4.645 itens, Formação de Preços, estrutura, estoque): **a mais delicada** | alto |
| V2 | `oples` | `valor_total`, mão de obra e mão de obra da serralheria. Lida por quase toda tela | alto |
| V3 | `pcp_pedidos_compra`, `demandas_setoriais`, `compras_requisicoes` | Valor da compra. O Compras já esconde por `ComprasBuscaOrdem` | médio |
| V4 | `pcp_fretes`, `pcp_pedidos_faturamento` | Frete e nota | médio |
| V5 | demais da lista (SAC, viagens, garantia, terceiros, frota, vouchers) | Uma de cada vez, só se a decisão for C | baixo a médio |
| V6 | — | Tirar as colunas antigas das tabelas comuns (**com o seu OK**) e atualizar o manual | médio |

**Cuidados que já sabemos:**
- as visões e funções que montam valor (`vw_*`, calendário, relatórios) precisam ler a tabela-irmã;
- relatórios e planilhas hoje exportam valor para quem a tela deixa: conferir que não saem mais para quem não pode;
- o `Ver como` do Admin precisa mostrar o que a pessoa vista vê (a regra usa `uid_efetivo()`);
- a regra de custo do banco: política com `(select public.f())`, nunca `public.f()` solto, e leitura medida em JSON, não `count(*)`.

## 6. O que fica fora

- Sigilo do salário e do RH (já fechado por perfil).
- Esconder o valor de quem **tem** a caixa mas não precisa dele (é outra decisão: seria uma caixa por tela).
- Tirar a caixa da tela e deixar só o banco decidir (a tela continua escondendo; o banco passa a recusar).

## 7. Próximo passo

Você responde as decisões da seção 4. Com **A**, só atualizo o manual e encerro. Com **B** ou **C**, começo pela V0 (inventário e medição), sem mexer em nada, e trago o resultado antes da V1.
