// ─────────────────────────────────────────────────────────────────────────────
// Painel "Plataformas" do Admin — as plataformas de licitação (NEO, QFrotas, Prime…) com o desconto e a retenção que a Formação de Preços aplica sozinha
// quando a plataforma é escolhida (12e93, 27/11/2026). Saiu do AdminTab.tsx já no padrão do design system (`Botao`, `Faixa`, `Selo`, `confirmar`,
// `mostrarAviso`, a janela do guia, classes `acn-plat-*` do design.css, sem `style` solto).
//
// A regra é a de antes: tabela `plataformas_licitacao` (nome, desconto %, retenção %, ativa). A formação guarda só o `plataforma_id`; o desconto e a retenção são
// lidos da tabela a cada vez que a formação abre (só das plataformas ATIVAS), então mudar o percentual, desativar ou excluir uma plataforma mexe em TODAS as
// formações que a usam. Em 27/11/2026 havia 6 plataformas e 31 formações usando 3 delas (QFrotas 21, Maxi Frotas 9, NEO 1; QFrotas com 48% de desconto).
//
// Achados da 7.x que esta versão corrige (todos passavam em silêncio):
//  • leitura recusada virava "Nenhuma plataforma cadastrada": agora faixa vermelha com "Tentar de novo", e nada se grava enquanto a lista não é lida;
//  • salvar, excluir e ativar/desativar não olhavam o resultado (nem o erro): o banco responde "ok, 0 linhas" a uma gravação negada e a tela fechava o formulário como
//    se tivesse dado certo; os avisos saíam em `alert()`. Agora só se dá por feito o que o banco confirmou (a linha devolvida), a janela fica aberta com o que foi digitado se
//    o salvar falha, e o aviso diz o motivo em português;
//  • o clique duplo em "Salvar" criava duas plataformas iguais (a tabela só tem a chave do id, nada barra nome repetido): trava desde o primeiro clique (também em
//    desativar e excluir, que abria duas perguntas);
//  • nome repetido era aceito: agora recusa, sem diferenciar maiúscula nem acento (suposição a confirmar; os 6 nomes de hoje são todos diferentes);
//  • desconto e retenção aceitavam qualquer número digitado (150, −5): um desconto de 150% gera preço negativo na formação. Agora só de 0 a 100 (vazio vale 0, como antes);
//  • excluir, desativar e mudar o nome ou os percentuais de uma plataforma que formações usam não avisava ninguém: as formações passam a abrir SEM a plataforma (sem desconto
//    nem retenção) e salvar uma delas apaga a ligação; ou passam a calcular com o percentual novo. Agora a lista mostra em quantas formações cada plataforma é usada e a
//    pergunta antes de gravar diz quantas são (e, se não deu para contar, diz que não deu: nunca vale como "nenhuma"). Só pergunta; não barra (suposição a confirmar);
//  • a edição virou janela (antes o formulário ficava em cima da tabela e "Nova" ou ✏️ de outra linha trocava o que estava digitado sem avisar);
//  • duas leituras seguidas podiam terminar na ordem errada: só vale a última pedida.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { mdiClose, mdiPencilOutline, mdiPlus, mdiTrashCanOutline } from '@mdi/js';
import { supabase } from './supabaseClient';
import { explicarErroDoBanco } from './ErroDoBanco';
import { normalizarBusca } from './SearchUtils';
import { confirmar, mostrarAviso } from './Feedback';
import { Botao, Faixa, Selo } from './Interface';

const TABELA = 'plataformas_licitacao';
const formVazio = () => ({ nome: '', desconto_pct: '0', retencao_pct: '0' });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const numero = (v: any) => (v === '' || v == null ? 0 : Number(v));   // vazio vale 0, como sempre valeu
const pctValido = (v: any) => { const n = numero(v); return Number.isFinite(n) && n >= 0 && n <= 100; };
const pct = (v: any) => `${Number(v || 0).toFixed(2)}%`;

// quantas formações de preço usam cada plataforma: { id: n }; null = a leitura foi recusada (nunca vale como "nenhuma")
async function usoDasPlataformas() {
  try {
    const { data, error } = await supabase.from('cotacoes_precos').select('plataforma_id').not('plataforma_id', 'is', null);
    if (error) return null;
    const m: Record<string, number> = {};
    for (const r of data || []) m[r.plataforma_id] = (m[r.plataforma_id] || 0) + 1;
    return m;
  } catch { return null; }
}
// a contagem de UMA plataforma, lida na hora da pergunta (a da lista pode ter ficado velha): null = leitura recusada
async function usoDe(id: string) {
  try {
    const { data, error } = await supabase.from('cotacoes_precos').select('id').eq('plataforma_id', id);
    return error ? null : (data || []).length;
  } catch { return null; }
}
function fraseUso(n: number | null, o_que: string) {
  if (n === null) return 'Não foi possível conferir quantas formações de preço usam esta plataforma.';
  if (n === 0) return 'Nenhuma formação de preço usa esta plataforma.';
  return `${plural(n, 'formação de preço usa', 'formações de preço usam')} esta plataforma: ${o_que}`;
}

export function PainelPlataformas() {
  const [plataformas, setPlataformas] = useState<any[]>([]);
  const [uso, setUso] = useState<Record<string, number> | null>(null);
  const [erro, setErro] = useState('');
  const [lido, setLido] = useState(false);
  const [modal, setModal] = useState<any>(null);   // { mode: 'nova' | 'editar', p? }
  const [form, setForm] = useState<any>(formVazio());
  const [ocupado, setOcupado] = useState(false);
  const trava = useRef(false);   // vale desde o primeiro clique (o estado só chega no desenho seguinte)
  const pedido = useRef(0);

  const ler = useCallback(async () => {
    const meu = ++pedido.current;
    let r: any, u: any;
    try { [r, u] = await Promise.all([supabase.from(TABELA).select('*').order('nome'), usoDasPlataformas()]); } catch (e: any) { r = { error: e }; u = null; }
    if (meu !== pedido.current) return;   // chegou depois de uma leitura mais nova: não vale
    if (r.error) { setErro(explicarErroDoBanco(r.error)); setPlataformas([]); setUso(null); }
    else { setErro(''); setPlataformas(r.data || []); setUso(u); }
    setLido(true);
  }, []);
  useEffect(() => { ler(); }, [ler]);

  const travado = !!erro || !lido || ocupado;
  const abrirNova = () => { setForm(formVazio()); setModal({ mode: 'nova' }); };
  const abrirEditar = (p: any) => { setForm({ nome: p.nome, desconto_pct: String(p.desconto_pct ?? 0), retencao_pct: String(p.retencao_pct ?? 0) }); setModal({ mode: 'editar', p }); };
  const fechar = () => { setModal(null); setForm(formVazio()); };

  // roda uma gravação com a trava ligada desde o primeiro clique e relê a lista no fim, aconteça o que acontecer
  const comTrava = async (fn: () => Promise<void>) => {
    if (trava.current || erro || !lido) return;
    trava.current = true; setOcupado(true);
    try { await fn(); }
    catch (e: any) { mostrarAviso('Não foi possível concluir: ' + explicarErroDoBanco(e), 'erro'); }
    finally { await ler(); trava.current = false; setOcupado(false); }
  };

  const salvar = () => comTrava(async () => {
    if (!modal) return;
    const nome = (form.nome || '').trim();
    if (!nome) { mostrarAviso('Informe o nome da plataforma.', 'atencao'); return; }
    if (!pctValido(form.desconto_pct)) { mostrarAviso('O desconto precisa ser um número de 0 a 100.', 'atencao'); return; }
    if (!pctValido(form.retencao_pct)) { mostrarAviso('A retenção precisa ser um número de 0 a 100.', 'atencao'); return; }
    const igual = plataformas.find((x: any) => x.id !== modal.p?.id && normalizarBusca(x.nome) === normalizarBusca(nome));
    if (igual) { mostrarAviso(`Já existe uma plataforma chamada "${igual.nome}"${igual.ativo === false ? ' (inativa: reative-a em vez de criar outra)' : ''}. Use outro nome.`, 'erro'); return; }
    const payload = { nome, desconto_pct: numero(form.desconto_pct), retencao_pct: numero(form.retencao_pct) };
    if (modal.mode === 'editar') {
      const o = modal.p;
      const mudou = nome !== o.nome || payload.desconto_pct !== Number(o.desconto_pct || 0) || payload.retencao_pct !== Number(o.retencao_pct || 0);
      if (mudou) {
        const n = await usoDe(o.id);
        if (n === null || n > 0) {
          if (!await confirmar(`Mudar a plataforma "${o.nome}"?\n\n${fraseUso(n, 'elas passam a mostrar o nome e a calcular com o desconto e a retenção novos quando forem abertas (os valores não ficam gravados em cada formação).')}`)) return;   // a janela continua aberta, com o que foi digitado
        }
      }
    }
    const r = modal.mode === 'nova'
      ? await supabase.from(TABELA).insert([payload]).select('id')
      : await supabase.from(TABELA).update(payload).eq('id', modal.p.id).select('id');
    if (r.error || (r.data || []).length === 0) {
      mostrarAviso(`Não foi possível salvar a plataforma: ${r.error ? explicarErroDoBanco(r.error) : 'o banco não aplicou a mudança (a plataforma mudou ou você não tem permissão)'}.`, 'erro');
      return;   // a janela fica aberta, com o que foi digitado
    }
    mostrarAviso(modal.mode === 'nova' ? `Plataforma "${nome}" criada.` : `Plataforma "${nome}" atualizada.`, 'ok');
    fechar();
  });

  const excluir = (p: any) => comTrava(async () => {
    const n = await usoDe(p.id);
    if (!await confirmar(`Excluir a plataforma "${p.nome}"?\n\n${fraseUso(n, 'elas passam a abrir SEM a plataforma (sem desconto nem retenção) e salvar uma delas apaga a ligação.')}\nNão dá para desfazer.`)) return;
    const { error, data } = await supabase.from(TABELA).delete().eq('id', p.id).select('id');
    if (error || (data || []).length === 0) { mostrarAviso(`Não foi possível excluir a plataforma "${p.nome}": ${error ? explicarErroDoBanco(error) : 'o banco não aplicou a exclusão (você não tem permissão ou ela já não existe)'}.`, 'erro'); return; }
    mostrarAviso(`Plataforma "${p.nome}" excluída.`, 'ok');
  });

  const alternarAtivo = (p: any) => comTrava(async () => {
    const desativando = p.ativo !== false;
    if (desativando) {
      const n = await usoDe(p.id);
      if ((n === null || n > 0) && !await confirmar(`Desativar a plataforma "${p.nome}"?\n\n${fraseUso(n, 'elas passam a abrir SEM a plataforma (a lista da Formação de Preços só traz as ativas), sem desconto nem retenção, e salvar uma delas apaga a ligação. Reativar volta a oferecê-la.')}`)) return;
    }
    const { error, data } = await supabase.from(TABELA).update({ ativo: !desativando }).eq('id', p.id).select('id');
    if (error || (data || []).length === 0) { mostrarAviso(`Não foi possível ${desativando ? 'desativar' : 'ativar'} a plataforma "${p.nome}": ${error ? explicarErroDoBanco(error) : 'o banco não aplicou a mudança (você não tem permissão ou ela já não existe)'}.`, 'erro'); return; }
    mostrarAviso(`Plataforma "${p.nome}" ${desativando ? 'desativada' : 'ativada'}.`, 'ok');
  });

  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));

  return (
    <div className="sec-card acn-plat">
      <div className="sec-hdr no-collapse"><span>🏪 Plataformas de Licitação{lido && !erro ? ` (${plataformas.length})` : ''}</span></div>
      <div className="sec-body">
        <Faixa tom="info">
          Plataformas homologadas pelos órgãos públicos para gestão de contratação (NEO, QFrotas, Prime...). O desconto e a retenção são aplicados automaticamente na Formação de Preços quando a plataforma é selecionada. Mudar, desativar ou excluir uma plataforma vale para <strong>todas as formações que a usam</strong>: a coluna "Formações" diz quantas são.
        </Faixa>
        {erro && (
          <Faixa tom="erro" acao={<Botao pequeno onClick={ler}>Tentar de novo</Botao>}>
            Não foi possível ler as plataformas ({erro}). Isso não quer dizer que não haja nenhuma cadastrada. Enquanto não forem lidas, não dá para criar, editar, ativar nem excluir.
          </Faixa>
        )}
        {lido && !erro && uso === null && (
          <Faixa tom="atencao">Não foi possível contar em quantas formações de preço cada plataforma é usada. A coluna "Formações" fica em branco e as perguntas ao mudar, desativar ou excluir avisam que não deu para conferir.</Faixa>
        )}
        <div className="acn-plat-barra">
          <Botao variante="primario" pequeno icone={mdiPlus} disabled={travado} onClick={abrirNova}>Nova Plataforma</Botao>
        </div>

        {!lido ? <div className="acn-empty">Carregando…</div> : erro ? null : plataformas.length === 0 ? (
          <div className="acn-empty">Nenhuma plataforma cadastrada. Clique em <strong>Nova Plataforma</strong> para começar.</div>
        ) : (
          <div className="acn-rolagem">
            <table className="acn-tabela">
              <thead><tr>
                <th>Plataforma</th>
                <th className="acn-plat-c">Desconto</th>
                <th className="acn-plat-c">Retenção</th>
                <th className="acn-plat-c">Formações</th>
                <th className="acn-plat-c">Status</th>
                <th>Ações</th>
              </tr></thead>
              <tbody>
                {plataformas.map((p: any) => {
                  const ativa = p.ativo !== false;
                  return (
                    <tr key={p.id} className={ativa ? '' : 'acn-plat-inativa'}>
                      <td className="acn-forte">{p.nome}</td>
                      <td className="acn-plat-c acn-plat-desc">{pct(p.desconto_pct)}</td>
                      <td className="acn-plat-c acn-plat-ret">{pct(p.retencao_pct)}</td>
                      <td className="acn-plat-c">{uso === null ? '—' : (uso[p.id] || 0)}</td>
                      <td className="acn-plat-c"><Selo familia={ativa ? 'ok' : 'neutro'} ponto={false}>{ativa ? 'Ativa' : 'Inativa'}</Selo></td>
                      <td>
                        <div className="acn-plat-acoes">
                          <Botao pequeno disabled={travado} onClick={() => alternarAtivo(p)}>{ativa ? 'Desativar' : 'Ativar'}</Botao>
                          <Botao pequeno variante="discreto" icone={mdiPencilOutline} disabled={travado} aria-label={`Editar ${p.nome}`} title="Editar" onClick={() => abrirEditar(p)} />
                          <Botao pequeno variante="perigo-sec" icone={mdiTrashCanOutline} disabled={travado} aria-label={`Excluir ${p.nome}`} title="Excluir" onClick={() => excluir(p)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-plat-jan" role="dialog" aria-modal="true" aria-label={modal.mode === 'nova' ? 'Nova plataforma' : `Editar plataforma ${modal.p.nome}`}>
            <div className="acn-modal-cab">
              <span className="modal-title">{modal.mode === 'nova' ? 'Nova plataforma' : `Editar plataforma — ${modal.p.nome}`}</span>
              <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" disabled={ocupado} onClick={fechar} />
            </div>
            <div className="acn-modal-corpo">
              <div className="acn-form-cheio acn-plat-campos">
                <div className="form-group acn-plat-nome">
                  <label className="acn-label" htmlFor="acn-plat-nome">Nome da Plataforma *</label>
                  <input id="acn-plat-nome" className="acn-input" placeholder="Ex: NEO, QFrotas, Prime" value={form.nome} autoFocus onChange={e => set({ nome: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="acn-label" htmlFor="acn-plat-desc">Desconto (%)</label>
                  <input id="acn-plat-desc" className="acn-input" type="number" min={0} max={100} step={0.01} value={form.desconto_pct} onChange={e => set({ desconto_pct: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="acn-label" htmlFor="acn-plat-ret">Retenção (%)</label>
                  <input id="acn-plat-ret" className="acn-input" type="number" min={0} max={100} step={0.01} value={form.retencao_pct} onChange={e => set({ retencao_pct: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="acn-modal-rodape">
              <Botao variante="secundario" disabled={ocupado} onClick={fechar}>Cancelar</Botao>
              <Botao variante="primario" disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando…' : 'Salvar plataforma'}</Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
