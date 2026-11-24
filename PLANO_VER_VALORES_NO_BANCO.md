# PLANO — "Ver valores" valendo no banco (opção B escolhida em 24/11/2026; V0 e V1 feitas e publicadas; V2 desenhada, aguardando início)

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

## 9. V1 feita (24/11/2026) e desenho da V2 (OPs)

### 9.1 V1 — `cadastro_itens`: publicada
Custo unitário, custo da embalagem, custo fixo % e markup % moram em `cadastro_itens_valores` (política por aba: cadastro_itens, cadastro_produtos, formacao_precos, cotacoes, crm, licitacoes, telecom; Admin sempre). 4.645 itens copiados sem diferença; cópia de segurança `cadastro_itens_custos_antes_20261124`. As colunas antigas **continuam** em `cadastro_itens` (saem na V6, com OK do usuário). Telas: Cadastro de itens, Produtos, Cotações e Formação de Preços; `unificar_item` e o histórico de unificações também. Código: `CadastroItensValores.ts`. Testada no navegador (lista, edição, gravação separada, busca na Formação).

### 9.2 V2 — `oples`: o que o levantamento achou (usuário escolheu "fazer a V2 completa")
- **Colunas:** `valor_total`, `valor_mao_de_obra` e `valor_mao_de_obra_serralheria` (nulas quando não informadas; **nulo ≠ zero**: várias telas decidem por `!= null`). Nenhum preço dentro de `itens_vendidos`. 543 OPs; 459 com valor total, 345 com mão de obra. A função `pode_ver_valores()` **não existe** ainda.
- **No banco:** nenhuma função ou visão cita as colunas (a busca não achou); gatilhos da `oples`: avisar e gerar viagem, entrega pela chegada, lead time e `sync_norm`.
- **No código:** ~30 arquivos (comissão, RH, Relatórios, Conciliação, Fiscal, dossiê da OP e do lote, resumo do lote, edição da OP e em lote, Nova OP, Copiar OP, CRM, troca de fluxo, fluxo misto, Painel TV, cartão da OP em todo setor).
- **Achado que muda o desenho — a mão de obra também é "sinal de rota", não só dinheiro:** `temSerralheria()` / `motivoSerralheria()` (`FluxoEntrega.ts`) mandam a OP para a fila da Serralheria quando `valor_mao_de_obra_serralheria > 0`; `faltaApontar()` (`EquipeDaOp.tsx`) decide se falta apontar equipe pelo `valor_mao_de_obra` e pelo da serralheria; `FluxoMisto` e `TrocaDeFluxo` usam `== null`/`> 0`. Quem NÃO vê valores (Jairo, Marlon, conta de teste) trabalha justamente nessas filas: se a mão de obra sumir da leitura deles, a OP some da Serralheria. **Por isso a V2 precisa de duas marcas sem valor (ex.: `oples.tem_mo_adaptacao` e `oples.tem_mo_serralheria`, booleanas, mantidas por gatilho a partir dos valores) e essas telas passam a ler as marcas.**
- **Leitura espalhada:** o cartão da OP (`AcnTabShared`, bloco "Financeiro") lê `opl.valor_*` do objeto que cada setor trouxe com `select *`; sem cuidado, o bloco some até para quem pode ver.

### 9.3 Desenho (em ondas, cada uma publicável e reversível)
- **V2a (banco, aditiva):** função `pode_ver_valores()` (Admin ou `ver_valores` diferente de falso, pelo `uid_efetivo()`, usada como `(select …)`); tabela `oples_valores` (op_id, os 3 valores, `atualizado_em`; política por `pode_ver_valores()`); duas marcas booleanas em `oples` com gatilho; cópia dos 543 e cópia de segurança; **gatilho que copia das colunas antigas para a tabela nova** (as telas que ainda gravam nas colunas antigas continuam valendo). Ensaio de custo antes (gatilho na `oples`, tabela quente) e só fora do horário.
- **V2b (telas que só LEEM):** comissão e RH, Relatórios, Conciliação (hoje filtra por `valor_total` no banco: passa a partir de `oples_valores`), Fiscal, dossiês, resumo do lote, Painel TV, cartão da OP; `temSerralheria`, `faltaApontar`, fluxo misto e troca de fluxo passam às marcas.
- **V2c (telas que GRAVAM):** Nova OP, CRM (lote e edição), Copiar OP, edição da OP e em lote, troca de fluxo: gravam na tabela nova (e o gatilho mantém as colunas antigas até a V6).
- **V2d (fechar):** colunas antigas zeradas, gatilho invertido (o que alguém ainda gravar nelas vai para a tabela nova e some da `oples`); conferência com `ver_valores = false`.
- Regras já decididas pelo usuário (24/11/2026): Admin vê sempre; quem lê é decidido pela caixa "Ver valores" (para a `oples` o critério é a caixa, não a aba).
- **Riscos a vigiar:** custo da lista de OPs (já 163 ms, acima do limite do ensaio, antes de qualquer mudança); comissão do RH (conferir que o valor calculado de um mês fechado não muda); rodar `/saude-banco` depois de cada onda.

- **V2b feita em 24/11/2026 (local, ainda não publicada):** `OpValores.ts` (`anexarValoresDasOps`, `anexarValoresDaOp`) devolve a OP com os três valores vindos de `oples_valores` (nulos se a pessoa não pode ver; leitura recusada vira `erro`). Passaram a ler por ela: card da OP e lote (`AcnTabShared`), comissão dos técnicos (`ComissaoCalculo`, que para com mensagem se a leitura falha), divisor do lote (`OpLotes`), comissão comercial (`RelatoriosTab`), conciliação (o filtro "tem valor" saiu do banco), dossiê (`carregarDossie`) e resumo do lote. `temSerralheria`, `motivoSerralheria`, `faltaApontar` e o Painel TV usam as marcas `tem_mo_*` (com o valor como reserva até a V2d). Ficou para a V2c: `FluxoMisto.loteNasceuDoFluxoMisto` (distingue M.O. nula de zero, que a marca não distingue; só é chamada com valores já lidos) e `TrocaDeFluxo`. Teste com ZZTESTE (sem a caixa): `oples_valores` volta vazio, Produção, PCP e Fiscal abrem sem erro de console, 0 gravações reais.

- **V2c feita em 24/11/2026 (local):** as leituras que alimentam formulário e conta de gravação trazem o valor de `oples_valores`: abrir a edição da OP e desmembrar em unidades (CRM), copiar OP (barra se a leitura falha), trocar o fluxo da unidade, editar o lote (`lerOutrasUnidadesDoLote`) e o recarregamento depois de salvar a edição. **As gravações de valor não mudaram de propósito:** continuam nas colunas antigas e o gatilho de espelho já as leva à tabela nova; quem não vê valores já não envia esses campos (CRM, `OplEdicao` e `OpLote` os escondem). O desvio das gravações (colunas antigas zeradas, gatilho invertido) é a V2d. Limite conhecido: copiar uma OP por quem não vê valores gera a cópia sem valor (nulo).

- **V2d escrita em 24/11/2026, NÃO aplicada** (`supabase/sql/ver_valores_v2d_fechar_oples.sql`): o gatilho `oples_desviar_valores` leva toda gravação de valor das colunas antigas para `oples_valores` e deixa a OP com nulo (nulo nunca apaga o valor guardado; para zerar, grava 0), o espelho da V2a sai, as colunas antigas são zeradas (cerca de 470 OPs) e a conferência desfaz tudo se algo não bate. Conferido no banco: nenhuma função ou visão lê essas colunas além dos gatilhos da própria V2. **Efeito a conhecer:** `select *` da OP devolve os três campos nulos; apagar um valor pela tela não o apaga (grava-se 0). Aplicar fora do horário, com ensaio de custo antes e /saude-banco depois.

- **V2d APLICADA em 24/11/2026 às 23h (migração `ver_valores_v2d_fechar_oples`), depois do ensaio de custo sem falha (lista de OPs 104 ms, limite 120):** as colunas antigas de `oples` ficaram nulas nas 471 OPs, a tabela `oples_valores` tem as mesmas 471 linhas (igual à cópia `oples_valores_antes_v2d`), as marcas seguem 329 (adaptação) e 58 (serralheria) e o gatilho `oples_desviar_valores` é o único dessa família. Conferência com a conta sem a caixa: `oples_valores` vem vazio, Produção, PCP e Fiscal abrem sem erro e os selos de Serralheria não mudaram. **Falta:** conferir com uma pessoa que tem a caixa (cartão da OP, comissão, dossiê) e, depois, a V3 (compras e demandas), a V4 (fretes e faturamento) e a V6 (retirar as colunas antigas, só com OK).

## 10. V3 — pedido de compra e demanda do Compras: inventário e desenho (24/11/2026; nada foi alterado no banco nem no código)

**Decisão do usuário (24/11/2026): proteger os três lugares onde o pedido guarda dinheiro**, não só `valor_compra`.

### 10.1 Onde está o dinheiro (conferido no banco)
- `pcp_pedidos_compra` (253 pedidos, 208 com valor): `valor_compra`; dentro de `vencedoras` (lista) a chave `valor`, ao lado de `cotacao_id`, `fornecedor` e `itens`, que **não** são dinheiro e o recebimento por fornecedor da Logística usa; dentro de `itens` (lista) a chave `valor_unitario`, ao lado de `quantidade_comprada`, `nome`, `item_id` etc.
- `demandas_setoriais` (447 demandas, 25 com `valor_compra`, todas do setor Compras) e a lista de itens da demanda, que também tem `valor_unitario` (`DemandaItens.tsx`).
- `compras_requisicoes` tem `valor_total` e `valor_unitario`, mas a tabela está **vazia** (0 linhas): fora desta onda.
- `pcp_cotacoes_fornecedores` (cotações) e `pcp_pedidos_faturamento` já são tratadas à parte (a primeira já fechada por aba na onda 3a; a segunda é da V4).

### 10.2 O que lê no banco
Só `gerar_pedido_faturamento` (gatilho `trg_pedido_faturamento`, AFTER UPDATE): ao virar "Comprado" copia `NEW.valor_compra` para `pcp_pedidos_faturamento.valor`. Depois de a coluna ficar nula ela precisa ler a tabela nova (função `security definer`). `compras_dividir_pedido` mexe em `itens` e `vencedoras` pelo índice do item: se o preço unitário sair de `itens`, a tabela nova precisa ser dividida junto.

### 10.3 O que lê no código
`valor_compra`: 18 arquivos (AcnTabShared, CentroCusto×4, ComprasBuscaOrdem, ComprasFluxo, ComprasLigadas, ComprasTab, ConciliacaoBancaria, DemandaAvulsaPanel, FinanceiroTab, FormacaoOrdensCompra, LogisticaTab, MinhasSolicitacoesTab, OpVinculos, RelatoriosTab, SetorDemandaTab). `vencedoras`: 14 (também ChegadaDeItens, ComprasEntregas, DivisaoDoPedido, EsperaDeMaterial, OpPendencias, FormacaoPrecosTab). A tela do Compras (`ComprasTab.tsx`) mexe nos preços de item das cotações e do pedido.

### 10.4 Desenho
- Tabela-irmã `pcp_pedidos_compra_valores(pedido_id, valor_compra, vencedoras_valores jsonb, itens_valores jsonb)`, com a mesma política da V2 (`pode_ver_valores()`): `vencedoras_valores` é `{cotacao_id: valor}` e `itens_valores` é a lista de `valor_unitario` na ordem de `itens`. Equivalente para `demandas_setoriais_valores(demanda_id, valor_compra, itens_valores)`.
- O `OpValores.ts` ganha o par para pedidos: `anexarValoresDosPedidos(pedidos)` devolve o pedido com `valor_compra`, `vencedoras[].valor` e `itens[].valor_unitario` recolocados (nulos se a pessoa não vê); leitura recusada vira `erro`.
- Mesmo roteiro da V2: V3a (SQL aditivo + gatilho espelho + cópia), V3b (telas que só leem), V3c (telas que gravam e formulários que preenchem), V3d (desviar e zerar), cada uma com ensaio de custo antes e `/saude-banco` depois, V3d só fora do horário.
- **Cuidado que a V2 não teve:** o dinheiro está DENTRO de listas JSON que também levam dados de rota (fornecedor, itens que cada vencedora cobre, quantidade comprada). O gatilho da V3d tira só as chaves de dinheiro e as telas de recebimento seguem lendo o resto sem mudança. O gatilho `gerar_pedido_faturamento` passa a ler a tabela nova, e `compras_dividir_pedido` a dividir `itens_valores` junto.
- **Quem é afetado:** hoje só quem está sem a caixa (duas pessoas da Logística e a conta de teste). A tela da Logística lê o pedido, as entregas e as vencedoras: é a primeira a conferir em cada onda.

### 10.5 Próximo passo
Escrever a V3a (SQL aditivo, não aplicado) e mostrar antes de aplicar.
