// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// RESPOSTAS SOBRE O CARRO, NA OP ABERTA (etapa 4, 15/10/2026)
//
// Pedido do usuário: a resposta tem de poder ser ajustada durante o processo, não só na abertura da OP. Aqui a OP mostra o que foi respondido e, enquanto
// ela ainda não saiu do PCP, deixa trocar — usando a mesma tela das OPs antigas (RespostasEmLote) com o ajuste da BOM ligado: a troca mostra "sai este
// chicote, entra aquele" e só mexe na BOM com a confirmação.
//
// Depois que a OP saiu do PCP, ou com material reservado, não troca por aqui: o Almoxarifado já trabalha com a lista dela. O caminho é devolver a OP ao PCP
// ("PCP — rever a BOM"), que volta sem BOM e solta a reserva.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { lerBaseDaEstrutura, calcularDaEstrutura, respostasSalvasDaOp, situacaoParaTrocarResposta } from './CalculoDaEstrutura';
import { valorDeQuantidade, donaDaPergunta, perguntasPendentes } from './ConfigEstrutura';
import { RespostasEmLote } from './RespostasEmLote';
import { Botao } from './Interface';
import { ehAdminOuGerente } from './utils/permissoes';

const usuarioAtual = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };

export function RespostasDaOp({ op }) {
  const [estado, setEstado] = useState(null);   // { aplicavel, perguntas, respostas, pendentes, sit }
  const [falha, setFalha] = useState('');
  const [editando, setEditando] = useState(false);
  const [tick, setTick] = useState(0);
  const usuario = usuarioAtual();
  const podeMexer = ehAdminOuGerente(usuario) || ['PCP', 'Engenharia'].includes(String(usuario?.perfil || '').trim());

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const base = await lerBaseDaEstrutura(op);
        if (!base.aplicavel) { if (vivo) setEstado({ aplicavel: false }); return; }
        const [salvas, situacao] = await Promise.all([respostasSalvasDaOp(op.id), situacaoParaTrocarResposta([op])]);
        const { respostas } = calcularDaEstrutura(base, salvas);
        if (vivo) { setEstado({ aplicavel: true, perguntas: base.perguntas, respostas, pendentes: perguntasPendentes(base.perguntas, respostas), sit: situacao.get(String(op.id)) }); setFalha(''); }
      } catch (e) { if (vivo) setFalha(e?.message || 'falha ao ler as respostas'); }
    })();
    return () => { vivo = false; };
  }, [op?.id, tick]);

  if (falha) return <div style={{ fontSize: 11, color: '#b45309', marginTop: 8 }}>Não foi possível ler as respostas sobre o carro ({falha}).</div>;
  if (!estado?.aplicavel || !estado.perguntas.length) return null;

  const { perguntas, respostas, pendentes, sit } = estado;
  const rotulo = (p) => {
    const v = respostas[p.id];
    if (!v) return null;
    const n = valorDeQuantidade(v);
    return n !== null ? String(n) : ((p.opcoes || []).find(o => o.id === v)?.rotulo || '—');
  };
  const visiveis = perguntas.filter(p => respostas[p.id] || pendentes.includes(p));

  return (
    <div style={{ marginTop: 10, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 4 }}>
        Respostas sobre o carro
      </div>
      {visiveis.map(p => (
        <div key={p.id} style={{ fontSize: 11.5, padding: '1px 0' }}>
          {p.texto} <span style={{ color: '#94a3b8' }}>({donaDaPergunta(p)})</span>{' '}
          {rotulo(p) !== null ? <b>{rotulo(p)}</b> : <span style={{ color: '#b45309' }}>sem resposta</span>}
        </div>
      ))}
      {podeMexer && (
        sit?.pode ? (
          <div style={{ marginTop: 6 }}>
            <Botao pequeno variante="secundario" onClick={() => setEditando(true)}>Trocar respostas</Botao>
          </div>
        ) : (
          <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
            Não dá para trocar as respostas: a OP {sit?.motivo || 'já saiu do PCP'}. Para trocar, devolva a OP ao PCP ("PCP — rever a BOM"): ela volta sem BOM e solta a reserva.
          </div>
        )
      )}
      {editando && (
        <RespostasEmLote ops={[op]} currentUser={usuario} aplicarNaBom
          onClose={() => setEditando(false)} onSalvo={() => setTick(t => t + 1)} />
      )}
    </div>
  );
}
