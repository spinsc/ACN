# Plano — Passar os arquivos do sistema para o armazenamento privado

> Continuação da Etapa 17 (fechar o banco), onda 5b. Pedido do usuário em 26/11/2026: "Sim, planejar". **Nada deste plano foi construído:** é o desenho e a ordem. Cada fatia só começa com o OK do usuário.
> Decisões do usuário em 26/11/2026 (janela): (1) **quem entrou abre** (a separação por aba fica para uma fase depois); (2) **ninguém manda link de arquivo para fora do sistema**; (3) **começar por Compras, Logística e Financeiro**.

## 1. Onde estamos

- O armazenamento tem dois lugares: `acn-media` (**público**: quem tem o endereço de um arquivo o abre sem entrar) e, desde a onda 5b, `acn-privado` (**privado**: só abre por dentro do sistema, com endereço que vale 1 hora).
- Já estão no privado só o **chat** e as **assinaturas** (onda 5b). Os 378 arquivos antigos dessas duas coisas continuam públicos até o usuário rodar o script `ferramentas/migrar_bucket/migrar_para_privado.cjs`.
- **O resto do sistema ainda grava no público:** 2.413 arquivos, 1,8 GB, em 16 pastas (medido em 26/11/2026). Este plano leva tudo para o privado, uma família de pastas por vez, e no fim fecha o `acn-media`.
- Conferido no levantamento: **nenhum e-mail do sistema leva link de arquivo** (os e-mails de aviso só dizem "acesse o sistema") e **os portais do cliente não leem arquivo do armazenamento** (o manual e o logotipo são endereços digitados). O que as Menções, os PDFs e as telas mostram são endereços guardados no banco, e é neles que o trabalho está.

## 2. O que existe hoje (inventário)

| Fatia | Pasta (`acn-media`) | Arquivos | MB | Tela que grava | Onde o endereço fica no banco (linhas com endereço público) |
|---|---|---:|---:|---|---|
| **B1** | `compras-anexos` | 111 | 18 | `ComprasFluxo`, `ComprasTab` | `pcp_pedidos_compra_anexos.url` (119) |
| | `pcp-cotacoes` | 6 | 1 | `ComprasTab` | `pcp_cotacoes_fornecedores.anexo_url` (0 hoje) |
| | `pcp-nf-fornecedor` | 0 | 0 | `FinanceiroTab` | `pcp_pedidos_faturamento.nf_fornecedor_url` (0) |
| | `logistica` | 58 | 12 | `LogisticaTab` (manifesto, fotos) | `logistica_manifestos.fotos` (43) |
| | `pcp-fretes-canhotos` | 4 | 0,1 | `LogisticaTab` | `pcp_fretes.canhoto_url` (1) e `pcp_cotacoes_fretes.anexo_url` (0) |
| | `centro-custo-despesas`, `financeiro-tarefas` | 0 | 0 | `DespesaAnexos`, `FinanceiroKanban` | `centro_custo_despesas_anexos.url`, `financeiro_tarefa_anexos.url` (0) |
| | `viagens`, `terceiros`, `contratos-padrao` | 8 | 3,5 | `ViagemProvisionamento`, `ViagemComprovantes`, `TerceirosServicos`, `AdminTab` | `viagens.comprovantes` e `contrato_anexos` (0), `terceiros_servicos.anexos` (0), `contratos_padrao.arquivo_url` (2) |
| **B2** | `opl-anexos`, `ops-em-criacao`, `demandas-avulsas`, `demandas-cotacoes` | 164 | 68 | `OplAnexosWidget`, `NovaOpOsModal`, `FormacaoPrecosTab`, `DemandaAvulsaPanel`, `SetorDemandaTab`, `FotosVeiculo` | `opl_anexos.url` (85), `demanda_avulsa_anexos.url` (52), `oples.fotos_veiculo` (10) |
| | `desenvolvimento`, `engenharia-tarefas`, `analise`, `produtos` | 35 | 24 | `DesenvolvimentoPecasTab`, `DesenvolvimentoPorta`, `TarefaAnexos`, `AnaliseWidget`, `CadastroProdutosTab`, `ProdutoArquivos` | `engenharia_desenvolvimento.anexos` (4), `engenharia_tarefas_anexos.url` (6), `analise_anexos.url` (6) |
| | `vistorias`, `sac` (as fotos) | 37 | 8 | `VistoriasPatio`, `SacTab` | `vistorias_patio.fotos_saida` (16), `sac_ordens_servico.arquivos_os` e `fotos_entrada` (1 cada) |
| **B3** | `crm-anexos` | 48 | 32 | `CrmAnexosWidget` | `crm_anexos.url` (41) |
| **B4** | `licitacoes` | 1.660 | 1.545 | `LicitacoesTab` (documentos, anexos, "área livre") | `licitacao_documentos.url` (1.124 dela) e `.anexo_url` (87) |
| | `crm-docs` (**descoberto na B0: é o arquivo dos documentos das Licitações**, subido pelo `CrmTab` ao abrir uma licitação) | 282 | 114 | `CrmTab` | `licitacao_documentos.url` (180); **106 desses arquivos são imagens coladas dentro de notas** (`crm-docs/<licitação>/nota/`): o endereço está dentro do texto da nota (`licitacao_documentos.conteudo`, 27 notas) |
| **Fim** | todas | 2.791 | 1.850 | | conferência final e virada do `acn-media` |

Maior arquivo: 42,8 MB (licitações). **O bucket privado hoje aceita 20 MB por arquivo: subir para 50 MB na B0.**

## 3. Como se faz (a técnica já existe, da onda 5b)

- **Mesmo caminho, outro bucket.** O arquivo novo vai ao `acn-privado` pelo `enviarArquivoPrivado` e o banco guarda `privado:<caminho>`. O registro antigo guarda o endereço público e continua abrindo: o ajudante (`ArquivoPrivado.ts`) tenta o privado e cai no endereço velho enquanto o arquivo não foi copiado. **A lista de pastas privadas é `caminhoEhPrivado` (`ArquivoPrivadoRegras.ts`): cada fatia acrescenta as suas pastas ali e no script de cópia.**
- **A regra do bucket privado já vale para qualquer pasta nova:** quem entrou lê e envia (só o chat tem regra por sala). Nenhuma fatia precisa de SQL novo, salvo a B0 (limite de tamanho).
- **A leitura é o trabalho de verdade.** Em toda tela que mostra ou abre um anexo daquela família, o `<a href={url}>` vira `LinkDeArquivo`/`abrirArquivo` e o `<img src={url}>` vira `ImagemPrivada`; PDF montado no navegador pede o endereço com `urlDoArquivo` antes do `fetch`. **Antes de cada fatia vem uma "7.x de achados"** (como no `/ux-fluxo`): listar, na tela, cada ponto que lê um endereço da família, para nenhum ficar de fora.
- **Cuidados que o levantamento já achou:**
  1. **Listas grandes** (as 1.304 linhas de documentos das licitações): não pedir 1.304 endereços ao abrir a tela. O link pede o endereço **no clique** (`abrirArquivo`), e miniatura só pede quando aparece na tela. Se for preciso resolver muitos de uma vez, usar `createSignedUrls` (vários caminhos numa chamada).
  2. **`upsert: true` nos envios:** o bucket privado só tem política de inserir (de propósito); os nomes já levam `Date.now()`, então o envio novo usa `upsert: false`.
  3. **Apagar arquivo:** `CrmAnexosWidget` chama `remove`. Hoje, no público, a chamada "dá certo" sem apagar nada (não há política de apagar); no privado também não apaga. Nada se apaga pelo navegador (regra do projeto: nunca apagar dado do usuário); se um dia precisar apagar de verdade, é decisão própria.
  4. **Aba aberta de antes da publicação** grava no público até recarregar (`VersaoNova.ts` avisa); o script de cópia pega o que sobrar.
  5. **Fotos em lista dentro de `jsonb`** (`logistica_manifestos.fotos`, `oples.fotos_veiculo`, `vistorias_patio.fotos_saida`): cada elemento é um endereço; a leitura passa por `ImagemPrivada` elemento a elemento.
  6. **Imagem colada dentro de uma nota** (achado da B0: 106 arquivos de `crm-docs/…/nota/`, 27 notas em `licitacao_documentos.conteudo`): o endereço está **dentro do texto HTML** da nota, onde um `<img>` não pode usar o ajudante. Desenho a decidir na B4: a nota passa a guardar `<img data-arquivo="privado:caminho">` e um componente (`ConteudoComImagens`) troca pelo endereço assinado depois de desenhar a nota; as notas antigas, com endereço público inteiro, passam pelo mesmo componente (o ajudante já traduz). **Enquanto esse componente não existir, as imagens de nota ficam como exceção no público** (a pasta `crm-docs/*/nota/` fora da cópia).
  7. **O botão "Remover" e o "Substituir" de anexo** não podem mais comparar o endereço com `startsWith('https://…')`; usar `caminhoDoValor`.

## 4. As fatias

Cada fatia é: **7.x de achados → trocar envio e leitura → build → teste no navegador (armazenamento simulado) → publicar a tela → o usuário roda o script (`--copiar`, confere, `--apagar`)**. O script passa a aceitar a lista de pastas da fatia. Nenhuma fatia mexe no banco de dados dos registros: só os arquivos mudam de lugar e o endereço antigo continua valendo (o ajudante o traduz).

- **B0 — Preparação (feita em 26/11/2026, só banco e ferramentas).** (1) **Limite do `acn-privado` subido de 20 para 50 MB** (migração `bucket_privado_b0_limite_50mb`, `supabase/sql/bucket_privado_b0_limite_50mb.sql`, reverter ao lado; banco quieto, 0 consultas ativas). (2) **Script de cópia por fatia** (`--fatia=5b|b1|b2|b3|b4` ou `--pastas=a,b`): ensaio com tabela por pasta (públicos, privados, faltam, tamanho diferente), cópia que também refaz a cópia que ficou pela metade, e `--apagar` que **só roda com `--tela-publicada`** (confirma que a tela da fatia está no ar); testado com um armazenamento falso (guardas, cópia, tamanho diferente), **não rodado contra o real**. (3) **Varredura** (`supabase/sql/varredura_enderecos_publicos.sql`, só leitura): por coluna, quantas linhas têm endereço público e quantas já têm `privado:`; **resultado de hoje: 22 colunas com endereço público, 0 com `privado:`** (a maior: `licitacao_documentos.url`, 1.304; `cq_auditorias.assinatura_url`, 280, já lida pelo ajudante da 5b). (4) **Achado:** `crm-docs` é das Licitações (ver o inventário), e há imagens coladas dentro de notas (cuidado 6). (5) **Espaço:** copiar duplica por um tempo (1,8 GB no total, 1,5 GB só as licitações); o bucket já tem 1,8 GB, acima dos 1 GB do plano gratuito do Supabase, então o projeto está num plano pago, mas **o usuário confere a cota no painel (Storage) antes da B4**. **Não feito de propósito:** `LinkDeArquivo` em lista e `ImagemPrivada` com adiamento ficam para a B4, quando houver a tela real para testar.
- **B1 — Compras, Logística e Financeiro (a primeira, escolha do usuário).** Pastas da tabela acima: `compras-anexos`, `pcp-cotacoes`, `pcp-nf-fornecedor`, `logistica`, `pcp-fretes-canhotos`, `centro-custo-despesas`, `financeiro-tarefas`, `viagens`, `terceiros`, `contratos-padrao`. ~200 arquivos, ~35 MB, a maior parte de imagens e PDFs de nota e cotação. Serve de ensaio de toda a técnica.
- **B2 — OP, Produção, Engenharia, Vistoria e SAC (fotos).** As pastas de OP (`opl-anexos`, `ops-em-criacao`), de demandas, de desenvolvimento e engenharia, de vistoria e as fotos do SAC. ~236 arquivos, ~100 MB. **Telas grandes ainda não migradas para o design system (`DemandaAvulsaPanel`, `CadastroProdutosTab`): perguntar ao usuário se vale mexer só no ponto do anexo, sem migrar a tela** (regra do projeto).
- **B3 — CRM.** Só `crm-anexos` (48 arquivos, 32 MB, `CrmAnexosWidget`). Pequena.
- **B4 — Licitações (a maior), com `crm-docs`.** 1.942 arquivos, 1,66 GB, 1.391 linhas de documento e 27 notas com imagem. É a que mais pede o cuidado da leitura em lista (cuidado 1) e a que mais demora a copiar: o script deve rodar fora do horário. Aqui também vale uma conferência por amostra: abrir um de cada tipo (PDF, imagem, planilha) antes do `--apagar`.
- **Fim — Fechar o `acn-media`.** Só quando a varredura der **zero** linhas com endereço público e o script não achar mais nada para copiar: virar o `acn-media` para privado (`public = false`), com todas as telas já lendo pelo ajudante. A partir daí o endereço público deixa de existir para qualquer pasta. **Esse passo não tem volta limpa depois do `--apagar`:** por isso a ordem é cópia, conferência, uso no sistema por alguns dias, e só então apagar e virar. Depois: tirar `getPublicUrl` do código (nenhum envio novo usa), tirar as políticas antigas do `acn-media` e atualizar o `CLAUDE.md`.

## 5. Depois (fase própria, só se o usuário pedir)

**Separar por aba as pastas do privado**, como já se fez com as tabelas (ex.: comprovantes só para quem tem Financeiro; licitações só para quem tem Licitações ou CRM). A política do bucket já enxerga a pasta (`(storage.foldername(name))[1]`) e a função `tem_alguma_aba` existe; **antes de qualquer separação, contar quantos ativos têm as abas da pasta** (lição da onda 3d: se quase todos têm, a separação não protege ninguém).

## 6. Testes de cada fatia

- No navegador, com o armazenamento simulado (`ferramentas/migrar_bucket/teste_ajudante.cjs` é o molde): cada tela da família abre o anexo pelo endereço assinado, **também o registro antigo com endereço público**, e **nenhum pedido sai para `/object/public/acn-media/`** (é a conferência que diz que nenhum ponto de leitura ficou de fora).
- No banco real: a varredura da B0 antes e depois (as linhas "privado:" crescem, as públicas só caem depois do script), a checagem do `/saude-banco` e o ensaio de política só se a regra do bucket mudar.
- **Defeito plantado de propósito** (como em `plantar_defeitos.cjs`): trocar um `LinkDeArquivo` de volta por `<a href>` e conferir que o teste o pega.

## 7. O que não entra

- Apagar arquivo pelo navegador, restaurar versão de arquivo, antivírus e limite de cota por pessoa.
- O bucket `acn-inicio` (carrossel da tela Início) e o `crm-audios` já são privados.
- Link temporário para mandar arquivo a quem está fora (o usuário disse que ninguém manda link de arquivo para fora; se isso mudar, vira desenho novo: endereço assinado por alguns dias, só de quem tem a aba).

## 8. Estado

| Fatia | Situação |
|---|---|
| B0 Preparação | **feita em 26/11/2026** (limite de 50 MB aplicado, script por fatia, varredura, achado do `crm-docs`; nada de tela mudou) |
| B1 Compras, Logística, Financeiro | a fazer (primeira, escolha do usuário em 26/11/2026) |
| B2 OP, Produção, Engenharia, Vistoria, SAC | a fazer |
| B3 CRM (`crm-anexos`) | a fazer |
| B4 Licitações e `crm-docs` | a fazer |
| Fim: virar o `acn-media` | a fazer |
| Pendência anterior (onda 5b) | o usuário rodar a cópia dos 378 arquivos de chat e assinaturas |
