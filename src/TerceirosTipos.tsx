// @ts-nocheck
// A aba "Tipos de serviço" dos Serviços de terceiros e a janela de cadastro (fatia T1 do PLANO_SERVICOS_TERCEIROS.md, 22/11/2026; as regras estão em TerceirosModelo.ts).
// Cada tipo carrega duas regras que o Admin muda sem mexer em código: QUEM MARCA A DATA (película, plotagem e pintura: a Adaptação; os outros: quem pediu) e ONDE costuma ser feito.
// Só o Admin cadastra e corrige (o banco recusa os outros); os demais só leem. Nada se apaga: o tipo se desativa, porque os serviços já pedidos apontam para ele.
import React, { useMemo, useState } from 'react';
import { mdiClose, mdiPlus, mdiPencilOutline, mdiCancel, mdiRestore } from '@mdi/js';
import { Botao, Faixa, Selo } from './Interface';
import { confirmar } from './Feedback';
import { logChange } from './AuditSystem';
import {
  OPCOES_QUEM_MARCA_DATA, formDoTipo, salvarTipo, mudarAtivoDoTipo, rotuloDeQuemMarca, rotuloDoOnde,
} from './TerceirosModelo';

/** Janela de cadastro/edição de um tipo. */
export function ModalTipo({ tipo = null, tipos, onClose, aoSalvar, currentUser }) {
  const [form, setForm] = useState(() => formDoTipo(tipo, tipos));
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const salvar = async () => {
    if (ocupado) return;
    setErro('');
    // mudar quem marca a data vale também para os serviços desse tipo que já foram pedidos e ainda estão abertos: pergunta antes
    if (tipo && form.quem_marca_data !== tipo.quem_marca_data) {
      const quem = form.quem_marca_data === 'adaptacao' ? 'a Adaptação' : 'quem pediu o serviço';
      if (!await confirmar(`Passar para ${quem} a marcação da data de "${tipo.nome}"?\n\nA regra vale também para os serviços desse tipo que ainda estão abertos.`)) return;
    }
    setOcupado(true);
    const r = await salvarTipo(form, tipos, currentUser, tipo?.id || null);
    setOcupado(false);
    if (r.erro) { setErro(r.erro); return; }
    logChange({ module: 'terceiros', entityType: 'terceiros_tipos', entityId: r.tipo.id, changeType: tipo ? 'UPDATE' : 'CREATE', oldRow: r.antes || undefined, newRow: r.tipo, user: currentUser });
    aoSalvar(r.tipo);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-terc-box" role="dialog" aria-label={tipo ? 'Editar tipo de serviço' : 'Cadastrar tipo de serviço'}>
        <div className="acn-modal-cab">
          <span className="modal-title">{tipo ? 'Editar tipo de serviço' : 'Cadastrar tipo de serviço'}</span>
          <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} />
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-terc-grade">
            <div className="acn-terc-campo acn-terc-largo"><label className="acn-label" htmlFor="terc-t-nome">Nome do tipo de serviço *</label>
              <input id="terc-t-nome" className="acn-input" value={form.nome} autoFocus onChange={e => set('nome', e.target.value)} placeholder="Ex.: Película, Lavagem, Pintura eletrostática" /></div>
            <div className="acn-terc-campo acn-terc-largo" role="radiogroup" aria-label="Quem marca a data">
              <span className="acn-label">Quem marca a data *</span>
              {OPCOES_QUEM_MARCA_DATA.map(o => (
                <label key={o.id} className="acn-terc-marca">
                  <input type="radio" name="terc-t-quem" checked={form.quem_marca_data === o.id} onChange={() => set('quem_marca_data', o.id)} />
                  <span><strong>{o.rotulo}.</strong> {o.explicacao}</span>
                </label>
              ))}
              <p className="acn-terc-dica">Gerentes e Admin podem marcar a data em qualquer caso.</p>
            </div>
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-t-onde">Onde costuma ser feito</label>
              <select id="terc-t-onde" className="acn-input" value={form.onde_padrao} onChange={e => set('onde_padrao', e.target.value)}>
                <option value="">Cada pedido escolhe</option>
                <option value="fabrica">Na fábrica</option>
                <option value="prestador">No prestador</option>
              </select>
              <p className="acn-terc-dica">Na fábrica: o prestador vem até aqui. No prestador: o carro ou a peça vai até lá.</p></div>
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-t-ordem">Posição na lista</label>
              <input id="terc-t-ordem" className="acn-input" inputMode="numeric" value={form.ordem} onChange={e => set('ordem', e.target.value.replace(/\D/g, '').slice(0, 4))} />
              <p className="acn-terc-dica">Quanto menor o número, mais acima o tipo aparece.</p></div>
            <div className="acn-terc-campo acn-terc-largo">
              <label className="acn-terc-marca">
                <input type="checkbox" checked={form.usa_ordem_em_lote} onChange={e => set('usa_ordem_em_lote', e.target.checked)} />
                <span><strong>Usa ordem de serviço em lote.</strong> Marque nos serviços em que vários carros ou peças vão juntos numa só ordem, assinada pelo prestador (a pintura eletrostática). A impressão da ordem ainda não está pronta; a marca já fica guardada.</span>
              </label>
            </div>
          </div>
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape">
          <Botao variante="secundario" onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando…' : (tipo ? 'Salvar' : 'Cadastrar')}</Botao>
        </div>
      </div>
    </div>
  );
}

/** A aba "Tipos de serviço": a lista com as regras de cada um; cadastrar, editar, desativar e reativar (só o Admin). */
export function TiposDeTerceiros({ tipos, prestadores, erro, onMudou, podeEditar, currentUser }) {
  const [modal, setModal] = useState<any>(null);       // { tipo } | {}
  const [aviso, setAviso] = useState('');

  // quantos prestadores ativos marcaram cada tipo (quem não marcou nenhum faz qualquer serviço e fica fora desta conta)
  const prestadoresPorTipo = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const p of prestadores) if (p.ativo) for (const id of p.tipos_ids || []) mapa[id] = (mapa[id] || 0) + 1;
    return mapa;
  }, [prestadores]);

  const mudarAtivo = async (t: any, ativo: boolean) => {
    if (!ativo && !await confirmar(`Desativar o tipo "${t.nome}"?\n\nEle deixa de aparecer para pedir serviços novos. Os serviços já pedidos desse tipo continuam como estão. Dá para reativar depois.`)) return;
    const e = await mudarAtivoDoTipo(t, ativo, currentUser);
    if (e) { setAviso(e); return; }
    setAviso('');
    logChange({ module: 'terceiros', entityType: 'terceiros_tipos', entityId: t.id, changeType: 'UPDATE', oldRow: { ativo: t.ativo }, newRow: { ativo }, user: currentUser });
    onMudou();
  };

  const colunas = podeEditar ? 7 : 5;

  return (
    <div className="acn-terc">
      <div className="acn-cmp-cab">
        <div className="acn-cmp-cab-esq">
          <h2 className="acn-cmp-titulo">Tipos de serviço</h2>
          {podeEditar && <Botao pequeno variante="primario" icone={mdiPlus} onClick={() => setModal({})}>Cadastrar tipo</Botao>}
        </div>
      </div>
      <div className="acn-ajuda">
        Cada tipo diz quem marca a data e onde o serviço costuma ser feito. Nos serviços da Adaptação (película, plotagem e pintura) quem pede só diz a data que gostaria e a Adaptação marca o dia;
        nos demais, quem pediu marca. {podeEditar ? 'Nada se apaga: um tipo que não se usa mais fica inativo.' : 'Só o Admin muda os tipos.'}
      </div>
      {erro && <Faixa tom="erro">Não foi possível ler os tipos de serviço ({erro}). A lista abaixo pode estar desatualizada ou incompleta.</Faixa>}
      {aviso && <Faixa tom="erro">{aviso}</Faixa>}
      <div className="acn-rolagem">
        <table className="acn-tabela acn-densa">
          <thead><tr><th>Tipo</th><th>Quem marca a data</th><th>Onde costuma ser feito</th><th title="Usa ordem de serviço em lote: vários carros ou peças vão juntos numa só ordem, assinada pelo prestador">Ordem em lote</th><th>Prestadores</th>{podeEditar && <th>Posição</th>}{podeEditar && <th>Ações</th>}</tr></thead>
          <tbody>
            {tipos.map(t => (
              <tr key={t.id} className={t.ativo ? '' : 'acn-terc-inativo'}>
                <td><strong>{t.nome}</strong>{!t.ativo && <> <Selo familia="neutro" ponto={false}>Inativo</Selo></>}</td>
                <td>{rotuloDeQuemMarca(t.quem_marca_data)}</td>
                <td>{rotuloDoOnde(t.onde_padrao)}</td>
                <td>{t.usa_ordem_em_lote ? 'Sim' : '—'}</td>
                <td className="acn-num" title="Prestadores ativos que marcaram este serviço">{prestadoresPorTipo[t.id] || 0}</td>
                {podeEditar && <td className="acn-num">{t.ordem}</td>}
                {podeEditar && (
                  <td className="acn-dir acn-terc-acoes">
                    <Botao pequeno variante="discreto" icone={mdiPencilOutline} aria-label={`Editar ${t.nome}`} title="Editar" onClick={() => setModal({ tipo: t })} />
                    {t.ativo
                      ? <Botao pequeno variante="discreto" icone={mdiCancel} aria-label={`Desativar ${t.nome}`} title="Desativar" onClick={() => mudarAtivo(t, false)} />
                      : <Botao pequeno variante="discreto" icone={mdiRestore} aria-label={`Reativar ${t.nome}`} title="Reativar" onClick={() => mudarAtivo(t, true)} />}
                  </td>
                )}
              </tr>
            ))}
            {tipos.length === 0 && (
              <tr><td colSpan={colunas} className="acn-centro acn-fraco">Nenhum tipo de serviço cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {modal && (
        <ModalTipo tipo={modal.tipo || null} tipos={tipos} currentUser={currentUser}
          onClose={() => setModal(null)} aoSalvar={() => { setModal(null); onMudou(); }} />
      )}
    </div>
  );
}
