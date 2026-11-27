// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// Painel "Departamentos (Compras)" do Admin — o departamento de um pedido de compra e o gestor que o aprova (12e89, 27/11/2026). Saiu do AdminTab.tsx já no padrão do design system
// (`Botao`, `Faixa`, `Selo`, `confirmar`, `mostrarAviso`, a barra de campos do guia, a tabela do guia, classes `acn-dep-*` do design.css, sem `style` solto).
//
// A regra é a de antes: cada pedido de compra pode ser ligado a um departamento; assim que a 1ª cotação de fornecedor é lançada, o gestor do departamento é mencionado e precisa aprovar,
// em paralelo às alçadas por valor (ComprasTab.tsx, `dispararAprovacaoDepartamento`, que só olha departamento ATIVO).
//
// Achados da 7.x que esta versão corrige:
//  • leitura recusada (dos departamentos ou das pessoas) virava "Nenhum departamento cadastrado": agora faixa vermelha com "Tentar de novo", e nada se grava enquanto a lista não é lida;
//  • salvar, editar e desativar não olhavam o resultado: o formulário fechava e a lista voltava como se tivesse dado certo, mesmo com a gravação negada (o banco responde "ok, 0 linhas").
//    Agora só fecha o formulário e avisa que deu certo quando o banco confirmou a linha; se falhar, o formulário fica aberto com o que foi digitado e o aviso diz o motivo em português;
//  • o clique duplo em "Salvar" criava dois departamentos iguais: trava desde o primeiro clique;
//  • dava para criar dois departamentos com o mesmo nome (a tabela não tem índice único): o nome repetido, mesmo desativado, é recusado (suposição a confirmar);
//  • "Desativar" gravava na hora, sem avisar que os pedidos ligados ao departamento deixam de pedir a aprovação do gestor;
//  • departamento cujo gestor foi DESATIVADO no sistema continuava como se estivesse tudo certo (o aviso de aprovação iria para quem não entra mais) e, na edição, o gestor sumia da lista de
//    escolha: agora aparece o selo "gestor inativo" e a edição mantém o gestor atual, marcado;
//  • duas leituras seguidas podiam terminar na ordem errada: só vale a última pedida.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { mdiPencilOutline, mdiPlus } from '@mdi/js';
import { supabase } from './supabaseClient';
import { explicarErroDoBanco } from './ErroDoBanco';
import { normalizarBusca } from './SearchUtils';
import { confirmar, mostrarAviso } from './Feedback';
import { Botao, Faixa, Selo } from './Interface';

const TABELA = 'compras_departamentos';
const VAZIO = { nome: '', gestor_id: '', gestor_nome: '' };

export function PainelDepartamentosCompras() {
  const [departamentos, setDepartamentos] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [erro, setErro] = useState('');
  const [lido, setLido] = useState(false);
  const [form, setForm] = useState({ ...VAZIO });
  const [editando, setEditando] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const trava = useRef(false);   // vale desde o primeiro clique (o estado só chega no desenho seguinte)
  const pedido = useRef(0);

  const ler = useCallback(async () => {
    const meu = ++pedido.current;
    const [d, u] = await Promise.all([
      supabase.from(TABELA).select('*').order('nome'),
      supabase.from('auth_usuarios').select('id,nome').eq('ativo', true).order('nome'),
    ]);
    if (meu !== pedido.current) return;   // chegou depois de uma leitura mais nova: não vale
    if (d.error || u.error) { setErro(explicarErroDoBanco(d.error || u.error)); setDepartamentos([]); setUsuarios([]); }
    else { setErro(''); setDepartamentos(d.data || []); setUsuarios(u.data || []); }
    setLido(true);
  }, []);
  useEffect(() => { ler(); }, [ler]);

  const travado = !!erro || !lido || ocupado;
  const gestorAtivo = (id: any) => usuarios.some((u: any) => String(u.id) === String(id));

  const abrirNovo = () => { setForm({ ...VAZIO }); setEditando(null); setShowForm(true); };
  const abrirEdicao = (d: any) => { setForm({ nome: d.nome, gestor_id: d.gestor_id, gestor_nome: d.gestor_nome }); setEditando(d); setShowForm(true); };
  const fechar = () => { setForm({ ...VAZIO }); setEditando(null); setShowForm(false); };

  const salvar = async () => {
    if (trava.current || erro || !lido) return;
    const nome = form.nome.trim();
    if (!nome || !form.gestor_id) { mostrarAviso('Informe o nome e o gestor responsável.', 'atencao'); return; }
    const igual = departamentos.find((d: any) => d.id !== editando?.id && normalizarBusca(d.nome) === normalizarBusca(nome));
    if (igual) { mostrarAviso(`Já existe um departamento chamado "${igual.nome}"${igual.ativo ? '' : ' (desativado)'}. Use outro nome${igual.ativo ? '' : ' ou reative o que existe'}.`, 'erro'); return; }
    trava.current = true; setOcupado(true);
    try {
      const payload = { nome, gestor_id: form.gestor_id, gestor_nome: form.gestor_nome };
      const r = editando
        ? await supabase.from(TABELA).update(payload).eq('id', editando.id).select('id')
        : await supabase.from(TABELA).insert([{ ...payload, ativo: true }]).select('id');
      if (r.error || (r.data || []).length === 0) {
        mostrarAviso(`Não foi possível salvar: ${r.error ? explicarErroDoBanco(r.error) : 'o banco não aplicou a mudança (o departamento mudou ou você não tem permissão)'}.`, 'erro');
        return;   // o formulário fica aberto, com o que foi digitado
      }
      mostrarAviso(editando ? `Departamento "${nome}" atualizado.` : `Departamento "${nome}" criado.`, 'ok');
      fechar();
    } catch (e: any) {
      mostrarAviso('Não foi possível concluir: ' + explicarErroDoBanco(e), 'erro');
    } finally {
      await ler();
      trava.current = false; setOcupado(false);
    }
  };

  const mudarAtivo = async (d: any) => {
    if (trava.current || erro || !lido) return;
    trava.current = true;   // vale já para a pergunta: dois cliques seguidos não abrem duas perguntas
    if (d.ativo && !await confirmar(`Desativar "${d.nome}"?\nOs pedidos de compra ligados a este departamento que ainda não passaram pela aprovação do gestor (${d.gestor_nome}) deixam de pedi-la, e o departamento some da escolha. Dá para reativar depois.`)) { trava.current = false; return; }
    setOcupado(true);
    try {
      const { error, data } = await supabase.from(TABELA).update({ ativo: !d.ativo }).eq('id', d.id).select('id');
      if (error || (data || []).length === 0) mostrarAviso(`Não foi possível ${d.ativo ? 'desativar' : 'ativar'} "${d.nome}": ${error ? explicarErroDoBanco(error) : 'o banco não aplicou a mudança (você não tem permissão ou o departamento mudou)'}.`, 'erro');
    } catch (e: any) {
      mostrarAviso('Não foi possível concluir: ' + explicarErroDoBanco(e), 'erro');
    } finally {
      await ler();
      trava.current = false; setOcupado(false);
    }
  };

  // na edição, o gestor atual continua na escolha mesmo que tenha sido desativado (marcado), para não ser trocado sem querer
  const gestorForaDaLista = editando && form.gestor_id && !gestorAtivo(form.gestor_id);

  return (
    <div className="sec-card acn-dep">
      <div className="sec-hdr no-collapse"><span>🏢 Departamentos de Compras{lido && !erro ? ` (${departamentos.length})` : ''}</span></div>
      <div className="sec-body">
        <Faixa tom="info">
          Cada pedido de compra pode ser vinculado a um departamento. Assim que a 1ª cotação de fornecedor é lançada nesse pedido, o gestor responsável é mencionado e precisa aprovar — em paralelo às alçadas por valor, quando também se aplicarem.
        </Faixa>
        {erro && (
          <Faixa tom="erro" acao={<Botao pequeno onClick={ler}>Tentar de novo</Botao>}>
            Não foi possível ler os departamentos ({erro}). Isso não quer dizer que não haja nenhum cadastrado. Enquanto não forem lidos, não dá para criar, editar nem desativar.
          </Faixa>
        )}
        <div className="acn-dep-barra">
          <Botao variante="primario" pequeno icone={mdiPlus} disabled={travado} onClick={abrirNovo}>Novo Departamento</Botao>
        </div>

        {showForm && (
          <form className="acn-filtros acn-filtros-campos acn-dep-form" onSubmit={e => { e.preventDefault(); salvar(); }}>
            <div className="acn-dep-titulo">{editando ? 'Editar departamento' : 'Novo departamento'}</div>
            <div className="form-group">
              <label className="acn-label" htmlFor="acn-dep-nome">Nome *</label>
              <input id="acn-dep-nome" className="acn-input" placeholder="Ex: Engenharia, Produção" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="acn-label" htmlFor="acn-dep-gestor">Gestor responsável *</label>
              <select id="acn-dep-gestor" className="acn-input" value={form.gestor_id}
                onChange={e => {
                  const u = usuarios.find((x: any) => String(x.id) === e.target.value);
                  setForm(f => ({ ...f, gestor_id: e.target.value, gestor_nome: u ? u.nome : '' }));
                }}>
                <option value="">Selecione...</option>
                {gestorForaDaLista && <option value={String(form.gestor_id)}>{form.gestor_nome} (inativo)</option>}
                {usuarios.map((u: any) => <option key={u.id} value={String(u.id)}>{u.nome}</option>)}
              </select>
            </div>
            <div className="acn-dep-acoes">
              <Botao type="submit" variante="primario" disabled={travado}>{ocupado ? 'Salvando…' : 'Salvar'}</Botao>
              <Botao type="button" variante="secundario" disabled={ocupado} onClick={fechar}>Cancelar</Botao>
            </div>
          </form>
        )}

        {!lido ? <div className="acn-empty">Carregando…</div> : erro ? null : departamentos.length === 0 ? (
          <div className="acn-empty">Nenhum departamento cadastrado. Clique em <strong>Novo Departamento</strong> para começar.</div>
        ) : (
          <div className="acn-rolagem">
            <table className="acn-tabela">
              <thead><tr><th>Nome</th><th>Gestor responsável</th><th>Situação</th><th>Ações</th></tr></thead>
              <tbody>
                {departamentos.map((d: any) => (
                  <tr key={d.id} className={d.ativo ? '' : 'acn-dep-inativo'}>
                    <td className="acn-forte">{d.nome}</td>
                    <td>
                      {d.gestor_nome}
                      {!gestorAtivo(d.gestor_id) && <Selo familia="atencao" ponto={false} title="Esta pessoa foi desativada no sistema: ela não entra mais para aprovar. Troque o gestor.">gestor inativo</Selo>}
                    </td>
                    <td><Selo familia={d.ativo ? 'ok' : 'neutro'}>{d.ativo ? 'Ativo' : 'Inativo'}</Selo></td>
                    <td>
                      <div className="acn-dep-linha-acoes">
                        <Botao pequeno disabled={travado} onClick={() => mudarAtivo(d)}>{d.ativo ? 'Desativar' : 'Ativar'}</Botao>
                        <Botao pequeno variante="discreto" icone={mdiPencilOutline} disabled={travado} aria-label={`Editar ${d.nome}`} title="Editar" onClick={() => abrirEdicao(d)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
