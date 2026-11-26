# Análise de automações possíveis no ACN Sinal Verde

**Data:** 26/11/2026 · **Pedido do usuário:** "Analisar o sistema é pensar em possíveis automações."
**Estado:** só análise. **Nada foi construído nem gravado no banco.** Cada item abaixo é uma proposta que só vira trabalho se o usuário escolher.

## Como esta análise foi feita (e o que ela NÃO é)

- Li o que o projeto já registra de si mesmo (o `CLAUDE.md`, os planos concluídos e os trechos "fora desta rodada" e "a confirmar"), conferi no código o que já é automático e fiz buscas pontuais para checar cada afirmação abaixo.
- **Não** li as 368 peças do código uma a uma e **não** medi quanto tempo cada pessoa gasta em cada tarefa. O "ganho" de cada item é uma estimativa minha de quanto trabalho repetido ele tira, e deve ser confirmado com quem faz a tarefa.
- As contagens do banco (`pg_stat`) estão zeradas ou velhas, então não usei volume de registros para ranquear. Onde há número real, ele vem do próprio `CLAUDE.md` (datas citadas).

## O que já é automático hoje (para não propor de novo)

| Automação | Como roda |
|---|---|
| Avisos de datas do sistema inteiro (Calendário integrado) | rotina `calendario-avisar`, dias úteis, 8h |
| Frete que saiu e não teve entrega confirmada | `fretes-avisar-sem-entrega`, dias úteis, 8h |
| Viagem em Provisionamento que sai em até 2 dias com algo faltando | `viagens-avisar-saida-proxima`, dias úteis, 8h |
| Ponto dos CLT da Detech (cópia da Secullum) | `ponto-secullum-manha` (8h30) e `ponto-secullum-noite` (20h30) |
| Entrada de estoque no recebimento, reserva, lista de material, estrutura de instalação | gatilhos e regras do banco e do código |
| OP só de serviço de terceiro avança sozinha ao fim dos serviços | gatilho `terceiros_avancar_op` |
| Viagem nasce sozinha quando o Almoxarifado fecha o kit da OP de adaptação externa | gatilho `oples_gerar_viagem` |
| Espera de material do Desenvolvimento libera sozinha na chegada | gatilho em `compras_entregas` |
| CEP preenche cidade e UF | `Cep.ts` (ViaCEP, com BrasilAPI de reserva) |

São **só cinco rotinas agendadas** no banco. Quase tudo o que "avisa" depende de alguém abrir a tela. É aí que está a maior parte do ganho.

## Resumo: por onde eu começaria

| # | Automação | Ganho | Esforço | Precisa de decisão sua? |
|---|---|---|---|---|
| 1 | **OP parada por etapa**: aviso ao responsável quando a OP fica N dias sem sair da etapa | Alto | Baixo a médio | Sim: quantos dias por etapa |
| 2 | **Varredura de qualidade dos cadastros** (painel e aviso semanal) | Médio a alto | Baixo | Sim: quem recebe |
| 3 | **Importador da estrutura de instalação por planilha** (hoje feito por mim, veículo a veículo) | Alto | Médio | Sim: padronizar a planilha |
| 4 | **Pedido de pagamento do terceiro sugerido ao dar como realizado** | Médio | Baixo | Sim: aprovar ou automático |
| 5 | **BOM pré-montada** para o PCP só conferir | Alto | Médio | Sim: o PCP aceita conferir em vez de montar? |
| 6 | **Consulta de CNPJ** ao cadastrar cliente, fornecedor e prestador | Médio | Baixo | Não |
| 7 | **Resumo semanal por gerente** (e-mail ou WhatsApp) | Médio | Médio | Sim: conteúdo e canal |
| 8 | **Monitor da saúde do banco** que avisa o Admin | Médio (evita travada) | Baixo a médio | Não |

O resto da lista (seção "Demais ideias") é mais incerto ou depende de decisões de negócio.

---

## Detalhe dos oito primeiros

### 1. OP parada por etapa
- **Hoje:** só a OS do SAC tem "parada há 7 dias" (`status_desde`). A OP não tem. A aba Relatórios mostra "Paradas" apenas pelo grupo de status (Devolvida e parecidos), não pelo tempo na etapa. Quem percebe uma OP esquecida é quem olha a fila.
- **Automatizaria:** uma rotina diária (mesmo modelo das cinco existentes) que lê `logs_movimentacao_opl`, calcula há quantos dias a OP está na etapa e avisa o responsável da etapa (PCP, Almoxarifado, Adaptação, Qualidade, Fiscal, Comercial) pelo painel Avisos, **uma vez por OP e por etapa**, como já se faz no Calendário.
- **Cuidado:** OP esperando material ou viagem não está "esquecida": é preciso excluir (ou separar) as esperas já registradas no sistema (pendência de compra, desenvolvimento aguardando, viagem não aprovada).
- **Decisão sua:** limite em dias por etapa (sugiro começar com 7 para todas e ajustar).

### 2. Varredura de qualidade dos cadastros
- **Hoje:** os buracos aparecem um a um, quando alguém esbarra. Exemplos já medidos: 49 de 232 serviços de terceiro sem modelo, placa ou chassi na OP; 88 de 225 cards do CRM e 152 de 165 licitações sem contato (26/10/2026); 13 de 25 CLT da Detech sem ligação com a ficha do RH (19/11/2026); CPF e nascimento faltando no RH; uma OP de envio real hoje sem CEP nem UF (A1750.2611, vista no teste de hoje).
- **Automatizaria:** uma tela "Saúde dos cadastros" com a contagem de cada buraco e o dono de cada um, mais um aviso semanal a quem corrige. **Só mostra e avisa: não corrige nada sozinha.**
- **Por que ganha:** transforma erro que trava a embalagem, o frete ou o ponto (descoberto na hora H) em tarefa feita antes.

### 3. Importador da estrutura de instalação por planilha
- **Hoje:** cada veículo novo chega como planilha Excel numerada (a 295 da Titano, a 297 da L200, a 304 da Shineray) e eu monto o SQL à mão: 19 a 35 materiais por veículo, regras de chicote, lista de "o que não consegui atribuir". É o trabalho manual mais caro e mais repetido que vejo no projeto.
- **Automatizaria:** uma janela no Admin que lê a planilha, mostra a estrutura proposta e **a lista de itens sem atribuição ou atribuídos por suposição** (regra que o usuário já fixou), e só grava depois do OK. O mesmo vale para a importação de itens do Focco (`lista.xls`).
- **Cuidado:** só funciona se a planilha tiver sempre o mesmo desenho. Hoje ela varia (por exemplo, uma moto vendida em dobro com a planilha de uma moto só, caso da A1802).
- **Decisão sua:** fixar o modelo da planilha com quem a prepara.

### 4. Pedido de pagamento do terceiro sugerido ao dar como realizado
- **Hoje:** o serviço realizado vira "A pagar" e alguém precisa abrir o pedido ao Financeiro (a conta existe, o clique é manual).
- **Automatizaria:** ao dar como realizado com valor final preenchido, abrir a janela de pedido já preenchida (ou, se o usuário quiser, criar o pedido sozinho). O valor continua vindo do banco, nunca da tela.
- **Decisão sua:** sugerir e confirmar (mais seguro, minha recomendação) ou criar direto.

### 5. BOM pré-montada
- **Hoje:** o PCP clica em "Jogar na BOM" depois de conferir a estrutura e as respostas; quando falta resposta, a BOM nem nasce. Isso vem aparecendo como pendência em todas as estruturas novas (Ranger, Titano, L200, S10, Shineray).
- **Automatizaria:** quando a venda, a estrutura do veículo e as respostas estão completas, a BOM nasce **como proposta** na fila do PCP, com o selo "pronta para conferir". Ele aprova ou corrige.
- **Cuidado:** hoje a conta da estrutura não multiplica a resposta pelo número de unidades da OP (a A1802 mostrou isso). Isso precisa ser decidido antes, senão a automação espalha o erro mais rápido.

### 6. Consulta de CNPJ
- **Hoje:** o sistema só consulta CEP (ViaCEP e BrasilAPI). Cliente, fornecedor, prestador e as empresas do contrato de terceiros têm razão social, endereço e CNPJ digitados à mão. Não achei consulta de CNPJ no código.
- **Automatizaria:** ao digitar um CNPJ válido, buscar razão social, situação cadastral e endereço (a BrasilAPI já é usada) e preencher o que estiver vazio. Aviso em vermelho para CNPJ baixado ou inapto.
- **Cuidado:** serviço de terceiro fora do ar não pode barrar o cadastro (a mesma regra do CEP).

### 7. Resumo semanal por gerente
- **Hoje:** só a Garantia tem relatório semanal. Existem as funções de e-mail e de WhatsApp, mas só para avisos pontuais.
- **Automatizaria:** uma mensagem por gerente na segunda de manhã: OPs paradas (item 1), compras esperando aprovação, serviços de terceiro sem prestador ou sem data, fretes sem entrega, viagens a aprovar.
- **Decisão sua:** quem recebe, o que entra e o canal.

### 8. Monitor da saúde do banco
- **Hoje:** o `/saude-banco` é um comando que eu rodo depois de publicar ou quando reclamam. A instância é pequena e já travou duas vezes (12/11 e 24/11).
- **Automatizaria:** uma rotina que mede a CPU e os timeouts a cada poucos minutos, guarda o histórico e avisa o Admin quando passar do limite.
- **Cuidado:** a própria medida precisa ser leve, para não piorar o que mede.

---

## Demais ideias (menos maduras)

**Avisos e cobranças**
- **Compras:** pedido parado em cotação ou em aprovação há N dias (hoje só o atraso de entrega avisa).
- **CRM:** card parado e retorno vencido para todos os cards. A regra "parado há 7 dias" já existe, mas só na aba Vendas do Telecom.
- **Licitações:** vigência de ata, contrato e aditivo vencendo, e saldo do contrato baixo.
- **Terceiros:** serviço "A definir" sem prestador há N dias; "A pagar" sem pedido há N dias.
- **Frota:** revisão vencida ou perto (hoje só aparece na tela da frota, não avisa ninguém).
- **RH:** fim do contrato de experiência (a data de admissão existe) e aviso de aniversariantes à equipe.

**Passagens e conferências que hoje dependem de clique**
- **Conciliação bancária:** conciliar sozinho, em lote e com confirmação, o que bate valor, data e fornecedor sem dúvida (as sugestões já existem).
- **Hora extra × ponto:** comparar sozinho o pedido com a batida e destacar a diferença. Hoje é só informação ao lado do pedido. **Continuaria sendo o aprovador quem decide.**
- **Fiscal:** emissão da nota por integração. É o maior ganho potencial e o maior esforço, e depende de qual programa emite hoje. Precisa de conversa antes.

**Rotinas de desenvolvimento**
- **Nota de atualização do dia** montada a partir do histórico de commits, como rascunho (a regra de mostrar ao usuário antes de publicar continua).
- **Conferência de publicação** (deploy, bundle no ar, saúde do banco) num comando só.

**Mais longe (depende de decisão maior)**
- Pré-preencher OP e licitação lendo o PDF do pedido ou do edital: pertence ao `PLANOS FUTUROS/PLANO_IA.md`, que o usuário descartou por ora.
- Chamar o vendedor por WhatsApp além da menção nos avisos críticos (OP entregue, frete saiu, aprovação pendente). A função de envio existe; falta decidir quais avisos merecem.

## O que eu NÃO recomendo automatizar

- **Aprovação de hora extra, de compra, de viagem e de verba:** o sistema deve apresentar e lembrar, e a pessoa responsável continua decidindo.
- **Correção de dado real em massa** sem lista e contagem mostradas antes (regra 4 do projeto).
- **Qualquer envio ao cliente** (e-mail, WhatsApp ou proposta) sem pessoa conferindo.

## Próximo passo

Dizer quais itens (ou todos os 8) viram trabalho, em que ordem, e responder as decisões da coluna da direita. Cada um entra como uma fatia própria, com teste, manual, plano atualizado e pedido de publicação separado.
