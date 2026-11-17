// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// FormacoesExcluidas — a lista, só para leitura, das formações de preços excluídas com motivo (pedido do usuário em 17/11/2026).
// Só Admin e gerentes veem (o banco confere: a função `formacoes_excluidas` devolve vazio para os outros). Serve para conferir quem excluiu, quando e por quê;
// não há "restaurar" (não foi pedido): a linha continua guardada no banco, então um Admin pode pedir para desfazer pelo banco.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { Faixa, Botao } from './Interface';
import { lerFormacoesExcluidas } from './ExclusaoDeFormacao';

const quando = (iso: any) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export default function FormacoesExcluidas({ recarregar = 0 }: { recarregar?: number }) {
  const [estado, setEstado] = useState<{ lista: any[]; erro: string; carregando: boolean }>({ lista: [], erro: '', carregando: true });
  const ler = useCallback(async () => {
    setEstado(e => ({ ...e, carregando: true }));
    const r = await lerFormacoesExcluidas();
    setEstado({ lista: r.lista, erro: r.erro || '', carregando: false });
  }, []);
  useEffect(() => { ler(); }, [ler, recarregar]);

  return (
    <div className="acn-quadro acn-fp-excluidas" data-teste="formacoes-excluidas">
      <div className="acn-quadro-titulo">Formações excluídas ({estado.lista.length})</div>
      <div className="acn-ajuda">Só para consulta. A formação excluída não aparece em nenhuma tela; aqui fica quem excluiu, quando e o motivo.</div>
      {estado.erro && <Faixa tom="erro" acao={<Botao pequeno onClick={ler}>Tentar de novo</Botao>}>Não foi possível ler as formações excluídas ({estado.erro}). Isso não quer dizer que não haja nenhuma.</Faixa>}
      {estado.carregando && <div className="acn-ajuda">Carregando...</div>}
      {!estado.carregando && !estado.erro && estado.lista.length === 0 && <div className="acn-ajuda" data-teste="nenhuma-excluida">Nenhuma formação foi excluída até agora.</div>}
      {estado.lista.length > 0 && (
        <table className="acn-tabela acn-densa">
          <thead><tr><th>Formação</th><th>Versão</th><th>Excluída por</th><th>Em</th><th>Motivo</th><th>Saiu junto</th></tr></thead>
          <tbody>
            {estado.lista.map((f: any) => {
              const d = f.excluida_desligado || {};
              const extras = [...(d.desligados || []), ...(d.avisos || [])];
              return (
                <tr key={f.id}>
                  <td><strong className="acn-forte">{f.nome || 'Formação sem nome'}</strong>{f.numero_cotacao ? <div className="acn-ajuda">{f.numero_cotacao} · criada por {f.criado_por || '—'}</div> : null}</td>
                  <td className="acn-num">v{f.versao || 1}{f.excluida_escopo === 'formacao' ? <div className="acn-ajuda">formação inteira</div> : <div className="acn-ajuda">só esta versão</div>}</td>
                  <td>{f.excluida_por || '—'}</td>
                  <td className="acn-num">{quando(f.excluida_em)}</td>
                  <td>{f.excluida_motivo || '—'}</td>
                  <td>{extras.length ? extras.map((x: string, i: number) => <div key={i} className="acn-ajuda">{x}</div>) : <span className="acn-fraco">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
