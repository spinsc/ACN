// A aba "Cadastros fiscais" do Fiscal (preparação do módulo fiscal, 26/11/2026): as empresas que emitem a nota, as transportadoras e o relatório do que falta preencher nos clientes e nos itens.
// As regras estão em FiscalRegras.ts, a leitura e a gravação em FiscalDados.ts e as tabelas em supabase/sql/fiscal_cadastros.sql. Nada aqui emite nota: é a preparação.
import React, { useEffect, useMemo, useState } from 'react';
import { mdiClose, mdiPlus, mdiMagnify, mdiPencilOutline, mdiCancel, mdiRestore, mdiRefresh, mdiDownload } from '@mdi/js';
import Icone from './Icone';
import { Botao, Faixa, Selo, Chips } from './Interface';
import { confirmar } from './Feedback';
import { combinaBusca } from './SearchUtils';
import { CampoTelefone } from './CampoTelefone';
import { CampoCep } from './CampoCep';
import { conferirCepAntesDeSalvar } from './Cep';
import { formatarDocumento } from './ComprasFornecedores';
import { useAbaNoEndereco } from './AbaNoEndereco';
import { baixarPlanilha } from './ExportarPlanilha';
import { podeEditarCadastroFiscal } from './utils/permissoes';
import FiscalClienteCampos from './FiscalClienteCampos';
import FiscalItemCampos from './FiscalItemCampos';
import {
  lerEmitentes, salvarEmitente, lerTransportadoras, salvarTransportadora, mudarAtivoDaTransportadora, lerPendenciasDosClientes, lerPendenciasDosItens, aplicarFiscalEmLote, lerOpsParaLigar, ligarOpsAoCliente,
} from './FiscalDados';
import { agruparParaLigar, resumoDasLigacoes, gruposComSugestao } from './FiscalLigacaoDaOp';
import FiscalTiposDeNotaTela from './FiscalTiposDeNotaTela';
import FiscalRegrasTela from './FiscalRegrasTela';
import {
  OPCOES_CRT, ORIGENS_FISCAIS, UFS, formDoEmitente, faltasDoEmitente, formDaTransportadora, faltasDoCliente, faltasDoItem, CAMPOS_FISCAIS_DO_CLIENTE, CAMPOS_FISCAIS_DO_ITEM, soDigitos, formatarNcm,
} from './FiscalRegras';
import './fiscal.css';

const LIMITE_NA_TELA = 200;   // linhas desenhadas por vez nas listas de pendências (a busca e os filtros afinam; o aviso diz quantas ficaram de fora)

const Campo = ({ id, rotulo, largo = false, dica = undefined, children }: { id: string; rotulo: string; largo?: boolean; dica?: string; children?: any }) => (
  <div className={'acn-fcad-campo' + (largo ? ' acn-fcad-largo' : '')}>
    <label className="acn-label" htmlFor={id}>{rotulo}</label>{children}{dica && <p className="acn-fcad-dica">{dica}</p>}
  </div>
);

/** Moldura de janela dos cadastros (a janela do sistema: cabeçalho, corpo que rola e rodapé fixo). */
export function Janela({ titulo, onClose, pequena = false, children, rodape = undefined }: { titulo: string; onClose: any; pequena?: boolean; children?: any; rodape?: any }) {
  return (
    <div className="modal-overlay">
      <div className={'modal-box acn-modal-cadastro ' + (pequena ? 'acn-fcad-box-p' : 'acn-fcad-box')} role="dialog" aria-label={titulo}>
        <div className="acn-modal-cab"><span className="modal-title">{titulo}</span><Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} /></div>
        <div className="acn-modal-corpo acn-form-cheio">{children}</div>
        {rodape && <div className="acn-modal-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

// ═══ Empresas que emitem a nota ═══════════════════════════════════════════════════════════════
function ModalEmitente({ emitente, currentUser, onClose, aoSalvar }) {
  const [form, setForm] = useState(() => formDoEmitente(emitente));
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const salvar = async () => {
    if (ocupado) return;
    setErro(''); setOcupado(true);
    const recusaCep = await conferirCepAntesDeSalvar(form.cep, 'CEP', emitente.cep);
    if (recusaCep) { setOcupado(false); setErro(recusaCep); return; }
    const r = await salvarEmitente(emitente.id, form, currentUser, emitente);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoSalvar(r.linha);
  };
  return (
    <Janela titulo={`Empresa emitente — ${emitente.codigo}`} onClose={onClose}
      rodape={<><Botao onClick={onClose}>Cancelar</Botao><Botao variante="primario" disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando…' : 'Salvar'}</Botao></>}>
      <Faixa tom="info">O certificado digital (A1) e a senha dele <strong>não se cadastram aqui</strong>: vão direto ao serviço de emissão, entregues pelo responsável, nunca por e-mail e nunca neste sistema.</Faixa>
      <div className="acn-fcad-grade">
        <Campo id="em-razao" rotulo="Razão social" largo><input id="em-razao" className="acn-input" value={form.razao_social} onChange={e => set('razao_social', e.target.value)} /></Campo>
        <Campo id="em-fant" rotulo="Nome fantasia"><input id="em-fant" className="acn-input" value={form.nome_fantasia} onChange={e => set('nome_fantasia', e.target.value)} /></Campo>
        <Campo id="em-cnpj" rotulo="CNPJ"><input id="em-cnpj" className="acn-input" inputMode="numeric" value={formatarDocumento(form.cnpj)} onChange={e => set('cnpj', soDigitos(e.target.value))} placeholder="00.000.000/0000-00" /></Campo>
        <Campo id="em-crt" rotulo="Regime de tributação (CRT)" dica="Muda todo o imposto da nota: normal usa CST, Simples usa CSOSN.">
          <select id="em-crt" className="acn-input" value={form.crt} onChange={e => set('crt', e.target.value)}><option value="">— escolher —</option>{OPCOES_CRT.map(o => <option key={o.valor} value={String(o.valor)}>{o.rotulo}</option>)}</select></Campo>
        <Campo id="em-ie" rotulo="Inscrição estadual"><input id="em-ie" className="acn-input" inputMode="numeric" value={form.inscricao_estadual} onChange={e => set('inscricao_estadual', e.target.value)} /></Campo>
        <Campo id="em-im" rotulo="Inscrição municipal" dica="Para a nota de serviço."><input id="em-im" className="acn-input" value={form.inscricao_municipal} onChange={e => set('inscricao_municipal', e.target.value)} /></Campo>
        <Campo id="em-cnae" rotulo="CNAE principal"><input id="em-cnae" className="acn-input" inputMode="numeric" value={form.cnae} onChange={e => set('cnae', e.target.value)} /></Campo>
        <Campo id="em-cep" rotulo="CEP"><CampoCep id="em-cep" valor={form.cep} onChange={v => set('cep', v)}
          onResultado={(r: any) => { if (r?.status === 'ok') setForm(f => ({ ...f, cidade: r.cidade || f.cidade, uf: r.uf || f.uf, logradouro: f.logradouro || r.logradouro || '', bairro: f.bairro || r.bairro || '' })); }} /></Campo>
        <Campo id="em-rua" rotulo="Rua"><input id="em-rua" className="acn-input" value={form.logradouro} onChange={e => set('logradouro', e.target.value)} /></Campo>
        <Campo id="em-num" rotulo="Número"><input id="em-num" className="acn-input" value={form.numero} onChange={e => set('numero', e.target.value)} /></Campo>
        <Campo id="em-comp" rotulo="Complemento"><input id="em-comp" className="acn-input" value={form.complemento} onChange={e => set('complemento', e.target.value)} /></Campo>
        <Campo id="em-bai" rotulo="Bairro"><input id="em-bai" className="acn-input" value={form.bairro} onChange={e => set('bairro', e.target.value)} /></Campo>
        <Campo id="em-cid" rotulo="Cidade"><input id="em-cid" className="acn-input" value={form.cidade} onChange={e => set('cidade', e.target.value)} /></Campo>
        <Campo id="em-uf" rotulo="UF"><select id="em-uf" className="acn-input" value={form.uf} onChange={e => set('uf', e.target.value)}><option value="">UF</option>{UFS.map(u => <option key={u}>{u}</option>)}</select></Campo>
        <Campo id="em-ibge" rotulo="Código do município (IBGE)" dica="7 dígitos. Palhoça/SC é 4211900."><input id="em-ibge" className="acn-input" inputMode="numeric" maxLength={7} value={form.codigo_ibge} onChange={e => set('codigo_ibge', soDigitos(e.target.value))} /></Campo>
        <Campo id="em-tel" rotulo="Telefone"><CampoTelefone id="em-tel" valor={form.telefone} onChange={v => set('telefone', v)} /></Campo>
        <Campo id="em-mail" rotulo="E-mail do fiscal" dica="Para onde vai o XML da nota autorizada."><input id="em-mail" className="acn-input" type="email" value={form.email_fiscal} onChange={e => set('email_fiscal', e.target.value)} /></Campo>
        <Campo id="em-serie" rotulo="Série da NF-e em uso hoje"><input id="em-serie" className="acn-input" inputMode="numeric" maxLength={3} value={form.serie_nfe} onChange={e => set('serie_nfe', soDigitos(e.target.value))} /></Campo>
        <Campo id="em-serie-n" rotulo="Série reservada para o emissor novo" dica="Na transição tem de ser diferente da de hoje, senão a numeração colide. A decidir com o Fiscal."><input id="em-serie-n" className="acn-input" inputMode="numeric" maxLength={3} value={form.serie_nfe_nova} onChange={e => set('serie_nfe_nova', soDigitos(e.target.value))} /></Campo>
        <Campo id="em-serie-s" rotulo="Série da NFS-e"><input id="em-serie-s" className="acn-input" value={form.serie_nfse} onChange={e => set('serie_nfse', e.target.value)} /></Campo>
        <Campo id="em-obs" rotulo="Observação" largo><textarea id="em-obs" className="acn-input" rows={3} value={form.observacao} onChange={e => set('observacao', e.target.value)} /></Campo>
      </div>
      {erro && <Faixa tom="erro">{erro}</Faixa>}
    </Janela>
  );
}

function EmpresasEmitentes({ currentUser, podeEditar }) {
  const [dados, setDados] = useState<any>({ lista: [], erro: '', lido: false });
  const [modal, setModal] = useState<any>(null);
  const carregar = () => lerEmitentes().then(r => setDados({ ...r, lido: true }));
  useEffect(() => { carregar(); }, []);
  const crtRotulo = (c: any) => (OPCOES_CRT.find(o => o.valor === Number(c))?.rotulo || '—');
  return (
    <div>
      <div className="acn-ajuda">As empresas que vão emitir a nota. O Fiscal usa estes dados para validar cada nota (regime, série, endereço). O certificado digital não mora aqui.</div>
      {dados.erro && <Faixa tom="erro">Não foi possível ler as empresas ({dados.erro}).</Faixa>}
      <div className="acn-rolagem">
        <table className="acn-tabela acn-densa">
          <thead><tr><th>Empresa</th><th>CNPJ</th><th>Regime</th><th>Série da NF-e</th><th>Cadastro</th>{podeEditar && <th>Ações</th>}</tr></thead>
          <tbody>
            {dados.lista.map((e: any) => {
              const falta = faltasDoEmitente(e);
              return (
                <tr key={e.id}>
                  <td><strong>{e.codigo}</strong>{e.razao_social && <div className="acn-fraco">{e.razao_social}</div>}</td>
                  <td className="acn-fcad-num">{formatarDocumento(e.cnpj) || '—'}</td>
                  <td>{crtRotulo(e.crt)}</td>
                  <td className="acn-fcad-num">{e.serie_nfe ?? '—'}{e.serie_nfe_nova ? ` → ${e.serie_nfe_nova} (nova)` : ''}</td>
                  <td>{falta.length ? <Selo familia="atencao" ponto={false} title={'Falta: ' + falta.join(', ')}>Faltam {falta.length}</Selo> : <Selo familia="ok" ponto={false}>Completo</Selo>}
                    {falta.length > 0 && <div className="acn-fraco">{falta.join(', ')}</div>}</td>
                  {podeEditar && <td><div className="acn-fcad-acoes"><Botao pequeno variante="discreto" icone={mdiPencilOutline} aria-label={`Editar ${e.codigo}`} title="Editar" onClick={() => setModal(e)} /></div></td>}
                </tr>
              );
            })}
            {dados.lido && !dados.lista.length && !dados.erro && <tr><td colSpan={podeEditar ? 6 : 5} className="acn-centro acn-fraco">Nenhuma empresa cadastrada.</td></tr>}
          </tbody>
        </table>
      </div>
      {!podeEditar && <div className="acn-ajuda">Quem preenche: Admin, gerentes e a equipe do Fiscal.</div>}
      {modal && <ModalEmitente emitente={modal} currentUser={currentUser} onClose={() => setModal(null)} aoSalvar={() => { setModal(null); carregar(); }} />}
    </div>
  );
}

// ═══ Transportadoras ═════════════════════════════════════════════════════════════════════════
function ModalTransportadora({ transportadora, currentUser, onClose, aoSalvar }) {
  const [form, setForm] = useState(() => formDaTransportadora(transportadora));
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const salvar = async () => {
    if (ocupado) return;
    setErro(''); setOcupado(true);
    const recusaCep = await conferirCepAntesDeSalvar(form.cep, 'CEP', transportadora?.cep);
    if (recusaCep) { setOcupado(false); setErro(recusaCep); return; }
    const r = await salvarTransportadora(transportadora?.id || null, form, currentUser, transportadora || null);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoSalvar(r.linha);
  };
  return (
    <Janela titulo={transportadora ? 'Editar transportadora' : 'Cadastrar transportadora'} onClose={onClose}
      rodape={<><Botao onClick={onClose}>Cancelar</Botao><Botao variante="primario" disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando…' : (transportadora ? 'Salvar' : 'Cadastrar')}</Botao></>}>
      <div className="acn-fcad-grade">
        <Campo id="tr-nome" rotulo="Nome *" largo dica="Como o pessoal a conhece."><input id="tr-nome" className="acn-input" autoFocus value={form.nome} onChange={e => set('nome', e.target.value)} /></Campo>
        <Campo id="tr-razao" rotulo="Razão social"><input id="tr-razao" className="acn-input" value={form.razao_social} onChange={e => set('razao_social', e.target.value)} /></Campo>
        <Campo id="tr-doc" rotulo="CNPJ ou CPF"><input id="tr-doc" className="acn-input" inputMode="numeric" value={formatarDocumento(form.documento)} onChange={e => set('documento', soDigitos(e.target.value))} placeholder="00.000.000/0000-00" /></Campo>
        <Campo id="tr-ie" rotulo="Inscrição estadual"><input id="tr-ie" className="acn-input" inputMode="numeric" value={form.inscricao_estadual} onChange={e => set('inscricao_estadual', e.target.value)} /></Campo>
        <Campo id="tr-rntrc" rotulo="RNTRC (ANTT)"><input id="tr-rntrc" className="acn-input" inputMode="numeric" value={form.rntrc} onChange={e => set('rntrc', e.target.value)} /></Campo>
        <Campo id="tr-cep" rotulo="CEP"><CampoCep id="tr-cep" valor={form.cep} onChange={v => set('cep', v)}
          onResultado={(r: any) => { if (r?.status === 'ok') setForm(f => ({ ...f, cidade: r.cidade || f.cidade, uf: r.uf || f.uf, logradouro: f.logradouro || r.logradouro || '', bairro: f.bairro || r.bairro || '' })); }} /></Campo>
        <Campo id="tr-rua" rotulo="Rua"><input id="tr-rua" className="acn-input" value={form.logradouro} onChange={e => set('logradouro', e.target.value)} /></Campo>
        <Campo id="tr-num" rotulo="Número"><input id="tr-num" className="acn-input" value={form.numero} onChange={e => set('numero', e.target.value)} /></Campo>
        <Campo id="tr-comp" rotulo="Complemento"><input id="tr-comp" className="acn-input" value={form.complemento} onChange={e => set('complemento', e.target.value)} /></Campo>
        <Campo id="tr-bai" rotulo="Bairro"><input id="tr-bai" className="acn-input" value={form.bairro} onChange={e => set('bairro', e.target.value)} /></Campo>
        <Campo id="tr-cid" rotulo="Cidade"><input id="tr-cid" className="acn-input" value={form.cidade} onChange={e => set('cidade', e.target.value)} /></Campo>
        <Campo id="tr-uf" rotulo="UF"><select id="tr-uf" className="acn-input" value={form.uf} onChange={e => set('uf', e.target.value)}><option value="">UF</option>{UFS.map(u => <option key={u}>{u}</option>)}</select></Campo>
        <Campo id="tr-tel" rotulo="Telefone"><CampoTelefone id="tr-tel" valor={form.telefone} onChange={v => set('telefone', v)} /></Campo>
        <Campo id="tr-mail" rotulo="E-mail"><input id="tr-mail" className="acn-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} /></Campo>
        <Campo id="tr-obs" rotulo="Observação" largo><textarea id="tr-obs" className="acn-input" rows={2} value={form.observacao} onChange={e => set('observacao', e.target.value)} /></Campo>
      </div>
      {erro && <Faixa tom="erro">{erro}</Faixa>}
    </Janela>
  );
}

function TransportadorasFiscais({ currentUser, podeEditar }) {
  const [dados, setDados] = useState<any>({ lista: [], erro: '', lido: false });
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('ativos');
  const [modal, setModal] = useState<any>(null);
  const [aviso, setAviso] = useState('');
  const carregar = () => lerTransportadoras().then(r => setDados({ ...r, lido: true }));
  useEffect(() => { carregar(); }, []);
  const lista = useMemo(() => dados.lista.filter((t: any) => {
    if (situacao === 'ativos' && !t.ativo) return false;
    if (situacao === 'inativos' && t.ativo) return false;
    return !busca.trim() || combinaBusca([t.nome, t.razao_social, t.documento, formatarDocumento(t.documento), t.cidade, t.uf].join(' '), busca);
  }), [dados.lista, busca, situacao]);
  const mudarAtivo = async (t: any, ativo: boolean) => {
    if (!ativo && !await confirmar(`Desativar a transportadora "${t.nome}"?\n\nEla deixa de aparecer para escolher em notas novas. Nada é apagado.`)) return;
    const e = await mudarAtivoDaTransportadora(t, ativo, currentUser);
    setAviso(e);
    if (!e) carregar();
  };
  return (
    <div>
      <div className="acn-cmp-cab">
        <div className="acn-cmp-cab-esq">
          <h2 className="acn-cmp-titulo">Transportadoras</h2>
          {podeEditar && <Botao pequeno variante="primario" icone={mdiPlus} onClick={() => setModal({})}>Cadastrar transportadora</Botao>}
        </div>
        <div className="acn-cmp-filtros">
          <div className="acn-cmp-busca-geral"><Icone path={mdiMagnify} size={14} /><input className="acn-input" type="search" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar transportadora" placeholder="Nome, CNPJ, cidade…" /></div>
          <Chips rotulo="Situação" ativo={situacao} onChange={setSituacao} itens={[{ id: 'ativos', rotulo: 'Ativas' }, { id: 'inativos', rotulo: 'Inativas' }, { id: 'todos', rotulo: 'Todas' }]} />
        </div>
      </div>
      <div className="acn-ajuda">A nota leva o CNPJ, a inscrição estadual e o endereço de quem transporta. Hoje o frete guarda só o nome digitado; este cadastro é o que vai servir à nota. Nada se apaga: quem parou fica inativa.</div>
      {dados.erro && <Faixa tom="erro">Não foi possível ler as transportadoras ({dados.erro}). A lista pode estar incompleta.</Faixa>}
      {aviso && <Faixa tom="erro">{aviso}</Faixa>}
      <div className="acn-rolagem">
        <table className="acn-tabela acn-densa">
          <thead><tr><th>Transportadora</th><th>CNPJ / CPF</th><th>Inscrição estadual</th><th>Cidade</th><th>Contato</th>{podeEditar && <th>Ações</th>}</tr></thead>
          <tbody>
            {lista.map((t: any) => (
              <tr key={t.id} className={t.ativo ? '' : 'acn-fcad-linha-inativa'}>
                <td><strong>{t.nome}</strong>{!t.ativo && <> <Selo familia="neutro" ponto={false}>Inativa</Selo></>}{t.razao_social && t.razao_social !== t.nome && <div className="acn-fraco">{t.razao_social}</div>}</td>
                <td className="acn-fcad-num">{formatarDocumento(t.documento) || <Selo familia="atencao" ponto={false}>Sem CNPJ</Selo>}</td>
                <td className="acn-fcad-num">{t.inscricao_estadual || '—'}</td>
                <td>{[t.cidade, t.uf].filter(Boolean).join(' / ') || '—'}</td>
                <td>{t.telefone || '—'}{t.email && <div className="acn-fraco">{t.email}</div>}</td>
                {podeEditar && <td><div className="acn-fcad-acoes">
                  <Botao pequeno variante="discreto" icone={mdiPencilOutline} aria-label={`Editar ${t.nome}`} title="Editar" onClick={() => setModal({ t })} />
                  {t.ativo ? <Botao pequeno variante="discreto" icone={mdiCancel} aria-label={`Desativar ${t.nome}`} title="Desativar" onClick={() => mudarAtivo(t, false)} />
                    : <Botao pequeno variante="discreto" icone={mdiRestore} aria-label={`Reativar ${t.nome}`} title="Reativar" onClick={() => mudarAtivo(t, true)} />}
                </div></td>}
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={podeEditar ? 6 : 5} className="acn-centro acn-fraco">{!dados.lido ? 'Carregando…' : dados.lista.length === 0 ? (dados.erro ? 'Não foi possível ler.' : 'Nenhuma transportadora cadastrada ainda.') : 'Nenhuma transportadora com esse filtro.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {!podeEditar && <div className="acn-ajuda">Quem cadastra: Admin, gerentes, a equipe do Fiscal e a da Logística.</div>}
      {modal && <ModalTransportadora transportadora={modal.t || null} currentUser={currentUser} onClose={() => setModal(null)} aoSalvar={() => { setModal(null); carregar(); }} />}
    </div>
  );
}

// ═══ Pendências: clientes ═════════════════════════════════════════════════════════════════════
function PendenciasDosClientes({ currentUser }) {
  const podeEditar = podeEditarCadastroFiscal(currentUser);
  const [d, setD] = useState<any>({ clientes: [], fiscais: new Map(), erro: '', lido: false });
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [campo, setCampo] = useState('');
  const [soPendentes, setSoPendentes] = useState('sim');
  const [aberto, setAberto] = useState<any>(null);
  const carregar = async () => { setCarregando(true); const r = await lerPendenciasDosClientes(); setD({ ...r, lido: true }); setCarregando(false); };
  useEffect(() => { carregar(); }, []);

  const linhas = useMemo(() => d.clientes.map((c: any) => ({ c, falta: faltasDoCliente(d.fiscais.get(c.id)) })), [d]);
  const resumo = useMemo(() => {
    const porCampo: Record<string, number> = {};
    for (const { falta } of linhas) for (const f of falta) porCampo[f] = (porCampo[f] || 0) + 1;
    return { total: linhas.length, completos: linhas.filter(l => !l.falta.length).length, porCampo };
  }, [linhas]);
  const filtradas = useMemo(() => linhas.filter(({ c, falta }) => {
    if (soPendentes === 'sim' && !falta.length) return false;
    if (tipo && c.tipo !== tipo) return false;
    if (campo && !falta.includes(campo)) return false;
    return !busca.trim() || combinaBusca([c.nome, c.documento, c.cidade, c.estado].join(' '), busca);
  }), [linhas, busca, tipo, campo, soPendentes]);
  const rotulo = (k: string) => CAMPOS_FISCAIS_DO_CLIENTE.find(x => x.chave === k)?.rotulo || k;

  const exportar = async () => {
    await baixarPlanilha('Clientes_pendencias_fiscais', [{ nome: 'Clientes', colunas: [{ rotulo: 'Cliente', largura: 40 }, { rotulo: 'Tipo' }, { rotulo: 'CNPJ/CPF', largura: 20 }, { rotulo: 'Cidade', largura: 24 }, { rotulo: 'UF' }, { rotulo: 'Falta', largura: 50 }],
      linhas: filtradas.map(({ c, falta }) => [c.nome, c.tipo, c.documento || '', c.cidade || '', c.estado || '', falta.map(rotulo).join(', ')]) }]);
  };

  return (
    <div>
      <div className="acn-ajuda">Para emitir a nota o cliente precisa ter: se é contribuinte do ICMS (e a inscrição estadual), se é órgão público, se retém imposto de renda e o código do município. Abra o cliente para preencher; o Fiscal pode conferir no Sintegra.</div>
      {d.erro && <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>Não foi possível ler {d.erroClientes ? 'os clientes' : 'os dados fiscais'} ({d.erro}). {d.erroFiscal ? 'Os números abaixo estão errados: tudo apareceria como "faltando".' : 'A lista está incompleta.'}</Faixa>}
      <div className="acn-kpis">
        <div className="acn-kpi"><span className="rot">Clientes</span><span className="val acn-num">{resumo.total}</span><span className="sub">{resumo.completos} com os dados fiscais completos</span></div>
        <div className="acn-kpi"><span className="rot"><i data-acn-familia="atencao" />Faltam dados</span><span className="val acn-num">{resumo.total - resumo.completos}</span><span className="sub">{CAMPOS_FISCAIS_DO_CLIENTE.map(c => `${c.rotulo}: ${resumo.porCampo[c.chave] || 0}`).join(' · ')}</span></div>
      </div>
      <div className="acn-fcad-barra">
        <div className="acn-cmp-busca-geral"><Icone path={mdiMagnify} size={14} /><input className="acn-input" type="search" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar cliente" placeholder="Nome, CNPJ/CPF, cidade…" /></div>
        <select className="acn-input acn-select-mini" value={campo} onChange={e => setCampo(e.target.value)} aria-label="Filtrar pelo que falta"><option value="">Qualquer pendência</option>{CAMPOS_FISCAIS_DO_CLIENTE.map(c => <option key={c.chave} value={c.chave}>Falta: {c.rotulo}</option>)}</select>
        <Chips rotulo="Tipo" ativo={tipo} onChange={setTipo} itens={[{ id: '', rotulo: 'PF e PJ' }, { id: 'PJ', rotulo: 'PJ' }, { id: 'PF', rotulo: 'PF' }]} />
        <Chips rotulo="Mostrar" ativo={soPendentes} onChange={setSoPendentes} itens={[{ id: 'sim', rotulo: 'Só com pendência' }, { id: 'nao', rotulo: 'Todos' }]} />
        <Botao pequeno icone={mdiRefresh} onClick={carregar} disabled={carregando}>Atualizar</Botao>
        <Botao pequeno icone={mdiDownload} onClick={exportar} disabled={carregando || !filtradas.length}>Baixar planilha</Botao>
      </div>
      {filtradas.length > LIMITE_NA_TELA && <Faixa tom="atencao">Mostrando os primeiros {LIMITE_NA_TELA} de {filtradas.length} clientes. Use a busca ou os filtros; a planilha leva todos.</Faixa>}
      <div className="acn-rolagem">
        <table className="acn-tabela acn-densa">
          <thead><tr><th>Cliente</th><th>Tipo</th><th>Cidade</th><th>O que falta</th><th>Ações</th></tr></thead>
          <tbody>
            {filtradas.slice(0, LIMITE_NA_TELA).map(({ c, falta }) => (
              <tr key={c.id}>
                <td><strong>{c.nome}</strong>{c.documento && <div className="acn-fraco acn-fcad-num">{c.documento}</div>}</td>
                <td><Selo familia={c.tipo === 'PJ' ? 'info' : 'ok'} ponto={false}>{c.tipo}</Selo></td>
                <td>{[c.cidade, c.estado].filter(Boolean).join(' / ') || '—'}</td>
                <td>{falta.length ? <div className="acn-fcad-faltas">{falta.map(f => <Selo key={f} familia="atencao" ponto={false}>{rotulo(f)}</Selo>)}</div> : <Selo familia="ok" ponto={false}>Completo</Selo>}</td>
                <td><div className="acn-fcad-acoes"><Botao pequeno onClick={() => setAberto(c)}>{podeEditar ? 'Preencher' : 'Ver'}</Botao></div></td>
              </tr>
            ))}
            {!filtradas.length && <tr><td colSpan={5} className="acn-centro acn-fraco">{carregando ? 'Carregando…' : d.erro ? 'Não foi possível ler.' : soPendentes === 'sim' && !busca && !tipo && !campo ? 'Nenhum cliente com pendência fiscal. 🎉' : 'Nenhum cliente com esse filtro.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {aberto && (
        <Janela titulo={`Dados fiscais — ${aberto.nome}`} onClose={() => { setAberto(null); carregar(); }} pequena
          rodape={<Botao onClick={() => { setAberto(null); carregar(); }}>Fechar</Botao>}>
          <p className="acn-fcad-dica">{[aberto.documento, [aberto.cidade, aberto.estado].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')}. O endereço, o telefone e o resto do cadastro se corrigem em Clientes.</p>
          <FiscalClienteCampos clienteId={aberto.id} currentUser={currentUser} podeEditar={podeEditar} />
        </Janela>
      )}
    </div>
  );
}

// ═══ Pendências: itens ════════════════════════════════════════════════════════════════════════
function PendenciasDosItens({ currentUser }) {
  const podeEditar = podeEditarCadastroFiscal(currentUser);
  const [d, setD] = useState<any>({ itens: [], fiscais: new Map(), erro: '', lido: false });
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [campo, setCampo] = useState('');
  const [soPendentes, setSoPendentes] = useState('sim');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [origemLote, setOrigemLote] = useState('0');
  const [aberto, setAberto] = useState<any>(null);
  const [aviso, setAviso] = useState<any>(null);
  const [aplicando, setAplicando] = useState(false);
  const carregar = async () => { setCarregando(true); const r = await lerPendenciasDosItens(); setD({ ...r, lido: true }); setCarregando(false); };
  useEffect(() => { carregar(); }, []);

  const linhas = useMemo(() => d.itens.map((it: any) => ({ it, falta: faltasDoItem(it, d.fiscais.get(it.id)) })), [d]);
  const resumo = useMemo(() => {
    const porCampo: Record<string, number> = {};
    for (const { falta } of linhas) for (const f of falta) porCampo[f] = (porCampo[f] || 0) + 1;
    return { total: linhas.length, completos: linhas.filter(l => !l.falta.length).length, porCampo };
  }, [linhas]);
  const filtradas = useMemo(() => linhas.filter(({ it, falta }) => {
    if (soPendentes === 'sim' && !falta.length) return false;
    if (campo && !falta.includes(campo)) return false;
    return !busca.trim() || combinaBusca([it.nome, it.codigo, it.ncm].join(' '), busca);
  }), [linhas, busca, campo, soPendentes]);
  const rotulo = (k: string) => CAMPOS_FISCAIS_DO_ITEM.find(x => x.chave === k)?.rotulo || k;

  const alternar = (id: string) => setMarcados(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const marcarFiltrados = () => setMarcados(new Set(filtradas.map(({ it }) => it.id)));

  const aplicar = async (campos: any, descricao: string) => {
    if (aplicando || !marcados.size) return;
    if (!await confirmar(`Aplicar "${descricao}" a ${marcados.size} ${marcados.size === 1 ? 'item' : 'itens'}?\n\nSó esse campo muda: o que cada item já tinha nos outros campos fiscais fica como está.`)) return;
    setAplicando(true); setAviso(null);
    const r = await aplicarFiscalEmLote([...marcados], campos, currentUser);
    setAplicando(false);
    if (!r.ok) { setAviso({ tom: 'erro', texto: r.erro }); await carregar(); return; }
    setAviso({ tom: 'ok', texto: `${r.gravados} ${r.gravados === 1 ? 'item atualizado' : 'itens atualizados'}${r.pulados ? ` (${r.pulados} já tinham CEST e ficaram de fora)` : ''}.` });
    setMarcados(new Set());
    await carregar();
  };

  const exportar = async () => {
    await baixarPlanilha('Itens_pendencias_fiscais', [{ nome: 'Itens', colunas: [{ rotulo: 'Código', largura: 14 }, { rotulo: 'Item', largura: 50 }, { rotulo: 'NCM', largura: 12 }, { rotulo: 'IPI %', formato: 'inteiro' }, { rotulo: 'Falta', largura: 40 }],
      linhas: filtradas.map(({ it, falta }) => [it.codigo || '', it.nome, it.ncm || '', Number(it.ipi_pct) || 0, falta.map(rotulo).join(', ')]) }]);
  };

  return (
    <div>
      <div className="acn-ajuda">Para emitir a nota o item precisa ter NCM, origem (0 a 8), se é monofásico no PIS/COFINS e o CEST (ou "não se aplica"); item que paga IPI também precisa do enquadramento. Marque vários itens iguais e aplique a mesma resposta de uma vez.</div>
      {d.erro && <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>Não foi possível ler {d.erroItens ? 'os itens' : 'os dados fiscais'} ({d.erro}). {d.erroFiscal ? 'Os números abaixo estão errados: tudo apareceria como "faltando".' : 'A lista está incompleta.'}</Faixa>}
      <div className="acn-kpis">
        <div className="acn-kpi"><span className="rot">Itens ativos</span><span className="val acn-num">{resumo.total}</span><span className="sub">{resumo.completos} com os dados fiscais completos</span></div>
        <div className="acn-kpi"><span className="rot"><i data-acn-familia="atencao" />Faltam dados</span><span className="val acn-num">{resumo.total - resumo.completos}</span><span className="sub">{CAMPOS_FISCAIS_DO_ITEM.map(c => `${c.rotulo}: ${resumo.porCampo[c.chave] || 0}`).join(' · ')}</span></div>
      </div>
      <div className="acn-fcad-barra">
        <div className="acn-cmp-busca-geral"><Icone path={mdiMagnify} size={14} /><input className="acn-input" type="search" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar item" placeholder="Nome, código, NCM…" /></div>
        <select className="acn-input acn-select-mini" value={campo} onChange={e => setCampo(e.target.value)} aria-label="Filtrar pelo que falta"><option value="">Qualquer pendência</option>{CAMPOS_FISCAIS_DO_ITEM.map(c => <option key={c.chave} value={c.chave}>Falta: {c.rotulo}</option>)}</select>
        <Chips rotulo="Mostrar" ativo={soPendentes} onChange={setSoPendentes} itens={[{ id: 'sim', rotulo: 'Só com pendência' }, { id: 'nao', rotulo: 'Todos' }]} />
        <Botao pequeno icone={mdiRefresh} onClick={carregar} disabled={carregando}>Atualizar</Botao>
        <Botao pequeno icone={mdiDownload} onClick={exportar} disabled={carregando || !filtradas.length}>Baixar planilha</Botao>
      </div>
      {podeEditar && (
        <div className="acn-fcad-barra-lote" role="group" aria-label="Aplicar a vários itens">
          <strong>{marcados.size ? `${marcados.size} marcado${marcados.size > 1 ? 's' : ''}` : 'Nenhum marcado'}</strong>
          <Botao pequeno onClick={marcarFiltrados} disabled={!filtradas.length}>Marcar os {filtradas.length} da lista</Botao>
          <Botao pequeno variante="discreto" onClick={() => setMarcados(new Set())} disabled={!marcados.size}>Limpar</Botao>
          <select className="acn-input acn-select-mini" value={origemLote} onChange={e => setOrigemLote(e.target.value)} aria-label="Origem a aplicar">{ORIGENS_FISCAIS.map(o => <option key={o.valor} value={String(o.valor)}>{o.rotulo}</option>)}</select>
          <Botao pequeno disabled={!marcados.size || aplicando} onClick={() => aplicar({ origem_fiscal: Number(origemLote) }, `Origem ${ORIGENS_FISCAIS.find(o => String(o.valor) === origemLote)?.rotulo}`)}>Aplicar origem</Botao>
          <Botao pequeno disabled={!marcados.size || aplicando} onClick={() => aplicar({ monofasico: false }, 'Não é monofásico')}>Não é monofásico</Botao>
          <Botao pequeno disabled={!marcados.size || aplicando} onClick={() => aplicar({ monofasico: true }, 'É monofásico')}>É monofásico</Botao>
          <Botao pequeno disabled={!marcados.size || aplicando} onClick={() => aplicar({ cest_nao_se_aplica: true }, 'CEST não se aplica')}>CEST não se aplica</Botao>
        </div>
      )}
      {aviso && <Faixa tom={aviso.tom}>{aviso.texto}</Faixa>}
      {filtradas.length > LIMITE_NA_TELA && <Faixa tom="atencao">Mostrando os primeiros {LIMITE_NA_TELA} de {filtradas.length} itens. "Marcar os {filtradas.length} da lista" marca todos, não só os da tela; a planilha também leva todos.</Faixa>}
      <div className="acn-rolagem">
        <table className="acn-tabela acn-densa">
          <thead><tr>{podeEditar && <th></th>}<th>Código</th><th>Item</th><th>NCM</th><th>O que falta</th><th>Ações</th></tr></thead>
          <tbody>
            {filtradas.slice(0, LIMITE_NA_TELA).map(({ it, falta }) => (
              <tr key={it.id}>
                {podeEditar && <td><input type="checkbox" checked={marcados.has(it.id)} onChange={() => alternar(it.id)} aria-label={`Marcar ${it.nome}`} /></td>}
                <td className="acn-fcad-num">{it.codigo || '—'}</td>
                <td><strong>{it.nome}</strong></td>
                <td className="acn-fcad-num">{it.ncm ? formatarNcm(it.ncm) : <Selo familia="atencao" ponto={false}>Sem NCM</Selo>}</td>
                <td>{falta.length ? <div className="acn-fcad-faltas">{falta.map(f => <Selo key={f} familia="atencao" ponto={false}>{rotulo(f)}</Selo>)}</div> : <Selo familia="ok" ponto={false}>Completo</Selo>}</td>
                <td><div className="acn-fcad-acoes"><Botao pequeno onClick={() => setAberto(it)}>{podeEditar ? 'Preencher' : 'Ver'}</Botao></div></td>
              </tr>
            ))}
            {!filtradas.length && <tr><td colSpan={podeEditar ? 6 : 5} className="acn-centro acn-fraco">{carregando ? 'Carregando…' : d.erro ? 'Não foi possível ler.' : soPendentes === 'sim' && !busca && !campo ? 'Nenhum item com pendência fiscal. 🎉' : 'Nenhum item com esse filtro.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {aberto && (
        <Janela titulo={`Dados fiscais — ${aberto.nome}`} onClose={() => { setAberto(null); carregar(); }} pequena
          rodape={<Botao onClick={() => { setAberto(null); carregar(); }}>Fechar</Botao>}>
          <p className="acn-fcad-dica">{[aberto.codigo, aberto.ncm ? `NCM ${formatarNcm(aberto.ncm)}` : 'sem NCM'].filter(Boolean).join(' · ')}. O NCM e o IPI (%) se corrigem no Cadastro de itens.</p>
          <FiscalItemCampos itemId={aberto.id} ncm={aberto.ncm} ipiPct={aberto.ipi_pct} currentUser={currentUser} podeEditar={podeEditar} />
        </Janela>
      )}
    </div>
  );
}

// ═══ OPs sem cliente: ligar a OP ao cliente do cadastro (27/11/2026) ═════════════════════════
// A OP só guardava o nome escrito do cliente; a nota precisa dos dados fiscais do cadastro. Aqui o Fiscal liga cada nome ao cadastro: uma escolha vale para todas as OPs que dizem aquele cliente.
function OpsSemCliente({ currentUser }) {
  const podeEditar = podeEditarCadastroFiscal(currentUser);
  const [d, setD] = useState<any>({ ops: [], clientes: [], erro: '' });
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [mostrar, setMostrar] = useState('todos');
  const [escolhendo, setEscolhendo] = useState<any>(null);   // o grupo para o qual se escolhe o cadastro à mão
  const [buscaCadastro, setBuscaCadastro] = useState('');
  const [aviso, setAviso] = useState<any>(null);
  const [gravando, setGravando] = useState(false);
  const carregar = async () => { setCarregando(true); const r = await lerOpsParaLigar(); setD(r); setCarregando(false); };
  useEffect(() => { carregar(); }, []);

  const grupos = useMemo(() => agruparParaLigar(d.ops, d.clientes), [d]);
  const resumo = useMemo(() => resumoDasLigacoes(grupos), [grupos]);
  const filtrados = useMemo(() => grupos.filter(g => {
    if (mostrar === 'com' && g.sugestao.situacao !== 'achado') return false;
    if (mostrar === 'sem' && g.sugestao.situacao === 'achado') return false;
    return !busca.trim() || combinaBusca([g.nome, ...g.ops.map(o => o.opl), g.sugestao.cliente?.nome].join(' '), busca);
  }), [grupos, busca, mostrar]);
  const candidatos = useMemo(() => {
    if (!escolhendo) return [];
    const q = buscaCadastro.trim() || escolhendo.nome;
    return d.clientes.filter(c => combinaBusca([c.nome, c.documento].join(' '), q)).slice(0, 30);
  }, [escolhendo, buscaCadastro, d.clientes]);

  const ligar = async (g: any, cliente: any) => {
    if (gravando) return;
    const n = g.ops.length;
    if (!await confirmar(`Ligar ${n === 1 ? 'a OP' : `as ${n} OPs`} do cliente "${g.nome}" ao cadastro "${cliente.nome}"${cliente.documento ? ` (${formatarDocumento(cliente.documento)})` : ''}?\n\nO nome escrito na OP não muda; a nota passa a usar os dados fiscais deste cadastro.`)) return;
    setGravando(true); setAviso(null);
    const r = await ligarOpsAoCliente(g.ops, cliente, currentUser);
    setGravando(false);
    setEscolhendo(null);
    setAviso(r.ok ? { tom: 'ok', texto: `${r.ligadas} ${r.ligadas === 1 ? 'OP ligada' : 'OPs ligadas'} a ${cliente.nome}.` } : { tom: 'erro', texto: r.erro });
    await carregar();
  };

  const ligarOsAchados = async () => {
    const lista = gruposComSugestao(grupos);
    if (gravando || !lista.length) return;
    if (!await confirmar(`Ligar ${resumo.opsComSugestao} OPs (${lista.length} ${lista.length === 1 ? 'cliente' : 'clientes'}) ao cadastro que o sistema achou sozinho?\n\nSó entram os nomes que batem com UM cadastro (pelo CPF/CNPJ da OP ou pelo nome idêntico). O que tem dois cadastros iguais ou nenhum fica de fora, para você escolher.`)) return;
    setGravando(true); setAviso(null);
    let ligadas = 0, clientes = 0;
    for (const g of lista) {
      const r = await ligarOpsAoCliente(g.ops, g.sugestao.cliente, currentUser);
      ligadas += r.ligadas;
      if (r.ligadas) clientes++;
      if (!r.ok) { setGravando(false); setAviso({ tom: 'erro', texto: `${r.erro} Antes de parar: ${ligadas} OP(s) de ${clientes} cliente(s) já tinham sido ligadas.` }); await carregar(); return; }
    }
    setGravando(false);
    setAviso({ tom: 'ok', texto: `${ligadas} OPs ligadas (${clientes} ${clientes === 1 ? 'cliente' : 'clientes'}).` });
    await carregar();
  };

  const exportar = async () => {
    await baixarPlanilha('OPs_sem_cliente_ligado', [{ nome: 'OPs', colunas: [{ rotulo: 'OP', largura: 16 }, { rotulo: 'Cliente escrito na OP', largura: 40 }, { rotulo: 'Etapa', largura: 28 }, { rotulo: 'Cadastro sugerido', largura: 40 }],
      linhas: filtrados.flatMap(g => g.ops.map(o => [o.opl, g.nome, o.status_geral || '', g.sugestao.cliente?.nome || (g.sugestao.situacao === 'ambiguo' ? 'mais de um cadastro' : 'não achei')])) }]);
  };

  const rotuloSugestao = (g: any) => g.sugestao.situacao === 'achado'
    ? <div><strong>{g.sugestao.cliente.nome}</strong>{g.sugestao.cliente.documento && <div className="acn-fraco acn-fcad-num">{formatarDocumento(g.sugestao.cliente.documento)}</div>}<Selo familia="ok" ponto={false}>{g.sugestao.por === 'documento' ? 'achado pelo CPF/CNPJ' : 'nome idêntico'}</Selo></div>
    : g.sugestao.situacao === 'ambiguo' ? <Selo familia="atencao" ponto={false}>Mais de um cadastro: escolha</Selo>
    : g.sugestao.situacao === 'sem_nome' ? <Selo familia="atencao" ponto={false}>OP sem nome de cliente</Selo>
    : <Selo familia="atencao" ponto={false}>Não achei no cadastro</Selo>;

  return (
    <div>
      <div className="acn-ajuda">A OP só guarda o nome do cliente como foi digitado, e a nota fiscal precisa dos dados do cadastro (inscrição estadual, município, tipo de órgão). Ligue cada nome ao cliente do cadastro: a escolha vale para todas as OPs com aquele nome. OP nova já nasce ligada quando o vendedor escolhe o cliente da lista.</div>
      {d.erro && <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>Não foi possível ler as OPs ou os clientes ({d.erro}). A lista abaixo está incompleta.</Faixa>}
      <div className="acn-kpis">
        <div className="acn-kpi"><span className="rot"><i data-acn-familia="atencao" />OPs sem cliente ligado</span><span className="val acn-num">{resumo.ops}</span><span className="sub">{resumo.nomes} {resumo.nomes === 1 ? 'nome de cliente' : 'nomes de cliente'}; só as que ainda não têm nota</span></div>
        <div className="acn-kpi"><span className="rot">O cadastro achou sozinho</span><span className="val acn-num">{resumo.opsComSugestao}</span><span className="sub">{resumo.nomesComSugestao} {resumo.nomesComSugestao === 1 ? 'nome' : 'nomes'} · {resumo.opsSemSugestao} OPs pedem a sua escolha</span></div>
      </div>
      <div className="acn-fcad-barra">
        <div className="acn-cmp-busca-geral"><Icone path={mdiMagnify} size={14} /><input className="acn-input" type="search" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar cliente ou OP" placeholder="Cliente, número da OP…" /></div>
        <Chips rotulo="Mostrar" ativo={mostrar} onChange={setMostrar} itens={[{ id: 'todos', rotulo: 'Todos' }, { id: 'com', rotulo: 'Com cadastro achado' }, { id: 'sem', rotulo: 'Pedem escolha' }]} />
        <Botao pequeno icone={mdiRefresh} onClick={carregar} disabled={carregando || gravando}>Atualizar</Botao>
        <Botao pequeno icone={mdiDownload} onClick={exportar} disabled={carregando || !filtrados.length}>Baixar planilha</Botao>
      </div>
      {podeEditar && (
        <div className="acn-fcad-barra-lote" role="group" aria-label="Ligar de uma vez">
          <strong>{resumo.nomesComSugestao ? `${resumo.opsComSugestao} OPs com cadastro achado` : 'Nada para ligar sozinho'}</strong>
          <Botao pequeno variante="primario" onClick={ligarOsAchados} disabled={!resumo.nomesComSugestao || gravando}>{gravando ? 'Ligando…' : `Ligar as ${resumo.opsComSugestao} OPs que o cadastro achou`}</Botao>
        </div>
      )}
      {aviso && <Faixa tom={aviso.tom}>{aviso.texto}</Faixa>}
      {filtrados.length > LIMITE_NA_TELA && <Faixa tom="atencao">Mostrando os primeiros {LIMITE_NA_TELA} de {filtrados.length} clientes. Use a busca ou os filtros; a planilha leva todos.</Faixa>}
      <div className="acn-rolagem">
        <table className="acn-tabela acn-densa">
          <thead><tr><th>Cliente escrito na OP</th><th>OPs</th><th>Cadastro</th><th>Ações</th></tr></thead>
          <tbody>
            {filtrados.slice(0, LIMITE_NA_TELA).map(g => (
              <tr key={g.chave || 'sem-nome'}>
                <td><strong>{g.nome || '(sem nome)'}</strong></td>
                <td><span className="acn-num">{g.ops.length}</span><div className="acn-fraco acn-fcad-num">{g.ops.slice(0, 4).map(o => o.opl).join(', ')}{g.ops.length > 4 ? ` e mais ${g.ops.length - 4}` : ''}</div></td>
                <td>{rotuloSugestao(g)}</td>
                <td><div className="acn-fcad-acoes">
                  {podeEditar && g.sugestao.situacao === 'achado' && <Botao pequeno variante="primario" disabled={gravando} onClick={() => ligar(g, g.sugestao.cliente)}>Ligar</Botao>}
                  {podeEditar && g.chave && <Botao pequeno disabled={gravando} onClick={() => { setBuscaCadastro(''); setEscolhendo(g); }}>{g.sugestao.situacao === 'achado' ? 'Outro cliente…' : 'Escolher o cliente…'}</Botao>}
                </div></td>
              </tr>
            ))}
            {!filtrados.length && <tr><td colSpan={4} className="acn-centro acn-fraco">{carregando ? 'Carregando…' : d.erro ? 'Não foi possível ler.' : !busca && mostrar === 'todos' ? 'Toda OP que ainda vai virar nota está ligada a um cliente do cadastro. 🎉' : 'Nenhum cliente com esse filtro.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {escolhendo && (
        <Janela titulo={`Ligar "${escolhendo.nome}" a um cliente do cadastro`} onClose={() => setEscolhendo(null)}
          rodape={<Botao onClick={() => setEscolhendo(null)}>Cancelar</Botao>}>
          <p className="acn-fcad-dica">{escolhendo.ops.length === 1 ? 'A OP' : `As ${escolhendo.ops.length} OPs`} {escolhendo.ops.slice(0, 6).map(o => o.opl).join(', ')}{escolhendo.ops.length > 6 ? ' e outras' : ''} passam a usar o cadastro que você escolher. Cliente que não está na lista se cadastra em Clientes.</p>
          <div className="acn-cmp-busca-geral"><Icone path={mdiMagnify} size={14} /><input className="acn-input" type="search" autoFocus value={buscaCadastro} onChange={e => setBuscaCadastro(e.target.value)} aria-label="Buscar no cadastro de clientes" placeholder={`Buscar no cadastro (começa por "${escolhendo.nome}")`} /></div>
          <div className="acn-rolagem">
            <table className="acn-tabela acn-densa">
              <thead><tr><th>Cliente</th><th>CPF/CNPJ</th><th>Cidade</th><th>Ações</th></tr></thead>
              <tbody>
                {candidatos.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.nome}</strong></td>
                    <td className="acn-fcad-num">{c.documento ? formatarDocumento(c.documento) : '—'}</td>
                    <td>{[c.cidade, c.estado].filter(Boolean).join(' / ') || '—'}</td>
                    <td><div className="acn-fcad-acoes"><Botao pequeno variante="primario" disabled={gravando} onClick={() => ligar(escolhendo, c)}>Ligar a este</Botao></div></td>
                  </tr>
                ))}
                {!candidatos.length && <tr><td colSpan={4} className="acn-centro acn-fraco">Nenhum cliente do cadastro combina com a busca.</td></tr>}
              </tbody>
            </table>
          </div>
        </Janela>
      )}
    </div>
  );
}

// ═══ A aba ════════════════════════════════════════════════════════════════════════════════════
export default function FiscalCadastrosTela({ currentUser }) {
  const [visao, setVisao] = useAbaNoEndereco({ tela: 'fiscal', nivel: 1, pai: 'cadastros' });
  const podeEditar = podeEditarCadastroFiscal(currentUser);
  const transportadoraPode = podeEditar || (Array.isArray(currentUser?.abas_permitidas) && currentUser.abas_permitidas.includes('logistica'));
  return (
    <div>
      <Chips ativo={visao} onChange={setVisao} rotulo="Cadastro" itens={[
        { id: 'empresas', rotulo: 'Empresas emitentes' },
        { id: 'transportadoras', rotulo: 'Transportadoras' },
        { id: 'clientes', rotulo: 'Clientes: o que falta' },
        { id: 'itens', rotulo: 'Itens: o que falta' },
        { id: 'ops', rotulo: 'OPs sem cliente' },
        { id: 'tipos', rotulo: 'Tipos de nota' },
        { id: 'regras', rotulo: 'Regras' },
      ]} />
      {visao === 'empresas' && <EmpresasEmitentes currentUser={currentUser} podeEditar={podeEditar} />}
      {visao === 'transportadoras' && <TransportadorasFiscais currentUser={currentUser} podeEditar={transportadoraPode} />}
      {visao === 'clientes' && <PendenciasDosClientes currentUser={currentUser} />}
      {visao === 'itens' && <PendenciasDosItens currentUser={currentUser} />}
      {visao === 'ops' && <OpsSemCliente currentUser={currentUser} />}
      {visao === 'tipos' && <FiscalTiposDeNotaTela />}
      {visao === 'regras' && <FiscalRegrasTela currentUser={currentUser} />}
    </div>
  );
}
