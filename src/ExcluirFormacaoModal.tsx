// ─────────────────────────────────────────────────────────────────────────────
// ExcluirFormacaoModal — "Excluir formação de preços" (pedido do usuário em 17/11/2026)
//
// A janela lê as versões da formação, deixa a pessoa escolher entre excluir SÓ A VERSÃO ou a FORMAÇÃO INTEIRA (quando há mais de uma versão), pergunta ao banco o que
// impede, o que sai junto e o que fica como está, pede o motivo e só então grava. A formação não é apagada: some das telas e fica guardada, marcada como excluída.
// As regras e a gravação estão em ExclusaoDeFormacao.ts; o que vale de verdade é a função do banco `formacao_excluir`, que confere perfil, autor, motivo e bloqueios.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { mdiTrashCanOutline } from '@mdi/js';
import Icone from './Icone';
import { Botao, Faixa } from './Interface';
import { confirmar, mostrarAviso } from './Feedback';
import { logChange } from './AuditSystem';
import { escoposPermitidos, lerFamiliaDaFormacao, conferirExclusaoDeFormacao, excluirFormacao, motivoValido, frasePorExtenso } from './ExclusaoDeFormacao';

type Props = {
  id: string;
  raizId?: string | null;
  nome?: string;
  /** O `atualizado_em` que a tela de origem viu; se a formação mudou depois, o banco recusa. Sem ele vale o que a janela leu ao abrir. */
  atualizadoEm?: string | null;
  currentUser?: any;
  onClose: () => void;
  onExcluida?: (r: { escopo: string; ids: string[] }) => void;
};

export default function ExcluirFormacaoModal({ id, raizId = null, nome = '', atualizadoEm = null, currentUser, onClose, onExcluida }: Props) {
  const [familia, setFamilia] = useState<{ lista: any[]; erro: string; pronta: boolean }>({ lista: [], erro: '', pronta: false });
  const [escopo, setEscopo] = useState<'versao' | 'formacao'>('formacao');
  const [confs, setConfs] = useState<Record<string, any>>({});   // a conferência do banco, uma por escopo (só lida quando a pessoa escolhe)
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const trava = useRef(false);   // clique duplo em "Excluir" não pode gravar duas vezes

  useEffect(() => {
    let vivo = true;
    lerFamiliaDaFormacao(id, raizId).then(r => { if (vivo) setFamilia({ lista: r.lista, erro: r.erro || '', pronta: true }); });
    return () => { vivo = false; };
  }, [id, raizId]);

  const lista = familia.lista;
  const eu = lista.find((l: any) => String(l.id) === String(id));
  const varias = lista.length > 1;
  const permitidos = useMemo(() => escoposPermitidos(currentUser, lista, id), [currentUser, lista, id]);
  const podeAlgo = permitidos.versao || permitidos.formacao;
  const versoes = lista.map((v: any) => 'v' + (v.versao || 1)).join(', ');

  // começa pela escolha mais conservadora: só a versão aberta (quando a pessoa pode); formação de uma versão só não tem escolha
  useEffect(() => {
    if (!familia.pronta) return;
    setEscopo(varias && permitidos.versao ? 'versao' : permitidos.formacao || !varias ? 'formacao' : 'versao');
  }, [familia.pronta]);

  useEffect(() => {
    if (!familia.pronta || !eu || !podeAlgo || confs[escopo]) return;
    let vivo = true;
    conferirExclusaoDeFormacao(id, escopo).then(c => { if (vivo) setConfs(p => ({ ...p, [escopo]: c })); });
    return () => { vivo = false; };
  }, [familia.pronta, escopo, id, podeAlgo]);

  const conf = confs[escopo];
  const nomeMostrado = eu?.nome || nome || 'formação sem nome';
  const versaoAberta = eu?.versao || 1;
  const permitido = !!permitidos[escopo];
  const pronto = familia.pronta && !!eu && !!conf && !conf.erro && conf.bloqueios.length === 0 && permitido && motivoValido(motivo) && !salvando;
  const frase = frasePorExtenso(escopo, versaoAberta, versoes);

  const excluir = async () => {
    if (trava.current || !pronto) return;
    trava.current = true; setSalvando(true);
    try {
      const ok = await confirmar(`Excluir ${frase} de "${nomeMostrado}"?\n\nMotivo: ${motivo.trim()}\n\nA formação some das telas e fica guardada; só Admin e gerentes veem a lista das excluídas.`);
      if (!ok) return;
      const r = await excluirFormacao({ id, escopo, motivo, atualizadoEm: atualizadoEm || eu?.atualizado_em || null });
      if (r.erro) { mostrarAviso(`A formação "${nomeMostrado}" NÃO foi excluída\n${r.erro}`, 'erro'); return; }
      try {
        await logChange({ module: 'formacao_precos', entityType: 'cotacoes_precos', entityId: id, changeType: 'UPDATE', user: currentUser,
          oldRow: { excluida_em: null }, newRow: { excluida_em: new Date().toISOString(), excluida_escopo: r.resultado?.escopo || escopo, excluida_motivo: motivo.trim() } });
      } catch { /* a exclusão já ficou no histórico da formação pelo banco */ }
      const desl = (r.resultado?.desligados || []) as string[];
      mostrarAviso(`Formação "${nomeMostrado}" excluída (${frasePorExtenso(r.resultado?.escopo || escopo, versaoAberta, r.resultado?.versoes || versoes)})${desl.length ? '\n' + desl.map(d => '• ' + d).join('\n') : ''}`, 'ok');
      onExcluida?.({ escopo: r.resultado?.escopo || escopo, ids: r.resultado?.ids || [] });
      onClose();
    } finally { trava.current = false; setSalvando(false); }
  };

  const lerLista = (xs: string[]) => <ul className="acn-fp-pontos">{xs.map((x, i) => <li key={i}>{x}</li>)}</ul>;

  return (
    <div className="modal-overlay acn-fp-overlay" onClick={e => { if (e.target === e.currentTarget && !salvando) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-fp-jan" role="dialog" aria-label="Excluir formação de preços" data-teste="excluir-formacao">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiTrashCanOutline} size={16} /> Excluir formação de preços</span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          {!familia.pronta && <div className="acn-ajuda">Conferindo a formação...</div>}
          {familia.pronta && familia.erro && <Faixa tom="erro">Não foi possível ler as versões desta formação ({familia.erro}). Por segurança, nada foi excluído. Feche e tente de novo.</Faixa>}

          {familia.pronta && !familia.erro && eu && (
            <>
              <div className="acn-ajuda" data-teste="formacao-escolhida">
                <strong>{nomeMostrado}</strong>{eu.numero_cotacao ? ` · ${eu.numero_cotacao}` : ''} · v{versaoAberta}{varias ? ` (a formação tem ${lista.length} versões: ${versoes})` : ''}
              </div>
              <div className="acn-ajuda">A formação não é apagada: ela some das telas e fica guardada, com o motivo, na lista de excluídas (só Admin e gerentes veem).</div>

              {!podeAlgo && <Faixa tom="erro"><span data-teste="sem-permissao">Só Admin, gerentes e quem criou a formação podem excluí-la.</span></Faixa>}

              {podeAlgo && varias && (
                <div className="acn-fp-escopo" role="radiogroup" aria-label="O que excluir" data-teste="escolha-do-escopo">
                  <label className={'acn-fp-escopo-op' + (escopo === 'versao' ? ' marcada' : '') + (permitidos.versao ? '' : ' travada')} data-teste="escopo-versao">
                    <input type="radio" name="escopo-exclusao" checked={escopo === 'versao'} disabled={!permitidos.versao || salvando} onChange={() => setEscopo('versao')} />
                    <span><strong>Só esta versão (v{versaoAberta})</strong><span className="acn-ajuda"> · as outras {lista.length - 1} versão(ões) continuam{permitidos.versao ? '' : '. Você não criou esta versão.'}</span></span>
                  </label>
                  <label className={'acn-fp-escopo-op' + (escopo === 'formacao' ? ' marcada' : '') + (permitidos.formacao ? '' : ' travada')} data-teste="escopo-formacao">
                    <input type="radio" name="escopo-exclusao" checked={escopo === 'formacao'} disabled={!permitidos.formacao || salvando} onChange={() => setEscopo('formacao')} />
                    <span><strong>A formação inteira ({versoes})</strong><span className="acn-ajuda"> · todas as versões saem juntas{permitidos.formacao ? '' : '. Só quem criou a v1, Admin ou gerentes.'}</span></span>
                  </label>
                </div>
              )}

              {podeAlgo && !conf && <div className="acn-ajuda">Conferindo o que está ligado a esta formação...</div>}
              {podeAlgo && conf?.erro && <Faixa tom="erro">Não foi possível conferir o que está ligado à formação ({conf.erro}). Por segurança, nada será excluído.</Faixa>}

              {podeAlgo && conf && !conf.erro && conf.bloqueios.length > 0 && (
                <Faixa tom="erro"><div data-teste="bloqueios"><strong>Não dá para excluir {frase} agora:</strong>{lerLista(conf.bloqueios)}</div></Faixa>
              )}
              {podeAlgo && conf && !conf.erro && conf.desligados.length > 0 && (
                <Faixa tom="atencao"><div data-teste="desligados"><strong>Sai junto, sozinho:</strong>{lerLista(conf.desligados)}</div></Faixa>
              )}
              {podeAlgo && conf && !conf.erro && conf.avisos.length > 0 && (
                <div data-teste="avisos"><div className="acn-label">Fica como está (confira)</div>{lerLista(conf.avisos)}</div>
              )}

              {podeAlgo && (
                <div className="form-group">
                  <label className="acn-label" htmlFor="exf-motivo">Motivo da exclusão *</label>
                  <textarea id="exf-motivo" className="acn-input" rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} disabled={salvando}
                    placeholder="Por que esta formação deve ser excluída?" data-teste="motivo-exclusao" />
                  <div className="acn-ajuda">Vai para o histórico da formação. Pelo menos 5 letras.</div>
                </div>
              )}
            </>
          )}
          {familia.pronta && !familia.erro && !eu && <Faixa tom="erro">Não encontrei esta formação: ela pode já ter sido excluída. Feche e atualize a tela.</Faixa>}
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onClose} disabled={salvando}>{podeAlgo ? 'Cancelar' : 'Fechar'}</Botao>
          {podeAlgo && <Botao variante="perigo" icone={mdiTrashCanOutline} disabled={!pronto} onClick={excluir} data-teste="botao-excluir-formacao">
            {salvando ? 'Excluindo...' : escopo === 'versao' ? 'Excluir a versão' : varias ? 'Excluir a formação inteira' : 'Excluir a formação'}
          </Botao>}
        </div>
      </div>
    </div>
  );
}
