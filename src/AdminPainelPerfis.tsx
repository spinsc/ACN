// ─────────────────────────────────────────────────────────────────────────────
// Painel "Perfis de Acesso" do Admin — o modelo de telas e permissões de cada perfil (12e91, 27/11/2026). Saiu do AdminTab.tsx já no padrão do design system
// (`Botao`, `Faixa`, `Selo`, `confirmar`, `mostrarAviso`, a janela do guia com cabeçalho, corpo e rodapé, a tabela do guia, classes `acn-perf-*` do design.css, sem `style` solto).
//
// A regra é a de antes: o perfil é um MODELO (tabela admin_perfis_sistema: nome, descrição, telas, "autoriza RH" e as permissões extras). Na tela de Usuários, o botão
// "Aplicar permissões do perfil" COPIA o modelo para a pessoa; mudar ou apagar o modelo depois não mexe em quem já o recebeu. A tabela só aceita gravação do Admin (política
// `admin_perfis_so_admin`) e o nome tem índice único (`admin_perfis_sistema_nome_key`, que diferencia maiúscula).
//
// Achados da 7.x que esta versão corrige:
//  • leitura recusada virava "Nenhum perfil cadastrado" (com o botão de importar à mostra): agora faixa vermelha com "Tentar de novo", e nada se grava enquanto a lista não é lida;
//  • salvar, excluir e importar não olhavam o resultado: o banco responde "ok, 0 linhas" a uma gravação negada e a tela seguia como se tivesse dado certo; o excluir nem lia o erro.
//    Agora só dá por feito o que o banco confirmou, e a janela fica aberta, com o que foi digitado, se o salvar falhar; os erros vinham em `alert()` do navegador e em texto cru do banco;
//  • o clique duplo em "Salvar" criava dois perfis (o segundo caía no índice único com texto técnico) e em "Importar" e "Excluir" abria duas perguntas: trava desde o primeiro clique;
//  • nome repetido só era barrado pelo índice (que diferencia maiúscula: "comercial" e "Comercial" passavam e a escolha do perfil na tela de Usuários mostraria os dois): agora é
//    recusado antes, sem diferenciar maiúscula nem acento (suposição a confirmar), e a importação também não repete um perfil que existe com outra grafia;
//  • renomear um perfil que pessoas usam deixava o perfil delas escrito com o nome antigo, sem modelo, e ninguém avisava: agora pergunta antes, dizendo quantas pessoas o têm;
//  • excluir não dizia o que acontece (as pessoas não mudam; o modelo some e, ao aplicar o perfil, valem as telas padrão do sistema, só o Dashboard ou o perfil sai da escolha);
//  • a coluna das telas dizia "Todas (33)" comparando com uma lista que tem telas fora do catálogo (a de Usuários já contava só o catálogo desde 24/11/2026): um perfil com todas as
//    telas aparecia como "31 abas";
//  • duas leituras seguidas podiam terminar na ordem errada: só vale a última pedida.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { mdiClose, mdiLightningBolt, mdiPencilOutline, mdiPlus, mdiTrashCanOutline } from '@mdi/js';
import { supabase } from './supabaseClient';
import { explicarErroDoBanco } from './ErroDoBanco';
import { normalizarBusca } from './SearchUtils';
import { confirmar, mostrarAviso } from './Feedback';
import { Botao, Faixa, Selo } from './Interface';
import PermissoesDoUsuario from './PermissoesDoUsuario';
import { IDS_DAS_ABAS, contarExtrasDoModelo, extrasMarcadosDoForm, formDosExtras } from './PermissoesCatalogo';

const TABELA = 'admin_perfis_sistema';
// só conta as telas que a tela de permissões mostra: ids guardados fora do catálogo, como comissoes_tecnicos, não entram na conta (mesma regra da lista de Usuários)
const contarAbas = (abas: string[]) => IDS_DAS_ABAS.filter(id => abas.includes(id)).length;
const formVazio = () => ({ nome: '', descricao: '', abas_permitidas: ['dashboard'], pode_autorizar_rh: false, ...formDosExtras({}) });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// quem tem este perfil hoje (o perfil da pessoa é o NOME escrito em auth_usuarios.perfil): null = a leitura foi recusada, e isso nunca vale como "ninguém"
async function pessoasDoPerfil(nome: string) {
  try {
    const { data, error } = await supabase.from('auth_usuarios').select('nome,ativo').eq('perfil', nome);
    return error ? null : (data || []);
  } catch { return null; }
}
function frasePessoas(pessoas: any[] | null) {
  if (pessoas === null) return 'Não foi possível conferir quantas pessoas têm este perfil.';
  if (pessoas.length === 0) return 'Nenhuma pessoa tem este perfil.';
  const ativas = pessoas.filter((p: any) => p.ativo !== false).length;
  return `${plural(pessoas.length, 'pessoa tem', 'pessoas têm')} este perfil${ativas < pessoas.length ? ` (${plural(ativas, 'ativa', 'ativas')})` : ''}.`;
}

// `padroes` = { abas, rh, fixos }: os perfis padrão do sistema (telas de cada um e quem autoriza RH) e a lista fixa de nomes da escolha de perfil, que moram no AdminTab
export function PainelPerfis({ padroes }: { padroes: { abas: Record<string, string[]>; rh: Record<string, boolean>; fixos: string[] } }) {
  const [perfis, setPerfis] = useState<any[]>([]);
  const [erro, setErro] = useState('');
  const [lido, setLido] = useState(false);
  const [modal, setModal] = useState<any>(null);   // { mode: 'novo' | 'editar', id?, nome? }
  const [form, setForm] = useState<any>(formVazio());
  const [ocupado, setOcupado] = useState(false);
  const trava = useRef(false);   // vale desde o primeiro clique (o estado só chega no desenho seguinte)
  const pedido = useRef(0);

  const ler = useCallback(async () => {
    const meu = ++pedido.current;
    let r: any;
    try { r = await supabase.from(TABELA).select('*').order('nome'); } catch (e: any) { r = { error: e }; }
    if (meu !== pedido.current) return;   // chegou depois de uma leitura mais nova: não vale
    if (r.error) { setErro(explicarErroDoBanco(r.error)); setPerfis([]); }
    else { setErro(''); setPerfis(r.data || []); }
    setLido(true);
  }, []);
  useEffect(() => { ler(); }, [ler]);

  const travado = !!erro || !lido || ocupado;

  const abrirNovo = () => { setForm(formVazio()); setModal({ mode: 'novo' }); };
  const abrirEditar = (p: any) => {
    setForm({
      nome: p.nome, descricao: p.descricao || '',
      abas_permitidas: Array.isArray(p.abas_permitidas) ? p.abas_permitidas : ['dashboard'],
      pode_autorizar_rh: p.pode_autorizar_rh || false,
      ...formDosExtras({ ...(p.extras || {}), pode_autorizar_rh: p.pode_autorizar_rh === true || p.extras?.pode_autorizar_rh === true }),
    });
    setModal({ mode: 'editar', id: p.id, nome: p.nome });
  };
  const fechar = () => { setModal(null); setForm(formVazio()); };

  const salvar = async () => {
    if (trava.current || erro || !lido || !modal) return;
    const nome = form.nome.trim();
    if (!nome) { mostrarAviso('Informe um nome para o perfil.', 'atencao'); return; }
    const igual = perfis.find((p: any) => p.id !== modal.id && normalizarBusca(p.nome) === normalizarBusca(nome));
    if (igual) { mostrarAviso(`Já existe um perfil chamado "${igual.nome}". Use outro nome.`, 'erro'); return; }
    trava.current = true; setOcupado(true);
    try {
      // renomear um perfil que pessoas usam: o perfil DELAS é o nome escrito, e não acompanha (nada é regravado nas pessoas)
      if (modal.mode === 'editar' && nome !== modal.nome) {
        const pessoas = await pessoasDoPerfil(modal.nome);
        if (pessoas === null || pessoas.length > 0) {
          const ok = await confirmar(`Renomear o perfil "${modal.nome}" para "${nome}"?\n\n${frasePessoas(pessoas)} O perfil delas continua escrito "${modal.nome}" (o nome delas não é regravado): elas ficam sem modelo na tela de Usuários até alguém trocar o perfil de cada uma.`);
          if (!ok) return;   // a janela continua aberta, com o nome digitado
        }
      }
      const payload = {
        nome, descricao: form.descricao, abas_permitidas: form.abas_permitidas,
        pode_autorizar_rh: form.pode_autorizar_rh, extras: extrasMarcadosDoForm(form),
      };
      const r = modal.mode === 'novo'
        ? await supabase.from(TABELA).insert([payload]).select('id')
        : await supabase.from(TABELA).update(payload).eq('id', modal.id).select('id');
      if (r.error || (r.data || []).length === 0) {
        mostrarAviso(`Não foi possível salvar: ${r.error ? explicarErroDoBanco(r.error) : 'o banco não aplicou a mudança (o perfil mudou ou você não tem permissão)'}.`, 'erro');
        return;   // a janela fica aberta, com o que foi digitado
      }
      mostrarAviso(modal.mode === 'novo' ? `Perfil "${nome}" criado.` : `Perfil "${nome}" atualizado.`, 'ok');
      fechar();
    } catch (e: any) {
      mostrarAviso('Não foi possível concluir: ' + explicarErroDoBanco(e), 'erro');
    } finally {
      await ler();
      trava.current = false; setOcupado(false);
    }
  };

  const excluir = async (p: any) => {
    if (trava.current || erro || !lido) return;
    trava.current = true; setOcupado(true);   // vale já para a pergunta: dois cliques seguidos não abrem duas perguntas
    try {
      const pessoas = await pessoasDoPerfil(p.nome);
      const semModelo = padroes.abas[p.nome]
        ? 'Sem o modelo guardado, ao aplicar este perfil numa pessoa valem as telas padrão do sistema.'
        : padroes.fixos.includes(p.nome)
          ? 'Sem o modelo guardado, ao aplicar este perfil numa pessoa vale só o Dashboard.'
          : 'O perfil deixa de aparecer na escolha de perfil da tela de Usuários.';
      if (!await confirmar(`Excluir o perfil "${p.nome}"?\n\n${frasePessoas(pessoas)} As telas e permissões que elas já têm NÃO mudam (o modelo só é copiado para a pessoa ao aplicá-lo).\n${semModelo}`)) return;
      const { error, data } = await supabase.from(TABELA).delete().eq('id', p.id).select('id');
      if (error || (data || []).length === 0) mostrarAviso(`Não foi possível excluir o perfil "${p.nome}": ${error ? explicarErroDoBanco(error) : 'o banco não aplicou a exclusão (você não tem permissão ou o perfil já não existe)'}.`, 'erro');
      else mostrarAviso(`Perfil "${p.nome}" excluído.`, 'ok');
    } catch (e: any) {
      mostrarAviso('Não foi possível concluir: ' + explicarErroDoBanco(e), 'erro');
    } finally {
      await ler();
      trava.current = false; setOcupado(false);
    }
  };

  const importarPadroes = async () => {
    if (trava.current || erro || !lido) return;
    // o que já existe, com qualquer grafia, não é criado de novo
    const existentes = new Set(perfis.map((p: any) => normalizarBusca(p.nome)));
    const novos = Object.entries(padroes.abas)
      .filter(([nome]) => !existentes.has(normalizarBusca(nome)))
      .map(([nome, abas]) => ({ nome, abas_permitidas: abas, pode_autorizar_rh: padroes.rh[nome] || false, descricao: '' }));
    if (novos.length === 0) { mostrarAviso('Todos os perfis padrão já existem.', 'info'); return; }
    trava.current = true; setOcupado(true);
    try {
      if (!await confirmar(`Isso vai criar ${plural(novos.length, 'perfil padrão', 'perfis padrão')} que ainda não ${novos.length === 1 ? 'existe' : 'existem'}: ${novos.map(n => n.nome).join(', ')}.\nOs perfis que já existem não mudam. Continuar?`)) return;
      const { error, data } = await supabase.from(TABELA).insert(novos).select('id');
      if (error || (data || []).length !== novos.length) mostrarAviso(`Não foi possível importar os perfis padrão: ${error ? explicarErroDoBanco(error) : 'o banco não confirmou todos os perfis (você não tem permissão ou algo mudou)'}.`, 'erro');
      else mostrarAviso(`${plural(novos.length, 'perfil padrão criado', 'perfis padrão criados')}.`, 'ok');
    } catch (e: any) {
      mostrarAviso('Não foi possível concluir: ' + explicarErroDoBanco(e), 'erro');
    } finally {
      await ler();
      trava.current = false; setOcupado(false);
    }
  };

  return (
    <div className="sec-card acn-perf">
      <div className="sec-hdr no-collapse"><span>🔐 Perfis de Acesso{lido && !erro ? ` (${perfis.length})` : ''}</span></div>
      <div className="sec-body">
        <Faixa tom="info">
          Configure as permissões padrão de cada perfil. Ao clicar em <strong>⚡ Aplicar permissões do perfil</strong> na tela de usuário, as abas serão preenchidas automaticamente. Mudar ou excluir um perfil aqui não altera as pessoas que já o receberam.
        </Faixa>
        {erro && (
          <Faixa tom="erro" acao={<Botao pequeno onClick={ler}>Tentar de novo</Botao>}>
            Não foi possível ler os perfis ({erro}). Isso não quer dizer que não haja nenhum cadastrado. Enquanto não forem lidos, não dá para criar, editar, excluir nem importar.
          </Faixa>
        )}
        <div className="acn-perf-barra">
          <Botao pequeno icone={mdiLightningBolt} disabled={travado} onClick={importarPadroes}>Importar Perfis Padrão</Botao>
          <Botao variante="primario" pequeno icone={mdiPlus} disabled={travado} onClick={abrirNovo}>Novo Perfil</Botao>
        </div>

        {!lido ? <div className="acn-empty">Carregando…</div> : erro ? null : perfis.length === 0 ? (
          <div className="acn-empty">
            Nenhum perfil cadastrado. Clique em <strong>Importar Perfis Padrão</strong> para criar os perfis do sistema, ou em <strong>Novo Perfil</strong>.
          </div>
        ) : (
          <div className="acn-rolagem">
            <table className="acn-tabela">
              <thead><tr>
                <th>Perfil</th>
                <th>Descrição</th>
                <th className="acn-perf-c">Abas liberadas</th>
                <th className="acn-perf-c">Autoriza RH</th>
                <th className="acn-perf-c">Outras extras</th>
                <th>Ações</th>
              </tr></thead>
              <tbody>
                {perfis.map((p: any) => {
                  const n = contarAbas(p.abas_permitidas || []);
                  const extras = Math.max(0, contarExtrasDoModelo(p.extras) - (p.extras?.pode_autorizar_rh === true ? 1 : 0));
                  return (
                    <tr key={p.id}>
                      <td className="acn-forte">{p.nome}</td>
                      <td className="acn-perf-desc">{p.descricao || '—'}</td>
                      <td className="acn-perf-c">
                        {n >= IDS_DAS_ABAS.length
                          ? <Selo familia="ok" ponto={false}>Todas as abas</Selo>
                          : <Selo familia="info" ponto={false}>{plural(n, 'aba', 'abas')}</Selo>}
                      </td>
                      <td className="acn-perf-c">{p.pode_autorizar_rh ? <Selo familia="marca" ponto={false}>Autoriza</Selo> : '—'}</td>
                      <td className="acn-perf-c">{extras || '—'}</td>
                      <td>
                        <div className="acn-perf-linha-acoes">
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
          <div className="modal-box acn-modal-cadastro acn-perf-jan" role="dialog" aria-modal="true" aria-label={modal.mode === 'novo' ? 'Novo perfil de acesso' : `Editar perfil ${modal.nome}`}>
            <div className="acn-modal-cab">
              <span className="modal-title">{modal.mode === 'novo' ? 'Novo perfil de acesso' : `Editar perfil — ${modal.nome}`}</span>
              <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" disabled={ocupado} onClick={fechar} />
            </div>
            <div className="acn-modal-corpo">
              <div className="acn-form-cheio acn-perf-campos">
                <div className="form-group">
                  <label className="acn-label" htmlFor="acn-perf-nome">Nome do perfil *</label>
                  <input id="acn-perf-nome" className="acn-input" value={form.nome} onChange={e => setForm((f: any) => ({ ...f, nome: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="acn-label" htmlFor="acn-perf-desc">Descrição (opcional)</label>
                  <input id="acn-perf-desc" className="acn-input" placeholder="Ex: Acesso ao módulo de Engenharia e Demandas Avulsas" value={form.descricao} onChange={e => setForm((f: any) => ({ ...f, descricao: e.target.value }))} />
                </div>
              </div>
              {/* 24/11/2026: o modelo usa o mesmo bloco do cadastro de usuário (telas + permissões extras) */}
              <PermissoesDoUsuario modelo valor={form} onChange={patch => setForm((f: any) => ({ ...f, ...patch }))} />
            </div>
            <div className="acn-modal-rodape">
              <Botao variante="secundario" disabled={ocupado} onClick={fechar}>Cancelar</Botao>
              <Botao variante="primario" disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando…' : 'Salvar perfil'}</Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
