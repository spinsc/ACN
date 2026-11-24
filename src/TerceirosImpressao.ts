// Serviços de terceiros: o que o CONTRATO e a ORDEM DE SERVIÇO impressos repartem (fatia T4 do PLANO_SERVICOS_TERCEIROS.md, 23/11/2026): a folha A4, os textos escapados e a janela de impressão.
// O padrão é o de SacImpressaoOS.ts (a OS do SAC): uma janela nova com o HTML pronto, A4, conteúdo no alto e assinatura no pé, cores forçadas porque o navegador, por padrão, não imprime fundo.
// Duas regras que não se quebram:
//  • a janela abre NA HORA do clique, antes de qualquer espera (a leitura dos carros no banco): o navegador só deixa abrir janela nova dentro do clique, e o que abre depois de uma espera é barrado;
//  • todo texto que vem do cadastro entra escapado (`esc`): o nome de um prestador com "<" ou "&" não pode quebrar a folha nem injetar código na janela de impressão.
// Quem monta o HTML são TerceirosContrato.ts e TerceirosOrdemImpressao.ts (funções puras, testáveis sem janela); aqui só a moldura e o abrir/escrever.

export const esc = (t: unknown): string =>
  String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** "2026-11-25" → "25/11/2026" (data só de DIA, nunca `new Date(texto)`: a meia-noite de Londres é o dia anterior no Brasil). */
export const dataBR = (iso: unknown): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/** O campo que o cadastro não tem: uma linha em branco para escrever à mão (como o chassi da OS do SAC). */
export const emBranco = (larga = false): string => `<span class="branco${larga ? ' larga' : ''}"></span>`;

/** O texto ou, se não há, a linha em branco. */
export const textoOuBranco = (t: unknown, larga = false): string => (String(t ?? '').trim() ? esc(String(t).trim()) : emBranco(larga));

export const CSS_DA_FOLHA = `
  *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:Arial,sans-serif;color:#1e293b;background:#fff;padding:20px;font-size:12.5px;line-height:1.4}
  @page{size:A4;margin:12mm}
  @media print{body{padding:0}}
  /* a folha inteira: o conteúdo cresce e empurra a assinatura para o pé da página (268mm = A4 menos as margens, com folga para não abrir uma segunda folha em branco) */
  .pagina{min-height:268mm;display:flex;flex-direction:column}
  .conteudo{flex:1}
  .cab{background:#0f766e;color:#fff;padding:14px 18px;border-radius:4px;margin-bottom:12px}
  .cab .empresa{font-size:17px;font-weight:700;letter-spacing:.3px}
  .cab .dados{font-size:11px;opacity:.92;margin-top:3px}
  .titulo{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;border-bottom:2px solid #0f766e;padding-bottom:6px;margin-bottom:10px}
  .titulo h1{font-size:16px;color:#0f766e;text-transform:uppercase;letter-spacing:.4px}
  .titulo .ref{font-size:11.5px;color:#475569;text-align:right}
  .minuta{border:2px solid #b91c1c;background:#fef2f2;color:#b91c1c;font-weight:700;text-align:center;padding:6px 8px;margin-bottom:10px;border-radius:4px;font-size:12px}
  .aviso{border:1px solid #b45309;background:#fffbeb;color:#92400e;padding:6px 8px;margin-bottom:10px;border-radius:4px;font-size:11.5px}
  .sec{margin-bottom:11px}
  .sec-t{font-size:11px;font-weight:700;color:#0f766e;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #cbd5e1;padding-bottom:2px;margin-bottom:5px}
  table{width:100%;border-collapse:collapse}
  thead{display:table-header-group}
  tr{page-break-inside:avoid}
  th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;vertical-align:top;font-size:12px}
  th{background:#f1f5f9;font-weight:700;font-size:11px}
  td.num,th.num{text-align:right;white-space:nowrap}
  table.campos th{width:23%;background:#f8fafc}
  table.partes td{width:50%}
  table.partes .quem{font-size:10.5px;font-weight:700;color:#0f766e;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px}
  .linha{margin:1px 0}
  .linha.total{margin-top:5px}
  .caixa{display:inline-block;width:12px;height:12px;border:1px solid #1e293b;vertical-align:middle}
  td.centro,th.centro{text-align:center;white-space:nowrap}
  .branco{display:inline-block;min-width:150px;height:15px;border-bottom:1px solid #1e293b;vertical-align:bottom}
  .branco.larga{min-width:300px}
  ol.clausulas{padding-left:20px}
  ol.clausulas li{margin-bottom:4px;text-align:justify}
  .fraco{color:#64748b}
  .assinaturas{display:grid;grid-template-columns:1fr 1fr;gap:34px;margin-top:26px}
  .assinaturas .ass{border-top:1px solid #1e293b;padding-top:4px;font-size:11.5px;text-align:center}
  .local-data{margin-top:14px;font-size:12px}
  .rodape{margin-top:10px;font-size:10.5px;color:#64748b;text-align:center}
`;

/** O documento inteiro. `corpo` é o HTML da folha (já escapado por quem montou); o script imprime assim que a página termina de carregar. */
export function paginaDeImpressao(titulo: string, corpo: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>${esc(titulo)}</title><style>${CSS_DA_FOLHA}</style></head>`
    + `<body><div class="pagina">${corpo}</div><script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
}

export type JanelaDeImpressao = { escrever: (html: string) => void; fechar: () => void };

const ESPERA_HTML = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Preparando…</title></head>'
  + '<body style="font-family:Arial,sans-serif;padding:24px;color:#475569">Preparando o documento para imprimir…</body></html>';

/**
 * Abre a janela de impressão agora (dentro do clique) e devolve como escrever nela depois. Devolve null se o navegador barrou a janela:
 * quem chama avisa a pessoa de que a janela foi bloqueada (nunca "imprimiu" sem ter aberto).
 */
export function abrirJanelaDeImpressao(): JanelaDeImpressao | null {
  let w: Window | null = null;
  try { w = window.open('', '_blank'); } catch { w = null; }
  if (!w) return null;
  try { w.document.write(ESPERA_HTML); w.document.close(); } catch { /* a janela pode já ter sido fechada */ }
  return {
    escrever: (html: string) => { try { w!.document.open(); w!.document.write(html); w!.document.close(); } catch { /* janela fechada pela pessoa */ } },
    fechar: () => { try { w!.close(); } catch { /* idem */ } },
  };
}

export const MENSAGEM_JANELA_BLOQUEADA = 'Não foi possível abrir a janela de impressão: o navegador a bloqueou. Libere as janelas deste endereço e tente de novo.';
