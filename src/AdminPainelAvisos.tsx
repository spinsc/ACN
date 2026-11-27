// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// Painel "Avisos" do Admin — os avisos do sistema que aparecem no 📌 de todo mundo (12e92, 27/11/2026). Saiu do AdminTab.tsx já no padrão do design system
// (`Botao`, `Faixa`, `Selo`, `Chips`, `confirmar`, `mostrarAviso`, classes `acn-avsa-*` do design.css, sem `style` solto) e reaproveita os cartões `acn-avs-*`
// do quadro flutuante (AvisoSistemaWidget), para o aviso ter a mesma cara aqui e lá.
//
// A regra é a de antes (decidida em 02/10/2026): só o Admin publica; editar, desativar e excluir só o autor do aviso ou quem tem a marca DEV (`podeMexerNoAviso`).
// Aviso expira em `data_expiracao` (ou fica "permanente"); "ativo" é a chave de ligar e desligar.
//
// Achados da 7.x que esta versão corrige (todos passavam em silêncio):
//  • leitura recusada virava "Nenhum aviso encontrado" (e a lista sumia): agora faixa vermelha com o motivo e "Tentar de novo";
//  • publicar, editar, desativar e excluir não olhavam a linha devolvida: o banco responde "ok, 0 linhas" a uma gravação negada e a tela seguia como se tivesse dado
//    certo, limpando o que foi digitado; os erros saíam em `alert()` com o texto cru do banco. Agora só se dá por feito o que o banco confirmou, o formulário guarda
//    o que foi digitado quando falha e o aviso diz o motivo em português;
//  • o clique duplo em "Publicar" publicava o mesmo aviso duas vezes, para a empresa toda (a trava vinha do estado, que só chega no desenho seguinte): trava desde o primeiro clique;
//  • "Válido até" no passado publicava um aviso que já nascia expirado e ninguém via: agora pergunta antes;
//  • excluir o aviso que está aberto para edição deixava o formulário apontando para uma linha que não existe mais (o "Atualizar" seguinte dava "certo" sem gravar nada): o formulário volta ao vazio;
//  • clicar em ✏️ de outro aviso (ou editar com um aviso novo meio escrito) trocava o formulário sem avisar e a pessoa perdia o que digitou: agora pergunta antes de descartar;
//  • o aviso sem prazo e sem a marca "permanente" aparecia na lista sem nenhuma indicação de validade, como se fosse temporário: agora diz "Sem data de validade";
//  • o formulário não aparecia perto do aviso editado no celular (lista abaixo do formulário): a tela leva o formulário à vista ao clicar em editar;
//  • duas leituras seguidas podiam terminar na ordem errada: só vale a última pedida.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { mdiClose, mdiPause, mdiPencilOutline, mdiPlay, mdiTrashCanOutline } from '@mdi/js';
import { supabase } from './supabaseClient';
import { explicarErroDoBanco } from './ErroDoBanco';
import { confirmar } from './Feedback';
import { Botao, Chips, Faixa, Selo } from './Interface';
import Linkify from './Linkify';
import { podeMexerNoAviso, podePublicarAviso } from './utils/permissoes';
// 12e93 (27/11/2026): as regras e a gravação saíram daqui para os módulos que o quadro flutuante 📌 também usa (o formulário, a validade, as perguntas, as frases, a trava
// do clique duplo e a conferência da linha devolvida), para as duas telas não divergirem de novo.
import {
  CRITICIDADES, FORM_AVISO_VAZIO as VAZIO, PERGUNTA_DESCARTAR_ALTERACAO, criadoEmLabel, faltaTextoNoAviso, formDoAviso, mesmoFormAviso, perguntaDescartarAoAbrir,
} from './AvisosRegras';
import { TABELA_AVISOS as TABELA, alternarAtivoDoAviso, excluirAviso, salvarAviso, useGravacaoTravada } from './AvisosGravacao';

const lerUsuario = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };

export function PainelAvisos() {
  const currentUser = lerUsuario();
  const podeGerenciar = podePublicarAviso(currentUser);

  const [avisos, setAvisos] = useState<any[]>([]);
  const [erro, setErro] = useState('');
  const [lido, setLido] = useState(false);
  const [form, setForm] = useState<any>({ ...VAZIO });
  const [original, setOriginal] = useState<any>({ ...VAZIO });   // o que o formulário tinha ao abrir: serve para saber se há algo digitado a perder
  const [editId, setEditId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'ativos' | 'expirados'>('ativos');
  const pedido = useRef(0);
  const cartaoForm = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    const meu = ++pedido.current;
    let r: any;
    try { r = await supabase.from(TABELA).select('*').order('criado_em', { ascending: false }); } catch (e: any) { r = { error: e }; }
    if (meu !== pedido.current) return;   // chegou depois de uma leitura mais nova: não vale
    if (r.error) { setErro(explicarErroDoBanco(r.error)); setAvisos([]); }
    else { setErro(''); setAvisos(r.data || []); }
    setLido(true);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const { comTrava, ocupado, trava } = useGravacaoTravada(carregar);   // a trava vale desde o primeiro clique; a lista é relida no fim, aconteça o que acontecer
  const sujo = !mesmoFormAviso(form, original);
  const zerarForm = () => { setEditId(null); setForm({ ...VAZIO }); setOriginal({ ...VAZIO }); };

  const salvar = () => comTrava(async () => { if (await salvarAviso({ form, editId, avisos, usuario: currentUser })) zerarForm(); });   // falhou: o formulário fica como está, com o que foi digitado

  const excluir = (av: any) => comTrava(async () => {
    if (await excluirAviso({ av, usuario: currentUser }) && editId === av.id) zerarForm();   // o formulário apontava para uma linha que acabou de sair
  });

  const alternarAtivo = (av: any) => comTrava(async () => { await alternarAtivoDoAviso({ av, usuario: currentUser }); });

  const iniciarEdicao = async (av: any) => {
    if (trava.current || !podeMexerNoAviso(currentUser, av) || editId === av.id) return;
    if (sujo && !await confirmar(perguntaDescartarAoAbrir(!!editId))) return;
    const f = formDoAviso(av);
    setEditId(av.id); setForm(f); setOriginal(f);
    cartaoForm.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });   // no celular a lista fica abaixo do formulário
  };
  const cancelarEdicao = async () => {
    if (trava.current) return;
    if (sujo && !await confirmar(PERGUNTA_DESCARTAR_ALTERACAO)) return;
    zerarForm();
  };

  const agora = new Date();
  const expirado = (av: any) => !av.permanente && !!av.data_expiracao && new Date(av.data_expiracao) <= agora;
  const ehAtivo = (av: any) => av.ativo && !expirado(av);
  const visiveis = avisos.filter(av => filtro === 'ativos' ? ehAtivo(av) : filtro === 'expirados' ? !ehAtivo(av) : true);
  const faltaTexto = faltaTextoNoAviso(form);
  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));

  return (
    <div className={'acn-avsa' + (podeGerenciar ? '' : ' so-lista')}>
      {/* ── FORMULÁRIO ── */}
      {podeGerenciar && (
        <div className="sec-card" ref={cartaoForm}>
          <div className="sec-hdr no-collapse"><span>{editId ? '✏️ Editar aviso' : '+ Novo aviso'}</span></div>
          <div className="sec-body acn-avsa-form">
            <div className="form-group">
              <label className="acn-label" htmlFor="acn-avsa-titulo">Título *</label>
              <input id="acn-avsa-titulo" className="acn-input" value={form.titulo} placeholder="Ex: Reunião amanhã às 9h" onChange={e => set({ titulo: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="acn-label" htmlFor="acn-avsa-msg">Mensagem *</label>
              <textarea id="acn-avsa-msg" className="acn-input" rows={4} value={form.mensagem} placeholder="Texto completo do aviso..." onChange={e => set({ mensagem: e.target.value })} />
            </div>
            <div className="acn-avsa-par">
              <div className="form-group">
                <label className="acn-label" htmlFor="acn-avsa-tipo">Origem</label>
                <select id="acn-avsa-tipo" className="acn-input" value={form.tipo} onChange={e => set({ tipo: e.target.value })}>
                  <option value="admin">Admin</option>
                  <option value="diretoria">Diretoria</option>
                </select>
              </div>
              <div className="form-group">
                <label className="acn-label" htmlFor="acn-avsa-crit">Criticidade</label>
                <select id="acn-avsa-crit" className="acn-input" value={form.criticidade} onChange={e => set({ criticidade: e.target.value })}>
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                </select>
              </div>
            </div>
            <label className="acn-check">
              <input type="checkbox" checked={!!form.permanente} onChange={e => set({ permanente: e.target.checked, data_expiracao: '' })} />
              <span>📌 Manter permanentemente</span>
            </label>
            {!form.permanente && (
              <div className="form-group">
                <label className="acn-label" htmlFor="acn-avsa-ate">Válido até</label>
                <input id="acn-avsa-ate" className="acn-input" type="datetime-local" value={form.data_expiracao} onChange={e => set({ data_expiracao: e.target.value })} />
              </div>
            )}
            <div className="acn-avsa-botoes">
              <Botao variante="primario" disabled={ocupado || faltaTexto} onClick={salvar}>
                {ocupado ? 'Salvando…' : editId ? 'Atualizar' : 'Publicar'}
              </Botao>
              {editId && <Botao icone={mdiClose} disabled={ocupado} onClick={cancelarEdicao}>Cancelar edição</Botao>}
            </div>
          </div>
        </div>
      )}

      {/* ── LISTA ── */}
      <div className="acn-avsa-lista">
        <Chips rotulo="Mostrar avisos" ativo={filtro} onChange={(f: any) => setFiltro(f)}
          itens={[
            { id: 'ativos', rotulo: 'Ativos', contagem: lido && !erro ? avisos.filter(ehAtivo).length : undefined },
            { id: 'todos', rotulo: 'Todos', contagem: lido && !erro ? avisos.length : undefined },
            { id: 'expirados', rotulo: 'Expirados ou desativados', contagem: lido && !erro ? avisos.filter(a => !ehAtivo(a)).length : undefined },
          ]} />

        {erro && (
          <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>
            Não foi possível ler os avisos ({erro}). Isso não quer dizer que não haja nenhum publicado.
          </Faixa>
        )}

        {!lido ? <div className="acn-empty">Carregando…</div>
          : erro ? null
          : visiveis.length === 0 ? <div className="acn-empty">Nenhum aviso encontrado.</div>
          : (
            <div className="acn-avsa-itens">
              {visiveis.map(av => {
                const crit = CRITICIDADES.includes(av.criticidade) ? av.criticidade : 'media';
                const venceu = expirado(av);
                const meu = podeMexerNoAviso(currentUser, av);
                return (
                  <div key={av.id} className={'acn-avs-item acn-avsa-item' + (venceu || !av.ativo ? ' apagado' : '')} data-crit={crit}>
                    <div className="acn-avs-item-cab">
                      <span className="acn-avs-item-tit">{av.titulo}</span>
                      <div className="acn-avs-tags">
                        <span className="acn-avs-tag">{av.tipo === 'diretoria' ? '🏢 Diretoria' : '👮 Admin'}</span>
                        <span className="acn-avs-crit" data-crit={crit}>{crit}</span>
                        {!av.ativo && <Selo familia="neutro" ponto={false}>inativo</Selo>}
                        {venceu && <Selo familia="erro" ponto={false}>expirado</Selo>}
                      </div>
                    </div>
                    <div className="acn-avs-msg"><Linkify text={av.mensagem} /></div>
                    <div className="acn-avs-meta">
                      <span>✍️ {av.criado_por_nome || '—'}{criadoEmLabel(av) ? ` · ${criadoEmLabel(av)}` : ''}</span>
                      <span>{av.permanente ? '📌 Permanente' : av.data_expiracao ? `⏱ Até ${new Date(av.data_expiracao).toLocaleString('pt-BR')}` : 'Sem data de validade'}</span>
                    </div>
                    {meu && (
                      <div className="acn-avsa-acoes">
                        <Botao pequeno variante="discreto" icone={mdiPencilOutline} disabled={ocupado} aria-label={`Editar o aviso ${av.titulo}`} title="Editar" onClick={() => iniciarEdicao(av)} />
                        <Botao pequeno variante="discreto" icone={av.ativo ? mdiPause : mdiPlay} disabled={ocupado} aria-label={`${av.ativo ? 'Desativar' : 'Reativar'} o aviso ${av.titulo}`} title={av.ativo ? 'Desativar' : 'Reativar'} onClick={() => alternarAtivo(av)} />
                        <Botao pequeno variante="perigo-sec" icone={mdiTrashCanOutline} disabled={ocupado} aria-label={`Excluir o aviso ${av.titulo}`} title="Excluir" onClick={() => excluir(av)} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
