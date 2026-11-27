// ─────────────────────────────────────────────────────────────────────────────
// Painel "Metas KPI" do Admin — as metas de lead time de cada setor e o que foi realizado (12e86, 26/11/2026). Saiu do AdminTab.tsx já no padrão do design system (`Botao`,
// `Faixa`, `Selo`, a tabela do guia, sem `style` solto) e com a mesma aparência da tabela "KPIs por setor" do Dashboard.
//
// Achados da 7.x que esta versão corrige (a conta do realizado é a mesma do Dashboard: média das horas das OPs e das demandas concluídas de cada setor):
//  • o botão "Editar" só mudava o número na tela: a meta não era gravada em lugar nenhum, sumia ao atualizar a página e o Dashboard usa outra cópia fixa das metas (não há
//    tabela de metas no banco). Decidido com o usuário em 26/11/2026: o "Editar" que enganava saiu e o painel diz que as metas são fixas no sistema (mudar = pedir à TI);
//  • leitura recusada virava "Sem dados" (e "—" na quantidade), como se o setor não tivesse nenhuma medição: agora faixa vermelha com "Tentar de novo" e o setor que depende
//    da leitura que falhou diz "Não lido" (as outras linhas continuam calculadas);
//  • o servidor devolve no máximo 1.000 linhas por consulta e a média era feita só com a primeira página (hoje são ~600 OPs, mas a conta ficaria errada sem aviso): lê em blocos;
//  • duas leituras seguidas ("Recalcular" duas vezes) podiam terminar na ordem errada: só vale a última pedida;
//  • "ATENCAO" e "CRITICO" sem acento, em letra de 9 px e com cor solta: agora o selo do guia (Atenção, Crítico) e a linha crítica fica marcada, como no Dashboard.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { explicarErroDoBanco } from './ErroDoBanco';
import { lerPaginado } from './LerPaginado';
import { Botao, Faixa, Selo, type Familia } from './Interface';

// As mesmas metas do Dashboard (METRICAS_CONFIG, DashboardTab.tsx): mudar uma exige mudar as duas.
const METRICAS = [
  { nome: 'ENGENHARIA',   desc: 'Lead time liberação BOM',           meta: 8,  tol: 16,  campo: 'tempo_engenharia_horas' },
  { nome: 'PCP',          desc: 'BOM × liberação produção',          meta: 24, tol: 48,  campo: 'tempo_pcp_horas' },
  { nome: 'COMPRAS',      desc: 'Solicitação × efetivação do pedido', meta: 24, tol: 72,  campo: 'tempo_compras_horas' },
  { nome: 'ALMOXARIFADO', desc: 'Kiting solicitado × concluído',     meta: 8,  tol: 24,  campo: 'tempo_almoxarifado_horas' },
  { nome: 'CHICOTES',     desc: 'Pedido × entrega',                  meta: 48, tol: 96,  campo: 'tempo_chicotes_horas' },
  { nome: 'LABORATORIO',  desc: 'Solicitação × devolução',           meta: 24, tol: 72,  campo: 'tempo_laboratorio_horas' },
  { nome: 'PRODUCAO',     desc: 'Lead time execução',                meta: 16, tol: 48,  campo: 'tempo_producao_horas' },
  { nome: 'CQ',           desc: 'Fila checklist × liberação',        meta: 1,  tol: 3,   campo: 'tempo_qualidade_horas' },
  { nome: 'LOGISTICA',    desc: 'Despacho × retorno',                meta: 48, tol: 120, campo: 'tempo_logistica_horas' },
  { nome: 'SERRALHERIA',  desc: 'Mobilização + execução',            meta: 24, tol: 72,  campo: 'tempo_serralheria_horas' },
  { nome: 'FISCAL',       desc: 'Liberação comercial × emissão NF',  meta: 2,  tol: 6,   campo: 'tempo_fiscal_horas' },
];
const OPL_CAMPOS = ['ENGENHARIA', 'PCP', 'PRODUCAO', 'CQ', 'LOGISTICA', 'FISCAL'];            // o realizado vem das OPs
const SETOR_MAP = { CHICOTES: 'Chicotes', SERRALHERIA: 'Serralheria', LABORATORIO: 'Laboratorio', COMPRAS: 'Compras', ALMOXARIFADO: 'Almoxarifado' };   // vem das demandas do setor

const h = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' h';
const media = (vals: number[]) => vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
const situacao = (real: number | null, meta: number, tol: number): { rotulo: string; familia: Familia; critico: boolean } => {
  if (real == null) return { rotulo: 'Sem dados', familia: 'neutro', critico: false };
  if (real <= meta) return { rotulo: 'No prazo', familia: 'ok', critico: false };
  if (real <= tol)  return { rotulo: 'Atenção', familia: 'atencao', critico: false };
  return { rotulo: 'Crítico', familia: 'erro', critico: true };
};

export function PainelKPI() {
  const [medias, setMedias] = useState({});
  const [contagens, setContagens] = useState({});
  const [falhas, setFalhas] = useState({ ops: '', demandas: '' });   // o motivo de cada leitura recusada ('' = leu)
  const [lido, setLido] = useState(false);
  const pedido = useRef(0);

  const ler = useCallback(async () => {
    const meu = ++pedido.current;
    const camposOpl = METRICAS.filter(m => OPL_CAMPOS.includes(m.nome)).map(m => m.campo).join(', ');
    const [ops, dem] = await Promise.allSettled([
      lerPaginado(() => supabase.from('oples').select(camposOpl).order('id')),
      lerPaginado(() => supabase.from('demandas_setoriais').select('setor_destino, tempo_execucao_horas').eq('status', 'Concluido').gt('tempo_execucao_horas', 0).order('id')),
    ]);
    if (meu !== pedido.current) return;   // chegou depois de uma leitura mais nova: não vale
    const m = {}, c = {};
    if (ops.status === 'fulfilled') {
      METRICAS.filter(mt => OPL_CAMPOS.includes(mt.nome)).forEach(mt => {
        const vals = ops.value.map(r => r[mt.campo]).filter(v => v != null && v > 0);
        m[mt.nome] = media(vals); c[mt.nome] = vals.length;
      });
    }
    if (dem.status === 'fulfilled') {
      Object.entries(SETOR_MAP).forEach(([nome, setor]) => {
        const vals = dem.value.filter(d => d.setor_destino === setor).map(d => Number(d.tempo_execucao_horas)).filter(v => v > 0);
        m[nome] = media(vals); c[nome] = vals.length;
      });
    }
    setMedias(m); setContagens(c);
    setFalhas({ ops: ops.status === 'rejected' ? explicarErroDoBanco(ops.reason) : '', demandas: dem.status === 'rejected' ? explicarErroDoBanco(dem.reason) : '' });
    setLido(true);
  }, []);
  useEffect(() => { ler(); }, [ler]);

  const motivo = [falhas.ops && `as OPs: ${falhas.ops}`, falhas.demandas && `as demandas dos setores: ${falhas.demandas}`].filter(Boolean).join(' · ');
  const naoLido = (nome: string) => OPL_CAMPOS.includes(nome) ? !!falhas.ops : !!falhas.demandas;

  return (
    <div className="sec-card acn-kpi-metas">
      <div className="sec-hdr no-collapse">
        <span>Metas de Lead Time por Setor</span>
        <Botao pequeno onClick={ler}>Recalcular</Botao>
      </div>
      <div className="sec-body">
        <Faixa tom="info">
          As metas e as tolerâncias são fixas no sistema, as mesmas do Dashboard: não dá para mudá-las por esta tela (para mudar, é preciso pedir à TI). O realizado é a média das horas das OPs e das demandas já concluídas de cada setor.
        </Faixa>
        {motivo && (
          <Faixa tom="erro" acao={<Botao pequeno onClick={ler}>Tentar de novo</Botao>}>
            Não foi possível ler {motivo}. Os setores que dependem dessa leitura aparecem como "Não lido": isso não quer dizer que eles não tenham medições.
          </Faixa>
        )}
      </div>
      {!lido ? <div className="acn-empty">Carregando…</div> : (
        <div className="acn-rolagem">
          <table className="acn-tabela">
            <thead><tr>
              <th>Setor</th>
              <th>Indicador</th>
              <th className="acn-dir">Meta</th>
              <th className="acn-dir">Tolerância</th>
              <th className="acn-dir">Realizado</th>
              <th className="acn-dir">Qtd</th>
              <th>Status</th>
            </tr></thead>
            <tbody>
              {METRICAS.map(m => {
                const sem = naoLido(m.nome);
                const real = sem ? null : (medias[m.nome] ?? null);
                const cnt = sem ? 0 : (contagens[m.nome] ?? 0);
                const st = situacao(real, m.meta, m.tol);
                return (
                  <tr key={m.nome} className={st.critico ? 'acn-linha-alerta' : ''}>
                    <td className="acn-forte acn-nowrap">{m.nome}</td>
                    <td className="acn-fraco">{m.desc}</td>
                    <td className="acn-num acn-dir acn-nowrap">{h(m.meta)}</td>
                    <td className="acn-num acn-dir acn-nowrap">{h(m.tol)}</td>
                    <td className="acn-num acn-dir acn-nowrap acn-forte">{real != null ? h(real) : '—'}</td>
                    <td className="acn-num acn-dir acn-fraco">{cnt > 0 ? cnt.toLocaleString('pt-BR') : '—'}</td>
                    <td>{sem ? <Selo familia="neutro" title="A leitura falhou: não dá para dizer como o setor está">Não lido</Selo> : <Selo familia={st.familia}>{st.rotulo}</Selo>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
