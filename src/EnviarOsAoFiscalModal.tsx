// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// EnviarOsAoFiscalModal — "Enviar ao Fiscal" da OS cobrada concluída do Laboratório (S2 do PLANO_SAC_FLUXO.md, decisão do usuário em 27/10/2026)
//
// Antes a OS do Laboratório terminava em "Entregue" sem passar pelo Fiscal; só a manutenção veicular chegava lá. Agora toda OS cobrada concluída é enviada ao Fiscal pelo SAC, que confere o valor e o
// documento da nota (o Fiscal não consegue emitir sem eles). O Fiscal emite, a OS volta ao SAC "Faturada - Aguardando Entrega" e termina na entrega. A OS veicular segue pela janela dela (com os seriais).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef } from 'react';
import { mdiSendOutline } from '@mdi/js';
import Icone from './Icone';
import { supabase } from './supabaseClient';
import { logChange } from './AuditSystem';
import { Botao, Faixa } from './Interface';
import { mostrarAviso } from './Feedback';
import { notificarEvento } from './whatsappHelper';
import { lerValorDigitado } from './LerValor';
import { validarEnvioAoFiscal, dadosIniciaisParaOFiscal, STATUS_AGUARDANDO_NOTA } from './SacFluxo';

export default function EnviarOsAoFiscalModal({ os, currentUser, onClose, onEnviada }: { os: any; currentUser?: any; onClose: () => void; onEnviada?: () => void }) {
  const ini = dadosIniciaisParaOFiscal(os);
  const [valor, setValor] = useState(ini.valor);
  const [documento, setDocumento] = useState(ini.documento);
  const [razao, setRazao] = useState(ini.razao);
  const [endereco, setEndereco] = useState(ini.endereco);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const trava = useRef(false);   // clique duplo em "Enviar" não pode gravar duas vezes

  const lido = lerValorDigitado(valor);
  const falta = validarEnvioAoFiscal({ valor: lido.valor ?? null, documento });
  const valorInvalido = !!lido.invalido;

  const enviar = async () => {
    if (trava.current || falta.length || valorInvalido) return;
    trava.current = true; setSalvando(true); setErro('');
    try {
      const agora = new Date().toISOString();
      const novo = { status: STATUS_AGUARDANDO_NOTA, valor_total: lido.valor, cnpj_faturamento: documento.trim(), razao_social_faturamento: razao.trim() || null, endereco_faturamento: endereco.trim() || null, data_envio_fiscal: agora, atualizado_em: agora };
      // só pega se a OS ainda está concluída (outra pessoa pode ter mexido); a linha devolvida confirma
      const { data, error } = await supabase.from('sac_ordens_servico').update(novo).eq('id', os.id).eq('status', 'Concluído').select('id');
      if (error) { setErro(`Não foi possível enviar ao Fiscal (${error.message}). Nada foi alterado.`); return; }
      if (!data || data.length !== 1) { setErro('A OS mudou de etapa enquanto a janela estava aberta. Nada foi alterado: feche, confira a lista e tente de novo.'); return; }
      logChange({ module: 'sac', entityType: 'sac_ordens_servico', entityId: os.id, changeType: 'UPDATE',
        oldRow: { status: os.status, valor_total: os.valor_total ?? null, cnpj_faturamento: os.cnpj_faturamento ?? null }, newRow: novo, user: currentUser });
      notificarEvento('sac_enviado_fiscal', `*Enviado para o Fiscal — ${os.numero_os}*\nCliente: ${os.cliente_nome}\nValor: R$ ${Number(lido.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
      mostrarAviso(`${os.numero_os} enviada ao Fiscal. Quando a nota for emitida, a OS volta para você entregar.`, 'ok');
      onEnviada?.();
      onClose();
    } finally { trava.current = false; setSalvando(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !salvando) onClose(); }}>
      <div className="modal-box acn-modal-cadastro" role="dialog" aria-label="Enviar a OS ao Fiscal" data-teste="enviar-fiscal">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiSendOutline} size={16} /> Enviar ao Fiscal — {os.numero_os}</span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-ajuda">{[os.cliente_nome, os.equipamento_nome].filter(Boolean).join(' · ')}</div>
          <Faixa tom="info">O Fiscal emite a nota e a OS volta para você entregar. O dia da nota passa a ser a data de faturamento da OS (a que a comissão usa): ninguém precisa digitá-la.</Faixa>

          <div className="form-group">
            <label className="acn-label" htmlFor="efo-valor">Valor total da OS (R$) *</label>
            <input id="efo-valor" className="acn-input" inputMode="decimal" placeholder="0,00" value={valor} onChange={e => setValor(e.target.value)} />
            <div className={valorInvalido ? 'acn-txt-erro' : 'acn-ajuda'}>{valorInvalido ? 'Número inválido: digite só o valor, como 1.500,00.' : 'Já vem o valor do orçamento aprovado, quando existe. É o valor da nota.'}</div>
          </div>
          <div className="form-group">
            <label className="acn-label" htmlFor="efo-doc">CPF ou CNPJ para a nota *</label>
            <input id="efo-doc" className="acn-input" inputMode="numeric" placeholder="só os números, ou com pontos e traço" value={documento} onChange={e => setDocumento(e.target.value)} />
            <div className="acn-ajuda">Pode ser o do cliente ou outro, se a nota sai para outra empresa.</div>
          </div>
          <div className="form-group">
            <label className="acn-label" htmlFor="efo-razao">Razão social ou nome na nota</label>
            <input id="efo-razao" className="acn-input" value={razao} onChange={e => setRazao(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="acn-label" htmlFor="efo-end">Endereço de faturamento</label>
            <input id="efo-end" className="acn-input" value={endereco} onChange={e => setEndereco(e.target.value)} />
          </div>
          {falta.length > 0 && <div className="acn-txt-atencao" data-teste="falta-para-o-fiscal">Falta: {falta.join('; ')}.</div>}
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onClose} disabled={salvando}>Cancelar</Botao>
          <Botao variante="primario" icone={mdiSendOutline} disabled={salvando || falta.length > 0 || valorInvalido} onClick={enviar}>{salvando ? 'Enviando...' : 'Enviar ao Fiscal'}</Botao>
        </div>
      </div>
    </div>
  );
}
