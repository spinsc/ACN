# Cadastros e relatório

## Prestadores

![A aba Prestadores](img/21-prestadores.jpg)

**Quando usar:** antes de agendar. O prestador é cadastrado **uma vez** e depois é só escolhido na lista. Este cadastro é **próprio dos serviços de terceiros**: não é o de fornecedores do Compras.

**Quem faz:** **Admin, gerentes e a aba Produção**. Os outros usuários podem **ver** a lista.

**Passo a passo**

1. Abra a aba **Prestadores** e clique em **Cadastrar prestador**.
2. Preencha **Nome do prestador \*** (como o pessoal o conhece).
3. Em **Que serviços faz**, escolha um ou mais tipos. **Só quem faz o tipo aparece na lista ao agendar.** Em branco, o prestador vale para **qualquer serviço** (a lista mostra "Qualquer serviço").
4. Preencha o que tiver: **Pessoa de contato**, **Telefone**, **E-mail**, **Razão social**, **CNPJ ou CPF**, o endereço (**Número**, **Complemento**, **Bairro**, **Cidade**, **UF**) e a **Observação** (horário, prazo costumeiro, se busca o carro).
5. Clique em **Cadastrar**.

**O que acontece:** o prestador passa a aparecer ao pedir e ao agendar. **Razão social, CNPJ e endereço saem no contrato**; o que faltar sai **em branco** para escrever à mão.

Na lista, **Editar** (lápis) muda os dados e **Desativar** tira o prestador das listas de escolha. **Nada se apaga:** os serviços antigos continuam mostrando o nome, e **Reativar** traz o prestador de volta. O filtro **Situação** mostra **Ativos**, **Inativos** ou **Todos**, e a coluna de serviços mostra quantos o prestador já tem.

> **Dica:** se um prestador não aparece na hora de agendar, é um destes três: ele **não faz aquele tipo** (confira o campo **Que serviços faz**), está **inativo**, ou ainda não foi cadastrado.

## Tipos de serviço

![A aba Tipos de serviço](img/22-tipos.jpg)

**Quando usar:** para criar um tipo novo (por exemplo, "Estofamento") ou mudar **quem marca o dia** de um tipo.

**Quem faz:** **só o Admin**. Os outros usuários veem a lista.

**Passo a passo**

1. Abra a aba **Tipos de serviço** e clique em **Cadastrar tipo** (ou em **Editar**, o lápis).
2. Escreva o **Nome do tipo de serviço \***.
3. Escolha **Quem marca a data \***:

| Opção | O que significa |
|---|---|
| **Quem pediu o serviço** | Quem pede escolhe o prestador e marca o dia |
| **A Adaptação** | Quem pede só diz o dia que gostaria; a Adaptação escolhe o prestador e marca o dia |

Gerentes e Admin podem marcar a data em qualquer caso.

4. Em **Onde costuma ser feito**, escolha **Na fábrica** (o prestador vem até aqui), **No prestador** (o carro ou a peça vai até lá) ou **Cada pedido escolhe**.
5. A **Posição na lista** define a ordem (número menor fica mais acima).
6. Marque **Usa ordem de serviço em lote** só nos serviços em que vários carros ou peças vão juntos numa ordem assinada (a **pintura eletrostática**). Os serviços deste tipo passam a aparecer na aba **Ordens de pintura**.
7. Clique em **Cadastrar** ou **Salvar**.

**O que acontece:** a regra vale **já** para os pedidos novos e para os que estão abertos. **Não precisa mexer em código.** Como o dia de película, plotagem e pintura é marcado pela Adaptação, mudar essa regra aqui muda **quem vê o botão Agendar** no cartão.

> **Dica:** tipo e prestador **nunca se apagam**, só se desativam. Um tipo desativado não aparece para pedir, mas os serviços antigos dele continuam na lista.

## Modelo do contrato

![A aba Modelo do contrato](img/23-modelo-contrato.jpg)

**Quando usar:** para dar ao contrato o **texto das cláusulas** e os **dados das empresas** que contratam. Enquanto o texto não for aprovado, **toda folha impressa sai com a faixa vermelha "MINUTA"**.

**Quem faz:** **só o Admin** edita; todos leem o texto e os dados.

**Passo a passo**

1. Abra a aba **Modelo do contrato**. No alto, uma faixa diz se o texto é uma **MINUTA** (vermelho) ou está **aprovado** (verde, com quem aprovou e quando).
2. Em **Empresas que contratam o serviço**, confira cada empresa: **Nome curto (como aparece na tela)**, **Razão social** (em branco, vale o nome curto), **CNPJ**, **Endereço**, **Telefone** e **E-mail**. **Adicionar empresa** acrescenta (até 6) e **Tirar** retira (sempre sobra ao menos uma).
3. Em **Texto do contrato**, escreva **uma cláusula por linha**; a impressão numera. O começo da linha até os dois pontos, se for curto (como "Do preço:"), sai em **negrito**. "CONTRATANTE" é a empresa e "PRESTADOR" é quem faz o serviço.
4. **Imprimir um exemplo** mostra a folha como vai sair (o exemplo **sempre** sai como minuta: é para ler, não para assinar).
5. Clique em **Salvar** (guarda, ainda como minuta) ou em **Salvar e aprovar o texto** (guarda e **tira a faixa "MINUTA"** das folhas). **Descartar mudanças** volta ao que estava gravado.

**O que acontece:** o texto vale para todos os contratos e para as ordens da pintura. **Mudar qualquer coisa de um texto já aprovado tira a aprovação**: é preciso aprovar de novo, e as folhas voltam a sair como minuta até lá.

> **Atenção:** o CNPJ e a razão social das empresas **ainda não existem no resto do sistema**: quem os preenche é o Admin, aqui. Enquanto estiverem vazios, saem em branco no contrato.

## Baixar a planilha e imprimir o relatório

**Quando usar:** para levar o relatório do mês ao Excel ou para ter a folha em papel (ou em PDF) para conferir com o Financeiro.

**Quem faz:** qualquer usuário (cada um vê o que o seu acesso permite).

**Baixar planilha**

1. No **Relatório do mês**, escolha o mês e clique em **Baixar planilha**.
2. O arquivo **Servicos_de_terceiros_AAAA-MM.xlsx** traz **três folhas**:

| Folha | O que traz |
|---|---|
| **Por prestador** | Uma linha por prestador, com quantidades e (para quem vê valores) combinado, cobrado, diferença e o que falta pedir |
| **Por tipo** | O mesmo, por tipo de serviço |
| **Serviços** | Uma linha por serviço: número, tipo, descrição, ligação, prestador, dia, valores e situação do pagamento |

Os valores vêm **como número** (o Excel soma e ordena). **Quem não vê valores recebe a planilha sem nenhuma coluna de dinheiro.**

**Imprimir**

1. Clique em **Imprimir**. Abre uma folha **A4** com as tabelas **Por prestador** e **Por tipo de serviço**, o aviso dos serviços agendados em meses anteriores que seguem sem baixa e, para **cada prestador**, a lista dos serviços realizados. No rodapé vai o nome de quem gerou e a data e a hora (e, para quem não vê valores, a nota "sem valores").
2. Na janela de impressão do navegador, escolha a impressora ou **Salvar como PDF**.

> **Atenção:** se o navegador **barrar a janela**, a tela diz isso em vermelho e pede para liberar as janelas deste endereço. Libere e clique de novo.

> **Dica:** o relatório lê os serviços **do mês escolhido**, não a janela de 120 dias da Lista: dá para abrir um mês antigo sem clicar em **Mostrar todos**.
