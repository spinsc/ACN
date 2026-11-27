// Aba "Fornecedores" do Compras e a janela de cadastro (pedido do usuário em 16/11/2026; regras em ComprasFornecedores.ts): o fornecedor de uma cotação tem de estar cadastrado aqui.
// A janela de cadastro também abre pela própria cotação ("Cadastrar fornecedor"), para o comprador não perder o que já preencheu.
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
  CATEGORIAS_DE_FORNECEDOR, FORM_VAZIO_FORNECEDOR, formDoFornecedor, formatarDocumento, salvarFornecedor, mudarAtivoDoFornecedor, contarCotacoesDosFornecedores,
} from './ComprasFornecedores';

/** Janela de cadastro/edição. `aoSalvar(fornecedor)` recebe o registro gravado (a cotação o usa para já escolher o fornecedor). `nomeInicial` vem do que a pessoa digitou na cotação. */
export function ModalFornecedor({ fornecedor = null, existentes, nomeInicial = '', onClose, aoSalvar, currentUser }) {
  const [form, setForm] = useState(() => ({ ...formDoFornecedor(fornecedor), ...(fornecedor ? {} : { nome: nomeInicial }) }));
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const salvar = async () => {
    if (ocupado) return;
    setErro('');
    setOcupado(true);
    // o CEP só barra se foi mexido agora (um CEP antigo inválido não trava a edição de outro campo)
    const recusaCep = await conferirCepAntesDeSalvar(form.cep, 'CEP', fornecedor?.cep);
    if (recusaCep) { setOcupado(false); setErro(recusaCep); return; }
    const r = await salvarFornecedor(form, existentes, currentUser, fornecedor?.id || null);
    setOcupado(false);
    if (r.erro) { setErro(r.erro); return; }
    logChange({ module: 'compras', entityType: 'compras_fornecedores', entityId: r.fornecedor.id, changeType: fornecedor ? 'UPDATE' : 'CREATE',
      oldRow: r.antes || undefined, newRow: r.fornecedor, user: currentUser });
    aoSalvar(r.fornecedor);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-forn-box" role="dialog" aria-label={fornecedor ? 'Editar fornecedor' : 'Cadastrar fornecedor'}>
        <div className="acn-modal-cab">
          <span className="modal-title">{fornecedor ? 'Editar fornecedor' : 'Cadastrar fornecedor'}</span>
          <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} />
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-forn-grade">
            <div className="acn-forn-campo acn-forn-largo"><label className="acn-label">Nome do fornecedor *</label>
              <input className="acn-input" value={form.nome} autoFocus onChange={e => set('nome', e.target.value)} placeholder="Como o comprador o conhece (aparece na cotação)" /></div>
            <div className="acn-forn-campo acn-forn-largo"><label className="acn-label">Razão social</label>
              <input className="acn-input" value={form.razao_social} onChange={e => set('razao_social', e.target.value)} /></div>
            <div className="acn-forn-campo"><label className="acn-label">CNPJ ou CPF</label>
              <input className="acn-input" inputMode="numeric" value={form.cnpj_cpf} onChange={e => set('cnpj_cpf', formatarDocumento(e.target.value))} placeholder="00.000.000/0000-00" /></div>
            <div className="acn-forn-campo"><label className="acn-label">Condição de pagamento padrão</label>
              <input className="acn-input" value={form.condicao_pagamento} onChange={e => set('condicao_pagamento', e.target.value)} placeholder="Ex.: 28 dias, à vista, 30/60" /></div>
            <div className="acn-forn-campo"><label className="acn-label">Pessoa de contato</label>
              <input className="acn-input" value={form.contato_nome} onChange={e => set('contato_nome', e.target.value)} /></div>
            <div className="acn-forn-campo"><label className="acn-label">Telefone</label>
              <CampoTelefone valor={form.telefone} onChange={v => set('telefone', v)} /></div>
            <div className="acn-forn-campo acn-forn-largo"><label className="acn-label">E-mail</label>
              <input className="acn-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="compras@empresa.com.br" /></div>
            <div className="acn-forn-campo"><label className="acn-label">CEP</label>
              <CampoCep valor={form.cep} onChange={v => set('cep', v)}
                onResultado={(r) => { if (r?.status === 'ok') setForm(f => ({ ...f, cidade: r.cidade || f.cidade, uf: r.uf || f.uf, logradouro: f.logradouro || r.logradouro || '', bairro: f.bairro || r.bairro || '' })); }} /></div>
            <div className="acn-forn-campo"><label className="acn-label">Rua</label>
              <input className="acn-input" value={form.logradouro} onChange={e => set('logradouro', e.target.value)} /></div>
            <div className="acn-forn-campo"><label className="acn-label">Número</label>
              <input className="acn-input" value={form.numero} onChange={e => set('numero', e.target.value)} /></div>
            <div className="acn-forn-campo"><label className="acn-label">Complemento</label>
              <input className="acn-input" value={form.complemento} onChange={e => set('complemento', e.target.value)} /></div>
            <div className="acn-forn-campo"><label className="acn-label">Bairro</label>
              <input className="acn-input" value={form.bairro} onChange={e => set('bairro', e.target.value)} /></div>
            <div className="acn-forn-campo"><label className="acn-label">Cidade</label>
              <input className="acn-input" value={form.cidade} onChange={e => set('cidade', e.target.value)} /></div>
            <div className="acn-forn-campo"><label className="acn-label">UF</label>
              <input className="acn-input" maxLength={2} value={form.uf} onChange={e => set('uf', e.target.value.toUpperCase())} placeholder="SC" /></div>
            <div className="acn-forn-campo acn-forn-largo"><label className="acn-label">O que costuma fornecer</label>
              <SelectMultiplo rotulo="Categorias" placeholder="Escolha uma ou mais…" valores={form.categorias} onChange={v => set('categorias', v)}
                opcoes={CATEGORIAS_DE_FORNECEDOR.map(c => ({ valor: c, rotulo: c }))} /></div>
            <div className="acn-forn-campo acn-forn-largo"><label className="acn-label">Observação</label>
              <textarea className="acn-input" rows={3} value={form.observacao} onChange={e => set('observacao', e.target.value)} placeholder="Prazo de entrega costumeiro, pedido mínimo, quem atende…" /></div>
          </div>
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape">
          <Botao variante="secundario" onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando…' : (fornecedor ? 'Salvar' : 'Cadastrar')}</Botao>
        </div>
      </div>
    </div>
  );
}

/** A aba "Fornecedores": lista, busca, filtro por situação, cadastrar, editar, desativar e reativar. */
export function FornecedoresCompras({ fornecedores, erro, onMudou, currentUser }) {
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('ativos');
  const [modal, setModal] = useState<any>(null);       // { fornecedor } | {}
  const [aviso, setAviso] = useState('');
  const [usos, setUsos] = useState<Record<string, number> | null>(null);

  useEffect(() => { contarCotacoesDosFornecedores().then(setUsos); }, [fornecedores]);

  const lista = useMemo(() => fornecedores.filter(f => {
    if (situacao === 'ativos' && !f.ativo) return false;
    if (situacao === 'inativos' && f.ativo) return false;
    return !busca.trim() || combinaBusca([f.nome, f.razao_social, f.cnpj_cpf, f.contato_nome, f.email, f.cidade, f.uf, (f.categorias || []).join(' ')].join(' '), busca);
  }), [fornecedores, busca, situacao]);

  const mudarAtivo = async (f: any, ativo: boolean) => {
    const n = usos?.[f.id] || 0;
    if (!ativo && !await confirmar(`Desativar o fornecedor "${f.nome}"?\n\nEle deixa de aparecer para escolher em cotações novas.${n ? ` As ${n} cotação${n !== 1 ? 'ões' : ''} já feita${n !== 1 ? 's' : ''} com ele não mudam.` : ''} Dá para reativar depois.`)) return;
    const e = await mudarAtivoDoFornecedor(f, ativo, currentUser);
    if (e) { setAviso(e); return; }
    setAviso('');
    logChange({ module: 'compras', entityType: 'compras_fornecedores', entityId: f.id, changeType: 'UPDATE', oldRow: { ativo: f.ativo }, newRow: { ativo }, user: currentUser });
    onMudou();
  };

  return (
    <div className="acn-forn">
      <div className="acn-cmp-cab">
        <div className="acn-cmp-cab-esq">
          <h2 className="acn-cmp-titulo">Fornecedores cadastrados</h2>
          <Botao pequeno variante="primario" icone={mdiPlus} onClick={() => setModal({})}>Cadastrar fornecedor</Botao>
        </div>
        <div className="acn-cmp-filtros">
          <div className="acn-cmp-busca-geral">
            <Icone path={mdiMagnify} size={14} />
            <input className="acn-input" type="search" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar fornecedor" placeholder="Nome, CNPJ, contato, cidade, categoria…" />
          </div>
          <Chips rotulo="Situação" ativo={situacao} onChange={setSituacao} itens={[{ id: 'ativos', rotulo: 'Ativos' }, { id: 'inativos', rotulo: 'Inativos' }, { id: 'todos', rotulo: 'Todos' }]} />
        </div>
      </div>
      <div className="acn-ajuda acn-forn-ajuda">A cotação do Compras só aceita fornecedor cadastrado aqui. Se o fornecedor ainda não está na lista, cadastre-o antes de lançar a cotação (o atalho "Cadastrar fornecedor" também aparece na própria cotação).</div>
      {erro && <Faixa tom="erro">Não foi possível ler os fornecedores ({erro}). A lista abaixo pode estar incompleta.</Faixa>}
      {aviso && <Faixa tom="erro">{aviso}</Faixa>}
      <div className="acn-rolagem">
        <table className="acn-tabela acn-densa">
          <thead><tr><th>Fornecedor</th><th>CNPJ / CPF</th><th>Contato</th><th>Cidade</th><th>Fornece</th><th>Cotações</th><th /></tr></thead>
          <tbody>
            {lista.map(f => (
              <tr key={f.id} className={f.ativo ? '' : 'acn-forn-inativo'}>
                <td>
                  <strong>{f.nome}</strong>{!f.ativo && <> <Selo familia="neutro" ponto={false}>Inativo</Selo></>}
                  {f.razao_social && f.razao_social !== f.nome && <div className="acn-fraco">{f.razao_social}</div>}
                </td>
                <td className="acn-num">{formatarDocumento(f.cnpj_cpf) || '—'}</td>
                <td>{f.contato_nome || '—'}{f.telefone && <div className="acn-fraco">{f.telefone}</div>}{f.email && <div className="acn-fraco">{f.email}</div>}</td>
                <td>{[f.cidade, f.uf].filter(Boolean).join(' / ') || '—'}</td>
                <td className="acn-forn-cats">{(f.categorias || []).join(', ') || '—'}</td>
                <td className="acn-num">{usos ? (usos[f.id] || 0) : '…'}</td>
                <td className="acn-dir acn-forn-acoes">
                  <Botao pequeno variante="discreto" icone={mdiPencilOutline} aria-label={`Editar ${f.nome}`} title="Editar" onClick={() => setModal({ fornecedor: f })} />
                  {f.ativo
                    ? <Botao pequeno variante="discreto" icone={mdiCancel} aria-label={`Desativar ${f.nome}`} title="Desativar" onClick={() => mudarAtivo(f, false)} />
                    : <Botao pequeno variante="discreto" icone={mdiRestore} aria-label={`Reativar ${f.nome}`} title="Reativar" onClick={() => mudarAtivo(f, true)} />}
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr><td colSpan={7} className="acn-centro acn-fraco">
                {fornecedores.length === 0 ? 'Nenhum fornecedor cadastrado ainda. Cadastre o primeiro no botão acima.' : 'Nenhum fornecedor encontrado com esse filtro.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {modal && (
        <ModalFornecedor fornecedor={modal.fornecedor || null} existentes={fornecedores} currentUser={currentUser}
          onClose={() => setModal(null)} aoSalvar={() => { setModal(null); onMudou(); }} />
      )}
    </div>
  );
}
