// ─────────────────────────────────────────────────────────────────────────────
// Painel "Lixeira (24h)" do Admin — restaurar registros que foram deletados nas últimas 24 horas (12e87, 26/11/2026). Saiu do AdminTab.tsx já no padrão do design system (`Botao`,
// `Faixa`, `Selo`, `Tag`, `Chips`, a tabela do guia, `confirmar` e `mostrarAviso`, sem `style` solto).
//
// Achados da 7.x que esta versão corrige (a regra é a mesma: lista os registros não restaurados e deletados há menos de 24 horas; restaurar devolve a cópia à tabela de origem):
//  • leitura recusada virava "Lixeira vazia — nenhum registro deletado nas últimas 24h": o Admin achava que não havia o que restaurar. Agora faixa vermelha com "Tentar de novo";
//  • a restauração era um "upsert": se o registro já existisse (alguém o restaurou antes, ou o recriou e mexeu nele), a cópia velha SOBRESCREVIA o que estava lá, sem aviso. Agora é um
//    insert: se já existe, a restauração é recusada e a tela diz isso (suposição a confirmar);
//  • depois de restaurar, a marca "restaurado" na lixeira não era conferida: se não gravasse, o registro voltava mas a cópia continuava na lista, pronta para ser restaurada (e
//    sobrescrever) de novo. Agora a tela diz que o registro voltou e que a cópia não foi marcada. O mesmo para "Remover" (o banco responde "ok, 0 linhas" a uma gravação negada);
//  • o erro vinha num alert() do navegador, em inglês técnico: agora aviso vermelho em português; clique duplo em Restaurar fazia duas restaurações (uma pergunta atrás da outra);
//  • restaurar o último registro de uma tabela filtrada deixava o filtro preso numa tabela que esvaziou ("Lixeira vazia" com outros registros esperando e sem como saber);
//  • o texto dizia que, passadas as 24 horas, os registros "são removidos automaticamente", mas não existe rotina que apague (a lixeira tinha 331 cópias, a mais antiga de julho): depois de 24
//    horas o registro só deixa de aparecer aqui; a cópia continua guardada no banco. O texto agora diz isso;
//  • a lista pega no máximo 300 registros e não avisava; duas leituras seguidas podiam terminar na ordem errada; antes da primeira leitura a tela dizia "Lixeira vazia".
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { explicarErroDoBanco } from './ErroDoBanco';
import { intervaloVisivel } from './IntervaloVisivel';
import { confirmar, mostrarAviso } from './Feedback';
import { Botao, Chips, Faixa, Selo, Tag } from './Interface';

const HORAS = 24;
const LIMITE = 300;

const LABEL_TABELA = {
  oples: 'OPs', sac_ordens_servico: 'SAC — OS', demandas_setoriais: 'Demandas Setoriais',
  demandas_avulsas: 'Demandas Avulsas', logistica_manifestos: 'Logística In/Out',
  rh_autorizacoes: 'Autorizações RH', logs_movimentacao_opl: 'Logs de OP',
  cq_auditorias: 'Auditorias CQ',
  // CRM / Licitações
  licitacoes: 'Licitações',
  crm_oportunidades: 'CRM — Oportunidades', crm_historico: 'CRM — Histórico',
  crm_vendas: 'CRM — Vendas', crm_contatos: 'CRM — Contatos',
  crm_interacoes: 'CRM — Interações',
  crm_anexos: 'CRM — Anexos',
  // Legado (compatibilidade)
  crm_clientes: 'CRM — Clientes (legado)', crm_historico_contatos: 'CRM — Histórico (legado)',
  clientes: 'Cadastro Clientes',
};
const rotuloDaTabela = (t: string) => LABEL_TABELA[t] || t;

const fmtDtH = (d: any) => d
  ? new Date(d).toLocaleDateString('pt-BR') + ' ' + new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  : '—';

// quanto falta para o registro sair desta tela: { texto, expirado, menosDeUmaHora }
const tempoRestante = (deletadoEm: any, agora: number) => {
  const diff = new Date(deletadoEm).getTime() + HORAS * 3600 * 1000 - agora;
  if (diff <= 0) return { texto: 'Expirado', expirado: true, menosDeUmaHora: false };
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return { texto: `${h}h ${m}m`, expirado: false, menosDeUmaHora: h === 0 };
};

const resumoDoRegistro = (item: any) => {
  const d = item.dados || {};
  switch (item.tabela) {
    case 'oples': return `OP ${d.opl || '?'} — ${d.cliente_nome || '?'} — ${d.status_geral || '?'}`;
    case 'sac_ordens_servico': return `OS ${d.numero_os || '?'} — ${d.cliente_nome || '?'} — ${d.status || '?'}`;
    case 'demandas_setoriais': return `[${d.setor_destino || '?'}] ${(d.descricao || '').substring(0, 60)}`;
    case 'demandas_avulsas': return `${(d.titulo || '?').substring(0, 60)} — ${d.status || '?'}`;
    case 'logistica_manifestos': return `${d.tipo || '?'} — ${(d.descricao || d.transportadora || '').substring(0, 60)}`;
    case 'rh_autorizacoes': return `[${d.tipo || '?'}] ${d.data || '?'} — ${d.motivo || '?'}`.substring(0, 80);
    case 'licitacoes': return `[${d.status || '?'}] ${d.numero || '?'} — ${d.nome_projeto || '?'} — ${d.orgao || '?'}`;
    case 'crm_oportunidades': return `[${d.funil === 'licitacao' ? 'Licitação' : 'Venda'}] ${d.titulo || '?'} — ${d.orgao || '?'} — R$ ${d.valor_estimado ? Number(d.valor_estimado).toLocaleString('pt-BR') : '—'}`;
    case 'crm_historico': return `${d.tipo || '?'}: ${(d.conteudo || '').substring(0, 60)} — por ${d.usuario_nome || '?'}`;
    case 'crm_vendas': return `${d.tipo || '?'} — ${d.numero || '?'} — ${d.cliente_nome || '?'}`;
    case 'crm_contatos': return `${d.nome || '?'} — ${d.empresa || '?'} — ${d.whatsapp || d.email || '?'}`;
    case 'crm_interacoes': return `[${d.tipo || '?'}] ${(d.descricao || '').substring(0, 60)} — ${d.operador_nome || '?'}`;
    case 'crm_anexos': return `${d.tipo || '?'} — ${d.nome || '?'}`;
    case 'clientes': return `[${d.tipo || '?'}] ${d.nome || '?'} — ${d.documento || '?'}`;
    // legado
    case 'crm_clientes': return `${d.nome_empresa || d.nome || '?'} — ${d.contato_nome || '?'}`;
    case 'crm_historico_contatos': return `${d.nome_empresa || '?'} — ${d.tipo_contato || '?'}: ${(d.descricao || '').substring(0, 50)}`;
    case 'logs_movimentacao_opl': return `OP ${d.numero_opl || '?'} → ${d.setor || '?'}: ${(d.evento || '').substring(0, 50)}`;
    case 'cq_auditorias': return `OP ${d.numero_opl || '?'} — ${d.resultado || '?'} — ${d.auditor_nome || '?'}`;
    default: return item.registro_id;
  }
};

export function PainelLixeira() {
  const [itens, setItens] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [ocupado, setOcupado] = useState<string | null>(null);   // o registro que está sendo restaurado ou removido
  const [agora, setAgora] = useState(() => Date.now());
  const trava = useRef(false);   // vale desde o primeiro clique (o estado só chega no desenho seguinte)
  const pedido = useRef(0);

  const ler = useCallback(async () => {
    const meu = ++pedido.current;
    setCarregando(true);
    const limite = new Date(Date.now() - HORAS * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from('lixeira').select('*')
      .eq('restaurado', false)
      .gte('deletado_em', limite)
      .order('deletado_em', { ascending: false }).limit(LIMITE);
    if (meu !== pedido.current) return;   // chegou depois de uma leitura mais nova: não vale
    if (error) { setErro(explicarErroDoBanco(error)); setItens([]); }
    else { setErro(''); setItens(data || []); }
    setAgora(Date.now());
    setCarregando(false);
  }, []);
  useEffect(() => { ler(); }, [ler]);
  // o "expira em" é conta de relógio: a cada minuto, sem ir ao banco
  useEffect(() => { const t = intervaloVisivel(() => setAgora(Date.now()), 60000); return () => clearInterval(t); }, []);

  const restaurar = async (item: any) => {
    if (trava.current) return;
    trava.current = true;
    try {
      const nome = rotuloDaTabela(item.tabela);
      if (!await confirmar(`Restaurar este registro para "${nome}"?`)) return;
      setOcupado(item.id);
      // insert, e não upsert: se o registro já existe, a cópia velha não pode sobrescrever o que está lá
      const ins = await supabase.from(item.tabela).insert([{ ...item.dados }]);
      if (ins.error) {
        mostrarAviso(ins.error.code === '23505' || /duplicate key/i.test(ins.error.message || '')
          ? `Não foi possível restaurar: esse registro já existe de novo em "${nome}" (talvez já tenha sido restaurado ou recriado). Nada foi sobrescrito.`
          : `Não foi possível restaurar: ${explicarErroDoBanco(ins.error)}`, 'erro');
        return;
      }
      const marca = await supabase.from('lixeira').update({ restaurado: true, restaurado_em: new Date().toISOString() }).eq('id', item.id).select('id');
      if (marca.error || (marca.data || []).length === 0) {
        mostrarAviso(`O registro foi restaurado em "${nome}", mas não deu para marcar a cópia da lixeira como restaurada (${marca.error ? explicarErroDoBanco(marca.error) : 'o banco não aplicou a mudança'}). Ela continua na lista: não restaure de novo.`, 'erro');
        return;
      }
      mostrarAviso(`Registro restaurado em "${nome}".`, 'ok');
    } catch (e: any) {
      mostrarAviso('Não foi possível concluir: ' + explicarErroDoBanco(e), 'erro');
    } finally {
      await ler();
      setOcupado(null); trava.current = false;
    }
  };

  const removerDaLixeira = async (item: any) => {
    if (trava.current) return;
    trava.current = true;
    try {
      if (!await confirmar('Remover permanentemente da lixeira? Esta ação não pode ser desfeita.')) return;
      setOcupado(item.id);
      const r = await supabase.from('lixeira').update({ restaurado: true }).eq('id', item.id).select('id');
      if (r.error || (r.data || []).length === 0) mostrarAviso(`Não foi possível remover da lixeira: ${r.error ? explicarErroDoBanco(r.error) : 'o banco não aplicou a mudança'}.`, 'erro');
    } catch (e: any) {
      mostrarAviso('Não foi possível concluir: ' + explicarErroDoBanco(e), 'erro');
    } finally {
      await ler();
      setOcupado(null); trava.current = false;
    }
  };

  const tabelas = [...new Set(itens.map(i => i.tabela))].sort();
  const filtroValido = tabelas.includes(filtro) ? filtro : 'todos';   // o filtro não fica preso numa tabela que esvaziou
  const visiveis = filtroValido === 'todos' ? itens : itens.filter(i => i.tabela === filtroValido);

  return (
    <div className="sec-card acn-lix">
      <div className="sec-hdr no-collapse">
        <span>Lixeira — registros deletados nas últimas {HORAS} horas {erro ? '(não lida)' : `(${itens.length})`}{!erro && itens.length >= LIMITE && <span className="acn-fraco"> · {LIMITE} mais recentes</span>}</span>
        <Botao pequeno onClick={ler}>Atualizar</Botao>
      </div>
      <div className="sec-body">
        <Faixa tom="info">
          Os registros deletados ficam disponíveis para restauração por <strong>{HORAS} horas</strong>. Depois disso deixam de aparecer aqui e não podem mais ser restaurados por esta tela (a cópia continua guardada no banco). Restaurar nunca sobrescreve: se o registro já existir de novo, a restauração é recusada.
        </Faixa>
        {erro && (
          <Faixa tom="erro" acao={<Botao pequeno onClick={ler}>Tentar de novo</Botao>}>
            Não foi possível ler a lixeira ({erro}). Isso não quer dizer que ela esteja vazia.
          </Faixa>
        )}
        {!erro && tabelas.length > 1 && (
          <Chips rotulo="Filtrar por tabela" className="acn-lix-filtro" ativo={filtroValido} onChange={setFiltro}
            itens={[{ id: 'todos', rotulo: 'Todos', contagem: itens.length }, ...tabelas.map(t => ({ id: t, rotulo: rotuloDaTabela(t), contagem: itens.filter(i => i.tabela === t).length }))]} />
        )}
      </div>
      {carregando && itens.length === 0 ? <div className="acn-empty">Carregando a lixeira…</div> : erro ? null : visiveis.length === 0 ? (
        <div className="acn-empty">Lixeira vazia — nenhum registro deletado nas últimas {HORAS} horas.</div>
      ) : (
        <div className="acn-rolagem">
          <table className="acn-tabela">
            <thead><tr>
              <th>Tabela</th><th>Deletado em</th><th>Expira em</th><th>Registro</th><th>Ações</th>
            </tr></thead>
            <tbody>
              {visiveis.map(item => {
                const tempo = tempoRestante(item.deletado_em, agora);
                const resumo = resumoDoRegistro(item);
                return (
                  <tr key={item.id} className={tempo.expirado ? 'acn-lix-expirado' : ''}>
                    <td><Tag>{rotuloDaTabela(item.tabela)}</Tag></td>
                    <td className="acn-nowrap acn-fraco">{fmtDtH(item.deletado_em)}</td>
                    <td className="acn-nowrap"><Selo familia={tempo.expirado ? 'neutro' : tempo.menosDeUmaHora ? 'erro' : 'neutro'} title={tempo.menosDeUmaHora ? 'Falta menos de 1 hora para sair da lixeira' : undefined}>{tempo.texto}</Selo></td>
                    <td className="acn-texto-longo" title={resumo}>{resumo}</td>
                    <td>
                      <div className="acn-lix-acoes">
                        {!tempo.expirado && <Botao pequeno disabled={ocupado != null} onClick={() => restaurar(item)}>{ocupado === item.id ? 'Aguarde…' : 'Restaurar'}</Botao>}
                        <Botao pequeno variante="perigo-sec" disabled={ocupado != null} onClick={() => removerDaLixeira(item)}>Remover</Botao>
                      </div>
                    </td>
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
