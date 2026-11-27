// Cadastros fiscais › Tipos de nota (preparação do módulo fiscal, 27/11/2026): o mapa de onde nasce cada nota e a conferência das OPs que já têm nota (a nota informada bate com o que a OP vende?).
// As regras estão em FiscalTiposDeNota.ts e a leitura em FiscalDados.ts. SÓ MOSTRA: nada aqui grava nem emite. Leitura recusada nunca vira "tudo confere".
import React, { useMemo, useState } from 'react';
import { mdiDownload, mdiMagnify } from '@mdi/js';
import Icone from './Icone';
import { Botao, Faixa, Selo, Chips, type Familia } from './Interface';
import { baixarPlanilha } from './ExportarPlanilha';
import { combinaBusca } from './SearchUtils';
import { lerOpsComNota } from './FiscalDados';
import { ORIGENS_DE_NOTA, notasQueAOpPede, conferirNotasInformadas, resumoDaConferencia, ROTULO_DO_PEDIDO } from './FiscalTiposDeNota';
import './fiscal.css';

const LIMITE_NA_TELA = 200;
const ROTULO_SABE = { sim: 'Sim', em_parte: 'Em parte', nao: 'Ainda não' };
const FAMILIA_SABE: Record<string, Familia> = { sim: 'ok', em_parte: 'atencao', nao: 'neutro' };

export default function FiscalTiposDeNotaTela() {
  const [d, setD] = useState<any>({ lido: false, ops: [], catalogo: [], erro: '' });
  const [carregando, setCarregando] = useState(false);
  const [filtro, setFiltro] = useState('diverge');
  const [busca, setBusca] = useState('');
  const conferir = async () => { setCarregando(true); const r = await lerOpsComNota(); setD({ ...r, lido: true }); setCarregando(false); };

  const linhas = useMemo(() => (d.erro ? [] : d.ops.map((op: any) => {
    const pede = notasQueAOpPede(op, d.catalogo);
    return { op, pede, conferencia: conferirNotasInformadas(pede, op) };
  })), [d]);
  const resumo = useMemo(() => resumoDaConferencia(linhas), [linhas]);
  const filtradas = useMemo(() => linhas.filter(({ op, conferencia }) => {
    if (filtro === 'diverge' && conferencia.situacao !== 'diverge') return false;
    if (filtro === 'sem_base' && conferencia.situacao !== 'sem_base') return false;
    if (filtro === 'confere' && conferencia.situacao !== 'confere') return false;
    return !busca.trim() || combinaBusca([op.opl, op.cliente_nome, op.numero_nf, op.numero_nf_servico].join(' '), busca);
  }), [linhas, filtro, busca]);

  const exportar = async () => {
    await baixarPlanilha('OPs_tipo_de_nota', [{ nome: 'OPs', colunas: [{ rotulo: 'OP', largura: 16 }, { rotulo: 'Cliente', largura: 36 }, { rotulo: 'A OP vende', largura: 40 }, { rotulo: 'NF-e informada', largura: 16 }, { rotulo: 'NFS-e informada', largura: 16 }, { rotulo: 'Situação', largura: 16 }, { rotulo: 'O que diverge', largura: 50 }],
      linhas: filtradas.map(({ op, pede, conferencia }) => [op.opl, op.cliente_nome || '', ROTULO_DO_PEDIDO[pede.pede], conferencia.informadas.material, conferencia.informadas.servico, ROTULO_DA_SITUACAO[conferencia.situacao], conferencia.divergencias.join('; ')]) }]);
  };

  return (
    <div>
      <div className="acn-ajuda">Aqui o sistema diz de onde nasce cada tipo de nota e o que ele já entende sozinho. <strong>Nada é emitido e nada trava o Fiscal:</strong> o que ainda não foi confirmado pela contabilidade está marcado e vale só como proposta.</div>

      <h3 className="acn-fcad-secao-tit">De onde nasce cada nota</h3>
      <div className="acn-rolagem">
        <table className="acn-tabela acn-densa">
          <thead><tr><th>Origem</th><th>Nota</th><th>Situação</th><th title="O sistema já tem o dado para reconhecer esta origem sozinho?">O sistema reconhece</th><th>Como reconhece</th></tr></thead>
          <tbody>
            {ORIGENS_DE_NOTA.map(o => (
              <tr key={o.id}>
                <td><strong>{o.origem}</strong>{o.obs && <div className="acn-fraco">{o.obs}</div>}</td>
                <td>{o.nota}</td>
                <td><Selo familia={o.base === 'historico' ? 'ok' : 'atencao'} ponto={false}>{o.base === 'historico' ? 'O histórico confirma' : 'A confirmar com a contabilidade'}</Selo></td>
                <td><Selo familia={FAMILIA_SABE[o.sistemaSabe]} ponto={false}>{ROTULO_SABE[o.sistemaSabe]}</Selo></td>
                <td>{o.quemDiz}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="acn-fcad-secao-tit">Conferir as OPs que já têm nota</h3>
      <p className="acn-fcad-dica">A OP não diz o tipo de nota: quem diz é o que ela vende (mercadoria vai na NF-e, serviço na NFS-e). Esta conferência compara isso com os números que o Fiscal informou. É só para olhar: o Fiscal pode ter um bom motivo para a diferença. OP sem itens lançados (as antigas) não dá para conferir.</p>
      <div className="acn-fcad-barra">
        <Botao pequeno variante="primario" onClick={conferir} disabled={carregando}>{carregando ? 'Conferindo…' : d.lido ? 'Conferir de novo' : 'Conferir as OPs com nota'}</Botao>
        {d.lido && !d.erro && (
          <>
            <div className="acn-cmp-busca-geral"><Icone path={mdiMagnify} size={14} /><input className="acn-input" type="search" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar OP ou cliente" placeholder="OP, cliente, nota…" /></div>
            <Chips rotulo="Mostrar" ativo={filtro} onChange={setFiltro} itens={[{ id: 'diverge', rotulo: `Divergem (${resumo.diverge})` }, { id: 'sem_base', rotulo: `Sem como conferir (${resumo.semBase})` }, { id: 'confere', rotulo: `Conferem (${resumo.confere})` }, { id: 'todas', rotulo: 'Todas' }]} />
            <Botao pequeno icone={mdiDownload} onClick={exportar} disabled={!filtradas.length}>Baixar planilha</Botao>
          </>
        )}
      </div>
      {d.erro && <Faixa tom="erro" acao={<Botao pequeno onClick={conferir}>Tentar de novo</Botao>}>Não foi possível ler as OPs ({d.erro}). Nada foi conferido.</Faixa>}
      {d.lido && !d.erro && (
        <>
          <div className="acn-kpis">
            <div className="acn-kpi"><span className="rot">OPs com nota informada</span><span className="val acn-num">{resumo.total}</span><span className="sub">{resumo.confere} conferem · {resumo.diverge} divergem · {resumo.semBase} sem como conferir</span></div>
          </div>
          {filtradas.length > LIMITE_NA_TELA && <Faixa tom="atencao">Mostrando as primeiras {LIMITE_NA_TELA} de {filtradas.length} OPs. Use a busca ou o filtro; a planilha leva todas.</Faixa>}
          <div className="acn-rolagem">
            <table className="acn-tabela acn-densa">
              <thead><tr><th>OP</th><th>Cliente</th><th>A OP vende</th><th>Nota informada</th><th>Situação</th></tr></thead>
              <tbody>
                {filtradas.slice(0, LIMITE_NA_TELA).map(({ op, pede, conferencia }) => (
                  <tr key={op.id}>
                    <td className="acn-fcad-num"><strong>{op.opl}</strong></td>
                    <td>{op.cliente_nome || '—'}</td>
                    <td><div>{ROTULO_DO_PEDIDO[pede.pede]}</div><div className="acn-fraco">{pede.motivos.join(' · ') || '—'}</div></td>
                    <td className="acn-fcad-num">{[conferencia.informadas.material && `NF-e ${conferencia.informadas.material}`, conferencia.informadas.servico && `NFS-e ${conferencia.informadas.servico}`].filter(Boolean).join(' · ') || '—'}</td>
                    <td>
                      <Selo familia={SITUACAO[conferencia.situacao].familia} ponto={false}>{ROTULO_DA_SITUACAO[conferencia.situacao]}</Selo>
                      {conferencia.divergencias.map(x => <div key={x} className="acn-fraco">{x}</div>)}
                    </td>
                  </tr>
                ))}
                {!filtradas.length && <tr><td colSpan={5} className="acn-centro acn-fraco">{filtro === 'diverge' && !busca ? 'Nenhuma OP com nota diverge do que vende. 🎉' : 'Nenhuma OP com esse filtro.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const ROTULO_DA_SITUACAO = { confere: 'Confere', diverge: 'Diverge', sem_base: 'Sem como conferir', sem_nota: 'Sem nota' };
const SITUACAO = { confere: { familia: 'ok' }, diverge: { familia: 'atencao' }, sem_base: { familia: 'neutro' }, sem_nota: { familia: 'neutro' } };
