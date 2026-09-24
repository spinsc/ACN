// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// FLUXO DE COMPRAS — etapas, reprocesso, descarte, edição da solicitação,
// anexos, histórico e alertas do setor.
//
// Etapas: Pendente → Em Andamento → (Aguardando Aprovação) → Aprovado → Comprado
//         → Recebido, e Descartada (fora do fluxo, pode ser reativada).
//
// • Avançar (arrastando no kanban ou pelos botões) abre a janela que pede o
//   que a etapa exige: comprador, cotação vencedora/aprovação (Mesa de
//   Cotações), prazo de entrega ou o recebimento.
// • Voltar uma etapa é um REPROCESSO: pede o motivo e o que será refeito, conta
//   em `reprocessos` e não apaga nada (cotações, aprovações e valores ficam no
//   histórico).
// • Tudo vai para pcp_pedidos_compra_historico. Qualquer registro lá (e qualquer
//   alteração na requisição, cotação ou anexo) zera o relógio dos alertas
//   (coluna ultima_movimentacao_em, mantida por trigger no banco).
// • Alertas (horas úteis, Seg–Sex 8h–17h45):
//     Pendente / Em Andamento parados 48h → Compras justifica (obrigatório);
//     Aprovado parado 24h → comprador justifica por que não comprou;
//     Comprado com prazo de entrega vencido e sem recebimento → Compras e
//     Almoxarifado dão a posição (e recebem uma menção).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { horasUteis } from './utils/horasUteis';
import { VinculoPicker, TIPO_LABEL } from './VinculoPicker';
import { Botao, Selo, Faixa } from './Interface';
import { confirmar } from './Feedback';
import { mdiPaperclip, mdiTrashCanOutline, mdiUpload } from '@mdi/js';

// A última etapa se chama RECEBIDO (era "Concluído" até 22/09/2026): o que
// encerra a compra é o material chegar, e o nome antigo confundia com a
// conclusão da aprovação. O valor gravado no banco também é "Recebido" — os
// 15 pedidos antigos foram migrados, para não existirem dois nomes.
export const ETAPAS_COMPRA = ['Pendente', 'Em Andamento', 'Aguardando Aprovação', 'Aprovado', 'Comprado', 'Recebido'];
export const DESCARTADA = 'Descartada';
export const COR_ETAPA_COMPRA: Record<string, string> = {
  'Pendente': '#f59e0b', 'Em Andamento': '#3b82f6', 'Aguardando Aprovação': '#ea580c', 'Aprovado': '#0ea5e9',
  'Comprado': '#7c3aed', 'Recebido': '#22c55e', 'Descartada': '#64748b',
};

// Etapa para onde se volta num reprocesso
export const ETAPA_ANTERIOR: Record<string, string> = {
  'Em Andamento': 'Pendente',
  'Aguardando Aprovação': 'Em Andamento',
  'Aprovado': 'Em Andamento',
  'Comprado': 'Aprovado',
  'Recebido': 'Comprado',
};
// Próxima etapa ao avançar. De "Em Andamento" o caminho é a etapa de aprovação:
// é lá que a cotação vencedora é escolhida e aprovada (ajuste de 22/09/2026 —
// antes a vencedora tinha de ser escolhida ANTES, o que invertia o processo).
export const PROXIMA_ETAPA: Record<string, string> = {
  'Pendente': 'Em Andamento',
  'Em Andamento': 'Aguardando Aprovação',
  'Aguardando Aprovação': 'Aprovado',
  'Aprovado': 'Comprado',
  'Comprado': 'Recebido',
};

export const podeGerirCompras = (u: any) =>
  ['Admin', 'Compras'].includes(u?.perfil) || String(u?.perfil || '').startsWith('Gerente');
export const ehSolicitante = (p: any, u: any) =>
  !!p?.criado_por && !!u?.email && String(p.criado_por).toLowerCase() === String(u.email).toLowerCase();
// quem solicitou edita até a compra ser efetivada; Compras/Gerentes/Admin sempre
export const podeEditarSolicitacao = (p: any, u: any) =>
  podeGerirCompras(u) || (ehSolicitante(p, u) && ['Pendente', 'Em Andamento', 'Aguardando Aprovação', 'Aprovado'].includes(p?.status_compra));

const fmtDT = (v: any) => v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtData = (v: any) => v ? new Date(String(v).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const horasTexto = (h: number) => h < 1 ? 'menos de 1 h' : h < 10 ? `${h.toFixed(1).replace('.', ',')} h` : `${Math.round(h)} h`;

// ── Histórico e avisos ───────────────────────────────────────────────────────
export async function registrarHistorico(pedidoId: string, reg: any, user: any) {
  const { error } = await supabase.from('pcp_pedidos_compra_historico').insert([{
    pedido_id: pedidoId, tipo: reg.tipo, status_de: reg.de || null, status_para: reg.para || null,
    motivo: reg.motivo || null, dados: reg.dados || null,
    usuario_email: user?.email || null, usuario_nome: user?.nome || null,
  }]);
  if (error) console.warn('Falha ao registrar histórico da compra:', error.message);
}

async function inserirMencao(dest: { id: any; nome: string }, pedido: any, texto: string, user: any, campo: string) {
  await supabase.from('mencoes').insert({
    mencionado_id: String(dest.id), mencionado_nome: dest.nome,
    mencionante_id: String(user?.id || ''), mencionante_nome: user?.nome || 'Sistema',
    contexto: 'compra_aprovacao', contexto_id: String(pedido.id),
    contexto_descricao: `Pedido ${pedido.numero_pedido || ''}`,
    campo, texto_trecho: texto, aba_destino: 'compras', lida: false, criado_em: new Date().toISOString(),
  });
}

export async function mencionarSolicitante(pedido: any, texto: string, user: any, campo = 'fluxo_compra') {
  try {
    if (!pedido?.criado_por) return;
    const { data: criador } = await supabase.from('auth_usuarios').select('id, nome').ilike('email', pedido.criado_por).maybeSingle();
    if (!criador || String(criador.id) === String(user?.id)) return;
    await inserirMencao(criador, pedido, texto, user, campo);
  } catch (e) { console.warn('Falha ao avisar quem solicitou:', e); }
}

export async function mencionarPerfis(perfis: string[], pedido: any, texto: string, user: any, campo: string) {
  try {
    const { data } = await supabase.from('auth_usuarios').select('id, nome').in('perfil', perfis).eq('ativo', true);
    for (const u of data || []) await inserirMencao(u, pedido, texto, user, campo);
  } catch (e) { console.warn('Falha ao avisar setores:', e); }
}

// ── Janela padrão ────────────────────────────────────────────────────────────
function Janela({ titulo, subtitulo, children, onClose, largura = 520, bloqueada = false }: any) {
  return (
    <div className="modal-overlay" style={{ zIndex: 2600 }}
      onClick={e => { if (!bloqueada && e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal-box" style={{ maxWidth: largura, width: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-title" style={{ marginBottom: subtitulo ? 2 : 12 }}>{titulo}</div>
        {subtitulo && <div style={{ fontSize: 12, color: 'var(--acn-muted)', marginBottom: 12 }}>{subtitulo}</div>}
        {children}
      </div>
    </div>
  );
}

const Rotulo = ({ children }: any) => <label className="acn-label" style={{ display: 'block', marginBottom: 3 }}>{children}</label>;
const Texto = (props: any) => <textarea className="acn-input" rows={3} style={{ width: '100%', resize: 'vertical', minHeight: 64 }} {...props} />;
const Rodape = ({ children }: any) => <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>{children}</div>;

function ResumoPedido({ p }: any) {
  return (
    <div style={{ background: 'var(--acn-surface-2)', border: '1px solid var(--acn-line)', borderRadius: 8, padding: '8px 10px', marginBottom: 12, fontSize: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong className="acn-mono">{p.numero_pedido}</strong>
        <Selo familia="neutro">{p.status_compra}</Selo>
        {p.reprocessos > 0 && <Selo familia="atencao" ponto={false}>Reprocesso nº {p.reprocessos}</Selo>}
      </div>
      <div style={{ marginTop: 4, color: 'var(--acn-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 60, overflow: 'hidden' }}>{p.descricao_material}</div>
      <div style={{ marginTop: 2, color: 'var(--acn-muted)' }}>Qtd {p.quantidade || 1}{p.criado_por_nome ? ` · solicitado por ${p.criado_por_nome}` : ''}</div>
    </div>
  );
}

// ── Voltar uma etapa (reprocesso) ────────────────────────────────────────────
export function ModalVoltarEtapa({ pedido, currentUser, onClose, onFeito }: any) {
  const destino = ETAPA_ANTERIOR[pedido.status_compra];
  const [motivo, setMotivo] = useState('');
  const [refazer, setRefazer] = useState('');
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!motivo.trim()) { alert('Informe por que a requisição está voltando.'); return; }
    if (!refazer.trim()) { alert('Informe o que precisa ser refeito.'); return; }
    setSalvando(true);
    const de = pedido.status_compra;
    const dados: any = {
      vencedora_id: pedido.vencedora_id, fornecedor: pedido.fornecedor, valor_compra: pedido.valor_compra,
      numero_oc: pedido.numero_oc, data_prevista_recebimento: pedido.data_prevista_recebimento,
      numero_nf: pedido.numero_nf, data_recebimento_real: pedido.data_recebimento_real,
    };
    const upd: any = { status_compra: destino, reprocessos: (Number(pedido.reprocessos) || 0) + 1 };
    if (destino === 'Em Andamento' && ['Aguardando Aprovação', 'Aprovado'].includes(de)) {
      // a escolha da vencedora e as aprovações em aberto são refeitas; as cotações continuam lá
      upd.vencedora_id = null; upd.justificativa_vencedora = null; upd.valor_compra = null;
      await supabase.from('pcp_aprovacoes').update({ status: 'cancelado', resposta: `Reprocesso: ${motivo.trim()}` })
        .eq('pedido_id', pedido.id).eq('status', 'pendente');
    }
    if (destino === 'Comprado' && de === 'Recebido') upd.data_conclusao = null;
    const { error } = await supabase.from('pcp_pedidos_compra').update(upd).eq('id', pedido.id);
    if (error) { setSalvando(false); alert('Não foi possível voltar a etapa: ' + error.message); return; }
    await registrarHistorico(pedido.id, { tipo: 'retorno', de, para: destino, motivo: motivo.trim(), dados: { ...dados, refazer: refazer.trim(), reprocesso: upd.reprocessos } }, currentUser);
    await mencionarSolicitante(pedido, `A requisição ${pedido.numero_pedido} voltou de "${de}" para "${destino}" (reprocesso nº ${upd.reprocessos}). Motivo: ${motivo.trim()}. Será refeito: ${refazer.trim()}`, currentUser, 'reprocesso');
    setSalvando(false);
    onFeito?.();
  };

  return (
    <Janela titulo={`Voltar para "${destino}"`} subtitulo="Isto conta como reprocesso. Nada é apagado: cotações, aprovações e valores ficam no histórico." onClose={onClose}>
      <ResumoPedido p={pedido} />
      <Rotulo>Por que está voltando? *</Rotulo>
      <Texto value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: fornecedor não tem mais o item no preço cotado" autoFocus />
      <div style={{ height: 10 }} />
      <Rotulo>O que precisa ser refeito? *</Rotulo>
      <Texto value={refazer} onChange={e => setRefazer(e.target.value)} placeholder="Ex.: cotar novamente com 2 fornecedores e reenviar para aprovação" />
      <Rodape>
        <Botao variante="secundario" onClick={onClose} disabled={salvando}>Cancelar</Botao>
        <Botao variante="primario" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : `Voltar para ${destino}`}</Botao>
      </Rodape>
    </Janela>
  );
}

// ── Descartar / reativar ─────────────────────────────────────────────────────
export function ModalDescartar({ pedido, currentUser, onClose, onFeito }: any) {
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    if (!motivo.trim()) { alert('Informe o motivo do descarte.'); return; }
    setSalvando(true);
    const de = pedido.status_compra;
    await supabase.from('pcp_aprovacoes').update({ status: 'cancelado', resposta: `Descartada: ${motivo.trim()}` })
      .eq('pedido_id', pedido.id).eq('status', 'pendente');
    const { error } = await supabase.from('pcp_pedidos_compra').update({
      status_compra: DESCARTADA, status_antes_descarte: de, motivo_descarte: motivo.trim(),
      descartado_por_nome: currentUser?.nome || null, descartado_em: new Date().toISOString(),
    }).eq('id', pedido.id);
    if (error) { setSalvando(false); alert('Não foi possível descartar: ' + error.message); return; }
    await registrarHistorico(pedido.id, { tipo: 'descarte', de, para: DESCARTADA, motivo: motivo.trim() }, currentUser);
    if (!ehSolicitante(pedido, currentUser)) {
      await mencionarSolicitante(pedido, `A requisição ${pedido.numero_pedido} foi descartada por ${currentUser?.nome || '—'}. Motivo: ${motivo.trim()}`, currentUser, 'descarte');
    } else {
      await mencionarPerfis(['Compras'], pedido, `${currentUser?.nome || 'Quem solicitou'} descartou a requisição ${pedido.numero_pedido}. Motivo: ${motivo.trim()}`, currentUser, 'descarte');
    }
    setSalvando(false);
    onFeito?.();
  };
  return (
    <Janela titulo="Descartar requisição de compra" subtitulo="A requisição sai do fluxo mas não é apagada: fica em Descartadas e pode ser reativada." onClose={onClose}>
      <ResumoPedido p={pedido} />
      <Rotulo>Motivo do descarte *</Rotulo>
      <Texto value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: compra não é mais necessária, item conseguido no estoque" autoFocus />
      <Rodape>
        <Botao variante="secundario" onClick={onClose} disabled={salvando}>Cancelar</Botao>
        <Botao variante="perigo" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Descartar'}</Botao>
      </Rodape>
    </Janela>
  );
}

export function ModalReativar({ pedido, currentUser, onClose, onFeito }: any) {
  const destino = pedido.status_antes_descarte && ETAPAS_COMPRA.includes(pedido.status_antes_descarte) && pedido.status_antes_descarte !== 'Recebido'
    ? pedido.status_antes_descarte : 'Pendente';
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    if (!motivo.trim()) { alert('Informe por que está reativando.'); return; }
    setSalvando(true);
    const { error } = await supabase.from('pcp_pedidos_compra').update({ status_compra: destino, motivo_descarte: null }).eq('id', pedido.id);
    if (error) { setSalvando(false); alert('Não foi possível reativar: ' + error.message); return; }
    await registrarHistorico(pedido.id, { tipo: 'reativacao', de: DESCARTADA, para: destino, motivo: motivo.trim(), dados: { motivo_descarte_anterior: pedido.motivo_descarte } }, currentUser);
    setSalvando(false);
    onFeito?.();
  };
  return (
    <Janela titulo={`Reativar requisição (volta para "${destino}")`} onClose={onClose}>
      <ResumoPedido p={pedido} />
      {pedido.motivo_descarte && <Faixa tom="info">Descartada{pedido.descartado_por_nome ? ` por ${pedido.descartado_por_nome}` : ''}: {pedido.motivo_descarte}</Faixa>}
      <Rotulo>Por que está reativando? *</Rotulo>
      <Texto value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus />
      <Rodape>
        <Botao variante="secundario" onClick={onClose} disabled={salvando}>Cancelar</Botao>
        <Botao variante="primario" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Reativar'}</Botao>
      </Rodape>
    </Janela>
  );
}

// ── Pendente → Em Andamento: quem vai cotar ──────────────────────────────────
export function ModalIniciarCotacao({ pedido, currentUser, onClose, onFeito }: any) {
  const [compradores, setCompradores] = useState<any[]>([]);
  const [comprador, setComprador] = useState(currentUser?.email || '');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    supabase.from('auth_usuarios').select('email, nome, perfil').eq('ativo', true).in('perfil', ['Compras', 'Admin'])
      .order('nome').then(({ data }) => {
        const lista = data || [];
        if (currentUser?.email && !lista.some((u: any) => u.email === currentUser.email)) lista.unshift({ email: currentUser.email, nome: currentUser.nome });
        setCompradores(lista);
        const doSetor = lista.find((u: any) => u.perfil === 'Compras');
        if (!['Compras'].includes(currentUser?.perfil) && doSetor) setComprador(doSetor.email);
      });
  }, []);
  const salvar = async () => {
    const c = compradores.find(u => u.email === comprador);
    if (!c) { alert('Escolha o comprador responsável.'); return; }
    setSalvando(true);
    const { error } = await supabase.from('pcp_pedidos_compra').update({
      status_compra: 'Em Andamento', comprador_email: c.email, comprador_nome: c.nome,
    }).eq('id', pedido.id);
    if (error) { setSalvando(false); alert('Não foi possível iniciar: ' + error.message); return; }
    await registrarHistorico(pedido.id, { tipo: 'avanco', de: 'Pendente', para: 'Em Andamento', motivo: obs.trim() || null, dados: { comprador: c.nome } }, currentUser);
    setSalvando(false);
    onFeito?.();
  };
  return (
    <Janela titulo="Iniciar cotação" subtitulo="A requisição vai para Em Andamento." onClose={onClose}>
      <ResumoPedido p={pedido} />
      <Rotulo>Comprador responsável *</Rotulo>
      <select className="acn-input" style={{ width: '100%' }} value={comprador} onChange={e => setComprador(e.target.value)}>
        <option value="">Selecione…</option>
        {compradores.map(u => <option key={u.email} value={u.email}>{u.nome}</option>)}
      </select>
      <div style={{ height: 10 }} />
      <Rotulo>Observação (opcional)</Rotulo>
      <Texto value={obs} onChange={e => setObs(e.target.value)} rows={2} />
      <Rodape>
        <Botao variante="secundario" onClick={onClose} disabled={salvando}>Cancelar</Botao>
        <Botao variante="primario" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Iniciar cotação'}</Botao>
      </Rodape>
    </Janela>
  );
}

// ── Aprovado → Comprado: prazo de entrega obrigatório ────────────────────────
export function ModalConfirmarCompra({ pedido, onClose, onConfirmar }: any) {
  const [prazo, setPrazo] = useState(pedido.data_prevista_recebimento ? String(pedido.data_prevista_recebimento).slice(0, 10) : '');
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    if (!prazo) { alert('Informe o prazo de entrega combinado com o fornecedor.'); return; }
    setSalvando(true);
    const ok = await onConfirmar(pedido, prazo);
    setSalvando(false);
    if (ok !== false) onClose?.();
  };
  return (
    <Janela titulo="Confirmar compra" subtitulo="Gera a Ordem de Compra e envia para o acompanhamento de recebimento." onClose={onClose}>
      <ResumoPedido p={pedido} />
      <div style={{ fontSize: 12, marginBottom: 10 }}>Fornecedor: <strong>{pedido.fornecedor || '—'}</strong></div>
      <Rotulo>Prazo de entrega do pedido *</Rotulo>
      <input type="date" className="acn-input" style={{ width: '100%' }} value={prazo} onChange={e => setPrazo(e.target.value)} />
      <div style={{ fontSize: 11, color: 'var(--acn-muted)', marginTop: 4 }}>Se o recebimento não for registrado até esta data, Compras e Almoxarifado recebem um alerta.</div>
      <Rodape>
        <Botao variante="secundario" onClick={onClose} disabled={salvando}>Cancelar</Botao>
        <Botao variante="primario" onClick={salvar} disabled={salvando}>{salvando ? 'Confirmando…' : 'Confirmar compra'}</Botao>
      </Rodape>
    </Janela>
  );
}

// ── Anexos da requisição ─────────────────────────────────────────────────────
export async function enviarAnexosCompra(pedidoId: string, arquivos: File[], user: any) {
  const erros: string[] = [];
  for (const f of arquivos) {
    if (f.size > 20 * 1024 * 1024) { erros.push(`${f.name}: maior que 20 MB`); continue; }
    const nomeLimpo = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const path = `compras-anexos/${pedidoId}/${Date.now()}_${nomeLimpo}`;
    const { error } = await supabase.storage.from('acn-media').upload(path, f, { upsert: true, contentType: f.type || undefined });
    if (error) { erros.push(`${f.name}: ${error.message}`); continue; }
    const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
    await supabase.from('pcp_pedidos_compra_anexos').insert([{
      pedido_id: pedidoId, nome: f.name, url: pub?.publicUrl || path, tipo: f.type || null, tamanho: f.size,
      criado_por: user?.email || null, criado_por_nome: user?.nome || null,
    }]);
  }
  return erros;
}

export function EscolherAnexos({ arquivos, onChange }: { arquivos: File[]; onChange: (f: File[]) => void }) {
  return (
    <div>
      <label className="acn-b acn-b-secundario acn-b-p" style={{ cursor: 'pointer' }}>
        <input type="file" multiple style={{ display: 'none' }}
          onChange={e => { const novos = Array.from(e.target.files || []); if (novos.length) onChange([...arquivos, ...novos]); e.target.value = ''; }} />
        📎 Anexar arquivos
      </label>
      <span style={{ fontSize: 11, color: 'var(--acn-muted)', marginLeft: 8 }}>Foto, PDF, planilha ou qualquer arquivo (até 20 MB cada)</span>
      {arquivos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          {arquivos.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {f.name}</span>
              <span style={{ color: 'var(--acn-muted)', fontSize: 11 }}>{(f.size / 1024).toFixed(0)} KB</span>
              <button type="button" onClick={() => onChange(arquivos.filter((_, j) => j !== i))}
                style={{ border: 'none', background: 'none', color: 'var(--acn-bad)', cursor: 'pointer' }} aria-label={`Remover ${f.name}`}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AnexosCompra({ pedido, currentUser, podeEditar }: any) {
  const [anexos, setAnexos] = useState<any[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const carregar = useCallback(async () => {
    const { data } = await supabase.from('pcp_pedidos_compra_anexos').select('*').eq('pedido_id', pedido.id).order('criado_em');
    setAnexos(data || []);
  }, [pedido.id]);
  useEffect(() => { carregar(); }, [carregar]);
  const enviar = async (files: FileList | null) => {
    if (!files?.length) return;
    setEnviando(true);
    const erros = await enviarAnexosCompra(pedido.id, Array.from(files), currentUser);
    await registrarHistorico(pedido.id, { tipo: 'anexo', motivo: `Anexou: ${Array.from(files).map(f => f.name).join(', ')}` }, currentUser);
    setEnviando(false);
    if (erros.length) alert('Alguns arquivos não foram enviados:\n' + erros.join('\n'));
    carregar();
  };
  const remover = async (a: any) => {
    if (!await confirmar(`Remover o anexo "${a.nome}"?`)) return;
    await supabase.from('pcp_pedidos_compra_anexos').delete().eq('id', a.id);
    await registrarHistorico(pedido.id, { tipo: 'anexo', motivo: `Removeu o anexo: ${a.nome}` }, currentUser);
    carregar();
  };
  return (
    <div>
      {anexos === null ? <div style={{ fontSize: 12, color: 'var(--acn-muted)' }}>Carregando…</div>
        : anexos.length === 0 ? <div style={{ fontSize: 12, color: 'var(--acn-muted)' }}>Nenhum anexo.</div>
        : anexos.map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '3px 0', borderBottom: '1px solid var(--acn-line-soft)' }}>
            <a href={a.url} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--acn-brand-ink)' }}>📎 {a.nome}</a>
            <span style={{ fontSize: 11, color: 'var(--acn-muted)' }}>{a.criado_por_nome || ''} · {fmtDT(a.criado_em)}</span>
            {podeEditar && <Botao pequeno variante="discreto" icone={mdiTrashCanOutline} aria-label={`Remover ${a.nome}`} title="Remover" onClick={() => remover(a)} />}
          </div>
        ))}
      {podeEditar && (
        <label className="acn-b acn-b-secundario acn-b-p" style={{ cursor: enviando ? 'wait' : 'pointer', marginTop: 6 }}>
          <input type="file" multiple style={{ display: 'none' }} disabled={enviando} onChange={e => { enviar(e.target.files); e.target.value = ''; }} />
          {enviando ? 'Enviando…' : '📎 Adicionar anexos'}
        </label>
      )}
    </div>
  );
}

// ── Histórico ────────────────────────────────────────────────────────────────
const TIPO_HIST: Record<string, string> = {
  avanco: 'Avançou', retorno: 'Reprocesso', descarte: 'Descartada', reativacao: 'Reativada',
  parado: 'Justificativa (parada)', posicao_entrega: 'Posição da entrega', edicao: 'Solicitação editada', anexo: 'Anexos',
};
const FAMILIA_HIST: Record<string, string> = { retorno: 'atencao', descarte: 'erro', parado: 'atencao', posicao_entrega: 'info', avanco: 'ok', reativacao: 'ok' };

export function HistoricoCompra({ pedidoId, recarregar = 0 }: any) {
  const [itens, setItens] = useState<any[] | null>(null);
  useEffect(() => {
    supabase.from('pcp_pedidos_compra_historico').select('*').eq('pedido_id', pedidoId).order('criado_em', { ascending: false })
      .then(({ data }) => setItens(data || []));
  }, [pedidoId, recarregar]);
  if (itens === null) return <div style={{ fontSize: 12, color: 'var(--acn-muted)' }}>Carregando…</div>;
  if (!itens.length) return <div style={{ fontSize: 12, color: 'var(--acn-muted)' }}>Nenhum registro ainda.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {itens.map(h => (
        <div key={h.id} style={{ borderLeft: '3px solid var(--acn-line)', paddingLeft: 8, fontSize: 12 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <Selo familia={(FAMILIA_HIST[h.tipo] || 'neutro') as any} ponto={false}>{TIPO_HIST[h.tipo] || h.tipo}</Selo>
            {(h.status_de || h.status_para) && <span style={{ color: 'var(--acn-text)' }}>{h.status_de || '—'} → {h.status_para || '—'}</span>}
            <span style={{ color: 'var(--acn-muted)', fontSize: 11, marginLeft: 'auto' }}>{h.usuario_nome || '—'} · {fmtDT(h.criado_em)}</span>
          </div>
          {h.motivo && <div style={{ marginTop: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{h.motivo}</div>}
          {h.dados?.refazer && <div style={{ marginTop: 2, color: 'var(--acn-muted)' }}>Será refeito: {h.dados.refazer}</div>}
          {h.tipo === 'edicao' && Array.isArray(h.dados?.campos) && (
            <div style={{ marginTop: 2, color: 'var(--acn-muted)' }}>
              {h.dados.campos.map((c: any, i: number) => <div key={i}>{c.campo}: "{String(c.de ?? '—').slice(0, 80)}" → "{String(c.para ?? '—').slice(0, 80)}"</div>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Editar a solicitação ─────────────────────────────────────────────────────
export function ModalEditarSolicitacao({ pedido, currentUser, onClose, onFeito }: any) {
  const [form, setForm] = useState({
    descricao_material: pedido.descricao_material || '',
    quantidade: pedido.quantidade ?? 1,
    fornecedor: pedido.fornecedor || '',
    link_url: pedido.link_url || '',
    observacoes: pedido.observacoes || '',
    vinculo: pedido.vinculo_tipo ? { tipo: pedido.vinculo_tipo, id: pedido.vinculo_id, descricao: pedido.vinculo_descricao } : null,
  });
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const temCotacaoOuCompra = ['Aprovado', 'Comprado', 'Recebido'].includes(pedido.status_compra);

  const salvar = async () => {
    if (!form.descricao_material.trim()) { alert('A descrição não pode ficar vazia.'); return; }
    const qtd = Number(String(form.quantidade).replace(',', '.'));
    if (!(qtd > 0)) { alert('Informe uma quantidade maior que zero.'); return; }
    const novo: any = {
      descricao_material: form.descricao_material.trim(), quantidade: qtd,
      fornecedor: form.fornecedor.trim() || null, link_url: form.link_url.trim() || null,
      observacoes: form.observacoes.trim() || null,
      vinculo_tipo: form.vinculo?.tipo || null, vinculo_id: form.vinculo?.id || null, vinculo_descricao: form.vinculo?.descricao || null,
    };
    const NOMES: Record<string, string> = { descricao_material: 'Descrição', quantidade: 'Quantidade', fornecedor: 'Fornecedor sugerido', link_url: 'Link', observacoes: 'Observações', vinculo_descricao: 'Vínculo' };
    const campos = Object.keys(NOMES).filter(k => String(pedido[k] ?? '') !== String(novo[k] ?? ''))
      .map(k => ({ campo: NOMES[k], de: pedido[k], para: novo[k] }));
    if (!campos.length && String(pedido.vinculo_tipo ?? '') === String(novo.vinculo_tipo ?? '')) { onClose?.(); return; }
    setSalvando(true);
    const { error } = await supabase.from('pcp_pedidos_compra').update(novo).eq('id', pedido.id);
    if (error) { setSalvando(false); alert('Não foi possível salvar: ' + error.message); return; }
    await registrarHistorico(pedido.id, { tipo: 'edicao', dados: { campos } }, currentUser);
    if (ehSolicitante(pedido, currentUser) && pedido.status_compra !== 'Pendente') {
      await mencionarPerfis(['Compras'], pedido, `${currentUser?.nome || 'Quem solicitou'} alterou a requisição ${pedido.numero_pedido} (${campos.map(c => c.campo).join(', ')}).`, currentUser, 'edicao_solicitacao');
    }
    setSalvando(false);
    onFeito?.();
  };

  return (
    <Janela titulo={`Editar solicitação — ${pedido.numero_pedido}`} subtitulo="As alterações ficam registradas no histórico da requisição." onClose={onClose} largura={620}>
      {temCotacaoOuCompra && Number(form.quantidade) !== Number(pedido.quantidade) && (
        <Faixa tom="atencao">A compra já tem cotação escolhida: mudar a quantidade pode exigir voltar a etapa e cotar de novo.</Faixa>
      )}
      <Rotulo>Descrição do material / serviço *</Rotulo>
      <Texto value={form.descricao_material} onChange={e => set('descricao_material', e.target.value)} rows={3} />
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, marginTop: 10 }}>
        <div><Rotulo>Quantidade *</Rotulo>
          <input className="acn-input" type="number" min={0} step="any" style={{ width: '100%' }} value={form.quantidade} onChange={e => set('quantidade', e.target.value)} /></div>
        <div><Rotulo>Fornecedor sugerido</Rotulo>
          <input className="acn-input" style={{ width: '100%' }} value={form.fornecedor} onChange={e => set('fornecedor', e.target.value)} /></div>
      </div>
      <div style={{ marginTop: 10 }}>
        <Rotulo>Vincular a um processo (opcional)</Rotulo>
        <VinculoPicker value={form.vinculo} onSelect={v => set('vinculo', v)} onClear={() => set('vinculo', null)} />
      </div>
      <div style={{ marginTop: 10 }}>
        <Rotulo>Link (opcional)</Rotulo>
        <input className="acn-input" style={{ width: '100%' }} value={form.link_url} onChange={e => set('link_url', e.target.value)} placeholder="https://…" />
      </div>
      <div style={{ marginTop: 10 }}>
        <Rotulo>Observações</Rotulo>
        <Texto value={form.observacoes} onChange={e => set('observacoes', e.target.value)} rows={2} />
      </div>
      <div style={{ marginTop: 12 }}>
        <Rotulo>Anexos</Rotulo>
        <AnexosCompra pedido={pedido} currentUser={currentUser} podeEditar />
      </div>
      <Rodape>
        <Botao variante="secundario" onClick={onClose} disabled={salvando}>Cancelar</Botao>
        <Botao variante="primario" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar alterações'}</Botao>
      </Rodape>
    </Janela>
  );
}

// ── Alertas ──────────────────────────────────────────────────────────────────
export const LIMITE_HORAS: Record<string, number> = { 'Pendente': 48, 'Em Andamento': 48, 'Aprovado': 24 };

export function calcularAlertasCompras(pedidos: any[], agora = new Date()) {
  const alertas: any[] = [];
  const hojeISO = agora.toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso local
  for (const p of pedidos) {
    const st = p.status_compra;
    const ultima = p.ultima_movimentacao_em || p.data_atualizacao || p.data_criacao;
    if (LIMITE_HORAS[st] != null) {
      const h = horasUteis(ultima, agora);
      if (h >= LIMITE_HORAS[st]) alertas.push({ tipo: 'parado', pedido: p, horas: h, limite: LIMITE_HORAS[st] });
    } else if (st === 'Comprado' && p.data_prevista_recebimento) {
      const prazo = String(p.data_prevista_recebimento).slice(0, 10);
      if (prazo < hojeISO) {
        const fimPrazo = new Date(prazo + 'T17:45:00');
        const ultimaDt = new Date(ultima);
        // sem posição desde que o prazo venceu, ou última posição com mais de 24h úteis
        if (ultimaDt < fimPrazo || horasUteis(ultimaDt, agora) >= 24) {
          const dias = Math.floor((new Date(hojeISO + 'T12:00:00').getTime() - new Date(prazo + 'T12:00:00').getTime()) / 86400000);
          alertas.push({ tipo: 'entrega', pedido: p, dias });
        }
      }
    }
  }
  return alertas;
}

// Para quem é cada alerta
export function alertasDoUsuario(alertas: any[], u: any) {
  const perfil = u?.perfil;
  return alertas.filter(a => {
    if (a.tipo === 'entrega') return ['Compras', 'Almoxarifado'].includes(perfil);
    if (perfil !== 'Compras') return false;
    // Aprovado parado: com comprador definido, é dele
    if (a.pedido.status_compra === 'Aprovado' && a.pedido.comprador_email)
      return String(a.pedido.comprador_email).toLowerCase() === String(u?.email || '').toLowerCase();
    return true;
  });
}

const CAMPOS_ALERTA = 'id, numero_pedido, descricao_material, quantidade, fornecedor, status_compra, ultima_movimentacao_em, data_atualizacao, data_criacao, data_prevista_recebimento, criado_por, criado_por_nome, comprador_email, comprador_nome, reprocessos, alerta_entrega_mencionado_em, numero_oc';

export async function carregarAlertasCompras() {
  const { data } = await supabase.from('pcp_pedidos_compra').select(CAMPOS_ALERTA)
    .in('status_compra', ['Pendente', 'Em Andamento', 'Aprovado', 'Comprado']);
  return calcularAlertasCompras(data || []);
}

// Menção de entrega atrasada: uma por ocorrência (a marcação é feita antes, de forma atômica)
export async function dispararMencoesEntrega(alertas: any[], user: any) {
  for (const a of alertas.filter(x => x.tipo === 'entrega' && !x.pedido.alerta_entrega_mencionado_em)) {
    const { data } = await supabase.from('pcp_pedidos_compra').update({ alerta_entrega_mencionado_em: new Date().toISOString() })
      .eq('id', a.pedido.id).is('alerta_entrega_mencionado_em', null).select('id');
    if (!data?.length) continue;
    await mencionarPerfis(['Compras', 'Almoxarifado'], a.pedido,
      `Entrega atrasada: a requisição ${a.pedido.numero_pedido}${a.pedido.numero_oc ? ` (${a.pedido.numero_oc})` : ''} — ${a.pedido.descricao_material || ''} — tinha entrega prevista para ${fmtData(a.pedido.data_prevista_recebimento)} e ainda não foi recebida. Registre a posição em Avisos.`,
      { id: '', nome: 'Sistema' }, 'entrega_atrasada');
  }
}

export async function registrarJustificativa(alerta: any, texto: string, user: any) {
  const p = alerta.pedido;
  if (alerta.tipo === 'entrega') {
    await registrarHistorico(p.id, { tipo: 'posicao_entrega', de: p.status_compra, para: p.status_compra, motivo: texto, dados: { prazo: p.data_prevista_recebimento, dias_atraso: alerta.dias } }, user);
    // próxima ocorrência volta a avisar se continuar atrasado
    await supabase.from('pcp_pedidos_compra').update({ alerta_entrega_mencionado_em: null }).eq('id', p.id);
  } else {
    await registrarHistorico(p.id, { tipo: 'parado', de: p.status_compra, para: p.status_compra, motivo: texto, dados: { horas_uteis_parado: Math.round(alerta.horas) } }, user);
  }
}

function CartaoAlerta({ alerta, currentUser, onRespondido, compacto = false }: any) {
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const p = alerta.pedido;
  const entrega = alerta.tipo === 'entrega';
  const salvar = async () => {
    if (!texto.trim()) { alert(entrega ? 'Informe a posição da entrega.' : 'Informe o motivo de estar parada.'); return; }
    setSalvando(true);
    await registrarJustificativa(alerta, texto.trim(), currentUser);
    setSalvando(false);
    setTexto('');
    onRespondido?.();
  };
  return (
    <div style={{ border: '1px solid var(--acn-line)', borderLeft: `3px solid ${entrega ? 'var(--acn-bad)' : 'var(--acn-warn)'}`, borderRadius: 8, padding: '8px 10px', background: 'var(--acn-surface)' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
        <strong className="acn-mono">{p.numero_pedido}</strong>
        <Selo familia={entrega ? 'erro' : 'atencao'}>{entrega ? `Entrega atrasada · ${alerta.dias} d` : `${p.status_compra} · parada há ${horasTexto(alerta.horas)} úteis`}</Selo>
        {p.reprocessos > 0 && <Selo familia="neutro" ponto={false}>Reprocesso nº {p.reprocessos}</Selo>}
      </div>
      <div style={{ fontSize: 12, marginTop: 4, color: 'var(--acn-text)', wordBreak: 'break-word' }}>{String(p.descricao_material || '').slice(0, 180)}</div>
      <div style={{ fontSize: 11, color: 'var(--acn-muted)', marginTop: 2 }}>
        {p.criado_por_nome ? `Solicitado por ${p.criado_por_nome}` : ''}{p.comprador_nome ? ` · Comprador: ${p.comprador_nome}` : ''}
        {entrega ? ` · Prazo: ${fmtData(p.data_prevista_recebimento)}${p.fornecedor ? ` · ${p.fornecedor}` : ''}` : ''}
      </div>
      <textarea className="acn-input" rows={compacto ? 2 : 2} style={{ width: '100%', marginTop: 6, resize: 'vertical' }}
        placeholder={entrega ? 'Posição: o que aconteceu com a entrega e qual a nova previsão *' : p.status_compra === 'Aprovado' ? 'Por que a compra ainda não foi efetivada? *' : 'Por que está parada? *'}
        value={texto} onChange={e => setTexto(e.target.value)} aria-label="Justificativa" />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
        <Botao pequeno variante="primario" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : entrega ? 'Registrar posição' : 'Registrar motivo'}</Botao>
      </div>
    </div>
  );
}

// Painel do botão "Avisos" para Compras (e entregas atrasadas para o Almoxarifado)
export function AlertasComprasPanel({ currentUser, onClose, onCountChange, onAbrirCompras, onAvisosOp, qtdAvisosOp = 0 }: any) {
  const [alertas, setAlertas] = useState<any[] | null>(null);
  const carregar = useCallback(async () => {
    const todos = await carregarAlertasCompras();
    const meus = alertasDoUsuario(todos, currentUser);
    setAlertas(meus);
    onCountChange?.(meus.length);
  }, [currentUser?.email, currentUser?.perfil]);
  useEffect(() => { carregar(); }, [carregar]);
  const parados = (alertas || []).filter(a => a.tipo === 'parado');
  const entregas = (alertas || []).filter(a => a.tipo === 'entrega');
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3100, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.35)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: 480, maxWidth: '100vw', height: '100%', background: 'var(--acn-canvas)', boxShadow: 'var(--acn-shadow-3)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', background: 'var(--acn-surface)', borderBottom: '1px solid var(--acn-line)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--acn-ink)' }}>Avisos de Compras</div>
            <div style={{ fontSize: 12, color: 'var(--acn-muted)' }}>{alertas === null ? 'Carregando…' : alertas.length ? `${alertas.length} requisição(ões) precisam de resposta` : 'Nada parado nem atrasado'}</div>
          </div>
          {onAvisosOp && <Botao pequeno variante="secundario" onClick={onAvisosOp}>Avisos de OP{qtdAvisosOp ? ` (${qtdAvisosOp})` : ''}</Botao>}
          {onAbrirCompras && <Botao pequeno variante="secundario" onClick={onAbrirCompras}>Abrir Compras</Botao>}
          <Botao pequeno variante="discreto" onClick={onClose} aria-label="Fechar">✕</Botao>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alertas !== null && alertas.length === 0 && (
            <div className="acn-empty" style={{ margin: 0 }}>
              Aqui aparecem as requisições paradas (Pendente e Em Andamento há 48h úteis, Aprovado há 24h úteis) e as compras com entrega atrasada.
            </div>
          )}
          {parados.length > 0 && <div className="acn-label" style={{ margin: '4px 0 0' }}>Paradas — motivo obrigatório</div>}
          {parados.map(a => <CartaoAlerta key={a.pedido.id + a.tipo} alerta={a} currentUser={currentUser} onRespondido={carregar} />)}
          {entregas.length > 0 && <div className="acn-label" style={{ margin: '8px 0 0' }}>Entregas atrasadas — posição</div>}
          {entregas.map(a => <CartaoAlerta key={a.pedido.id + a.tipo} alerta={a} currentUser={currentUser} onRespondido={carregar} />)}
        </div>
      </div>
    </div>
  );
}

// Janela obrigatória para Compras: requisições paradas precisam de motivo antes de seguir
export function JanelaParadasObrigatoria({ alertas, currentUser, onRespondido }: any) {
  const parados = alertas.filter((a: any) => a.tipo === 'parado');
  if (!parados.length) return null;
  return (
    <Janela titulo={`${parados.length} requisição(ões) de compra parada(s)`} largura={620} bloqueada
      subtitulo="Pendente e Em Andamento podem ficar até 48h úteis sem atualização; Aprovado, até 24h úteis. Informe o motivo de cada uma — a contagem volta a correr a partir do registro.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {parados.map((a: any) => <CartaoAlerta key={a.pedido.id} alerta={a} currentUser={currentUser} onRespondido={onRespondido} />)}
      </div>
    </Janela>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TODA DEMANDA DE COMPRA NASCE AQUI
//
// Decidido com o usuário em 21/09/2026: o Compras olha UM lugar só. Não existe
// mais lista de "demandas avulsas" do setor ao lado do quadro — qualquer
// pedido de compra, venha de uma OP, de outro setor ou de um pedido geral,
// entra como requisição, na coluna Pendente, com cotação, aprovação e OC
// disponíveis desde o começo.
//
// O que diferencia uma da outra é só o vínculo: requisição com OP vinculada é
// "Demanda de OP"; sem vínculo é "Demanda geral" (ver origemDaRequisicao).
// ─────────────────────────────────────────────────────────────────────────────
export function origemDaRequisicao(p: any) {
  // Reposição nasce sozinha quando o saldo de um item controlado bate no
  // mínimo (ver Estoque.tsx). Ganha selo próprio porque o Compras precisa
  // saber que ninguém digitou aquilo — foi o estoque que pediu (24/09/2026).
  if (p?.vinculo_tipo === 'estoque') {
    return { tipo: 'estoque' as const, label: 'Reposição de estoque', cor: '#0f766e',
      detalhe: p?.vinculo_descricao || '' };
  }
  const temOp = p?.vinculo_tipo === 'op' || p?.vinculo_tipo === 'opl' || !!String(p?.opl || '').trim();
  return temOp
    ? { tipo: 'op' as const, label: 'Demanda de OP', cor: '#7c3aed',
        detalhe: p?.vinculo_descricao || p?.opl || '' }
    : { tipo: 'geral' as const, label: 'Demanda geral', cor: '#64748b', detalhe: '' };
}

/** Cria a requisição de compra. Devolve { id, numero_pedido } ou { erro }. */
export async function criarRequisicaoCompra({
  titulo, descricao = '', itens = [], prioridade = '', prazo = null, observacoes = '',
  centro_custo = null, centro_custo_id = null, vinculo = null, opl = null,
  responsavel_nome = null, origemSetor = 'Demanda geral', demandaAvulsaId = null, currentUser,
}: any) {
  const agora = new Date().toISOString();
  const lista = (itens || []).filter((i: any) => String(i?.nome || '').trim());
  const linhas = lista.map((i: any) => `${i.quantidade || 1}× ${i.nome}${i.descricao ? ` (${i.descricao})` : ''}`).join('\n');
  const qtd = lista.reduce((s: number, i: any) => s + (Number(i.quantidade) || 0), 0);

  const { data, error } = await supabase.from('pcp_pedidos_compra').insert([{
    numero_pedido: `PC-${Date.now().toString(36).toUpperCase().slice(-6)}`,
    descricao_material: [String(titulo || '').trim(), String(descricao || '').trim(), linhas].filter(Boolean).join('\n'),
    quantidade: Math.max(1, Math.round(qtd) || 1),
    status_compra: 'Pendente',
    itens: lista,
    observacoes_compra: [prioridade ? `Prioridade: ${prioridade}` : '', observacoes].filter(Boolean).join('\n') || null,
    prazo_entrega: prazo ? String(prazo).slice(0, 10) : null,
    centro_custo, centro_custo_id,
    vinculo_tipo: vinculo?.tipo || null, vinculo_id: vinculo?.id || null, vinculo_descricao: vinculo?.descricao || null,
    opl: opl || (vinculo?.tipo === 'op' ? String(vinculo.descricao || '').split(' — ')[0] : null),
    comprador_nome: responsavel_nome || null,
    demanda_avulsa_id: demandaAvulsaId,
    // quem pediu recebe os avisos do andamento (aprovação, reprocesso, descarte)
    criado_por: currentUser?.email || null,
    criado_por_nome: currentUser?.nome || null,
    criado_por_setor: origemSetor,
    data_criacao: agora, data_solicitacao: agora,
  }]).select('id,numero_pedido').single();

  if (error) return { erro: error.message };
  return { id: data.id, numero_pedido: data.numero_pedido };
}
