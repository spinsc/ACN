// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// CopiarOpModal — "Copiar OP": várias OPs iguais, cada uma com o seu número (pedido do usuário em 23/10/2026)
//
// A pessoa digita o número de cada cópia (um por linha); a janela mostra o número que vai sair em cada uma, a que card do CRM cada cópia fica ligada e o que a cópia leva e não
// leva. O card de cada cópia é escolha de quem copia (decidido em 23/10/2026): o MESMO card da OP de origem ou o card do PRÓPRIO pedido de venda do número — para todas de uma vez
// e, se precisar, cópia por cópia. As regras e a gravação estão em CopiarOpOs.ts (as OPs entram todas de uma vez ou nenhuma). A OS do SAC não passa por aqui: ela abre a própria
// tela de Nova OS já preenchida (ver CopiarOpOs.ts).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { mdiContentCopy } from '@mdi/js';
import Icone from './Icone';
import { supabase } from './supabaseClient';
import { Botao, Faixa, Chips } from './Interface';
import { mostrarAviso } from './Feedback';
import { copiarOp, numerosDasCopias, buscarCardsPorPv, cardDaCopia, pvDoNumero, MAX_COPIAS, LEVA_DA_OP, NAO_LEVA_DA_OP } from './CopiarOpOs';

const ROTULO_ESCOLHA = { mesmo: 'Mesmo card da OP de origem', proprio: 'Card do pedido de venda', nenhum: 'Sem card' };

export default function CopiarOpModal({ origem, currentUser, onClose, onCriadas }: { origem: any; currentUser?: any; onClose: () => void; onCriadas?: (criadas: any[]) => void }) {
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const trava = useRef(false);   // o clique duplo em "Criar" não pode gravar duas vezes (a conferência dos números demora um pouco)
  // o card de cada cópia: o padrão de todas (modo) e, se a pessoa quiser, uma escolha por número (escolhas)
  const [modo, setModo] = useState<'mesmo' | 'proprio'>('mesmo');
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [cardOrigem, setCardOrigem] = useState<any>(null);
  const [cards, setCards] = useState<{ porPv: Record<string, any[]>; erro?: string; pronto: boolean }>({ porPv: {}, pronto: true });
  const [tentativaCards, setTentativaCards] = useState(0);

  const { linhas, erro: erroLista } = useMemo(() => numerosDasCopias(texto, origem), [texto, origem?.faturamento_empresa]);
  const itensVendidos = Array.isArray(origem?.itens_vendidos) ? origem.itens_vendidos.length : 0;
  const escolhaDe = (numero: string) => (escolhas[numero] || modo) as 'mesmo' | 'proprio' | 'nenhum';
  const pvsPrecisados = useMemo(() => linhas.filter(l => !l.erro && escolhaDe(l.numero) === 'proprio').map(l => pvDoNumero(l.numero)).filter(Boolean), [linhas, escolhas, modo]);
  const chavePvs = [...new Set(pvsPrecisados)].sort().join(',');

  // o título do card da OP de origem (só para a janela dizer qual é)
  useEffect(() => {
    if (!origem?.crm_oportunidade_id) { setCardOrigem(null); return; }
    let vivo = true;
    supabase.from('crm_oportunidades').select('id,titulo,orgao,numero_pv').eq('id', origem.crm_oportunidade_id).maybeSingle()
      .then(({ data }) => { if (vivo) setCardOrigem(data || null); });
    return () => { vivo = false; };
  }, [origem?.crm_oportunidade_id]);

  // os cards dos pedidos de venda digitados (só quando alguma cópia vai para o card do próprio pedido de venda)
  useEffect(() => {
    if (!chavePvs) { setCards({ porPv: {}, pronto: true }); return; }
    let vivo = true;
    setCards(c => ({ ...c, pronto: false }));
    const t = setTimeout(() => {
      buscarCardsPorPv(chavePvs.split(',')).then(r => { if (vivo) setCards({ porPv: r.porPv, erro: r.erro, pronto: true }); });
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [chavePvs, tentativaCards]);

  const resolucao = useMemo(() => Object.fromEntries(linhas.filter(l => !l.erro).map(l => [l.numero, cardDaCopia(escolhaDe(l.numero), l.numero, origem, cardOrigem, cards.porPv)])), [linhas, escolhas, modo, cardOrigem, cards, origem?.crm_oportunidade_id]);
  const semCard = linhas.filter(l => !l.erro && resolucao[l.numero] && resolucao[l.numero].atencao);
  const precisaDoCrm = pvsPrecisados.length > 0;
  const crmIndisponivel = precisaDoCrm && !!cards.erro;
  const pronto = linhas.length > 0 && !erroLista && linhas.every(l => !l.erro) && !crmIndisponivel && (!precisaDoCrm || cards.pronto);

  const criar = async () => {
    if (trava.current || !pronto) return;
    trava.current = true; setSalvando(true); setErro('');
    try {
      const crmPorNumero = Object.fromEntries(linhas.map(l => [l.numero, resolucao[l.numero]?.id ?? null]));
      const r = await copiarOp({ origem, numeros: linhas.map(l => l.numero), usuario: currentUser, crmPorNumero });
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

          <div className="form-group" data-teste="ligacao-com-o-crm">
            <label className="acn-label">Ligação das cópias com o CRM</label>
            <Chips ativo={modo} onChange={v => { setModo(v); setEscolhas({}); }}
              itens={[
                { id: 'mesmo', rotulo: 'Todas no mesmo card da OP de origem' },
                { id: 'proprio', rotulo: 'Cada uma no card do seu pedido de venda' },
              ]} />
            <div className="acn-ajuda">
              {origem?.crm_oportunidade_id
                ? `Card da OP de origem: ${cardOrigem ? (cardOrigem.titulo || cardOrigem.orgao || 'sem título') : 'carregando...'}. `
                : 'A OP de origem não está ligada a nenhum card. '}
              Dá para trocar cópia por cópia na tabela abaixo.
            </div>
          </div>

          {linhas.length > 0 && (
            <table className="acn-tabela acn-densa" data-teste="numeros-das-copias">
              <thead><tr><th>Digitado</th><th>Número da cópia</th><th>Card do CRM</th><th>Situação</th></tr></thead>
              <tbody>
                {linhas.map((l, i) => {
                  const r = !l.erro ? resolucao[l.numero] : null;
                  return (
                    <tr key={i}>
                      <td>{l.digitado}</td>
                      <td><strong>{l.erro ? '—' : l.numero}</strong></td>
                      <td>
                        {!l.erro && (
                          <>
                            <select className="acn-input" aria-label={`Card do CRM da cópia ${l.numero}`} value={escolhaDe(l.numero)}
                              onChange={e => setEscolhas(x => ({ ...x, [l.numero]: e.target.value }))}>
                              {Object.entries(ROTULO_ESCOLHA).map(([v, rot]) => <option key={v} value={v}>{rot}</option>)}
                            </select>
                            <div className={r?.atencao ? 'acn-txt-atencao' : 'acn-ajuda'}>
                              {escolhaDe(l.numero) === 'proprio' && !cards.pronto ? 'consultando o CRM...' : r?.texto}
                            </div>
                          </>
                        )}
                      </td>
                      <td className={l.erro ? 'acn-txt-erro' : 'acn-txt-ok'}>{l.erro || 'ok'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {erroLista && <Faixa tom="erro">{erroLista}</Faixa>}
          {crmIndisponivel && (
            <Faixa tom="erro" acao={<Botao pequeno onClick={() => setTentativaCards(n => n + 1)}>Tentar de novo</Botao>}>
              Não foi possível consultar o CRM ({cards.erro}). Tente de novo, ou troque as cópias para "Mesmo card da OP de origem" ou "Sem card".
            </Faixa>
          )}
          {!crmIndisponivel && semCard.length > 0 && (
            <Faixa tom="atencao">
              {semCard.length === 1 ? 'Esta cópia vai ficar sem card' : `Estas ${semCard.length} cópias vão ficar sem card`}: {semCard.map(l => l.numero).join(', ')}. Se não for isso, troque na tabela antes de criar.
            </Faixa>
          )}
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
