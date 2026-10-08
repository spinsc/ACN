// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// CONTA DA COMISSÃO DOS TÉCNICOS — Produção, Serralheria e Adaptação (compartilhada)
//
// Antes morava dentro do RH › Comissões de Técnicos. Em 06/10/2026 o usuário apontou que Relatórios › Comissões gerava só a comissão
// dos VENDEDORES (a dos técnicos da produção aparecia zerada, porque a tela casava só o responsável comercial da OP). Para as duas telas
// mostrarem a MESMA conta, ela foi movida para cá sem mudar a lógica: o RH e o Relatório chamam esta função e desenham o resultado.
// Fonte única de crédito: responsaveis_producao (técnico/dupla/equipe apontados na OP/OS).
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { baseOplDe, lerDivisorPorBaseDeLote } from './OpLotes';
import { diaISO } from './Interface';

/**
 * Calcula a comissão de cada técnico no período [inicio, fim] (AAAA-MM-DD).
 * `modoFatura`: 'faturada' (NF emitida no período) ou 'a_faturar' (concluída na produção, NF ainda não emitida — valores estimados).
 * `filtroOrigem`: 'todos' ou 'adaptacao' (só OPs + OS de manutenção veicular).
 * `fechamento`: { mes, ano } para trazer também os fechamentos já aprovados daquele mês (só faz sentido em 'faturada').
 * Devolve { dados (um por técnico), grupos (OP/OS por técnico/dupla/equipe), semTecnico (OP/OS sem ninguém apontado), fechamentos }.
 */
export async function calcularComissaoTecnicos({ funcionarios, inicio, fim, modoFatura = 'faturada', filtroOrigem = 'todos', fechamento = null }: any) {
    // Faturada: comportamento de sempre (data_emissao_nf/data_faturamento
    // dentro do período). A Faturar: já concluído na produção dentro do
    // período, mas ainda sem NF emitida — dá visão do que vem pela frente.
    let opQuery = supabase.from('oples')
      .select('id,opl,cliente_nome,tecnico_producao_id,responsavel_producao,valor_total,valor_mao_de_obra,valor_mao_de_obra_serralheria,data_emissao_nf,data_conclusao_producao,modo_execucao,equipe_id,equipe_nome,tecnico_producao_2_id,tecnico_producao_2_nome,numero_nf,nfe,numero_nf_servico,data_entrega');
    // Antes havia aqui `.not('tecnico_producao_id','is',null)`: OP sem o técnico principal nem entrava na
    // conta. Desde 30/09/2026 a equipe pode ser apontada ou corrigida depois (EquipeDaOp.tsx), inclusive
    // numa OP que nunca teve técnico principal — e quem manda é a lista em `responsaveis_producao`, não
    // o campo da OP. Conferido no banco antes de tirar: nenhuma linha de equipe existia em OP sem técnico
    // principal, então o resultado de hoje não muda (fotografia da tela antes e depois: compara_rh.cjs).
    // Etapa 7.17 (01/10/2026): data_emissao_nf, data_conclusao_producao e data_conclusao_manutencao são DATA-E-HORA. "lte fim" com a data pura
    // (ex.: 2026-09-30) vira meia-noite UTC do dia 30 — o último dia inteiro ficava de fora — e "gte inicio" (dia 01) vira 21h do dia anterior em
    // Brasília — entravam 3 h do mês anterior. Conferido no banco real: em setembro a tela contava 1 NF emitida contra 3 de verdade; em julho,
    // 7 OPs "a faturar" contra 11. Agora o período é [dia inicial 00h, dia seguinte ao final 00h) em Brasília (sem horário de verão desde 2019).
    // data_faturamento (sac_ordens_servico) é só DATA: continua gte/lte com a data pura.
    const [yF, mF, dF] = fim.split('-').map(Number);
    const desde = `${inicio}T00:00:00-03:00`, ateAntes = `${diaISO(new Date(yF, mF - 1, dF + 1))}T00:00:00-03:00`;
    opQuery = modoFatura === 'faturada'
      ? opQuery.gte('data_emissao_nf', desde).lt('data_emissao_nf', ateAntes)
      : opQuery.gte('data_conclusao_producao', desde).lt('data_conclusao_producao', ateAntes).is('data_emissao_nf', null);

    let osQuery = supabase.from('sac_ordens_servico')
      .select('id,numero_os,cliente_nome,tecnico_producao_id,tecnico_responsavel,valor_total,valor_mao_de_obra,data_faturamento,data_conclusao_manutencao,modo_execucao,equipe_id,equipe_nome,tecnico_producao_2_id,tecnico_producao_2_nome,is_manutencao_veicular')
      .not('tecnico_producao_id','is',null);
    osQuery = modoFatura === 'faturada'
      ? osQuery.gte('data_faturamento', inicio).lte('data_faturamento', fim)
      : osQuery.gte('data_conclusao_manutencao', desde).lt('data_conclusao_manutencao', ateAntes).is('data_faturamento', null);

    const [opRes, osRes, fechRes] = await Promise.all([
      opQuery,
      osQuery,
      fechamento && modoFatura === 'faturada'
        ? supabase.from('rh_comissoes_fechamento').select('*').eq('mes', fechamento.mes).eq('ano', fechamento.ano)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const ops: any[] = opRes.data || [];
    // Origem "Adaptação": OPs (toda fabricação/transformação de veículo) +
    // só as OS de manutenção veicular — exclui SAC de equipamento/rádio avulso.
    const oss: any[] = (osRes.data || []).filter((os: any) => filtroOrigem === 'todos' || os.is_manutencao_veicular === true);
    const fechamentos: any[] = fechRes.data || [];

    // OP "mãe" com vários veículos (ex.: OPL A1419.2607/01..90, 90 carros): o valor lançado em cada veículo é o do LOTE inteiro, então divide
    // pelo nº de veículos antes de usar como base de comissão. Desde a Etapa 7.25 (01/10/2026) a regra mora em OpLotes.ts, que o relatório de
    // Comissão Comercial também usa (a conta é a mesma que estava aqui, sem mudança).
    const divisorPorBase = await lerDivisorPorBaseDeLote();

    // Mapa auxiliar id -> dados do item (OP ou OS), pra resolver cada linha de
    // responsaveis_producao de volta pro item de onde ela veio.
    const itemById: Record<string, any> = {};
    ops.forEach(op => {
      const divisor = divisorPorBase[baseOplDe(op.opl)] || 1;
      const unit = (v: any) => v != null ? Number(v) / divisor : v;
      itemById[op.id] = {
        tipo:'OP', id:op.id, numero:op.opl, cliente:op.cliente_nome,
        valor_total:unit(op.valor_total), valor_mao_de_obra:unit(op.valor_mao_de_obra),
        valor_mao_de_obra_serralheria:unit(op.valor_mao_de_obra_serralheria),
        qtdVeiculosLote: divisor > 1 ? divisor : undefined,
        data_faturamento: modoFatura === 'faturada' ? op.data_emissao_nf : op.data_conclusao_producao,
        nf: op.numero_nf || op.nfe, nf_servico: op.numero_nf_servico, data_conclusao: op.data_conclusao_producao, data_entrega: op.data_entrega,
        modo_execucao:op.modo_execucao, equipe_id:op.equipe_id, equipe_nome:op.equipe_nome,
        tecnico_producao_id:op.tecnico_producao_id, tecnico_producao_2_id:op.tecnico_producao_2_id, tecnico_producao_2_nome:op.tecnico_producao_2_nome,
      };
    });
    oss.forEach(os => { itemById[os.id] = {
      tipo:'OS', id:os.id, numero:os.numero_os, cliente:os.cliente_nome,
      valor_total:os.valor_total, valor_mao_de_obra:os.valor_mao_de_obra,
      data_faturamento: modoFatura === 'faturada' ? os.data_faturamento : os.data_conclusao_manutencao,
      data_conclusao: os.data_conclusao_manutencao,
      modo_execucao:os.modo_execucao, equipe_id:os.equipe_id, equipe_nome:os.equipe_nome,
      tecnico_producao_id:os.tecnico_producao_id, tecnico_producao_2_id:os.tecnico_producao_2_id, tecnico_producao_2_nome:os.tecnico_producao_2_nome,
    }; });

    // Fonte única de crédito: responsaveis_producao (semeada com o técnico
    // principal/dupla ao iniciar a OP/OS — ver ProducaoTab.tsx — e editável
    // livremente depois via "👥 Equipe"). Não usa mais oples.tecnico_producao_id
    // direto aqui, pra não contar o técnico principal duas vezes.
    const idsRelevantes = [...ops.map((o:any)=>o.id), ...oss.map((o:any)=>o.id)];
    const { data: respData, error: respErro } = idsRelevantes.length > 0
      // ordem fixa (30/09/2026): sem ela a ordem dos técnicos e das OPs na tela era a que o banco
      // devolvesse naquele momento, e mudava sozinha quando a consulta mudava
      ? await supabase.from('responsaveis_producao').select('*').in('referencia_id', idsRelevantes).order('criado_em').order('id')
      : { data: [] as any[] };
    // 08/10/2026 (PV 1325): a mesma linha (OP/OS + técnico + função) gravada duas vezes — a Produção semeava a lista ao iniciar e uma segunda gravação, 2 s depois,
    // repetia a semeadura — fazia o item do lote entrar 2x para o mesmo técnico e a comissão sair em dobro. Aqui a repetição conta uma vez só.
    const vistosResp = new Set<string>();
    const responsaveis: any[] = (respData || []).filter((r: any) => {
      const k = [r.referencia_id, r.tecnico_id, r.papel].join('|');
      if (vistosResp.has(k)) return false;
      vistosResp.add(k); return true;
    });

    const mapa: Record<string, any> = {};
    const addItem = (tecId: string, item: any) => {
      if (!mapa[tecId]) {
        const func = funcionarios.find((f:any) => f.id === tecId);
        mapa[tecId] = {
          tecnicoId: tecId,
          tecnicoNome: func?.nome || '—',
          func,
          incideEm: func?.incide_em || 'Faturamento',
          percentual: func?.percentual_comissao || 0,
          ops: [], oss: [], totalBase: 0, totalComissao: 0, totalComissaoApoio: 0,
        };
      }
      if (item.tipo === 'OP') mapa[tecId].ops.push(item);
      else mapa[tecId].oss.push(item);
    };

    responsaveis.forEach((r:any) => {
      const item = itemById[r.referencia_id];
      if (!item || !r.tecnico_id) return;
      addItem(r.tecnico_id, { ...item, papel: r.papel });
    });

    // Recalcular totais com incideEm correto. Responsáveis usam a fórmula normal
    // (base * percentual configurado do técnico); apoios sempre 0,1% fixo de
    // valor_mao_de_obra, independente do incide_em/percentual configurado.
    Object.values(mapa).forEach((tec: any) => {
      const allItems = [...tec.ops, ...tec.oss];
      const getBase = (i: any) => {
        // Quem trabalhou na serralheria (30/09/2026, regra do usuário): comissão em cima da mão de obra de
        // SERRALHERIA da OP, qualquer que seja o "incide em" do cadastro — o que vale é em que lista da
        // OP a pessoa foi apontada. Usa o percentual dela, como o responsável.
        if (i.papel === 'serralheria') return Number(i.valor_mao_de_obra_serralheria || 0);
        if (i.papel === 'apoio') return Number(i.valor_mao_de_obra || 0);
        if (tec.incideEm === 'Mão de Obra') return Number(i.valor_mao_de_obra || 0);
        if (tec.incideEm === 'Serralheria') return Number(i.valor_mao_de_obra_serralheria || 0);
        return Number(i.valor_total || 0);
      };
      allItems.forEach((i: any) => { i.base = getBase(i); });
      const responsavelItems = allItems.filter((i:any) => i.papel !== 'apoio');
      const apoioItems       = allItems.filter((i:any) => i.papel === 'apoio');
      tec.totalBase = responsavelItems.reduce((s: number, i: any) => s + i.base, 0);
      tec.totalComissaoApoio = apoioItems.reduce((s: number, i: any) => s + i.base * 0.001, 0);
      tec.totalComissao = (tec.totalBase * (tec.percentual / 100)) + tec.totalComissaoApoio;
    });

    // ── Pipeline agrupado por Técnico individual / Dupla / Equipe ──────────
    // Usa o mesmo item.base/comissão já calculado acima (por técnico), só
    // reagrupa pela "chave de execução" do item (modo_execucao do
    // OP/OS) em vez de por técnico isolado — uma dupla/equipe vira 1 grupo
    // com a soma dos dois, sem contar o mesmo OP/OS duas vezes na contagem.
    const chaveGrupo = (item: any) => {
      if (item.modo_execucao === 'equipe' && item.equipe_id) {
        return { chave: `equipe:${item.equipe_id}`, label: item.equipe_nome || '—', tipo: 'equipe' as const };
      }
      if (item.modo_execucao === 'dupla' && item.tecnico_producao_2_id) {
        const nome1 = mapa[item.tecnico_producao_id]?.tecnicoNome || '—';
        const nome2 = item.tecnico_producao_2_nome || '—';
        const chave = ['dupla', item.tecnico_producao_id, item.tecnico_producao_2_id].sort().join(':');
        return { chave, label: `${nome1} + ${nome2}`, tipo: 'dupla' as const };
      }
      if (item.tecnico_producao_id) {
        return { chave: `individual:${item.tecnico_producao_id}`, label: mapa[item.tecnico_producao_id]?.tecnicoNome || '—', tipo: 'individual' as const };
      }
      return null;
    };

    const mapaGrupos: Record<string, any> = {};
    Object.values(mapa).forEach((tec: any) => {
      [...tec.ops, ...tec.oss].forEach((item: any) => {
        if (item.papel === 'apoio' || item.papel === 'serralheria') return; // apoio e serralheria não definem o grupo, só são contabilizados dentro dele
        const g = chaveGrupo(item);
        if (!g) return;
        if (!mapaGrupos[g.chave]) {
          mapaGrupos[g.chave] = { chave: g.chave, label: g.label, tipo: g.tipo, itensVistos: new Set<string>(), qtdComApoio: 0, qtdSemApoio: 0, totalComissao: 0 };
        }
        const grupo = mapaGrupos[g.chave];
        if (grupo.itensVistos.has(item.id)) { grupo.totalComissao += item.base * tec.percentual / 100; return; } // 2º membro da dupla/equipe no mesmo item — só soma a comissão dele
        grupo.itensVistos.add(item.id);
        grupo.totalComissao += item.base * tec.percentual / 100;
      });
    });
    // Marca com/sem apoio (feito num 2º passo, olhando responsaveis_producao
    // diretamente por item, já que "apoio" não passa pela chaveGrupo acima).
    const apoiosPorItem: Record<string, boolean> = {};
    responsaveis.forEach((r: any) => { if (r.papel === 'apoio') apoiosPorItem[r.referencia_id] = true; });
    Object.values(mapaGrupos).forEach((grupo: any) => {
      grupo.itensVistos.forEach((itemId: string) => {
        if (apoiosPorItem[itemId]) grupo.qtdComApoio++; else grupo.qtdSemApoio++;
      });
      grupo.qtdTotal = grupo.itensVistos.size;
    });
    // Soma a comissão dos apoios de cada item no total do grupo dono do item
    Object.values(mapa).forEach((tec: any) => {
      [...tec.ops, ...tec.oss].filter((i: any) => i.papel === 'apoio').forEach((item: any) => {
        const grupoDono = Object.values(mapaGrupos).find((gr: any) => gr.itensVistos.has(item.id));
        if (grupoDono) grupoDono.totalComissao += item.base * 0.001;
      });
      // quem trabalhou na serralheria entra no total do grupo da OP com o percentual próprio
      [...tec.ops, ...tec.oss].filter((i: any) => i.papel === 'serralheria').forEach((item: any) => {
        const grupoDono = Object.values(mapaGrupos).find((gr: any) => gr.itensVistos.has(item.id));
        if (grupoDono) grupoDono.totalComissao += item.base * tec.percentual / 100;
      });
    });

    // OP/OS do período que nenhum técnico foi apontado: não geram comissão de produção e, antes, não apareciam em lugar nenhum
    const cobertos = new Set<string>();
    Object.values(mapa).forEach((tec: any) => [...tec.ops, ...tec.oss].forEach((i: any) => cobertos.add(i.id)));
    const semTecnico: any[] = (Object.values(itemById).filter((i: any) => !cobertos.has(i.id))
      .sort((a: any, b: any) => String(a.tipo).localeCompare(String(b.tipo)) || String(a.numero).localeCompare(String(b.numero), 'pt-BR', { numeric: true })));
    const dados: any[] = Object.values(mapa);
    // Empate em nº de OP/OS: desempata pelo nome (30/09/2026). Antes a ordem dos cartões empatados era a
    // ordem em que o banco devolvia as linhas da equipe — que muda sozinha quando a consulta muda — e
    // dois cartões com a mesma contagem trocavam de lugar entre uma abertura e outra.
    const grupos: any[] = (Object.values(mapaGrupos).sort((a: any, b: any) =>
      b.qtdTotal - a.qtdTotal || String(a.label).localeCompare(String(b.label), 'pt-BR')));

    // 06/10/2026: o erro do banco vai junto — o Relatório de Comissões avisa em vez de mostrar uma tela vazia (mesma regra da Etapa 7.19). O RH ignora, como antes.
    const erro = opRes.error?.message || osRes.error?.message || respErro?.message || null;
    return { dados, grupos, semTecnico, fechamentos, erro };
}

/** Os dois textos que o documento (PDF) imprime sobre o que foi calculado — iguais no RH e no Relatório. */
export function rotuloComissaoTecnicos({ modoFatura, filtroOrigem }: any) {
  return {
    situacao: modoFatura === 'faturada' ? 'OPs/OSs com NF emitida no período (faturadas)' : 'OPs/OSs concluídas na produção no período, NF ainda não emitida (valores estimados)',
    origem: filtroOrigem === 'adaptacao' ? 'só Adaptação — OPs (transformação veicular) + OS de manutenção veicular' : 'todas as origens (OPs e OS)',
  };
}

/**
 * Percentual de comissão de um VENDEDOR numa OP, conforme o tipo de negócio (Revenda, Venda, Pós-vendas) do card do CRM a que a OP está ligada.
 * Pedido do usuário em 08/10/2026: o vendedor pode ter percentuais diferentes por tipo de venda (RH › Funcionários › percentuais_por_tipo). O tipo que não estiver preenchido
 * — ou a OP sem card/sem tipo — usa o percentual geral (percentual_comissao), como sempre. `porTipo` diz se foi o percentual do tipo que valeu (para marcar no documento).
 */
export function percentualDoVendedor(func: any, tipoNegocio: any): { pct: number; porTipo: boolean; tipo: string | null } {
  const por = (func && typeof func.percentuais_por_tipo === 'object' && func.percentuais_por_tipo) || {};
  const v = tipoNegocio ? por[tipoNegocio] : undefined;
  if (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) return { pct: Number(v), porTipo: true, tipo: tipoNegocio };
  return { pct: Number(func?.percentual_comissao) || 0, porTipo: false, tipo: tipoNegocio || null };
}

/** Texto curto da regra do vendedor: "2% sobre Faturamento · Venda 3% · Revenda 1,5%". */
export function regraDoVendedor(func: any): string {
  const f = (v: any) => String(Number(v) || 0).replace('.', ',') + '%';
  const por = (func && typeof func.percentuais_por_tipo === 'object' && func.percentuais_por_tipo) || {};
  const extras = Object.entries(por).filter(([, v]) => v !== '' && v != null && Number.isFinite(Number(v))).map(([k, v]) => `${k} ${f(v)}`);
  return `${f(func?.percentual_comissao)} sobre ${func?.incide_em || 'Faturamento'}${extras.length ? ' · ' + extras.join(' · ') : ''}`;
}
