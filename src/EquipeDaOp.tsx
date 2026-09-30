// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// EQUIPE DA OP — quem trabalhou na adaptação e na serralheria (30/09/2026)
//
// Pedido do usuário: o apontamento de quem trabalhou em cada OP vem do gerente da produção, mas
// precisa poder ser corrigido em qualquer etapa, ATÉ O FISCAL FATURAR — porque a comissão dos
// técnicos é calculada em cima dele quando a OP é faturada (RHTab.tsx): mão de obra de adaptação
// para quem trabalhou na adaptação e mão de obra de serralheria para quem trabalhou na serralheria.
//
// Antes, o botão "Equipe" só existia dentro da Produção e só enquanto a OP estava em produção ou
// retrabalho. Passou disso, não havia onde corrigir — e uma OP sem ninguém apontado sai da comissão
// sem aviso nenhum.
//
// A lista mora em `responsaveis_producao`, a mesma fonte da comissão. `papel` é texto livre e ganhou
// um valor: 'responsavel' e 'apoio' (adaptação, como sempre) e 'serralheria' (quem trabalhou na
// serralheria). Nenhuma coluna nova, nenhuma linha antiga mexida.
//
// Regras fechadas com o usuário em 30/09/2026:
//   • edita Admin, qualquer "Gerente ..." e quem tem a aba Adaptação (podeEditarEquipeDaOp);
//   • pode até o Fiscal marcar "Faturado" — depois disso trava para todos, inclusive Admin, porque a
//     comissão fechada em cima daquela equipe não pode mudar de baixo dela;
//   • nada é apagado em silêncio: cada troca vira linha no histórico da OP, com quem mexeu.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { mdiTrashCanOutline, mdiPlus, mdiPencilOutline } from '@mdi/js';
import { supabase } from './supabaseClient';
import { Botao, Faixa, Selo } from './Interface';
import { confirmar } from './Feedback';
import { ColaboradorSelect, useColaboradores } from './ColaboradorSelect';
import { podeEditarEquipeDaOp } from './utils/permissoes';

export const PAPEIS_EQUIPE = [
  { papel: 'responsavel', titulo: 'Adaptação — responsáveis', rotulo: 'Responsável', setorLog: 'Producao',
    placeholder: 'Adicionar responsável...',
    ajuda: 'Recebem a comissão pelo percentual e pela base cadastrados no RH.' },
  { papel: 'apoio', titulo: 'Adaptação — apoios', rotulo: 'Apoio', setorLog: 'Producao',
    placeholder: 'Adicionar apoio...',
    ajuda: 'Recebem 0,1% fixo da mão de obra de adaptação da OP, além do que os responsáveis recebem.' },
  { papel: 'serralheria', titulo: 'Serralheria — quem trabalhou', rotulo: 'Serralheria', setorLog: 'Serralheria',
    placeholder: 'Adicionar quem trabalhou na serralheria...',
    ajuda: 'Recebem o percentual cadastrado no RH em cima da mão de obra de serralheria da OP.' },
];

/** OP que o Fiscal já faturou: a equipe fecha aqui, porque a comissão sai em cima dela. */
export function equipeTravada(opl) {
  return !!opl?.data_emissao_nf || /^(faturado|entregue)/i.test(String(opl?.status_geral || ''));
}

const diaBR = (d) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
const lerUsuario = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };

// Unidades do mesmo lote (BASE/01, BASE/02...). Mesma regra do detalhe da OP (AcnTabShared.tsx), repetida
// aqui porque aquele arquivo importa este e um importando o outro não fecha.
const baseDoLote = (n) => String(n || '').trim().replace(/\/\d+$/, '');
const escLike = (v) => v.replace(/[\\%_]/g, m => '\\' + m);
async function unidadesDoLote(numero) {
  const base = baseDoLote(numero);
  if (!base) return [];
  const { data } = await supabase.from('oples').select('id,opl,status_geral,data_emissao_nf')
    .like('opl', escLike(base) + '/%');
  return (data || []).filter(o => /^\/\d+$/.test(String(o.opl).slice(base.length)))
    .sort((a, b) => String(a.opl).localeCompare(String(b.opl), 'pt-BR', { numeric: true }));
}

const COLUNAS_OP = 'id,opl,status_geral,data_emissao_nf,valor_mao_de_obra,valor_mao_de_obra_serralheria';

export async function carregarEquipeDaOp(oplId) {
  const [{ data: op }, { data: linhas }] = await Promise.all([
    supabase.from('oples').select(COLUNAS_OP).eq('id', oplId).maybeSingle(),
    supabase.from('responsaveis_producao').select('*').eq('tipo', 'op').eq('referencia_id', oplId).order('criado_em'),
  ]);
  return { op, linhas: linhas || [] };
}

/** Por OP: quantas pessoas há em cada papel. Serve à tela do Fiscal, que avisa antes de faturar. */
export async function situacaoDaEquipe(ids) {
  if (!ids?.length) return {};
  const { data } = await supabase.from('responsaveis_producao').select('referencia_id,papel')
    .eq('tipo', 'op').in('referencia_id', ids);
  const mapa = {};
  (data || []).forEach(r => {
    const s = (mapa[r.referencia_id] ||= { responsavel: 0, apoio: 0, serralheria: 0 });
    if (s[r.papel] != null) s[r.papel]++;
  });
  return mapa;
}

/** A OP tem mão de obra lançada e ninguém apontado para recebê-la? Então não sai comissão. */
export function faltaApontar(op, situacao) {
  const s = situacao || {};
  const adaptacao = Number(op?.valor_mao_de_obra) > 0 && !(s.responsavel > 0);
  const serralheria = Number(op?.valor_mao_de_obra_serralheria) > 0 && !(s.serralheria > 0);
  return { adaptacao, serralheria, algum: adaptacao || serralheria };
}

// ─────────────────────────────────────────────────────────────────────────────
// A janela
// ─────────────────────────────────────────────────────────────────────────────
export function EquipeDaOpModal({ opl: oplProp, currentUser, aoFechar, aoMudar }) {
  const usuario = currentUser || lerUsuario();
  const { list: colaboradores } = useColaboradores();
  const [op, setOp] = useState(null);
  const [linhas, setLinhas] = useState([]);
  const [cadastroRh, setCadastroRh] = useState({});
  const [unidades, setUnidades] = useState([]);
  const [valeParaLote, setValeParaLote] = useState(false);
  const [novo, setNovo] = useState({ responsavel: '', apoio: '', serralheria: '' });
  const [ocupado, setOcupado] = useState(false);

  const carregar = async () => {
    const { op: o, linhas: l } = await carregarEquipeDaOp(oplProp.id);
    setOp(o); setLinhas(l);
    const ids = [...new Set(l.map(x => x.tecnico_id).filter(Boolean))];
    if (!ids.length) { setCadastroRh({}); return; }
    const { data } = await supabase.from('rh_funcionarios').select('id,percentual_comissao').in('id', ids);
    setCadastroRh(Object.fromEntries((data || []).map(f => [f.id, f])));
  };
  useEffect(() => { carregar(); }, [oplProp?.id]);
  useEffect(() => { unidadesDoLote(oplProp?.opl).then(setUnidades); }, [oplProp?.opl]);

  const travada = equipeTravada(op);
  const temPermissao = podeEditarEquipeDaOp(usuario);
  const pode = temPermissao && !travada && !!op;
  const livresDoLote = unidades.filter(u => !equipeTravada(u));
  const temLote = unidades.length > 1;
  const falta = faltaApontar(op, {
    responsavel: linhas.filter(l => l.papel === 'responsavel').length,
    serralheria: linhas.filter(l => l.papel === 'serralheria').length,
  });

  // As OPs que a troca atinge: só esta, ou as unidades do lote. Lê o banco AGORA e deixa de fora a que
  // foi faturada entre a janela abrir e o clique — a trava vale no momento de gravar, não de abrir.
  const alvos = async () => {
    const ids = valeParaLote && temLote ? unidades.map(u => u.id) : [op.id];
    const { data } = await supabase.from('oples').select('id,opl,status_geral,data_emissao_nf').in('id', ids);
    return (data || []).filter(o => !equipeTravada(o));
  };

  const registrarNoHistorico = (lista, evento, setor) => lista.length
    ? supabase.from('logs_movimentacao_opl').insert(lista.map(o => ({
        opl_id: o.id, numero_opl: o.opl, setor, evento,
        status_anterior: o.status_geral, status_novo: o.status_geral,
        usuario_nome: usuario?.nome || '—', usuario_email: usuario?.email || null,
        data_hora: new Date().toISOString(),
      })))
    : Promise.resolve();

  const adicionar = async (p) => {
    const nome = novo[p.papel];
    if (!nome) { alert('Selecione uma pessoa.'); return; }
    const col = colaboradores.find(c => c.nome === nome);
    if (!col?.id) { alert(`"${nome}" não está no cadastro de funcionários do RH — sem cadastro não dá para calcular a comissão.`); return; }
    setOcupado(true);
    try {
      const lista = await alvos();
      if (!lista.length) { alert('Esta OP já foi faturada: a equipe não pode mais ser alterada.'); await carregar(); return; }
      const { data: jaTem } = await supabase.from('responsaveis_producao').select('referencia_id')
        .eq('tipo', 'op').eq('papel', p.papel).eq('tecnico_id', col.id).in('referencia_id', lista.map(o => o.id));
      const tem = new Set((jaTem || []).map(x => x.referencia_id));
      const faltam = lista.filter(o => !tem.has(o.id));
      if (!faltam.length) { alert(`${col.nome} já está ${lista.length > 1 ? 'em todas as unidades' : 'nesta lista'}.`); return; }
      const { data: gravadas, error } = await supabase.from('responsaveis_producao').insert(faltam.map(o => ({
        tipo: 'op', referencia_id: o.id, papel: p.papel, tecnico_id: col.id, tecnico_nome: col.nome,
        adicionado_por: usuario?.email || null, adicionado_por_nome: usuario?.nome || null,
      }))).select('id,referencia_id');
      if (error) { alert('Não foi possível gravar: ' + error.message); return; }
      const feitas = new Set((gravadas || []).map(g => g.referencia_id));
      await registrarNoHistorico(faltam.filter(o => feitas.has(o.id)), `${p.rotulo} adicionado: ${col.nome}`, p.setorLog);
      setNovo(n => ({ ...n, [p.papel]: '' }));
      await carregar(); aoMudar?.();
      if (feitas.size > 1) alert(`${col.nome} entrou em ${feitas.size} unidades do lote.`);
    } finally { setOcupado(false); }
  };

  const remover = async (m) => {
    const p = PAPEIS_EQUIPE.find(x => x.papel === m.papel);
    const noLote = valeParaLote && temLote;
    if (!await confirmar(`Remover ${m.tecnico_nome} (${p?.rotulo || m.papel}) ${noLote ? 'desta OP e das outras unidades do lote ainda não faturadas' : 'desta OP'}?`)) return;
    setOcupado(true);
    try {
      const lista = await alvos();
      if (!lista.length) { alert('Esta OP já foi faturada: a equipe não pode mais ser alterada.'); await carregar(); return; }
      let q = supabase.from('responsaveis_producao').delete().eq('tipo', 'op').eq('papel', m.papel)
        .in('referencia_id', lista.map(o => o.id));
      q = m.tecnico_id ? q.eq('tecnico_id', m.tecnico_id) : q.eq('tecnico_nome', m.tecnico_nome);
      const { data: apagadas, error } = await q.select('id,referencia_id');
      if (error) { alert('Não foi possível remover: ' + error.message); return; }
      const feitas = new Set((apagadas || []).map(g => g.referencia_id));
      await registrarNoHistorico(lista.filter(o => feitas.has(o.id)), `${p?.rotulo || m.papel} removido: ${m.tecnico_nome}`, p?.setorLog || 'Producao');
      await carregar(); aoMudar?.();
      if (feitas.size > 1) alert(`${m.tecnico_nome} saiu de ${feitas.size} unidades do lote.`);
    } finally { setOcupado(false); }
  };

  return (
    <div className="modal-overlay" onClick={() => !ocupado && aoFechar?.()}>
      <div className="modal-box" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">👥 Equipe — OP {oplProp?.opl}</div>
        <div className="acn-equipe-ajuda">
          Quem trabalhou nesta OP. A comissão de cada um sai daqui quando o Fiscal fatura.
        </div>

        {!op && <div className="acn-empty">Carregando...</div>}
        {op && travada && (
          <Faixa tom="atencao">
            Esta OP já foi faturada{op.data_emissao_nf ? ` em ${diaBR(op.data_emissao_nf)}` : ''}. A equipe ficou
            travada, porque a comissão é calculada em cima dela.
          </Faixa>
        )}
        {op && !temPermissao && !travada && (
          <Faixa tom="info">Só Admin, gerentes e quem tem a aba Adaptação corrigem a equipe.</Faixa>
        )}
        {op && !travada && falta.adaptacao && (
          <Faixa tom="atencao">Esta OP tem mão de obra de adaptação lançada e nenhum responsável apontado. Sem isso não sai comissão.</Faixa>
        )}
        {op && !travada && falta.serralheria && (
          <Faixa tom="atencao">Esta OP tem mão de obra de serralheria lançada e ninguém apontado na serralheria. Sem isso não sai comissão.</Faixa>
        )}

        {op && PAPEIS_EQUIPE.map(p => {
          const membros = linhas.filter(l => l.papel === p.papel);
          return (
            <div key={p.papel} data-equipe={p.papel}>
              <div className="acn-equipe-titulo">{p.titulo}</div>
              <div className="acn-equipe-ajuda">{p.ajuda}</div>
              {membros.length === 0
                ? <div className="acn-equipe-vazio">Ninguém apontado.</div>
                : membros.map(m => {
                    // apoio recebe 0,1% fixo, então o percentual do cadastro não importa para ele
                    const semPercentual = p.papel !== 'apoio' && !(Number(cadastroRh[m.tecnico_id]?.percentual_comissao) > 0);
                    return (
                      <div key={m.id} className="acn-equipe-linha">
                        <span>
                          {m.tecnico_nome}{' '}
                          {semPercentual && (
                            <Selo familia="atencao" ponto={false}
                              title="No cadastro do RH esta pessoa não tem percentual de comissão: a comissão dela sai zerada.">
                              sem percentual no RH
                            </Selo>
                          )}
                        </span>
                        {pode && (
                          <Botao pequeno variante="discreto" icone={mdiTrashCanOutline} disabled={ocupado}
                            aria-label={`Remover ${m.tecnico_nome}`} title="Remover" onClick={() => remover(m)} />
                        )}
                      </div>
                    );
                  })}
              {pode && (
                <div className="acn-equipe-add">
                  <ColaboradorSelect value={novo[p.papel]} placeholder={p.placeholder} className="acn-input" style={{ flex: 1 }}
                    onChange={nome => setNovo(n => ({ ...n, [p.papel]: nome }))} />
                  <Botao pequeno variante="secundario" icone={mdiPlus} disabled={ocupado || !novo[p.papel]}
                    onClick={() => adicionar(p)}>Adicionar</Botao>
                </div>
              )}
            </div>
          );
        })}

        {pode && temLote && (
          <label className="acn-equipe-lote">
            <input type="checkbox" checked={valeParaLote} onChange={e => setValeParaLote(e.target.checked)} />
            <span>
              Valer para as <strong>{livresDoLote.length}</strong> unidades deste lote que ainda não foram faturadas
              (adicionar e remover).
              {valeParaLote && <em> Marcado: cada alteração vale para todas elas.</em>}
            </span>
          </label>
        )}

        <div style={{ marginTop: 16 }}>
          <Botao variante="secundario" style={{ width: '100%' }} onClick={aoFechar} disabled={ocupado}>Fechar</Botao>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// O resumo que o detalhe da OP mostra (quem trabalhou) + o botão que abre a janela
// ─────────────────────────────────────────────────────────────────────────────
export function EquipeDaOpResumo({ opl, currentUser }) {
  const usuario = currentUser || lerUsuario();
  const [dados, setDados] = useState(null);
  const [abrindo, setAbrindo] = useState(false);
  const recarregar = async () => { if (opl?.id) setDados(await carregarEquipeDaOp(opl.id)); };
  useEffect(() => { recarregar(); }, [opl?.id]);

  if (!dados) return null;
  const nomes = (papel) => dados.linhas.filter(l => l.papel === papel).map(l => l.tecnico_nome);
  const travada = equipeTravada(dados.op || opl);
  const podeEditar = podeEditarEquipeDaOp(usuario) && !travada;
  const coluna = (titulo, lista) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>{titulo}</div>
      <div style={{ fontSize: 12, color: '#1e293b', fontWeight: 600 }}>{lista.length ? lista.join(', ') : '—'}</div>
    </div>
  );
  return (
    <div data-equipe-resumo>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
        {coluna('Adaptação — responsáveis', nomes('responsavel'))}
        {coluna('Adaptação — apoios', nomes('apoio'))}
        {coluna('Serralheria', nomes('serralheria'))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {podeEditar && (
          <Botao pequeno variante="secundario" icone={mdiPencilOutline} onClick={() => setAbrindo(true)}>Editar equipe</Botao>
        )}
        {travada && (
          <span style={{ fontSize: 10, color: '#94a3b8' }}>Equipe travada: a OP já foi faturada.</span>
        )}
      </div>
      {abrindo && (
        <EquipeDaOpModal opl={opl} currentUser={usuario} aoFechar={() => { setAbrindo(false); recarregar(); }} aoMudar={recarregar} />
      )}
    </div>
  );
}
