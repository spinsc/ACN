## Passo a passo: abrir uma OS (Nova OS)

**Quando usar:** um cliente trouxe (ou vai trazer) um equipamento, ou pediu um serviço no veículo. Toda OS começa aqui, **menos a de garantia, que começa pela ficha** (aba Garantia, veja a Parte 4).

**Quem faz:** o SAC (e quem tem a aba SAC liberada).

![A janela Nova Ordem de Serviço, inteira](img/33-nova-os-janela-inteira.jpg)

### Passo a passo

1. Na aba **Ordens de Serviço**, clique em **Nova OS** (botão verde, ao lado do título).
2. **Classificação.** Escolha o que é a OS:
   - **Empresa:** ACN ou DETECH (a empresa que vai faturar).
   - **Tipo de serviço\*:** Orçamento, Conserto, Troca ou Garantia (a lista vem da aba Cadastros).
   - **Categoria (tipo projeto):** o grupo do serviço (por exemplo, Manutenção Veicular, Serviço Externo, Laboratório).
   - **Tipo de equipamento\*:** o aparelho (Barra sinalizadora, Central de comando, Rádio portátil...). Se não existe, use **+ novo**: ele pede o nome e cadastra na hora.
   - **Qtd:** quantos equipamentos iguais (de 1 a 20).
   ![Bloco Classificação](img/34a-nova-os-classificacao.jpg)
3. **Se for manutenção em veículo**, marque a caixa **OS de Veículo / Manutenção Veicular**. Aparecem a **Manutenção Veicular** e a escolha do **Tipo de avaliação**: veja [OS de veículo](#os-de-veículo) abaixo.
4. **Dados do equipamento.** Para cada equipamento:
   - **Marca**, **Modelo** (na OS de veículo, no lugar do Modelo você escolhe o **Veículo do catálogo**; se ele não existe, **+ Novo** cadastra) e **Nº de série** (na OS de veículo, o **Chassi**);
   - **Defeito reclamado\*:** o que o cliente relata. **É obrigatório em cada equipamento.**
   ![Bloco Dados do equipamento](img/34b-nova-os-equipamentos.jpg)
5. **Observações gerais** (opcional). Escreva **@Nome** para avisar alguém: a pessoa recebe a menção na caixa de Menções (o sino).
   ![Observações gerais](img/34c-nova-os-observacoes.jpg)
6. **Dados do cliente.** Digite o **Nome do cliente\*** e escolha na lista (a lupa): o sistema preenche empresa/órgão, CPF/CNPJ, endereço, telefone e e-mail do cadastro de clientes. Cliente novo? Digite tudo; ele fica guardado para a próxima vez.
   ![Bloco Dados do cliente](img/34d-nova-os-cliente.jpg)
7. **Prazos.** O **Prazo para orçamento** é opcional e aparece no cartão e na lista. Na garantia, no lugar dele aparece a **Data prevista de entrega**.
   ![Bloco Prazos](img/34e-nova-os-prazos.jpg)
8. **Checklist de acessórios.** Digite cada acessório que veio junto (carregador, cabo, manual) e clique **+ Add** (ou tecle Enter). Cada acessório entra com a caixa **marcada** (veio junto); **desmarque** se ele não veio. O **×** tira o acessório da lista (o sistema pede confirmação).
   ![Checklist de acessórios](img/34f-nova-os-acessorios.jpg)
9. **Fotos e arquivos de entrada.** Fotos do equipamento como chegou e documentos (PDF, Word). Se algum arquivo não subir, **a OS não abre** e o sistema diz qual arquivo falhou: corrija ou tire o arquivo da lista.
   ![Fotos e arquivos de entrada](img/34g-nova-os-fotos-e-arquivos.jpg)
10. **Dados de faturamento** (opcional): CNPJ/CPF, razão social e endereço **da nota**, quando diferentes do cliente. *Este bloco **some** na OS de garantia sem cobrança, porque ela não tem nota.*
    ![Dados de faturamento](img/34h-nova-os-faturamento.jpg)
11. **Valores financeiros (comissões)** (opcional): **Valor total** e **Mão de obra**. É o que a comissão lê; pode ficar vazio e ser preenchido depois pelo menu ⋯ **Financeiro**.
    ![Valores financeiros](img/34i-nova-os-valores.jpg)
12. **Vínculo comercial/CRM** (opcional): digite pelo menos 2 letras do título ou do órgão e escolha a oportunidade do CRM. É só um **vínculo**: a OS fica ligada à oportunidade, sem copiar nada. **Remover** desfaz.
    ![Vínculo com o CRM](img/34j-nova-os-vinculo-crm.jpg)
13. Clique **ABRIR OS** (no rodapé). **Cancelar** fecha a janela sem gravar nada.

> **Atenção:** três coisas travam o botão: o **nome do cliente**, o **tipo de equipamento** e o **defeito reclamado** de cada equipamento (e, na garantia, a **ficha**). Se faltar algo, a tela avisa o que é e nada é gravado.

Na janela, uma faixa avisa para onde a OS vai: na OS do Laboratório, *"será encaminhada automaticamente para o Laboratório para diagnóstico e elaboração do orçamento"*; na garantia do Laboratório, *"é aprovada automaticamente: o Laboratório receberá a OS para execução direta"*.

### Vários equipamentos de uma vez (lote)

Aumente a **Qtd**. A janela mostra **um bloco por equipamento** (Equipamento 1 de 3, 2 de 3...). Marque a caixa **"Criar uma OS para cada equipamento (lote)"**: o sistema cria **uma OS para cada um, cada uma com o seu número**, e o quadro mostra o lote **num cartão só**.

![Vários equipamentos e a opção de lote](img/34k-nova-os-varios-equipamentos-lote.jpg)

> **Dica:** se você **não** marcar a caixa, é criada **uma OS só** com a lista inteira de equipamentos.

### Despesas de campo

Se a **Categoria** for do tipo que tem despesas (por exemplo, **Serviço Externo**), aparece o bloco **Despesas de campo**: **Deslocamento, Hospedagem e Alimentação**, com o total somado.

![Bloco Despesas de campo](img/34l-nova-os-despesas-de-campo.jpg)

### O que acontece quando você clica em Abrir OS

- O sistema dá o **número** da OS (formato **OS-0123/2026**, uma sequência por ano). Se dois atendentes abrem ao mesmo tempo e o número repete, ele pega o próximo sozinho.
- A OS nasce na **etapa de início do caminho dela**:

| O que você abriu | Nasce em | Quem age em seguida |
|---|---|---|
| Laboratório, cobrada | **Diagnóstico** | Laboratório (recebe a demanda "[SAC-DIAG]") |
| Laboratório, garantia (sem cobrança) | **Aprovado** | Laboratório (recebe a demanda de **execução**, "[SAC-EXEC]") |
| Veículo, avaliação **Remota** | **Em Cotação** | **SAC** monta os itens |
| Veículo, avaliação **Presencial** | **Em Provisionamento** | Produção marca a data |
| Veículo, garantia (sem cobrança) | **Em Provisionamento** | Produção marca a data |

- Se marcou **Acompanhamento de Engenharia**, nasce também uma demanda para a **Engenharia**.
- As **menções (@Nome)** viram avisos na caixa de Menções de quem foi chamado.
- O sistema avisa por **WhatsApp** (se esse aviso estiver ligado na configuração): "Nova OS ..., cliente, equipamento, tipo, aberta por". No lote vai **um aviso só**, com todos os números.
- Se a OS foi criada mas uma **demanda** (Laboratório ou Engenharia) **não** nasceu, o sistema diz qual faltou: avise o PCP ou a TI, porque o setor só enxerga a OS pela demanda.
- O cliente digitado fica salvo no cadastro de clientes.

### OS de veículo

![Classificação com a caixa de OS de Veículo marcada](img/35a-nova-os-classificacao-veiculo.jpg)

Marque **OS de Veículo / Manutenção Veicular** e escolha o **Tipo de avaliação**:

![Bloco Manutenção veicular](img/35b-nova-os-manutencao-veicular.jpg)

Na **garantia sem cobrança** o bloco não deixa escolher: diz que *"Garantia sem cobrança não tem cotação: a Produção marca a data de atendimento do veículo"* e a OS entra como presencial.

| Tipo de avaliação | Como funciona | Quando escolher |
|---|---|---|
| **Remota** | O preço sai **antes** de o veículo chegar. Você monta a **cotação** (itens e valores) e o cliente aprova. Depois a Produção marca a data | O defeito já é conhecido e dá para orçar sem ver o carro |
| **Presencial** | O **veículo vem primeiro**: a Produção marca a data, o veículo chega, a Produção examina e **insere os materiais** do orçamento. Aí o cliente aprova | O defeito só se descobre com o veículo na oficina |

> **Atenção:** a ajuda que aparece abaixo de "Presencial" na tela diz *"SAC define data de entrega do veículo (Provisionamento)"*. **Está desatualizada**: quem marca a data é a **Produção**; o SAC só dá o **aceite**. Este é um dos pontos de melhoria listados na análise.

**Acompanhamento de Engenharia** (caixa à direita): marque quando a Engenharia precisa acompanhar o serviço. Cria uma demanda a mais para ela.

### OS de garantia: começa pela ficha

Ao escolher **Tipo de serviço = Garantia**, aparece o quadro **Atendimento de garantia (ficha)**. A OS **só abre com a ficha escolhida**.

![Escolher a ficha da garantia](img/35c-nova-os-garantia-escolher-ficha.jpg)

1. Escolha a ficha na lista (só aparecem as fichas **liberadas para gerar OS**: com a **avaliação técnica registrada**). Cliente, contato, veículo, chassi e falha **vêm preenchidos**.
2. Em **Esta OS será**, escolha:
   - **Sem cobrança (garantia ou cortesia)**: não passa por cotação nem aprovação e **não vai ao Fiscal**; termina em Entregue. É a sugestão quando a ficha diz que está dentro da garantia.
   - **Cobrada do cliente**: fora da cobertura; segue o fluxo pago (cotação ou orçamento, aprovação, execução e Fiscal). É a sugestão quando a ficha diz que está fora da garantia.
3. Termine como qualquer OS e clique **Abrir OS**.

![Ficha escolhida e a escolha de cobrança](img/35d-nova-os-garantia-ficha-escolhida.jpg)

> **Dica:** a forma mais curta é abrir a OS **de dentro da ficha**, com o botão **Gerar OS de execução** (Parte 4): ela já abre a Nova OS preenchida.

**O que acontece depois:** a ficha da garantia **registra no histórico** que a OS nasceu ("Ordem de serviço gerada: OS-0130/2026 (sem cobrança)") e avisa o responsável e os copiados da ficha.

---

## Passo a passo: o que fazer em cada etapa

Em cada OS, o botão **verde** é o passo que **você** precisa dar naquela etapa. Abaixo, cada passo, o que ele pede e para onde a OS vai.

### Enviar o orçamento ao cliente (Laboratório)

**Quando usar:** a OS está em **Orçamento Pronto**. O Laboratório diagnosticou e informou o valor na demanda dele.

**Passo a passo:**

1. No cartão da OS, clique **Enviar** (botão verde).
2. Confira o **Diagnóstico do Lab** (o texto do Laboratório aparece em azul, como apoio).
3. Confira ou digite o **Valor do orçamento (R$)\***.
4. Se quiser, escreva as **Condições de pagamento** (por exemplo, "50% entrada + 50% na retirada").
5. Clique **Enviar ao cliente**.

![Janela Enviar orçamento ao cliente](img/12-enviar-orcamento.jpg)

**O que acontece:** a OS grava o valor, as condições e **a data de envio**; o sistema avisa por WhatsApp (se ligado). **O sistema não manda o orçamento ao cliente por e-mail ou WhatsApp**: o SAC envia o orçamento ao cliente pelo meio de costume e usa este botão para **registrar** que enviou.

**Vai para:** **Orç. Enviado**. Quem age: o cliente (você cobra a resposta).

### Registrar a resposta do cliente: aprovar ou reprovar (Laboratório)

**Quando usar:** a OS está em **Orç. Enviado** e o cliente respondeu.

**Se o cliente APROVOU:**

1. Clique **Aprovar** no cartão.
2. Digite o **Nome do aprovador\***.
3. (Opcional) informe a **Data prevista de entrega**.
4. Peça a **assinatura do aprovador\*** e desenhe no quadro (com o dedo ou o mouse). Clique **Confirmar assinatura**. **Limpar** apaga e recomeça.
5. Clique **Confirmar aprovação**.

![Janela Aprovação de orçamento](img/13-aprovacao-do-orcamento.jpg)

**O que acontece:** a assinatura é guardada na OS; a OS fica **Aprovada** (com aprovador e data); **nasce a demanda de execução** para o Laboratório ("Cliente aprovou orçamento R$ ... Aprovador: ... Data prevista: ..."); o sistema avisa por WhatsApp. Se a demanda não nascer, o sistema diz: avise o PCP ou a TI.

> **Atenção:** se a assinatura **não subir**, a aprovação **não é registrada** e a janela continua aberta com o que você digitou: tente de novo.

**Vai para:** **Aprovado** e depois **Em Execução** (o Laboratório inicia a demanda dele).

**Se o cliente REPROVOU:**

1. Clique **Reprovar** (botão vermelho vazado).
2. Escreva o **Motivo da reprovação\***.
3. (Opcional) **Data de retirada do equipamento** e **Nome de quem retirou**.
4. Clique **Confirmar reprovação**.

![Janela Reprovação](img/14-reprovacao.jpg)

**O que acontece:** a OS fica **Reprovada** (motivo e dados da retirada guardados). **A OS reprovada sai do quadro** e fica **só na lista** (filtro de status "Reprovado"). Uma faixa acima do quadro avisa quantas estão fora.

**Vai para:** **Reprovado**. Para reabrir, use **Reavaliar** (veja abaixo).

### Montar e enviar a cotação (veículo, avaliação remota)

**Quando usar:** a OS de veículo está em **Em Cotação**. Quem age é o SAC.

**Passo a passo:**

1. Clique **Itens** no cartão. Abre a janela **Itens da cotação**.
2. Para cada item, preencha **Código**, **Descrição**, **Qtd** e **Vl. unit. (R$)**. O **Total** soma sozinho. **+ Adicionar linha** acrescenta; o **×** tira a linha.
3. (Opcional) em **Horas cobradas na cotação (h)** coloque as horas de mão de obra que você cobrou. Depois, o sistema **compara com as horas reais** que a Produção apontar (é o KPI que aparece na lista).
4. Clique **Salvar itens**.
5. De volta ao cartão, clique **Enviar Cotação** (botão verde).

![Janela Itens da cotação](img/15-itens-da-cotacao.jpg)

> **Atenção:** **Enviar Cotação** sem itens não funciona: a tela avisa "Adicione os itens antes de enviar!".

**O que acontece:** o **valor da cotação é a soma dos itens**; grava a data de envio; avisa por WhatsApp. Como no orçamento do Laboratório, **o sistema registra, não envia ao cliente**.

**Vai para:** **Aguardando Aprovação Cliente**.

**Registrar a resposta do cliente à cotação:**

- **Aprovado:** o sistema pede o **Nome de quem aprovou\***. Clique **Confirmar aprovação**. A OS vai para **Em Provisionamento** e o WhatsApp avisa a Produção: "definir data de atendimento".

  ![Janela Aprovação de cotação](img/16-aprovacao-da-cotacao.jpg)

- **Recusado:** o sistema pergunta o **Motivo da recusa (opcional)**. A OS vai para **Reprovado**.

### Orçamento da OS de veículo presencial

**Quando usar:** a OS está em **Aguardando Aprovação Cliente** e o veículo já passou pela verificação: **o orçamento veio da Produção**, com os materiais que ela inseriu.

**Passo a passo:**

1. **Ver Orç.** abre o orçamento só para leitura. **Editar** deixa trocar itens e valores. Ao salvar, o total é recalculado e uma eventual **revisão pendente** é resolvida.
2. Quando o cliente decidir, clique **Aprovado** (o sistema pede confirmação) ou **Recusado**.

**O que acontece:** **Aprovado** grava a aprovação e leva a OS para **Aguardando Início**: a Produção atribui o técnico e inicia. **Recusado** leva a OS para **Reprovado**.

> **Dica:** o botão vermelho **Resolver Revisão (R$ ...)** aparece quando a Produção, durante o serviço, percebe que os itens não batem com o aprovado e **sugere um orçamento revisado**. A OS fica parada até o SAC negociar com o cliente e **resolver**: abre a janela do orçamento com os itens revisados.

### Aceite da data (veículo)

**Quando usar:** a OS está em **Aguardando Aceite SAC**. A Produção marcou a data e o período do atendimento e devolveu ao SAC para **confirmar com o cliente**.

**Passo a passo:**

1. Clique **Aceite SAC**.
2. A janela mostra **"Data definida pela Produção"** (dia da semana, data e período: Manhã, Tarde...).
3. Ligue ou escreva ao cliente e confira se ele aceita.
4. Clique **Cliente confirmou** (se aceitou) ou **Não confirmou** (se não aceitou).

![Janela Aceite SAC](img/17-aceite-sac.jpg)

**O que acontece:**

- **Cliente confirmou:** a OS vai para **Aguardando Início** (avaliação remota) ou **Provisionada** (presencial). O WhatsApp avisa "SAC confirmou data".
- **Não confirmou:** o sistema pergunta se tem certeza ("o cliente não aceitou a data e a OS voltará para a Produção redefinir"). Ao confirmar, a OS volta para **Em Provisionamento**, **a data é apagada** e a Produção marca outra.

### Iniciar e concluir a execução (quando o SAC executa)

**Quando usar:** a OS já está **Aprovada** e quem executa é o próprio SAC, ou o Laboratório não registrou o início.

**Iniciar a execução** (menu ⋯ **Mover para Em Execução**):

1. Informe **Quem vai executar\*** e a **Data de início\***.
2. Clique **Confirmar**. A OS passa a **Em Execução**.

![Janela Iniciar a execução](img/26-mover-iniciar-execucao.jpg)

**Concluir a OS:** na OS lançada pelo card do CRM com **"O SAC conclui"**, o botão verde é **Concluir OS**. O sistema pergunta se o serviço foi executado; ao confirmar, a OS vai para **Concluído**. Se outra pessoa já tinha concluído, o sistema avisa e atualiza a lista.

> **Dica:** quando é o **Laboratório** que executa, o cartão mostra um texto cinza: **"Aguardando o Laboratório iniciar"** ou **"Em execução no Laboratório"**. Nada a fazer: o Laboratório inicia e conclui pela demanda dele. Se precisar, o menu ⋯ tem **Mover para ...** como exceção.

### Enviar ao Fiscal (OS do Laboratório, cobrada)

**Quando usar:** a OS está **Concluído** e é **cobrada**. O Fiscal precisa do **valor** e dos **dados da nota**.

**Passo a passo:**

1. Clique **Enviar ao Fiscal** (botão verde).
2. Confira o **Valor total da OS (R$)\***: vem do orçamento aprovado quando existe. É o valor da nota. **Tem de ser maior que zero.**
3. Digite o **CPF ou CNPJ para a nota\*** (**11 dígitos** para CPF, **14** para CNPJ). Pode ser o do cliente ou de outro, se a nota sai em outro nome.
4. (Opcional) **Razão social ou nome na nota** e **Endereço de faturamento**.
5. Clique **Enviar ao Fiscal**.

![Janela Enviar ao Fiscal (Laboratório)](img/19-enviar-ao-fiscal.jpg)

**O que acontece:** a OS vai a **Aguardando Emissão NF** e **o Fiscal passa a vê-la** na tela dele. A **data da nota que o Fiscal emitir vira a data de faturamento da OS** (a que a comissão lê): **ninguém precisa digitá-la**. O tempo do Fiscal passa a contar da data do envio.

**Vai para:** **Aguardando Emissão NF** (quem age: o Fiscal) e, depois da nota, **Faturada - Aguardando Entrega** (quem age: o SAC).

### Enviar ao Fiscal (OS de veículo, cobrada)

**Quando usar:** a Qualidade aprovou o serviço e a OS está em **Aguardando Envio Fiscal**. O Fiscal precisa do **número de série de cada item instalado** para emitir a nota.

**Passo a passo:**

1. Clique **Enviar para Fiscal** (botão verde).
2. A janela lista os itens instalados (descrição e quantidade). Digite o **Nº de série** de cada item.
3. Clique **Enviar para Fiscal**.

![Janela Enviar para Fiscal (seriais)](img/18-enviar-para-fiscal-seriais.jpg)

**O que acontece:** os itens com os seriais ficam gravados na OS; a OS vai a **Aguardando Emissão NF**; grava o dia do envio; avisa por WhatsApp. Se outra pessoa já enviou, o sistema avisa e atualiza.

> **Atenção:** o nome do botão é quase igual ao do Laboratório, mas **a janela pede outra coisa** (seriais, não valor e CPF/CNPJ). Está nos pontos de melhoria.

### Entregar ao cliente

**Quando usar:** a OS está **Faturada - Aguardando Entrega**, ou **Concluído** e **sem cobrança**.

**Entrega de OS do Laboratório:**

1. Clique **Entrega**.
2. Digite o **Nome de quem retirou\***.
3. (Opcional) **Fotos de saída**: escolha as imagens do equipamento entregue.
4. Peça a **assinatura de retirada\*** e desenhe no quadro; clique **Confirmar assinatura**.
5. Clique **Confirmar entrega**.

![Janela Entrega (Laboratório)](img/20-entrega.jpg)

**Entrega do veículo:** a janela é mais simples e pede só o **nome de quem recebeu o veículo\***. Não pede assinatura nem fotos.

**O que acontece:** a OS vai a **Entregue** (o fim do caminho), com a data, o nome e, no Laboratório, a assinatura e as fotos. Avisa por WhatsApp ("OS entregue"). A OS entregue **continua na lista e no quadro**, em **Concluído**.

> **Atenção:** se a assinatura ou uma foto **não subir**, a entrega **não é registrada** e o que você digitou fica na janela para tentar de novo.

### Entregar sem nota (cortesia)

**Quando usar:** a OS está **cobrada** e **Concluído**, mas por decisão do atendimento **não será faturada**.

**Passo a passo:**

1. Menu **⋯ > Entregar sem nota (cortesia)**.
2. Escreva o **motivo** (obrigatório). Clique **Confirmar**.
3. Abre a janela de **Entrega** (a do Laboratório).

![Pergunta do motivo da cortesia](img/27-cortesia-sem-nota-pergunta.jpg)

**O que acontece:** a OS **passa a valer como sem cobrança**, o motivo fica no histórico e a OS segue direto para a entrega, **sem passar pelo Fiscal**.

---

## Menu ⋯ (Mais ações da OS)

O menu de três pontinhos tem o que **toda OS** pode fazer. Alguns itens só aparecem quando fazem sentido.

![Menu Mais ações da OS](img/08-menu-mais-acoes.jpg)

| Item | O que faz | Quando aparece |
|---|---|---|
| **Resp.** | Troca o **responsável da OS** (escolha o novo na lista e **Salvar**) | Enquanto a OS não está Entregue nem Cancelada |
| **Financeiro** | **Valor total** e **Mão de obra** (a comissão lê). Mostra a **data de faturamento**, que vem da nota do Fiscal e **não se digita** | Sempre |
| **Compras** | Lista as compras ligadas à OS e permite **Solicitar compra** ao Compras (fica ligada à OS) | Sempre |
| **Anexar** | Envia arquivos (imagens, PDFs, Word, Excel) para a OS | Sempre |
| **PDF** | Gera a OS em PDF, A4, com campo de **assinatura do cliente** no pé | Sempre |
| **Entregar sem nota (cortesia)** | Veja acima | OS cobrada e Concluído |
| **Copiar OS** | Abre a Nova OS preenchida para criar OS iguais | Sempre |
| **Cancelar OS** | Cancela a OS, com motivo | Antes do Fiscal e se não estiver entregue |
| **Mover para ...** e **Voltar para ...** | Os passos que o SAC pode dar agora | Conforme a etapa (veja *Mover a OS*) |
| **Registrar atendimento já realizado** | Para o serviço feito fora da fábrica | Antes da execução (veja abaixo) |
| **Desfazer o registro do atendimento** | Desfaz o registro acima | OS concluída por esse registro |

### Responsável, Financeiro, Anexar, Compras

![Alterar o responsável](img/22-responsavel.jpg)

![Valores financeiros](img/23-financeiro.jpg)

![Compras da OS](img/24-compras-da-os.jpg)

![Anexar arquivos](img/25-anexar-arquivos.jpg)

- **Resp.:** o novo responsável fica gravado no histórico de alterações.
- **Financeiro:** só um campo **em branco** vira vazio; um valor **0** que já estava gravado continua 0. Valor e mão de obra mudados ficam no histórico, com o valor de antes.
- **Compras:** mostra "Compras desta OS (N)" com o andamento de cada uma. **Solicitar compra** abre a solicitação **ligada à OS**; no Compras ela aparece com o selo **"Demanda de OS (SAC)"**.
- **Anexar:** escolha os arquivos e clique **Enviar arquivos**. Se algum não subir, **nenhum é anexado** e a escolha fica para você tentar de novo.

### Acompanhamento

O botão **Acomp.** (sempre à vista no cartão) abre a janela **Acompanhamentos** da OS: o caderno do atendimento. Escreva o andamento, uma decisão ou uma pendência no campo **Novo acompanhamento** (use **@Nome** para avisar alguém) e clique **Registrar**. Cada registro mostra quem escreveu e quando.

![Janela de acompanhamentos](img/21-acompanhamento.jpg)

### PDF da OS

O botão **PDF** do menu ⋯ gera a ordem de serviço para imprimir, em **uma folha A4**. No pé vão **ASSINATURA**, **NOME COMPLETO** e **DOCUMENTO**, linhas para o cliente preencher à mão. Numa OS curta sobra um espaço em branco entre o conteúdo e a assinatura, **de propósito**.

---

## Mover a OS entre as etapas

**Quando usar:** a OS precisa avançar ou voltar, e o botão verde do cartão não resolve (por exemplo, o Laboratório esqueceu de iniciar a demanda), ou você quer voltar uma etapa porque registrou algo errado.

**Duas maneiras:**

1. **Arrastar o cartão** para outra coluna do quadro (no computador).
2. **Menu ⋯ > Mover para ... / Voltar para ...** (serve também no celular e no tablet, onde arrastar não funciona).

![Arrastando o cartão para outra coluna](img/32-arrastando-o-cartao.jpg)

**As regras:**

- O SAC **avança** onde é **ele** quem age e **volta uma etapa**, **sempre com motivo**.
- As etapas da **Produção, da Qualidade (CQ) e do Fiscal** **não se movem por aqui**: nenhum passo entra nelas nem sai delas. É para não pular o CQ nem o Fiscal.
- Se você soltar o cartão **na mesma coluna**, não acontece nada.
- Se soltar numa coluna onde a OS **não pode ir**, a tela diz **por quê**. Se a coluna tem **mais de um passo possível**, abre uma janela para você escolher.

![Janela para escolher o passo](img/31-mover-escolher-o-passo.jpg)

**Os passos, por etapa (o que o SAC pode fazer):**

| Etapa da OS | Passos do SAC |
|---|---|
| **Aberta** | Abrir o diagnóstico (cria a demanda do Laboratório) · Seguir como vendida (vai para a execução, sem cotação) |
| **Diagnóstico** | Informar o orçamento (valor e condições; normalmente o Laboratório faz isso na demanda dele) |
| **Orçamento Pronto** | Enviar o orçamento · Voltar para Diagnóstico |
| **Orç. Enviado** | Aprovado pelo cliente · Reprovado pelo cliente · Voltar para Orçamento Pronto |
| **Aprovado** | Iniciar a execução · Voltar para Orç. Enviado (só se a OS passou pelo orçamento) |
| **Em Execução** (Laboratório) | Concluir a execução / Concluir a OS · Voltar para Aprovado |
| **Concluído** | Enviar ao Fiscal (cobrada) ou Entregar (sem cobrança) · Voltar para Em Execução |
| **Em Cotação** (veículo) | Enviar a cotação · Seguir sem cotação (se for sem cobrança) |
| **Aguardando Aprovação Cliente** | Cotação aprovada / Orçamento aprovado · Cotação recusada · Voltar para Em Cotação (remota) |
| **Aguardando Aceite SAC** | Dar o aceite da data |
| **Aguardando Envio Fiscal** | Enviar ao Fiscal (com os seriais) |
| **Faturada - Aguardando Entrega** | Entregar ao cliente |
| **Reprovado** | Reavaliar |
| **Em Provisionamento, Provisionada, Verificação e Orçamento, Aguardando Início, Aguardando CQ, Aguardando Emissão NF** | **Nenhum** (a OS está com a Produção, a Qualidade ou o Fiscal) |

Em quase toda etapa, antes do Fiscal, também há **Cancelar a OS** e, antes da execução, **Registrar atendimento já realizado**.

**O que acontece ao mover:**

- Os passos que **já tinham janela** (enviar orçamento, aprovar, reprovar, Fiscal, entrega, cotação, aceite, cancelar) **abrem a janela de sempre**.
- Os outros (informar o orçamento, iniciar a execução, concluir, voltar, abrir o diagnóstico, seguir como vendida) **pedem os dados na janela "Mover a OS"** e **não gravam enquanto faltar algo**.
- A gravação **confere a etapa de antes**: se outra pessoa mexeu na OS, o sistema avisa, atualiza a lista e não grava.
- Voltar para antes da aprovação **limpa a marca de "aprovada"**.
- A demanda aberta de outro setor **recebe um recado** no histórico dela; **quem encerra é o setor**.

---

## Registrar atendimento já realizado

**Quando usar:** o serviço **já foi feito fora da fábrica** (no local do cliente, numa oficina parceira, por um técnico em visita) e a OS ficou parada numa etapa de antes da execução. É o caso das OS da Defesa Civil de Taió que estavam em **Em Cotação** com o atendimento já finalizado.

**Quem faz:** o SAC.

**Quando NÃO dá para usar** (o sistema diz o motivo):

- a OS já está **Em Execução**, em **Aguardando CQ** ou além: a fábrica já está com ela ou já a executou;
- a OS é de veículo e **o veículo já chegou à fábrica** (a data de chegada está marcada): o atendimento é da Produção;
- a OS está **encerrada** (**Entregue** ou **Cancelada**) ou **Reprovada** (primeiro **Reavaliar**, depois registre).

**Passo a passo (uma OS):**

1. No cartão da OS, **menu ⋯ > Registrar atendimento já realizado**.
2. A janela mostra a OS que será registrada.
3. Preencha os três campos, **todos obrigatórios**:
   - **Data do atendimento\*:** o dia em que o serviço foi feito (**não pode ser futura**);
   - **Quem fez o atendimento\*:** o nome do técnico ou da empresa;
   - **O que foi feito\*:** descreva o serviço, o local e o que ficou combinado.
4. Clique **Registrar atendimento**.

![Registrar atendimento já realizado, uma OS](img/30-registrar-atendimento-uma-os.jpg)

**Passo a passo (várias OS do mesmo lote, de uma vez):**

1. No **cartão do lote**, clique **Registrar atendimento já realizado**.
2. A janela lista **todas as OS do lote que ainda podem ser registradas**, **já marcadas**. Desmarque as que não entram (**Desmarcar todas** limpa a lista).
3. Preencha os três campos (valem para todas).
4. Clique **Registrar N OS**.

![Registrar atendimento já realizado, lote](img/29-registrar-atendimento-ja-realizado.jpg)

**O que acontece:**

- A OS vai **direto para Concluído**, **sem passar pela Produção nem pela Qualidade**.
- O registro fica na OS (o **resumo** mostra "Feito em", "Quem fez", "O que foi feito", "Registrado por" e "Etapa antes do registro") e no histórico.
- Se havia **demanda aberta** do Laboratório ou da Engenharia, ela recebe um recado ("o SAC registrou o atendimento como já realizado... Encerre esta demanda") e o setor encerra.
- **Não** entra na **comissão da Produção** nem no **KPI de execução**: serviço feito por fora não é produção da fábrica.

**Vai para:** **Concluído**, e daí:

- OS **cobrada**: **Enviar ao Fiscal** (precisa de valor e CPF/CNPJ);
- OS **sem cobrança** (garantia, cortesia): **Entrega**.

> **Dica:** registrou por engano? Na OS concluída por esse registro, o menu ⋯ tem **Desfazer o registro do atendimento**. O sistema pede o motivo, **apaga o registro** e devolve a OS para a **etapa de antes**.

---

## Cancelar uma OS

**Quando usar:** o cliente desistiu, a OS foi aberta em duplicidade ou por engano.

**Quem faz:** quem tem a aba SAC.

**Passo a passo:**

1. Menu **⋯ > Cancelar OS**.
2. Escreva o **motivo** (obrigatório).
3. O sistema mostra o resumo e, se houver **demandas abertas** de outros setores, avisa quais.
4. Confirme.

![Pergunta do motivo do cancelamento](img/28-cancelar-os-motivo.jpg)

**O que acontece:**

- A OS fica **Cancelada**, com **motivo, data e quem cancelou**.
- A OS **sai do quadro e da lista** (fica só no filtro de status **Cancelada**; uma faixa acima do quadro conta quantas estão fora).
- As demandas abertas dos outros setores **recebem um recado** e o setor é **avisado**: **quem encerra a demanda é o setor**.
- Avisa por WhatsApp, dizendo quais setores devem encerrar a demanda.

> **Atenção:** **não se cancela** a OS que **já está no Fiscal** (Aguardando Emissão NF, Faturada - Aguardando Entrega), a **entregue** nem a **já cancelada**. Se a OS mudou de etapa enquanto você preenchia, o sistema avisa e não cancela.

---

## Reavaliar uma OS reprovada

Na lista (filtro de status **Reprovado**), a OS reprovada tem o botão **Reavaliar**. O sistema pergunta "Reabrir a OS...?". Ao confirmar:

- OS do **Laboratório**: volta para **Diagnóstico**;
- OS de **veículo, avaliação remota**: volta para **Em Cotação**;
- OS de **veículo, avaliação presencial**: volta para **Em Provisionamento**.

A marca de aprovada e o motivo da reprovação são limpos.

---

## Lotes de OS

Quando você abre **várias OS de uma vez** (caixa de lote na Nova OS), o quadro mostra **um cartão de lote**.

![Cartão do lote no quadro](img/09-cartao-do-lote.jpg)

- O cartão mostra **"Lote · N OS"**, o cliente, os **números das OS** e **quantas estão em cada etapa** (por exemplo, "4× Em Cotação").
- **Abrir o lote** mostra cada OS, com o selo da etapa, **quem age**, a barra de progresso e **os mesmos botões** da OS solta.
- **Registrar atendimento já realizado** no cartão do lote registra **várias de uma vez**.
- Para as outras passagens (aprovar, enviar ao Fiscal, entregar), é preciso **abrir o lote e fazer OS por OS**.

![Lote aberto, com os botões de cada OS](img/09b-lote-aberto-botoes.jpg)

---

## Copiar OS

**Quando usar:** vão chegar **vários equipamentos iguais** do mesmo cliente, ou você quer repetir uma OS que já fez.

**Passo a passo:**

1. Menu **⋯ > Copiar OS**.
2. O sistema pergunta **quantas OS iguais** (de 1 a 20). Ele lista o que leva e o que não leva.
3. A **Nova OS abre preenchida**: uma OS para cada equipamento, cada uma com o seu número.
4. Confira, preencha o **serial** (ou chassi) de cada um e clique **Abrir OS**.

**Leva:** cliente, empresa, tipo de serviço, equipamento ou veículo (marca, modelo), defeito reclamado e observações; prazos, valores, itens da cotação, despesas, dados de faturamento, acompanhamento de engenharia e vínculo com o CRM.

**Não leva:** número de série, chassi, acessórios que vieram junto, fotos e documentos anexados, e **todo o andamento** (etapa, orçamento, aprovação, execução, nota e histórico).

> **Atenção:** a OS de origem com **mais de um equipamento** é copiada **numa OS só**, com a lista inteira, sem serial nem chassi. Para fazer mais de uma cópia, repita o **Copiar OS**.

---

## O painel de leitura da OS (resumo)

Clique **no cartão** (ou na linha) para abrir o **resumo** da OS. Ele mostra, de cima para baixo: **Andamento** (as etapas do caminho, com a atual destacada); **Serviço** (tipo, atendimento, defeito, quem abriu); **Veículo** ou **Equipamento**; **Cliente**; **Andamento** (datas); **Valores**; **Itens da cotação**; **Compras desta OS** (com **Solicitar compra**); **Responsáveis**; e, quando existem, **Atendimento já realizado**, **observações**, **arquivos e fotos**.

![Resumo da OS: o topo](img/10b-resumo-topo.jpg)

---
