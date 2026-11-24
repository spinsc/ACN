# PLANO — "Ver valores" valendo no banco (opção B escolhida em 24/11/2026; V0 feita, V1 aguarda decisões)

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

## 8. Resultado da V0 — inventário e medição (24/11/2026; nada foi alterado no banco nem no código)

**Decisão do usuário:** opção **B** (proteger só o sensível): `cadastro_itens` (custo e markup), `oples` (valor total e mão de obra), `pcp_pedidos_compra` e `demandas_setoriais` (valor da compra) e `pcp_fretes` (frete e nota).

### 8.1 O que lê cada coluna (a lista a refazer tela a tela)

**No banco** (funções, gatilhos e visões que citam as colunas): só quatro, o que é uma boa notícia:
- `gerar_pedido_faturamento` e o gatilho `trg_pedido_faturamento` (leem `valor_compra` do pedido de compra e da demanda do setor);
- `unificar_item` (lê `custo_unit`);
- a visão `rh_comissoes` (lê `oples.valor_total`).
Limite da busca: ela acha quem cita o NOME da coluna; função que lê a linha inteira (`select *`, `%rowtype`) só aparece na V1 de cada tabela, com a leitura do corpo.

**No código** (arquivos que citam a coluna; `valor_total` é nome comum a várias tabelas, então a lista dele é um teto):

| Coluna | Arquivos | Quais |
|---|---|---|
| `custo_unit` | 9 | CadastroItensTab, CadastroProdutosTab, CotacoesTab, DesenvolvimentoFormularios, DesenvolvimentoModelo, FormacaoCalculo, FormacaoPrecosTab, KitEstrutura, MarkupTermometro |
| `custo_embalagem` | 2 | CadastroItensTab, FormacaoPrecosTab |
| `custo_fixo_pct` | 4 | CadastroItensTab, CadastroProdutosTab, CotacoesTab, FormacaoPrecosTab |
| `markup_pct` | 6 | CadastroItensTab, CadastroProdutosTab, CotacoesTab, FormacaoCalculo, FormacaoPrecosTab, MarkupTermometro |
| `valor_mao_de_obra` e `_serralheria` | 17 | AcnTabShared, ComissaoCalculo, ComissaoDocumento, CopiarOpOs, CrmTab, EdicaoDeLote, EquipeDaOp, FluxoMisto, NovaOpOsModal, OplEdicao, OpLote, OpLotes, RelatoriosTab, RHTab, SacResumoOS, SacTab, TrocaDeFluxo (+ FluxoEntrega e PainelProducaoTV na serralheria) |
| `oples.valor_total` | ~23 | AcnTabShared, AdminTab, ComissaoCalculo, ComissaoDocumento, ConciliacaoBancaria, CopiarOpOs, CotacoesTab, CrmTab, EdicaoDeLote, FiscalTab, FormacaoPrecosTab, NovaOpOsModal, OpDossie, OpDossieLote, OplEdicao, OpLote, OpLotes, ProducaoTab, RelatoriosTab, ResumoLoteOpl, RHTab, SacFluxo, SacTab |
| `valor_compra` | 18 | AcnTabShared, CentroCusto (4 arquivos), ComprasBuscaOrdem, ComprasFluxo, ComprasLigadas, ComprasTab, ConciliacaoBancaria, DemandaAvulsaPanel, FinanceiroTab, FormacaoOrdensCompra, LogisticaTab, MinhasSolicitacoesTab, OpVinculos, RelatoriosTab, SetorDemandaTab |
| `valor_frete` e `valor_nota` | 2 | LogisticaTab, OpVinculos |

### 8.2 O que a medição mostrou (linha de base, usuário comum, resposta montada em JSON)

| Consulta | Tempo | Tamanho |
|---|---|---|
| conferência de acesso (`esta_logado`) | 0,64 ms | — |
| lista de OPs (`select *`, 1.000) | **163 ms** (acima do limite de 120 do ensaio) | 4,6 MB |
| PCP: OPs com `select *` | 16 ms | 0,9 MB |
| Fiscal: OPs com `select *` | 16 ms | 0,8 MB |
| pedidos de compra (1.000) | 10 ms | 0,6 MB |
| cadastro de itens (tudo) | 99 ms | 4,8 MB |
| fretes | 1 ms | 22 KB |

Duas leituras: (1) a lista de OPs já passa um pouco do limite **antes** de qualquer mudança (a primeira medida de uma sessão sai mais cara; vale repetir antes da V2) e leva 4,6 MB por mil linhas, então qualquer junção extra pesa nela; (2) o cadastro de itens inteiro é 4,8 MB: ele já é lido por completo em várias telas, e tirar o custo e o markup dele **emagrece** a resposta de quem não precisa.

### 8.3 Achados que mudam o desenho

1. **`cadastro_itens` é a melhor primeira onda:** só 9 arquivos, todos do universo de preços e da Engenharia (nenhuma tela do Almoxarifado, Logística ou Chicotes cita o custo). **Aqui o critério certo talvez não seja "ver valores", e sim a aba:** quem precisa de custo e markup é quem tem Formação de Preços, Cadastro de itens, Cadastro de produtos, Cotações e Engenharia. Proposta: a tabela-irmã de custo abre por **aba** (como as tabelas da onda 3a), e a caixa "ver valores" continua mandando na tela.
2. **`oples` é a mais pesada:** quase toda tela de OP lê com `select *` e a comissão, o RH e a conciliação usam o valor. Tirar `valor_total` e a mão de obra da tabela comum mexe em ~23 arquivos. Alternativa a avaliar na V2: **visão básica da OP sem os valores para quem não pode ver** (padrão `crm_oportunidades_basico`), em vez de tabela-irmã, e só as telas de quem não vê valor passam a ler a visão.
3. **Compras e fretes** já têm a maior parte do código atrás de `podeVerValores` ou de aba; o risco está nas funções `gerar_pedido_faturamento` e no gatilho, que precisam continuar enxergando o valor.
4. **Quem hoje seria afetado:** só o Jairo e o Marlon (e a conta de teste). Telas deles: Almoxarifado, Chicotes, Logística, Vistorias, Demandas gerais. A Logística lê o pedido de compra, o frete e a OP: é a tela a conferir em toda onda.

### 8.4 O que preciso de você para começar a V1

- **O Admin vê sempre no banco?** (a proposta é que sim.)
- **Na V1 (`cadastro_itens`), abrir custo e markup por aba (recomendado) ou por "ver valores"?** Por aba protege de quem tem a caixa ligada mas não trabalha com preço; por "ver valores" segue a caixa do cadastro de usuário.
- **Janela de publicação:** a V1 troca a leitura de 9 telas e muda a tabela do banco; prefiro publicar à noite e conferir a Formação de Preços e o Cadastro de itens com a conta de teste antes de você abrir o sistema.
