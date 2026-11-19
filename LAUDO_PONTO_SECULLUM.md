# Laudo — bateria de testes com o Ponto Secullum Web

Realizada em 19/11/2026, com a conta de integração já ativa, por uma função de servidor do Supabase (a senha nunca saiu do servidor). Só leitura: **nada foi gravado na Secullum nem no nosso banco**. Este documento não traz nome nem CPF de funcionário.

## 1. Resumo para decisão

- **A conexão funciona e é rápida.** Login em ~60 ms; qualquer consulta de cadastro responde em 20 a 130 ms; o cálculo de um mês de uma pessoa leva de 0,15 a 0,7 s.
- **Dá para fazer tudo o que foi pedido:** entradas e saídas (até 5 pares por dia), horas normais, faltas, atrasos, horas extras (50% e 100%, diurnas, noturnas e de intervalo), adicional noturno, DSR, abonos, banco de horas (saldo, crédito e débito) e as batidas brutas com a origem de cada uma.
- **O limite que manda é um só:** o cálculo (`Calcular`) aceita **100 consultas por hora** e **1 mês por consulta**. Para os ~25 CLT, uma atualização completa gasta ~25 dessas 100. A rotina da noite cabe com folga; o botão "Atualizar agora" deve ser limitado (ver seção 4).
- **Escopo (informado pelo usuário em 19/11/2026):** só quem é da **Detech** bate ponto na Secullum; os CLT da ACN não batem. No cadastro do RH os 25 CLT ativos já são todos Detech (23) ou "Detech e ACN" (2); os 15 ativos da ACN são todos Terceiros. **Os 2 de "Detech e ACN" precisam de confirmação do RH: batem ponto ou não?**
- **A qualidade dos dados é o ponto de atenção:** 5 dos 25 CLT ativos do RH ficaram sem par na Secullum (ver seção 5). O casamento é por CPF.

## 2. Limites de requisição

| Item | Limite encontrado | Como foi visto |
|---|---|---|
| `Calcular` e `Calcular/SomenteTotais` | **100 por hora, por banco** | Manual da Secullum; os cabeçalhos `x-rate-limit-limit` (janela de 60 min), `x-rate-limit-remaining` e `x-rate-limit-reset` (zera na hora cheia) só aparecem nessas rotas |
| Período do `Calcular` | **No máximo 1 mês** | Pedido de 45 dias recusado: HTTP 400, "O período não pode ser superior a 1 mês" |
| `FonteDados/APartirDoId` | **5.000 registros por chamada**; pagina pelo último ID | Primeira chamada devolveu exatamente 5.000 |
| `Batidas` | Sem limite de período visto (testado até 90 dias, todas as pessoas) | 90 dias = 2.211 batidas, 3,6 MB, 148 ms |
| Demais rotas (cadastros, batidas, afastamentos) | **Não documentado e sem cabeçalho de limite**; 25 chamadas em sequência e chamadas em paralelo passaram sem recusa | Não se deve contar com "ilimitado": a rotina deve ser econômica |
| Token de acesso | **Vale 1 hora** (3.600 s); existe `refresh_token` | O login custa só ~60 ms, então a função entra a cada rodada e não precisa guardar token |
| Rota de funcionários | Exige autorização do administrador da Secullum para dados protegidos pela LGPD | Já liberada: devolveu os 31 cadastros |

A bateria inteira gastou cerca de 30 das 100 consultas de cálculo da hora (cada pessoa conta uma).

## 3. Tempo de resposta

| Consulta | Tempo | Tamanho | Observação |
|---|---|---|---|
| Login (`Token`) | 58 ms | — | |
| Lista de bancos | 11 ms | — | 1 banco |
| Funcionários (todos) | 84 ms | 95 KB | 31 cadastros |
| Horários | 128 ms | 67 KB | 4 horários |
| Departamentos / Funções / Justificativas / Motivos / Empresas / Equipamentos | 17 a 121 ms | até 4 KB | |
| Afastamentos (90 dias) | 21 ms | 3 KB | 12 registros |
| Batidas, todos, 1 dia | 49 ms | 69 KB | 41 batidas |
| Batidas, todos, 7 dias | 67 ms | 304 KB | 181 |
| Batidas, todos, 30 dias | 125 ms | 1,2 MB | 744 |
| Batidas, todos, 90 dias | 148 ms | 3,6 MB | 2.211 |
| Fonte de dados, 30 dias | 53 ms | 358 KB | 1.640 registros |
| Fonte de dados a partir de um ID (5.000) | 64 ms | 1,1 MB | teto de 5.000 |
| Fonte de dados a partir do último ID (só o novo) | 28 ms | vazio | serve para "o que chegou desde ontem" |
| `Calcular`, 1 pessoa, 1 mês (1ª vez) | 712 ms | 6 KB | |
| `Calcular`, mesmo pedido de novo | 159 ms | 6 KB | |
| `Calcular/SomenteTotais`, 1 pessoa, 1 mês | 145 ms | 1 KB | só os totais |
| `Calcular`, 1 dia | 112 ms | 1 KB | |
| **`Calcular`, os 25 CLT em sequência** | **3,6 s no total** | — | mediana 149 ms, máxima 476 ms por pessoa |

Conclusão: uma rodada completa (cadastros + batidas + cálculo dos ~25) leva **menos de 10 segundos**, bem dentro do limite de uma função de servidor.

## 4. O que conseguimos fazer com os dados

**Por dia, por pessoa (`Calcular`, uma linha por dia):** Entrada 1 a 5 e Saída 1 a 5; Normais; Faltas; Atrasos; Extras (aparece como "Extras" ou separado em Ex50% / Ex100% conforme o horário da pessoa); extras noturnas (EN50%, EN100%, ExNot); extras de intervalo (EI50%, EI100%, ExInt); adicional noturno (Not. 20% e Not. Total); DSR e DSR descontado; Ajuste; Abonos; Adiantamento; Folga; Carga prevista; Justificativa; T+/- (saldo do dia); banco de horas (BSaldo, BTotal, BCred., BDeb., BAjus.); Refeição.

**Totais do mês:** a mesma conta em `Totais` (e em `SomenteTotais`, mais leve).

**Batidas brutas:** cada batida com o horário, o **tipo** (original, manual, pré-assinalada, desconsiderada) e a **origem** (relógio, incluída à mão, check-in, central do funcionário, integração). Dá para marcar "batida manual" e "batida desconsiderada" no relatório.

**Cadastros:** funcionários (admissão, demissão), horários (jornada contratada), departamentos, funções, justificativas, motivos de demissão, afastamentos (férias e atestados).

**Telas e usos viáveis:** cartão do dia (quem entrou, quem saiu, quem ainda não bateu), resumo do mês por pessoa (normais, extras, faltas, atrasos, banco de horas), relatório de horas extras, "Meu ponto" para cada pessoa, aviso de falta ou batida incompleta, custo de mão de obra com horas reais (hoje é pela jornada).

**O que NÃO conseguimos / cuidados:**
- **Só leitura de fato:** o que for corrigido (batida esquecida, abono) é corrigido na Secullum e só então aparece aqui, na próxima atualização.
- **As colunas variam por pessoa:** quem não tem extra no mês pode não ter as colunas Ex50%/Ex100%; a leitura tem de ser pelo **nome** da coluna, nunca pela posição.
- **O formato de horas extras foi visto só pelos nomes das colunas:** nenhum dos 4 CLT amostrados fez extra em outubro. Falta ver um caso real com extra antes de fechar a tela.
- **Departamento, função e horário não vieram preenchidos** nos cadastros da Secullum (vieram vazios); essas informações continuam vindo do RH do nosso sistema.
- **O cálculo é o da Secullum:** o sistema mostra o que a Secullum calculou, não refaz a conta.
- **Pessoa que sai da Secullum** (demissão) deixa de ter dado novo; o histórico que copiarmos fica.

## 5. Achados do cruzamento por CPF

| | Quantidade |
|---|---|
| Cadastros na Secullum | 31 |
| CLT ativos no RH | 25 (23 Detech, 2 "Detech e ACN") |
| **Achados pelo CPF** | **20** |
| **CLT ativos do RH sem par na Secullum** | **5** (todos Detech ou Detech e ACN) |
| Na Secullum e sem par no RH | 6 |
| CPF repetido no RH | 0 |

Das 6 pessoas só na Secullum: 4 já foram demitidas, 1 foi admitida em 10/2026 e ainda não está no RH, e **2 parecem ser as mesmas pessoas de 2 dos 5 sem par**: os dígitos do meio do CPF são iguais nos dois lados, e diferem nos extremos (provável erro de digitação em um dos cadastros). **Ação do RH:** conferir o CPF dessas 2 pessoas; das outras 3 sem par, dizer se batem ponto (se um deles for da ACN, não bate; se for Detech, falta cadastrar na Secullum). O sistema não adivinha: só mostra a lista. Os nomes saem na ação "cruzar" da função e posso passá-los no chat.

## 6. Recomendação de desenho (para a etapa P2)

1. **Rotina noturna** (pg_cron, dias úteis, de madrugada): cadastros + `Batidas` do mês e do mês anterior (nos primeiros dias) + `Calcular` de cada pessoa casada. Cerca de 25 consultas de cálculo por rodada.
2. **Botão "Atualizar agora" só para o RH**, com **dois cuidados**: (a) atualiza só o mês corrente e só as pessoas com ponto aberto, ~25 consultas; (b) mostra "última atualização" e **recusa nova rodada por 15 minutos** (no máximo 4 por hora, deixando folga para a rotina). Ao receber a recusa da Secullum (HTTP 429 ou cabeçalho `remaining` em 0), a tela avisa em vez de insistir.
3. **Guardar no nosso banco** (batidas por pessoa e dia, totais por pessoa e mês, registro de cada rodada); as telas leem só a cópia. Assim ninguém consome o limite da Secullum ao abrir uma tela.
4. **Casar por CPF** com `rh_funcionarios`, só para `empresa` Detech (ou "Detech e ACN" se confirmado) e `tipo_colaborador` "Funcionário".
5. **Acesso:** RH, Admin e gerentes veem todos; cada pessoa vê o seu (`uid_efetivo()`); chave pública sem acesso. Ensaio de custo do banco antes e `/saude-banco` depois.
6. **A ação `teste` da função de servidor será removida** depois deste laudo.

## 7. Pendências antes de construir

- RH confirmar os 2 de "Detech e ACN" e corrigir os CPF das 5 pessoas sem par (seção 5).
- Ver um mês com horas extras reais para fechar o formato das colunas de extras.
- Decidir o prazo do botão "Atualizar agora" (15 minutos é proposta minha).
