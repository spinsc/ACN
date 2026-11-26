# Teste dos endereços do sistema (F5, Voltar, link de tela, "sem acesso")

Criado em 25/11/2026, na Fase 1 do [PLANO_ENDERECOS_E_ROTAS.md](../../PLANO_ENDERECOS_E_ROTAS.md) (cenários C1 a C15); a Fase 2, o link da OP, trouxe os cenários C16 a C31. **Roda a cada fase do plano** e ganha os cenários da fase (os outros registros, as abas internas). Nada aqui grava no banco: toda gravação externa é abortada pelo teste.

## Como rodar

1. **Servidor de desenvolvimento DESTA pasta de trabalho de pé**, numa porta própria (`npm run dev -- --port 5199 --strictPort`; pelo aplicativo, `preview_start` com uma configuração do `.claude/launch.json` nessa porta). Cuidado: a porta 5173 costuma estar com o servidor da **pasta principal**, que serve o código de lá; confira de qual pasta é o servidor antes de testar. Para testar o **pacote de produção** (o que vai para o ar, minificado): `npx vite build`, `npm run preview -- --port 5198 --strictPort` e `BASE=http://localhost:5198/ACN/`.
2. A conta de teste ZZTESTE com a senha em `%USERPROFILE%\.acn-teste\zzteste.json` (ver `../auditoria_layout/cracha_teste.cjs`).
3. `puppeteer-core` não é dependência do projeto: aponte `NODE_PATH` para uma pasta `node_modules` que o tenha.
4. Nesta pasta:

```powershell
$env:NODE_PATH = "<pasta>\node_modules"
node teste_rotas.mjs                    # regras puras do endereço, sem navegador (93 conferências em 25/11/2026)
node teste_enderecos.cjs                # todos os cenários, em série (cerca de 5 minutos; 289 conferências em 25/11/2026)
node teste_enderecos.cjs "^C5"          # só os cenários cujo nome casa com a expressão
node plantar_defeitos.cjs --conferir    # só confere se os trechos dos defeitos plantados ainda existem no código (não planta nada)
node plantar_defeitos.cjs "^(a|b)$"     # planta defeitos de propósito, um de cada vez, e confere que os testes os pegam (precisa do servidor de desenvolvimento)
```

As fotos e o resultado ficam em `saida/` (fora do git). Os cenários rodam **sempre em série**, cada um com um navegador novo.

## O que cobre

| Cenário | O que prova |
|---|---|
| C1 | Admin: abre no Início, menu, clicar na mesma tela não cria passo, Voltar, Avançar, F5 e Voltar depois do F5 |
| C2 | Link direto, endereço digitado, formas aceitas (`#PCP/`, `?filtro`) |
| C3 | Endereço desconhecido (aviso uma vez só, abre o Início, sem passo novo); o nome com sublinhado não vale |
| C4 | Painel TV por endereço (`#/painel-tv`) |
| C5 | Link de tela sem acesso: "conferindo" antes de "sem acesso", botão "Ir para a tela inicial" sem passo, Voltar e Avançar |
| C6 | Permissão velha no navegador, nova no banco: **nunca** a recusa falsa; a tela abre sozinha |
| C7 | Permissão velha libera e o banco já tirou: abre na hora e a releitura não derruba |
| C8 | Os cinco atalhos internos conferem a permissão (aviso uma vez só, sem trocar de tela, `__acnDeepLink` apagado) |
| C9 | Link sem estar entrado → entrar → destino; sair zera o endereço e o título; quem entra depois abre no Início |
| C10 | "Ver como" e "voltar para Admin" recarregam na raiz e o endereço some |
| C11 | O aviso em celular 390, celular 360, tablet 820 e meia tela 960 (sem rolagem para o lado, botão dentro da faixa e fácil de tocar) |
| C12 | Releitura das permissões que demora mais que 8 s: decide sem ela e se corrige quando chega |
| C13 | Releitura que falha: "sem acesso" logo, com a orientação de atualizar |
| C14 | Quem não tem lista de abas marcada (vale todas) abre qualquer link, sem espera |
| C15 | Sessão vencida (usuário guardado, sem crachá): entrada com aviso, endereço mantido, destino depois de entrar |
| C16 | OP pela busca geral: passo no histórico, título da aba, Voltar fecha, Avançar reabre, o X volta um passo |
| C17 | F5 com a OP aberta: reabre por cima do Início; fechar volta ao passo de antes |
| C18 | Link colado (primeira página): abre por cima do Início; fechar troca o endereço e **nunca** sai do sistema |
| C19 | OP que não existe e OP excluída: uma só mensagem, sem janela, sem "Abrindo…" eterno, endereço limpo |
| C20 | Link com o código interno (uuid): abre e o endereço passa a ser o número |
| C21 | Números com barra e espaço (unidade de lote e número antigo): o link codifica e abre |
| C22 | "Copiar link": o endereço completo da OP (jeito moderno, jeito antigo e falha) |
| C23 | Menção de OP: abre a janela por cima da tela atual, sem trocar de aba |
| C24 | Número de OP clicável de uma tela: a janela da tela ganha o endereço, uma só (o teste **vigia a tela por 3,5 s** para provar que o hospedeiro não abre uma segunda), e o Avançar reabre |
| C25 | De uma OP para outra por endereço digitado, e Voltar entre elas |
| C26 | Banco lento: "Abrindo a OP…" aparece; Voltar durante a espera não deixa a janela aparecer depois |
| C27 | Leitura recusada pelo banco: a mensagem diz que a leitura falhou (não "não achei"), uma vez, e o endereço é limpo |
| C28 | O número da OP muda com a janela aberta: o endereço e o título acompanham |
| C29 | O cabeçalho da janela com o "Copiar link" em celular 375, 360 e 320 e em tablet 820: sem rolagem para o lado, botão inteiro, título com folga (fotos em `saida/fotos`) |
| C30 | OP aberta de dentro de outra (o lote): duas janelas, a de baixo fica; o X e o Voltar tiram só a de cima |
| C31 | Link em minúscula e sem acento (número antigo "ITAIÓPOLIS"): abre a mesma OP, e fechar leva ao Início |

## Como o teste simula o que não existe nos dados reais

- **Permissões do banco** (`bancoComAbas`): responde só à leitura `.single()` do **próprio** cadastro (cabeçalho `Accept` de um objeto só). Outras leituras de `auth_usuarios` (como `gestor_id=eq.<id>`) esperam uma lista e passam para o banco real; responder a elas com um objeto derruba a tela com `.map is not a function` (foi o primeiro erro do teste).
- **Avisos do sistema:** o `main.tsx` troca `window.alert` por um aviso no canto da tela, então o evento de janela do navegador nunca os vê. O `lib_enderecos.cjs` instala, antes do sistema, um ouvinte que guarda cada texto em `sessionStorage` (sobrevive ao F5): `lerAlertas` e `limparAlertas`.
- **Entrar:** a resposta da função `entrar` é simulada (nenhuma senha de verdade é digitada); o crachá é o real da conta ZZTESTE.
- **As OPs dos cenários da Fase 2 são reais, só lidas** (`opsDeTeste`): o teste lê do banco, sem gravar, uma OP comum, outra, um lote com várias unidades vivas, uma de número estranho (barra e espaço) e uma com acento no número; se o banco mudar e faltar um tipo, o cenário que depende dele avisa em vez de passar calado. **Link colado** (`abrirComoLinkColado`) escreve o endereço e recarrega, como quem cola o link numa aba nova (a primeira entrada do histórico). **Esperar o desfecho e vigiar:** o teste espera o resultado de verdade (a janela abriu, ou a mensagem saiu), e não um tempo fixo, e vigia a tela por alguns segundos para provar que NÃO surge uma segunda janela depois da leitura do banco (`esperarDesfechoDaAbertura`, `vigiarJanelasDeOp`).
- **Prova de que o teste não é de enfeite:** em 25/11/2026, na Fase 1, três defeitos foram plantados de propósito (recusar antes de reler as permissões; atalho que não confere; sair sem zerar o endereço) e os cenários C6, C8 e C9 os pegaram. Na Fase 2 foram **quinze** (`plantar_defeitos.cjs`, de "a" a "o": CSS do cabeçalho no celular, o X que não volta, link colado que sai do sistema, hospedeiro com segunda janela, Menção sem endereço, "Copiar link" só com a parte do endereço, leitura recusada virando "não achei", número alterado que não chega ao endereço, leitura atrasada abrindo depois do Voltar, janela de uma tela que nunca fecha, as duas formas de errar com janela sobre janela, link sem acento, OP inexistente que deixa o endereço na barra e chave que não tira o acento): todos pegos, e dois só depois de consertar o teste (o hospedeiro com segunda janela e a janela que nunca fecha: o primeiro cenário olhava cedo demais; o segundo não mostrava o defeito, que só aparece nas janelas que uma tela abre). **Ao mudar a regra desses pontos, rode o defeito de novo e confirme que o teste falha.** O roteiro troca um trecho de `src/` por vez e restaura o original byte a byte (guarda o original em `saida/originais` e **recusa rodar** se sobrou um plantio incompleto); **nunca dê commit durante a rodada** e confira o `git diff` depois.
