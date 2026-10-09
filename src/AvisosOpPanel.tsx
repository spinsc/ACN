// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// Avisos de OP — painel próprio (botão "Avisos" no topo).
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
import { confirmar } from './Feedback';
import { Botao } from './Interface';
import Icone from './Icone';
import { mdiBullhornOutline, mdiTrashCanOutline, mdiClose, mdiWrenchOutline } from '@mdi/js';

export const CONTEXTO_AVISO_OP = 'op_adaptacao';

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

const fmtDT = (v: string) => {
  if (!v) return '';
  try { return new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return v; }
};

export default function AvisosOpPanel({ currentUser, onClose, onCountChange }: any) {
  const [avisos, setAvisos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [limpando, setLimpando] = useState(false);
  const [opAberta, setOpAberta] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('mencoes').select('*')
      .or(filtroDoUsuario(currentUser))
      .eq('contexto', CONTEXTO_AVISO_OP)
      .order('criado_em', { ascending: false })
      .limit(300);
    setAvisos(data || []);
    onCountChange?.((data || []).length);
    setLoading(false);
  }, [currentUser?.id, currentUser?.nome, onCountChange]);

  useEffect(() => { load(); }, [load]);

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

      <div className="acn-gav-painel" role="dialog" aria-label="Avisos de OP">

        <div className="acn-gav-cab">
          <div className="acn-gav-cab-linha">
            <div>
              <div className="acn-gav-tit"><Icone path={mdiBullhornOutline} size={18} />Avisos de OP</div>
              <div className="acn-gav-sub">
                {avisos.length ? `${avisos.length} aviso(s) de andamento das OPs` : 'Nenhum aviso no momento'}
              </div>
            </div>
            <div className="acn-avo-botoes">
              <Botao pequeno icone={mdiTrashCanOutline} onClick={limparTodos} disabled={!avisos.length || limpando}>
                {limpando ? 'Limpando…' : 'Limpar todos'}
              </Botao>
              <Botao variante="discreto" pequeno icone={mdiClose} className="acn-gav-x" aria-label="Fechar" title="Fechar" onClick={onClose} />
            </div>
          </div>
        </div>

        <div className="acn-gav-lista">
          {loading && <div className="acn-empty">Carregando...</div>}
          {!loading && avisos.length === 0 && (
            <div className="acn-empty acn-gav-vazio">
              <Icone path={mdiBullhornOutline} size={30} />
              <div>Quando uma OP que envolve você andar (início, conclusão, retrabalho, recados da adaptação), o aviso aparece aqui.</div>
            </div>
          )}
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
