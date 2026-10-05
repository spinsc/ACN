# Anexo — Centros de custo mais completos: pesquisa e proposta

> **ESTE ARQUIVO É O ANEXO (pesquisa e proposta de 05/10/2026). O ACOMPANHAMENTO DAS ETAPAS
> VIVE NA ETAPA 15 DO `PLANO_UX_FLUXO_TRABALHO.md`** (subetapas 15a a 15e, com o estado, as respostas do usuário
> às 6 perguntas e o que cada uma entrega). Em 05/10/2026 o usuário decidiu tratar os centros de custo como
> **uma etapa do `/ux-fluxo`, com PRIORIDADE antes do resto do plano**, e respondeu as perguntas da seção 4
> (resumo: todos os pacotes na ordem sugerida; orçamento por mês com atalho de valor anual dividido igual e
> pai à escolha; responsável opcional e visão por gerente como está; tipos configuráveis; estouro só avisa;
> comprometido sim). **Não mantenha o estado aqui: atualize a Etapa 15.**

> *(texto original abaixo)* **Documento vivo.** Nasceu de um pedido do usuário em 05/10/2026: *"Centro de custos deve passar por
> melhorias, tendo mais detalhamento e informações mais completas, está muito raso. Faça uma pesquisa de tudo
> que normalmente se tem em uma tela/programa de centros de custos e melhore."*
> **Combinado com ele (pergunta clicável):** primeiro **pesquisar e propor**; **nada é construído até ele
> marcar o que quer**. Este arquivo é a pesquisa e a proposta. Quando ele escolher, cada pacote vira uma etapa
> com teste, plano atualizado e autorização de publicação, como as etapas do `PLANO_UX_FLUXO_TRABALHO.md`.

**Já feito (05/10/2026, pedido à parte):** o **código** do centro é gerado pelo sistema (`SIGLA-NNN` e `PAI.NN`),
editável, e os 38 centros existentes foram renumerados, com o código trocado também onde estava escrito como
texto (ver a linha de 05/10/2026 em "Decisões tomadas" do plano de UX).

---

## 1. O que o sistema tem hoje (lido no código e no banco em 05/10/2026)

**Cadastro** (`centros_custo`, 38 centros, 13 raízes): código, nome, descrição, "pai" (árvore), ativo/inativo, e
agora o código anterior. **Só isso.** Não há responsável, tipo, empresa, vigência, orçamento nem regra de uso.

**Onde o centro é apontado** (por `centro_custo_id`, e também como texto em 5 tabelas):
compras (`pcp_pedidos_compra`, 46 com o id e 37 com texto), demandas (`demandas_setoriais` e `demandas_avulsas`),
despesas avulsas (`centro_custo_despesas`, 18: GER-001 com 10 e PROD-002 com 8), lançamentos da conciliação
bancária e a OP (coluna de texto, hoje sem nenhum uso). Na **solicitação de compra** o centro é **opcional**.

**Onde se enxerga** — Financeiro › Centros de custo: filtros de mês, ano e situação da compra; cinco cartões
(total gasto, centros ativos, recebidas, pendentes, **"sem centro"**); barras com os 10 maiores; tabela de centros
com total e quantidade (o pai soma os filhos); janela com as compras do centro e correção de valor, centro, data e
descrição; lançar **despesa avulsa** (inclusive parcelada, com medições); e o relatório "Centro de Custo" em
Relatórios (compras e despesas agrupadas por centro).

**O que não existe:** orçamento e saldo; responsável; evolução mês a mês; comparação com período anterior;
categoria da despesa; fornecedor/NF no lançamento; data de competência (só a data do pagamento); rateio entre
centros; custo por OP; permissão por gestor; fechamento do mês; exportação para planilha; alerta de estouro.

## 2. O que programas de centro de custo costumam ter (pesquisa)

Resumo do que se repete nas fontes (SAP, Odoo, Tally, Senior, Omie, manuais de ERP e de controladoria):

- **Cadastro com dono:** responsável pelo centro, **tipo/categoria** (produtivo, administrativo, comercial,
  investimento), empresa/unidade, **vigência** (válido de/até) e a diferença entre centro que só **agrupa** e centro
  que **recebe lançamento**.
- **Orçamento:** valor orçado por centro e por mês/ano, **realizado × orçado**, saldo, % consumido, e **alerta**
  quando chega perto ou passa do limite; muitos separam o **comprometido** (aprovado, ainda não pago) do realizado.
- **Análise:** evolução mensal, comparativo com o mês/ano anterior, ranking de fornecedores e de itens, divisão por
  **categoria de despesa**, por responsável e por **projeto/OP**, com **drill-down** até o documento.
- **Lançamentos:** categoria/conta, fornecedor, número da NF, **competência × caixa**, anexo do comprovante,
  **recorrentes** (aluguel, internet), **rateio entre centros** (ex.: 60% / 40%), estorno/ajuste, parcelas.
- **Governança:** centro **obrigatório** ao pedir compra, **visão por gestor** (cada gerente vê os seus centros e o
  financeiro vê todos), **trilha de alterações**, **fechamento do mês** (trava lançamento retroativo).
- **Saídas:** exportação (Excel/PDF), painel do gestor, resumo mensal por e-mail.

## 3. Proposta em pacotes (ordem recomendada — cada um se sustenta sozinho)

| # | Pacote | O que a pessoa passa a ver/fazer | Dado novo | Tamanho |
|---|---|---|---|---|
| **A** | **Ficha completa do centro** | No cadastro: **responsável**, **tipo**, **empresa** (ACN/DETECH), **vigência**, "só agrupa" × "recebe lançamento", **orçamento mensal e anual**. A lista mostra responsável, tipo e % do orçamento usado. | colunas novas em `centros_custo` | M |
| **B** | **Painel do centro** (a tela de detalhe) | Ao clicar num centro: **orçado × realizado × comprometido**, saldo, barra de consumo com **alerta** (80% e 100%), **evolução mês a mês**, **por categoria**, **por fornecedor**, últimas compras e despesas, e o consolidado com os filhos. | nada (usa A) | M–G |
| **C** | **Lançamento mais completo** | Despesa avulsa com **categoria**, **fornecedor**, **NF**, **data de competência**, **anexo** do comprovante, **recorrente** e **rateio entre centros** (%). | colunas em `centro_custo_despesas`; tabela de categorias | M–G |
| **D** | **Controle de uso** | **Centro obrigatório** na solicitação de compra (configurável), tela para **corrigir os "sem centro"** com conferência, e **visão por gestor** (cada responsável vê os seus centros). | uma configuração | M |
| **E** | **Relatórios e saídas** | **Custo por OP**, comparativo com o período anterior, **exportar para Excel**, **fechamento do mês** e resumo mensal por e-mail ao responsável. | tabela de fechamentos | M–G |

**Sugestão de ordem:** A → B (juntos já mudam a cara da tela e entregam o "orçado × realizado") → D → C → E.
Os pacotes C e E mexem em fluxo de pagamento e fechamento: pedem desenho com quem toca o financeiro.

## 4. O que preciso que ele decida

1. **Quais pacotes** quer (e em que ordem) — ou "todos, na ordem sugerida".
2. **Orçamento:** por centro e por **mês** (cada mês pode ter um valor) ou um **valor anual** dividido igual? O **pai**
   tem orçamento próprio ou é a soma dos filhos?
3. **Quem é responsável** de cada centro (hoje nenhum tem) e se o **gerente** passa a **ver só os seus** centros.
4. **Tipos de centro** que a empresa usa (sugestão: Produção, Administrativo, Comercial, Investimento/Ativos, Outros).
5. **Alerta de estouro:** só avisar (faixa vermelha e menção ao responsável) ou **bloquear** a aprovação da compra
   quando o saldo acabar? (Sugestão: só avisar.)
6. **Compras já aprovadas e não pagas** entram em **"comprometido"** no saldo? (Sugestão: sim.)

## 5. Fontes consultadas

- [Budget vs. actual variance analysis — Keboola](https://www.keboola.com/use-case/budget-vs-actual-variance-analysis-management-reporting)
- [Budget actual comparison — Prism ERP](https://docs.prismerp.net/financial/budget/budget-actual-comparison)
- [Budget & cost center management — Odoo (Ecosire)](https://ecosire.com/es/apps/odoo/budget-cost-center-management)
- [Cost control and cost analysis — Tally](https://tallysolutions.com/features/cost-control-and-cost-analysis)
- [Cost center variances — SoftGuide](https://www.softguide.com/function/cost-center-variances)
- [Cost center master data — SAP Help](https://help.sap.com/saphelp_46c/helpdata/EN/08/51457e43b511d182b30000e829fbfe/content.htm)
- [Master data in SAP cost center accounting — Espresso Tutorials](https://espresso-tutorials.com/blog/master-data-in-sap-cost-center-accounting)
- [Gestão de plano financeiro — Senior](https://documentacao.senior.com.br/gestaoempresarialerp/5.10.3/manual-processos/financas/gestao-plano-financeiro/gestao-plano-financeiro.htm)
- [Centro de custo por responsável — Consistem](https://ajuda.consistem.com.br/modulos/rh/manuais-de-telas/rh-folha-de-pagamento/cadastros-gerais-da-folha-de-pagamento/centro-de-custo-por-responsavel)
- [O que é centro de custo — Omie](https://www.omie.com.br/blog/o-que-centro-de-custo/index.md)
- [Rateio — Senior X Platform](https://documentacao.senior.com.br/seniorxplatform/manual-do-usuario/erp/mercado/rateio/rateio.htm)
