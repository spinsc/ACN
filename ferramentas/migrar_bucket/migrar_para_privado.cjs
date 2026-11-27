// Etapa 17, onda 5b (26/11/2026): copia os arquivos antigos do chat e das assinaturas do bucket PÚBLICO `acn-media` para o PRIVADO `acn-privado` (mesmo caminho)
// e, só no fim e só se o usuário mandar, apaga os originais públicos. LEIA o LEIA-ME.md ao lado antes de rodar.
//
//   node migrar_para_privado.cjs                 → ensaio: só conta o que há e o que já foi copiado (não muda nada)
//   node migrar_para_privado.cjs --copiar        → copia o que falta (os originais ficam)
//   node migrar_para_privado.cjs --apagar        → apaga do público o que JÁ está no privado com o mesmo tamanho
//
// A chave de serviço (service_role) é do usuário: ela entra pela variável de ambiente SUPABASE_SERVICE_KEY e nunca é gravada em arquivo nem mostrada.
const { createClient } = require('@supabase/supabase-js');

const URL_DO_BANCO = 'https://qgemelnuqdilnggxmrdw.supabase.co';
const ORIGEM = 'acn-media';
const DESTINO = 'acn-privado';
const chave = process.env.SUPABASE_SERVICE_KEY;
if (!chave) { console.error('Falta a variável SUPABASE_SERVICE_KEY (a chave service_role do projeto). Veja o LEIA-ME.md.'); process.exit(2); }
const copiar = process.argv.includes('--copiar');
const apagar = process.argv.includes('--apagar');
if (copiar && apagar) { console.error('Use --copiar OU --apagar, não os dois juntos: confira o resultado da cópia antes de apagar.'); process.exit(2); }
const sb = createClient(URL_DO_BANCO, chave, { auth: { persistSession: false, autoRefreshToken: false } });

// o mesmo critério de src/ArquivoPrivadoRegras.ts (caminhoEhPrivado)
const ehPrivado = (c) => c.startsWith('chat/') || c.startsWith('assinaturas/') || /^sac\/[^/]+\/assinatura_[^/]*$/.test(c);

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

(async () => {
  console.log('Lendo o bucket público (chat, assinaturas e sac)…');
  const do_publico = [];
  for (const pasta of ['chat', 'assinaturas', 'sac']) do_publico.push(...await listar(ORIGEM, pasta));
  const alvo = do_publico.filter((a) => ehPrivado(a.caminho));
  console.log('  a copiar/conferir: ' + alvo.length + ' arquivos (' + (alvo.reduce((s, a) => s + a.tamanho, 0) / 1048576).toFixed(1) + ' MB)');
  console.log('Lendo o bucket privado…');
  const no_privado = new Map();
  for (const pasta of ['chat', 'assinaturas', 'sac']) for (const a of await listar(DESTINO, pasta)) no_privado.set(a.caminho, a.tamanho);
  console.log('  já no privado: ' + no_privado.size + ' arquivos');

  const faltam = alvo.filter((a) => !no_privado.has(a.caminho));
  const diferentes = alvo.filter((a) => no_privado.has(a.caminho) && no_privado.get(a.caminho) !== a.tamanho);
  const prontos = alvo.filter((a) => no_privado.has(a.caminho) && no_privado.get(a.caminho) === a.tamanho);
  console.log('  faltam copiar: ' + faltam.length + ' · copiados com tamanho diferente: ' + diferentes.length + ' · copiados e conferidos: ' + prontos.length);

  if (!copiar && !apagar) { console.log('\nEnsaio: nada foi alterado. Para copiar: --copiar. Depois de conferir: --apagar.'); return; }

  if (copiar) {
    let ok = 0, falhou = 0;
    for (const a of faltam) {
      const { error } = await sb.storage.from(ORIGEM).copy(a.caminho, a.caminho, { destinationBucket: DESTINO });
      if (error) { falhou++; console.log('  FALHOU ' + a.caminho + ': ' + error.message); } else ok++;
    }
    console.log('\nCopiados: ' + ok + ' · falharam: ' + falhou + '. Os originais públicos continuam lá. Rode sem opção para conferir e, se estiver tudo igual, --apagar.');
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
