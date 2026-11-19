# PLANO — Integração com o ponto da empresa (Ponto Secullum Web)

Criado em 17/11/2026. **P1 e P2 construídas em 19/11/2026** (ver a seção 4). Pedido do usuário: ter entrada, saída, horas extras e o resto de todos os funcionários CLT dentro do sistema, a partir da API que a Secullum disponibilizou.

Fontes lidas: https://github.com/Secullum/PontoWebIntegracaoExternaExemplo (código C# de exemplo, `README.md` e o manual `Integracao_Externa_Ponto_Web.pdf`, 80 páginas), e o contrato público `https://pontowebintegracaoexterna.secullum.com.br/swagger/v1/swagger.json`. A API foi chamada em 19/11/2026: o resultado (limites, tempos, colunas) está em [LAUDO_PONTO_SECULLUM.md](LAUDO_PONTO_SECULLUM.md).

## 1. Decisões do usuário (17/11/2026)

- **Só leitura** na primeira entrega: o sistema não grava nada na Secullum (nada de incluir ponto, editar cartão, lançar afastamento ou cadastrar funcionário).
- **Quem vê:** RH, Admin e gerentes veem todos; cada pessoa vê só o próprio ponto.
- **Atualização:** toda noite, mais o botão "Atualizar agora" para o RH (respeitando o limite de consultas da Secullum).
- **Escopo (usuário, 19/11/2026): só os funcionários da DETECH batem ponto na Secullum; os CLT da ACN não batem.** No RH, os 25 CLT ativos são todos Detech (23) ou "Detech e ACN" (2, a confirmar). A conexão foi feita e a bateria de testes rodou em 19/11/2026: ver [LAUDO_PONTO_SECULLUM.md](LAUDO_PONTO_SECULLUM.md) (limites, tempos, o que dá para fazer e a recomendação para a P2). A P1 (conexão e cruzamento) está feita; 5 dos 25 ficaram sem par por CPF (RH confere).

## 2. Como a API funciona

- Autenticação em duas partes: `POST https://autenticador.secullum.com.br/Token` (`grant_type=password`, `username`, `password`, `client_id=3`, formulário) devolve o `access_token`; a lista de bancos vem de `GET /ContasSecullumExterno/ListarBancos` (só os de `clienteId = 3`). Depois, toda chamada a `https://pontowebintegracaoexterna.secullum.com.br/IntegracaoExterna/...` leva `Authorization: Bearer <token>` e o cabeçalho `secullumidbancoselecionado` (o id do banco). TLS 1.2 ou superior.
- **O que lemos:**
  - `Batidas?dataInicio=&dataFim=&funcionarioCpf=` (datas `yyyy-MM-dd`): cada batida com `Tipo` (0 original, 1 manual, 2 pré-assinalado, 3 desconsiderado) e `Origem` (relógio, incluída à mão, check-in, central do funcionário web/app, integração externa).
  - `POST Calcular` e `POST Calcular/SomenteTotais` (`FuncionarioCpf` ou `FuncionarioPis`, `DataInicial`, `DataFinal`, `CentrosDeCustos` opcional): o mesmo cálculo do relatório Cálculos da Secullum, em `Colunas`, `Linhas` e `Totais`. **As colunas (Normais, Extras…) dependem da configuração da empresa na Secullum: só se sabe quais são com a primeira chamada real.**
  - `Funcionarios`, `Horarios`, `Departamentos`, `Funcoes`, `FuncionariosAfastamentos` (férias e atestados).
- **Limites:** o `Calcular` aceita **no máximo 1 mês por consulta e 100 consultas por hora por banco**. A rota de funcionários exige **autorização do administrador da Secullum para dados protegidos pela LGPD**.
- **Exigências do lado da Secullum:** plano PRO ou superior e a integração ligada em Manutenção > Integração com Sistemas.

## 3. Desenho

- **O navegador nunca fala com a Secullum.** O login é e-mail e senha de uma conta Secullum, e o sistema roda no navegador com chave pública. Quem fala com a Secullum é uma **função de servidor do Supabase** (como `send-email` e `send-whatsapp`), com a senha como **segredo do servidor** (`SECULLUM_EMAIL`, `SECULLUM_SENHA`, `SECULLUM_BANCO`), de uma **conta Secullum só da integração**.
- **Cópia no nosso banco** (as telas leem só a cópia): batidas por pessoa e por dia, totais por pessoa e por período, e o registro de cada rodada (quando rodou, quantas pessoas, erro). Atualização por rotina agendada (pg_cron, como as de frete e calendário), mais o botão do RH.
- **Casamento por CPF** com `rh_funcionarios.cpf`: o sistema guarda a ligação pessoa × funcionário da Secullum e mostra quem ficou sem par, nunca adivinha.
- **Acesso:** política por perfil, como o RH já faz com salário e comissão; "cada um vê o seu" usa `public.uid_efetivo()` (regra do "Ver como"). Chave pública sem direito nenhum.
- **Custo do banco:** rodar `supabase/sql/ensaio_de_custo.sql` antes e `/saude-banco` depois (regra de 13/11/2026).

## 4. Etapas

- **P1 — Conexão e cruzamento (leitura). ✅ 19/11/2026.** Função de servidor `ponto-secullum` (`supabase/functions/ponto-secullum/index.ts`): entra na Secullum, acha o banco do Ponto Web sozinha (um só; com mais de um, o segredo `SECULLUM_BANCO`) e cruza por CPF. Ação `cruzar` devolve quem foi achado, quem ficou sem par e quem só existe na Secullum. Colunas reais do `Calcular` descobertas (laudo).
- **P2 — Cópia e telas. ✅ 19/11/2026.**
  - **Banco** (`supabase/sql/ponto_secullum.sql`, reverter ao lado): `ponto_dias` (um registro por pessoa e dia, colunas da Secullum pelo NOME), `ponto_totais` (totais do mês), `ponto_rodadas` (cada atualização: quando, quem, quantas consultas, o que sobrou da hora, erro), `ponto_rotina_segredo` (só o servidor lê). Leitura: RH, Admin e gerentes veem todos (`ponto_pode_ver_todos`); cada pessoa vê o seu (`ponto_meu_rh_id`: liga o usuário à ficha do RH por `usuario_id`, depois e-mail, depois nome inteiro, só quando o casamento é único). Só a função de servidor grava. Chave pública sem direito. Testado como cada papel (comum com e sem ficha, RH, gerente, Admin) e como a chave pública (recusada).
  - **Rotina:** pg_cron `ponto-secullum-manha` (8h30 de Brasília) e `ponto-secullum-noite` (20h30), todos os dias, que chamam a função pelo `pg_net` com o segredo do banco. Para desligar: `select cron.unschedule('ponto-secullum-manha'); select cron.unschedule('ponto-secullum-noite');`. Cada rodada lê o mês corrente (e, até o dia 5, o mês passado) de cada CLT da Detech achado por CPF: ~20 consultas, ~13 s.
  - **Botão "Atualizar ponto agora"** (só RH e Admin; `pode_ver_rh`): mesma função. **Limite:** a função conta as consultas de cálculo da última hora em `ponto_rodadas` e recusa se passar de 90 das 100 que a Secullum dá (cada rodada gasta ~20 e, até o dia 5, ~40); também para se a Secullum disser que o resto acabou ou responder 429; uma rodada por vez. Na prática: ~4 cliques por hora.
  - **Tela `PontoTab.tsx`** (menu Dashboard › Ponto, aberta a todos): "Meu ponto" (todos), "Equipe hoje", "Resumo do mês" e "Horas extras" (RH, Admin e gerentes), com o mês dia a dia de cada pessoa, faixa vermelha se a atualização automática não rodou há mais de 15 horas, faixa com quem ficou sem par por CPF e aviso ao RH de quem não consegue abrir o próprio ponto. Regras em `PontoSecullum.ts` (horas, pares de batida, situação do dia, extras).
  - **O dia de hoje é provisório (achado e corrigido em 19/11/2026):** a Secullum calcula o dia corrente como se ele já tivesse acabado (às 9h, 17 das 20 pessoas já tinham batido a entrada e vinham com "Faltas 08:48", mais atrasos e banco de horas parciais). A função guarda do dia de hoje só o fato (batidas, jornada prevista e marcas) e, no mês em andamento, calcula os totais somando os dias até ontem (`ponto_totais.ate_dia` = ontem); o saldo do banco (`BSaldo` e `BTotal` do mês) é o do último dia fechado. Conferido com outubro: para as 20 pessoas a soma dos dias bate com o total da Secullum em Normais, Faltas, Atrasos, extras, adicional noturno, DSR, crédito e débito do banco. Mês passado usa o total da própria Secullum. A tela nunca chama o dia de hoje de "Falta" (`situacaoDoDia`): é "Ainda não bateu".
  - **Mês passado:** a função aceita `meses: ["2026-10"]` (até 3, dos últimos 6 meses) para trazer meses fechados; outubro foi trazido uma vez em 19/11/2026. Não há botão para isso na tela.
- **P3 — Uso no resto do sistema.** Relatórios do RH, avisos de falta ou batida incompleta, e a ligação com a tela de Horas Extras das tarefas. **Em aberto:** a tela de Horas Extras das tarefas é pedido e aprovação; o ponto é o que a pessoa de fato fez. Os dois ficam separados até o usuário decidir como se encontram.

## 4b. Em aberto depois da P2 (19/11/2026)

- **12 dos 25 CLT da Detech não conseguem abrir o "Meu ponto":** o sistema só achou o usuário de 13 (por nome ou e-mail iguais). A ficha do RH precisa ter o mesmo nome ou e-mail do usuário do Admin. A tela mostra a lista ao RH.
- **5 CLT da Detech sem par na Secullum** (CPF diferente ou cadastro que falta): a tela mostra os nomes a RH, Admin e gerentes.
- **Horas extras:** o total soma as colunas de extra da Secullum (`COLUNAS_DE_EXTRA`), mas nenhum dos casos lidos tinha extra no mês; conferir com a Secullum no primeiro caso real.
- **Os 2 de "Detech e ACN"** entram no ponto como Detech (o cadastro cita a Detech); confirmar com o RH se batem ponto.
- **A tela não foi vista no navegador** (a conta de teste não pôde ser usada nesta sessão): foram testados o build, as regras (Node) e o banco por papel.

## 5. O que falta do usuário para a P1 (resolvido em 19/11/2026)

- Uma **conta Secullum só para a integração** (o responsável pela conta cria) e a **integração ligada** no Ponto Web. A senha **não vai por chat nem para o repositório**: entra como segredo da função de servidor (painel do Supabase > Edge Functions > Secrets).
- O **nome ou o id do banco** do Ponto Web que vale (a conta pode ter mais de um).
- A **autorização da LGPD** da rota de funcionários, dada pelo administrador na Secullum.

## 6. Fora desta rodada

Gravar na Secullum (incluir ponto, editar cartão, afastamentos, cadastro de funcionário), Terceiros (a pedido são só os CLT), arquivos e assinatura de documentos (`GestaoArquivos`), atividades e centros de custo da Secullum.
