# Avisos, regras e dúvidas

## Quem recebe cada aviso

O módulo avisa de duas formas: pelo **Calendário** e pelo painel **Avisos** (botão **Avisos** do topo).

| Situação | Quem recebe | Onde aparece |
|---|---|---|
| Serviço **agendado** para um dia | Quem pediu e, nos tipos da Adaptação (película, plotagem, pintura), a equipe da Adaptação | **Calendário** (o dia, o prestador e o tipo) |
| **Data desejada** de um pedido que ainda não foi agendado | Quem pediu e, nos tipos da Adaptação, a Adaptação | **Calendário**, só como lembrete (sem alerta) |
| Serviço que passou do dia agendado **sem ser dado como realizado** | Quem pediu e a Adaptação, nos tipos dela | Painel **Avisos**, seção **Datas para cuidar** (**um aviso por visita e por dia**); o botão **Abrir** leva ao serviço |
| **Serviço realizado** | Quem pediu | **Calendário**, só como registro (sem alerta) |
| **Pintura da Serralheria** concluída | O perfil Produção | WhatsApp: "escolha o prestador e o dia (ou entre numa ordem de pintura)" |
| **Pagamento pedido** | O Financeiro | Uma demanda nova na aba **Demandas** do Financeiro |

> **Dica:** quando o aviso de atraso for resolvido (o serviço é dado como realizado, reagendado ou cancelado), ele **some sozinho**. Quem já cuidou e quer tirar do painel usa **Já cuidei**.

## Quem pode o quê

| Ação | Quem pode |
|---|---|
| Pedir um serviço | Qualquer usuário |
| Ver o Quadro, a Agenda, a Lista e as ordens | Qualquer usuário |
| Imprimir o contrato | Qualquer usuário |
| Editar o serviço, agendar (tipos comuns), dar como realizado, voltar, cancelar, pedir pagamento, ligar a saída da vistoria | Quem pediu (e a Adaptação, nos tipos dela), gerentes e Admin |
| **Marcar o dia** de película, plotagem e pintura | **Adaptação**, gerentes e Admin (quem pediu só diz o dia desejado) |
| Dar como realizado película, plotagem e pintura | Quem pediu **ou** a Adaptação, gerentes e Admin |
| Montar, imprimir, enviar, fechar e cancelar a **ordem de serviço em lote** | Admin, gerentes e Adaptação |
| Cadastrar **prestadores** | Admin, gerentes e a aba Produção |
| Editar **tipos de serviço** e o **modelo do contrato** | Só o Admin |
| Ver **valores** (combinado, final, diferença, **A pagar**, dinheiro do relatório) | Quem tem a permissão de ver valores |

> **Atenção:** quem **não vê valores** continua preenchendo o **valor final** ao dar o serviço como realizado (é obrigatório), mas **não vê os valores** nos cartões, na lista, no contrato impresso nem no relatório.

## O que trava cada passo

| Passo | O que precisa estar certo |
|---|---|
| Pedir | Tipo escolhido, descrição com pelo menos 3 letras; carro que já tem serviço aberto do mesmo tipo fica de fora (**Pedir mesmo assim** libera) |
| Agendar | Prestador, dia e período; o serviço não pode estar numa ordem montada ou enviada |
| Dar como realizado | Prestador, dia (não no futuro) e **valor final** (zero vale) |
| Voltar, reabrir, cancelar | **Motivo** com pelo menos 5 letras |
| Pedir pagamento | Serviço realizado, valor final maior que zero, **um só prestador** e sem pedido aberto |
| Enviar as peças (ordem) | **Cópia assinada anexada**, dia do envio (não no futuro nem mais de 60 dias atrás) e previsão de retorno |
| Fechar a ordem | Dia do retorno e **valor final de cada serviço** |
| Tirar serviço de uma ordem | Motivo, e a ordem não pode ficar vazia |
| Salvar e aprovar o contrato | Ao menos uma empresa com nome e texto das cláusulas preenchido |

> **Atenção:** se a tela disser que o serviço **"mudou de situação"** e que **"a tela já foi atualizada"**, outra pessoa mexeu no mesmo serviço antes de você. Nada foi gravado pelo seu clique: feche a janela, confira onde o serviço está agora e refaça o passo, se ainda fizer sentido.

## Quando a tela não consegue ler

A regra do módulo é **nunca dizer "não tem nada" quando, na verdade, não conseguiu ler**. Se uma leitura falhar, você vê uma **faixa vermelha** dizendo que **não foi possível ler**, com **Tentar de novo**. Isso vale para o Quadro, a Agenda, a Lista, as ordens, o relatório e o quadro **Serviços de terceiros** da OP e da OS. Quando o que falhou foi só a situação do pagamento ou da saída da vistoria, o serviço aparece com um selo neutro (**Pagamento pedido, situação não lida** ou **Saída ligada**), sem afirmar o que não foi lido.

## Os serviços que já nasceram da caixinha da OP

Em **23/11/2026**, as OPs que estavam no PCP, no Almoxarifado e na Adaptação com a caixinha **Necessita serviço de terceiro** marcada viraram serviços do módulo: **154 OPs, 23 vendas, 203 serviços** (TS-00001 a TS-00203), todos em **A definir**.

- Eles estão **sem prestador, sem dia, sem valor e sem lista de peças**.
- Foram criados em nome de **"Migração (caixinha da OP)"**, **sem solicitante**: por isso, nesses serviços, **só a diretoria** e, nos tipos da Adaptação, **a Adaptação** conseguem mexer.
- A OP marcada **sem tipo** virou **Outro**, com a observação de escolher o tipo certo ou cancelar.
- Nas vendas 1583.2608 e A1226.2604 a pintura virou **Pintura eletrostática**; nas outras vendas (A1731.2610, A1799.2611 e A1347.2606) entrou como **Pintura** comum.
- As OPs que **já tinham passado** dessa fase (CQ em diante) ficaram de fora.

> **Dica:** o primeiro trabalho de quem cuida dos prestadores é abrir o filtro **Sem prestador** e escolher prestador e dia desses 203 serviços, em grupo (marque os carros e use **Agendar**).

## Dúvidas comuns

**Pedi uma película e não consigo agendar.** O dia de película, plotagem e pintura é **marcado pela Adaptação**. Você ficou com o selo **Sem data** e já deixou o **dia desejado** para a Adaptação ler. Se a Adaptação não está vendo, chame o Admin para conferir o tipo na aba **Tipos de serviço**.

**Não consigo mexer no serviço.** Ou ele está numa **ordem de serviço em lote** montada ou enviada (a janela mostra a faixa azul com **Abrir a ordem**), ou é um dos 203 serviços da migração (só diretoria e Adaptação mexem), ou foi pedido por outra pessoa e o tipo não é da Adaptação.

**O prestador que eu preciso não aparece.** Ele não faz aquele tipo (**Prestadores › Que serviços faz**), está **inativo** ou ainda não foi cadastrado. Quem cadastra: Admin, gerentes e Produção.

**Apareceu "Choque de data" em vermelho.** O mesmo prestador tem **outra visita** no mesmo dia e período. É só um aviso: você pode agendar mesmo assim. Lembre que **a mesma venda, no mesmo prestador e dia, é uma visita só**: carros da mesma venda não batem entre si.

**Quero pedir de novo um serviço que o sistema diz que já existe.** O aviso vermelho mostra o número do serviço aberto do mesmo tipo para aquele carro. Se for mesmo outro serviço, marque **Pedir mesmo assim**.

**O relatório não bate com a Lista.** A Lista mostra o que está em aberto e o que terminou nos **últimos 120 dias**; o relatório lê **o mês escolhido inteiro**, pelo dia em que o serviço foi **realizado**. Serviço **agendado em mês anterior e sem baixa** não entra nas contas (aparece só na faixa âmbar).

**O contador "A pagar" não aparece.** Ele só aparece para quem **vê valores**. O mesmo vale para o cartão **A pedir ao Financeiro** do relatório.

**O "A pagar" não baixou depois de pedir o pagamento.** O contador baixa quando o pedido **nasce** como demanda no Financeiro. Se o selo do serviço diz **situação não lida**, a tela não conseguiu ler a demanda: clique em **Atualizar**. Se o Financeiro **cancelou** a demanda, o serviço **volta a "A pagar"**: peça de novo.

**Pedi o pagamento do prestador errado.** Fale com o Financeiro para **cancelar a demanda**; o serviço volta a "A pagar" e você pede de novo, já com o prestador certo.

**Cancelei por engano.** O cancelado **não volta**: peça o serviço de novo. O pedido antigo continua no filtro **Cancelados**, com o motivo.

**O contrato saiu com a faixa "MINUTA".** O Admin ainda **não aprovou** o texto na aba **Modelo do contrato**. Não assine a folha: peça a aprovação e imprima de novo.

**O contrato saiu com campos em branco.** É de propósito: o que o cadastro não tem (CNPJ do prestador, endereço, chassi…) sai **em branco para escrever à mão**. Para sair preenchido, complete o cadastro do prestador ou o modelo do contrato.

**A janela de impressão não abriu.** O navegador barrou a janela. A tela avisa em vermelho: libere as janelas deste endereço e clique de novo.

**A Serralheria concluiu a peça e não nasceu a requisição do Compras.** É a regra nova: a pintura vira **serviço de Pintura eletrostática** neste módulo. Se não nasceu o serviço, a demanda ganhou o botão **Pedir a pintura agora** (vale até 30 dias depois de concluída).
