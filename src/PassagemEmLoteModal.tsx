// @ts-nocheck
import React, { useState } from 'react';
import { Botao, Faixa, Selo, hojeISO } from './Interface';
import { mdiClose } from '@mdi/js';
import { passagensEmLote, camposDaPassagem, validarDadosDaPassagem } from './SacFluxo';

// ─────────────────────────────────────────────────────────────────────────────
// PASSAGENS EM LOTE (PLANO_SAC_MELHORIAS_UX.md, M4, pedido do usuário em 03/11/2026; as regras estão em SacFluxo.ts, `passagensEmLote`)
// O SAC escolhe uma passagem (seguir sem cotação, iniciar a execução, voltar uma etapa, cancelar…), marca as OS do lote que a fazem e informa UMA vez os dados que valem para todas. Só aparece
// a OS que pode fazer aquele passo agora; as que estão em outra etapa ficam de fora e a janela diz quantas. Mesmo desenho do "Registrar atendimento já realizado" em lote.
// ─────────────────────────────────────────────────────────────────────────────
const dadosIniciais = (processo: string) => {
  const v: any = {};
  for (const c of camposDaPassagem(processo)) v[c.chave] = c.tipo === 'data' ? hojeISO() : c.tipo === 'select' ? (c.opcoes?.[0]?.valor || '') : '';
  return v;
};

export default function PassagemEmLoteModal({ oss, passagemInicial, onConfirmar, onClose, salvando = false }: any) {
  const passagens = passagensEmLote(oss || []);
  const [passagemId, setPassagemId] = useState<string>(() => (passagens.find(p => p.id === passagemInicial) || passagens[0] || {}).id || '');
  const passagem = passagens.find(p => p.id === passagemId) || passagens[0];
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set((passagem?.itens || []).map(i => i.os.id)));
  const [dados, setDados] = useState<any>(() => dadosIniciais(passagem?.processo));
  const [faltas, setFaltas] = useState<string[]>([]);
  if (!passagem) return null;
  const campos = camposDaPassagem(passagem.processo);
  const lista = passagem.itens.map(i => i.os).sort((a: any, b: any) => String(a.numero_os).localeCompare(String(b.numero_os)));
  const escolhidas = lista.filter((o: any) => marcadas.has(o.id));
  const todasMarcadas = escolhidas.length === lista.length;
  const set = (k: string, v: any) => setDados((d: any) => ({ ...d, [k]: v }));
  const alternar = (id: string) => setMarcadas(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const trocarPassagem = (id: string) => {
    const p = passagens.find(x => x.id === id); if (!p) return;
    setPassagemId(id); setMarcadas(new Set(p.itens.map(i => i.os.id))); setDados(dadosIniciais(p.processo)); setFaltas([]);
  };
  const confirmar = () => {
    const f = validarDadosDaPassagem(passagem.processo, dados);
    if (!escolhidas.length) f.unshift('Marque pelo menos uma OS');
    setFaltas(f);
    if (!f.length) onConfirmar(passagem, dados, escolhidas.map((o: any) => passagem.itens.find(i => i.os.id === o.id)));
  };
  const cancelar = passagem.processo === 'cancelar';
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !salvando) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-registro-jan" role="dialog" aria-label="Passar as OS do lote">
        <div className="acn-modal-cab">
          <span className="modal-title">Passar as OS do lote</span>
          <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Fechar" title="Fechar" disabled={salvando} onClick={onClose} />
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-modal-campo">
            <label className="acn-label" htmlFor="passagem-escolha">O que fazer com as OS</label>
            <select id="passagem-escolha" className="acn-input" value={passagem.id} disabled={salvando} onChange={e => trocarPassagem(e.target.value)}>
              {passagens.map(p => <option key={p.id} value={p.id}>{p.rotulo}{p.tipo === 'avancar' && p.processo !== 'cancelar' ? ` → ${p.para}` : ''} ({p.itens.length} OS)</option>)}
            </select>
            <div className="acn-fraco">{passagem.ajuda}</div>
          </div>
          {cancelar
            ? <Faixa tom="erro">As OS marcadas serão <strong>canceladas</strong>. Elas saem do quadro e da lista (ficam no filtro de status "Cancelada"). A demanda aberta de cada uma recebe um recado e o setor a encerra.</Faixa>
            : <Faixa tom="info">A mesma passagem vale para todas as OS marcadas: <strong>{passagem.rotulo}</strong>. Cada OS só passa se ainda estiver na etapa em que está agora.</Faixa>}

          <div className="acn-modal-campo">
            <div className="acn-registro-cab">
              <span className="acn-label">{lista.length === 1 ? 'OS que passará' : `OS que passarão (${escolhidas.length} de ${lista.length})`}</span>
              {lista.length > 1 && <Botao pequeno variante="discreto" disabled={salvando} onClick={() => setMarcadas(todasMarcadas ? new Set() : new Set(lista.map((o: any) => o.id)))}>{todasMarcadas ? 'Desmarcar todas' : 'Marcar todas'}</Botao>}
            </div>
            <div className="acn-registro-lista">
              {lista.map((o: any) => (
                <label key={o.id} className={'acn-registro-os' + (marcadas.has(o.id) ? ' on' : '')}>
                  <input type="checkbox" checked={marcadas.has(o.id)} onChange={() => alternar(o.id)} disabled={salvando} />
                  <strong className="acn-forte">{o.numero_os}</strong>
                  <span className="acn-fraco acn-registro-quem">{[o.cliente_nome, o.equipamento_nome, o.chassi || (o.numero_serie ? 'SN ' + o.numero_serie : '')].filter(Boolean).join(' · ')}</span>
                  <Selo familia="neutro" ponto={false}>{o.status}</Selo>
                </label>
              ))}
            </div>
            {(oss || []).length - lista.length > 0 && <div className="acn-fraco" data-teste="lote-ficam-de-fora">{(oss || []).length - lista.length} OS do lote não aparecem aqui: estão em outra etapa ou com outro setor, onde este passo não vale.</div>}
          </div>

          {campos.map((c: any) => (
            <div key={passagem.id + c.chave} className="acn-modal-campo">
              <label className="acn-label" htmlFor={'passagem-' + c.chave}>{c.rotulo}{c.obrigatorio ? ' *' : ''}</label>
              {c.tipo === 'select' ? (
                <select id={'passagem-' + c.chave} className="acn-input" value={dados[c.chave]} disabled={salvando} onChange={e => set(c.chave, e.target.value)}>
                  {c.opcoes.map((o: any) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                </select>
              ) : c.tipo === 'area' ? (
                <textarea id={'passagem-' + c.chave} className="acn-input" rows={3} value={dados[c.chave]} disabled={salvando} onChange={e => set(c.chave, e.target.value)} />
              ) : (
                <input id={'passagem-' + c.chave} className="acn-input" type={c.tipo === 'data' ? 'date' : 'text'} value={dados[c.chave]} disabled={salvando} onChange={e => set(c.chave, e.target.value)} />
              )}
              {c.ajuda && <div className="acn-fraco">{c.ajuda}</div>}
            </div>
          ))}
          {faltas.length > 0 && <Faixa tom="erro"><strong>Falta preencher:</strong> {faltas.join(' · ')}</Faixa>}
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          <Botao variante={cancelar ? 'perigo' : 'primario'} disabled={salvando} onClick={confirmar}>
            {salvando ? 'Gravando...' : cancelar ? `Cancelar ${escolhidas.length > 1 ? escolhidas.length + ' OS' : 'a OS'}` : escolhidas.length > 1 ? `${passagem.rotulo} em ${escolhidas.length} OS` : passagem.rotulo}
          </Botao>
          <Botao onClick={onClose} disabled={salvando}>Fechar</Botao>
        </div>
      </div>
    </div>
  );
}
