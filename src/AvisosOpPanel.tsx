// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// Avisos — painel próprio (botão "Avisos" no topo): "Datas para cuidar" (avisos de data do calendário, 17/11/2026) e o andamento das OPs.
//
// As atualizações automáticas de uma OP (iniciar, concluir, retrabalho,
// acompanhamento da adaptação, embalagem/frete — ver NotificarEnvolvidos.ts)
// iam para Menções e se misturavam com as menções de verdade. Agora ficam aqui:
// uma lista simples, sem "resolver" nem histórico — "Limpar" apaga o aviso.
// Continuam gravados em `mencoes` com contexto 'op_adaptacao' (Menções os ignora).
// Menção feita com @ no texto do acompanhamento continua indo para Menções.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { OplDetalheModal } from './AcnTabShared';
import { confirmar, mostrarAviso } from './Feedback';
import { Botao, Selo, Faixa, hojeISO } from './Interface';
import Icone from './Icone';
import { abrirRegistroDoAviso, diaDoAvisoDoCalendario, rotuloDoAvisoDoCalendario } from './CalendarioAviso';
import { mdiBullhornOutline, mdiTrashCanOutline, mdiClose, mdiWrenchOutline, mdiOpenInNew, mdiCheck } from '@mdi/js';

export const CONTEXTO_AVISO_OP = 'op_adaptacao';
// 17/11/2026 (pedido do usuário, bug da Renata): os avisos de data do calendário (rotina `calendario_avisar`) não são menções; ficam aqui, em "Datas para cuidar".
// Continuam na tabela `mencoes`, com contexto 'calendario'. "Já cuidei" marca o aviso como resolvido pela pessoa e a rotina não o recria mais (só se a data do item mudar).
export const CONTEXTO_AVISO_CALENDARIO = 'calendario';

function filtroDoUsuario(currentUser: any) {
  const uid = String(currentUser?.id || '');
  const nome = String(currentUser?.nome || '');
  // mesmo critério de Menções: por id e, de reserva, por nome
  return nome ? `mencionado_id.eq.${uid},mencionado_nome.ilike.%${nome}%` : `mencionado_id.eq.${uid}`;
}

export async function contarAvisosOp(currentUser: any): Promise<number> {
  if (!currentUser?.id) return 0;
  const { count } = await supabase.from('mencoes')
    .select('id', { count: 'exact', head: true })
    .or(filtroDoUsuario(currentUser))
    .eq('contexto', CONTEXTO_AVISO_OP);
  return count || 0;
}

export async function contarAvisosCalendario(currentUser: any): Promise<number> {
  if (!currentUser?.id) return 0;
  const { count } = await supabase.from('mencoes')
    .select('id', { count: 'exact', head: true })
    .or(filtroDoUsuario(currentUser))
    .eq('contexto', CONTEXTO_AVISO_CALENDARIO)
    .eq('resolvida', false);
  return count || 0;
}

const fmtDT = (v: string) => {
  if (!v) return '';
  try { return new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return v; }
};

export default function AvisosOpPanel({ currentUser, onClose, onCountChange, onCountChangeCalendario, onNavigate }: any) {
  const [avisos, setAvisos] = useState<any[]>([]);
  const [datas, setDatas] = useState<any[]>([]);          // avisos de data do calendário ainda não dispensados
  const [erroDatas, setErroDatas] = useState('');         // leitura recusada nunca pode parecer "nenhuma data para cuidar"
  const [loading, setLoading] = useState(true);
  const [limpando, setLimpando] = useState(false);
  const [dispensando, setDispensando] = useState(false);
  const [opAberta, setOpAberta] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [ops, cal] = await Promise.all([
      supabase.from('mencoes').select('*')
        .or(filtroDoUsuario(currentUser))
        .eq('contexto', CONTEXTO_AVISO_OP)
        .order('criado_em', { ascending: false })
        .limit(300),
      supabase.from('mencoes').select('*')
        .or(filtroDoUsuario(currentUser))
        .eq('contexto', CONTEXTO_AVISO_CALENDARIO)
        .eq('resolvida', false)
        .order('criado_em', { ascending: false })
        .limit(300),
    ]);
    setAvisos(ops.data || []);
    onCountChange?.((ops.data || []).length);
    if (cal.error) { setErroDatas(cal.error.message || 'falha ao ler'); }
    else { setErroDatas(''); setDatas(cal.data || []); onCountChangeCalendario?.((cal.data || []).length); }
    setLoading(false);
  }, [currentUser?.id, currentUser?.nome, onCountChange, onCountChangeCalendario]);

  useEffect(() => { load(); }, [load]);

  // "Já cuidei": o aviso fica resolvido por esta pessoa e a rotina do banco não o recria (só se a data do item mudar). A gravação confere a linha devolvida:
  // o banco responde "ok, 0 linhas" a uma gravação negada.
  const gravarDispensa = async (ids: string[]) => {
    const { data, error } = await supabase.from('mencoes').update({
      resolvida: true, resolvida_em: new Date().toISOString(),
      resolvida_por: currentUser?.nome || currentUser?.email || null, lida: true,
    }).in('id', ids).eq('contexto', CONTEXTO_AVISO_CALENDARIO).select('id');
    if (error || (data || []).length !== ids.length) {
      mostrarAviso('Não foi possível dispensar o aviso. Tente de novo; se continuar, avise o suporte.', 'erro');
      return false;
    }
    return true;
  };

  const dispensarUm = async (a: any) => {
    setDatas(prev => prev.filter(x => x.id !== a.id));
    await gravarDispensa([a.id]);
    load();
  };

  const dispensarTodas = async () => {
    if (!datas.length) return;
    if (!await confirmar(`Já cuidou das ${datas.length} datas? Elas saem da lista e não voltam (só voltam se a data do item mudar).`)) return;
    setDispensando(true);
    await gravarDispensa(datas.map(d => d.id));
    setDispensando(false);
    load();
  };

  const abrirData = (a: any) => abrirRegistroDoAviso(a, onNavigate ? (aba: string) => onNavigate(aba) : undefined);

  const limparUm = async (a: any) => {
    setAvisos(prev => prev.filter(x => x.id !== a.id));
    await supabase.from('mencoes').delete().eq('id', a.id).eq('contexto', CONTEXTO_AVISO_OP);
    load();
  };

  const limparTodos = async () => {
    if (!avisos.length) return;
    if (!await confirmar(`Limpar os ${avisos.length} avisos de OP? Eles saem da lista e não ficam guardados.`)) return;
    setLimpando(true);
    await supabase.from('mencoes').delete()
      .or(filtroDoUsuario(currentUser))
      .eq('contexto', CONTEXTO_AVISO_OP);
    setLimpando(false);
    load();
  };

  const abrirOp = async (a: any) => {
    if (!a.contexto_id) return;
    const { data } = await supabase.from('oples').select('*').eq('id', a.contexto_id).maybeSingle();
    if (data) setOpAberta(data);
    else alert('Esta OP não foi encontrada (pode ter sido excluída).');
  };

  // 12e48 (09/10/2026): só a aparência — a gaveta usa as classes acn-gav-* (as mesmas das Análises e Menções, 12e47) e acn-avo-*
  return (
    <div className="acn-gav acn-gav-avisos"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="acn-gav-fundo" onClick={onClose} />

      <div className="acn-gav-painel" role="dialog" aria-label="Avisos">

        <div className="acn-gav-cab">
          <div className="acn-gav-cab-linha">
            <div>
              <div className="acn-gav-tit"><Icone path={mdiBullhornOutline} size={18} />Avisos</div>
              <div className="acn-gav-sub">
                {datas.length || avisos.length
                  ? [datas.length ? `${datas.length} data(s) para cuidar` : '', avisos.length ? `${avisos.length} aviso(s) de andamento das OPs` : ''].filter(Boolean).join(' · ')
                  : 'Nenhum aviso no momento'}
              </div>
            </div>
            <div className="acn-avo-botoes">
              {datas.length > 0 && (
                <Botao pequeno icone={mdiCheck} onClick={dispensarTodas} disabled={dispensando}>
                  {dispensando ? 'Gravando…' : 'Já cuidei de todas'}
                </Botao>
              )}
              {avisos.length > 0 && (
                <Botao pequeno icone={mdiTrashCanOutline} onClick={limparTodos} disabled={limpando}>
                  {limpando ? 'Limpando…' : 'Limpar avisos de OP'}
                </Botao>
              )}
              <Botao variante="discreto" pequeno icone={mdiClose} className="acn-gav-x" aria-label="Fechar" title="Fechar" onClick={onClose} />
            </div>
          </div>
        </div>

        <div className="acn-gav-lista">
          {loading && <div className="acn-empty">Carregando...</div>}
          {erroDatas && <Faixa tom="erro" acao={<Botao pequeno onClick={load}>Tentar de novo</Botao>}>Não foi possível ler as datas para cuidar ({erroDatas}). Isso não quer dizer que não haja nenhuma.</Faixa>}
          {!loading && !erroDatas && avisos.length === 0 && datas.length === 0 && (
            <div className="acn-empty acn-gav-vazio">
              <Icone path={mdiBullhornOutline} size={30} />
              <div>Aqui aparecem as datas vencidas ou de hoje dos seus processos (licitações, compras, entregas…) e o andamento das OPs que envolvem você (início, conclusão, retrabalho, recados da adaptação).</div>
            </div>
          )}
          {datas.length > 0 && <div className="acn-label">Datas para cuidar</div>}
          {datas.map(a => {
            const dia = diaDoAvisoDoCalendario(a.contexto_id);
            const vencido = !!dia && dia < hojeISO();
            return (
              <div key={a.id} className="acn-avo-item">
                <div className="acn-avo-cab">
                  <span className="acn-avo-desc">{rotuloDoAvisoDoCalendario(a.contexto_id)}</span>
                  <Selo familia={vencido ? 'erro' : 'atencao'} ponto={false}>{vencido ? 'Data vencida' : 'Vence hoje'}</Selo>
                  <span className="acn-ajuda acn-avo-quando">{fmtDT(a.criado_em)}</span>
                </div>
                <div className="acn-avo-texto">{a.texto_trecho}</div>
                <div className="acn-avo-pe">
                  <Botao pequeno icone={mdiCheck} onClick={() => dispensarUm(a)} title="Já cuidei: o aviso some e não volta (só volta se a data do item mudar)">Já cuidei</Botao>
                  <Botao pequeno icone={mdiOpenInNew} className="acn-avo-abrir" onClick={() => abrirData(a)}>Abrir</Botao>
                </div>
              </div>
            );
          })}
          {avisos.length > 0 && datas.length > 0 && <div className="acn-label">Andamento das OPs</div>}
          {avisos.map(a => (
            <div key={a.id} className="acn-avo-item">
              <div className="acn-avo-cab">
                <span className="acn-avo-desc">{a.contexto_descricao || 'OP'}</span>
                <span className="acn-ajuda acn-avo-quando">{fmtDT(a.criado_em)}</span>
                <Botao variante="discreto" pequeno icone={mdiClose} onClick={() => limparUm(a)} title="Limpar este aviso" />
              </div>
              <div className="acn-avo-texto">{a.texto_trecho}</div>
              <div className="acn-avo-pe">
                <span className="acn-ajuda">por {a.mencionante_nome || 'Sistema'}</span>
                {a.contexto_id && (
                  <Botao pequeno icone={mdiWrenchOutline} className="acn-avo-abrir" onClick={() => abrirOp(a)}>
                    Abrir OP
                  </Botao>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {opAberta && (
        <div className="acn-avo-sobre">
          <OplDetalheModal opl={opAberta} onClose={() => setOpAberta(null)} currentUser={currentUser} />
        </div>
      )}
    </div>
  );
}
