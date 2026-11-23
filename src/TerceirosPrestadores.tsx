// @ts-nocheck
// A aba "Prestadores" dos Serviços de terceiros e a janela de cadastro (fatia T1 do PLANO_SERVICOS_TERCEIROS.md, 22/11/2026; as regras estão em TerceirosModelo.ts).
// Mesmo desenho do cadastro de fornecedores do Compras (lista, busca, situação, cadastrar, editar, desativar e reativar), com uma diferença: o prestador marca QUE serviços faz.
// Na janela de pedir (fatia T2) só aparecem os prestadores que fazem o tipo escolhido; quem não marcou nenhum aparece para qualquer tipo.
import React, { useEffect, useMemo, useState } from 'react';
import { mdiClose, mdiPlus, mdiMagnify, mdiPencilOutline, mdiCancel, mdiRestore } from '@mdi/js';
import Icone from './Icone';
import { Botao, Faixa, Selo, SelectMultiplo, Chips } from './Interface';
import { confirmar } from './Feedback';
import { logChange } from './AuditSystem';
import { combinaBusca } from './SearchUtils';
import { CampoTelefone } from './CampoTelefone';
import { CampoCep } from './CampoCep';
import { conferirCepAntesDeSalvar } from './Cep';
import {
  formatarDocumento, formDoPrestador, salvarPrestador, mudarAtivoDoPrestador, contarServicosDosPrestadores, nomesDosTiposDoPrestador, prestadorFazOTipo,
} from './TerceirosModelo';

/** Janela de cadastro/edição. `aoSalvar(prestador)` recebe o registro gravado (a janela de pedir, na T2, a usa para já escolher o prestador recém-cadastrado). */
export function ModalPrestador({ prestador = null, existentes, tipos, onClose, aoSalvar, currentUser }) {
  const [form, setForm] = useState(() => formDoPrestador(prestador));
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  // um tipo desativado depois de o prestador marcá-lo continua na lista dele: senão salvar sem querer o tiraria sem ninguém pedir
  const opcoesDeTipos = useMemo(() => tipos
    .filter(t => t.ativo || (prestador?.tipos_ids || []).includes(t.id))
    .map(t => ({ valor: t.id, rotulo: t.ativo ? t.nome : `${t.nome} (inativo)` })), [tipos, prestador]);
  const nomeDoTipo = useMemo(() => Object.fromEntries(tipos.map(t => [t.id, t.nome])), [tipos]);

  const salvar = async () => {
    if (ocupado) return;
    setErro('');
    setOcupado(true);
    // o CEP só barra se foi mexido agora (um CEP antigo inválido não trava a edição de outro campo)
    const recusaCep = await conferirCepAntesDeSalvar(form.cep, 'CEP', prestador?.cep);
    if (recusaCep) { setOcupado(false); setErro(recusaCep); return; }
    const r = await salvarPrestador(form, existentes, currentUser, prestador?.id || null);
    setOcupado(false);
    if (r.erro) { setErro(r.erro); return; }
    logChange({
      module: 'terceiros', entityType: 'terceiros_prestadores', entityId: r.prestador.id, changeType: prestador ? 'UPDATE' : 'CREATE',
      oldRow: r.antes || undefined, newRow: r.prestador, user: currentUser,
      // no histórico os tipos aparecem pelo nome, não pelo código
      formatters: { tipos_ids: (v: any) => (Array.isArray(v) && v.length ? v.map((id: string) => nomeDoTipo[id] || id).join(', ') : 'qualquer serviço') },
    });
    aoSalvar(r.prestador);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-terc-box" role="dialog" aria-label={prestador ? 'Editar prestador' : 'Cadastrar prestador'}>
        <div className="acn-modal-cab">
          <span className="modal-title">{prestador ? 'Editar prestador' : 'Cadastrar prestador'}</span>
          <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} />
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-terc-grade">
            <div className="acn-terc-campo acn-terc-largo"><label className="acn-label" htmlFor="terc-p-nome">Nome do prestador *</label>
              <input id="terc-p-nome" className="acn-input" value={form.nome} autoFocus onChange={e => set('nome', e.target.value)} placeholder="Como o pessoal o conhece" />
              <p className="acn-terc-dica">É o nome que aparece na hora de escolher o prestador num pedido de serviço.</p></div>
            <div className="acn-terc-campo acn-terc-largo"><span className="acn-label">Que serviços faz</span>
              <SelectMultiplo rotulo="Serviços que faz" placeholder="Escolha um ou mais…" valores={form.tipos_ids} onChange={v => set('tipos_ids', v)} opcoes={opcoesDeTipos} />
              <p className="acn-terc-dica">Na hora de pedir um serviço, só aparecem os prestadores que fazem aquele tipo. Deixe em branco se ele faz de tudo ou se ainda não sabe: ele aparece para qualquer serviço.</p></div>
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-p-contato">Pessoa de contato</label>
              <input id="terc-p-contato" className="acn-input" value={form.contato_nome} onChange={e => set('contato_nome', e.target.value)} /></div>
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-p-tel">Telefone</label>
              <CampoTelefone id="terc-p-tel" valor={form.telefone} onChange={v => set('telefone', v)} /></div>
            <div className="acn-terc-campo acn-terc-largo"><label className="acn-label" htmlFor="terc-p-email">E-mail</label>
              <input id="terc-p-email" className="acn-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="contato@empresa.com.br" /></div>
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-p-razao">Razão social</label>
              <input id="terc-p-razao" className="acn-input" value={form.razao_social} onChange={e => set('razao_social', e.target.value)} /></div>
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-p-doc">CNPJ ou CPF</label>
              <input id="terc-p-doc" className="acn-input" inputMode="numeric" value={form.cnpj_cpf} onChange={e => set('cnpj_cpf', formatarDocumento(e.target.value))} placeholder="00.000.000/0000-00" /></div>
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-p-cep">CEP</label>
              <CampoCep id="terc-p-cep" valor={form.cep} onChange={v => set('cep', v)}
                onResultado={(r: any) => { if (r?.status === 'ok') setForm(f => ({ ...f, cidade: r.cidade || f.cidade, uf: r.uf || f.uf, logradouro: f.logradouro || r.logradouro || '', bairro: f.bairro || r.bairro || '' })); }} /></div>
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-p-rua">Rua</label>
              <input id="terc-p-rua" className="acn-input" value={form.logradouro} onChange={e => set('logradouro', e.target.value)} /></div>
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-p-num">Número</label>
              <input id="terc-p-num" className="acn-input" value={form.numero} onChange={e => set('numero', e.target.value)} /></div>
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-p-comp">Complemento</label>
              <input id="terc-p-comp" className="acn-input" value={form.complemento} onChange={e => set('complemento', e.target.value)} /></div>
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-p-bairro">Bairro</label>
              <input id="terc-p-bairro" className="acn-input" value={form.bairro} onChange={e => set('bairro', e.target.value)} /></div>
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-p-cidade">Cidade</label>
              <input id="terc-p-cidade" className="acn-input" value={form.cidade} onChange={e => set('cidade', e.target.value)} /></div>
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-p-uf">UF</label>
              <input id="terc-p-uf" className="acn-input" maxLength={2} value={form.uf} onChange={e => set('uf', e.target.value.toUpperCase())} placeholder="SC" /></div>
            <div className="acn-terc-campo acn-terc-largo"><label className="acn-label" htmlFor="terc-p-obs">Observação</label>
              <textarea id="terc-p-obs" className="acn-input" rows={3} value={form.observacao} onChange={e => set('observacao', e.target.value)} placeholder="Horário de atendimento, prazo costumeiro, quem atende, se busca o carro…" /></div>
          </div>
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape">
          <Botao variante="secundario" onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando…' : (prestador ? 'Salvar' : 'Cadastrar')}</Botao>
        </div>
      </div>
    </div>
  );
}

/** A aba "Prestadores": lista, busca, filtro por situação e por tipo, cadastrar, editar, desativar e reativar. Quem não cadastra só lê. */
export function PrestadoresDeTerceiros({ prestadores, tipos, erro, onMudou, podeCadastrar, currentUser }) {
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('ativos');
  const [tipoId, setTipoId] = useState('');
  const [modal, setModal] = useState<any>(null);       // { prestador } | {}
  const [aviso, setAviso] = useState('');
  const [usos, setUsos] = useState<Record<string, number> | null>(null);

  useEffect(() => { contarServicosDosPrestadores().then(setUsos); }, [prestadores]);

  const lista = useMemo(() => prestadores.filter(p => {
    if (situacao === 'ativos' && !p.ativo) return false;
    if (situacao === 'inativos' && p.ativo) return false;
    // filtrar por tipo mostra também quem não marcou nenhum (faz qualquer serviço), como a janela de pedir fará
    if (tipoId && !prestadorFazOTipo(p, tipoId)) return false;
    return !busca.trim() || combinaBusca([p.nome, p.razao_social, p.cnpj_cpf, formatarDocumento(p.cnpj_cpf), p.contato_nome, p.email, p.cidade, p.uf, nomesDosTiposDoPrestador(p, tipos).join(' ')].join(' '), busca);
  }), [prestadores, tipos, busca, situacao, tipoId]);

  const mudarAtivo = async (p: any, ativo: boolean) => {
    const n = usos?.[p.id] || 0;
    if (!ativo && !await confirmar(`Desativar o prestador "${p.nome}"?\n\nEle deixa de aparecer para escolher em serviços novos.${n ? (n === 1 ? ' O serviço já pedido com ele continua como está.' : ` Os ${n} serviços já pedidos com ele continuam como estão.`) : ''} Dá para reativar depois.`)) return;
    const e = await mudarAtivoDoPrestador(p, ativo, currentUser);
    if (e) { setAviso(e); return; }
    setAviso('');
    logChange({ module: 'terceiros', entityType: 'terceiros_prestadores', entityId: p.id, changeType: 'UPDATE', oldRow: { ativo: p.ativo }, newRow: { ativo }, user: currentUser });
    onMudou();
  };

  const colunas = podeCadastrar ? 7 : 6;

  return (
    <div className="acn-terc">
      <div className="acn-cmp-cab">
        <div className="acn-cmp-cab-esq">
          <h2 className="acn-cmp-titulo">Prestadores cadastrados</h2>
          {podeCadastrar && <Botao pequeno variante="primario" icone={mdiPlus} onClick={() => setModal({})}>Cadastrar prestador</Botao>}
        </div>
        <div className="acn-cmp-filtros">
          <div className="acn-cmp-busca-geral">
            <Icone path={mdiMagnify} size={14} />
            <input className="acn-input" type="search" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar prestador" placeholder="Nome, CNPJ, contato, cidade, serviço…" />
          </div>
          <select className="acn-input acn-select-mini" value={tipoId} onChange={e => setTipoId(e.target.value)} aria-label="Filtrar por tipo de serviço">
            <option value="">Todos os serviços</option>
            {tipos.filter(t => t.ativo).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <Chips rotulo="Situação" ativo={situacao} onChange={setSituacao} itens={[{ id: 'ativos', rotulo: 'Ativos' }, { id: 'inativos', rotulo: 'Inativos' }, { id: 'todos', rotulo: 'Todos' }]} />
        </div>
      </div>
      <div className="acn-ajuda">
        Prestadores são as empresas e os profissionais de fora que fazem os serviços (película, pintura, lavagem…). Este cadastro é só dos Serviços de terceiros: não é o de fornecedores do Compras.
        Nada se apaga: quem parou de atender fica inativo.{!podeCadastrar && ' Quem cadastra e corrige: Admin, gerentes e a Adaptação.'}
      </div>
      {erro && <Faixa tom="erro">Não foi possível ler os prestadores ({erro}). A lista abaixo pode estar desatualizada ou incompleta.</Faixa>}
      {aviso && <Faixa tom="erro">{aviso}</Faixa>}
      <div className="acn-rolagem">
        <table className="acn-tabela acn-densa">
          <thead><tr><th>Prestador</th><th>CNPJ / CPF</th><th>Contato</th><th>Cidade</th><th>Serviços que faz</th><th>Pedidos</th>{podeCadastrar && <th>Ações</th>}</tr></thead>
          <tbody>
            {lista.map(p => {
              const faz = nomesDosTiposDoPrestador(p, tipos);
              return (
                <tr key={p.id} className={p.ativo ? '' : 'acn-terc-inativo'}>
                  <td>
                    <strong>{p.nome}</strong>{!p.ativo && <> <Selo familia="neutro" ponto={false}>Inativo</Selo></>}
                    {p.razao_social && p.razao_social !== p.nome && <div className="acn-fraco">{p.razao_social}</div>}
                  </td>
                  <td className="acn-num">{formatarDocumento(p.cnpj_cpf) || '—'}</td>
                  <td>{p.contato_nome || '—'}{p.telefone && <div className="acn-fraco">{p.telefone}</div>}{p.email && <div className="acn-fraco">{p.email}</div>}</td>
                  <td>{[p.cidade, p.uf].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="acn-terc-fazem">{faz.length ? faz.join(', ') : <span className="acn-terc-vazio">Qualquer serviço</span>}</td>
                  <td className="acn-num">{usos ? (usos[p.id] || 0) : '…'}</td>
                  {podeCadastrar && (
                    <td className="acn-dir acn-terc-acoes">
                      <Botao pequeno variante="discreto" icone={mdiPencilOutline} aria-label={`Editar ${p.nome}`} title="Editar" onClick={() => setModal({ prestador: p })} />
                      {p.ativo
                        ? <Botao pequeno variante="discreto" icone={mdiCancel} aria-label={`Desativar ${p.nome}`} title="Desativar" onClick={() => mudarAtivo(p, false)} />
                        : <Botao pequeno variante="discreto" icone={mdiRestore} aria-label={`Reativar ${p.nome}`} title="Reativar" onClick={() => mudarAtivo(p, true)} />}
                    </td>
                  )}
                </tr>
              );
            })}
            {lista.length === 0 && (
              <tr><td colSpan={colunas} className="acn-centro acn-fraco">
                {prestadores.length === 0
                  ? (podeCadastrar ? 'Nenhum prestador cadastrado ainda. Cadastre o primeiro no botão acima.' : 'Nenhum prestador cadastrado ainda. Quem cadastra: Admin, gerentes e a Adaptação.')
                  : 'Nenhum prestador encontrado com esse filtro.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {modal && (
        <ModalPrestador prestador={modal.prestador || null} existentes={prestadores} tipos={tipos} currentUser={currentUser}
          onClose={() => setModal(null)} aoSalvar={() => { setModal(null); onMudou(); }} />
      )}
    </div>
  );
}
