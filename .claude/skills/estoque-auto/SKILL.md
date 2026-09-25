---
name: estoque-auto
description: Trabalhar na implementação do estoque automático da ACN — reserva de material, pedido automático de compra/fabricação, estrutura de produto por veículo e explosão da lista da OP. Use quando o usuário pedir para continuar esse projeto, falar em retomar o plano de estoque, ou digitar /estoque-auto.
---

# Continuar a implementação do estoque automático

Este projeto é longo e o usuário trabalha nele em várias máquinas, intercalando
com outras tarefas. O estado **não está na sua memória** — está no arquivo
`PLANO_ESTOQUE_AUTOMATICO.md`, na raiz do projeto. Ele é a fonte da verdade.

## Como conduzir

1. **Leia `PLANO_ESTOQUE_AUTOMATICO.md` inteiro** antes de qualquer coisa. Ele
   diz onde queremos chegar, o que já existe, o que cada etapa faz e quais estão
   concluídas.

2. **Escolha a etapa.** Se o usuário deu um número (`/estoque-auto 4`), é essa.
   Sem número, é a primeira que não estiver ✅.

3. **Confira o ponto de partida no banco antes de escrever código.** O plano foi
   medido em 25/09/2026; o banco é de produção e muda. Contagens, colunas e o
   que já está configurado podem estar diferentes. Meça, e se divergir do que o
   plano diz, corrija o plano.

4. **Se a etapa tiver pergunta em aberto** na seção final do plano e a resposta
   mudar o que você vai construir, pergunte ao usuário antes de começar. Se não
   mudar, siga e registre a suposição.

5. **Implemente uma etapa por vez.** Não adiante a seguinte, mesmo parecendo
   fácil — cada uma vai para produção sozinha e precisa funcionar sozinha.

6. **Teste antes de entregar**, no padrão do projeto: `npx vite build`, depois
   teste de navegador com as gravações bloqueadas, ou dado `ZZTESTE` apagado
   depois com a contagem conferida.

7. **Atualize o plano no mesmo commit do código.** Marque a etapa ✅, preencha
   "Feito em" e "O que foi feito" com o que realmente aconteceu — arquivos
   mexidos, migrações aplicadas, números dos testes, e o que ficou de fora.
   Registre decisões novas na tabela de decisões e apague as perguntas que foram
   respondidas. **Uma etapa sem o plano atualizado não está concluída** — a
   próxima máquina vai se perder.

8. **Peça autorização para publicar** ao fim, com pergunta clicável dedicada,
   como manda o CLAUDE.md.

## O que não fazer

- Não ligue controle de estoque, estrutura ou automação em item, veículo ou OP
  que o usuário não pediu. Tudo é opt-in; a fábrica precisa continuar rodando
  manual no que não foi configurado.
- Não faça o sistema adivinhar a qual item uma demanda se refere. Sem vínculo
  certo, não movimenta estoque — avisa e deixa manual.
- Não mexa em dado real fora do que a etapa exige, e nunca sem relatar quantas
  linhas mudaram.
