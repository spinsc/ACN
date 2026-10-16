// Tradução dos erros de envio de arquivo para o que a pessoa precisa saber. Pedido do usuário em 16/10/2026: um arquivo não entrava na demanda avulsa da Engenharia e ninguém sabia por quê —
// o armazenamento recusa nome com caractere especial ("Invalid key") e as telas ou calavam, ou mostravam a mensagem técnica em inglês. É uma tradução só, usada por todos os pontos de envio.
// O texto técnico original vai para o console (para o suporte) e só aparece na tela quando o erro não é um dos conhecidos.

const LIMITE_MB = 50;   // limite do próprio armazenamento (bucket acn-media)

const tamanhoBR = (bytes: number) => bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';

/** Frase em português com o motivo da falha de envio. `arquivo` (opcional) deixa a frase de tamanho mais exata. */
export function explicarErroDeEnvio(erro: any, arquivo?: { size?: number } | null): string {
  const bruto = String(erro?.message || erro?.error || (typeof erro === 'string' ? erro : '') || '').trim();
  const baixo = bruto.toLowerCase();
  const status = Number(erro?.statusCode ?? erro?.status ?? 0);
  if (erro) console.warn('Falha no envio de arquivo:', erro);

  if (/invalid key|invalidkey/.test(baixo))
    return 'o nome do arquivo tem um caractere que o sistema não aceita, como acento, cedilha, # % [ ] { } ou barra. Renomeie o arquivo, deixando só letras e números, e envie de novo.';
  if (status === 413 || /exceeded the maximum allowed size|payload too large|entity too large|too large/.test(baixo))
    return (arquivo?.size ? `o arquivo tem ${tamanhoBR(arquivo.size)} e ` : 'o arquivo é grande demais: ') + `o limite do sistema é ${LIMITE_MB} MB. Reduza ou divida o arquivo.`;
  if (status === 415 || /mime type|invalid_mime_type/.test(baixo))
    return 'o sistema não aceita este tipo de arquivo.';
  if (status === 401 || status === 403 || /row-level security|violates row|unauthori[sz]ed|not authori[sz]ed|forbidden|jwt/.test(baixo))
    return 'sem permissão para enviar arquivos. Peça ao administrador do sistema.';
  if (status === 409 || /already exists|duplicate/.test(baixo))
    return 'já existe um arquivo com esse mesmo nome nesta pasta. Renomeie e envie de novo.';
  if (/bucket not found/.test(baixo))
    return 'a pasta de arquivos do sistema não foi encontrada. Avise o suporte.';
  if (/failed to fetch|networkerror|network request failed|load failed|timeout|timed out|abort|offline/.test(baixo))
    return 'a conexão com o servidor falhou, por queda ou oscilação da internet. Confira a conexão e tente de novo.';
  if (status >= 500 || /internal server|bad gateway|service unavailable|gateway/.test(baixo))
    return 'o servidor de arquivos não respondeu. Tente de novo em alguns instantes.';
  return 'o servidor recusou o arquivo' + (bruto ? `: ${bruto.slice(0, 140)}` : '') + '. Se continuar, avise o suporte.';
}

// Os ajudantes de envio que devolvem só "nada" quando falham (SAC, Licitações, OP, Tarefas) guardam o motivo aqui e quem os chamou lê com `motivoDoUltimoEnvio()`.
// Não se mudou o que eles devolvem de propósito: os componentes são `@ts-nocheck`, então um chamador esquecido que trocasse "nada" por um objeto passaria a tratar toda falha como sucesso, sem nenhum aviso.
let ultimoMotivo = '';
export function registrarFalhaDeEnvio(erro: any, arquivo?: { size?: number } | null): string {
  ultimoMotivo = explicarErroDeEnvio(erro, arquivo);
  return ultimoMotivo;
}
/** Lê (e esquece) o motivo da última falha registrada. */
export function motivoDoUltimoEnvio(): string {
  const m = ultimoMotivo || 'o envio falhou';
  ultimoMotivo = '';
  return m;
}
