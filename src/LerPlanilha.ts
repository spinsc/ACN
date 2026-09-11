import * as XLSX from 'xlsx';

// Formatos texto: o SheetJS precisa receber o texto já decodificado (o parser
// binário assume codepage 1252 e corrompe acentos/cabeçalhos em UTF-8).
// (SYLK/DIF ficam de fora: o Excel os grava em Windows-1252, que o caminho
// binário já lê certo — pelo caminho texto o SheetJS reencoda e estraga acentos.)
const RE_TEXTO = /\.(csv|tsv|txt|prn)$/i;

// CSV/TXT não dizem o encoding. O Excel em português salva "CSV" em
// Windows-1252, "CSV UTF-8" em UTF-8 com BOM e "Texto Unicode" em UTF-16.
function decodificarTexto(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

// Lê qualquer planilha que o SheetJS entenda (.xlsx, .xlsm, .xlsb, .xls, .ods,
// .numbers, .csv...). Macros de .xlsm/.xlsb são ignoradas — só os dados são
// lidos, nada é executado.
// Nos formatos texto as células chegam como TEXTO (raw): o SheetJS converteria
// números no padrão americano — "1.234,56" do Excel em português virava
// 1,23456 e "1234,56" virava 123456. Quem consome converte (ver parseNumero
// em CadastroItensTab). Bônus: códigos como "00123" mantêm os zeros.
export async function lerPlanilha(file: File): Promise<XLSX.WorkBook> {
  const buf = await file.arrayBuffer();
  return RE_TEXTO.test(file.name)
    ? XLSX.read(decodificarTexto(new Uint8Array(buf)), { type: 'string', raw: true })
    : XLSX.read(buf, { type: 'array' });
}

// Primeira aba visível e com dados. Pastas com macro costumam ter abas
// ocultas de configuração na frente; gráficos/diálogos não têm células.
export function primeiraAbaComDados(wb: XLSX.WorkBook): XLSX.WorkSheet | undefined {
  const props = wb.Workbook?.Sheets || [];
  const nome = wb.SheetNames.find((n, i) => !props[i]?.Hidden && wb.Sheets[n]?.['!ref'])
    || wb.SheetNames.find(n => wb.Sheets[n]?.['!ref'])
    || wb.SheetNames[0];
  return wb.Sheets[nome];
}
