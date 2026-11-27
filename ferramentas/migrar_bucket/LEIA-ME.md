# Passar chat e assinaturas para o bucket privado (Etapa 17, onda 5b)

Os anexos do chat e as assinaturas (CQ, vistoria de pátio, aprovação e entrega de OS do SAC) moram agora no bucket **privado** `acn-privado`. Os arquivos que já
existiam continuam no bucket público `acn-media` até este script copiá-los. **Enquanto não forem copiados o sistema continua mostrando-os** (cai no endereço antigo);
depois de copiados e do `--apagar`, o endereço público deixa de existir e só se abre por dentro do sistema.

Em 26/11/2026 eram 378 arquivos (342 assinaturas, 4 do SAC, 32 do chat; ~30 MB).

## Quem roda e com quê

Só quem tem a chave **service_role** do projeto (Supabase → Project Settings → API → `service_role`). Ela é do usuário: **não cole no chat, não grave em arquivo,
não commite**. Entra só por variável de ambiente, na janela do PowerShell em uso:

```powershell
$env:SUPABASE_SERVICE_KEY = Read-Host "Chave service_role"
cd <pasta do projeto>
node ferramentas/migrar_bucket/migrar_para_privado.cjs            # 1) ensaio: só conta, não muda nada
node ferramentas/migrar_bucket/migrar_para_privado.cjs --copiar   # 2) copia o que falta (os originais ficam)
node ferramentas/migrar_bucket/migrar_para_privado.cjs            # 3) confere: "faltam copiar: 0 · tamanho diferente: 0"
node ferramentas/migrar_bucket/migrar_para_privado.cjs --apagar   # 4) só depois de abrir um anexo do chat e uma assinatura no sistema
Remove-Item Env:SUPABASE_SERVICE_KEY
```

O `--apagar` se recusa a rodar se algum arquivo ainda não foi copiado ou foi copiado com tamanho diferente. Apagar o original público é **definitivo**: por isso o passo 4
só depois de conferir no sistema que os arquivos abrem.

## Conferência das regras (sem banco)

```powershell
node ferramentas/migrar_bucket/teste_regras.mjs
```
