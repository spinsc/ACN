# Teste dos endereços do sistema (F5, Voltar, link de tela, "sem acesso")

Criado em 25/11/2026, na Fase 1 do [PLANO_ENDERECOS_E_ROTAS.md](../../PLANO_ENDERECOS_E_ROTAS.md). **Roda a cada fase do plano** e ganha os cenários da fase (link da OP, dos outros registros, abas internas). Nada aqui grava no banco: toda gravação externa é abortada pelo teste.

## Como rodar

1. **Servidor de desenvolvimento DESTA pasta de trabalho de pé**, numa porta própria (`npm run dev -- --port 5199 --strictPort`; pelo aplicativo, `preview_start` com uma configuração do `.claude/launch.json` nessa porta). Cuidado: a porta 5173 costuma estar com o servidor da **pasta principal**, que serve o código de lá; confira de qual pasta é o servidor antes de testar. Para testar o **pacote de produção** (o que vai para o ar, minificado): `npx vite build`, `npm run preview -- --port 5198 --strictPort` e `BASE=http://localhost:5198/ACN/`.
2. A conta de teste ZZTESTE com a senha em `%USERPROFILE%\.acn-teste\zzteste.json` (ver `../auditoria_layout/cracha_teste.cjs`).
3. `puppeteer-core` não é dependência do projeto: aponte `NODE_PATH` para uma pasta `node_modules` que o tenha.
4. Nesta pasta:

```powershell
$env:NODE_PATH = "<pasta>\node_modules"
node teste_rotas.mjs                    # regras puras do endereço, sem navegador (49 conferências em 25/11/2026)
node teste_enderecos.cjs                # todos os cenários, em série (cerca de 4 minutos; 130 conferências em 25/11/2026)
node teste_enderecos.cjs "^C5"          # só os cenários cujo nome casa com a expressão
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

## Como o teste simula o que não existe nos dados reais

- **Permissões do banco** (`bancoComAbas`): responde só à leitura `.single()` do **próprio** cadastro (cabeçalho `Accept` de um objeto só). Outras leituras de `auth_usuarios` (como `gestor_id=eq.<id>`) esperam uma lista e passam para o banco real; responder a elas com um objeto derruba a tela com `.map is not a function` (foi o primeiro erro do teste).
- **Avisos do sistema:** o `main.tsx` troca `window.alert` por um aviso no canto da tela, então o evento de janela do navegador nunca os vê. O `lib_enderecos.cjs` instala, antes do sistema, um ouvinte que guarda cada texto em `sessionStorage` (sobrevive ao F5): `lerAlertas` e `limparAlertas`.
- **Entrar:** a resposta da função `entrar` é simulada (nenhuma senha de verdade é digitada); o crachá é o real da conta ZZTESTE.
- **Prova de que o teste não é de enfeite:** em 25/11/2026 três defeitos foram plantados de propósito (recusar antes de reler as permissões; atalho que não confere; sair sem zerar o endereço) e os cenários C6, C8 e C9 os pegaram. Ao mudar a regra de um desses pontos, plante o defeito de novo e confirme que o teste falha.
