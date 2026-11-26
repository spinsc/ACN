# Fumaça das telas (linha de base da migração)

Criada em 26/11/2026 (item B7 do `PLANO_MIGRACAO_SERVIDOR_INTERNO.md`). Abre **cada tela do menu e as abas de dentro de cada uma**, só lendo, e anota por vista:

- se abriu e quanto tempo levou até a rede sossegar;
- quantos pedidos fez e para onde (Supabase, GitHub, outros);
- os pedidos que falharam (resposta 400 ou mais, ou falha de rede);
- os erros de página e de console.

**Para que serve:** antes da mudança de casa, tirar a **linha de base**: o que cada tela já faz hoje, inclusive o que já falha. Depois da virada a mesma ferramenta roda no servidor novo, e o aceite do plano compara tela a tela: nenhuma tela pior que a linha de base e **nenhum pedido ao Supabase ou ao GitHub**.

## Como rodar

Mesmo preparo da auditoria de layout (`ferramentas/auditoria_layout/LEIA-ME.md`): a senha da ZZTESTE em `%USERPROFILE%\.acn-teste\zzteste.json` e o `puppeteer-core` numa pasta fora do projeto (`NODE_PATH`).

```powershell
$env:NODE_PATH = "<pasta>\node_modules"
$env:BASE = "https://spinsc.github.io/ACN/"            # a produção publicada; sem BASE, o servidor de desenvolvimento
node ferramentas/fumaca/fumaca.cjs                      # todas as telas, com as abas de dentro
node ferramentas/fumaca/fumaca.cjs --sem-abas           # só a primeira vista de cada tela (mais leve)
node ferramentas/fumaca/fumaca.cjs "^(Início|Compras)$" # só as telas cujo nome casa com a expressão
```

Para o banco da homologação, quando ela existir: `ACN_BANCO` (ver `ferramentas/comum/rede_de_teste.cjs`).

**Rode fora do horário de uso.** Cada tela lê o banco de produção. É um navegador só, em série (como uma pessoa passando por tudo), mas a rodada com as abas faz algumas centenas de leituras.

## O que sai

`ferramentas/fumaca/saida/<data_hora>/` (fora do Git): `fumaca.json` (tudo, gravado a cada vista: a rodada interrompida não se perde) e `resumo.md` (a tabela por tela e o detalhe do que falhou). Do endereço de cada pedido fica só o destino e o caminho, sem o que vem depois do `?` e com os ids trocados por `<id>`.

## O que já se sabe

- **Gravações bloqueadas:** as gravações que a tela tenta fazer (marcar como visto, contadores que gravam) são bloqueadas pela ferramenta e só contadas, não entram como falha.
- **Dois erros 406 em `auth_usuarios` na abertura:** vêm do usuário que a ferramenta injeta no navegador (`lib.cjs`, id `000…`, perfil Admin, para o menu mostrar todas as telas); o banco responde com a ZZTESTE de verdade. Saem em toda rodada, iguais, e não são defeito do sistema.
- O que a ZZTESTE não pode ler (RH, comissões, WhatsApp, e-mail, lixeira) vem vazio: tela vazia nesses assuntos é esperada.
