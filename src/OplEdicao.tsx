// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// OplEdicao — edição completa de OP por Admin/Gerente, uma a uma ou em lote
//
// Todos os campos e valores da OP, inclusive o status (a OP muda de fase sem
// passar pelos botões do fluxo). Por isso o motivo é obrigatório e cada
// alteração fica no histórico da OP (logs_movimentacao_opl: campo, antes e
// depois) e na auditoria (logChange). Nada é apagado.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { anexarValoresDaOp, CAMPOS_DE_VALOR_DA_OP } from './OpValores';
import { logChange } from './AuditSystem';
import { FLUXOS, soEnvio, terminaEmEnvio, STATUS_AGUARDANDO_LIBERACAO_COMERCIAL, STATUS_AGUARDANDO_TERCEIRO, FLUXO_SO_TERCEIROS_DEF, soTerceiros } from './FluxoEntrega';
import { ehAdminOuGerente } from './utils/permissoes';
import { ORIGENS } from './OrigemVenda';
import { ColaboradorSelect } from './ColaboradorSelect';
import { TIPOS_SERVICO_TERCEIRO } from './NovaOpOsModal';
import { confirmar, mostrarAviso } from './Feedback';
import { Botao } from './Interface';
import { explicarErroDoBanco } from './ErroDoBanco';
import { VeiculoDaOp } from './VeiculoCadastro';
import { carregarVeiculos, textoVeiculo } from './Veiculos';
import { CampoCep } from './CampoCep';
import { CampoTelefone } from './CampoTelefone';
import { SeletorEscopo, useTamanhoDoLote } from './EscopoDaEdicao';
import { aplicarNoLote, lerOutrasUnidadesDoLote, camposDoLote, textoDoResultadoLote } from './EdicaoDeLote';
import { conferirCepAntesDeSalvar, cepParaGravar, soDigitosCep } from './Cep';
import { somenteDigitos, diasParaGravar } from './ChegadaDoVeiculo';
import { CampoMoeda } from './CampoMoeda';

export const podeEditarOplCompleta = (u: any) => ehAdminOuGerente(u);

// Fases da OP (mesma ordem do pipeline em AcnTabShared)
export const STATUS_OPL = [
  'Em Espera Engenharia', 'Em Analise Engenharia', 'Devolvida para Engenharia', 'Devolvida Comercial',
  'Em Espera PCP', 'Devolvida PCP', STATUS_AGUARDANDO_TERCEIRO, 'Aguardando Almox', 'Kit OK - Aguardando PCP',
  'Aguardando Inicio Producao', 'Aguardando Agendamento Manutenção', 'Manutenção Agendada', 'Em Producao',
  'Retrabalho', 'Aguardando CQ', 'Aguardando Embalagem', 'Aguardando Cotacao Frete',
  STATUS_AGUARDANDO_LIBERACAO_COMERCIAL, 'Aguarda Emissao NF', 'Faturado',
  'Faturado e Disponivel para Entrega', 'Cancelado',
];
const STATUS_ALMOX = ['', 'Kit OK', 'Falta de Material', 'Liberado com Pendencia'];
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

// 'veiculo' = o campo do catálogo de veículos (veiculo_id): o mesmo seletor da criação da OP, que
// também preenche o texto "Modelo". Pedido do usuário em 29/09/2026 — na edição só dava para digitar.
type Campo = { campo: string; rotulo: string; tipo: 'texto' | 'numero' | 'dias' | 'moeda' | 'data' | 'select' | 'textarea' | 'veiculo'; opcoes?: string[]; grupo: string };
export const CAMPOS_OPL: Campo[] = [
  { grupo: 'Identificação', campo: 'cliente_nome', rotulo: 'Cliente', tipo: 'texto' },
  { grupo: 'Identificação', campo: 'tipo_projeto', rotulo: 'Tipo de projeto', tipo: 'texto' },
  { grupo: 'Identificação', campo: 'faturamento_empresa', rotulo: 'Empresa (faturamento)', tipo: 'select', opcoes: ['ACN', 'Detech'] },
  { grupo: 'Identificação', campo: 'quantidade', rotulo: 'Quantidade', tipo: 'numero' },
  { grupo: 'Identificação', campo: 'numero_nf', rotulo: 'NF-e', tipo: 'texto' },
  { grupo: 'Identificação', campo: 'numero_nf_servico', rotulo: 'NFS-e (serviço)', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'veiculo_id', rotulo: 'Veículo (catálogo)', tipo: 'veiculo' },
  { grupo: 'Veículo / envio', campo: 'modelo', rotulo: 'Modelo', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'chassi', rotulo: 'Chassi', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'placa', rotulo: 'Placa', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'local_instalacao', rotulo: 'Local de instalação', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'fluxo_entrega', rotulo: 'Fluxo de entrega', tipo: 'select', opcoes: ['', ...FLUXOS.map(f => f.valor), FLUXO_SO_TERCEIROS_DEF.valor] },
  { grupo: 'Veículo / envio', campo: 'destino_cidade', rotulo: 'Cidade de destino', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'destino_uf', rotulo: 'UF de destino', tipo: 'select', opcoes: ['', ...UFS] },
  { grupo: 'Veículo / envio', campo: 'destino_cep', rotulo: 'CEP de destino', tipo: 'cep' },   // R17 (13/10/2026): campo de CEP com conferência
  { grupo: 'Veículo / envio', campo: 'destino_logradouro', rotulo: 'Rua de destino', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'destino_numero', rotulo: 'Número do destino', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'destino_bairro', rotulo: 'Bairro do destino', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'destino_complemento', rotulo: 'Complemento do destino', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'destino_destinatario', rotulo: 'Quem recebe', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'destino_telefone', rotulo: 'Telefone de quem recebe', tipo: 'telefone' },
  { grupo: 'Datas e prazos', campo: 'data_entrada', rotulo: 'Data de entrada', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'data_chegada_veiculo', rotulo: 'Previsão de chegada do veículo', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'prazo_dias_apos_chegada', rotulo: 'Prazo após a chegada do veículo (dias)', tipo: 'dias' },
  { grupo: 'Datas e prazos', campo: 'data_prevista_entrega', rotulo: 'Previsão de entrega', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'prazo_entrega_comercial', rotulo: 'Prazo entrega comercial', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'prazo_entrega_producao', rotulo: 'Prazo entrega produção', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'data_aceite_cliente', rotulo: 'Aceite do cliente', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'prazo_garantia', rotulo: 'Prazo de garantia', tipo: 'texto' },
  { grupo: 'Valores', campo: 'valor_total', rotulo: 'Valor total (R$)', tipo: 'moeda' },
  { grupo: 'Valores', campo: 'valor_mao_de_obra', rotulo: 'Valor M.O. (R$)', tipo: 'moeda' },
  { grupo: 'Valores', campo: 'valor_mao_de_obra_serralheria', rotulo: 'Valor M.O. serralheria (R$)', tipo: 'moeda' },
  { grupo: 'Status', campo: 'status_geral', rotulo: 'Status geral (fase)', tipo: 'select', opcoes: STATUS_OPL },
  { grupo: 'Status', campo: 'status_bom', rotulo: 'Status BOM', tipo: 'texto' },
  { grupo: 'Status', campo: 'status_almox', rotulo: 'Status Almoxarifado', tipo: 'select', opcoes: STATUS_ALMOX },
  { grupo: 'Responsáveis', campo: 'responsavel_comercial', rotulo: 'Comercial', tipo: 'texto' },
  { grupo: 'Responsáveis', campo: 'responsavel_engenharia', rotulo: 'Engenharia', tipo: 'texto' },
  { grupo: 'Responsáveis', campo: 'responsavel_almox', rotulo: 'Almoxarifado', tipo: 'texto' },
  { grupo: 'Responsáveis', campo: 'responsavel_producao', rotulo: 'Produção', tipo: 'texto' },
  { grupo: 'Responsáveis', campo: 'responsavel_fiscal', rotulo: 'Fiscal', tipo: 'texto' },
  { grupo: 'Responsáveis', campo: 'responsavel_qualidade', rotulo: 'Qualidade', tipo: 'texto' },
  { grupo: 'Textos', campo: 'resumo_servicos', rotulo: 'Resumo dos serviços', tipo: 'textarea' },
  { grupo: 'Textos', campo: 'seriais_equipamentos', rotulo: 'Seriais dos equipamentos', tipo: 'textarea' },
  { grupo: 'Textos', campo: 'observacoes_comercial', rotulo: 'Observações comerciais', tipo: 'textarea' },
  { grupo: 'Textos', campo: 'observacoes_atencao', rotulo: 'Observações de atenção', tipo: 'textarea' },
];
const GRUPOS = [...new Set(CAMPOS_OPL.map(c => c.grupo))];

// valor do banco → texto do formulário
const paraForm = (c: Campo, v: any) => {
  if (v == null) return '';
  if (c.tipo === 'data') return String(v).slice(0, 10);
  if (c.tipo === 'moeda') return String(v).replace('.', ',');
  return String(v);
};
// texto do formulário → valor do banco
const paraBanco = (c: Campo, t: string) => {
  const s = String(t ?? '').trim();
  if (!s) return null;
  if (c.tipo === 'numero') { const n = parseInt(s, 10); return Number.isFinite(n) ? n : null; }
  if (c.tipo === 'dias') return diasParaGravar(s);   // 24/11/2026: só inteiro de 0 a 3650; ilegível não vira zero, vira vazio
  if (c.tipo === 'moeda') { const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return Number.isFinite(n) ? n : null; }
  return s;
};
const mostrar = (c: Campo, v: any) => {
  if (v == null || v === '') return '—';
  if (c.tipo === 'data') return new Date(String(v).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR');
  if (c.tipo === 'moeda') return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return String(v).length > 60 ? String(v).slice(0, 60) + '…' : String(v);
};

function Entrada({ c, valor, onChange, onVeiculo, onCep, currentUser }: { c: Campo; valor: string; onChange: (v: string) => void; onVeiculo?: (p: { veiculo_id: string; modelo?: string }) => void; onCep?: (r: any) => void; currentUser?: any }) {
  // 12e78: o estilo do campo mora em `acn-oe-campo` (design.css); CEP e telefone já nascem com `acn-input`, que a classe só complementa
  if (c.tipo === 'cep') return <CampoCep valor={valor} onChange={onChange} className="acn-input acn-oe-campo" rotulo={c.rotulo} onResultado={onCep} />;
  if (c.tipo === 'telefone') return <CampoTelefone valor={valor} onChange={onChange} className="acn-input acn-oe-campo" />;
  if (c.tipo === 'veiculo') {
    return <VeiculoDaOp veiculoId={valor} currentUser={currentUser} onChange={onVeiculo || ((p) => onChange(p.veiculo_id))} />;
  }
  if (c.tipo === 'select') {
    const ops = c.opcoes || [];
    return (
      <select value={valor} onChange={e => onChange(e.target.value)} className="acn-oe-campo" aria-label={c.rotulo}>
        {ops.map(o => <option key={o} value={o}>{o || '—'}</option>)}
        {valor && !ops.includes(valor) && <option value={valor}>{valor}</option>}
      </select>
    );
  }
  if (c.tipo === 'textarea') return <textarea value={valor} onChange={e => onChange(e.target.value)} rows={3} className="acn-oe-campo" aria-label={c.rotulo} />;
  if (c.tipo === 'dias') return <input type="text" inputMode="numeric" autoComplete="off" maxLength={4} placeholder="Ex.: 30" value={valor} onChange={e => onChange(somenteDigitos(e.target.value))} className="acn-oe-campo" aria-label={c.rotulo} />;
  if (c.tipo === 'moeda') return <CampoMoeda value={valor} onChange={reais => onChange(reais)} className="acn-input acn-oe-campo" aria-label={c.rotulo} />;
  return (
    <input type={c.tipo === 'data' ? 'date' : c.tipo === 'numero' ? 'number' : 'text'} inputMode={c.tipo === 'moeda' ? 'decimal' : undefined}
      value={valor} onChange={e => onChange(e.target.value)} className="acn-oe-campo" aria-label={c.rotulo} />
  );
}

/** Aplica as alterações em cada OP, com histórico e auditoria. Devolve as falhas (a OP NÃO foi alterada) e os avisos (a OP foi alterada, mas algo ficou sem registro). */
async function aplicar(ops: any[], mudancas: (op: any) => Record<string, any>, motivo: string, currentUser: any, origem: string) {
  const falhas: string[] = [];
  const avisos: string[] = [];
  const agora = new Date().toISOString();
  // o histórico mostra o NOME do veículo, não o código da ficha
  const fichas = new Map((await carregarVeiculos()).map((v: any) => [v.id, textoVeiculo(v)]));
  const nomeFicha = (id: any) => id ? (fichas.get(id) || `ficha ${String(id).slice(0, 8)}`) : '—';
  for (const op of ops) {
    const upd = mudancas(op);
    // R17 (13/10/2026): o CEP de entrega que a pessoa mexeu precisa ser válido (a conferência da embalagem); gravado como 00000-000. O que não mudou não é conferido.
    if ('destino_cep' in upd) {
      const recusa = await conferirCepAntesDeSalvar(upd.destino_cep, 'CEP', op.destino_cep);
      if (recusa) { falhas.push(`${op.opl}: ${recusa}`); continue; }
      if (soDigitosCep(upd.destino_cep) !== soDigitosCep(op.destino_cep)) upd.destino_cep = cepParaGravar(upd.destino_cep);
    }
    const campos = Object.keys(upd).filter(k => String(op[k] ?? '') !== String(upd[k] ?? ''));
    if (!campos.length) continue;
    // 25/11/2026: "Somente serviço de terceiro" é uma rota inteira (a OP pula o PCP e espera o serviço do prestador): trocar de ou para ele sem mudar a fase deixaria a OP perdida; a fase se muda junto, na edição completa
    if (campos.includes('fluxo_entrega') && (soTerceiros(op.fluxo_entrega) || soTerceiros(upd.fluxo_entrega)) && !campos.includes('status_geral')) {
      falhas.push(`${op.opl}: trocar de ou para "Somente serviço de terceiro" muda a etapa da OP. Use a Edição completa e mude também a Fase (para esse fluxo: "${STATUS_AGUARDANDO_TERCEIRO}"; saindo dele: a fase em que a OP deve ficar, como "Em Espera PCP"). Os serviços de terceiro se pedem ou cancelam no módulo Serviços de terceiros.`);
      continue;
    }
    const alteracao = Object.fromEntries(campos.map(k => [k, upd[k]]));
    // 25/11/2026 (7.x da 12e78): `.select('id')` confere a linha devolvida; o banco responde "ok, 0 linhas" a uma gravação negada, e a tela seguia como se tivesse salvo (e ainda escrevia o histórico)
    const { data: gravadas, error } = await supabase.from('oples').update(alteracao).eq('id', op.id).select('id');
    if (error) { falhas.push(`${op.opl}: ${explicarErroDoBanco(error)}`); continue; }
    if (!gravadas?.length) { falhas.push(`${op.opl}: o banco não alterou a OP (ela pode ter sido excluída ou você não tem permissão para mudá-la). Atualize a tela e confira.`); continue; }
    logChange({ module: 'oples', entityType: 'oples', entityId: op.id, changeType: 'UPDATE',
      oldRow: Object.fromEntries(campos.map(k => [k, op[k]])), newRow: alteracao, user: currentUser });
    const texto = campos.map(k => {
      const c = CAMPOS_OPL.find(x => x.campo === k);
      const fmt = (v: any) => c?.tipo === 'veiculo' ? nomeFicha(v) : (c ? mostrar(c, v) : v);
      return `${c?.rotulo || k}: ${fmt(op[k])} → ${fmt(upd[k])}`;
    }).join('; ');
    const { error: erroHistorico } = await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: op.id, numero_opl: op.opl, setor: currentUser?.perfil || 'Admin',
      evento: `${origem} por ${currentUser?.nome || '—'} — ${texto}. Motivo: ${motivo}`,
      status_anterior: op.status_geral, status_novo: alteracao.status_geral ?? op.status_geral,
      usuario_nome: currentUser?.nome || null, usuario_email: currentUser?.email || null, data_hora: agora,
    }]);
    // 25/11/2026: a OP já mudou; o histórico que não gravou NÃO pode passar calado (a janela promete "cada campo alterado fica no histórico")
    if (erroHistorico) avisos.push(`${op.opl}: a OP foi alterada, mas o registro no histórico NÃO foi gravado (${explicarErroDoBanco(erroHistorico)}). Anote a mudança (${texto}) à mão.`);
  }
  return { falhas, avisos };
}

// ── Edição completa de uma OP ────────────────────────────────────────────────
export function ModalEditarOpl({ opl, currentUser, onClose, onSalvo }) {
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(CAMPOS_OPL.map(c => [c.campo, paraForm(c, opl[c.campo])])));
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const alterados = CAMPOS_OPL.filter(c => String(paraBanco(c, form[c.campo]) ?? '') !== String(opl[c.campo] ?? '').slice(0, c.tipo === 'data' ? 10 : undefined));
  // "Esta alteração vale para: o lote inteiro" (16/10/2026) — a regra mora em EdicaoDeLote.ts
  const tamanhoDoLote = useTamanhoDoLote(opl?.opl);
  const [escopo, setEscopo] = useState<'unidade' | 'lote'>('unidade');
  const salvar = async () => {
    if (salvando) return;
    if (!alterados.length) { mostrarAviso('Nenhum campo foi alterado.', 'atencao'); return; }
    if (!motivo.trim()) { mostrarAviso('Informe o motivo da alteração.', 'atencao'); return; }
    const mudadosOp = Object.fromEntries(alterados.map(c => [c.campo, paraBanco(c, form[c.campo])]));
    const noLote = escopo === 'lote' && tamanhoDoLote > 1;
    // 25/11/2026: trocar de ou para "Somente serviço de terceiro" muda a etapa e pede os serviços de CADA unidade: nunca vai para o lote de uma vez, só para a unidade aberta
    const trocaDeTerceiros = 'fluxo_entrega' in mudadosOp && (soTerceiros(opl.fluxo_entrega) || soTerceiros(mudadosOp.fluxo_entrega));
    const mudadosLote = trocaDeTerceiros ? Object.fromEntries(Object.entries(mudadosOp).filter(([k]) => k !== 'fluxo_entrega')) : mudadosOp;
    const camposLote = noLote ? camposDoLote(mudadosLote) : [];
    if (noLote && camposLote.length) {
      const rotulo = (k: string) => CAMPOS_OPL.find(x => x.campo === k)?.rotulo || k;
      if (!await confirmar(`Aplicar também nas outras ${tamanhoDoLote - 1} unidades do lote?\n\n${camposLote.map(k => `• ${rotulo(k)}`).join('\n')}\n\nChassi, placa, veículo, status e NF não mudam nas outras, e unidade já faturada ou cancelada não é mexida.`)) return;
    }
    setSalvando(true);
    // 25/11/2026 (7.x da 12e78): qualquer exceção no meio da gravação deixava o botão em "Salvando..." para sempre; agora volta e diz o que houve
    try {
      const { falhas, avisos } = await aplicar([opl], () => mudadosOp, motivo.trim(), currentUser, 'Edição completa');
      avisos.forEach(a => mostrarAviso(a, 'erro'));
      if (falhas.length) { mostrarAviso('Não foi possível salvar:\n' + falhas.join('\n'), 'erro'); return; }
      if (noLote) {
        if (!camposLote.length) mostrarAviso('Salvo só nesta unidade: os campos alterados (chassi, placa, veículo, status ou NF) são de cada carro e não vão para o lote.', 'atencao');
        else {
          const r = await aplicarNoLote({ op: opl, mudados: mudadosLote, usuario: currentUser, ehGerente: true, origem: `Edição completa (vale para o lote inteiro). Motivo: ${motivo.trim()}` });
          const deuErro = !!r.erroLeitura || r.falhas.length > 0 || (r.semHistorico || []).length > 0;
          mostrarAviso(textoDoResultadoLote(r, r.erroLeitura ? 0 : (r.atualizadas.length + r.iguais + r.puladas.length + r.falhas.length)), deuErro ? 'erro' : (r.puladas.length || (r.deOutroFluxo || []).length) ? 'atencao' : 'ok');
        }
        if (trocaDeTerceiros) mostrarAviso('O fluxo "Somente serviço de terceiro" foi trocado só nesta unidade: ele muda a etapa da OP e pede os serviços de cada uma. Troque as outras unidades do lote uma a uma.', 'atencao');
      }
      // a leitura de volta que falha nunca vale como "tudo certo": a tela recebe o que acabou de ser gravado e a pessoa é avisada
      const { data: dadosSalvos, error: erroReleitura } = await supabase.from('oples').select('*').eq('id', opl.id).maybeSingle();
      let nova: any;
      if (erroReleitura || !dadosSalvos) {
        mostrarAviso('As alterações foram salvas, mas não foi possível reler a OP: a tela pode mostrar dados de antes. Atualize a página para conferir.', 'erro');
        nova = { ...opl, ...mudadosOp };
      } else {
        const comValor = await anexarValoresDaOp(dadosSalvos);   // V2c: o valor vem de `oples_valores`
        nova = comValor.op;
        if (comValor.erro) {
          mostrarAviso('As alterações foram salvas, mas não foi possível reler os valores em R$ da OP: a tela mostra os valores de antes. Atualize a página para conferir.', 'erro');
          nova = { ...nova, ...Object.fromEntries(CAMPOS_DE_VALOR_DA_OP.map(k => [k, k in mudadosOp ? mudadosOp[k] : opl[k]])) };
        }
      }
      onSalvo(nova);
    } catch (e: any) {
      mostrarAviso('Não foi possível salvar: ' + explicarErroDoBanco(e), 'erro');
    } finally {
      setSalvando(false);
    }
  };
  return (
    <div className="modal-overlay acn-oe-overlay">
      <div className="modal-box acn-oe-janela">
        <div className="modal-title">✏️ Editar OP {opl.opl}</div>
        <div className="acn-oe-intro">
          Edição completa (Admin/Gerente). O status muda a fase da OP sem passar pelos botões do fluxo: use com cuidado.
          Cada campo alterado fica no histórico da OP com o valor anterior.
        </div>
        <SeletorEscopo opl={opl?.opl} tamanho={tamanhoDoLote} valor={escopo} onChange={setEscopo} texto="Valores em R$ são por carro e ficam iguais em todas." />
        <div className="acn-oe-corpo">
          {GRUPOS.map(g => (
            <div key={g} className="acn-oe-grupo">
              <div className="acn-oe-grupo-titulo">{g}</div>
              <div className="acn-oe-grade">
                {CAMPOS_OPL.filter(c => c.grupo === g).map(c => {
                  const mudou = alterados.includes(c);
                  return (
                    <div key={c.campo} className={c.tipo === 'textarea' ? 'acn-oe-cheio' : undefined}>
                      <label className="acn-oe-rot" data-mudou={mudou ? '' : undefined}>
                        {c.rotulo}{mudou ? ' • alterado' : ''}
                      </label>
                      <Entrada c={c} valor={form[c.campo]} onChange={v => setForm(f => ({ ...f, [c.campo]: v }))} currentUser={currentUser}
                        onCep={(r: any) => { if (r.status === 'ok') setForm(f => ({ ...f, destino_cidade: r.cidade, destino_uf: r.uf })); }}
                        onVeiculo={p => setForm(f => ({ ...f, veiculo_id: p.veiculo_id, ...(p.modelo !== undefined ? { modelo: p.modelo } : {}) }))} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="acn-oe-rodape">
          <label className="acn-label">Motivo da alteração * {alterados.length ? `(${alterados.length} campo${alterados.length > 1 ? 's' : ''} alterado${alterados.length > 1 ? 's' : ''})` : ''}</label>
          <input className="acn-input acn-oe-motivo" value={motivo} onChange={e => setMotivo(e.target.value)}
            placeholder="Ex.: correção do prazo combinado com o cliente" aria-label="Motivo da alteração" />
          <div className="acn-oe-acoes">
            <Botao variante="primario" pequeno className="acn-oe-salvar" disabled={salvando} onClick={salvar}>
              {salvando ? 'Salvando...' : 'Salvar alterações'}
            </Botao>
            <Botao pequeno disabled={salvando} onClick={onClose}>Cancelar</Botao>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Edição em lote: um campo, um valor, várias OPs ───────────────────────────
export function ModalEditarOplLote({ ops, currentUser, onClose, onSalvo }) {
  const [campo, setCampo] = useState(CAMPOS_OPL[0].campo);
  const c = CAMPOS_OPL.find(x => x.campo === campo)!;
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  // ao escolher um veículo do catálogo, o texto "Modelo" das OPs acompanha (como na criação)
  const [modeloDaFicha, setModeloDaFicha] = useState<string | undefined>(undefined);
  useEffect(() => { setValor(c.tipo === 'select' ? (c.opcoes?.[0] ?? '') : ''); setModeloDaFicha(undefined); }, [campo]);
  const salvar = async () => {
    if (salvando) return;
    if (!motivo.trim()) { mostrarAviso('Informe o motivo da alteração.', 'atencao'); return; }
    const novo = paraBanco(c, valor);
    // era o confirm() do navegador, a última janela nativa do sistema fora do Estoque (Etapa 7, 29/09/2026)
    if (novo == null && !await confirmar(`Deixar "${c.rotulo}" em branco nas ${ops.length} OPs?`)) return;
    setSalvando(true);
    try {
      const mudanca = c.tipo === 'veiculo' && novo && modeloDaFicha !== undefined
        ? { veiculo_id: novo, modelo: modeloDaFicha }
        : { [c.campo]: novo };
      const { falhas, avisos } = await aplicar(ops, () => mudanca, motivo.trim(), currentUser, `Edição em lote (${ops.length} OPs)`);
      avisos.forEach(a => mostrarAviso(a, 'erro'));
      if (falhas.length) mostrarAviso('Algumas OPs não foram alteradas:\n' + falhas.join('\n'), 'erro');
      // 25/11/2026 (7.x da 12e78): se NENHUMA OP mudou (todas falharam), a janela fica aberta com o que a pessoa digitou, em vez de fechar como se tivesse dado certo
      if (falhas.length && falhas.length >= ops.length - iguais) return;
      onSalvo();
    } catch (e: any) {
      mostrarAviso('Não foi possível salvar: ' + explicarErroDoBanco(e), 'erro');
    } finally {
      setSalvando(false);
    }
  };
  const iguais = ops.filter(o => String(o[c.campo] ?? '').slice(0, c.tipo === 'data' ? 10 : undefined) === String(paraBanco(c, valor) ?? '')).length;
  return (
    <div className="modal-overlay acn-oe-overlay">
      <div className="modal-box acn-oe-janela-lote">
        <div className="modal-title">✏️ Editar {ops.length} OPs de uma vez</div>
        <div className="acn-oe-intro lote">
          {ops.map(o => o.opl).join(' · ')}
        </div>
        <label className="acn-label">Campo</label>
        <select className="acn-input acn-oe-campo-lote" value={campo} onChange={e => setCampo(e.target.value)} aria-label="Campo a alterar">
          {GRUPOS.map(g => (
            <optgroup key={g} label={g}>
              {CAMPOS_OPL.filter(x => x.grupo === g).map(x => <option key={x.campo} value={x.campo}>{x.rotulo}</option>)}
            </optgroup>
          ))}
        </select>
        <label className="acn-label">Novo valor</label>
        <div className="acn-oe-entrada-lote">
          <Entrada c={c} valor={valor} onChange={setValor} currentUser={currentUser}
            onVeiculo={p => { setValor(p.veiculo_id); setModeloDaFicha(p.modelo); }} />
        </div>
        <div className="acn-oe-intro">
          {iguais ? `${iguais} de ${ops.length} já estão com este valor e não mudam.` : `Muda nas ${ops.length} OPs.`}
          {c.campo === 'status_geral' && ' Mudar o status tira as OPs da fase atual sem passar pelo fluxo.'}
        </div>
        <label className="acn-label">Motivo da alteração *</label>
        <input className="acn-input acn-oe-motivo lote" value={motivo} onChange={e => setMotivo(e.target.value)}
          placeholder="Ex.: cliente adiou a entrega de todo o lote" aria-label="Motivo da alteração em lote" />
        <div className="acn-oe-acoes">
          <Botao variante="primario" pequeno className="acn-oe-salvar" disabled={salvando} onClick={salvar}>
            {salvando ? 'Aplicando...' : `Aplicar em ${ops.length - iguais} OP${ops.length - iguais === 1 ? '' : 's'}`}
          </Botao>
          <Botao pequeno disabled={salvando} onClick={onClose}>Cancelar</Botao>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EDIÇÃO DA OP NO COMERCIAL — antes era feita dentro da própria linha da lista
//
// A linha virava formulário e abria uma faixa extra embaixo: os campos ficavam
// espremidos e boa parte dos dados da OP não tinha onde ser corrigida. Pedido
// do usuário em 24/09/2026: tirar da linha e trazer para um modal com tudo que
// dá para ajustar. Decidido no mesmo dia:
//   • quem edita continua sendo quem já editava na linha (sem trava nova);
//   • o status/fase NÃO entra — continua mudando só pelos botões do fluxo;
//     para corrigir fase existe o "✏️ Editar OP" (Admin/Gerente) acima;
//   • os valores aparecem, mas somem para quem tem `ver_valores` desligado.
//
// Quem grava continua sendo a tela do CRM (salvarOplEdit): é lá que mora a
// regra de desmembrar o lote quando a quantidade aumenta. Aqui é só o
// formulário — por isso o componente é controlado (form + onCampo).
// ─────────────────────────────────────────────────────────────────────────────
type TipoCampoCom = 'texto' | 'textarea' | 'numero' | 'dias' | 'moeda' | 'data' | 'select' | 'centro' | 'colaborador' | 'bool' | 'multi' | 'veiculo';
type CampoCom = {
  campo: string; rotulo: string; tipo: TipoCampoCom; grupo: string;
  opcoes?: { valor: string; label: string }[];
  dica?: string;
  /** ocupa a linha inteira da grade */
  cheio?: boolean;
  /** só aparece para quem pode ver valores */
  financeiro?: boolean;
  /** só faz sentido quando a OP é envio (ou quando não é) */
  soEnvio?: boolean; soVeiculo?: boolean;
  /** só para OP que em algum momento sai daqui embalada (ver terminaEmEnvio) */
  soFrete?: boolean;
};

const OPC = (lista: string[]) => lista.map(v => ({ valor: v, label: v || '—' }));

export const CAMPOS_OPL_COMERCIAL: CampoCom[] = [
  // ── Identificação ──
  { grupo: 'Identificação', campo: 'cliente_nome', rotulo: 'Cliente', tipo: 'texto' },
  // 27/11/2026 (pedido do Financeiro): o frete do envio de material é cotado com o CPF/CNPJ do cliente; pedido na abertura da OP e corrigido aqui
  { grupo: 'Identificação', campo: 'cliente_documento', rotulo: 'CPF/CNPJ do cliente', tipo: 'texto', dica: 'obrigatório no envio de material (o Financeiro cota o frete com ele)' },
  { grupo: 'Identificação', campo: 'cliente_final', rotulo: 'Cliente final', tipo: 'texto', dica: 'quando quem recebe não é quem compra' },
  { grupo: 'Identificação', campo: 'tipo_projeto', rotulo: 'Tipo de projeto', tipo: 'select' },
  { grupo: 'Identificação', campo: 'faturamento_empresa', rotulo: 'Empresa', tipo: 'select', opcoes: OPC(['ACN', 'Detech']) },
  { grupo: 'Identificação', campo: 'quantidade', rotulo: 'Quantidade', tipo: 'numero', dica: 'aumentar oferece desmembrar em unidades /02../NN' },
  { grupo: 'Identificação', campo: 'origem_venda', rotulo: 'Origem da venda', tipo: 'select',
    opcoes: [{ valor: '', label: '— informar —' }, ...ORIGENS.map(o => ({ valor: o.valor, label: `${o.emoji} ${o.label}` }))] },
  { grupo: 'Identificação', campo: 'canal_venda', rotulo: 'Canal de venda', tipo: 'texto' },
  { grupo: 'Identificação', campo: 'vendedor', rotulo: 'Vendedor', tipo: 'texto' },
  { grupo: 'Identificação', campo: 'edital', rotulo: 'Edital', tipo: 'texto' },
  { grupo: 'Identificação', campo: 'proposta', rotulo: 'Proposta', tipo: 'texto' },
  { grupo: 'Identificação', campo: 'numero_nf', rotulo: 'NF-e', tipo: 'texto' },
  { grupo: 'Identificação', campo: 'numero_nf_servico', rotulo: 'NFS-e (serviço)', tipo: 'texto' },

  // ── Veículo / envio ──
  { grupo: 'Veículo / envio', campo: 'fluxo_entrega', rotulo: '🚦 Fluxo de entrega', tipo: 'select',
    opcoes: [{ valor: '', label: '— Fluxo de entrega —' }, ...[...FLUXOS, FLUXO_SO_TERCEIROS_DEF].map(f => ({ valor: f.valor, label: f.label }))],
    dica: 'define em qual fila a OP aparece na Produção. "Somente serviço de terceiro" não se escolhe nem se tira por aqui: muda a etapa da OP e pede os serviços (só o Admin, pela edição completa)' },
  // mesmo seletor da criação da OP: escolhe do catálogo (ou cadastra, com a faixa de anos) e preenche o
  // "Modelo" abaixo. Só para OP com veículo — venda de envio não tem (29/09/2026)
  { grupo: 'Veículo / envio', campo: 'veiculo_id', rotulo: 'Veículo (catálogo)', tipo: 'veiculo', soVeiculo: true,
    dica: 'escolhe do catálogo ou cadastra com os anos; preenche o modelo sozinho' },
  { grupo: 'Veículo / envio', campo: 'modelo', rotulo: 'Modelo', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'veiculo', rotulo: 'Equipamento / Veículo', tipo: 'texto', dica: 'Ex.: Rádio Motorola APX' },
  { grupo: 'Veículo / envio', campo: 'chassi', rotulo: 'Chassi', tipo: 'texto', soVeiculo: true },
  { grupo: 'Veículo / envio', campo: 'placa', rotulo: 'Placa', tipo: 'texto', soVeiculo: true },
  { grupo: 'Veículo / envio', campo: 'local_instalacao', rotulo: 'Local de instalação', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'destino_cidade', rotulo: 'Cidade de entrega', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'destino_uf', rotulo: 'UF', tipo: 'select', opcoes: OPC(['', ...UFS]) },
  { grupo: 'Veículo / envio', campo: 'destino_cep', rotulo: 'CEP de entrega', tipo: 'cep' },   // R17 (13/10/2026): campo de CEP com conferência (a dica virou o texto de exemplo do campo)
  // Endereço completo (15/10/2026): obrigatório em Venda para Envio com frete CIF (EnderecoEntrega.ts); é o que a Logística vê na cotação do frete
  { grupo: 'Veículo / envio', campo: 'destino_logradouro', rotulo: 'Rua de entrega', tipo: 'texto', soFrete: true },
  { grupo: 'Veículo / envio', campo: 'destino_numero', rotulo: 'Número', tipo: 'texto', soFrete: true },
  { grupo: 'Veículo / envio', campo: 'destino_bairro', rotulo: 'Bairro', tipo: 'texto', soFrete: true },
  { grupo: 'Veículo / envio', campo: 'destino_complemento', rotulo: 'Complemento', tipo: 'texto', soFrete: true, dica: 'se não houver: sem complemento' },
  { grupo: 'Veículo / envio', campo: 'destino_destinatario', rotulo: 'Quem recebe', tipo: 'texto', soFrete: true },
  { grupo: 'Veículo / envio', campo: 'destino_telefone', rotulo: 'Telefone de quem recebe', tipo: 'telefone', soFrete: true },
  // CIF/FOB não é texto livre: o Almoxarifado compara com 'FOB' na hora de
  // embalar para decidir se abre cotação de frete. Qualquer outra grafia faz
  // a OP cair no caminho do CIF calada (ver AlmoxarifadoTab.tsx).
  { grupo: 'Veículo / envio', campo: 'frete_responsavel', rotulo: '🚚 Frete (CIF/FOB)', tipo: 'select', soFrete: true,
    opcoes: [{ valor: '', label: '— não informado —' },
             { valor: 'CIF', label: 'CIF — a empresa paga o frete' },
             { valor: 'FOB', label: 'FOB — o cliente paga o frete' }],
    dica: 'FOB pula a cotação da Logística: ao embalar, a OP vai direto para a liberação comercial' },
  { grupo: 'Veículo / envio', campo: 'envio_obs', rotulo: 'Observações do envio', tipo: 'textarea', cheio: true, soEnvio: true },

  // ── Datas e prazos ──
  { grupo: 'Datas e prazos', campo: 'data_entrada', rotulo: 'Data de entrada', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'data_chegada_veiculo', rotulo: 'Previsão de chegada do veículo', tipo: 'data', soVeiculo: true },
  { grupo: 'Datas e prazos', campo: 'prazo_dias_apos_chegada', rotulo: 'Prazo após a chegada do veículo (dias)', tipo: 'dias', soVeiculo: true,
    dica: 'a entrega prevista é a chegada do veículo + estes dias; só números inteiros' },
  { grupo: 'Datas e prazos', campo: 'data_prevista_entrega', rotulo: 'Previsão de entrega', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'prazo_entrega_comercial', rotulo: 'Prazo entrega comercial', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'prazo_entrega_producao', rotulo: 'Prazo entrega produção', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'data_aceite_cliente', rotulo: 'Aceite do cliente', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'prazo_garantia', rotulo: '🛡️ Prazo de garantia', tipo: 'texto', cheio: true,
    dica: 'Ex.: 12 meses a partir da entrega' },

  // ── Faturamento ──
  { grupo: 'Faturamento', campo: 'cnpj_faturamento', rotulo: 'CNPJ / CPF de faturamento', tipo: 'texto', dica: 'pode diferir do cliente' },
  { grupo: 'Faturamento', campo: 'razao_social_faturamento', rotulo: 'Razão social de faturamento', tipo: 'texto' },
  { grupo: 'Faturamento', campo: 'centro_custo', rotulo: '🏷️ Centro de custo', tipo: 'centro' },
  { grupo: 'Faturamento', campo: 'observacoes_faturamento', rotulo: 'Observações de faturamento', tipo: 'textarea', cheio: true },

  // ── Valores ──
  { grupo: 'Valores', campo: 'valor_total', rotulo: 'Valor total (R$)', tipo: 'moeda', financeiro: true },
  { grupo: 'Valores', campo: 'valor_mao_de_obra', rotulo: 'Valor M.O. (R$)', tipo: 'moeda', financeiro: true },
  { grupo: 'Valores', campo: 'valor_mao_de_obra_serralheria', rotulo: 'Valor M.O. serralheria (R$)', tipo: 'moeda', financeiro: true },

  // ── Responsáveis ──
  { grupo: 'Responsáveis', campo: 'responsavel_comercial', rotulo: 'Comercial', tipo: 'colaborador' },
  { grupo: 'Responsáveis', campo: 'responsavel_engenharia', rotulo: 'Engenharia', tipo: 'colaborador' },
  { grupo: 'Responsáveis', campo: 'responsavel_producao', rotulo: 'Produção', tipo: 'colaborador' },
  { grupo: 'Responsáveis', campo: 'responsavel_qualidade', rotulo: 'Qualidade', tipo: 'colaborador' },
  { grupo: 'Responsáveis', campo: 'responsavel_fiscal', rotulo: 'Fiscal', tipo: 'colaborador' },
  { grupo: 'Responsáveis', campo: 'responsavel_almox', rotulo: 'Almoxarifado', tipo: 'colaborador' },

  // ── Serviço de terceiro ──
  // não se aplica a venda de envio (não há veículo para pelicular, blindar...),
  // mesma regra da criação da OP em NovaOpOsModal.tsx
  { grupo: 'Serviço de terceiro', campo: 'servico_terceiro', rotulo: 'Precisa de serviço de terceiro', tipo: 'bool', soVeiculo: true },
  { grupo: 'Serviço de terceiro', campo: 'tipos_servico_terceiro', rotulo: 'Tipos de serviço', tipo: 'multi', cheio: true, soVeiculo: true,
    opcoes: TIPOS_SERVICO_TERCEIRO.map(t => ({ valor: t, label: t })) },
  { grupo: 'Serviço de terceiro', campo: 'obs_servico_terceiro', rotulo: 'Observações do serviço de terceiro', tipo: 'textarea', cheio: true, soVeiculo: true },

  // ── Textos ──
  { grupo: 'Textos e observações', campo: 'resumo_servicos', rotulo: 'Resumo dos serviços', tipo: 'textarea', cheio: true },
  { grupo: 'Textos e observações', campo: 'especificacoes', rotulo: 'Especificações', tipo: 'textarea', cheio: true },
  { grupo: 'Textos e observações', campo: 'observacoes_comercial', rotulo: 'Observações comerciais', tipo: 'textarea', cheio: true },
  { grupo: 'Textos e observações', campo: 'observacoes_atencao', rotulo: '⚠️ Observações de atenção', tipo: 'textarea', cheio: true },
  { grupo: 'Textos e observações', campo: 'seriais_equipamentos', rotulo: 'Seriais dos equipamentos', tipo: 'textarea', cheio: true },
];
const GRUPOS_COM = [...new Set(CAMPOS_OPL_COMERCIAL.map(c => c.grupo))];

/** Campo do formulário. Controlado: quem guarda o estado é a tela do CRM. */
function EntradaCom({ c, valor, onChange, centrosCusto, tiposProjeto, onVeiculo = null, onCep = null, currentUser = null }) {
  const txt = valor == null ? '' : String(valor);

  if (c.tipo === 'cep') return <CampoCep valor={txt} onChange={onChange} className="acn-input acn-oe-campo" rotulo={c.rotulo} onResultado={onCep || undefined} />;
  if (c.tipo === 'telefone') return <CampoTelefone valor={txt} onChange={onChange} className="acn-input acn-oe-campo" />;

  if (c.tipo === 'veiculo') {
    return <VeiculoDaOp veiculoId={txt} currentUser={currentUser} onChange={onVeiculo || ((p) => onChange(p.veiculo_id))} />;
  }

  if (c.tipo === 'colaborador') {
    return <ColaboradorSelect value={txt} onChange={(v: string) => onChange(v)} placeholder="Selecione..." />;
  }
  if (c.tipo === 'bool') {
    return (
      <label className="acn-oe-bool">
        <input type="checkbox" checked={!!valor} onChange={e => onChange(e.target.checked)} />
        {c.rotulo}
      </label>
    );
  }
  if (c.tipo === 'multi') {
    // o banco guarda uma lista (jsonb); marcar e desmarcar monta a lista
    const marcados: string[] = Array.isArray(valor) ? valor : [];
    return (
      <div className="acn-oe-multi">
        {(c.opcoes || []).map(o => {
          const sel = marcados.includes(o.valor);
          return (
            <label key={o.valor} data-sel={sel ? '' : undefined}>
              <input type="checkbox" checked={sel}
                onChange={() => onChange(sel ? marcados.filter(x => x !== o.valor) : [...marcados, o.valor])} />
              {o.label}
            </label>
          );
        })}
      </div>
    );
  }
  if (c.tipo === 'centro') {
    return (
      <select value={txt} onChange={e => onChange(e.target.value)} className="acn-oe-campo" aria-label={c.rotulo}>
        <option value="">— Não definido —</option>
        {(centrosCusto || []).map((x: any) => <option key={x.codigo} value={x.codigo}>{x.codigo} — {x.nome}</option>)}
        {txt && !(centrosCusto || []).some((x: any) => x.codigo === txt) && <option value={txt}>{txt}</option>}
      </select>
    );
  }
  if (c.tipo === 'select') {
    // tipo de projeto é a única lista que vem da tela (cadastro do CRM)
    const ops = c.campo === 'tipo_projeto'
      ? [{ valor: '', label: '— Tipo de projeto —' }, ...(tiposProjeto || []).map((t: string) => ({ valor: t, label: t }))]
      : (c.opcoes || []);
    const conhecido = ops.some(o => o.valor === txt);
    return (
      <select value={txt} onChange={e => onChange(e.target.value)} className="acn-oe-campo" aria-label={c.rotulo}>
        {ops.map(o => <option key={o.valor} value={o.valor}>{o.label}</option>)}
        {/* valor antigo que saiu da lista continua visível, para não sumir sozinho */}
        {txt && !conhecido && <option value={txt}>{txt} (descontinuado)</option>}
      </select>
    );
  }
  if (c.tipo === 'textarea') {
    return <textarea value={txt} onChange={e => onChange(e.target.value)} rows={3}
      className="acn-oe-campo" placeholder={c.dica} aria-label={c.rotulo} />;
  }
  if (c.tipo === 'data') {
    return <input type="date" value={txt.slice(0, 10)} onChange={e => onChange(e.target.value)} className="acn-oe-campo" aria-label={c.rotulo} />;
  }
  if (c.tipo === 'dias') {
    return <input type="text" inputMode="numeric" autoComplete="off" maxLength={4} placeholder="Ex.: 30" value={txt}
      onChange={e => onChange(somenteDigitos(e.target.value))} className="acn-oe-campo" aria-label={c.rotulo} />;
  }
  if (c.tipo === 'numero') {
    return <input type="number" min={1} value={txt} onChange={e => onChange(e.target.value)} className="acn-oe-campo" aria-label={c.rotulo} />;
  }
  if (c.tipo === 'moeda') {
    return <CampoMoeda value={txt} onChange={reais => onChange(reais)} className="acn-input acn-oe-campo" aria-label={c.rotulo} />;
  }
  return <input type="text" value={txt} onChange={e => onChange(e.target.value)} className="acn-oe-campo"
    placeholder={c.dica} aria-label={c.rotulo} />;
}

export function ModalOplComercial({ opl, form, onCampo, currentUser, centrosCusto = [], tiposProjeto = [],
                                    salvando = false, onSalvar, onCancelar, onAlterarNumero = null }) {
  // OP de lote: "esta alteração vale para só esta unidade ou o lote inteiro" (16/10/2026); a gravação mora em CrmTab.salvarOplEdit + EdicaoDeLote.ts
  const tamanhoDoLote = useTamanhoDoLote(opl?.opl);
  const envio = soEnvio(form?.fluxo_entrega ?? opl?.fluxo_entrega);
  // quem não vê valores não vê o grupo inteiro — mesmo tratamento da tela de
  // detalhe da OP, para o valor de venda não vazar por uma tela nova
  const podeVerValores = currentUser?.ver_valores !== false;
  const saiEmbalado = terminaEmEnvio(form?.fluxo_entrega ?? opl?.fluxo_entrega);
  const visivel = (c: CampoCom) => {
    if (c.financeiro && !podeVerValores) return false;
    if (c.soEnvio && !envio) return false;
    if (c.soVeiculo && envio) return false;
    // CIF/FOB só interessa a quem embala e despacha — inclui a serralheria
    // com envio, que não é fila de "envio" mas termina saindo daqui
    if (c.soFrete && !saiEmbalado) return false;
    return true;
  };
  const mudou = (c: CampoCom) => {
    const antes = opl?.[c.campo];
    const agora = form?.[c.campo];
    const norm = (v: any) => v == null ? '' : (c.tipo === 'data' ? String(v).slice(0, 10) : String(v));
    return norm(antes) !== norm(agora);
  };
  const qtdAlterados = CAMPOS_OPL_COMERCIAL.filter(c => visivel(c) && mudou(c)).length;

  return (
    <div className="modal-overlay acn-oe-overlay com">
      <div className="modal-box acn-oe-janela larga">
        <div className="modal-title acn-oe-titulo">
          ✏️ Editar OP {opl?.opl}
          {onAlterarNumero && (
            <Botao pequeno onClick={onAlterarNumero}
              title="Alterar o número desta OP (só administradores e gerentes)">
              ✏️ Alterar nº
            </Botao>
          )}
          <span className="acn-oe-titulo-sub">
            {opl?.cliente_nome || '—'} · {opl?.status_geral || 'sem status'}
          </span>
        </div>
        <div className="acn-oe-intro">
          A fase da OP não se muda por aqui: ela anda pelos botões do fluxo de cada setor.
          {!podeVerValores && ' Os valores estão ocultos para o seu acesso.'}
        </div>

        <SeletorEscopo opl={opl?.opl} tamanho={tamanhoDoLote} valor={form?.__escopo === 'lote' ? 'lote' : 'unidade'} onChange={v => onCampo('__escopo', v)}
          texto="Valores em R$ são por carro e ficam iguais em todas." />

        <div className="acn-oe-corpo">
          {GRUPOS_COM.map(g => {
            const campos = CAMPOS_OPL_COMERCIAL.filter(c => c.grupo === g && visivel(c));
            if (!campos.length) return null;
            return (
              <div key={g} className="acn-oe-grupo com">
                <div className="acn-oe-grupo-titulo">{g}</div>
                <div className="acn-oe-grade">
                  {campos.map(c => (
                    <div key={c.campo} className={(c.cheio || c.tipo === 'textarea') ? 'acn-oe-cheio' : undefined}>
                      {c.tipo !== 'bool' && (
                        <label className="acn-oe-rot" data-mudou={mudou(c) ? '' : undefined}>
                          {c.rotulo}{mudou(c) ? ' • alterado' : ''}
                        </label>
                      )}
                      <EntradaCom c={c} valor={form?.[c.campo]} centrosCusto={centrosCusto} tiposProjeto={tiposProjeto}
                        currentUser={currentUser}
                        onVeiculo={(p: any) => { onCampo('veiculo_id', p.veiculo_id); if (p.modelo !== undefined) onCampo('modelo', p.modelo); }}
                        onCep={(r: any) => { if (r.status === 'ok') { onCampo('destino_cidade', r.cidade); onCampo('destino_uf', r.uf); } }}
                        onChange={(v: any) => onCampo(c.campo, v)} />
                      {c.dica && c.tipo !== 'texto' && c.tipo !== 'textarea' && (
                        <div className="acn-oe-dica">{c.dica}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="acn-oe-rodape com">
          <span className="acn-oe-contagem" data-mudou={qtdAlterados ? '' : undefined}>
            {qtdAlterados ? `${qtdAlterados} campo${qtdAlterados > 1 ? 's' : ''} alterado${qtdAlterados > 1 ? 's' : ''}` : 'Nada alterado ainda'}
          </span>
          <div className="acn-oe-espaco" />
          <Botao pequeno disabled={salvando} onClick={onCancelar}>Cancelar</Botao>
          <Botao variante="primario" pequeno disabled={salvando} onClick={onSalvar}>
            {salvando ? 'Salvando...' : '💾 Salvar alterações'}
          </Botao>
        </div>
      </div>
    </div>
  );
}
