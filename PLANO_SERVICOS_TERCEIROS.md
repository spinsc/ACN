# Plano — módulo de Serviços de terceiros

Criado em 22/11/2026, a partir de uma conversa com o usuário. **Estado: desenhado, nada construído.** Este arquivo é a fonte da verdade; cada fatia leva `npx vite build`, teste no navegador com gravação bloqueada e este plano atualizado no mesmo commit.

## 1. A necessidade (palavras do usuário, 22/11/2026)

A ACN vende e faz adaptação e instalação de iluminação e sinalização de viaturas, para-choques de impulsão, celas e outros. Parte do trabalho é de **terceiros**: quem instala película, quem faz a plotagem e os adesivos de caracterização, lavagem, funilaria, mecânica, corte e dobra de aço, pintura eletrostática (suportes, carretinhas e outras peças).

Hoje um serviço de terceiro é uma demanda que nasce em qualquer setor (o vendedor vende direto, outro setor pede no meio do processo, a Engenharia pede junto do projeto de corte e dobra, a pintura vem às vezes da Engenharia, às vezes da Serralheria, às vezes do Almoxarifado). Mas **nada diz** qual prestador fará, quanto cobrou, quando virá, se foi feito, quantos estão pendentes ou concluídos. **O mais importante é a AGENDA.**

## 2. O que o sistema já tem (medido em 22/11/2026)

- **Caixinha na OP** (`oples.servico_terceiro`, `tipos_servico_terceiro`, `obs_servico_terceiro`; tipos `Película, Blindagem, Plotagem, Pintura, Outro`, em `NovaOpOsModal.tsx`): só marca que a OP *precisa*. 214 OPs marcadas (133 película, 54 pintura, 15 plotagem, 4 outro, 9 sem tipo).
- **Pagamento a terceiro** (demanda do Financeiro, `PagamentoDeTerceiro.tsx`, `demandas_avulsas.pagamento_terceiro`): só o pedido de pagar.
- **Vistoria de pátio** (`vistorias_patio`): registra a saída e o retorno do carro, com destino e previsão de retorno.
- **Pintura da Serralheria** (`PinturaSerralheria.tsx`): ao concluir a peça, abre uma requisição de compra para o Compras.
- **Calendário integrado** (`calendario_eventos_base`): fonte única de datas; nada de terceiro.
- **Fornecedores do Compras** (`compras_fornecedores`): cadastro de quem vende material.

## 3. Decisões do usuário (22/11/2026)

1. **Todos podem solicitar** um serviço de terceiro, e **cada um cuida dos seus**. **Exceção:** em **pintura, película e plotagem quem informa a melhor data para o prestador é a ADAPTAÇÃO**, mesmo quando o Comercial pediu. Nos outros tipos quem pediu resolve a data. **Gerentes e Admin podem decidir sobre os pedidos dos outros.**
2. **Cadastro PRÓPRIO de prestadores** (não reaproveita o de fornecedores do Compras).
3. **Valor:** combinado antes (ao escolher o prestador) e **valor final** depois (ao concluir), com a diferença visível.
4. **Tudo de uma vez**, inclusive o pedido de pagamento ao Financeiro e a migração das OPs que já têm a caixinha marcada.
5. **Pintura da Serralheria vira serviço de terceiro** (a requisição que nascia no Compras deixa de nascer).
6. **Pintura eletrostática precisa de ORDEM DE SERVIÇO em LOTE:** juntar várias demandas e emitir **uma ordem que o prestador assina, com a relação de todas as peças enviadas juntas**.
7. **TODO serviço de terceiro tem impressão de um "contrato simples" para assinar** (não só a pintura).
8. **Pagamento:** botão **"Pedir pagamento"** no serviço concluído; o pedido do Financeiro nasce preenchido. Não é automático.
9. **Vistoria de pátio ligada:** quando o serviço é "no prestador" (o carro ou a peça sai), o serviço aponta a saída da vistoria e mostra se já saiu e voltou.
10. **OPs que já têm a caixinha:** migrar **só as ainda abertas**, mostrando a lista e a contagem antes de gravar (ver a dúvida 6.1).
11. **Quadro (kanban), Agenda e Lista lado a lado, e o módulo abre pelo Quadro** (o sistema lembra a última visão de cada pessoa). O quadro é o padrão das Viagens, do SAC, do Compras e do CRM; a agenda sozinha não mostra o pedido que ainda não tem data nem prestador.
12. **Três colunas: A definir, Agendado e Realizado.** "No prestador", atrasado, choque de data e a pagar são **selos calculados**, não colunas (nenhum passo a mais para quem atualiza).
13. **Quem confirma "Realizado" nos tipos da Adaptação (película, plotagem, pintura): quem pediu ou a Adaptação.** Gerentes e Admin sempre podem.
14. **Todos veem todos os serviços; só edita quem pode** (assim nenhum choque de data fica escondido). Valores só para quem já vê valores no sistema.

## 4. Desenho

### 4.1 O serviço de terceiro (a unidade do módulo)

Um pedido, com um número legível (`TS-00001`, dado pelo banco, como o do pedido de compra) e quatro situações: **Solicitado → Agendado → Realizado**, e **Cancelado** (com motivo; nada se apaga). "Prestador definido" e "com valor combinado" **não são etapas**: são pendências que o painel mostra (sem prestador, sem data, sem valor). No quadro, a situação Solicitado aparece na coluna **A definir**.

Campos: tipo; descrição; solicitante (pessoa e setor); **ligação** (OP, OS do SAC, demanda, projeto da Engenharia ou nenhuma); prestador; valor combinado e valor final; **onde é feito** (na fábrica, ou no prestador); data desejada, data e período agendados, data realizada; quem conferiu; peças (descrição e quantidade); anexos (desenho de corte e dobra, por exemplo); lote; saída da vistoria; pedido de pagamento; histórico.

### 4.2 Tipos de serviço (cadastro com regra)

Cada tipo diz **quem marca a data** (Adaptação ou quem pediu) e o **onde padrão**. Sementes: Película, Plotagem, Pintura (Adaptação marca a data), Blindagem, Lavagem, Funilaria, Mecânica, Corte e dobra, Pintura eletrostática, Outro. O Admin cria tipo novo sem mexer em código.

### 4.3 Prestadores (cadastro próprio)

Nome, razão social, CNPJ ou CPF, contato, telefone (`CampoTelefone`), e-mail, endereço, **tipos que faz**, ativo, observação. Nada se apaga: desativa.

### 4.4 Telas do módulo: Quadro, Agenda e Lista (o ponto principal é a agenda)

**Quadro — abre primeiro** (decidido com o usuário em 22/11/2026, depois de uma prévia desenhada). Três colunas: **A definir** (a situação Solicitado), **Agendado** e **Realizado**; o Cancelado sai do quadro e fica no filtro "Cancelados". No alto, quatro contadores que também filtram: **sem prestador**, **sem data**, **atrasados** e **a pagar**; filtros por tipo, setor, prestador, pessoa e período. O cartão mostra tipo, número (TS-00044), descrição, ligação (OP, OS, demanda, projeto), prestador, data e período, valor combinado (só para quem vê valores) e **selos calculados**: *sem prestador* e *sem data* (âmbar), *atrasado* e *choque* (vermelho), *hoje*, *no prestador desde dd/mm* (vem da Vistoria de pátio), *aguardando assinatura* (da ordem de lote), *a pagar* ou *pago* (do pedido de pagamento) e, no lote da pintura, *OS-000X · N peças*.

**Como o cartão anda** (o modelo é `ViagemFluxo.ts`, o mesmo das Viagens e do SAC):
- **A definir → Agendado:** exige prestador, data e período. Nos tipos da Adaptação (película, plotagem, pintura) a data só a Adaptação, os gerentes e o Admin informam: o pedido do Comercial espera com o selo "sem data" e mostra a data desejada que ele escreveu.
- **Agendado → Realizado:** exige o dia em que foi feito, o valor final e quem conferiu (nos tipos da Adaptação, quem pediu ou a Adaptação; nos outros, quem pediu; gerentes e Admin sempre).
- **Voltar uma coluna ou cancelar:** pede motivo; nada se apaga. Tudo vai para o histórico do serviço.
- **Duas pessoas no mesmo pedido:** a mudança só vale se o cartão ainda está na coluna que a pessoa viu.
- **Celular e tablet:** todo cartão tem o menu "Mover para…" (arrastar é só um complemento), como no SAC. Quando o cartão não pode ir para a coluna escolhida, a tela diz o motivo.
- O lote da pintura eletrostática segue a ordem (ver 4.5).

**Agenda**

- **Visão de agenda** no módulo: semana e mês, **por prestador** e por tipo, com aviso em vermelho de choque (dois serviços do mesmo prestador no mesmo período).
- **Calendário integrado:** ramo novo `terceiro_servico` em `calendario_eventos_base`, para quem pediu, a Adaptação (nos tipos dela) e gerentes. Alerta de serviço atrasado (agendado, data passou, não realizado), no painel de Avisos como as demais datas.
- **Painéis:** os contadores do alto (sem prestador, sem data, atrasados, a pagar) valem nas três visões; relatório do mês por prestador (quantos, quanto combinou, quanto cobrou).

**Lista:** a mesma busca e os mesmos filtros em tabela (coluna "Ações" fixa, como nas outras telas), para conferência e relatório. **Outras abas do módulo:** Prestadores, Ordens de pintura e Tipos (só o Admin edita os tipos).

### 4.5 Pintura eletrostática em lote — a Ordem de serviço

- Vários serviços do tipo pintura eletrostática, **do mesmo prestador**, entram numa **ordem de serviço de terceiro** (`terceiros_ordens`, número próprio), com data de envio, previsão de retorno e **a relação de todas as peças** (de todos os serviços do lote, com a quantidade e a OP ou demanda de origem).
- A ordem é **impressa para o prestador assinar** (e a ACN), com campo para anexar a cópia assinada. Enquanto não houver a cópia assinada, a ordem fica "aguardando assinatura".
- Tirar um serviço do lote é possível até a ordem ser enviada.
- **Os serviços do lote seguem a ordem** (proposta minha, a confirmar na T4; dúvida 6.8): o prestador e a data da ordem valem para todos os serviços dela, que andam juntos para Agendado; no retorno, a ordem oferece fechar todos de uma vez, e cada serviço ainda leva o valor final e quem conferiu.

### 4.6 O contrato simples (todo serviço)

Impressão (mesmo padrão de `SacImpressaoOS.ts`, A4, assinatura embaixo): identificação da ACN e do prestador, objeto (tipo e descrição), peças ou veículo, local, valor combinado, prazo e data agendada, responsabilidades básicas, assinaturas. O **texto das cláusulas** é minuta minha, a ser aprovada pelo usuário (e, se quiser, revista por jurídico) antes de valer; fica num único lugar, editável pelo Admin.

### 4.7 Quem pode o quê (conferido no banco, não só na tela)

- Qualquer usuário ativo **solicita**, e **todos veem todos os serviços** (quadro, agenda, lista e a OP), mas só edita quem pode (decidido em 22/11/2026). **Valores** (combinado e final) só aparecem na tela para quem já vê valores no sistema, como no Compras (dúvida 6.7: se o banco também os esconde).
- **Quem pediu** edita o seu (prestador, valor, data, conclusão), **menos a data** de tipo cuja data é da Adaptação: essa quem marca é a Adaptação (aba Adaptação).
- **Realizado** nos tipos da Adaptação (película, plotagem, pintura): confirma **quem pediu ou a Adaptação**; nos demais tipos, quem pediu.
- **Gerentes e Admin** decidem sobre qualquer pedido.
- A gravação passa por **funções do banco** (`security definer`, identidade por `uid_efetivo()`, conferência da situação de antes como as outras passagens do sistema), para duas pessoas não atropelarem o mesmo pedido.

### 4.8 Entradas (todo setor pede do seu jeito)

Botão **"Solicitar serviço de terceiro"** na OP (a caixinha atual passa a abrir a solicitação), na OS do SAC, na Engenharia (junto do projeto: corte e dobra com o desenho anexado), na Serralheria, no Almoxarifado e na tela própria do módulo.

### 4.9 Ligações com o que já existe

- **Financeiro:** "Pedir pagamento" cria a demanda do Financeiro já preenchida (favorecido = prestador, CNPJ, valor final, vínculo à OS ou OP), usando `PagamentoDeTerceiro.tsx`.
- **Vistoria de pátio:** serviço "no prestador" aponta a saída (`vistorias_patio`), e a previsão de retorno da vistoria acompanha a do serviço.
- **Serralheria:** ao concluir a peça com pintura, nasce um **serviço de pintura eletrostática** no módulo, no lugar da requisição do Compras.
- **Migração das OPs:** ver 6.1. **Nenhum dado real é gravado sem mostrar antes a lista e a contagem.**

## 5. Fatias (cada uma funciona sozinha)

| Fatia | O que entrega | Estado |
|---|---|---|
| **T1** | Tabelas e regras do banco (tipos, prestadores, serviços, ordens, política `etapa17_logado`, numeração, funções de gravação); cadastro de tipos e de prestadores | ⬜ |
| **T2** | Pedido de serviço: janela de solicitar, **Quadro** (A definir, Agendado, Realizado, regras de mover e o menu "Mover para…"), lista, painéis de pendência, quem pode o quê, botões de entrada (OP, OS, Engenharia, Serralheria, Almoxarifado) | ⬜ |
| **T3** | **Agenda** (semana/mês por prestador e tipo, choque) e ramo no Calendário integrado com alerta de atraso | ⬜ |
| **T4** | Contrato simples impresso (todo serviço) e **Ordem de serviço em lote da pintura eletrostática**, com relação de peças e cópia assinada | ⬜ |
| **T5** | "Pedir pagamento" ao Financeiro, ligação com a Vistoria de pátio, Serralheria gera serviço (sai a requisição do Compras) e a migração das OPs abertas | ⬜ |
| **T6** | Relatório do mês por prestador, manual do módulo (`MANUAIS/servicos-terceiros`) e conferência final com a auditoria de layout | ⬜ |

Antes de cada fatia: ensaio de custo do banco quando mexer em política, função ou gatilho; `/saude-banco` depois de publicar. Tela nova já nasce no padrão do design system (`Interface.tsx`, `Feedback.tsx`) e passa na auditoria de layout nos 7 tamanhos.

## 6. Dúvidas em aberto (a confirmar com o usuário antes da fatia que as usa)

1. **Quais OPs migrar.** "Só as ainda abertas" pega **205 das 214** (quase todas, porque "aberta" aqui é "não faturada"). Muitas já passaram da fase em que o terceiro age (27 em "Aguarda Emissão NF", 15 em "Faturado e Disponível", 3 em CQ). Proposta: migrar só as que ainda não chegaram ao CQ (Em Espera PCP 1, Aguardando Almox 38, Aguardando Início 95, Em Produção 18 = **152**), e não as que já saíram da produção, que a equipe conhece e dariam falso "pendente". A decidir na T5.
2. **Pintura nas OPs.** O tipo "Pintura" da caixinha (54 OPs) é pintura eletrostática ou pintura de funilaria? Decide se vira o tipo "Pintura eletrostática" (com ordem em lote) ou "Pintura" comum.
3. **Que tipos entram na lista inicial** e quais são "Adaptação marca a data" (hoje: pintura, película, plotagem).
4. **Texto do contrato simples** (T4): o usuário aprova a minuta.
5. **Prestador acessa o sistema?** Suposição: **não** (o prestador só recebe o papel assinado; a agenda é interna).
6. **Período do agendamento:** manhã, tarde, dia todo e horário fixo? Suposição: manhã, tarde ou dia todo.
7. **Valor no banco** (T1): a tela esconde o valor de quem não o vê; falta decidir se o banco também o esconde (uma visão sem valores, como a do CRM). Suposição: o mesmo padrão do Compras, em que só a tela esconde.
8. **Lote da pintura eletrostática** (T4): a ordem leva o prestador e a data, e os serviços do lote acompanham (ver 4.5). Proposta minha, ainda não vista pelo usuário.

## 7. Andamento

- 22/11/2026 — conversa de desenho com o usuário; decisões da seção 3; plano escrito. Nada construído.
- 22/11/2026 — prévia do Quadro e da Agenda desenhada (dados inventados) e decidida com o usuário: **Quadro com três colunas** (A definir, Agendado, Realizado) e selos calculados, **abre pelo Quadro**, **Realizado nos tipos da Adaptação: quem pediu ou a Adaptação**, **todos veem tudo e só edita quem pode** (decisões 11 a 14). Nada construído.
