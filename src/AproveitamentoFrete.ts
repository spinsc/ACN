// ─────────────────────────────────────────────────────────────────────────────
// APROVEITAMENTO DE FRETE
// Acha envios que dá pra mandar juntos: mesma região, entrega no mesmo período.
// Exemplo real do negócio: várias carretinhas da serralheria indo pra mesma
// região na mesma semana cabem no mesmo caminhão.
//
// Só sugere — quem decide juntar é o usuário. E só olha frete ainda em
// "Cotação": depois de fechado com a transportadora não adianta mais agrupar.
// ─────────────────────────────────────────────────────────────────────────────

/** Região de comparação. Preferimos os 3 primeiros dígitos do CEP (mesorregião
 *  dos Correios) porque é bem mais preciso que o nome da cidade digitado à mão;
 *  sem CEP, cai pra cidade+UF normalizados. */
export function regiaoDe(frete: any): string | null {
  const cep = (frete?.cep_destino || '').replace(/\D/g, '');
  if (cep.length >= 3) return 'cep:' + cep.slice(0, 3);
  const destino = (frete?.destino || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return destino ? 'destino:' + destino : null;
}

export function rotuloRegiao(frete: any): string {
  const cep = (frete?.cep_destino || '').replace(/\D/g, '');
  if (cep.length >= 3 && frete?.destino) return `${frete.destino} (CEP ${cep.slice(0,3)}xx)`;
  if (cep.length >= 3) return `CEP ${cep.slice(0,3)}xx`;
  return frete?.destino || 'Destino não informado';
}

/** Distância em dias entre duas datas 'YYYY-MM-DD'. */
function diasEntre(a: string, b: string): number {
  const d1 = new Date(a + 'T12:00'), d2 = new Date(b + 'T12:00');
  return Math.abs(Math.round((d1.getTime() - d2.getTime()) / 86400000));
}

export type GrupoAproveitamento = {
  chave: string;
  regiao: string;
  fretes: any[];
  dataMin: string;
  dataMax: string;
  pesoTotal: number;
  volumesTotal: number;
};

/**
 * Agrupa fretes candidatos a irem juntos.
 * @param janelaDias tolerância entre as datas previstas (7 = mesma semana).
 * Fretes sem data prevista ficam de fora: sem data não dá pra afirmar que é o
 * mesmo período, e sugerir junção errada custa mais caro que não sugerir.
 */
export function acharAproveitamentos(fretes: any[], janelaDias = 7): GrupoAproveitamento[] {
  const candidatos = (fretes || []).filter(f =>
    f && f.status === 'Cotação' && f.data_prevista && regiaoDe(f) && !f.grupo_envio_id);

  const porRegiao = new Map<string, any[]>();
  for (const f of candidatos) {
    const r = regiaoDe(f)!;
    if (!porRegiao.has(r)) porRegiao.set(r, []);
    porRegiao.get(r)!.push(f);
  }

  const grupos: GrupoAproveitamento[] = [];
  for (const [regiao, lista] of porRegiao) {
    if (lista.length < 2) continue;
    // ordena por data e vai formando blocos enquanto couberem na janela
    const ord = [...lista].sort((a, b) => a.data_prevista.localeCompare(b.data_prevista));
    let bloco: any[] = [ord[0]];
    const fecharBloco = () => {
      if (bloco.length < 2) return;
      const datas = bloco.map(f => f.data_prevista).sort();
      grupos.push({
        chave: `${regiao}|${datas[0]}`,
        regiao: rotuloRegiao(bloco[0]),
        fretes: [...bloco],
        dataMin: datas[0],
        dataMax: datas[datas.length - 1],
        pesoTotal:    bloco.reduce((s, f) => s + (Number(f.peso_total) || 0), 0),
        volumesTotal: bloco.reduce((s, f) => s + (Number(f.quantidade_volumes) || 0), 0),
      });
    };
    for (let i = 1; i < ord.length; i++) {
      if (diasEntre(ord[i].data_prevista, bloco[0].data_prevista) <= janelaDias) bloco.push(ord[i]);
      else { fecharBloco(); bloco = [ord[i]]; }
    }
    fecharBloco();
  }
  return grupos.sort((a, b) => b.fretes.length - a.fretes.length);
}
