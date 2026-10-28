// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ChegadaDeItens — "Chegada de itens" da OC na Logística (pedido do usuário em 28/10/2026)
//
// Um desenvolvimento da Engenharia pode esperar UM item da OC (o rack de teto, que chega antes do resto). O recebimento da OC continua inteiro, como sempre (NF, conferência, pagamento, estoque);
// aqui a Logística só diz quantas unidades de cada item já chegaram. Na primeira unidade, o banco libera e avisa o desenvolvimento que espera aquele item (EsperaDeMaterial.ts, gatilho do banco).
// Quantidade 0 desfaz a marca. A OC virar "Recebido" vale como chegada de todos os itens, sem precisar marcar nada aqui.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import Icone from './Icone';
import { supabase } from './supabaseClient';
import { logChange } from './AuditSystem';
import { Botao, Faixa, Selo } from './Interface';
import { mostrarAviso } from './Feedback';
import { lerValorDigitado } from './LerValor';
import { itensDaOC, numeroDaOC, mesmoNome, marcarChegada, lerChegadasDe, lerDemandasQueEsperam } from './EsperaDeMaterial';
import { mdiPackageDown, mdiClose } from '@mdi/js';

const qtd = (n: any) => (n == null ? '' : Number(n).toLocaleString('pt-BR'));

export default function ModalChegadaDeItens({ pedido: pedidoRecebido, currentUser, onClose, onSalvo }: any) {
  const [estado, setEstado] = useState<any>({ carregando: true, pedido: pedidoRecebido, itens: [], chegadas: [], esperas: [], erro: '' });
  const [digitado, setDigitado] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    (async () => {
      const id = String(pedidoRecebido.id);
      // a lista da Logística traz só parte das colunas: a OC é lida inteira antes de marcar
      const { data: pedido, error } = await supabase.from('pcp_pedidos_compra').select('id,numero_pedido,numero_oc,descricao_material,fornecedor,status_compra,quantidade,quantidade_comprada,itens').eq('id', id).maybeSingle();
      const c = await lerChegadasDe([id]);
      const e = await lerDemandasQueEsperam([id]);
      const erroLeitura = error?.message || c.erro || e.erro || (pedido ? '' : 'a compra não foi encontrada');
      if (!ativo) return;
      const itens = pedido ? itensDaOC(pedido) : [];
      setEstado({ carregando: false, pedido: pedido || pedidoRecebido, itens, chegadas: c.chegadas, esperas: e.mapa.get(id) || [], erro: erroLeitura });
      setDigitado(Object.fromEntries(itens.map(it => { const ch = c.chegadas.find((x: any) => x.chave === it.chave && mesmoNome(x.nome, it.nome)); return [it.chave, ch ? String(ch.quantidade).replace('.', ',') : '']; })));
    })();
    return () => { ativo = false; };
  }, [pedidoRecebido?.id]);

  const guardado = (it: any) => { const ch = estado.chegadas.find((x: any) => x.chave === it.chave && mesmoNome(x.nome, it.nome)); return ch ? Number(ch.quantidade) : 0; };
  const lido = (it: any) => { const l = lerValorDigitado(digitado[it.chave] ?? ''); return l.vazio ? { valor: 0 } : l; };
  const invalido = estado.itens.some((it: any) => lido(it).invalido || (lido(it).valor ?? 0) < 0);
  const mudou = estado.itens.filter((it: any) => !lido(it).invalido && (lido(it).valor ?? 0) !== guardado(it));
  const recebida = estado.pedido?.status_compra === 'Recebido';

  const salvar = async () => {
    if (!mudou.length || invalido) return;
    setSalvando(true); setErro('');
    try {
      const falhas: string[] = [];
      for (const it of mudou) {
        const r = await marcarChegada({ pedido_id: estado.pedido.id, chave: it.chave, nome: it.nome, quantidade: lido(it).valor ?? 0, por: currentUser?.nome });
        if (r.erro) falhas.push(`${it.nome}: ${r.erro}`); else
          logChange({ module: 'logistica', entityType: 'compras_chegadas_itens', entityId: String(estado.pedido.id), changeType: 'UPDATE', oldRow: { item: it.nome, quantidade: guardado(it) }, newRow: { item: it.nome, quantidade: lido(it).valor ?? 0 }, user: currentUser });
      }
      if (falhas.length) { setErro(`Não foi possível gravar a chegada de: ${falhas.join('; ')}. O que não está nessa lista foi gravado.`); onSalvo?.(); return; }
      // o banco libera e avisa sozinho; aqui só se lê o resultado para dizer à pessoa o que a chegada destravou
      const depois = await lerDemandasQueEsperam([String(estado.pedido.id)]);
      const liberadas = (depois.mapa.get(String(estado.pedido.id)) || []).filter((x: any, i: number, a: any[]) => x.demanda.espera_material?.chegou_em && a.findIndex(y => y.demanda.id === x.demanda.id) === i);
      mostrarAviso(liberadas.length
        ? `Chegada registrada. A Engenharia foi avisada: ${liberadas.map((x: any) => x.demanda.titulo).join('; ')} já pode ser iniciado.`
        : 'Chegada registrada.', 'ok');
      onSalvo?.(); onClose();
    } finally { setSalvando(false); }
  };

  // quem espera cada item: tag na linha
  const esperaDe = (it: any) => estado.esperas.filter((x: any) => x.item.chave === it.chave && mesmoNome(x.item.nome, it.nome));

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !salvando) onClose(); }}>
      <div className="modal-box acn-modal-cadastro" role="dialog" aria-label="Chegada de itens da compra" data-teste="chegada-itens">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiPackageDown} size={16} /> Chegada de itens — {numeroDaOC(estado.pedido)}</span>
          <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Fechar" onClick={onClose} disabled={salvando} />
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-ajuda">{estado.pedido?.fornecedor || 'Fornecedor a definir'} · {estado.pedido?.descricao_material || ''}</div>
          <Faixa tom="info">
            Informe quantas unidades de cada item já chegaram, mesmo que o resto do pedido ainda não tenha vindo. Isso <strong>não</strong> recebe a OC (NF, conferência e estoque continuam no botão Receber);
            serve para liberar e avisar quem espera o item. Use 0 para desfazer.
          </Faixa>
          {recebida && <Faixa tom="info">Esta OC já está Recebida: todos os itens contam como chegados.</Faixa>}
          {estado.erro && <Faixa tom="erro">Não foi possível ler a compra ({estado.erro}). Nada foi alterado.</Faixa>}
          {estado.carregando ? <div className="acn-empty">Carregando…</div> : (
            <div className="acn-rolagem">
              <table className="acn-tabela acn-densa">
                <thead><tr><th>Item</th><th>Pedido</th><th>Chegou</th><th>Quem espera</th></tr></thead>
                <tbody>
                  {estado.itens.map((it: any) => {
                    const l = lido(it); const espera = esperaDe(it);
                    return (
                      <tr key={it.chave}>
                        <td>{it.nome}</td>
                        <td className="acn-num">{qtd(it.quantidade) || '—'}</td>
                        <td>
                          <input className="acn-input acn-num acn-chegada-qtd" inputMode="decimal" aria-label={`Quantidade que chegou de ${it.nome}`} disabled={recebida || salvando}
                            value={digitado[it.chave] ?? ''} placeholder="0" onChange={e => setDigitado(s => ({ ...s, [it.chave]: e.target.value }))} />
                          {l.invalido && <div className="acn-txt-erro">Número inválido</div>}
                          {!l.invalido && it.quantidade && (l.valor ?? 0) > it.quantidade && <div className="acn-ajuda">Mais do que o pedido ({qtd(it.quantidade)}).</div>}
                        </td>
                        <td>{espera.length ? espera.map((x: any) => <div key={x.demanda.id}><Selo familia="atencao" ponto={false}>Engenharia espera</Selo> <span className="acn-fraco">{x.demanda.titulo}{x.demanda.numero_opl ? ` · OP ${x.demanda.numero_opl}` : ''}</span></div>) : <span className="acn-fraco">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onClose} disabled={salvando}>Fechar</Botao>
          <Botao variante="primario" icone={mdiPackageDown} disabled={salvando || recebida || !mudou.length || invalido || !!estado.erro} onClick={salvar}>{salvando ? 'Gravando…' : 'Registrar chegada'}</Botao>
        </div>
      </div>
    </div>
  );
}
