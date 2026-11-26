# Plano — toda pessoa do sistema identificada pelo ID do usuário

**Pedido do usuário em 24/11/2026**, depois de ele renomear Tatiana e Thiago no Admin e o sistema "se confundir inteiro": *"precisamos começar a tratar todos os usuários por ID; tudo que for cadastrado tem seu ID e, quando editado, muda uma informação mas continua sendo o mesmo registro, com seu ID único."*

**Decisões do usuário (24/11/2026):** (1) a troca vale para **o sistema todo de uma vez**, não setor a setor (a minha recomendação era por etapas; ele escolheu de uma vez); (2) o ID da pessoa é o **ID do usuário** (`auth_usuarios.id`), e a ficha do RH se liga a ele; (3) nos históricos antigos aparece **sempre o nome atual** da pessoa, pelo ID.

## O que a medição mostrou (24/11/2026, só leitura)

- **Todo registro já tem ID único.** As 218 tabelas têm chave primária; as 19 que não têm são só cópias de segurança de migrações. Então "tudo ter ID" já vale; **o que falta é a PESSOA ser guardada pelo ID**.
- **285 colunas** guardam uma pessoa pelo NOME em texto (responsável, criado por, menção, remetente do chat, vendedor, auditor, gestor, participantes e membros em lista…); só 13 já têm um campo de ID ao lado. Hoje o nome é a "chave": renomear um usuário quebra o vínculo (foi o que aconteceu, e eu corrigi à mão em 24/11: 2.158 valores em 38 colunas, `PLANO` de memória `nomes-tatiana-thiago-24-11`).
- **No código:** 511 usos de `currentUser.nome` em 92 arquivos, 276 pontos que gravam um nome de pessoa e 16 filtros do banco por coluna de nome (em 11 arquivos); além das comparações feitas na tela.
- **No banco:** 21 funções, 18 gatilhos e 1 política olham o nome da pessoa. Há 32 usuários (26 ativos) e **nenhum nome repetido** hoje.

## Desenho (a mesma ideia do início ao fim)

**O ID manda; o nome vira só texto de exibição, mantido pelo banco.**

1. **Um campo de ID ao lado de cada coluna de pessoa** (`responsavel_nome` ganha `responsavel_id`, `criado_por_nome` ganha `criado_por_id`…), preenchido a partir dos nomes de hoje. Para casar nomes antigos (completos e curtos, de antes de 11/11 e de 24/11) existe uma tabela de apelidos `usuarios_nomes_antigos` (ID do usuário, nome, nome sem acento), montada dos nomes atuais e das cópias `unificacao_nomes_*`.
2. **Um gatilho padrão em cada tabela:** quem grava só o nome (as telas de hoje) tem o ID preenchido sozinho; quem grava o ID tem o nome preenchido com o nome **atual** do usuário. Assim nenhuma tela quebra no meio da troca.
3. **Renomear passa a ser seguro:** ao mudar `auth_usuarios.nome`, o banco leva o novo nome a todas as colunas da pessoa **pelo ID** (inclusive históricos, como decidido), em uma transação. As listas (`membros`, `participantes`) ganham a lista de IDs ao lado.
4. **Funções, gatilhos e política que olham o nome passam a olhar o ID** (`uid_efetivo()`, como manda o CLAUDE.md para o "Ver como").
5. **Telas:** a casca passa a entregar `currentUser.id`; filtros e comparações trocam "o nome é o meu" por "o ID é o meu"; as gravações passam a mandar o ID (e o nome só para exibição). Um ajudante único (`QuemFez.ts`) devolve `{ id, nome }` para ninguém montar isso à mão.
6. **Trava:** `auth_usuarios.id` nunca muda; o nome continua único (índice sem acento). A tela de Usuários do Admin avisa que renomear é seguro e mostra quantos registros acompanharam.

## Etapas (um pacote só, mas em ordem, cada passo provado antes do seguinte)

| # | O que | Prova |
|---|---|---|
| U1 | **Ensaio no banco, sem gravar:** lista final das colunas de pessoa (as 285 conferidas uma a uma; texto livre e títulos ficam de fora), quantos valores casam com um usuário e **quais ficam sem dono** (pessoa do RH sem usuário, nome digitado à mão, nome muito antigo) | relatório para o usuário decidir cada caso |
| U2 | **Migração do banco:** tabela de apelidos, as colunas de ID, o preenchimento, os gatilhos, a propagação ao renomear, cópia das linhas antes e `…_reverter.sql` | ensaio de custo antes (instância pequena!) e `/saude-banco` depois; teste de renomear um usuário ZZTESTE e ver tudo acompanhar |
| U3 | **Funções, gatilhos e política** que olham o nome → ID | teste no banco, desfeito no fim |
| U4 | **Telas:** `currentUser.id`, `QuemFez.ts`, filtros, comparações e gravações dos 92 arquivos | `vite build`, `typecheck`, bateria no navegador com gravação bloqueada, auditoria dos pontos que sobraram por busca no código |
| U5 | **Fechamento:** aviso no Admin, documentação (`CLAUDE.md`, memória), publicação e checagem do banco | `/saude-banco`; renomear de verdade só com o OK do usuário |

## Riscos e como me protejo

- **O banco é pequeno** (já travou em 12/11): 285 gatilhos novos e a propagação ao renomear precisam de ensaio de custo **antes**; a troca de nome em massa roda em transação curta e só raramente.
- **Pessoa sem usuário** (ficha do RH sem login, nome digitado): o ID fica vazio e o nome fica como está até alguém ligar a pessoa a um usuário; nada é apagado nem adivinhado. **A lista do U1 volta ao usuário antes do U2.**
- **Pacote grande = risco concentrado:** por isso o pacote só vai ao ar com **todas** as provas verdes, com o `…_reverter.sql` pronto e as linhas de antes guardadas; se uma prova falhar, **nada é publicado**.
- **Quem está logado** precisa sair e entrar de novo depois da publicação (o ID passa a morar na sessão).

## Resultado do U1 (24/11/2026, ensaio só de leitura — nada foi gravado)

Foram conferidos **43.203 valores** em **~190 colunas de texto** que guardam uma pessoa (as colunas em lista — `membros`, `participantes`, `lida_por` etc. — ficam para o U2). Como cada valor se classifica:

| Situação | Valores | Colunas | O que fazer |
|---|---|---|---|
| **Nome de um usuário** (atual, completo ou curto de antes de 11/11 e 24/11) | 28.326 | 116 | ganha o ID sozinho |
| **E-mail de um usuário** (`criado_por` de várias tabelas guarda o e-mail) | 5.943 | 33 | ganha o ID sozinho |
| **Já é ID** | 5 | 2 | já está certo |
| **Sistema ou automação** (`importacao_erp` 3.956+439+69+51+30, "Sistema", "Migração (caixinha da OP)", "Claude — planilha OPL …", "Backfill…") | 8.070 | 26 | não é pessoa: precisa de uma regra (ver a pergunta abaixo) |
| **Pessoa que não tem usuário** (técnicos e gente do RH sem login: Ronald, Natan, Muriel, Jonatan, Argemiro, Marlon, Rafael, Célio, Carolini…, com o nome digitado de formas diferentes: "RONALD", "RONALD MENDES MOREIRA") | 861 | 32 | precisa de uma regra (ver a pergunta abaixo) |
| E-mail que não é de nenhum usuário | 8 | 2 | listado para o usuário olhar |

**Onde as pessoas sem usuário se concentram:** `responsaveis_producao.tecnico_nome` 223, `oples.responsavel_producao` 178, `estoque_movimentos.retirado_por_nome` 116, `demandas_setoriais.responsavel_nome` 71, `op_configuracao_respostas.respondido_por` 64, `oples.tecnico_producao_2_nome` 53. **Quase todos têm ficha no RH, sem usuário** (Ronald, Natan, Muriel, Argemiro, Marlon, Célio…); alguns não têm nem ficha (JONATAN, RAFAEL WEBER, SALOMAO, WILIAN, IVAN…).

**Vale por si só, sem decisão:** ~79% dos valores (34.274) já viram ID direto.

## Estado

✅ **U1 feito** (24/11/2026). ✅ **Decisões respondidas (24/11/2026):** pessoa do RH sem usuário usa o **ID da ficha do RH** (trocado pelo do usuário quando a ficha ganhar `usuario_id`); **sistema e automação ficam como texto, sem ID**. ✅ **U2 APLICADA em 24/11/2026, à noite (≈20h30 a 21h, com o OK do usuário "pode fazer agora, já não tem ninguém trabalhando")** — ver "Resultado da aplicação" no fim. ✅ **U3 aplicada em 24/11/2026** (ver "Resultado do U3"). ✅ **U4 feito em 24/11/2026** (ver "Resultado do U4"). ✅ **U5 feito em 24/11/2026** (ver "Resultado do U5"). ✅ **U4 e U5 publicados em 24/11/2026.** ✅ **U2b aplicado em 24/11/2026.** **Plano concluído; conferido de novo em 26/11/2026** (ver "Conferência de 26/11/2026", no fim).

## Resultado do ensaio do U2 (24/11/2026, tudo desfeito no fim; nada ficou no banco)

Arquivos: `supabase/sql/usuarios_por_id_u2.sql` e `usuarios_por_id_u2_reverter.sql` (ainda sem commit). O ensaio criou as 284 colunas `*_pessoa_id` (133 tabelas), preencheu, ligou os gatilhos e testou:

- **85,0% dos valores ganharam ID** (51.472 de 60.583). O primeiro ensaio deu 43,2% (nome igual no usuário e na ficha do RH sem `usuario_id` se anulava) e o segundo 81,3% (usuária Ana Cláudia Goulart: a ficha tem o nome completo escrito no `nome_completo`); os dois defeitos foram corrigidos em `pessoa_canonica`.
- **Gravar só o nome** (como as telas fazem hoje) acha o ID sozinho: certo. **Gravar só o ID** devolve o nome atual: certo.
- **Renomear a Tatiana** (teste desfeito): 2.016 valores acompanharam pelo ID e **0 ficaram com o nome antigo**.
- **Sem ID, de propósito:** os 9.111 restantes são sistema e automação (`IMPORTACAO_ERP`, "Sistema", "Claude — …", "Migração…") e **nomes curtos de gente do RH sem usuário** (JONATAN 89, MURIEL 57, RONALD 48, TIAGO 46, RAFAEL WEBER 39, CELIO 32, LETICIA 28, RAFAEL 24, MARLON 22, ARGEMIRO NOGUEIRA 18, LUIZ ALBANES 16, CAROLINI ROSA 12…) e erros de digitação (PELICLIS, FENANDO, MURFIEL). **A decidir com o usuário: apelidos** (qual ficha cada nome curto é), sem chutar os ambíguos (RAFAEL, MARLON, TIAGO, THIAGO, JAIRO).

### ⚠ O que o ensaio mostrou sobre o jeito de aplicar (incidente de 24/11/2026, ~14h45 a 14h56)

O ensaio rodou **como uma transação única** e **trava cada tabela por inteiro** (acrescentar coluna, ligar e desligar gatilho): enquanto ele rodou, o resto do sistema ficou esperando as tabelas. O registro do banco mostra **102 "statement timeout" entre 14h45 e 14h56** (zero antes) e a conexão do ensaio caiu; a transação foi desfeita sozinha, o banco voltou ao normal (nenhuma espera de trava, 0 coluna nova, 0 tabela nova) e **nenhum dado foi mudado**. **Consequência para o plano:** a migração **não pode ser aplicada de uma vez**. Antes de qualquer aplicação real: (1) dividir em **uma migração por grupo pequeno de tabelas**, cada uma com `lock_timeout` curto (desiste e tenta de novo em vez de travar quem usa) e o preenchimento em lotes; (2) **fora do horário de uso** (noite ou fim de semana); (3) o ensaio de custo que lê todas as tabelas junto da migração **não se roda mais de dia**; (4) medir o tempo de cada tabela antes.

## Resultado da aplicação do U2 (24/11/2026, pelo /usuarios-por-id)

- **Base** (migração `usuarios_por_id_u2_base_20261124`): tabelas `usuarios_nomes_antigos` (149 apelidos) e `pessoa_colunas`, funções `pessoa_*` e os gatilhos pequenos de `auth_usuarios` e `rh_funcionarios`. **11 apelidos de nomes curtos do RH gravados com o OK do usuário:** CELIO, MURIEL, RONALD, ARGEMIRO NOGUEIRA, LETICIA, MAX, RENATA, FERNANDO, JORGE, SERGIO, VINICIUS (cada um para a única ficha que bate). **Ficaram sem ID de propósito:** TIAGO/THIAGO e RAFAEL (podem ser mais de uma pessoa), LUIZ e JAIRO (ficha duplicada no RH), quem não tem ficha (JONATAN, RAFAEL WEBER, SALOMAO, WILIAN, IVAN, WESLEY, PERICLES, RUTE GEIB, KETLIN AMORIN, MARLON AMORIM, CAROLINI ROSA) e os erros de digitação (LUIZ ALBANES, PELICLIS, FENANDO, MURFIEL).
- **As 133 tabelas**, em 18 lotes de até 8 (as duas maiores, `audit_log` e `logs_movimentacao_opl`, sozinhas): **133 de 133 prontas, 0 FALHOU, 0 PARCIAL, 0 espera de trava e 0 timeout** durante e depois. **285 colunas de ID, 133 gatilhos `pessoa_sincronizar_ids`.**
- **Cobertura: 85,4%** dos valores com ID (52.151 de 61.090); os 8.939 sem ID são sistema e automação (por decisão) e os nomes acima.
- **Provas (desfeitas no fim):** gravar só o nome numa linha de `oples` achou o ID sozinho; renomear a Tatiana levou o nome novo a **2.260 valores e 0 ficaram com o nome antigo**; depois da prova o nome dela continua TATIANA ROSA.
- **Saúde do banco depois:** CPU ~376 ms (normal), zero "statement timeout" nem espera de trava desde as 19h30. Nenhum dado de negócio foi alterado (só colunas de ID novas e preenchidas); nenhum texto de nome mudou.
- **O que muda para quem usa agora: nada.** O sistema grava e lê os nomes como sempre; o banco mantém o ID ao lado. **Já vale:** renomear um usuário no Admin leva o nome novo a todas as colunas `tipo=nome` pelo ID (primeiro renome real: conferir).
- **Falta:** U4 (as telas: `currentUser.id`, `QuemFez.ts`), U5 (aviso no Admin, documentação, publicação). Colunas de lista (`membros`, `participantes`, `lida_por`, `tecnicos_producao`, `autorizacoes`) ficam para o U2b. Reverter, se preciso: `supabase/sql/usuarios_por_id_u2_reverter.sql`.

## Resultado do U3 (24/11/2026, depois do U2)

✅ **U3 aplicada** (migração `usuarios_por_id_u3_20261124`; só `create or replace` de funções, nenhuma tabela travada). A conferência das 21 funções e 18 gatilhos mostrou que **só quatro precisavam mudar**; o resto já usa o ID (`uid_efetivo`, `auth_id`), casa pelo nome que o U2 mantém em dia ao renomear, ou só grava o nome de quem age sem comparar. Nenhuma política de acesso compara nome.
- **`pessoa_propagar_nome`:** ao renomear, também reescreve o campo de busca sem acento (`<coluna>_norm`), que o gatilho do usuário não recalculava (fica desligado durante a troca). Prova: renomear a Tatiana levou o nome novo a 12 cards do CRM e 0 ficaram com a busca errada.
- **`formacao_excluir`:** "quem criou a formação" vale também pelo ID (`criado_por_pessoa_id`), com o nome/e-mail como reserva.
- **`fretes_avisar_sem_entrega`:** o aviso ao responsável comercial, vendedor e criador da OP acha a pessoa pelo ID, com o nome como reserva. Prova com frete sintético (nomes da OP trocados por texto inexistente): a Letícia recebeu o aviso só pelo ID.
- **`viagens_ao_mudar_de_etapa`:** o aviso do Comercial ao chegar em Provisionamento acha a pessoa pelo ID, com o nome como reserva. Prova na viagem "A 1733": igual por nome (adaptação 2, comercial 1, financeiro 4) e igual só pelo ID, com os nomes da OP trocados.
- Tudo ensaiado em transação desfeita antes de aplicar; depois: CPU ~380 ms, 0 timeouts, 0 esperas de trava. Os direitos das funções não mudaram (`formacao_excluir` para quem entrou; as outras só o servidor). **Não cobre** (decisão de custo/risco): as funções do Calendário (~14 KB), que casam pelo nome que a propagação mantém. Reverter: `supabase/sql/usuarios_por_id_u3_reverter.sql`.
- **Falta:** U5, U2b.

## Resultado do U4 (24/11/2026, telas e a última brecha do banco)

✅ **U4 feito**, em tamanho menor que o previsto, porque a medição mostrou que o banco já faz o grosso (o gatilho do U2 preenche o ID de quem grava só o nome, e renomear leva o nome novo a tudo pelo ID). O que de fato faltava eram quatro coisas:
- **A sessão aberta ficava com o nome velho depois de um renome** (a leitura do nome por ID só rodava ao abrir o sistema). Agora a `DashboardTab` relê o usuário pelo ID **também quando a aba volta a ser vista** (no máximo uma vez por 2 minutos; uma consulta por chave primária) e só troca o estado se algo mudou. A releitura parte do que está guardado agora, para não desfazer o que a sessão já mudou (ex.: fim do primeiro acesso depois de trocar a senha). `currentUser.id` já existia desde o login; ninguém precisa sair e entrar.
- **Ajudante `src/QuemFez.ts`:** `quemFez(currentUser)` devolve `{ id, nome }`; `ehEu(currentUser, linha, 'responsavel_nome')` pergunta "é meu?" pelo ID da linha (`<coluna>_pessoa_id`) e, sem ele, pelo nome sem acento; `mesmaPessoa` é o mesmo para quem só tem o nome. **Tela nova usa isso, não `linha.x === currentUser.nome`.**
- **As 10 comparações "o nome é o meu" trocadas por `ehEu`:** `ContactosSection` (3), `CrmTab` (2: contatos de hoje e o responsável que recebe a agenda, que agora é achado pelo ID), `DemandaAvulsaPanel` (2), `FinanceiroKanban` (1). As consultas dessas telas são `select('*')`, então já trazem o ID.
- **Banco (`usuarios_por_id_u4_banco.sql`, migração `usuarios_por_id_u4_banco_20261124`):** a função `pessoa_sincronizar` agora grava o **nome atual** quando o texto escrito é o nome antigo ou curto de um **usuário** (antes só o ID era achado e o texto velho voltava para a coluna: era o caminho de uma sessão antiga gravar o nome de antes). Pessoa só do RH (sem usuário), e-mail e sistema não mudam. Ensaio desfeito: nome antigo da Tatiana → TATIANA ROSA; LETICIA → LETICIA RUBIK HINTZ; RONALD (só RH) fica RONALD; importacao_erp fica sem ID. Reverter: `usuarios_por_id_u4_banco_reverter.sql`.
- **Gravações (276 pontos que mandam `currentUser.nome`): ficam como estão, de propósito.** O gatilho já acha o ID pelo nome e, com a sessão sempre fresca e o banco gravando o nome atual, mandar o ID junto não muda o resultado e custaria mexer em 90 arquivos sem prova melhor. Código novo que grava pessoa usa `quemFez` (`id` e `nome`).
- **Provas:** `vite build` verde, `typecheck` sem erro, bateria no navegador com gravação bloqueada (conta ZZTESTE com ID real): nome antigo da sessão corrigido ao abrir, corrigido de novo ao voltar à aba depois de 3 minutos, não consulta antes de 2 minutos, a releitura preserva `primeiro_acesso=false`, Comercial/CRM, Demandas gerais e Financeiro abrem sem erro de script (0 erros).
- **Auditoria do que sobrou por nome (de propósito):** (1) o filtro `.eq('responsavel_nome', …)` do `ContatoAlertWidget`, porque a visão `crm_oportunidades_basico` não tem a coluna de ID (acrescentar exige cuidado com a visão; funciona porque o nome da sessão está fresco); (2) `GarantiaCustos` (`pedida_por` mora dentro de uma lista JSON) e as demais listas (`membros`, `participantes`, `lida_por`…), que são o **U2b**; (3) as 276 gravações acima.
- **Falta:** U5 (ver abaixo) e U2b.

## Resultado do U5 (24/11/2026, fechamento)

✅ **U5 feito** (publicado em 24/11/2026).
- **Banco (migração `usuarios_por_id_u5_20261124`, `supabase/sql/usuarios_por_id_u5.sql`, reverter ao lado):** (1) **trava de nome único** sem acento nem maiúscula em `auth_usuarios` (índice `auth_usuarios_nome_unico`; não havia nome repetido): "TÁTIANA RÓSA" e "Tatiana Rosa" são barrados pelo banco; (2) **tabela `usuarios_renomeios`** (quem foi renomeado, nome antes e depois, quantos valores acompanharam, quem fez e quando; só Admin lê, só o gatilho grava), alimentada pelo gatilho `pessoa_trg_auth_usuarios`. Prova desfeita: renomear a Tatiana gravou "TATIANA ROSA → TATIANA ROSA TESTE, 2.259 registros".
- **Tela de Usuários do Admin:** a janela Editar mostra, sob o campo Nome, que renomear é seguro; ao mudar o nome a faixa passa a dizer "X passa a ser Y em todos os registros… a pessoa é a mesma, pelo ID"; depois de salvar, um aviso diz **quantos registros acompanharam o nome novo** (lido de `usuarios_renomeios`); nome repetido vira a frase "Já existe um usuário com esse nome" (`ErroDoBanco.ts`), também na criação. Só a peça nova (a `Faixa`), sem migrar a `AdminTab`.
- **Provas:** `vite build` e `typecheck` verdes; navegador com gravação bloqueada e a leitura do número simulada: faixa nos dois estados, aviso "2.259 registros acompanharam", 0 erros de script; depois de aplicar: CPU ~410 ms, 0 timeouts em 3 h, 0 esperas de trava.
- **Documentação:** `CLAUDE.md` (regra "pessoa é o ID, não o nome"), este plano e a memória.
- **Fica para quando quiserem (não pedido):** o filtro por nome do `ContatoAlertWidget`, e **o primeiro renome real de um usuário, que o usuário deve conferir** (o histórico é lido em `usuarios_renomeios`).

## Resultado do U2b (24/11/2026, à noite, depois das 20h)

✅ **U2b aplicado** (`supabase/sql/usuarios_por_id_u2b.sql`, migração `usuarios_por_id_u2b_base_20261124`, depois `pessoa_lista_aplicar('tabela')` uma tabela por vez; reverter: `usuarios_por_id_u2b_reverter.sql`). **Nenhuma tela mudou:** cada elemento das listas mantém o formato (`{nome, email}` ou `{id, nome}`) e ganha a chave `pessoa_id`.
- **As 9 listas de pessoas** (registradas em `pessoa_colunas_lista`): participantes da agenda, do CRM, do Financeiro, dos agendamentos de manutenção e das horas da Engenharia; membros do chat e das demandas; membros das equipes de produção; equipe da viagem. **Resultado: 219 elementos, 100% com `pessoa_id`** (nenhum ficou sem dono), 9 gatilhos (`pessoa_lista_trg_<tabela>_<coluna>`) ligados, 0 desligado, **0 espera de trava e 0 timeout**; CPU ~375 ms. Linhas regravadas: agenda 6, chat 61, CRM 5, demandas 18, Financeiro 2, equipes 1, viagens 1 (as duas tabelas sem dado não regravaram nada).
- **Regras (a função `pessoa_lista_sincronizar`):** o `pessoa_id` já gravado manda; sem ele, a pessoa é achada pelo `id` do elemento (se for uma pessoa conhecida, como no chat), depois pelo e-mail e por fim pelo nome; o `nome` de um **usuário** é regravado como o nome atual (mesma regra do U4); elemento que não se acha fica como está. **Renomear um usuário agora leva o nome novo também às listas** (`pessoa_propagar_listas`, chamada por `pessoa_propagar_nome`; o número do aviso do Admin já a inclui). Prova desfeita: renomear o Felipe mudou o nome dele nas 4 participações da agenda e nas 6 salas de chat, e o log registrou 4.216 registros no total (já contando as listas); gravar uma lista só com nome e e-mail "felipe oliveira teste" achou o ID e o nome atual, e "NINGUEM CONHECIDO" ficou intocado.
- **Ficam de fora, de propósito:** `garantia_atendimentos.autorizacoes` e `.responsavel` (objetos com vários nomes dentro, vazios hoje), `oples.tecnicos_producao` (lista de textos, vazia hoje: não comporta ID), `chat_mensagens.lida_por` (vazia e sem uso) e as listas de **perfis** (`perfis_aprovadores`, `destinatarios_perfis`), que não são pessoas. Se um dia essas passarem a ter dado, entram com o mesmo método.
- **Plano "toda pessoa por ID": concluído** (U1 a U5 e U2b). Resta o que o usuário conferir no primeiro renome real.

## Conferência de 26/11/2026 (B8 do plano de migração para o servidor interno)

A avaliação da migração leu, na seção "Estado", "U4 e U5: falta só publicar" e anotou que o plano parecia incompleto (achado A15). **Conferido: estava tudo publicado desde 24/11/2026** (o `QuemFez.ts` e a janela Editar do Admin estão na `main`); só a anotação tinha ficado velha, e foi corrigida. Conferência no banco, só leitura:
- **Registro e gatilhos intactos:** 285 colunas em 133 tabelas (`pessoa_colunas`), 9 listas (`pessoa_colunas_lista`) e os 144 gatilhos `pessoa_*` ligados.
- **Nenhuma coluna de pessoa nova ficou de fora** nas 10 migrações aplicadas de 25 a 26/11. As colunas parecidas que não estão no registro guardam e-mail, setor, perfil ou id (de propósito), são de cópia ou são o nome do cliente no portal; `ajustes_trabalhos.responsavel` e `projetos_especiais.responsavel` não têm nenhum valor.
- **Linhas gravadas desde 25/11:** 3.391 nomes de pessoa em 248 colunas, **93% já com o ID**. Dos 237 sem ID, 229 são texto de rotina, como decidido ("Sistema", "Sistema (aprovação decidida)", as migrações e a gravação de uma estrutura por planilha).
- **Dois achados, a decidir com o usuário:**
  1. `oples.frete_responsavel` foi registrada como pessoa, mas guarda **"CIF" ou "FOB"** (62 OPs, nenhuma com ID). Não estraga nada; só faz o banco procurar uma pessoa a cada gravação. Correção proposta: tirá-la do registro, fora do horário. **Decisão do usuário (26/11): deixar como está, só anotado**; a correção entra junto da próxima mexida no gatilho das OPs, se houver.
  2. O campo **"Vendedor"** da OP é texto digitado (Edição da OP): as OPs A1804.2611 e A1805.2611 (26/11) estão com "THIAGO MDEIROS", sem ID. A comissão usa o responsável comercial, que está certo nas duas, e os avisos que procuram o vendedor também olham o responsável comercial; o efeito é só o texto na tela. Correção possível: acertar o texto das duas (com o OK do usuário) e, para não repetir, trocar o campo por uma escolha da lista de usuários. **Feito em 26/11, com o OK do usuário: as duas OPs passaram a "THIAGO MEDEIROS" (2 linhas; o gatilho ligou o ID sozinho). O campo continua de texto livre** (o usuário escolheu só corrigir as duas).
- **Nenhum renome real foi feito ainda** (`usuarios_renomeios` vazia): o primeiro continua sendo o que o usuário deve conferir.
- **Para a migração:** os gatilhos `pessoa_*` regravam nome e ID a cada gravação. Na cópia completa do banco (esquema + dados) eles só nascem depois dos dados e não interferem; numa cópia **só de dados** (a cópia reversa da volta atrás) eles disparariam e regravariam as linhas: o roteiro dessa cópia tem de desligá-los durante a carga (anotado no plano de migração).
