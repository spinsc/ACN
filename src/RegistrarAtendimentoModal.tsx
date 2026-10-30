// @ts-nocheck
import React, { useState } from 'react';
import { Botao, Faixa, Selo, hojeISO } from './Interface';
import Icone from './Icone';
import { mdiClose } from '@mdi/js';
import { CAMPOS_DO_REGISTRO, validarDadosDoRegistro, osSemCobranca } from './SacFluxo';

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRAR ATENDIMENTO JÁ REALIZADO (pedido do SAC em 30/10/2026; as regras estão em SacFluxo.ts)
// A janela serve a uma OS ou a várias de uma vez: `candidatas` são as OS que podem ser registradas (a que a pessoa abriu e as outras do mesmo lote que ainda não foram executadas pela fábrica);
// `marcadasInicio` diz quais já vêm marcadas (só a da pessoa, quando ela abriu pelo menu da OS; todas, quando abriu pelo cartão do lote). Os três dados valem para todas as marcadas.
// ─────────────────────────────────────────────────────────────────────────────
export default function RegistrarAtendimentoModal({ candidatas, marcadasInicio, naoEntram = 0, onConfirmar, onClose, salvando = false }: any) {
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(marcadasInicio));
  const [dados, setDados] = useState<any>(() => ({ data: hojeISO(), executor: '', observacao: '' }));
  const [faltas, setFaltas] = useState<string[]>([]);
  const lista = (candidatas || []) as any[];
  if (!lista.length) return null;
  const escolhidas = lista.filter(o => marcadas.has(o.id));
  const cobradas = escolhidas.filter(o => !osSemCobranca(o)).length;
  const semCobranca = escolhidas.length - cobradas;
  const set = (k: string, v: any) => setDados((d: any) => ({ ...d, [k]: v }));
  const alternar = (id: string) => setMarcadas(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todasMarcadas = escolhidas.length === lista.length;
  const confirmar = () => {
    const f = validarDadosDoRegistro(dados, hojeISO());
    if (!escolhidas.length) f.unshift('Marque pelo menos uma OS');
    setFaltas(f);
    if (!f.length) onConfirmar(dados, escolhidas);
  };
  const titulo = lista.length === 1 ? `Registrar atendimento já realizado — ${lista[0].numero_os}` : 'Registrar atendimento já realizado';
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !salvando) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-registro-jan" role="dialog" aria-label={titulo}>
        <div className="acn-modal-cab">
          <span className="modal-title">{titulo}</span>
          <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Fechar" title="Fechar" disabled={salvando} onClick={onClose} />
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <Faixa tom="info">O serviço já foi feito fora da fábrica. A OS vai direto para <strong>Concluído</strong>, sem passar pela Produção nem pela Qualidade, e o registro fica na OS e no histórico.</Faixa>

          <div className="acn-modal-campo">
            <div className="acn-registro-cab">
              <span className="acn-label">{lista.length === 1 ? 'OS que será registrada' : `OS que serão registradas (${escolhidas.length} de ${lista.length})`}</span>
              {lista.length > 1 && <Botao pequeno variante="discreto" onClick={() => setMarcadas(todasMarcadas ? new Set() : new Set(lista.map(o => o.id)))}>{todasMarcadas ? 'Desmarcar todas' : 'Marcar todas'}</Botao>}
            </div>
            <div className="acn-registro-lista">
              {lista.map(o => (
                <label key={o.id} className={'acn-registro-os' + (marcadas.has(o.id) ? ' on' : '')}>
                  <input type="checkbox" checked={marcadas.has(o.id)} onChange={() => alternar(o.id)} disabled={salvando} />
                  <strong className="acn-forte">{o.numero_os}</strong>
                  <span className="acn-fraco acn-registro-quem">{[o.cliente_nome, o.equipamento_nome, o.chassi || (o.numero_serie ? 'SN ' + o.numero_serie : '')].filter(Boolean).join(' · ')}</span>
                  <Selo familia="neutro" ponto={false}>{o.status}</Selo>
                </label>
              ))}
            </div>
            {naoEntram > 0 && <div className="acn-fraco">{naoEntram} OS do mesmo lote não aparecem aqui: a fábrica já está com elas ou já foram encerradas.</div>}
          </div>

          {CAMPOS_DO_REGISTRO.map((c: any) => (
            <div key={c.chave} className="acn-modal-campo">
              <label className="acn-label" htmlFor={'registro-' + c.chave}>{c.rotulo}{c.obrigatorio ? ' *' : ''}</label>
              {c.tipo === 'area'
                ? <textarea id={'registro-' + c.chave} className="acn-input" rows={3} value={dados[c.chave]} disabled={salvando} onChange={e => set(c.chave, e.target.value)} />
                : <input id={'registro-' + c.chave} className="acn-input" type={c.tipo === 'data' ? 'date' : 'text'} max={c.tipo === 'data' ? hojeISO() : undefined} value={dados[c.chave]} disabled={salvando} onChange={e => set(c.chave, e.target.value)} />}
              {c.ajuda && <div className="acn-fraco">{c.ajuda}</div>}
            </div>
          ))}

          {escolhidas.length > 0 && (
            <div className="acn-fraco" data-teste="depois-do-registro">
              Depois de concluída: {cobradas > 0 && <>{cobradas} OS cobrada{cobradas > 1 ? 's' : ''} segue{cobradas > 1 ? 'm' : ''} para <strong>Enviar ao Fiscal</strong> (a nota precisa do valor e do CPF ou CNPJ)</>}{cobradas > 0 && semCobranca > 0 && '; '}{semCobranca > 0 && <>{semCobranca} OS sem cobrança segue{semCobranca > 1 ? 'm' : ''} para a <strong>Entrega</strong></>}.
            </div>
          )}
          {faltas.length > 0 && <Faixa tom="erro"><strong>Falta preencher:</strong> {faltas.join(' · ')}</Faixa>}
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          <Botao variante="primario" disabled={salvando} onClick={confirmar}>{salvando ? 'Registrando...' : escolhidas.length > 1 ? `Registrar ${escolhidas.length} OS` : 'Registrar atendimento'}</Botao>
          <Botao onClick={onClose} disabled={salvando}>Cancelar</Botao>
        </div>
      </div>
    </div>
  );
}
