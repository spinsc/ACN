// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// CopiarOpModal — "Copiar OP": várias OPs iguais, cada uma com o seu número (pedido do usuário em 23/10/2026)
//
// A pessoa digita o número de cada cópia (um por linha); a janela mostra o número que vai sair em cada uma e o que a cópia leva e não leva. As regras e a gravação estão
// em CopiarOpOs.ts (as OPs entram todas de uma vez ou nenhuma). A OS do SAC não passa por aqui: ela abre a própria tela de Nova OS já preenchida (ver CopiarOpOs.ts).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo, useRef } from 'react';
import { mdiContentCopy } from '@mdi/js';
import Icone from './Icone';
import { Botao, Faixa } from './Interface';
import { mostrarAviso } from './Feedback';
import { copiarOp, numerosDasCopias, MAX_COPIAS, LEVA_DA_OP, NAO_LEVA_DA_OP } from './CopiarOpOs';

export default function CopiarOpModal({ origem, currentUser, onClose, onCriadas }: { origem: any; currentUser?: any; onClose: () => void; onCriadas?: (criadas: any[]) => void }) {
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const trava = useRef(false);   // o clique duplo em "Criar" não pode gravar duas vezes (a conferência dos números demora um pouco)
  const { linhas, erro: erroLista } = useMemo(() => numerosDasCopias(texto, origem), [texto, origem?.faturamento_empresa]);
  const pronto = linhas.length > 0 && !erroLista && linhas.every(l => !l.erro);
  const itensVendidos = Array.isArray(origem?.itens_vendidos) ? origem.itens_vendidos.length : 0;

  const criar = async () => {
    if (trava.current || !pronto) return;
    trava.current = true; setSalvando(true); setErro('');
    try {
      const r = await copiarOp({ origem, numeros: linhas.map(l => l.numero), usuario: currentUser });
      if (r.erro) { setErro(r.erro); return; }
      mostrarAviso(`${r.criadas.length === 1 ? 'OP criada' : `${r.criadas.length} OPs criadas`} a partir da OP ${origem.opl}: ${r.criadas.map(c => c.numero).join(', ')}. ${r.criadas.length === 1 ? 'Ela está' : 'Elas estão'} em "Em Espera PCP".`, 'ok');
      if (r.avisos.length) mostrarAviso(`As OPs foram criadas, mas nem tudo foi copiado: ${r.avisos.join('; ')}. Abra cada OP e confira.`, 'atencao');
      onCriadas?.(r.criadas);
      onClose();
    } finally { trava.current = false; setSalvando(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !salvando) onClose(); }}>
      <div className="modal-box acn-modal-cadastro" role="dialog" aria-label="Copiar OP">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiContentCopy} size={16} /> Copiar OP {origem?.opl}</span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-ajuda">
            {[origem?.cliente_nome, origem?.tipo_projeto, itensVendidos ? `${itensVendidos} item(ns) vendido(s)` : null].filter(Boolean).join(' · ')}
          </div>

          <div className="form-group">
            <label className="acn-label" htmlFor="cop-numeros">Número de cada cópia *</label>
            <textarea id="cop-numeros" className="acn-input" rows={5} value={texto} onChange={e => setTexto(e.target.value)} autoFocus
              placeholder={'1801\n1802\n1803'} />
            <div className="acn-ajuda">
              Um número por linha (até {MAX_COPIAS}). Com até 4 dígitos é o pedido de venda: 1801 vira {numerosDasCopias('1801', origem).linhas[0].numero}. Para um número diferente desse, digite a OP completa.
            </div>
          </div>

          {linhas.length > 0 && (
            <table className="acn-tabela acn-densa" data-teste="numeros-das-copias">
              <thead><tr><th>Digitado</th><th>Número da cópia</th><th>Situação</th></tr></thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={i}>
                    <td>{l.digitado}</td>
                    <td><strong>{l.erro ? '—' : l.numero}</strong></td>
                    <td className={l.erro ? 'acn-txt-erro' : 'acn-txt-ok'}>{l.erro || 'ok'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {erroLista && <Faixa tom="erro">{erroLista}</Faixa>}
          {erro && <Faixa tom="erro">{erro}</Faixa>}

          <div className="acn-quadro tom-ok">
            <div className="acn-quadro-titulo">A cópia leva</div>
            {LEVA_DA_OP.map((t, i) => <div key={i} className="acn-ajuda">• {t}</div>)}
          </div>
          <div className="acn-quadro">
            <div className="acn-quadro-titulo">A cópia NÃO leva (é de cada carro e de cada OP)</div>
            {NAO_LEVA_DA_OP.map((t, i) => <div key={i} className="acn-ajuda">• {t}</div>)}
          </div>
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onClose} disabled={salvando}>Cancelar</Botao>
          <Botao variante="primario" icone={mdiContentCopy} disabled={!pronto || salvando} onClick={criar}>
            {salvando ? 'Criando...' : linhas.length > 1 ? `Criar ${linhas.length} cópias` : 'Criar a cópia'}
          </Botao>
        </div>
      </div>
    </div>
  );
}
