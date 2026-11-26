---
name: usuarios-por-id
description: Aplicar à noite, no banco de produção, a troca "toda pessoa do sistema por ID" (U2 do PLANOS CONCLUIDOS/PLANO_USUARIOS_POR_ID.md; plano concluído em 24/11/2026, hoje só para consulta ou ajuste), em lotes pequenos e com trava curta, e conferir o resultado. Use quando o usuário digitar /usuarios-por-id.
---

# Aplicar a troca "pessoa por ID" no banco (U2) — rotina da noite

Criada em 24/11/2026. O usuário pediu: *"crie um comando para isso ser realizado e à noite eu só chamo o comando e você faz a aplicação."* O estado e as decisões estão em `PLANOS CONCLUIDOS/PLANO_USUARIOS_POR_ID.md` (leia primeiro, inclusive o quadro do incidente de 24/11). Projeto Supabase `qgemelnuqdilnggxmrdw`. Responda em português, em linguagem de processo.

**Por que existe esta rotina separada:** o ensaio de 24/11/2026 rodou como UMA transação travando as 133 tabelas e deu 102 "statement timeout" no sistema vivo em ~10 minutos. Aqui tudo roda **tabela por tabela, com `lock_timeout` curto, fora do horário**, e para ao primeiro sinal de lentidão. As ferramentas do Supabase (`execute_sql`, `apply_migration`, `query_logs`) são deferidas: carregue-as numa só chamada de `ToolSearch`.

## 0) Antes de qualquer coisa
1. **Horário:** só depois das 20h de Brasília ou em fim de semana (`select now() at time zone 'America/Sao_Paulo'`). Se for dia útil antes das 20h, **não aplique**: diga isso e pare.
2. **Banco saudável:** faça a parte B do `/saude-banco` (CPU, timeouts nas últimas 2 horas, volume). Se houver timeout ou CPU estrangulada, **pare e relate**.
3. **Nada pendente:** `select count(*) from pg_stat_activity where wait_event_type = 'Lock'` deve dar 0, e `select count(*) from information_schema.columns where column_name like '%\_pessoa\_id'` deve dar 0 (se já houver colunas, a rotina foi começada: veja em que tabela parou com `select * from pessoa_colunas` e continue de onde parou; é seguro repetir).
4. O usuário já aprovou o desenho e a aplicação noturna; **não peça nova autorização para aplicar**, mas **relate tudo ao fim**.

## 1) A base (rápida) — `apply_migration`
Aplique o conteúdo de `supabase/sql/usuarios_por_id_u2.sql` com `apply_migration` (nome `usuarios_por_id_u2_base_20261124`). Ele só cria tabelas de apoio, funções, os apelidos e dois gatilhos pequenos em `auth_usuarios` e `rh_funcionarios` (`lock_timeout` de 5 s no início: se desistir, repita). **Nenhuma tabela de negócio é tocada ainda.**
Confira: `select count(*) from usuarios_nomes_antigos` (esperado: algumas centenas) e que as funções `pessoa_*` existem.

## 2) Apelidos dos nomes curtos do RH (decidido pelo usuário em 24/11/2026: "ligar os que só batem com uma ficha")
Antes de gravar, **mostre ao usuário a lista nome curto → ficha** e espere o OK (a janela clicável do `AskUserQuestion`; se ele não estiver, pule esta etapa, deixe esses nomes sem ID e liste-os no relatório). Os candidatos vêm da lista de valores sem ID do relatório do ensaio (JONATAN, MURIEL, RONALD, TIAGO, RAFAEL, CELIO, LETICIA, MARLON, ARGEMIRO NOGUEIRA, LUIZ ALBANES, CAROLINI ROSA…): para cada um, procure em `rh_funcionarios` as fichas cujo `nome` ou `nome_completo` COMEÇAM por essas palavras; **só entra quem acha UMA ficha** (RAFAEL, MARLON, TIAGO, THIAGO, JAIRO são ambíguos: ficam sem ID e vão listados). Grava em `usuarios_nomes_antigos (chave = pessoa_chave(nome curto), pessoa_id = id da ficha, origem = 'par')`. Erros de digitação (PELICLIS, FENANDO, MURFIEL) **não** viram apelido.

## 3) As tabelas, em lotes — `execute_sql`, uma chamada por lote
1. Lista: `select distinct tabela from public.pessoa_listar_colunas() order by 1` (~133 tabelas).
2. Para cada lote de **até 6 tabelas** (as pequenas), uma chamada: `select public.pessoa_aplicar_lote(array['t1','t2',...])`. Cada tabela roda numa subtransação com `lock_timeout` de 3 s e `statement_timeout` de 60 s; o texto devolvido diz `N de M tabelas prontas` e lista as `FALHOU` (trava ou erro) e as `PARCIAL` (tabela grande: repita a mesma chamada até não vir mais PARCIAL; só então o gatilho é ligado).
3. **Tabelas grandes** (`audit_log`, `mencoes`, `historico…`, qualquer com mais de ~20 mil linhas: confira com `select relname, reltuples from pg_class …`) vão **sozinhas** em cada chamada.
4. **Entre um lote e outro** (a cada 3 a 4 chamadas, no mínimo): `select count(*) from pg_stat_activity where wait_event_type = 'Lock'` e, pelo `query_logs`, os "statement timeout" dos últimos 5 minutos. **Se aparecer qualquer espera ou timeout do sistema, pare e espere 2 minutos; se repetir, pare tudo e relate** (nada fica pela metade: cada tabela é inteira ou não foi feita).
5. Repita as `FALHOU` ao fim, uma de cada vez. Se uma falhar de novo, deixe de lado e relate o motivo.

## 4) Conferência (só leitura, como o ensaio de 24/11)
- Cobertura: soma, por `pessoa_colunas`, de valores não vazios e de valores com ID (esperado **~85%**; o resto é sistema/automação e nomes curtos sem ficha única).
- Quantas tabelas têm o gatilho `pessoa_sincronizar_ids`: tem de bater com `select count(distinct tabela) from pessoa_colunas` (menos as que ficaram PARCIAL/FALHOU).
- **Renomear, desfeito:** dentro de uma transação com `set local lock_timeout='3s'`, renomeie `TATIANA ROSA` para `TATIANA ROSA TESTE` em `auth_usuarios`, conte nas colunas `tipo='nome'` quantos valores ficaram com o nome novo e quantos com o antigo (esperado: ~2.000 e **0**), e termine com `raise exception` para desfazer. **Nunca grave o renome de verdade.**
- Gravar só o nome numa linha de `oples` (`cq_auditor = 'TATIANA ROSA'`) acha o ID sozinho (desfeito no fim do mesmo jeito).
- `/saude-banco` parte B de novo (CPU, timeouts, volume, consultas caras) e o `select count(*)` das esperas de trava.

## 5) Fechar
- Atualize `PLANOS CONCLUIDOS/PLANO_USUARIOS_POR_ID.md` (U2 ✅ com os números reais: tabelas, colunas, valores com ID, o que ficou sem ID e por quê, quanto tempo levou, qualquer FALHOU/PARCIAL) e crie a memória do projeto "usuários por ID" (decisões e estado).
- **Commite local** (`supabase/sql/usuarios_por_id_u2*.sql`, o plano e este comando). **Nunca `git push`** sem a pergunta de push dedicada ao usuário.
- **Relate**: o que foi aplicado, os números, o que falhou. **Diga que ainda faltam U3 (funções, gatilhos e política do banco que olham o nome), U4 (as telas: `currentUser.id`, `QuemFez.ts`) e U5**; por ora o sistema grava e lê como sempre (as colunas de ID são só um acréscimo mantido pelo banco), então **nada muda para quem usa**, mas renomear um usuário já leva o nome novo a todas as colunas pelo ID (avise o usuário de que o primeiro renome real ainda deve ser conferido por ele).
- **Se algo deu errado de forma que não se resolve ali:** `supabase/sql/usuarios_por_id_u2_reverter.sql` desfaz tudo (só tira IDs e funções; nenhum nome em texto foi apagado). Use-o só se o sistema estiver prejudicado, e relate.

## Regras que valem aqui
- Nunca rode o ensaio de custo junto desta rotina nem de dia (é leitura de todas as tabelas junto de uma migração: foi o que estourou o tempo em 24/11).
- Nada de gravar nome de pessoa nem alterar dado de negócio: esta rotina só acrescenta colunas de ID, funções e gatilhos.
- Se o conector disser que "não responde", **não repita às cegas**: olhe `query_logs` (postgres_logs) por `AccessShareLock` e por timeouts antes de qualquer outra chamada.
