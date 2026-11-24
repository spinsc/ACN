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

✅ **U1 feito** (24/11/2026). ✅ **Decisões respondidas (24/11/2026):** pessoa do RH sem usuário usa o **ID da ficha do RH** (trocado pelo do usuário quando a ficha ganhar `usuario_id`); **sistema e automação ficam como texto, sem ID**. 🟡 **U2 escrita e ensaiada, NÃO aplicada** (ver abaixo). ⬜ U3 a U5.

## Resultado do ensaio do U2 (24/11/2026, tudo desfeito no fim; nada ficou no banco)

Arquivos: `supabase/sql/usuarios_por_id_u2.sql` e `usuarios_por_id_u2_reverter.sql` (ainda sem commit). O ensaio criou as 284 colunas `*_pessoa_id` (133 tabelas), preencheu, ligou os gatilhos e testou:

- **85,0% dos valores ganharam ID** (51.472 de 60.583). O primeiro ensaio deu 43,2% (nome igual no usuário e na ficha do RH sem `usuario_id` se anulava) e o segundo 81,3% (usuária Ana Cláudia Goulart: a ficha tem o nome completo escrito no `nome_completo`); os dois defeitos foram corrigidos em `pessoa_canonica`.
- **Gravar só o nome** (como as telas fazem hoje) acha o ID sozinho: certo. **Gravar só o ID** devolve o nome atual: certo.
- **Renomear a Tatiana** (teste desfeito): 2.016 valores acompanharam pelo ID e **0 ficaram com o nome antigo**.
- **Sem ID, de propósito:** os 9.111 restantes são sistema e automação (`IMPORTACAO_ERP`, "Sistema", "Claude — …", "Migração…") e **nomes curtos de gente do RH sem usuário** (JONATAN 89, MURIEL 57, RONALD 48, TIAGO 46, RAFAEL WEBER 39, CELIO 32, LETICIA 28, RAFAEL 24, MARLON 22, ARGEMIRO NOGUEIRA 18, LUIZ ALBANES 16, CAROLINI ROSA 12…) e erros de digitação (PELICLIS, FENANDO, MURFIEL). **A decidir com o usuário: apelidos** (qual ficha cada nome curto é), sem chutar os ambíguos (RAFAEL, MARLON, TIAGO, THIAGO, JAIRO).

### ⚠ O que o ensaio mostrou sobre o jeito de aplicar (incidente de 24/11/2026, ~14h45 a 14h56)

O ensaio rodou **como uma transação única** e **trava cada tabela por inteiro** (acrescentar coluna, ligar e desligar gatilho): enquanto ele rodou, o resto do sistema ficou esperando as tabelas. O registro do banco mostra **102 "statement timeout" entre 14h45 e 14h56** (zero antes) e a conexão do ensaio caiu; a transação foi desfeita sozinha, o banco voltou ao normal (nenhuma espera de trava, 0 coluna nova, 0 tabela nova) e **nenhum dado foi mudado**. **Consequência para o plano:** a migração **não pode ser aplicada de uma vez**. Antes de qualquer aplicação real: (1) dividir em **uma migração por grupo pequeno de tabelas**, cada uma com `lock_timeout` curto (desiste e tenta de novo em vez de travar quem usa) e o preenchimento em lotes; (2) **fora do horário de uso** (noite ou fim de semana); (3) o ensaio de custo que lê todas as tabelas junto da migração **não se roda mais de dia**; (4) medir o tempo de cada tabela antes.
