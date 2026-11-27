// Plano do bucket privado (onda 5b e fatias B1 a B4, 26/11/2026): copia arquivos do bucket PÚBLICO `acn-media` para o PRIVADO `acn-privado` (mesmo caminho)
// e, só no fim e só se o usuário mandar, apaga os originais públicos. LEIA o LEIA-ME.md ao lado antes de rodar.
//
//   node migrar_para_privado.cjs [--fatia=5b|b1|b2|b3|b4|b4b]          → ensaio: conta por pasta o que há e o que já foi copiado (não muda nada)
//   node migrar_para_privado.cjs --fatia=b1 --copiar                  → copia o que falta (os originais ficam)
//   node migrar_para_privado.cjs --fatia=b1 --apagar --tela-publicada → apaga do público o que JÁ está no privado com o mesmo tamanho
//   (--pastas=a,b,c no lugar de --fatia= escolhe pastas à mão; vale a pasta inteira)
//
// A fatia padrão é a 5b (chat, assinaturas e as assinaturas do SAC). `--apagar` só vale com `--tela-publicada`: ao apagar o original, o endereço público deixa de abrir,
// então a tela da fatia (que lê pelo ajudante e cai no privado) TEM de estar publicada e conferida antes.
// A chave de serviço (service_role) é do usuário: ela entra pela variável de ambiente SUPABASE_SERVICE_KEY e nunca é gravada em arquivo nem mostrada.
const { createClient } = require('@supabase/supabase-js');

const URL_DO_BANCO = 'https://qgemelnuqdilnggxmrdw.supabase.co';
const ORIGEM = 'acn-media';
const DESTINO = 'acn-privado';

// O que cada fatia leva. `so` = só os arquivos da pasta que casam com a expressão. Mantenha igual ao plano (PLANO_BUCKET_PRIVADO.md, seção 4)
// e à lista de pastas privadas do código (src/ArquivoPrivadoRegras.ts, caminhoEhPrivado), que cresce a cada fatia publicada.
const SEM_IMAGEM_DE_TEXTO = /^(?!.*\/(area-livre|nota)\/)/;   // as barras PRECISAM de contrabarra: sem ela o script nem abre (erro achado ao preparar a B2, 26/11/2026)
const FATIAS = {
  '5b': [{ pasta: 'chat' }, { pasta: 'assinaturas' }, { pasta: 'sac', so: /^sac\/[^/]+\/assinatura_[^/]*$/ }],
  // imagem colada dentro de texto formatado (/area-livre/, /nota/) fica pública: o endereço está dentro do HTML (ver caminhoEhPrivado em src/ArquivoPrivadoRegras.ts)
  b1: ['compras-anexos', 'pcp-cotacoes', 'pcp-nf-fornecedor', 'pcp-fretes-cotacoes', 'logistica', 'pcp-fretes-canhotos', 'centro-custo-despesas', 'financeiro-tarefas', 'viagens', 'terceiros', 'contratos-padrao']
    .map((pasta) => ({ pasta, so: SEM_IMAGEM_DE_TEXTO })),
  // B2: `produtos` FICA DE FORA (decisão do usuário em 26/11/2026: fotos e catálogo vão na proposta ao cliente, o link precisa continuar abrindo);
  // `sac` entra só com as fotos e arquivos das OS (a assinatura já foi na 5b: o `so` abaixo as deixa de lado, e elas casam com a regra do código).
  b2: ['opl-anexos', 'ops-em-criacao', 'demandas-avulsas', 'demandas-cotacoes', 'desenvolvimento', 'engenharia-tarefas', 'analise', 'vistorias']
    .map((pasta) => ({ pasta, so: SEM_IMAGEM_DE_TEXTO }))
    .concat([{ pasta: 'sac', so: /^sac\/[^/]+\/(?!assinatura_)[^/]*$/ }])
    // dos produtos só a subpasta "projeto" (arquivos de projeto); fotos e catálogo ficam públicos. Hoje não há arquivo nela.
    .concat([{ pasta: 'produtos', so: /^produtos\/[^/]+\/projeto\// }]),
  b3: ['crm-anexos'].map((pasta) => ({ pasta })),
  // `crm-docs` é o arquivo dos documentos das Licitações (descoberto na B0). As imagens coladas em texto (/area-livre/ com 279 arquivos, /nota/ com 106)
  // ficam de fora: o endereço está dentro do HTML e a tela não as lê pelo ajudante (fatia B4b). 1,5 GB: rode fora do horário.
  b4: ['licitacoes', 'crm-docs'].map((pasta) => ({ pasta, so: SEM_IMAGEM_DE_TEXTO })),
  // B4b (26/11/2026): SÓ as imagens coladas em texto (/area-livre/ e /nota/) das pastas que já são privadas: 387 arquivos, 40 MB (279 de licitacoes, 106 de crm-docs, 2 de pcp-cotacoes).
  // Rode depois que a tela da B4b estiver publicada (a tela nova lê pela marca e, enquanto a cópia não foi feita, cai no endereço velho).
  b4b: ['licitacoes', 'crm-docs', 'pcp-cotacoes'].map((pasta) => ({ pasta, so: /\/(area-livre|nota)\// })),
};

const arg = (nome) => { const a = process.argv.find((x) => x.startsWith('--' + nome + '=')); return a ? a.slice(nome.length + 3) : null; };
const tem = (nome) => process.argv.includes('--' + nome);

const chave = process.env.SUPABASE_SERVICE_KEY;
if (!chave) { console.error('Falta a variável SUPABASE_SERVICE_KEY (a chave service_role do projeto). Veja o LEIA-ME.md.'); process.exit(2); }
const copiar = tem('copiar');
const apagar = tem('apagar');
if (copiar && apagar) { console.error('Use --copiar OU --apagar, não os dois juntos: confira o resultado da cópia antes de apagar.'); process.exit(2); }
if (apagar && !tem('tela-publicada')) {
  console.error('--apagar exige também --tela-publicada: confirme que a tela da fatia já está publicada e que você abriu arquivos dela no sistema.');
  process.exit(2);
}
let grupos;
if (arg('pastas')) grupos = arg('pastas').split(',').map((p) => p.trim()).filter(Boolean).map((pasta) => ({ pasta }));
else {
  const nome = arg('fatia') || '5b';
  grupos = FATIAS[nome];
  if (!grupos) { console.error('Fatia desconhecida: ' + nome + '. Use uma de: ' + Object.keys(FATIAS).join(', ') + '.'); process.exit(2); }
  console.log('Fatia ' + nome + ': ' + grupos.map((g) => g.pasta).join(', '));
}
const sb = createClient(URL_DO_BANCO, chave, { auth: { persistSession: false, autoRefreshToken: false } });

async function listar(bucket, prefixo) {
  const achados = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.storage.from(bucket).list(prefixo, { limit: 1000, offset: desde, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error('não consegui listar ' + bucket + '/' + prefixo + ': ' + error.message);
    for (const item of data) {
      const caminho = prefixo ? prefixo + '/' + item.name : item.name;
      if (item.id === null) achados.push(...await listar(bucket, caminho));   // pasta
      else achados.push({ caminho, tamanho: Number(item.metadata && item.metadata.size) || 0 });
    }
    if (data.length < 1000) break;
  }
  return achados;
}
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

(async () => {
  const alvo = [];
  const no_privado = new Map();
  console.log('\nPasta                       públicos    privados   faltam   tamanho≠   (público: MB)');
  for (const g of grupos) {
    const publicos = (await listar(ORIGEM, g.pasta)).filter((a) => !g.so || g.so.test(a.caminho));
    const privados = new Map();
    for (const a of await listar(DESTINO, g.pasta)) if (!g.so || g.so.test(a.caminho)) privados.set(a.caminho, a.tamanho);
    for (const [k, v] of privados) no_privado.set(k, v);
    alvo.push(...publicos);
    const faltam = publicos.filter((a) => !privados.has(a.caminho)).length;
    const dif = publicos.filter((a) => privados.has(a.caminho) && privados.get(a.caminho) !== a.tamanho).length;
    console.log(g.pasta.padEnd(28) + String(publicos.length).padStart(8) + String(privados.size).padStart(12) + String(faltam).padStart(9) + String(dif).padStart(11) + '   ' + mb(publicos.reduce((s, a) => s + a.tamanho, 0)));
  }
  const faltam = alvo.filter((a) => !no_privado.has(a.caminho));
  const diferentes = alvo.filter((a) => no_privado.has(a.caminho) && no_privado.get(a.caminho) !== a.tamanho);
  const prontos = alvo.filter((a) => no_privado.has(a.caminho) && no_privado.get(a.caminho) === a.tamanho);
  console.log('\nTotal: ' + alvo.length + ' arquivos públicos (' + mb(alvo.reduce((s, a) => s + a.tamanho, 0)) + ') · faltam copiar: ' + faltam.length + ' (' + mb(faltam.reduce((s, a) => s + a.tamanho, 0)) + ') · copiados com tamanho diferente: ' + diferentes.length + ' · copiados e conferidos: ' + prontos.length);

  if (!copiar && !apagar) { console.log('\nEnsaio: nada foi alterado. Para copiar: --copiar. Depois de conferir e de a tela estar publicada: --apagar --tela-publicada.'); return; }

  if (copiar) {
    let ok = 0, falhou = 0;
    // cópia com tamanho diferente (ficou pela metade): o original público ainda existe, então a do privado é refeita
    for (const a of diferentes) await sb.storage.from(DESTINO).remove([a.caminho]);
    for (const a of [...faltam, ...diferentes]) {
      const { error } = await sb.storage.from(ORIGEM).copy(a.caminho, a.caminho, { destinationBucket: DESTINO });
      if (error) { falhou++; console.log('  FALHOU ' + a.caminho + ': ' + error.message); } else ok++;
      if ((ok + falhou) % 100 === 0) console.log('  … ' + (ok + falhou) + ' de ' + (faltam.length + diferentes.length));
    }
    console.log('\nCopiados: ' + ok + ' · falharam: ' + falhou + '. Os originais públicos continuam lá. Rode sem --copiar para conferir e, se estiver tudo igual, --apagar.');
    process.exit(falhou ? 1 : 0);
  }

  if (apagar) {
    if (faltam.length || diferentes.length) {
      console.error('\nNÃO apaguei nada: ' + faltam.length + ' arquivo(s) ainda não foram copiados e ' + diferentes.length + ' foram copiados com tamanho diferente. Rode --copiar e confira de novo.');
      process.exit(1);
    }
    let apagados = 0;
    for (let i = 0; i < prontos.length; i += 100) {
      const bloco = prontos.slice(i, i + 100).map((a) => a.caminho);
      const { data, error } = await sb.storage.from(ORIGEM).remove(bloco);
      if (error) { console.error('Erro ao apagar um bloco: ' + error.message); process.exit(1); }
      apagados += data.length;
    }
    console.log('\nApagados do bucket público: ' + apagados + ' (cada um já estava no privado, com o mesmo tamanho).');
  }
})().catch((e) => { console.error('Erro: ' + e.message); process.exit(1); });
