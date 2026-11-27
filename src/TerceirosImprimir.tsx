// Serviços de terceiros: a janela que antecede a impressão do CONTRATO e da ORDEM DE SERVIÇO (fatia T4 do PLANO_SERVICOS_TERCEIROS.md, 23/11/2026).
// Pergunta só o que muda a folha: qual empresa contrata (ACN ou DETECH; já vem a da OP) e avisa em vermelho enquanto o texto não foi aprovado (a folha sai com a faixa "MINUTA").
// O clique em "Imprimir" chama a impressão DIRETO, sem nenhuma espera antes: o navegador só abre a janela de impressão dentro do clique (a regra está em TerceirosImpressao.ts).
import React, { useMemo, useState } from 'react';
import { mdiClose, mdiPrinterOutline } from '@mdi/js';
import { Botao, Faixa, hojeISO } from './Interface';
import { mostrarAviso } from './Feedback';
import { empresaDePartida, nomeNoContrato } from './TerceirosConfig';
import { imprimirContrato } from './TerceirosContrato';
import { imprimirOrdemDeServico } from './TerceirosOrdemImpressao';
import { veValores } from './TerceirosFluxo';
import { descreverNumeros } from './TerceirosServicos';

/**
 * `tipo` = 'contrato' (um contrato para os serviços dados) ou 'ordem' (a ordem de serviço em lote, que precisa de `ordem`).
 * `config` é o estado da leitura do modelo: { config, erro, lido }. Sem o modelo lido a janela não imprime: a folha sem cláusulas seria um contrato vazio.
 */
export function ModalImprimir({ tipo, servicos, ordem, config, tipos, prestadores, currentUser, onClose }) {
  const modelo = config?.config || null;
  const ativos = useMemo(() => servicos.filter((s: any) => s.status !== 'cancelado'), [servicos]);
  const [empresaId, setEmpresaId] = useState(() => empresaDePartida(ativos[0]?.ligacao_rotulo, modelo?.empresas || [])?.id || '');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const empresa = (modelo?.empresas || []).find((e: any) => e.id === empresaId) || null;
  const prestadoresDosServicos = [...new Set(ativos.map((s: any) => s.prestador_id || ''))];
  const prestador = ativos[0]?.prestador_id ? prestadores.find((p: any) => p.id === ativos[0].prestador_id) || null : null;
  const titulo = tipo === 'ordem' ? 'Imprimir a ordem de serviço' : 'Imprimir o contrato';

  const imprimir = () => {
    // ATENÇÃO: nada de `await` antes da chamada: a janela de impressão só abre dentro do clique
    if (ocupado) return;
    if (!modelo || !empresa) { setErro('Escolha a empresa que contrata o serviço.'); return; }
    setErro(''); setOcupado(true);
    const base = { empresa, clausulas: modelo.clausulas, aprovada: !!modelo.aprovada, prestador, tipos, servicos: ativos, veValores: veValores(currentUser), emitidoEm: hojeISO() };
    const promessa = tipo === 'ordem' ? imprimirOrdemDeServico({ ...base, ordem }) : imprimirContrato({ ...base, ordem: ordem || null });
    promessa.then(r => {
      setOcupado(false);
      if (!r.ok) { setErro(r.erro || 'Não foi possível preparar a folha.'); return; }
      onClose();
      mostrarAviso(r.aviso || 'A folha abriu em outra janela, pronta para imprimir.', r.aviso ? 'atencao' : 'ok');
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-terc-box-p" role="dialog" aria-label={titulo}>
        <div className="acn-modal-cab">
          <span className="modal-title">{titulo}</span>
          <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} />
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-terc-resumo">{tipo === 'ordem' && ordem ? `Ordem ${ordem.numero} · ` : ''}{descreverNumeros(ativos)}{ativos.length > 1 ? ` · ${ativos.length} carros` : ''}</div>
          {!modelo && (
            <Faixa tom="erro">
              {config?.erro ? `Não foi possível ler o modelo do contrato (${config.erro}). Feche a janela, use "Atualizar" e tente de novo.` : 'O modelo do contrato ainda está sendo lido. Feche a janela e tente de novo em instantes.'}
            </Faixa>
          )}
          {modelo && !modelo.aprovada && (
            <Faixa tom="erro">
              O texto do contrato ainda não foi aprovado pelo Admin. A folha sai com a faixa vermelha "MINUTA" no alto: use só para conferir, não para assinar.
            </Faixa>
          )}
          {modelo && (
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-im-emp">Empresa que contrata *</label>
              <select id="terc-im-emp" className="acn-input" value={empresaId} onChange={e => setEmpresaId(e.target.value)}>
                <option value="">Escolha a empresa…</option>
                {modelo.empresas.map((e: any) => <option key={e.id} value={e.id}>{nomeNoContrato(e)}</option>)}
              </select>
              <p className="acn-terc-dica">Já vem a empresa da OP (OP que começa com D é da DETECH, com A é da ACN). Troque se o contrato for de outra.</p>
            </div>
          )}
          {prestadoresDosServicos.length > 1 && <Faixa tom="atencao">Os serviços têm prestadores diferentes: a folha sai com o prestador do primeiro. Confira antes de assinar.</Faixa>}
          {!prestador && <Faixa tom="atencao">Ainda não há prestador definido: os dados dele saem em branco, para preencher à mão.</Faixa>}
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape">
          <Botao variante="secundario" onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" icone={mdiPrinterOutline} disabled={ocupado || !modelo} onClick={imprimir}>{ocupado ? 'Preparando…' : 'Imprimir'}</Botao>
        </div>
      </div>
    </div>
  );
}
