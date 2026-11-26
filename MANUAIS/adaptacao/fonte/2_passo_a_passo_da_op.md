# Passo a passo: da fila ao CQ

O caminho normal de uma OP na Adaptação:

FLUXO: Aguardando início > Em produção > Aguardando CQ

Se o CQ reprovar, a OP volta: **Retrabalho > Em retrabalho > Aguardando CQ**. Se a Adaptação não puder tocar a OP, ela é **devolvida ao PCP**.

## Iniciar a produção

**Quando usar:** o carro chegou, o material está liberado e alguém vai começar.

**Quem faz:** quem tem a aba Adaptação.

### Passo a passo

1. Na linha da OP (ou no cartão do Kanban), clique em **Iniciar**. Abre a janela **Iniciar produção**.
   ![A janela Iniciar produção, com o BOX ainda por escolher](img/17-iniciar-box-aberto.jpg)
2. Escolha o **Modo de execução**:
   - **Individual:** um técnico. A caixa já vem com o seu nome; troque se for outra pessoa.
     ![Início individual](img/18-iniciar-individual.jpg)
   - **Dupla:** dois técnicos (**Técnico 1** e **Técnico 2**).
     ![Início em dupla](img/19-iniciar-dupla.jpg)
   - **Equipe:** clique no cartão da equipe (o head line aparece no cartão). Se a lista estiver vazia, cadastre a equipe na aba [Equipes](#equipes).
     ![Início com uma equipe](img/20-iniciar-equipe.jpg)
3. Em **BOX em que o carro está**, abra a lista e marque o BOX. **Se o carro é grande e ocupa mais de um BOX, marque todos.** Se ele não está em nenhum BOX, escolha **BOX EXTRA**.
   - Logo abaixo, "Em uso agora" mostra quais BOX já têm outra OP.
4. Clique em **Iniciar produção**.

> **Atenção:** o **BOX é obrigatório**. Sem ele o sistema não deixa iniciar e diz "Informe em qual BOX o carro está".

**O que acontece:** a OP passa a **Em produção** e o cronômetro começa. O sistema registra no histórico da OP e no **Acompanhamento** "Produção iniciada. Responsável: …. BOX: …", e avisa quem acompanha a OP. Quem foi escolhido entra na lista da janela **Equipe** da OP.

**Vai para:** coluna **Em produção** (e, no Kanban, o cartão fica no mesmo prazo).

> **Dica:** se o BOX que você escolheu já tem outra OP, a janela mostra uma faixa vermelha ("BOX 03 já tem a OP D1051.2611. Confirme se é isso mesmo antes de salvar."). É só um aviso: o sistema deixa seguir, porque dois carros podem mesmo dividir um BOX por um tempo. O **BOX EXTRA** nunca é considerado ocupado.
> ![Aviso de BOX que já tem outra OP](img/21-iniciar-box-ocupado.jpg)

## Informar ou trocar o BOX

**Quando usar:** o carro mudou de BOX no meio do trabalho, ou a OP está com o selo âmbar **"Sem BOX informado"** (acontece com OPs iniciadas em lote e com as mais antigas).

**Quem faz:** quem tem a aba Adaptação.

1. Abra o menu **⋯** da OP e clique em **BOX do carro**.
2. Marque o(s) BOX em que o carro está **agora**.
3. Clique em **Salvar BOX**.

![A janela BOX do carro, com o histórico de por onde o carro já passou](img/22-box-do-carro.jpg)

**O que acontece:** o BOX novo aparece na linha. A janela guarda **por onde o carro já passou** (de que dia e hora até que dia e hora, e quem informou). O BOX só vale enquanto a OP está em produção ou retrabalho: quando ela vai para o CQ, o BOX fica livre sozinho.

## Pausar e retomar

**Quando usar:** o trabalho parou (falta peça, fim do turno, o carro foi para outro serviço).

1. Menu **⋯** da OP > **Pausar**. O sistema **não pede motivo**.
2. A linha passa a mostrar **Pausado** com o tempo acumulado.
3. Para continuar, clique em **Retomar** (o botão no lugar de Concluir).

**O que acontece:** o cronômetro conta só o **horário de expediente** (segunda a sexta, das 8h às 17h45); fora dele aparece o selo **Fora do expediente** ao lado do tempo. O tempo parado entra na conta e é **descontado** do tempo de produção que vai para o CQ.

> **Dica:** deixe um recado no **Acompanhamento** dizendo por que pausou (por exemplo, "Aguardando peça/material para continuar"). É o que o vendedor lê para falar com o cliente.

## Mudar quem trabalha na OP

Há dois caminhos, para duas necessidades.

### Editar responsável (trocar o modo)

Use quando a pessoa ou a equipe **trocou por inteiro**.

1. Menu **⋯** > **Editar responsável**.
2. Escolha o **Modo de execução** (Individual, Dupla ou Equipe) e quem é.
3. Clique em **Salvar alteração**.

![A janela Editar responsável, no modo Equipe](img/23-editar-responsavel.jpg)

O histórico da OP guarda "Responsável alterado para: …".

### Equipe da OP (responsáveis, apoios e serralheria)

Use quando **entra ou sai alguém no meio do trabalho**, sem mudar o modo. É esta janela que diz **quem recebe comissão**.

1. Menu **⋯** > **Equipe**.
2. Em cada bloco, escolha a pessoa na lista e clique em **Adicionar**. A lixeira tira.
3. Clique em **Fechar** (cada mudança já fica gravada).

![A janela Equipe da OP, com responsáveis, apoios e serralheria](img/24-equipe-da-op.jpg)

| Bloco | Quem entra | Comissão |
|---|---|---|
| **Adaptação — Responsáveis** | Quem tocou a adaptação | Pelo **percentual cadastrado no RH** de cada um |
| **Adaptação — Apoios** | Quem ajudou | **0,1% fixo** da mão de obra de adaptação da OP, além do que os responsáveis recebem |
| **Serralheria — Quem trabalhou** | Quem fez o trabalho de serralheria | Pelo percentual do RH, em cima da mão de obra de serralheria da OP |

> **Atenção:** a faixa âmbar "Esta OP tem mão de obra de serralheria lançada e ninguém apontado na serralheria. Sem isso não sai comissão" pede que você aponte quem trabalhou na serralheria. E o selo "sem percentual no RH" ao lado de um nome quer dizer que o RH ainda não cadastrou o percentual daquela pessoa: avise o RH.

## Acompanhamento: o recado da OP

**Quando usar:** sempre que há novidade que o vendedor, o PCP ou o cliente precisam saber.

**Quem faz:** qualquer pessoa da Adaptação.

1. Menu **⋯** > **Acompanhamento** (ou o ícone 💬 do cartão do Kanban).
2. Clique num **recado rápido** (um clique registra e avisa) **ou** escreva no campo "Descreva o andamento, decisão ou pendência…".
3. Para chamar alguém, escreva **@** e o nome.
4. Clique em **Registrar**.

![A janela Acompanhamentos com os recados rápidos](img/25-acompanhamento.jpg)

**Os recados rápidos:** "Em execução, dentro do prazo." · "Aguardando peça/material para continuar." · "Em acabamento — entrando na reta final." · "Serralheria em execução." · "Aguardando o veículo chegar." · "Atrasado — vou detalhar o motivo em seguida."

**O que acontece:** o recado fica gravado com o seu nome, a data e o setor, e **aparece para quem acompanha a OP** na caixa de Menções. Cada registro tem **Editar** e **Apagar**.

> **Dica:** você não precisa escrever quando inicia, conclui ou mexe na serralheria: nesses casos o sistema registra o recado sozinho ("Produção iniciada…", "Produção concluída. OP liberada para o Controle de Qualidade."). Escreva só o que o sistema não sabe.

## Anexos

Menu **⋯** > **Anexos** (o número mostra quantos já existem). Use **Anexar Arquivo** para subir fotos, documentos ou o que for preciso da OP. **Fechar** volta à lista.

![A janela Arquivos da OP](img/26-anexos.jpg)

## Ver detalhes da OP

Menu **⋯** > **Ver detalhes** (ou um clique no número da OP) abre a **janela da OP**, a mesma que os outros setores usam: onde está agora, progresso, itens vendidos, anexos, atualizações do andamento, histórico de movimentações, prazos, veículo e entrega e responsáveis por setor.

![A janela da OP aberta pela Adaptação](img/27-detalhes-da-op.jpg)

No alto ficam o **Dossiê** (tudo o que está ligado à OP, com PDF), o **Copiar link** (para mandar a OP para alguém) e o menu **⋯**.

## Veículo chegou à matriz

**Quando usar:** o carro de uma OP de adaptação chegou à fábrica.

**Quem faz:** Admin, gerentes e quem tem as abas SAC, PCP, Adaptação, CRM ou Comercial.

1. Abra a janela da OP (**Ver detalhes**).
2. No quadro **Veículo e entrega**, em **Chegada do veículo à matriz** ("Ainda não registrada"), clique em **Veículo chegou à matriz**.
3. O sistema pergunta "Registrar que o veículo da OP … chegou à matriz?" (e lembra que o PCP, a Adaptação e o vendedor serão avisados). Confirme.

![O quadro Veículo e entrega com o botão da chegada](img/28-veiculo-chegou.jpg)

**O que acontece:** o sistema grava o dia e a hora reais, registra no histórico e no andamento e **avisa o PCP, a Adaptação e o vendedor** na caixa de Menções. O quadro passa a mostrar "Chegou em dd/mm às hh:mm, registrado por …". Se a OP tem prazo em **dias depois da chegada**, a data de entrega passa a contar a partir desse dia.

> **Atenção:** o botão não aparece quando a OP é de envio de material, está cancelada ou entregue, foi excluída ou **já registrou a chegada**: só se registra uma vez. Se a pessoa não tem permissão, o quadro mostra só "Ainda não registrada".

## Viagem da OP (adaptação externa)

Nas OPs de **Adaptação externa** (o serviço é feito no local do cliente), o sistema cria a **viagem** sozinho quando o Almoxarifado fecha o kit. **A OP só chega à fila da Adaptação depois que a viagem é aprovada** (veja a faixa azul no alto da tela).

Na fila, a OP tem o botão **Viagem · \<etapa\>** (por exemplo, "Viagem · Provisionamento") e, no menu ⋯, o item **Viagem desta OP**. Os dois abrem a viagem, onde a Adaptação preenche **a equipe, o veículo da frota e o km de saída**. Quem preenche o resto é o Financeiro e o Comercial; o passo a passo completo está no **Manual das Viagens**.

## Concluir a produção

**Quando usar:** o trabalho de adaptação terminou e a OP vai para o CQ.

**Quem faz:** quem tem a aba Adaptação.

### Passo a passo

1. Clique em **Concluir** na linha (ou no cartão). Se a OP está pausada, use **Concluir** no menu ⋯.
2. O sistema confere as **pendências** da OP antes de deixar passar.

**Se está tudo certo:** a OP vai para **Aguardando CQ**, o tempo de produção fica gravado (horas úteis, sem as pausas), o sistema avisa os envolvidos e o Acompanhamento registra "Produção concluída. OP liberada para o Controle de Qualidade."

**Se há pendência aberta:** o sistema **não deixa concluir** e mostra o que falta:

![O aviso de que a OP não pode ser concluída por causa de uma pendência](img/29-concluir-com-pendencia.jpg)

> **Atenção:** uma **pendência** é uma peça de fabricação ou de compra que a OP espera (por exemplo, "Chicotes: Chicote da sirene (2 peças)"). Cada uma precisa ser **concluída no setor, recebida pelo Almoxarifado e liberada pelo PCP**. Só então a Adaptação conclui. Se a leitura das pendências falhar, o sistema também **não deixa concluir** e avisa; tente de novo em alguns instantes. Quando a compra já está "Recebido", o passo do Almoxarifado vem cumprido sozinho e só falta o PCP liberar.

> **Dica:** a **Serralheria não trava o kit**, mas continua sendo uma pendência para concluir a produção. Marque a serralheria como concluída (menu ⋯ > **Serralheria: Concluído**) antes de concluir a OP.

## Retrabalho: quando o CQ reprova

Quando o CQ reprova, a OP volta para a fila com a situação **Retrabalho**, filete vermelho e o **motivo** logo abaixo da linha, com o nome do auditor (veja a foto da linha na [tabela](#cada-situação-tem-uma-linha-diferente)).

1. Leia o **motivo da reprovação**. Se houver retrabalho anterior, o tempo dele aparece ao lado.
2. Clique em **Iniciar retrabalho**. A OP passa a **Em retrabalho** e um novo cronômetro começa. O motivo do CQ vai para o histórico e para o Acompanhamento.
3. Conserte. Se precisar parar, use **Pausar** do mesmo jeito.
4. Clique em **Concluir → CQ** e confirme a pergunta "Concluir o retrabalho da OP …? Ela volta para o CQ."

**O que acontece:** o tempo de retrabalho fica gravado, o motivo antigo é limpo e a OP volta para **Aguardando CQ**.

## Devolver ao PCP

**Quando usar:** a OP não pode ser feita agora (faltou material, a lista está errada, o veículo não serve) e precisa voltar ao PCP.

**Quem faz:** quem tem a aba Adaptação, com a OP **em produção**.

1. Menu **⋯** > **Devolver ao PCP** (item vermelho).
2. Escreva o **Motivo / Problema**. Escreva sempre: é o texto que o PCP lê.
3. Clique em **Devolver ao PCP**.

![A janela Devolver para PCP, com o motivo escrito](img/30-devolver-ao-pcp.jpg)

**O que acontece:** a OP vira **Devolvida PCP** e sai da fila da Adaptação. O motivo vai para o histórico da OP.

## Serralheria: avançar o andamento

As OPs que passam pela serralheria mostram o selo **Serralheria · \<situação\>** embaixo do número. No menu ⋯ há itens para mudar o andamento: **Serralheria: Pendente**, **Serralheria: Em execução** e **Serralheria: Concluído** (o que já é a situação atual não aparece).

- Na venda do tipo **fabricação serralheria com envio**, ao concluir a serralheria a OP **passa para a fila da Adaptação**, "Aguardando início", **sem responsável** (quem adapta não é quem soldou; o nome anterior fica no histórico). O sistema pergunta antes de mudar.
- Quando a serralheria é só uma etapa dentro de uma adaptação, nada muda de fila.

## Várias OPs de uma vez

Marque as caixinhas das OPs (de qualquer lote, não precisam ser do mesmo). Aparece a barra **N selecionadas** na parte de baixo da tela:

![A barra de seleção em lote, com três OPs marcadas](img/31-selecao-em-lote.jpg)

| Botão | O que faz |
|---|---|
| **Atribuir técnicos/equipes** | Abre a janela para colar, de uma planilha, quem trabalha em cada OP. |
| **Liberar checklist (CQ) em lote** | Manda para o CQ todas as marcadas que estão **em produção**. Para na primeira que não puder (por exemplo, com pendência) e diz até onde foi. |
| **Iniciar produção em lote** | Inicia todas as marcadas que estão aguardando início, **sem responsável e sem BOX**. |
| **Limpar seleção** | Desmarca tudo. |

> **Atenção:** o **início em lote não pede o BOX nem o responsável**: as OPs ficam em produção com o selo **"Sem BOX informado"** e "Sem responsável". Depois, informe o responsável (pela janela abaixo) e o BOX (menu ⋯ de cada uma).

### Importar técnicos e equipes

1. Marque as OPs (ou use o **⋯ do lote** > **Importar técnicos/equipes**) e clique em **Atribuir técnicos/equipes**.
2. Copie da planilha (**Ctrl+C**) duas colunas — o **chassi (ou a placa)** e o **responsável** — e cole (**Ctrl+V**) na caixa. O responsável pode ser:
   - um técnico (individual);
   - "Técnico A + Técnico B" (dupla);
   - o nome de uma **equipe cadastrada**.
3. Confira a **Prévia**: quantas serão aplicadas e quais ficaram sem correspondência (com o motivo).
4. Clique em **Confirmar e aplicar**.

![A janela Importar Técnicos/Equipes com a prévia](img/32-importar-tecnicos.jpg)

> **Atenção:** o casamento é **sempre pelo chassi ou pela placa** que já está na OP, **nunca pela ordem das linhas**. O lote **para na primeira OP que não gravar** e diz quantas ficaram sem tentar.
