// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { confirmar } from './Feedback';
import { logChange } from './AuditSystem';
import { Botao, Selo, Faixa } from './Interface';
import { LinkOpl } from './AcnTabShared';
import { STATUS_AGUARDANDO_LIBERACAO_COMERCIAL } from './FluxoEntrega';

// ─────────────────────────────────────────────────────────────────────────────
// FATURAMENTO ANTECIPADO — faturar sem terminar a adaptação (08/10/2026)
// Pedido do usuário; desenho aprovado por ele no mesmo dia. A OP tem uma única etapa (status_geral) e as filas da Produção e do Almoxarifado dependem dela, então
// a liberação antecipada NÃO mexe no status: é uma marca à parte (oples.fat_antecipado_*).
//   1) o Comercial libera ao Fiscal com JUSTIFICATIVA (liberarFaturamentoAntecipado), em qualquer etapa antes da liberação comercial;
//   2) o Fiscal vê a OP no quadro daqui (FiscalAntecipadas) e registra a(s) nota(s) sem mudar o status — a OP segue na adaptação;
//   3) ao aprovar o CQ, a OP pula a espera de liberação comercial (statusDeLiberacaoComercial em FluxoEntrega.ts): com nota já emitida vai direto para
//      "Faturado e Disponivel para Entrega"; sem nota, para "Aguarda Emissao NF".
// ─────────────────────────────────────────────────────────────────────────────

// Etapas em que a OP já passou do ponto de liberar (ou saiu do fluxo): não faz sentido "antecipar"
const JA_NO_COMERCIAL_OU_DEPOIS = [STATUS_AGUARDANDO_LIBERACAO_COMERCIAL, 'Aguarda Emissao NF', 'Faturado e Disponivel para Entrega', 'Faturado', 'Cancelado', 'Cancelada', 'Devolvida Comercial'];

/** Pode o Comercial liberar o faturamento antes de terminar a adaptação desta OP? */
export const podeFaturarAntes = (o: any): boolean =>
  !!o && !o.fat_antecipado_em && !JA_NO_COMERCIAL_OU_DEPOIS.includes(o.status_geral);

/** Grava a liberação antecipada (com a justificativa) em cada OP e registra no histórico. Devolve { ok: [...opl], falhas: [...texto] }. */
export async function liberarFaturamentoAntecipado(ops: any[], motivo: string, usuario: any) {
  const agora = new Date().toISOString();
  const nome = usuario?.nome || usuario?.email || 'Sistema';
  const ok: string[] = []; const falhas: string[] = [];
  for (const o of ops.filter(podeFaturarAntes)) {
    const novoRow = { fat_antecipado_em: agora, fat_antecipado_por: nome, fat_antecipado_motivo: motivo };
    // .is('fat_antecipado_em', null): se outra pessoa liberou nesse meio-tempo, não sobrescreve a justificativa dela
    const { data, error } = await supabase.from('oples').update(novoRow).eq('id', o.id).is('fat_antecipado_em', null).select('id');
    if (error) { falhas.push(`${o.opl}: ${error.message}`); continue; }
    if (!data?.length) { falhas.push(`${o.opl}: já tinha sido liberada por outra pessoa`); continue; }
    ok.push(o.opl);
    logChange({ module: 'comercial', entityType: 'oples', entityId: o.id, changeType: 'UPDATE', oldRow: o, newRow: { ...o, ...novoRow }, user: usuario });
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: o.id, numero_opl: o.opl, setor: 'Comercial',
      evento: `Faturamento ANTECIPADO liberado ao Fiscal antes de terminar a adaptação (etapa atual: ${o.status_geral}). Justificativa: ${motivo}`,
      status_anterior: o.status_geral, status_novo: o.status_geral, usuario_nome: nome, data_hora: agora,
    }]);
  }
  return { ok, falhas };
}

const dia = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

/** Quadro do Fiscal: OPs com faturamento antecipado liberado e a adaptação ainda em andamento. */
export function FiscalAntecipadas({ currentUser }: any) {
  const [lista, setLista] = useState<any[]>([]);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [nf, setNf] = useState('');
  const [nfServ, setNfServ] = useState('');
  const [gravando, setGravando] = useState(false);

  const carregar = async () => {
    const { data } = await supabase.from('oples').select('*')
      .not('fat_antecipado_em', 'is', null)
      .not('status_geral', 'in', '("Aguarda Emissao NF","Faturado e Disponivel para Entrega","Faturado","Cancelado")')
      .order('fat_antecipado_em', { ascending: true });
    setLista(data || []);
  };
  useEffect(() => { carregar(); const t = setInterval(carregar, 30000); return () => clearInterval(t); }, []);

  const semNota = lista.filter(o => !o.data_emissao_nf);
  const alternar = (id: string) => setMarcadas(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const registrar = async () => {
    const alvos = semNota.filter(o => marcadas.has(o.id));
    const nfe = nf.trim(), nfs = nfServ.trim();
    if (!nfe && !nfs) { alert('Informe o número da NF-e (material) e/ou da NFS-e (serviço).'); return; }
    if (!alvos.length) { alert('Marque as OPs que saem nesta nota.'); return; }
    const notas = [nfe && `NF-e ${nfe}`, nfs && `NFS-e ${nfs}`].filter(Boolean).join(' · ');
    if (!await confirmar(`Registrar ${notas} em ${alvos.length} OP(s) com a adaptação ainda em andamento?\n\nA OP continua na adaptação; só a nota fica registrada.`)) return;
    setGravando(true);
    const agora = new Date().toISOString(); const falhas: string[] = [];
    for (const o of alvos) {
      const novoRow = { numero_nf: nfe || null, numero_nf_servico: nfs || null, data_emissao_nf: agora, responsavel_fiscal: currentUser?.nome };
      // sem mudar o status; só vale se a nota ainda não foi registrada por outra sessão
      const { data, error } = await supabase.from('oples').update(novoRow).eq('id', o.id).is('data_emissao_nf', null).not('fat_antecipado_em', 'is', null).select('id');
      if (error || !data?.length) { falhas.push(`${o.opl}${error ? ': ' + error.message : ': a nota já tinha sido registrada'}`); continue; }
      logChange({ module: 'fiscal', entityType: 'oples', entityId: o.id, changeType: 'UPDATE', oldRow: o, newRow: { ...o, ...novoRow }, user: currentUser });
      await supabase.from('logs_movimentacao_opl').insert([{
        opl_id: o.id, numero_opl: o.opl, setor: 'Fiscal',
        evento: `Faturamento antecipado: ${notas} registrada(s) com a adaptação em andamento (etapa: ${o.status_geral}). A OP segue na produção; ao aprovar o CQ vai direto para entrega.`,
        status_anterior: o.status_geral, status_novo: o.status_geral, usuario_nome: currentUser?.nome, data_hora: agora,
      }]);
    }
    setGravando(false); setMarcadas(new Set()); setNf(''); setNfServ('');
    if (falhas.length) alert('Algumas OPs não foram registradas:\n' + falhas.join('\n'));
    carregar();
  };

  if (lista.length === 0) return null;
  return (
    <div className="sec-card" style={{ marginBottom: 12 }}>
      <div className="sec-hdr no-collapse">
        <span className="acn-cab-titulo">Faturamento antecipado — adaptação em andamento <Selo familia="atencao" ponto={false}>{lista.length}</Selo></span>
      </div>
      <div className="sec-body">
        <Faixa tom="info">
          O Comercial liberou estas OPs para faturar <strong>antes de terminar a adaptação</strong>. Registre a nota aqui: a OP continua na produção e, ao aprovar o CQ, segue direto para a entrega.
        </Faixa>
        <div className="acn-rolagem">
          <table className="acn-tabela acn-compacta">
            <thead><tr><th /><th>OP</th><th>Cliente</th><th>Etapa atual</th><th>Liberada por</th><th>Justificativa</th><th>Nota</th></tr></thead>
            <tbody>
              {lista.map(o => (
                <tr key={o.id}>
                  <td>{!o.data_emissao_nf && <input type="checkbox" checked={marcadas.has(o.id)} onChange={() => alternar(o.id)} aria-label={'Marcar ' + o.opl} />}</td>
                  <td><LinkOpl opl={o} currentUser={currentUser} /></td>
                  <td>{o.cliente_nome || '—'}</td>
                  <td>{o.status_geral}</td>
                  <td>{o.fat_antecipado_por || '—'}<div className="acn-fraco">{dia(o.fat_antecipado_em)}</div></td>
                  <td className="acn-texto-longo">{o.fat_antecipado_motivo || '—'}</td>
                  <td>{o.data_emissao_nf
                    ? <Selo familia="ok" ponto={false} title={'Emitida em ' + dia(o.data_emissao_nf)}>{[o.numero_nf && 'NF ' + o.numero_nf, o.numero_nf_servico && 'NFS-e ' + o.numero_nf_servico].filter(Boolean).join(' · ') || 'registrada'}</Selo>
                    : <Selo familia="atencao" ponto={false}>aguardando nota</Selo>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {semNota.length > 0 && (
          <div className="acn-com-barra" style={{ marginTop: 8 }}>
            <input className="acn-input" style={{ width: 150 }} placeholder="NF-e (material)" value={nf} onChange={e => setNf(e.target.value)} />
            <input className="acn-input" style={{ width: 150 }} placeholder="NFS-e (serviço)" value={nfServ} onChange={e => setNfServ(e.target.value)} />
            <Botao variante="primario" disabled={gravando || marcadas.size === 0} onClick={registrar}>
              {gravando ? '...' : `Registrar nota em ${marcadas.size} OP(s)`}
            </Botao>
            <Botao pequeno variante="discreto" onClick={() => setMarcadas(new Set(semNota.map(o => o.id)))}>Marcar todas sem nota</Botao>
          </div>
        )}
      </div>
    </div>
  );
}
