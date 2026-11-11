// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// OPs excluídas — o quadro da aba "OPs em aberto" do CRM e a janela de leitura (pedido do usuário em 11/11/2026)
//
// A OP excluída não aparece em nenhuma outra tela; aqui ela continua à vista, marcada em vermelho, para quem precisa ver o que foi excluído, por quem e por quê.
// A janela é só de leitura de propósito: a OP excluída está escondida do resto do sistema, então não há o que editar nem liberar. Os dados vêm da própria linha
// (a função do banco devolve a OP inteira) e o histórico é lido pelo id da OP, que não é escondido.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { mdiDeleteOutline, mdiEyeOutline, mdiChevronDown, mdiChevronUp } from '@mdi/js';
import Icone from './Icone';
import { supabase } from './supabaseClient';
import { Botao, Faixa, Selo } from './Interface';

const quando = (v: any) => { try { return v ? new Date(v).toLocaleString('pt-BR') : '—'; } catch { return '—'; } };
const dia = (v: any) => (v ? new Date(String(v).slice(0, 10) + 'T12:00').toLocaleDateString('pt-BR') : '—');
const txt = (v: any) => (v == null || String(v).trim() === '' ? '—' : String(v));

function Linha({ rotulo, children }: { rotulo: string; children: any }) {
  return <div className="acn-ajuda"><strong>{rotulo}:</strong> {children}</div>;
}

export function OpExcluidaModal({ op, onClose }: { op: any; onClose: () => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [erroLogs, setErroLogs] = useState('');
  useEffect(() => {
    let vivo = true;
    supabase.from('logs_movimentacao_opl').select('data_hora,setor,evento,usuario_nome,status_anterior,status_novo')
      .eq('opl_id', op.id).order('data_hora', { ascending: false }).limit(100)
      .then(({ data, error }) => { if (!vivo) return; setErroLogs(error ? error.message : ''); if (!error) setLogs(data || []); });
    return () => { vivo = false; };
  }, [op?.id]);
  const itens = Array.isArray(op.itens_vendidos) ? op.itens_vendidos : [];
  const desl = op.excluida_desligado?.desligados || [];
  const avisos = op.excluida_desligado?.avisos || [];
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro" role="dialog" aria-label={`OP ${op.opl} excluída`}>
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiDeleteOutline} size={16} /> OP {op.opl} <Selo familia="erro" ponto={false}>EXCLUÍDA</Selo></span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <Faixa tom="erro">
            <b>Excluída por {txt(op.excluida_por)} em {quando(op.excluida_em)}.</b> Motivo: {txt(op.excluida_motivo)}
            <div>Estava em: {txt(op.excluida_status_anterior)}. Esta OP não aparece em nenhuma outra tela e o número dela não pode ser usado de novo.</div>
          </Faixa>
          {(desl.length > 0 || avisos.length > 0) && (
            <div className="acn-quadro">
              {desl.length > 0 && <><div className="acn-quadro-titulo">Foi desligado na exclusão</div>{desl.map((t: string, i: number) => <div key={i} className="acn-ajuda">• {t}</div>)}</>}
              {avisos.length > 0 && <><div className="acn-quadro-titulo">Ficou como estava (conferir)</div>{avisos.map((t: string, i: number) => <div key={i} className="acn-ajuda">• {t}</div>)}</>}
            </div>
          )}
          <div className="acn-quadro">
            <div className="acn-quadro-titulo">Dados da OP</div>
            <Linha rotulo="Cliente">{txt(op.cliente_nome)}</Linha>
            <Linha rotulo="Tipo">{txt(op.tipo_projeto)} · {txt(op.faturamento_empresa || 'ACN')}</Linha>
            <Linha rotulo="Veículo">{txt(op.veiculo || op.modelo)} · chassi {txt(op.chassi)} · placa {txt(op.placa)}</Linha>
            <Linha rotulo="Entrada">{dia(op.data_entrada)} · prazo {dia(op.data_prevista_entrega)}</Linha>
            <Linha rotulo="Responsável comercial">{txt(op.responsavel_comercial)}</Linha>
            {itens.length > 0 && (
              <div className="acn-ajuda"><strong>Itens vendidos:</strong>
                {itens.map((v: any, i: number) => <div key={i}>• {v.quantidade}× {v.nome}</div>)}
              </div>
            )}
          </div>
          <div className="acn-quadro">
            <div className="acn-quadro-titulo">Histórico</div>
            {erroLogs && <Faixa tom="erro">Não foi possível ler o histórico ({erroLogs}).</Faixa>}
            {!erroLogs && logs.length === 0 && <div className="acn-ajuda">Sem registros.</div>}
            {logs.map((l, i) => (
              <div key={i} className="acn-ajuda">{quando(l.data_hora)} · {txt(l.usuario_nome)}{l.setor ? ` (${l.setor})` : ''} — {txt(l.evento)}</div>
            ))}
          </div>
        </div>
        <div className="acn-modal-rodape"><Botao onClick={onClose}>Fechar</Botao></div>
      </div>
    </div>
  );
}

/** O quadro das excluídas, logo abaixo da lista de OPs em aberto. Recebe a lista já filtrada pelos filtros da tela. */
export function QuadroOpsExcluidas({ lista, erro, onTentarDeNovo }: { lista: any[]; erro?: string; onTentarDeNovo?: () => void }) {
  const [aberta, setAberta] = useState(true);
  const [ver, setVer] = useState<any>(null);
  if (!erro && lista.length === 0) return null;
  return (
    <div className="acn-crm-excluidas" data-teste="ops-excluidas">
      {erro && <Faixa tom="erro" acao={onTentarDeNovo ? <Botao pequeno onClick={onTentarDeNovo}>Tentar de novo</Botao> : null}>Não foi possível ler as OPs excluídas ({erro}).</Faixa>}
      {lista.length > 0 && (
        <>
          <Botao variante="discreto" icone={aberta ? mdiChevronUp : mdiChevronDown} onClick={() => setAberta(a => !a)}>
            {aberta ? 'Esconder' : 'Mostrar'} OPs excluídas ({lista.length})
          </Botao>
          {aberta && (
            <div className="acn-crm-rolax">
              <table className="acn-tabela acn-densa">
                <thead><tr>{['OP', 'Cliente', 'Tipo', 'Estava em', 'Excluída por', 'Em', 'Motivo', ''].map(h => <th key={h} className="esq">{h}</th>)}</tr></thead>
                <tbody>
                  {lista.map(o => (
                    <tr key={o.id} className="acn-crm-opl-linha acn-crm-opl-excluida">
                      <td className="acn-forte acn-lic-nowrap">{o.opl} <Selo familia="erro" ponto={false}>EXCLUÍDA</Selo></td>
                      <td>{txt(o.cliente_nome)}</td>
                      <td>{txt(o.tipo_projeto)}</td>
                      <td className="acn-lic-nowrap">{txt(o.excluida_status_anterior)}</td>
                      <td className="acn-lic-nowrap">{txt(o.excluida_por)}</td>
                      <td className="acn-lic-nowrap acn-fraco">{quando(o.excluida_em)}</td>
                      <td>{txt(o.excluida_motivo)}</td>
                      <td><Botao pequeno icone={mdiEyeOutline} onClick={() => setVer(o)}>Ver</Botao></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {ver && <OpExcluidaModal op={ver} onClose={() => setVer(null)} />}
    </div>
  );
}
