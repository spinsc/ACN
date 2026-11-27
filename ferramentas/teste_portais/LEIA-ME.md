# Teste dos portais do cliente (portal.html e veiculo.html)

Criado em 26/11/2026, na onda 5a da Etapa 17. Abre as duas páginas no Chrome com **todas as chamadas ao Supabase simuladas** (nada sai para o banco):
as funções `portal_veiculo_por_token`, `nfc_veiculo_por_chassi`, `nfc_area_restrita` e `portal_abrir_chamado` respondem com dados inventados, e qualquer
pedido direto a uma tabela é registrado como "indevido" e derruba a conferência. 34 conferências: o que cada página pede, o PIN errado, bloqueado e certo,
o chamado, e que texto de chamado ou chassi da barra de endereço nunca vira script (escapado).

Como rodar (servidor de desenvolvimento desta pasta de pé; a porta está fixa na constante `BASE` do arquivo):

```powershell
$env:NODE_PATH = "<pasta>\node_modules"   # com puppeteer-core
node teste_portais.cjs
```

Quem prova o comportamento das funções de verdade, no banco, é `supabase/sql/etapa17_ensaio_onda5a.sql`.
