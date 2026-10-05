// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// EXPORTAR PARA EXCEL (Etapa 15e do ux-fluxo, 05/10/2026)
//
// Uma peça só para as telas de centro de custo: recebe as "folhas" (colunas + linhas) e baixa um .xlsx.
// Valor em dinheiro, quantidade e percentual saem como NÚMERO com formato (dá para somar e filtrar no Excel);
// texto e datas saem como aparecem na tela ("dd/mm/aaaa"), para a planilha ser a mesma tabela que a pessoa vê.
// ─────────────────────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx';

export type ColunaPlanilha = { rotulo: string; formato?: 'texto' | 'moeda' | 'inteiro' | 'percentual'; largura?: number };
export type FolhaPlanilha = { nome: string; colunas: ColunaPlanilha[]; linhas: any[][] };

// percentual: a célula guarda a fração (0,455) e o Excel mostra 45,5%
const FORMATO: Record<string, string> = { moeda: '"R$" #,##0.00', inteiro: '0', percentual: '0.0%' };

/** O Excel recusa nome de aba com [ ] : * ? / \ e com mais de 31 letras; duas abas não podem ter o mesmo nome. */
export function nomeDeAba(nome: string, usados: Set<string>): string {
  const base = (String(nome || 'Planilha').replace(/[\[\]:*?\/\\]/g, '-').trim() || 'Planilha').slice(0, 31);
  let n = base, i = 2;
  while (usados.has(n.toLowerCase())) { const sufixo = ` (${i++})`; n = base.slice(0, 31 - sufixo.length) + sufixo; }
  usados.add(n.toLowerCase());
  return n;
}

export function montarPlanilha(folhas: FolhaPlanilha[]) {
  const wb = XLSX.utils.book_new();
  const usados = new Set<string>();
  for (const f of folhas) {
    const ws = XLSX.utils.aoa_to_sheet([f.colunas.map(c => c.rotulo), ...f.linhas]);
    f.colunas.forEach((c, ci) => {
      const z = c.formato ? FORMATO[c.formato] : '';
      if (!z) return;
      for (let r = 1; r <= f.linhas.length; r++) {
        const cel = ws[XLSX.utils.encode_cell({ r, c: ci })];
        if (cel && cel.t === 'n') cel.z = z;
      }
    });
    ws['!cols'] = f.colunas.map(c => ({ wch: c.largura || Math.max(12, Math.min(48, String(c.rotulo).length + 4)) }));
    XLSX.utils.book_append_sheet(wb, ws, nomeDeAba(f.nome, usados));
  }
  return wb;
}

/** Baixa o arquivo. O nome ganha .xlsx se faltar; caracteres que o Windows não aceita saem do nome. */
export function baixarPlanilha(nomeArquivo: string, folhas: FolhaPlanilha[]) {
  const wb = montarPlanilha(folhas);
  const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const nome = String(nomeArquivo || 'planilha').replace(/[<>:"\/\\|?*]/g, '-').replace(/\.xlsx$/i, '') + '.xlsx';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return nome;
}
