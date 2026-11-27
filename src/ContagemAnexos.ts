// ─────────────────────────────────────────────────────────────────────────────
// CONTAGEM DE ANEXOS DA OP, EM LOTE (lentidão de 26/11/2026)
//
// Cada cartão de OP (Produção, CRM, Engenharia) mostra "N arquivos" e antes fazia UMA consulta ao banco só para contar: numa tela com 100 OPs eram 100 pedidos
// no mesmo instante. Nos registros do banco de 26/11/2026 foi o caminho mais chamado (2.990 pedidos em uma manhã, 4,4 s de média: a fila de conexões da
// instância pequena segurava todos). Aqui os pedidos que chegam juntos (janela de 40 ms) viram UMA consulta por bloco de 60 OPs, e quem pediu a mesma OP duas
// vezes (a Engenharia tem dois botões por OP) recebe a mesma resposta. Nada é guardado entre uma pergunta e outra: quem chama de novo (depois de anexar um
// arquivo) recebe a contagem de agora, nunca uma antiga.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { lerPaginado } from './LerPaginado';

const JANELA_MS = 40;
const OPS_POR_CONSULTA = 60;

type Espera = { ok: (n: number) => void; falha: (e: any) => void };
let fila = new Map<string, Espera[]>();
let agendado: any = null;

async function esvaziarFila() {
  const lote = fila;
  fila = new Map();
  agendado = null;
  const ids = [...lote.keys()];
  for (let i = 0; i < ids.length; i += OPS_POR_CONSULTA) {
    const bloco = ids.slice(i, i + OPS_POR_CONSULTA);
    try {
      const linhas = await lerPaginado(() => supabase.from('opl_anexos').select('id,opl_id').in('opl_id', bloco).order('id'));
      const contagem = new Map<string, number>();
      for (const l of linhas) contagem.set(String(l.opl_id), (contagem.get(String(l.opl_id)) || 0) + 1);
      for (const id of bloco) for (const e of lote.get(id) || []) e.ok(contagem.get(id) || 0);
    } catch (erro) {
      // leitura recusada não vira "0 arquivos": quem pediu fica sem número e a tela mostra "…"
      for (const id of bloco) for (const e of lote.get(id) || []) e.falha(erro);
    }
  }
}

/** Quantos arquivos a OP tem (qualquer tipo). Pedidos feitos no mesmo instante saem numa consulta só. Rejeita se o banco recusar a leitura. */
export function contarAnexosDaOp(oplId: any): Promise<number> {
  const id = String(oplId);
  return new Promise<number>((ok, falha) => {
    const esperas = fila.get(id) || [];
    esperas.push({ ok, falha });
    fila.set(id, esperas);
    if (!agendado) agendado = setTimeout(esvaziarFila, JANELA_MS);
  });
}
