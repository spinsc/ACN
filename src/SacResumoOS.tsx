// @ts-nocheck
import React from 'react';
import { Botao, Selo } from './Interface';
import Icone from './Icone';
import { mdiClose, mdiMessageTextOutline } from '@mdi/js';

// ─────────────────────────────────────────────────────────────────────────────
// RESUMO COMPLETO DA OS — pedido do usuário em 08/10/2026
// No Kanban do SAC, clicar no card abre este painel com TUDO que está registrado na OS, agrupado por assunto (quem é o cliente, o que é o equipamento ou veículo, andamento
// com as datas, valores, itens da cotação, responsáveis, observações, arquivos). Só aparece o campo que tem valor: a OS recém-aberta não mostra dezenas de "—".
// É só leitura: as ações (cotação, aprovação, execução…) continuam nos botões do card, como sempre.
// ─────────────────────────────────────────────────────────────────────────────
const dia = (d: any) => !d ? '' : /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d).split('-').reverse().join('/') : new Date(d).toLocaleDateString('pt-BR');
const diaHora = (d: any) => !d ? '' : new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const reais = (v: any) => (v == null || v === '' || Number.isNaN(Number(v))) ? '' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const horas = (v: any) => (v == null || v === '' || Number.isNaN(Number(v))) ? '' : String(Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })) + ' h';
const sim = (v: any) => v === true ? 'Sim' : v === false ? 'Não' : '';
const lista = (v: any): any[] => Array.isArray(v) ? v : [];

function Grupo({ titulo, linhas, children }: any) {
  const comValor = (linhas || []).filter(([, v]) => v !== '' && v != null && v !== false);
  if (!comValor.length && !children) return null;
  return (
    <div className="acn-quadro">
      <div className="acn-quadro-titulo">{titulo}</div>
      {comValor.map(([rot, v]) => (
        <div key={rot} className="acn-ficha-linha"><span>{rot}</span><span>{v}</span></div>
      ))}
      {children}
    </div>
  );
}

export default function SacResumoOS({ os, onClose, onAcompanhamento }: any) {
  if (!os) return null;
  const veicular = !!os.is_manutencao_veicular;
  const itens = lista(os.itens_revisados).length ? lista(os.itens_revisados) : lista(os.itens_cotacao);
  const equipamentos = lista(os.equipamentos_lista);
  const acessorios = lista(os.acessorios);
  const materiais = lista(os.materiais_utilizados);
  const arquivos = lista(os.arquivos_os);
  const nomeDe = (x: any) => typeof x === 'string' ? x : (x?.descricao || x?.nome || x?.equipamento || x?.produto || JSON.stringify(x));
  const logsEng = lista(os.logs_acompanhamento_eng);

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-sac-resumo" role="dialog" aria-label={'Resumo da OS ' + os.numero_os} style={{ width: 'min(860px, 96vw)', maxWidth: 'min(860px, 96vw)' }}>
        <div className="acn-modal-cab">
          <span className="modal-title">OS {os.numero_os} <Selo familia="neutro" ponto={false}>{os.status}</Selo> {os.empresa && <Selo familia="marca" ponto={false}>{os.empresa}</Selo>}</span>
          <span style={{ display: 'flex', gap: 6 }}>
            {onAcompanhamento && <Botao pequeno icone={mdiMessageTextOutline} onClick={onAcompanhamento}>Acompanhamento</Botao>}
            <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Fechar" title="Fechar" onClick={onClose} />
          </span>
        </div>
        <div className="acn-modal-corpo" style={{ maxHeight: '78vh' }}>
          <Grupo titulo="Serviço" linhas={[
            ['Tipo de serviço', os.tipo_servico], ['Tipo de projeto', os.tipo_projeto], ['Atendimento', os.tipo_avaliacao],
            ['Lote', os.lote_id ? (os.lote_descricao || 'Faz parte de um lote de OS') : ''], ['Setor de execução', os.setor_execucao],
            ['Defeito reclamado', os.defeito_reclamado], ['Resumo dos serviços', os.resumo_servicos],
            ['Acompanhamento da engenharia', os.acompanhamento_engenharia ? 'Sim' : ''], ['Aberta por', os.criado_por_nome],
          ]} />

          <Grupo titulo={veicular ? 'Veículo' : 'Equipamento'} linhas={[
            [veicular ? 'Veículo' : 'Equipamento', os.equipamento_nome], ['Marca', os.marca], ['Modelo', os.modelo], ['Modelo do veículo', os.veiculo_modelo],
            ['Chassi', os.chassi], ['Nº de série', os.numero_serie], ['Quantidade', os.quantidade > 1 ? os.quantidade : ''],
          ]}>
            {equipamentos.length > 0 && (
              <div><span className="acn-fraco">Lista de equipamentos ({equipamentos.length})</span>
                <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>{equipamentos.map((x: any, i: number) => <li key={i}>{typeof x === 'string' ? x : [x.nome || x.equipamento, x.modelo, x.numero_serie && 'SN ' + x.numero_serie].filter(Boolean).join(' · ') || nomeDe(x)}</li>)}</ul>
              </div>
            )}
            {acessorios.length > 0 && (
              <div className="acn-ficha-linha"><span>Acessórios</span><span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {acessorios.map((a: any, i: number) => <Selo key={i} familia={a.presente === false ? 'erro' : 'ok'} ponto={false}>{a.presente === false ? '✗ ' : '✓ '}{nomeDe(a)}</Selo>)}
              </span></div>
            )}
          </Grupo>

          <Grupo titulo="Cliente" linhas={[
            ['Cliente', os.cliente_nome], ['Empresa / órgão', os.empresa_orgao], ['CPF / CNPJ', os.cpf_cnpj], ['Telefone', os.telefone], ['E-mail', os.email], ['Endereço', os.endereco],
            ['Faturar para', os.razao_social_faturamento], ['CNPJ de faturamento', os.cnpj_faturamento], ['Endereço de faturamento', os.endereco_faturamento],
          ]} />

          <Grupo titulo="Andamento" linhas={[
            ['Abertura', diaHora(os.data_abertura)], ['Chegada do veículo', diaHora(os.data_chegada_veiculo)], ['Início do diagnóstico', diaHora(os.data_inicio_diagnostico)],
            ['Orçamento finalizado', diaHora(os.data_finalizacao_orcamento)], ['Prazo do orçamento', dia(os.prazo_orcamento)], ['Orçamento enviado ao cliente', diaHora(os.data_envio_orcamento)],
            ['Aprovação', os.aprovado === true ? [sim(os.aprovado), os.aprovador_nome && 'por ' + os.aprovador_nome, os.data_aprovacao && diaHora(os.data_aprovacao)].filter(Boolean).join(' · ') : os.aprovado === false ? 'Reprovado' : ''],
            ['Motivo da reprovação', os.motivo_reprovacao], ['Retirada após reprovação', [os.nome_retirada_reprovacao, dia(os.data_retirada_reprovacao)].filter(Boolean).join(' · ')],
            ['Provisionamento', [dia(os.data_provisionamento), os.periodo_provisionamento].filter(Boolean).join(' · ')],
            ['Previsão de entrega', dia(os.data_prevista_entrega)], ['Previsão pós-aprovação', dia(os.data_prevista_pos_aprovacao)],
            ['Início da execução', diaHora(os.data_inicio_execucao_lab || os.data_inicio_manutencao)], ['Execução finalizada', diaHora(os.data_finalizacao_execucao || os.data_conclusao_manutencao)],
            ['Saída', [diaHora(os.data_saida), os.nome_retirada_saida && 'retirado por ' + os.nome_retirada_saida].filter(Boolean).join(' · ')],
            ['Controle de qualidade', [os.resultado_cq, os.cq_auditor && 'por ' + os.cq_auditor, os.data_cq && diaHora(os.data_cq)].filter(Boolean).join(' · ')], ['Obs. da reprovação no CQ', os.obs_reprovacao_cq],
            ['Faturamento', [dia(os.data_faturamento), os.numero_nf && 'NF ' + os.numero_nf, os.numero_nf_servico && 'NFS-e ' + os.numero_nf_servico, os.data_emissao_nf && 'emitida em ' + diaHora(os.data_emissao_nf)].filter(Boolean).join(' · ')],
            ['Revisão de orçamento pendente', os.revisao_pendente ? 'Sim' : ''],
          ]} />

          <Grupo titulo="Valores" linhas={[
            ['Orçamento', reais(os.valor_orcamento)], ['Orçamento revisado', reais(os.valor_orcamento_revisado)], ['Valor total', reais(os.valor_total)], ['Mão de obra', reais(os.valor_mao_de_obra)],
            ['Deslocamento', reais(os.despesa_deslocamento)], ['Hospedagem', reais(os.despesa_hospedagem)], ['Alimentação', reais(os.despesa_alimentacao)], ['Total de despesas', reais(os.total_despesas)],
            ['Condições de pagamento', os.condicoes_pagamento], ['Horas cobradas na cotação', horas(os.horas_cobradas_cotacao)],
            ['Horas do orçamento (KPI)', horas(os.kpi_orcamento_horas)], ['Horas da execução (KPI)', horas(os.kpi_execucao_horas)],
          ]} />

          {itens.length > 0 && (
            <div className="acn-quadro">
              <div className="acn-quadro-titulo">Itens da cotação{lista(os.itens_revisados).length ? ' (revisados)' : ''}</div>
              <div className="acn-rolagem">
                <table className="acn-tabela acn-compacta">
                  <thead><tr><th>Código</th><th>Descrição</th><th className="acn-dir">Qtd.</th><th className="acn-dir">Unitário</th><th className="acn-dir">Total</th></tr></thead>
                  <tbody>{itens.map((i: any, k: number) => (
                    <tr key={k}><td>{i.codigo || '—'}</td><td className="acn-texto-longo">{i.descricao || '—'}</td><td className="acn-dir acn-num">{i.quantidade ?? ''}</td>
                      <td className="acn-dir acn-num">{reais(i.valor_unitario)}</td><td className="acn-dir acn-num acn-forte">{reais((Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0))}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {materiais.length > 0 && (
            <Grupo titulo="Materiais utilizados">
              <ul style={{ margin: '0 0 0 18px', padding: 0 }}>{materiais.map((m: any, i: number) => <li key={i}>{typeof m === 'string' ? m : [m.descricao || m.nome, m.quantidade != null && '× ' + m.quantidade].filter(Boolean).join(' ')}</li>)}</ul>
            </Grupo>
          )}

          <Grupo titulo="Responsáveis" linhas={[
            ['Responsável da OS', os.responsavel_nome], ['Técnico', os.tecnico_responsavel], ['Segundo técnico', os.tecnico_producao_2_nome],
            ['Equipe', os.equipe_nome], ['Modo de execução', os.modo_execucao], ['Fiscal', os.responsavel_fiscal],
          ]} />

          <Grupo titulo="Observações" linhas={[
            ['Observações', os.observacoes], ['Observações do laboratório', os.observacoes_lab], ['Observações da manutenção', os.observacoes_manutencao],
          ]}>
            {logsEng.length > 0 && <div className="acn-fraco">{logsEng.length} registro(s) de acompanhamento da engenharia — abra "Acompanhamento" para ler.</div>}
          </Grupo>

          {(arquivos.length > 0 || lista(os.fotos_entrada).length > 0 || lista(os.fotos_saida).length > 0 || os.assinatura_aprovacao_url || os.assinatura_saida_url) && (
            <div className="acn-quadro">
              <div className="acn-quadro-titulo">Arquivos e fotos</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {arquivos.map((a: any, i: number) => <a key={'a' + i} href={a.url} target="_blank" rel="noreferrer">{a.nome || 'Arquivo ' + (i + 1)}</a>)}
                {os.assinatura_aprovacao_url && <a href={os.assinatura_aprovacao_url} target="_blank" rel="noreferrer">Assinatura da aprovação</a>}
                {os.assinatura_saida_url && <a href={os.assinatura_saida_url} target="_blank" rel="noreferrer">Assinatura da saída</a>}
                {lista(os.fotos_entrada).length > 0 && <span className="acn-fraco">{lista(os.fotos_entrada).length} foto(s) de entrada</span>}
                {lista(os.fotos_saida).length > 0 && <span className="acn-fraco">{lista(os.fotos_saida).length} foto(s) de saída</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
