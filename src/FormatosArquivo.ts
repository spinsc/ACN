// Formatos de arquivo aceitos nos campos de anexo/importação do sistema.
// Centralizado aqui para que todas as telas aceitem as mesmas planilhas.

// Planilhas: Excel em todas as variações (padrão .xlsx, com macro .xlsm,
// binária .xlsb, antiga .xls, modelos .xltx/.xltm/.xlt, .xlw), LibreOffice/
// OpenOffice (.ods/.ots/.fods), Apple Numbers, WPS (.et/.ett) e texto (.csv/.tsv).
export const EXT_PLANILHAS = [
  '.xlsx', '.xlsm', '.xlsb', '.xls', '.xltx', '.xltm', '.xlt', '.xlw',
  '.ods', '.ots', '.fods', '.numbers', '.et', '.ett', '.csv', '.tsv',
].join(',');

// Importação (lida pelo SheetJS): além das planilhas acima, os formatos
// antigos/de exportação que ele também entende — texto separado por
// tabulação (.txt), SpreadsheetML 2003 (.xml), DIF, SYLK, PRN, dBASE, Lotus
// e Quattro Pro.
export const EXT_PLANILHAS_IMPORTACAO = [
  EXT_PLANILHAS,
  '.txt', '.xml', '.dif', '.slk', '.prn', '.dbf', '.wk1', '.wk3', '.wks', '.wq1', '.qpw',
].join(',');

// Office e planilhas sobem como octet-stream: para vários desses formatos o
// navegador informa um MIME inconsistente ou vazio (.xlsm, .xlsb, .numbers e
// .ods costumam vir sem tipo nenhum).
const RE_OFFICE = /\.(docx?|docm|dotx?|odt|pptx?|pptm|odp|xlsx|xlsm|xlsb|xls|xltx|xltm|xlt|xlw|ods|ots|fods|numbers|et|ett)$/i;

export function contentTypeUpload(file: File): string {
  return RE_OFFICE.test(file.name) ? 'application/octet-stream' : file.type;
}

// Nome que o armazenamento aceita (o nome original continua guardado à parte, para aparecer na lista). Pedido do usuário em 16/10/2026: o armazenamento recusa
// chave com acento ou símbolo ("Especificação (v2).pdf"), e as telas que só trocavam o espaço por "_" perdiam o arquivo em silêncio.
export function nomeSeguroDeArquivo(nome: string): string {
  const ponto = nome.lastIndexOf('.');
  const ext = ponto > 0 ? nome.slice(ponto).toLowerCase().replace(/[^a-z0-9.]/g, '') : '';
  const base = ponto > 0 ? nome.slice(0, ponto) : nome;
  const limpo = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  return (limpo || 'arquivo') + ext;
}
