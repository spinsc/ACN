# Avisos, regras e dúvidas

## Quem recebe cada aviso

Os avisos chegam na caixa de **Menções** (o ícone @ no alto do sistema). Clicar no aviso abre a OP ou a viagem por cima da tela em que você está.

| Quando | Quem recebe | O que diz |
|---|---|---|
| Alguém **inicia a produção**, **conclui** a produção, mexe na serralheria ou escreve um recado no **Acompanhamento** | Quem acompanha a OP (vendedor, PCP, quem foi marcado com @) | O texto do recado: "Produção iniciada. Responsável: …. BOX: …", "Produção concluída…", e assim por diante |
| Alguém marca **Veículo chegou à matriz** | PCP, Adaptação e o vendedor da OP | A chegada do veículo |
| Uma **viagem** da OP é aprovada (chega a Provisionamento) | Cada setor com a sua parte; para a Adaptação: equipe, veículo e km de saída | Falta a parte do seu setor |
| A viagem **sai em 2 dias ou menos** com algo faltando (segunda a sexta, 8h) | Adaptação (equipe, veículo, km) e Financeiro (verba) | O que falta para a equipe sair; **uma vez só** por viagem |
| A Produção **define a data** de uma OS veicular, **confirma a chegada** do carro, **envia o orçamento** ou deixa a OS em **revisão pendente** | O SAC | O que a Produção fez, com cliente e OS |
| Alguém é marcado como **participante de um agendamento** de manutenção | A pessoa marcada | "Você foi adicionado ao agendamento da manutenção da OP … em … (período)" |

## Quem pode o quê

| O que | Quem |
|---|---|
| Ver a tela e usar as cinco abas (iniciar, concluir, BOX, equipes, vouchers, agendamentos, SAC veicular) | Quem tem a aba **Adaptação** |
| Registrar **Veículo chegou à matriz** | Admin, gerentes e quem tem as abas SAC, PCP, Adaptação, CRM ou Comercial |
| Aprovar a viagem da OP externa | A direção (Admin e gerentes) |
| **Pendências** da OP: liberar | O PCP (a Adaptação só conclui depois) |
| **Resolver a revisão de orçamento** de uma OS veicular | O SAC |
| Editar a janela completa da OP (itens vendidos, prazos, status) | Admin e gerentes |

## O que trava cada passo

| Passo | Só segue se… |
|---|---|
| **Iniciar a produção** | Há pelo menos um **BOX** escolhido; no modo **Dupla**, os dois técnicos; no modo **Equipe**, uma equipe |
| **Concluir a produção** | Todas as **pendências** (fabricação e compra) estão **concluídas no setor, recebidas pelo Almoxarifado e liberadas pelo PCP**; e a leitura das pendências deu certo |
| **Concluir o retrabalho** | Você confirma a pergunta (o tempo do retrabalho fica gravado) |
| **Definir data** (SAC veicular) | Você escolheu a data |
| **Enviar o orçamento** (SAC veicular) | Há pelo menos um item |
| **Iniciar a manutenção** (SAC veicular) | Há técnico (individual), os dois técnicos (dupla) ou uma equipe |
| **Concluir a manutenção** (SAC veicular) | O total dos itens bate com o orçamento aprovado; se não bate, a OS fica em revisão e o SAC resolve |
| **Salvar um voucher** | Tem **Tipo de serviço** e **Nº PV / OP** |
| **Criar uma equipe** | Tem **Nome** e **Head line** |
| **Confirmar a chegada do carro** (SAC veicular) | A OS ainda está na etapa que você viu: se o SAC mexeu antes, o sistema avisa para atualizar a tela e **não grava** |

## Como o tempo é contado

- O cronômetro da OP conta **horas úteis**: segunda a sexta, das **8h às 17h45**. Fora desse horário ele **não anda** e aparece o selo **Fora do expediente**.
- **Pausar** para o cronômetro; **Retomar** continua e soma o tempo parado ao total que será descontado.
- Ao **concluir**, o sistema grava o tempo de produção (horas úteis menos as pausas); no retrabalho, grava o tempo do retrabalho à parte.
- Na OS veicular, o cronômetro (**KPI de manutenção**) começa em **Iniciar Manutenção** e termina em **Concluir**.

## Dúvidas frequentes

**A OP sumiu da fila.**
Confira (1) a **fila** escolhida (uma OP de envio não aparece na fila Adaptação; use **Todas**), (2) os **filtros** (use **Limpar filtros**) e (3) a faixa azul no alto: uma OP de **Adaptação externa** só entra depois que a **viagem é aprovada**.

**A faixa vermelha diz "Não foi possível ler as OPs da Produção".**
A leitura falhou (internet ou servidor). Clique em **Tentar de novo**. Isso **não quer dizer que a fila esteja vazia**: a lista que aparece é a da última vez que deu certo.

**Aparece "Sem BOX informado" em âmbar.**
A OP foi iniciada em lote ou antes de o BOX existir. Menu ⋯ > **BOX do carro** e marque onde o carro está.

**Cliquei em Iniciar em lote e a OP ficou "Sem responsável".**
É assim de propósito: o início em lote não pede responsável nem BOX. Depois, use **Atribuir técnicos/equipes** (planilha) ou **Editar responsável** em cada OP, e **BOX do carro**.

**Não consigo concluir a OP.**
Há uma **pendência** de compra, fabricação ou chicote. A mensagem diz qual. Cobre o setor dela e o PCP; só depois que a pendência estiver liberada o botão **Concluir** funciona.

**O carro mudou de BOX.**
Menu ⋯ > **BOX do carro** > marque o novo > **Salvar BOX**. O histórico guarda onde ele passou.

**Entrou uma pessoa na OP depois que ela já tinha começado.**
Menu ⋯ > **Equipe** > escolha em **Responsáveis** ou **Apoios** > **Adicionar**. Não precisa trocar o modo.

**Apareceu "sem percentual no RH" ao lado de um nome.**
O RH ainda não cadastrou o percentual de comissão dessa pessoa. Avise o RH: sem ele, não sai comissão.

**Devolvi uma OP ao PCP por engano.**
Não há botão para desfazer na Adaptação. Peça ao PCP que devolva a OP para a Adaptação.

**O CQ reprovou e não sei o que fazer.**
Leia o motivo no quadro vermelho abaixo da linha. Clique em **Iniciar retrabalho**, conserte e use **Concluir → CQ**.

**O agendamento está errado.**
Clique na etiqueta da OP no calendário, confirme o cancelamento (a OP volta a aguardar agendamento) e agende de novo. Para OS do SAC, use **Remarcar** (só aparece se o carro atrasou).

**Cliquei em Imprimir no voucher e nada abriu.**
O navegador bloqueou a janela de impressão. Libere os pop-ups do sistema e clique de novo.
