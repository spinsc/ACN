// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// DesenvolvimentoPecasTab — sub-aba "Desenvolvimento" da Engenharia
// Controle de peças em desenvolvimento por etapas (Concepção → Entrega).
// Demandas podem ser lançadas automaticamente (ao iniciar uma tarefa de
// Engenharia marcando "Precisa de Desenvolvimento") ou manualmente aqui.
//
// D0 (19/10/2026, PLANO_DESENVOLVIMENTO_ENGENHARIA.md): a aba passou para o guia visual (Interface.tsx, Feedback.tsx, classes
// .acn-dev-*, sem `style` solto) e ganhou a etapa 7.x de achados — o comportamento das 8 etapas é o mesmo de antes; o que mudou é que
// nada falha em silêncio: toda gravação confere a resposta do banco, leitura recusada não parece "lista vazia" e duas pessoas na
// mesma demanda não passam mais uma por cima da outra (cada gravação relê a demanda antes de mexer).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { explicarErroDeEnvio } from './ErroDeArquivo';
import { nomeSeguroDeArquivo, contentTypeUpload } from './FormatosArquivo';
import { lerPaginado } from './LerPaginado';
import { combinaBusca } from './SearchUtils';
import { ColaboradorSelect } from './ColaboradorSelect';
import { DEPTOS } from './RhDepartamentos';
import Linkify from './Linkify';
import Icone from './Icone';
import { confirmar } from './Feedback';
import { Botao, Chips, Faixa, Selo, Tag } from './Interface';
import PedidoDoPcp from './PedidoDesenvolvimentoPcp';
import { modeloGuiado, TIPOS_DEV, rotuloDoTipoDev, mesmoNome, ehGerenteDev } from './DesenvolvimentoModelo';
import { ResumoDoProjeto } from './DesenvolvimentoFormularios';
import { PainelDeMudancas } from './DesenvolvimentoMudancas';
import { PainelDaEngenharia, SelosDeAlerta, TabelaDeCustos, passaNoAlerta } from './DesenvolvimentoPainel';
import { alertasDaDemanda } from './DesenvolvimentoModelo';
import { hojeISO } from './Interface';
import { PainelGuiado, FaixaDeTipo, RessalvasAbertas, HistoricoDaDemanda, MenuDaDemanda } from './DesenvolvimentoPorta';
import { mdiCogOutline, mdiPlus, mdiPaperclip, mdiContentSaveOutline, mdiPlay, mdiCheck, mdiNoteEditOutline, mdiMagnify, mdiRefresh } from '@mdi/js';

export const ETAPAS_DEV = [
  'Concepção', 'Criação', 'Desenvolvimento', 'Prototipagem',
  'Validação', 'Produção', 'Acabamento', 'Entrega',
];

export function etapasIniciais() {
  return ETAPAS_DEV.map(nome => ({
    nome, status: 'pendente', // pendente | em_andamento | concluida
    responsavel: '', data_prevista: '',
    data_inicio: null, data_conclusao: null,
    observacoes: [] as { texto: string; usuario: string; hora: string }[],
  }));
}

// Chamado pelo EngenhariaTab quando "Precisa de Desenvolvimento" é marcado
// ao iniciar a análise de uma OP/OS. Devolve { error } do banco: quem chama precisa avisar se a demanda não nasceu.
export async function criarDemandaDesenvolvimento({ opl, descricao, currentUser }: any) {
  return supabase.from('engenharia_desenvolvimento').insert([{
    opl_id: opl?.id || null,
    numero_opl: opl?.opl || null,
    cliente_nome: opl?.cliente_nome || null,
    titulo: opl ? `Desenvolvimento — ${opl.opl}` : 'Nova demanda de desenvolvimento',
    descricao: descricao || null,
    etapas: etapasIniciais(),
    origem: 'automatico',
    criado_por: currentUser?.email,
    criado_por_nome: currentUser?.nome,
    // D1 (19/10/2026): a análise não sabe o tipo; a demanda nasce "a definir" e a Engenharia escolhe o tipo antes de iniciar a Concepção. Solicitante = quem iniciou a análise.
    tipo_desenvolvimento: 'a_definir',
    solicitante_nome: currentUser?.nome || null,
    solicitante_email: currentUser?.email || null,
    historico: [{ em: new Date().toISOString(), por: currentUser?.nome || '', tipo: 'criada', etapa: null, texto: 'Criada ao iniciar a análise da OP' }],
  }]);
}

function fmtDt(d: string) { return d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'; }
function fmtDtHr(d: string) { return d ? new Date(d).toLocaleString('pt-BR') : '—'; }

const STATUS_ETAPA: Record<string, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída' };
const classeEtapa = (status: string) => status === 'concluida' ? 'ok' : status === 'em_andamento' ? 'andamento' : 'pendente';

// o pedido do PCP fecha pelos itens (campo `concluida`), não pelas 8 etapas
const estaFinalizada = (d: any) => {
  const etapas = d.etapas || [];
  return d.origem === 'pcp' ? !!d.concluida : etapas.length > 0 && etapas.every((e: any) => e.status === 'concluida');
};
// D1: a demanda cancelada sai de "Em andamento" e de "Concluídas" e ganha o próprio filtro; a pausada continua em andamento (com o selo)
const estaCancelada = (d: any) => d.situacao === 'cancelada';

// Relê UMA coluna da demanda logo antes de gravar. As etapas e os anexos moram dentro do registro; gravar a partir da cópia que está na tela
// apagaria o que outra pessoa acabou de lançar na mesma demanda.
async function lerColunaFresca(id: string, coluna: string) {
  const { data, error } = await supabase.from('engenharia_desenvolvimento').select(coluna).eq('id', id).maybeSingle();
  if (error) return { erro: error.message };
  if (!data) return { erro: 'a demanda não existe mais' };
  return { valor: data[coluna] };
}

// ─── Anexos inline (armazenados no próprio registro, coluna `anexos`) ────────
function AnexosDev({ demanda, onAtualizado }: any) {
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const trava = useRef(false);
  const anexos = demanda.anexos || [];

  const upload = async (files: FileList) => {
    if (trava.current) return;
    trava.current = true;
    setUploading(true);
    try {
      const enviados: any[] = [];
      const falhas: string[] = [];   // 16/10/2026: o envio que falhava era ignorado, o arquivo só não aparecia na lista
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        // 19/10/2026: nome seguro do armazenamento (acento e símbolo derrubavam o envio); o nome original vai à parte, para a lista
        const path = `desenvolvimento/${demanda.id}/${Date.now()}_${i}_${nomeSeguroDeArquivo(f.name)}`;
        const { error } = await supabase.storage.from('acn-media').upload(path, f, { upsert: true, contentType: contentTypeUpload(f) });
        if (error) { falhas.push(`${f.name}: ${explicarErroDeEnvio(error, f)}`); continue; }
        const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
        enviados.push({ nome: f.name, url: pub?.publicUrl || '' });
      }
      if (enviados.length) {
        const fresco = await lerColunaFresca(demanda.id, 'anexos');
        if (fresco.erro) {
          falhas.push(`os arquivos subiram, mas não foi possível gravar na demanda (${fresco.erro})`);
        } else {
          const { error: erroGrava } = await supabase.from('engenharia_desenvolvimento')
            .update({ anexos: [...(fresco.valor || []), ...enviados], atualizado_em: new Date().toISOString() }).eq('id', demanda.id);
          if (erroGrava) falhas.push(`os arquivos subiram, mas não foi possível gravar na demanda (${erroGrava.message})`);
        }
      }
      if (ref.current) ref.current.value = '';
      if (falhas.length) alert('Não foi possível anexar estes arquivos:\n\n' + falhas.join('\n'));
      onAtualizado();
    } finally {
      trava.current = false;
      setUploading(false);
    }
  };

  return (
    <div className="acn-dev-anexos">
      {anexos.length === 0 && <span className="acn-ajuda">Nenhum anexo ainda.</span>}
      {anexos.length > 0 && (
        <div className="acn-dev-anexos-lista">
          {anexos.map((a: any, i: number) => (
            a.url
              ? <a key={i} href={a.url} target="_blank" rel="noreferrer" className="acn-dev-anexo"><Icone path={mdiPaperclip} size={13} /> {a.nome}</a>
              : <span key={i} className="acn-dev-anexo sem-link"><Icone path={mdiPaperclip} size={13} /> {a.nome}</span>
          ))}
        </div>
      )}
      <input ref={ref} type="file" multiple hidden
        onChange={e => { if (e.target.files?.length) upload(e.target.files); }} />
      <div>
        <Botao pequeno icone={mdiPaperclip} disabled={uploading} onClick={() => ref.current?.click()}>
          {uploading ? 'Enviando…' : 'Anexar arquivo'}
        </Botao>
      </div>
    </div>
  );
}

// ─── Área livre (texto/links/anotações, com botão salvar) ────────────────────
function AreaLivreDev({ demanda, onAtualizado }: any) {
  const [texto, setTexto] = useState(demanda.area_livre || '');
  const [salvando, setSalvando] = useState(false);
  const alterado = texto !== (demanda.area_livre || '');

  const salvar = async () => {
    if (salvando) return;
    setSalvando(true);
    const { error } = await supabase.from('engenharia_desenvolvimento').update({ area_livre: texto, atualizado_em: new Date().toISOString() }).eq('id', demanda.id);
    setSalvando(false);
    // o texto continua na caixa quando a gravação falha: não pode parecer que salvou
    if (error) { alert(`Não foi possível salvar a área livre: ${error.message}`); return; }
    onAtualizado();
  };

  return (
    <div className="acn-dev-livre">
      <textarea className="acn-input" rows={3} aria-label="Área livre"
        placeholder="Área livre — anotações, links, referências..."
        value={texto} onChange={e => setTexto(e.target.value)} />
      {alterado && (
        <div>
          <Botao variante="primario" pequeno icone={mdiContentSaveOutline} disabled={salvando} onClick={salvar}>
            {salvando ? 'Salvando…' : 'Salvar área livre'}
          </Botao>
        </div>
      )}
    </div>
  );
}

// ─── Painel de uma etapa (expandido quando é a etapa ativa) ──────────────────
function PainelEtapa({ demanda, etapa, idx, onAtualizado, currentUser }: any) {
  const [responsavel, setResponsavel] = useState(etapa.responsavel || currentUser?.nome || '');
  const [dataPrevista, setDataPrevista] = useState(etapa.data_prevista || '');
  const [obsTexto, setObsTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const trava = useRef(false);   // clique duplo em "Iniciar"/"Concluir" gravava duas vezes

  // `mutar` recebe a etapa como está AGORA no banco; se devolver um texto, não há o que gravar (outra pessoa já fez) e o texto vai ao usuário.
  // Devolve true quando gravou.
  const atualizarEtapas = async (mutar: (e: any) => string | void) => {
    if (trava.current) return false;
    trava.current = true;
    setSalvando(true);
    try {
      const fresco = await lerColunaFresca(demanda.id, 'etapas');
      if (fresco.erro) { alert(`Não foi possível ler a demanda antes de gravar (${fresco.erro}). Nada foi alterado.`); return false; }
      const lista = fresco.valor || [];
      if (!lista[idx] || lista[idx].nome !== etapa.nome) {
        alert('Não foi possível gravar: as etapas desta demanda mudaram. A tela foi atualizada.');
        onAtualizado();
        return false;
      }
      const copia = { ...lista[idx] };
      const motivo = mutar(copia);
      if (motivo) { alert(motivo); onAtualizado(); return false; }
      const etapas = lista.map((e: any, i: number) => (i === idx ? copia : e));
      const { error } = await supabase.from('engenharia_desenvolvimento').update({ etapas, atualizado_em: new Date().toISOString() }).eq('id', demanda.id);
      if (error) { alert(`Não foi possível gravar a etapa: ${error.message}`); return false; }
      onAtualizado();
      return true;
    } finally {
      trava.current = false;
      setSalvando(false);
    }
  };

  const iniciar = () => {
    if (!responsavel.trim()) { alert('Informe o responsável.'); return; }
    atualizarEtapas(e => {
      if (e.status !== 'pendente') return 'Esta etapa já foi iniciada por outra pessoa. A tela foi atualizada.';
      e.status = 'em_andamento';
      e.responsavel = responsavel.trim();
      e.data_prevista = dataPrevista || null;
      e.data_inicio = new Date().toISOString();
    });
  };

  const addObs = async () => {
    if (!obsTexto.trim()) return;
    const texto = obsTexto.trim();
    const gravou = await atualizarEtapas(e => {
      e.observacoes = [...(e.observacoes || []), { texto, usuario: currentUser?.nome || '', hora: new Date().toISOString() }];
    });
    if (gravou) setObsTexto('');   // a observação digitada não some se a gravação falhar
  };

  const concluir = async () => {
    if (!await confirmar(`Concluir etapa "${etapa.nome}"?`)) return;
    atualizarEtapas(e => {
      if (e.status === 'concluida') return 'Esta etapa já foi concluída por outra pessoa. A tela foi atualizada.';
      if (e.status !== 'em_andamento') return 'Não foi possível concluir: a etapa não está em andamento.';
      e.status = 'concluida';
      e.data_conclusao = new Date().toISOString();
    });
  };

  return (
    <div className="acn-dev-painel">
      <div className={'acn-dev-painel-tit ' + classeEtapa(etapa.status)}>
        Etapa: {etapa.nome}
      </div>

      {etapa.status === 'pendente' && (
        <div className="acn-dev-painel-corpo">
          <div className="acn-dev-campos">
            <div className="acn-dev-campo-resp">
              <label className="acn-label">Responsável *</label>
              <ColaboradorSelect departamentos={DEPTOS.engenharia} value={responsavel} onChange={setResponsavel} incluirUsuariosDaAba="engenharia" placeholder="Selecione o responsável" />
            </div>
            <div className="acn-dev-campo-data">
              <label className="acn-label">Data prevista</label>
              <input type="date" className="acn-input" value={dataPrevista} onChange={e => setDataPrevista(e.target.value)} />
            </div>
          </div>
          <div>
            <Botao variante="primario" icone={mdiPlay} disabled={salvando} onClick={iniciar}>Iniciar etapa</Botao>
          </div>
        </div>
      )}

      {etapa.status === 'em_andamento' && (
        <div className="acn-dev-painel-corpo">
          <div className="acn-ajuda">
            Responsável: <strong>{etapa.responsavel || '—'}</strong>
            {etapa.data_prevista && <> · Previsão: <strong>{fmtDt(etapa.data_prevista)}</strong></>}
            {etapa.data_inicio && <> · Iniciado em {fmtDtHr(etapa.data_inicio)}</>}
          </div>

          {(etapa.observacoes || []).length > 0 && (
            <div className="acn-dev-obs-lista">
              {etapa.observacoes.map((o: any, i: number) => (
                <div key={i} className="acn-dev-obs">
                  <span className="acn-ajuda">{fmtDtHr(o.hora)} · {o.usuario}</span>
                  <div>{o.texto}</div>
                </div>
              ))}
            </div>
          )}

          <textarea className="acn-input" rows={2} aria-label="Nova observação"
            placeholder="Nova observação / nota desta etapa..."
            value={obsTexto} onChange={e => setObsTexto(e.target.value)} />
          <div className="acn-dev-acoes">
            <Botao icone={mdiNoteEditOutline} disabled={salvando || !obsTexto.trim()} onClick={addObs}>Salvar observação</Botao>
            <Botao variante="primario" icone={mdiCheck} disabled={salvando} onClick={concluir}>Concluir etapa</Botao>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Card de uma demanda ──────────────────────────────────────────────────────
function DemandaDevCard({ demanda, onAtualizado, currentUser }: any) {
  // 18d (13/10/2026): o pedido que o PCP faz à Engenharia tem os itens como lista de verdade (PedidoDesenvolvimentoPcp.tsx, que fecha o pedido quando
  // todos estão entregues ou cancelados); as 8 etapas não aparecem para ele — dois andamentos para a mesma coisa só confundiriam
  if (demanda.origem === 'pcp') {
    return (
      <div className="sec-card">
        <div className="sec-hdr">
          <span>OP {demanda.numero_opl} — {demanda.titulo}</span>
          {demanda.concluida ? <Selo familia="ok">Concluída</Selo> : <Selo familia="atencao">Aguardando a Engenharia</Selo>}
        </div>
        <div className="sec-body">
          {demanda.cliente_nome && <div className="acn-ajuda"><strong>Cliente:</strong> {demanda.cliente_nome}</div>}
          <PedidoDoPcp demanda={demanda} onAtualizado={onAtualizado} currentUser={currentUser} />
          <div className="acn-pdp-bloco">
            <div className="acn-pdp-rotulo">Anexos</div>
            <AnexosDev demanda={demanda} onAtualizado={onAtualizado} />
          </div>
          <div className="acn-pdp-bloco">
            <div className="acn-pdp-rotulo">Área Livre</div>
            <AreaLivreDev demanda={demanda} onAtualizado={onAtualizado} />
          </div>
        </div>
      </div>
    );
  }
  return <DemandaComEtapas demanda={demanda} onAtualizado={onAtualizado} currentUser={currentUser} />;
}

// o motivo da última pausa/cancelamento, para a faixa da demanda
function ultimoMotivo(demanda: any, tipo: string) {
  const e = [...(demanda.historico || [])].reverse().find((x: any) => x.tipo === tipo);
  return e?.texto ? `Motivo: ${e.texto}.` : '';
}

// (separado do cartão para os ganchos do React ficarem sempre na mesma ordem: o pedido do PCP sai antes, em DemandaDevCard)
function DemandaComEtapas({ demanda, onAtualizado, currentUser }: any) {
  const etapas = demanda.etapas || [];
  const concluidas = etapas.filter((e: any) => e.status === 'concluida').length;
  const pct = etapas.length ? Math.round((concluidas / etapas.length) * 100) : 0;
  const idxAtiva = etapas.findIndex((e: any) => e.status !== 'concluida');
  const finalizada = idxAtiva === -1;
  const guiada = modeloGuiado(demanda);
  const aDefinir = demanda.tipo_desenvolvimento === 'a_definir';
  const situacao = demanda.situacao || 'ativa';
  const [editandoTipo, setEditandoTipo] = useState(false);
  // trocar o tipo: livre até a Concepção ser aprovada; depois, só Admin ou gerente (a regra também está no modelo)
  const podeTrocarTipo = guiada && situacao !== 'cancelada' && (!etapas[0]?.porta?.concluida_em || ehGerenteDev(currentUser));

  return (
    <div className="sec-card">
      <div className="sec-hdr">
        <span className="acn-dev-titulo">
          {demanda.numero_opl ? <>OP {demanda.numero_opl} — </> : ''}{demanda.titulo}
          {demanda.origem === 'automatico' && <Tag title="Criada sozinha quando a Engenharia marcou “Precisa de Desenvolvimento”">Automática</Tag>}
          {guiada && <Tag title="Tipo de desenvolvimento: decide o que é obrigatório em cada etapa">{rotuloDoTipoDev(demanda.tipo_desenvolvimento)}</Tag>}
        </span>
        <span className="acn-dev-selos">
          {situacao === 'pausada' && <Selo familia="atencao">Pausada</Selo>}
          {situacao === 'cancelada' && <Selo familia="erro">Cancelada</Selo>}
          {finalizada ? <Selo familia="ok">Concluída</Selo> : <Selo familia="info" ponto={false}>{concluidas}/{etapas.length} etapas</Selo>}
          <MenuDaDemanda demanda={demanda} currentUser={currentUser} onAtualizado={onAtualizado} guiada={guiada} onAlterarTipo={() => setEditandoTipo(true)} />
        </span>
      </div>
      <div className="sec-body">
        <SelosDeAlerta al={alertasDaDemanda(demanda, currentUser, hojeISO(), Date.now())} />
        {(demanda.cliente_nome || demanda.descricao) && (
          <div className="acn-dev-info">
            {demanda.cliente_nome && <div><strong>Cliente:</strong> {demanda.cliente_nome}</div>}
            {demanda.descricao && <div><Linkify text={demanda.descricao} /></div>}
          </div>
        )}

        {/* Barra de andamento — logo abaixo da descrição */}
        <div className="acn-dev-andamento">
          <div className="acn-dev-trilho" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <i className={finalizada ? 'ok' : ''} style={{ width: `${pct}%` }} />
          </div>
          <span className="acn-ajuda">{pct}% concluído</span>
        </div>

        {/* Passos das etapas */}
        <ol className="acn-dev-passos" aria-label="Etapas do desenvolvimento">
          {etapas.map((e: any, i: number) => (
            <li key={e.nome} title={`${e.nome} — ${e.porta?.pedida_em ? 'aguardando decisão da porta' : (STATUS_ETAPA[e.status] || e.status)}`}
              className={'acn-dev-passo ' + classeEtapa(e.status) + (i === idxAtiva ? ' ativa' : '') + (e.porta?.pedida_em ? ' porta' : '')}
              aria-current={i === idxAtiva ? 'step' : undefined}>
              {i + 1}. {e.nome}
            </li>
          ))}
        </ol>

        {situacao === 'pausada' && <Faixa tom="atencao">Demanda pausada: nada avança até um gerente retomar. {ultimoMotivo(demanda, 'pausou')}</Faixa>}
        {situacao === 'cancelada' && <Faixa tom="erro">Demanda cancelada. {ultimoMotivo(demanda, 'cancelou')} Nada foi apagado; um gerente pode reabrir.</Faixa>}

        {(aDefinir || editandoTipo) && situacao !== 'cancelada' && (
          <FaixaDeTipo demanda={demanda} currentUser={currentUser} onAtualizado={onAtualizado} onFechar={editandoTipo ? () => setEditandoTipo(false) : null} />
        )}
        {!guiada && !aDefinir && !finalizada && situacao === 'ativa' && (
          <FaixaDeTipo antiga demanda={demanda} currentUser={currentUser} onAtualizado={onAtualizado} />
        )}
        {podeTrocarTipo && !editandoTipo && <div><Botao variante="discreto" pequeno onClick={() => setEditandoTipo(true)}>Alterar o tipo</Botao></div>}

        {guiada && <RessalvasAbertas demanda={demanda} currentUser={currentUser} onAtualizado={onAtualizado} />}
        {guiada && <ResumoDoProjeto demanda={demanda} />}
        {guiada && <PainelDeMudancas demanda={demanda} currentUser={currentUser} onAtualizado={onAtualizado} />}

        {!finalizada && !aDefinir && (
          // key: ao concluir uma etapa o painel da próxima é outro — sem isso ele herdava o responsável, a data e a observação digitada da anterior
          guiada
            ? <PainelGuiado key={etapas[idxAtiva].nome} demanda={demanda} etapa={etapas[idxAtiva]} idx={idxAtiva} onAtualizado={onAtualizado} currentUser={currentUser} />
            : <PainelEtapa key={etapas[idxAtiva].nome} demanda={demanda} etapa={etapas[idxAtiva]} idx={idxAtiva} onAtualizado={onAtualizado} currentUser={currentUser} />
        )}

        <div className="acn-pdp-bloco">
          <div className="acn-pdp-rotulo">Anexos</div>
          <AnexosDev demanda={demanda} onAtualizado={onAtualizado} />
        </div>

        <div className="acn-pdp-bloco">
          <div className="acn-pdp-rotulo">Área Livre</div>
          <AreaLivreDev demanda={demanda} onAtualizado={onAtualizado} />
        </div>

        <HistoricoDaDemanda demanda={demanda} />
      </div>
    </div>
  );
}

// ─── Modal de criação manual ──────────────────────────────────────────────────
function ModalNovaDemanda({ onClose, onCriado, currentUser }: any) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [opBusca, setOpBusca] = useState('');
  const [opResultados, setOpResultados] = useState<any[]>([]);
  const [opSelecionada, setOpSelecionada] = useState<any>(null);
  const [erroBusca, setErroBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [solicitante, setSolicitante] = useState(currentUser?.nome || '');   // quem pediu (aprova as portas); por padrão, quem está criando
  const [salvando, setSalvando] = useState(false);
  const trava = useRef(false);
  const ultimaBusca = useRef(0);   // a resposta de uma busca antiga não pode sobrescrever a da letra seguinte

  const buscarOps = async (q: string) => {
    setOpBusca(q); setOpSelecionada(null);
    const minha = ++ultimaBusca.current;
    if (!q.trim()) { setOpResultados([]); setErroBusca(''); return; }
    const { data, error } = await supabase.from('oples').select('id,opl,cliente_nome').ilike('opl', `%${q.trim()}%`).limit(8);
    if (minha !== ultimaBusca.current) return;
    if (error) { setOpResultados([]); setErroBusca(error.message); return; }
    setErroBusca('');
    setOpResultados(data || []);
  };

  const criar = async () => {
    if (trava.current) return;
    if (!titulo.trim()) { alert('Informe o título/peça em desenvolvimento.'); return; }
    if (!tipo) { alert('Escolha o tipo de desenvolvimento: ele decide o que é obrigatório em cada etapa.'); return; }
    if (!solicitante.trim()) { alert('Informe o solicitante (quem pediu e aprova as portas).'); return; }
    // digitou um número de OP mas não escolheu na lista: antes a demanda nascia sem vínculo e ninguém percebia
    if (opBusca.trim() && !opSelecionada) {
      if (!await confirmar(`Você digitou "${opBusca.trim()}" mas não escolheu nenhuma OP da lista.\n\nCriar a demanda sem vínculo com OP?`)) return;
    }
    trava.current = true;
    setSalvando(true);
    const { error } = await supabase.from('engenharia_desenvolvimento').insert([{
      opl_id: opSelecionada?.id || null,
      numero_opl: opSelecionada?.opl || null,
      cliente_nome: opSelecionada?.cliente_nome || null,
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      etapas: etapasIniciais(),
      origem: 'manual',
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
      tipo_desenvolvimento: tipo,
      solicitante_nome: solicitante.trim(),
      solicitante_email: mesmoNome(solicitante, currentUser?.nome) ? (currentUser?.email || null) : null,   // o e-mail só se sabe quando o solicitante é quem está criando
      historico: [{ em: new Date().toISOString(), por: currentUser?.nome || '', tipo: 'criada', etapa: null, texto: `Tipo: ${rotuloDoTipoDev(tipo)}` }],
    }]);
    trava.current = false;
    setSalvando(false);
    if (error) { alert('Não foi possível criar a demanda: ' + error.message); return; }
    onCriado();
  };

  // sem fechar ao clicar fora: um clique solto perdia o título e a descrição já digitados (mesmo padrão das outras janelas migradas)
  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro" role="dialog" aria-label="Nova demanda de desenvolvimento">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiPlus} size={16} /> Nova demanda de desenvolvimento</span>
        </div>
        <div className="acn-modal-corpo">
          <div className="form-group">
            <label className="acn-label">Vincular a uma OP/OS (opcional)</label>
            <input className="acn-input" placeholder="Buscar por número da OP..." value={opBusca} onChange={e => buscarOps(e.target.value)} />
            {erroBusca && <div className="acn-ajuda atencao">Não foi possível buscar as OPs ({erroBusca}).</div>}
            {opResultados.length > 0 && (
              <div className="acn-dev-op-lista">
                {opResultados.map(o => (
                  <button key={o.id} type="button" className="acn-dev-op-item"
                    onClick={() => { ultimaBusca.current++; setOpSelecionada(o); setOpBusca(o.opl); setOpResultados([]); }}>
                    <strong>{o.opl}</strong> — {o.cliente_nome || '—'}
                  </button>
                ))}
              </div>
            )}
            {opSelecionada && <div className="acn-ajuda" data-acn-familia="ok">Vinculado a {opSelecionada.opl}</div>}
          </div>

          <div className="form-group">
            <label className="acn-label">Título / Peça em desenvolvimento *</label>
            <input className="acn-input" placeholder="Ex: Suporte de fixação da barra sinalizadora" value={titulo} onChange={e => setTitulo(e.target.value)} autoFocus />
          </div>

          <div className="form-group">
            <label className="acn-label">Tipo de desenvolvimento *</label>
            <select className="acn-input" value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo de desenvolvimento">
              <option value="">Escolha o tipo…</option>
              {TIPOS_DEV.map(t => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
            </select>
            <div className="acn-ajuda">{TIPOS_DEV.find(t => t.id === tipo)?.ajuda || 'Decide o que é obrigatório em cada etapa.'}</div>
          </div>

          <div className="form-group">
            <label className="acn-label">Solicitante *</label>
            <ColaboradorSelect value={solicitante} onChange={setSolicitante} placeholder="Quem pediu este desenvolvimento" />
            <div className="acn-ajuda">Quem pediu aprova as portas das etapas, junto com o gerente.</div>
          </div>

          <div className="form-group">
            <label className="acn-label">Descrição</label>
            <textarea className="acn-input" rows={3} placeholder="Detalhes do que precisa ser desenvolvido..." value={descricao} onChange={e => setDescricao(e.target.value)} />
          </div>
        </div>
        <div className="acn-modal-rodape">
          <Botao variante="primario" disabled={salvando} onClick={criar}>{salvando ? 'Criando…' : 'Criar demanda'}</Botao>
          <Botao onClick={onClose}>Cancelar</Botao>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function DesenvolvimentoPecasTab({ currentUser, buscaInicial }: { currentUser: any; buscaInicial?: string }) {
  const [demandas, setDemandas] = useState<any[] | null>(null);   // null = ainda não leu; depois da primeira leitura a lista fica na tela enquanto recarrega
  const [erroLista, setErroLista] = useState('');
  const [filtro, setFiltro] = useState<'todas' | 'andamento' | 'concluidas' | 'canceladas'>('todas');
  const [busca, setBusca] = useState(buscaInicial || '');
  const [alerta, setAlerta] = useState('todos');
  const [modalNova, setModalNova] = useState(false);

  // Deep-link da busca global (DashboardTab.tsx) — chega depois da
  // montagem inicial (a aba Engenharia troca de sub-aba e só então
  // dispara o evento), então precisa reagir a mudanças, não só ao mount.
  useEffect(() => { if (buscaInicial) setBusca(buscaInicial); }, [buscaInicial]);

  const carregar = async () => {
    try {
      // lê em blocos de 1.000 (o banco corta a consulta nesse número) e com desempate por id
      const linhas = await lerPaginado(() => supabase.from('engenharia_desenvolvimento').select('*').order('criado_em', { ascending: false }).order('id'));
      setErroLista('');
      setDemandas(linhas);
    } catch (e: any) {
      // leitura recusada não pode parecer "nenhuma demanda cadastrada"
      setErroLista(e?.message || 'falha na leitura');
    }
  };

  useEffect(() => { carregar(); }, []);

  const lista = demandas || [];
  const casaBusca = (d: any) => combinaBusca([d.titulo, d.descricao, d.numero_opl, d.cliente_nome, d.veiculo_nome], busca);
  const baseBusca = lista.filter(casaBusca);
  const nAndamento = baseBusca.filter(d => !estaCancelada(d) && !estaFinalizada(d)).length;
  const nConcluidas = baseBusca.filter(d => !estaCancelada(d) && estaFinalizada(d)).length;
  const nCanceladas = baseBusca.filter(estaCancelada).length;
  // D6: o alerta (cartões do painel) é um segundo filtro, somado ao da situação; a conta de cada alerta é a de alertasDaDemanda
  const agoraMs = Date.now(), hoje = hojeISO();
  const comAlertas = baseBusca.map(d => ({ d, al: alertasDaDemanda(d, currentUser, hoje, agoraMs) }));
  const filtradas = comAlertas.filter(({ d, al }) => {
    if (!passaNoAlerta(al, alerta)) return false;
    if (filtro === 'andamento') return !estaCancelada(d) && !estaFinalizada(d);
    if (filtro === 'concluidas') return !estaCancelada(d) && estaFinalizada(d);
    if (filtro === 'canceladas') return estaCancelada(d);
    return true;
  }).map(x => x.d);

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">
          <span className="acn-dev-titulo"><Icone path={mdiCogOutline} size={16} /> Desenvolvimento de peças {demandas && <>({filtradas.length})</>}</span>
          <Botao variante="primario" pequeno icone={mdiPlus} onClick={() => setModalNova(true)}>Nova demanda</Botao>
        </div>
        <div className="acn-filtros">
          <Chips rotulo="Situação" ativo={filtro} onChange={id => setFiltro(id as any)}
            itens={[
              { id: 'todas', rotulo: 'Todas', contagem: demandas ? baseBusca.length : null },
              { id: 'andamento', rotulo: 'Em andamento', contagem: demandas ? nAndamento : null },
              { id: 'concluidas', rotulo: 'Concluídas', contagem: demandas ? nConcluidas : null },
              { id: 'canceladas', rotulo: 'Canceladas', contagem: demandas ? nCanceladas : null },
            ]} />
          <label className="acn-dev-busca">
            <Icone path={mdiMagnify} size={16} />
            <input className="acn-input" aria-label="Buscar demanda" placeholder="Buscar por título, OP ou cliente..." value={busca} onChange={e => setBusca(e.target.value)} />
          </label>
        </div>
      </div>

      {demandas !== null && (
        <>
          <PainelDaEngenharia itens={comAlertas.filter(({ d }) => !estaCancelada(d) && !estaFinalizada(d))} alerta={alerta} onAlerta={setAlerta} />
          <TabelaDeCustos itens={comAlertas.filter(({ d }) => !estaCancelada(d))} />
        </>
      )}

      {erroLista && (
        <Faixa tom="erro" acao={<Botao pequeno icone={mdiRefresh} onClick={carregar}>Tentar de novo</Botao>}>
          Não foi possível ler as demandas ({erroLista}). Isso não quer dizer que não existam demandas{demandas ? '; a lista abaixo é a da última leitura que deu certo' : ''}.
        </Faixa>
      )}

      {demandas === null && !erroLista ? (
        <div className="acn-empty">Carregando...</div>
      ) : demandas === null ? null : filtradas.length === 0 ? (
        <div className="acn-empty">
          {alerta !== 'todos' ? <>Nenhuma demanda com esse alerta. <Botao pequeno variante="discreto" onClick={() => setAlerta('todos')}>Ver todas</Botao></>
            : busca.trim() ? 'Nenhuma demanda com essa busca.' : `Nenhuma demanda de desenvolvimento ${filtro !== 'todas' ? 'nesse filtro' : 'cadastrada ainda'}.`}
        </div>
      ) : (
        filtradas.map(d => (
          <DemandaDevCard key={d.id} demanda={d} onAtualizado={carregar} currentUser={currentUser} />
        ))
      )}

      {modalNova && (
        <ModalNovaDemanda currentUser={currentUser} onClose={() => setModalNova(false)}
          onCriado={() => { setModalNova(false); carregar(); }} />
      )}
    </div>
  );
}
