# Passar arquivos para o bucket privado (Etapa 17, onda 5b e fatias do PLANO_BUCKET_PRIVADO.md)

Os anexos do chat e as assinaturas (CQ, vistoria de pátio, aprovação e entrega de OS do SAC) moram agora no bucket **privado** `acn-privado`. Os arquivos que já
existiam continuam no bucket público `acn-media` até este script copiá-los. **Enquanto não forem copiados o sistema continua mostrando-os** (cai no endereço antigo);
depois de copiados e do `--apagar`, o endereço público deixa de existir e só se abre por dentro do sistema.

Em 26/11/2026 a fatia 5b tinha 378 arquivos (342 assinaturas, 4 do SAC, 32 do chat; ~30 MB).

**Varredura de endereços no banco (só leitura):** `supabase/sql/varredura_enderecos_publicos.sql` mostra, por coluna, quantas linhas ainda guardam endereço público e quantas já guardam `privado:`.

## Quem roda e com quê

Só quem tem a chave **service_role** do projeto (Supabase → Project Settings → API → `service_role`). Ela é do usuário: **não cole no chat, não grave em arquivo,
não commite**. Entra só por variável de ambiente, na janela do PowerShell em uso:

```powershell
$env:SUPABASE_SERVICE_KEY = Read-Host "Chave service_role"
cd <pasta do projeto>
node ferramentas/migrar_bucket/migrar_para_privado.cjs                         # 1) ensaio da fatia 5b (chat e assinaturas): só conta, não muda nada
node ferramentas/migrar_bucket/migrar_para_privado.cjs --copiar                # 2) copia o que falta (os originais ficam)
node ferramentas/migrar_bucket/migrar_para_privado.cjs                         # 3) confere: "faltam copiar: 0 · tamanho diferente: 0"
node ferramentas/migrar_bucket/migrar_para_privado.cjs --apagar --tela-publicada   # 4) só depois de abrir um anexo do chat e uma assinatura no sistema
Remove-Item Env:SUPABASE_SERVICE_KEY
```

**Outras fatias** (uma por vez, só quando a tela daquela fatia estiver publicada; a lista das pastas está no topo do script e no plano): `--fatia=b1` (Compras, Logística, Financeiro),
`b2` (OP, Produção, Engenharia, Vistoria, SAC), `b3` (CRM), `b4` (Licitações e `crm-docs`); ou `--pastas=pasta1,pasta2` para escolher à mão. O ensaio mostra uma linha por pasta.
Se uma cópia ficou pela metade (tamanho diferente), o `--copiar` a refaz; o `--apagar` se recusa enquanto houver qualquer uma.

O `--apagar` se recusa a rodar se algum arquivo ainda não foi copiado ou foi copiado com tamanho diferente, e só aceita com `--tela-publicada` (você confirma que a tela da fatia
está no ar). Apagar o original público é **definitivo**: por isso o passo 4 só depois de conferir no sistema que os arquivos abrem.

## Conferência da B1 (varredura do código + navegador com o armazenamento simulado)

```powershell
# com o servidor de desenvolvimento no ar (porta 5173); NODE_PATH aponta para uma pasta node_modules que tenha o puppeteer-core
node ferramentas/migrar_bucket/teste_b1.cjs
```

## Conferência das regras (sem banco)

```powershell
node ferramentas/migrar_bucket/teste_regras.mjs
```
