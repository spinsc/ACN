// Frase em português para o erro que o banco devolve (PLANO_SAC_MELHORIAS_UX.md, B3, 03/11/2026).
// Antes, vários avisos do SAC terminavam em "Erro: " + o texto técnico do banco, às vezes em inglês ("duplicate key value violates unique constraint…"); quem lê decide pelo processo, não pelo código.
// Os casos mais comuns viram uma frase que diz o que fazer; o que não é conhecido volta como veio (a TI precisa do texto original para achar a causa), com a dica de avisar a TI.
// Serve a qualquer tela: recebe o objeto de erro do supabase-js (ou um texto) e devolve só a frase, sem prefixo.
export function explicarErroDoBanco(erro: any): string {
  const msg = String(erro?.message ?? erro ?? '').trim();
  const codigo = String(erro?.code ?? '');
  const detalhe = String(erro?.details ?? '');
  const tudo = `${msg} ${detalhe}`;

  if (codigo === '23505' || /duplicate key|already exists/i.test(tudo)) {
    if (/numero_os/i.test(tudo)) return 'Já existe uma OS com esse número. Confira o número e tente de novo.';
    return 'Já existe um registro com esse mesmo número ou valor. Confira e use outro.';
  }
  if (codigo === '42501' || /row-level security|permission denied|not allowed/i.test(tudo)) return 'Você não tem permissão para fazer isso. Se acha que deveria ter, avise a TI.';
  if (/JWT|token.*expired|invalid claim|not authenticated/i.test(tudo)) return 'Sua sessão expirou. Entre de novo no sistema e repita.';
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(tudo)) return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
  if (codigo === '57014' || /statement timeout|timed out|timeout/i.test(tudo)) return 'O servidor demorou demais para responder. Tente de novo em instantes.';
  if (codigo === '23502' || /null value in column/i.test(tudo)) {
    const coluna = /column "([^"]+)"/i.exec(tudo)?.[1];
    return `Falta preencher um campo obrigatório${coluna ? ` (${coluna})` : ''}.`;
  }
  if (codigo === '23503' || /foreign key/i.test(tudo)) return 'Este registro está ligado a outro que não existe mais (ou que ainda depende dele). Confira o vínculo.';
  if (codigo === '22P02' || /invalid input syntax/i.test(tudo)) return 'Algum valor está em formato inválido (número ou data). Confira os campos.';
  if (codigo === '22001' || /value too long/i.test(tudo)) return 'Um dos textos é longo demais para o campo. Encurte e tente de novo.';
  if (codigo === 'PGRST116' || /JSON object requested|0 rows/i.test(tudo)) return 'O registro não foi encontrado: talvez outra pessoa o tenha mudado ou apagado. Atualize a lista.';
  if (!msg) return 'Erro sem detalhe. Tente de novo e, se repetir, avise a TI.';
  return `${msg} (se repetir, avise a TI)`;
}
