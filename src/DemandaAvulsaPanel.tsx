// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ColaboradorSelect } from './ColaboradorSelect';
import { departamentosDoSetor } from './RhDepartamentos';
import { supabase } from './supabaseClient';
import { explicarErroDeEnvio } from './ErroDeArquivo';
import { nomeSeguroDeArquivo } from './FormatosArquivo';
import MencaoTextarea, { salvarMencoes } from './MencaoTextarea';
import Linkify from './Linkify';
import { combinaBusca, normalizarBusca } from './SearchUtils';
import { CentroCustoSelect, fetchCentrosCusto } from './CentroCustoShared';
import { PinturaCampos, PinturaSelo, abrirPedidoPintura, ehSerralheria } from './PinturaSerralheria';
import { CamposSolicitacaoCompra, solicitacaoCompraVazia, validarSolicitacaoCompra, enviarSolicitacaoCompra } from './SolicitacaoCompra';
import { useCentroObrigatorio } from './CentroCustoUso';
import { ParticipantesPicker, notificarParticipantes } from './Participantes';
import { MembrosResumo, MembrosDaDemanda, GrupoDaDemanda, DescricoesDosArquivos, DescricaoDoAnexo, chaveArquivo } from './DemandaExtras';

// ─── Campos próprios de cada setor ───────────────────────────────────────────
// A demanda avulsa é a mesma para todo mundo, mas cada setor precisa de uma
// informação a mais. Compras abre o apontamento de centro de custo. Para
// acrescentar campo de outro setor, inclua aqui e trate no formulário/detalhe.
const CAMPOS_POR_SETOR: Record<string, { centroCusto?: boolean; valorItens?: boolean; pintura?: boolean }> = {
  Compras: { centroCusto: true, valorItens: true },
  // Serralheria: a peça pode precisar de pintura, que é serviço de terceiro —
  // ver PinturaSerralheria.tsx (o pedido ao Compras nasce ao concluir a peça).
  Serralheria: { pintura: true },
};
// quem compra: completa valor dos itens e centro de custo que o solicitante deixou em branco
const ehComprador = (u: any, d: any) =>
  ['Admin', 'Compras'].includes(u?.perfil) || String(u?.perfil || '').startsWith('Gerente')
  || (!!u?.nome && u.nome === d?.responsavel_nome);
const camposDoSetor = (setor: string) => CAMPOS_POR_SETOR[String(setor || '').trim()] || {};
// chave da aba do setor ("Laboratório" → "laboratorio"), para listar também os usuários com acesso a ela
const abaDoSetor = (setor: string) => normalizarBusca(String(setor || '').trim()) || undefined;
import { VinculoPicker, abrirVinculo, TIPO_LABEL, TIPOS_PADRAO } from './VinculoPicker';
import { FormacaoDaDemanda } from './FormacaoDaDemanda';
import { EscolherAnexos } from './ComprasFluxo';
import type { VinculoValue } from './VinculoPicker';
import { notificarEvento, msg } from './whatsappHelper';
import { confirmar } from './Feedback';
import { Faixa, hojeISO, Botao } from './Interface';
// pausa e horas úteis (16/10/2026): a conta fica em HorarioDemanda.ts, o relógio e as perguntas da tela em PausaDaDemanda.tsx
import { abrirTrecho, fecharTrecho, situacaoDoRelogio, fmtTempo, dentroDoExpediente } from './HorarioDemanda';
import { useAgora, confirmarAbertura, entradaDoRelogio, FaixaDoRelogio, tempoEmTexto, tempoDasEtapas } from './PausaDaDemanda';
import {
  ItensDemandaEditor, ItensDemandaView, VinculosEditor, VinculosView, CATEGORIA_DO_SETOR,
  itemVazio, itensPreenchidos, vinculosDaDemanda, camposDosVinculos,
} from './DemandaItens';

// e-mail dos responsáveis sai do cadastro de usuários (não precisa digitar)
async function emailsDosResponsaveis(nomes: string[]) {
  const unicos = [...new Set(nomes.filter(Boolean))];
  if (!unicos.length) return {};
  const { data } = await supabase.from('auth_usuarios').select('nome,email').in('nome', unicos);
  return Object.fromEntries((data || []).map((u: any) => [u.nome, u.email]));
}
// quem abriu a demanda (ou Admin) pode cancelá-la enquanto não foi concluída
const podeCancelar = (d: any, u: any) =>
  !['Concluída', 'Cancelada'].includes(d.status)
  && (u?.perfil === 'Admin' || (!!u?.email && u.email === d.criado_por) || (!!u?.nome && u.nome === d.criado_por_nome));
const ENCERRADA = (st: string) => st === 'Concluída' || st === 'Cancelada';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────
// 12e67 (16/10/2026): a cor de cada status, prioridade e atraso saiu do código (era um mapa de cores soltas lido por dezenas de estilos): o estado virou modificador de classe
// (st-pendente…, prio-alta…, al-vencida/al-urgente) e o CSS (design.css, bloco acn-dav-*) dá a cor.
const chaveStatus = (st: string) => (({ 'Pendente': 'pendente', 'Em Andamento': 'andamento', 'Concluída': 'concluida', 'Cancelada': 'cancelada' }) as any)[st] || 'outro';
const chavePrio = (p: string) => (({ 'Alta': 'alta', 'Média': 'media', 'Baixa': 'baixa' }) as any)[p] || 'outro';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmtDT = (v: string) => {
  if (!v) return '—';
  return new Date(v).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
};
// Formata apenas a data (sem hora) — para prazos
const fmtDate = (v: string) => {
  if (!v) return '—';
  // Se vier YYYY-MM-DD, usa T12:00 para evitar shift de fuso
  const d = v.length === 10 ? new Date(v + 'T12:00') : new Date(v);
  return d.toLocaleDateString('pt-BR');
};
// Converte string "YYYY-MM-DD" para ISO evitando UTC shift
const dateToISO = (v: string) => v ? new Date(v + 'T12:00:00').toISOString() : null;
// Converte ISO/timestamp para "YYYY-MM-DD" (para popular input date)
const isoToDate = (v: string) => {
  if (!v) return '';
  const d = new Date(v);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const diasParaVencer = (prazo: string): number | null => {
  if (!prazo) return null;
  return Math.ceil((new Date(prazo).getTime() - Date.now()) / 86400000);
};
const alertClass = (prazo: string, status: string): 'vencida' | 'urgente' | null => {
  if (!prazo || status === 'Concluída' || status === 'Cancelada') return null;
  const d = diasParaVencer(prazo);
  if (d === null) return null;
  if (d < 0) return 'vencida';
  if (d <= 2) return 'urgente';
  return null;
};

// Pedido do usuário em 16/10/2026: a demanda avulsa da Engenharia aceita QUALQUER arquivo (desenho, compactado, modelo 3D...), não só foto e documento.
// Dois motivos faziam o arquivo não entrar: o seletor só mostrava alguns tipos e o envio falhava SEM AVISO — o armazenamento recusa nome com acento ou símbolo
// ("Especificação (v2).pdf") e aqui só se trocava o espaço. Agora o nome guardado no armazenamento é limpo (o original continua na lista) e cada falha volta com o motivo.
const LIMITE_ANEXO_MB = 50;   // é o limite do próprio armazenamento (bucket acn-media)
async function uploadAnexo(file: File, demandaId: string): Promise<{ url: string | null; erro?: string }> {
  if (file.size > LIMITE_ANEXO_MB * 1024 * 1024) return { url: null, erro: explicarErroDeEnvio({ statusCode: 413 }, file) };
  const path = `demandas-avulsas/${demandaId}/${Date.now()}_${nomeSeguroDeArquivo(file.name)}`;
  // sem tipo informado pelo navegador (.dwg, .step, .rar...), sobe como arquivo genérico
  const { data, error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
  if (error || !data) return { url: null, erro: explicarErroDeEnvio(error, file) };
  const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
  return pub?.publicUrl ? { url: pub.publicUrl } : { url: null, erro: 'não foi possível obter o endereço do arquivo' };
}

// Status geral calculado pelas etapas
function calcStatusEtapas(etapas: any[]): string {
  if (!etapas || etapas.length === 0) return 'Pendente';
  if (etapas.every(e => e.status === 'Concluída')) return 'Concluída';
  if (etapas.some(e => e.status === 'Em Andamento')) return 'Em Andamento';
  return 'Pendente';
}

function etapaVencida(e: any) {
  return alertClass(e.prazo, e.status);
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD DE ETAPA (dentro do ModalDetalhe)
// ─────────────────────────────────────────────────────────────────────────────
function EtapaCard({ etapa, idx, total, onUpdate, currentUser, demandaId, agora }) {
  const [obsExec, setObsExec] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [mostrarReprog, setMostrarReprog] = useState(false);
  const [reprogData, setReprogData] = useState('');
  const [reprogMotivo, setReprogMotivo] = useState('');
  const [editandoVinculo, setEditandoVinculo] = useState(false);
  const etapaVinculo: VinculoValue | null = etapa.vinculo_tipo
    ? { tipo: etapa.vinculo_tipo, id: etapa.vinculo_id, descricao: etapa.vinculo_descricao }
    : null;
  const salvarVinculoEtapa = async (v: VinculoValue | null) => {
    const gravou = await onUpdate(idx, { vinculo_tipo: v?.tipo || null, vinculo_id: v?.id || null, vinculo_descricao: v?.descricao || null });
    if (gravou) setEditandoVinculo(false);   // 7.x (16/10/2026): gravação recusada não fecha a edição
  };
  const al = etapaVencida(etapa);
  const diasV = diasParaVencer(etapa.prazo);
  const modCor = al ? 'al-' + al : 'st-' + chaveStatus(etapa.status);   // atraso manda; sem atraso vale a cor do status

  const nomeDeQuemMexe = currentUser?.nome || '';
  const iniciar = async () => {
    const ag = new Date();
    if (!await confirmarAbertura(`Iniciar Etapa ${idx + 1}?`, `iniciar a etapa ${idx + 1}`, ag)) return;
    setSalvando(true);
    // pausa e horas úteis (16/10/2026): iniciar abre o primeiro trecho de trabalho da etapa; fora do expediente conta como hora extra e fica no histórico
    await onUpdate(idx, { status: 'Em Andamento', data_inicio: ag.toISOString(), trechos: abrirTrecho({ trechos: [] }, ag, nomeDeQuemMexe) },
      dentroDoExpediente(ag) ? undefined : { informacao: entradaDoRelogio('inicio', nomeDeQuemMexe, ag, `a etapa ${idx + 1}`) });
    setSalvando(false);
  };
  // pausar e retomar a etapa: a etapa é lida de novo antes de gravar (updateEtapa) e a conta de trechos é a mesma da demanda simples
  const pausar = async () => {
    const ag = new Date();
    setSalvando(true);
    await onUpdate(idx, (e: any) => ({ trechos: fecharTrecho(e, ag) }), { informacao: entradaDoRelogio('pausa', nomeDeQuemMexe, ag, `a etapa ${idx + 1}`) });
    setSalvando(false);
  };
  const retomar = async () => {
    const ag = new Date();
    if (!await confirmarAbertura(`Retomar a Etapa ${idx + 1} agora?`, `retomar a etapa ${idx + 1}`, ag)) return;
    setSalvando(true);
    await onUpdate(idx, (e: any) => (situacaoDoRelogio(e, ag) === 'rodando' ? {} : { trechos: abrirTrecho(e, ag, nomeDeQuemMexe), data_inicio: e.data_inicio || ag.toISOString() }),
      { informacao: entradaDoRelogio('retomada', nomeDeQuemMexe, ag, `a etapa ${idx + 1}`) });
    setSalvando(false);
  };
  const reprogramar = async () => {
    if (!reprogData) { alert('Informe a nova data!'); return; }
    if (!reprogMotivo.trim()) { alert('Informe o motivo da reprogramação!'); return; }
    setSalvando(true);
    const agora = new Date().toISOString();
    const entrada = {
      prazo_anterior: etapa.prazo || null,
      novo_prazo: dateToISO(reprogData),
      motivo: reprogMotivo.trim(),
      usuario: currentUser?.nome || '',
      data: agora,
    };
    // 7.x (16/10/2026): a lista de reprogramações vem da etapa lida AGORA (duas pessoas reprogramando apagavam o registro uma da outra) e, se o banco recusar, o formulário continua preenchido
    const gravou = await onUpdate(idx, (e: any) => ({ prazo: dateToISO(reprogData), reprogramacoes: [...(e.reprogramacoes || []), entrada] }));
    if (gravou) { setReprogData(''); setReprogMotivo(''); setMostrarReprog(false); }
    setSalvando(false);
  };
  const concluir = async () => {
    if (!await confirmar(`Concluir Etapa ${idx + 1}?`)) return;
    setSalvando(true);
    const ag = new Date();
    await onUpdate(idx, (e: any) => ({ status: 'Concluída', data_fim: ag.toISOString(), trechos: fecharTrecho(e, ag) }));
    setSalvando(false);
  };
  const addObs = async () => {
    if (!obsExec.trim()) return;
    setSalvando(true);
    // 7.x (16/10/2026): a observação entra na lista lida AGORA e, se o banco recusar, o texto fica na caixa e ninguém é avisado (@menção) de uma observação que não foi gravada
    const nova = { texto: obsExec, usuario: currentUser?.nome, data: new Date().toISOString() };
    const gravou = await onUpdate(idx, (e: any) => ({ obs_execucao: [...(e.obs_execucao || []), nova] }));
    if (!gravou) { setSalvando(false); return; }
    await salvarMencoes({
      texto:               obsExec,
      mencionanteId:       String(currentUser?.id || currentUser?.email || ''),
      mencionanteNome:     currentUser?.nome || '',
      contexto:            'demanda_avulsa',
      contextoId:          String(demandaId || ''),
      contextoDescricao:   `Demanda Avulsa — Etapa ${idx + 1}`,
      campo:               'obs_execucao',
      abaDestino:          'engenharia',
    });
    setObsExec('');
    setSalvando(false);
  };

  // pausa e horas úteis (16/10/2026): o tempo da etapa é a soma dos trechos de trabalho em horas úteis; a hora extra vai à parte
  const sitRelogio = situacaoDoRelogio(etapa, agora);
  const tempo = tempoEmTexto(etapa, agora);

  return (
    <div className={'acn-dav-et ' + modCor}>
      {/* Header da etapa */}
      <div className={'acn-dav-et-cab ' + modCor}>
        <div className="acn-dav-g-1">
          <span className={'acn-dav-et-num ' + modCor}>
            ETAPA {idx + 1}/{total}
          </span>
          <span className={'acn-dav-st st-' + chaveStatus(etapa.status)}>
            {etapa.status}
          </span>
          {(sitRelogio === 'pausada' || sitRelogio === 'pausada-auto') && (
            <span className="acn-dav-st st-pausada" title={sitRelogio === 'pausada-auto' ? 'Pausou sozinha ao fim do expediente: retome para voltar a contar' : 'O tempo não está contando'}>⏸ Pausada</span>
          )}
          {al && (
            <span className={'acn-dav-al-txt al-' + al}>
              {al === 'vencida' ? '🔴 VENCIDA' : `🟡 ${diasV}d`}
            </span>
          )}
        </div>
        <div className="acn-dav-et-1">
          {etapa.status === 'Pendente' && (
            <Botao className={'acn-dav-b acn-dav-et-2' + (mostrarReprog ? ' reprog-aberto' : '')} onClick={iniciar} disabled={salvando}>
              ▶ Iniciar
            </Botao>
          )}
          {etapa.status === 'Em Andamento' && (
            <Botao className={'acn-dav-b acn-dav-et-3' + (mostrarReprog ? ' reprog-aberto' : '')} onClick={concluir} disabled={salvando}>
              ✓ Concluir
            </Botao>
          )}
          {etapa.status === 'Em Andamento' && (sitRelogio === 'rodando'
            ? <Botao className="acn-dav-b acn-dav-et-pausar" onClick={pausar} disabled={salvando}>⏸ Pausar</Botao>
            : <Botao className="acn-dav-b acn-dav-et-pausar" onClick={retomar} disabled={salvando}>▶ Retomar</Botao>)}
          {etapa.status !== 'Concluída' && (
            <Botao onClick={() => setMostrarReprog(v => !v)} disabled={salvando}
              className={'acn-dav-b ' + ('acn-dav-et-bt-reprog' + (mostrarReprog ? ' aberto' : ''))}>
              📅 Reprogramar
            </Botao>
          )}
        </div>
      </div>

      {/* Reprogramar prazo da etapa */}
      {mostrarReprog && (
        <div className="acn-dav-et-4">
          <div>
            <div className="acn-dav-et-5">Novo Prazo *</div>
            <input className="acn-dav-et-6" type="date" value={reprogData} onChange={e=>setReprogData(e.target.value)} />
          </div>
          <div className="acn-dav-et-7">
            <div className="acn-dav-et-5">Motivo da Reprogramação *</div>
            <input className="acn-dav-et-8" value={reprogMotivo} onChange={e=>setReprogMotivo(e.target.value)} placeholder="Por que o prazo mudou?" />
          </div>
          <Botao className="acn-dav-b acn-dav-et-9" onClick={reprogramar} disabled={salvando}>
            Confirmar
          </Botao>
          <Botao className="acn-dav-b acn-dav-et-10" onClick={() => setMostrarReprog(false)}>
            Cancelar
          </Botao>
        </div>
      )}

      {/* Body da etapa */}
      <div className="acn-dav-et-11">
        <div className="acn-dav-et-12">
          <div>
            <div className="acn-dav-et-13">Responsável</div>
            <div className="acn-dav-et-14">{etapa.responsavel_nome || '—'}</div>
          </div>
          <div>
            <div className="acn-dav-et-13">Prazo</div>
            <div className={'acn-dav-et-prazo' + (al ? ' al-' + al : '')}>
              {fmtDate(etapa.prazo)}
            </div>
          </div>
          <div>
            <div className="acn-dav-et-13">
              {etapa.data_fim ? 'Tempo trabalhado' : etapa.data_inicio ? 'Trabalhado até agora' : 'KPI'}
            </div>
            <div className="acn-dav-et-15">
              {etapa.data_inicio ? tempo.uteis : '—'}
              {tempo.extras && <span className="acn-dav-et-extra" title="Hora extra: tempo trabalhado fora do expediente (segunda a sexta, 8:00 às 17:48)"> + {tempo.extras} extra</span>}
            </div>
          </div>
        </div>

        {/* Vínculo da etapa a um processo (opcional, independente do vínculo da demanda) */}
        {editandoVinculo ? (
          <div>
            <VinculoPicker value={etapaVinculo} onSelect={salvarVinculoEtapa} onClear={() => salvarVinculoEtapa(null)} />
            <Botao className="acn-dav-b acn-dav-et-16" onClick={() => setEditandoVinculo(false)}>
              cancelar
            </Botao>
          </div>
        ) : etapaVinculo ? (
          <div className="acn-dav-et-17" onClick={() => abrirVinculo(etapaVinculo)}>
            <span className="acn-dav-et-18">🔗 {TIPO_LABEL[etapaVinculo.tipo] || etapaVinculo.tipo}</span>
            <span className="acn-dav-et-19">{etapaVinculo.descricao}</span>
            <Botao className="acn-dav-b acn-dav-et-20" onClick={e => { e.stopPropagation(); setEditandoVinculo(true); }}>editar</Botao>
          </div>
        ) : (
          <Botao className="acn-dav-b acn-dav-et-21" onClick={() => setEditandoVinculo(true)}>
            🔗 Vincular a um processo (opcional)
          </Botao>
        )}

        {etapa.obs_criacao && (
          <div className="acn-dav-et-22">
            {etapa.obs_criacao}
          </div>
        )}

        {/* Histórico de reprogramações da etapa */}
        {(etapa.reprogramacoes || []).length > 0 && (
          <div className="acn-dav-et-23">
            {[...(etapa.reprogramacoes || [])].reverse().map((r: any, i: number) => (
              <div className="acn-dav-et-24" key={i}>
                <span className="acn-dav-et-25">{r.usuario} · {fmtDT(r.data)}</span>
                <div className="acn-dav-et-26">
                  📅 {fmtDate(r.prazo_anterior)} → {fmtDate(r.novo_prazo)} — {r.motivo}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Histórico de obs de execução */}
        {(etapa.obs_execucao || []).length > 0 && (
          <div className="acn-dav-et-27">
            {[...(etapa.obs_execucao || [])].reverse().map((o: any, i: number) => (
              <div className="acn-dav-et-24" key={i}>
                <span className="acn-dav-et-25">{o.usuario} · {fmtDT(o.data)}</span>
                <div className="acn-dav-et-28">{o.texto}</div>
              </div>
            ))}
          </div>
        )}

        {/* Adicionar obs de execução */}
        {etapa.status !== 'Concluída' && (
          <div className="acn-dav-et-29">
            <div className="acn-dav-g-2">
              <MencaoTextarea className="acn-dav-et-30"
                value={obsExec}
                onChange={setObsExec}
                rows={2}
                placeholder="Observação durante execução... use @Nome para mencionar"
              />
            </div>
            <Botao className="acn-dav-b acn-dav-et-31" onClick={addObs} disabled={salvando || !obsExec.trim()}>
              +
            </Botao>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL DE DETALHE / EDIÇÃO
// ─────────────────────────────────────────────────────────────────────────────
function ModalDetalhe({ demanda: initial, currentUser, onClose, onRefresh }) {
  const [d, setD] = useState(initial);
  const agora = useAgora();   // o relógio da tela: a pausa das 17:48 aparece sem ninguém recarregar
  const [anexos, setAnexos] = useState<any[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [novaInfo, setNovaInfo] = useState('');
  const [editando, setEditando] = useState(false);
  const [editForm, setEditForm] = useState({ titulo: initial.titulo, descricao: initial.descricao || '', observacoes: initial.observacoes || '', prioridade: initial.prioridade });
  const [vinculos, setVinculos] = useState<VinculoValue[]>(vinculosDaDemanda(initial));
  const [itensEdit, setItensEdit] = useState<any[]>((initial.itens || []).length ? initial.itens : [itemVazio()]);
  const [mostrarCancelar, setMostrarCancelar] = useState(false);
  const [motivoCancelar, setMotivoCancelar] = useState('');
  const [designarForm, setDesignarForm] = useState({ responsavel_nome: initial.responsavel_nome || '', responsavel_email: initial.responsavel_email || '', prazo: initial.prazo ? isoToDate(initial.prazo) : '' });
  const camposSetor = camposDoSetor(initial.setor);
  const [centrosDet, setCentrosDet] = useState<any[]>([]);
  useEffect(() => { if (camposSetor.centroCusto) fetchCentrosCusto().then(setCentrosDet); }, [camposSetor.centroCusto]);
  // 7.x (16/10/2026): toda gravação da demanda confere a resposta do banco; se recusou, avisa o motivo e quem chamou NÃO segue como se tivesse dado certo
  const gravarDemanda = async (campos: any, oQue: string): Promise<boolean> => {
    const { error } = await supabase.from('demandas_avulsas').update(campos).eq('id', d.id);
    if (error) { alert(`Não foi possível ${oQue}: ${error.message}`); return false; }
    return true;
  };
  const gravarCentroCusto = async (id: string | null) => {
    const c = centrosDet.find((x: any) => x.id === id);
    if (!await gravarDemanda({ centro_custo_id: id, centro_custo: c ? `${c.codigo} — ${c.nome}` : null, atualizado_em: new Date().toISOString() }, 'gravar o centro de custo')) return;
    await reload();
    onRefresh();
  };
  const [reprogramarForm, setReprogramarForm] = useState({ nova_data: '', motivo: '' });
  const [mostrarReprogramar, setMostrarReprogramar] = useState(false);
  const [mostrarDesignar, setMostrarDesignar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const temEtapas = (d.etapas || []).length > 0;

  // 7.x (16/10/2026): leitura recusada não pode parecer "nenhum arquivo" nem deixar a tela velha como se estivesse em dia: a faixa vermelha avisa e o que já estava na tela fica
  const [erroLeitura, setErroLeitura] = useState('');
  const reload = useCallback(async () => {
    const [{ data: dem, error: e1 }, { data: anx, error: e2 }] = await Promise.all([
      supabase.from('demandas_avulsas').select('*').eq('id', d.id).single(),
      supabase.from('demanda_avulsa_anexos').select('*').eq('demanda_id', d.id).order('criado_em', { ascending: false }),
    ]);
    setErroLeitura(e1 || e2 ? ((e1 || e2) as any).message : '');
    if (dem) setD(dem);
    if (!e2) setAnexos(anx || []);
  }, [d.id]);

  useEffect(() => { reload(); }, [reload]);

  // Mantém o vínculo local em sincronia sempre que `d` for recarregado
  // (ex.: após salvarEdicao/reload), sem depender de o usuário reabrir o modal.
  useEffect(() => {
    setVinculos(vinculosDaDemanda(d));
  }, [d.vinculo_tipo, d.vinculo_id, d.vinculo_descricao, JSON.stringify(d.vinculos || [])]);
  useEffect(() => { if (!editando) setItensEdit((d.itens || []).length ? d.itens : [itemVazio()]); }, [editando, JSON.stringify(d.itens || [])]);

  // ── Cancelar (quem abriu a demanda) ───────────────────────────────────────
  // ── Compras: vira pedido de compra (Mesa de Cotações, aprovação, OC, valor gasto) ──
  const [pedidoCompra, setPedidoCompra] = useState<any>(null);
  useEffect(() => {
    if (!d.pedido_compra_id) { setPedidoCompra(null); return; }
    supabase.from('pcp_pedidos_compra').select('id,numero_pedido,numero_oc,status_compra,valor_compra,fornecedor,data_prevista_recebimento')
      .eq('id', d.pedido_compra_id).maybeSingle().then(({ data }) => setPedidoCompra(data));
  }, [d.pedido_compra_id]);
  const gerarPedidoCompra = async () => {
    const itens = d.itens || [];
    if (!itens.length && !String(d.descricao || '').trim()) { alert('Informe os itens (ou a descrição) antes de gerar o pedido de compra.'); return; }
    if (!await confirmar('Gerar o pedido de compra desta demanda? Cotações, aprovação e o valor gasto passam a ser feitos no pedido, em Compras.')) return;
    setSalvando(true);
    const agora = new Date().toISOString();
    const listaItens = itens.map((i: any) => `${i.quantidade}× ${i.nome}${i.descricao ? ` (${i.descricao})` : ''}${i.valor_unitario != null && i.valor_unitario !== '' ? ` — R$ ${Number(i.valor_unitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/un` : ''}`).join('\n');
    const v0 = vinculosDaDemanda(d)[0];
    const { data: novo, error } = await supabase.from('pcp_pedidos_compra').insert([{
      numero_pedido: `PC-DA-${Date.now().toString().slice(-7)}`,
      opl: v0?.tipo === 'op' ? String(v0.descricao || '').split(' — ')[0] : null,
      descricao_material: [d.titulo, listaItens].filter(Boolean).join('\n'),
      quantidade: itens.length === 1 ? Number(itens[0].quantidade) || 1 : 1,
      itens: itensPreenchidos(itens),   // a lista de material vai junto, como em toda solicitação de compra (05/10/2026)
      status_compra: 'Pendente',
      observacoes_compra: [d.descricao && `Motivo: ${d.descricao}`, `Demanda avulsa de Compras: ${d.titulo}`].filter(Boolean).join('\n'),
      centro_custo_id: d.centro_custo_id || null, centro_custo: d.centro_custo || null,
      vinculo_tipo: v0?.tipo || null, vinculo_id: v0?.id || null, vinculo_descricao: v0?.descricao || null,
      data_criacao: agora,
      // quem pediu recebe os avisos do andamento (aprovação, reprocesso, descarte)
      criado_por: d.criado_por || currentUser?.email || null, criado_por_nome: d.criado_por_nome || currentUser?.nome || null,
      criado_por_setor: 'Demanda avulsa',
    }]).select('id,numero_pedido').single();
    if (error) { setSalvando(false); alert('Não foi possível gerar o pedido: ' + error.message); return; }
    const info = [...(d.informacoes || []), { texto: `Pedido de compra ${novo.numero_pedido} gerado — cotações e valor seguem em Compras.`, usuario: currentUser?.nome || '', data: agora }];
    const ligou = await gravarDemanda({
      pedido_compra_id: novo.id, informacoes: info, atualizado_em: agora,
      // pausa e horas úteis (16/10/2026): gerar o pedido marca o início, mas só abre o relógio dentro do expediente (a hora extra não nasce sem a pessoa decidir)
      ...(d.status === 'Pendente' ? { status: 'Em Andamento', data_inicio: agora, trechos: dentroDoExpediente(new Date(agora)) ? abrirTrecho({ trechos: [] }, new Date(agora), currentUser?.nome || '') : [] } : {}),
    }, `ligar a demanda ao pedido ${novo.numero_pedido} (o pedido foi criado em Compras, mas a demanda NÃO ficou ligada a ele; não gere outro pedido)`);
    setSalvando(false);
    if (!ligou) return;
    await reload(); onRefresh();
  };

  // ── Admin: reabrir demanda concluída/cancelada por engano ──
  const ehAdmin = currentUser?.perfil === 'Admin';
  // quem pode mexer nos envolvidos e nas descrições dos anexos: Admin, quem criou a demanda, o responsável ou um envolvido
  const meuEmail = String(currentUser?.email || '').trim().toLowerCase();
  const podeMexerNaDemanda = ehAdmin || (!!meuEmail && String(d.criado_por || '').trim().toLowerCase() === meuEmail)
    || (!!currentUser?.nome && (currentUser.nome === d.criado_por_nome || currentUser.nome === d.responsavel_nome))
    || (Array.isArray(d.membros) && d.membros.some((m: any) => String(m?.email || '').trim().toLowerCase() === meuEmail));
  const [mostrarReabrir, setMostrarReabrir] = useState(false);
  const [reabrirForm, setReabrirForm] = useState({ status: 'Pendente', motivo: '' });
  const reabrirDemanda = async () => {
    if (!reabrirForm.motivo.trim()) { alert('Informe o motivo da reabertura.'); return; }
    setSalvando(true);
    const agora = new Date().toISOString();
    const info = [...(d.informacoes || []), { tipo: 'reabertura', usuario: currentUser?.nome || '', data: agora,
      texto: `Reaberta (${d.status} → ${reabrirForm.status}) — Motivo: ${reabrirForm.motivo.trim()}` }];
    const { error } = await supabase.from('demandas_avulsas').update({
      status: reabrirForm.status, data_fim: null,
      // pausa e horas úteis (16/10/2026): reaberta como Pendente zera o tempo (como já zerava o início); reaberta em andamento guarda o que foi trabalhado e fica PAUSADA até alguém retomar
      ...(reabrirForm.status === 'Pendente' ? { data_inicio: null, trechos: null } : { trechos: fecharTrecho(d, new Date(d.data_fim || d.cancelada_em || agora)) }),
      cancelada_em: null, cancelada_por: null, motivo_cancelamento: null,
      informacoes: info, atualizado_em: agora,
    }).eq('id', d.id);
    setSalvando(false);
    if (error) { alert('Não foi possível reabrir: ' + error.message); return; }
    setMostrarReabrir(false); setReabrirForm({ status: 'Pendente', motivo: '' });
    await reload(); onRefresh();
  };

  const cancelarDemanda = async () => {
    if (!motivoCancelar.trim()) { alert('Informe o motivo do cancelamento.'); return; }
    setSalvando(true);
    const agora = new Date().toISOString();
    const infoAtual = [...(d.informacoes || []), {
      tipo: 'cancelamento', usuario: currentUser?.nome || '', data: agora,
      texto: `Demanda cancelada — Motivo: ${motivoCancelar.trim()}`,
    }];
    const { error } = await supabase.from('demandas_avulsas').update({
      status: 'Cancelada', cancelada_em: agora, cancelada_por: currentUser?.nome || currentUser?.email || null,
      motivo_cancelamento: motivoCancelar.trim(), informacoes: infoAtual, atualizado_em: agora,
      ...(d.data_inicio && !temEtapas ? { trechos: fecharTrecho(d, new Date(agora)) } : {}),   // pausa e horas úteis (16/10/2026): cancelar para o relógio
    }).eq('id', d.id);
    setSalvando(false);
    if (error) { alert('Não foi possível cancelar: ' + error.message); return; }
    if (d.responsavel_nome && d.responsavel_nome !== currentUser?.nome) {
      notificarEvento('demanda_criada_setor', `*Demanda cancelada* — ${d.titulo}\nSetor: ${d.setor}\nMotivo: ${motivoCancelar.trim()}\nPor: ${currentUser?.nome || ''}`, d.setor);
    }
    setMostrarCancelar(false); setMotivoCancelar('');
    await reload(); onRefresh();
  };

  // ── Salvar edição básica ─────────────────────────────────────────────────
  const salvarEdicao = async () => {
    // 7.x (16/10/2026): título vazio era gravado (a demanda ficava sem nome na lista) e a gravação recusada fechava a edição como se tivesse salvo (e ainda avisava as @menções)
    if (!String(editForm.titulo || '').trim()) { alert('Informe o título!'); return; }
    setSalvando(true);
    const salvou = await gravarDemanda({
      ...editForm,
      ...camposDosVinculos(vinculos),
      itens: itensPreenchidos(itensEdit),
      atualizado_em: new Date().toISOString(),
    }, 'salvar as alterações');
    if (!salvou) { setSalvando(false); return; }
    for (const [campo, texto] of [['descricao', editForm.descricao], ['observacoes', editForm.observacoes]]) {
      if (texto?.trim()) {
        await salvarMencoes({
          texto,
          mencionanteId:     String(currentUser?.id || currentUser?.email || ''),
          mencionanteNome:   currentUser?.nome || '',
          contexto:          'demanda_avulsa',
          contextoId:        String(d.id),
          contextoDescricao: d.titulo || 'Demanda Avulsa',
          campo,
          abaDestino:        (d.setor || 'engenharia').toLowerCase(),
        });
      }
    }
    setEditando(false);
    await reload();
    setSalvando(false);
    onRefresh();
  };

  // ── Designar responsável (somente demandas simples) ──────────────────────
  const salvarDesignar = async () => {
    if (!designarForm.responsavel_nome.trim()) { alert('Informe o responsável!'); return; }
    if (!designarForm.prazo) { alert('Informe o prazo!'); return; }
    setSalvando(true);
    const designou = await gravarDemanda({
      responsavel_nome: designarForm.responsavel_nome,
      responsavel_email: designarForm.responsavel_email,
      prazo: dateToISO(designarForm.prazo),
      atualizado_em: new Date().toISOString(),
    }, 'designar o responsável');
    if (!designou) { setSalvando(false); return; }
    setMostrarDesignar(false);
    await reload();
    setSalvando(false);
    onRefresh();
  };

  // ── Reprogramar prazo ────────────────────────────────────────────────────
  const salvarReprogramar = async () => {
    if (!reprogramarForm.nova_data) { alert('Informe a nova data!'); return; }
    setSalvando(true);
    const agora = new Date().toISOString();
    const entrada = {
      tipo: 'reprogramacao',
      prazo_anterior: d.prazo,
      novo_prazo: dateToISO(reprogramarForm.nova_data),
      motivo: reprogramarForm.motivo || '',
      usuario: currentUser?.nome || '',
      data: agora,
      texto: `Prazo reprogramado de ${fmtDate(d.prazo)} → ${fmtDate(reprogramarForm.nova_data)}${reprogramarForm.motivo ? ` — Motivo: ${reprogramarForm.motivo}` : ''}`,
    };
    const infoAtual = [...(d.informacoes || []), entrada];
    const reprogramou = await gravarDemanda({
      prazo: dateToISO(reprogramarForm.nova_data),
      informacoes: infoAtual,
      atualizado_em: agora,
    }, 'reprogramar o prazo');
    if (!reprogramou) { setSalvando(false); return; }
    setReprogramarForm({ nova_data: '', motivo: '' });
    setMostrarReprogramar(false);
    await reload();
    setSalvando(false);
    onRefresh();
  };

  // ── Ações da demanda simples ─────────────────────────────────────────────
  const iniciar = async () => {
    const ag = new Date();
    if (!await confirmarAbertura('Marcar início da execução agora?', 'iniciar a execução', ag)) return;
    const agora = ag.toISOString();
    // pausa e horas úteis (16/10/2026): iniciar abre o primeiro trecho; fora do expediente conta como hora extra e fica no histórico
    if (!await gravarDemanda({
      status: 'Em Andamento', data_inicio: agora, atualizado_em: agora, trechos: abrirTrecho({ trechos: [] }, ag, currentUser?.nome || ''),
      ...(dentroDoExpediente(ag) ? {} : { informacoes: [...(d.informacoes || []), entradaDoRelogio('inicio', currentUser?.nome || '', ag)] }),
    }, 'marcar o início da execução')) return;
    await reload(); onRefresh();
  };
  // Pausar e retomar a demanda simples (16/10/2026): lê a demanda AGORA antes de gravar (duas pessoas não apagam o registro uma da outra) e só grava se o estado ainda for o que a tela mostrava
  const mudarRelogio = async (tipo: 'pausa' | 'retomada') => {
    const ag = new Date();
    const verbo = tipo === 'pausa' ? 'pausar' : 'retomar';
    if (tipo === 'retomada' && !await confirmarAbertura('Retomar a execução agora?', 'retomar a execução', ag)) return;
    setSalvando(true);
    const { data: fresca, error: erroLer } = await supabase.from('demandas_avulsas').select('trechos,data_inicio,data_fim,status,informacoes').eq('id', d.id).maybeSingle();
    if (erroLer || !fresca) { setSalvando(false); alert(`Não foi possível ${verbo} a execução: ${erroLer?.message || 'a demanda não foi encontrada'}. Nada foi alterado.`); return; }
    if (fresca.status !== 'Em Andamento') { setSalvando(false); alert(`Não foi possível ${verbo} a execução: a demanda não está mais em andamento. Atualize a tela.`); await reload(); return; }
    const rodando = situacaoDoRelogio(fresca, ag) === 'rodando';
    if ((tipo === 'pausa') === rodando) {
      const gravou = await gravarDemanda({
        trechos: tipo === 'pausa' ? fecharTrecho(fresca, ag) : abrirTrecho(fresca, ag, currentUser?.nome || ''),
        ...(tipo === 'retomada' && !fresca.data_inicio ? { data_inicio: ag.toISOString() } : {}),
        informacoes: [...(fresca.informacoes || []), entradaDoRelogio(tipo, currentUser?.nome || '', ag)], atualizado_em: ag.toISOString(),
      }, `${verbo} a execução`);
      if (!gravou) { setSalvando(false); return; }
    }   // se outra pessoa já tinha pausado (ou retomado), a tela só se atualiza
    setSalvando(false);
    await reload(); onRefresh();
  };
  const concluir = async () => {
    const vaiPintar = ehSerralheria(d.setor) && d.pintura && !d.pintura_pedido_id;
    if (!await confirmar(`Concluir a demanda "${d.titulo}"? Ela sai da lista de ativas.${
      vaiPintar ? '\n\nComo esta peça tem pintura, o pedido do serviço será aberto para o Compras.' : ''}`)) return;
    const agora = new Date().toISOString();
    // 7.x (16/10/2026): conclusão recusada não abre o pedido de pintura (a peça ainda não estava concluída) nem diz "demanda concluída"
    // pausa e horas úteis (16/10/2026): concluir fecha o trecho aberto (se estava pausada, o tempo já estava fechado)
    const { data: fresca, error: erroLer } = await supabase.from('demandas_avulsas').select('trechos,data_inicio,data_fim').eq('id', d.id).maybeSingle();
    if (erroLer || !fresca) { alert(`Não foi possível ler a demanda antes de concluir: ${erroLer?.message || 'demanda não encontrada'}. Nada foi alterado.`); return; }
    if (!await gravarDemanda({ status: 'Concluída', data_fim: agora, atualizado_em: agora, ...(fresca.data_inicio ? { trechos: fecharTrecho(fresca, new Date(agora)) } : {}) }, 'concluir a demanda')) return;
    if (vaiPintar) {
      const r = await abrirPedidoPintura(d, currentUser);
      if (r?.erro) alert('Demanda concluída, mas não foi possível abrir o pedido de pintura: ' + r.erro);
    }
    await reload(); onRefresh();
  };

  // ── Atualizar etapa individual ───────────────────────────────────────────
  // 7.x (16/10/2026): a demanda é lida de novo ANTES de gravar (duas pessoas agindo em etapas diferentes apagavam o trabalho uma da outra: cada uma regravava a lista inteira a partir do
  // que tinha na tela) e a gravação recusada avisa e devolve false — nada depois dela (pedido de pintura, limpar o formulário) acontece. `patch` pode ser uma função da etapa já lida.
  const updateEtapa = async (idx: number, patch: any, opcoes?: { informacao?: any }): Promise<boolean> => {
    const { data: fresca, error: erroLer } = await supabase.from('demandas_avulsas').select('etapas,status,data_inicio,informacoes').eq('id', d.id).maybeSingle();
    if (erroLer || !fresca) { alert('Não foi possível ler a demanda antes de gravar a etapa: ' + (erroLer?.message || 'demanda não encontrada') + '. Nada foi alterado.'); return false; }
    const etapas = [...(fresca.etapas || [])];
    if (!etapas[idx]) { alert('Não foi possível gravar: esta etapa não existe mais. Atualize a tela e confira.'); return false; }
    etapas[idx] = { ...etapas[idx], ...(typeof patch === 'function' ? patch(etapas[idx]) : patch) };
    // Recalcula status geral
    const novoStatus = calcStatusEtapas(etapas);
    const agora = new Date().toISOString();
    const upd: any = { etapas, atualizado_em: agora };
    // pausa e horas úteis (16/10/2026): pausar, retomar e iniciar fora do expediente ficam no histórico geral da demanda, com quem fez e quando
    if (opcoes?.informacao) upd.informacoes = [...(fresca.informacoes || []), opcoes.informacao];
    if (novoStatus !== fresca.status) {
      upd.status = novoStatus;
      if (novoStatus === 'Em Andamento' && !fresca.data_inicio) upd.data_inicio = agora;
      if (novoStatus === 'Concluída') upd.data_fim = agora;
    }
    if (!await gravarDemanda(upd, 'gravar a etapa')) return false;
    if (upd.status === 'Concluída' && ehSerralheria(d.setor) && d.pintura && !d.pintura_pedido_id) {
      const r = await abrirPedidoPintura(d, currentUser);
      if (r?.erro) alert('Demanda concluída, mas não foi possível abrir o pedido de pintura: ' + r.erro);
    }
    await reload(); onRefresh();
    return true;
  };

  // ── Nova informação ──────────────────────────────────────────────────────
  const adicionarInfo = async () => {
    if (!novaInfo.trim()) return;
    setSalvando(true);
    const lista = [...(d.informacoes || []), { texto: novaInfo, usuario: currentUser?.nome, data: new Date().toISOString() }];
    // 7.x (16/10/2026): informação recusada fica na caixa e as @menções NÃO saem (avisavam alguém de uma informação que não foi gravada)
    if (!await gravarDemanda({ informacoes: lista, atualizado_em: new Date().toISOString() }, 'registrar a informação')) { setSalvando(false); return; }
    await salvarMencoes({
      texto:             novaInfo,
      mencionanteId:     String(currentUser?.id || currentUser?.email || ''),
      mencionanteNome:   currentUser?.nome || '',
      contexto:          'demanda_avulsa',
      contextoId:        String(d.id),
      contextoDescricao: d.titulo || 'Demanda Avulsa',
      campo:             'informacao_geral',
      abaDestino:        (d.setor || 'engenharia').toLowerCase(),
    });
    setNovaInfo('');
    await reload();
    setSalvando(false);
  };

  // ── Upload de arquivo ────────────────────────────────────────────────────
  const uploadFiles = async (files: FileList) => {
    setSalvando(true);
    const falhas: string[] = [];
    // a lista de arquivos some quando o campo é limpo: copia antes
    const lista = Array.from(files);
    for (const f of lista) {
      const r = await uploadAnexo(f, d.id);
      if (!r.url) { falhas.push(f.name + ' (' + r.erro + ')'); continue; }
      const { error: erroIns } = await supabase.from('demanda_avulsa_anexos').insert([{
        demanda_id: d.id, nome: f.name, url: r.url,
        tipo: f.type.startsWith('image/') ? 'foto' : 'documento',
        criado_por: currentUser?.nome,
      }]);
      if (erroIns) falhas.push(f.name + ' (enviado, mas não registrado na demanda: ' + erroIns.message + ')');
    }
    if (fileRef.current) fileRef.current.value = '';
    await reload();
    setSalvando(false);
    if (falhas.length) alert('Não foi possível anexar estes arquivos:\n\n' + falhas.join('\n'));   // "não foi possível" deixa o aviso vermelho, que só fecha quando a pessoa fecha (Feedback.tsx)
  };

  const excluirAnexo = async (id: string) => {
    if (!await confirmar('Remover este arquivo?')) return;
    const { error } = await supabase.from('demanda_avulsa_anexos').delete().eq('id', id);
    if (error) { alert('Não foi possível remover o arquivo: ' + error.message); return; }   // 7.x (16/10/2026): antes seguia como se tivesse removido
    await reload();
  };

  const alerta = alertClass(d.prazo, d.status);
  const diasV = diasParaVencer(d.prazo);

  // Progresso de etapas
  const etapas: any[] = d.etapas || [];
  const etapasConcluidas = etapas.filter(e => e.status === 'Concluída').length;
  const pct = etapas.length > 0 ? Math.round((etapasConcluidas / etapas.length) * 100) : 0;

  // pausa e horas úteis (16/10/2026): em que pé está o relógio da demanda simples e quanto já se trabalhou (a composta soma o tempo das etapas)
  const sitRelogio = !temEtapas && d.status === 'Em Andamento' ? situacaoDoRelogio(d, agora) : 'parada';   // demanda cancelada ou concluída não tem relógio
  const tempoDemanda = temEtapas ? tempoDasEtapas(etapas, agora) : tempoEmTexto(d, agora);

  // Quantas ações a barra mostra (decidido na migração visual, 16/10/2026): com duas ou mais ela é um seletor em pílulas — o visual que o repintor já dava a esses botões soltos —
  // e as ações "do momento" (iniciar, concluir, designar, reprogramar, gerar pedido) ganham a pílula branca; com uma só, o botão fica sozinho, sem o trilho.
  const acoesDaBarra = [
    !temEtapas && (d.status === 'Pendente' || d.status === 'Em Andamento'),
    !temEtapas && d.status === 'Em Andamento',   // Pausar ou Retomar
    !temEtapas && d.status !== 'Cancelada',
    !ENCERRADA(d.status),
    d.status !== 'Cancelada',
    camposSetor.valorItens && !d.pedido_compra_id && ehComprador(currentUser, d) && !ENCERRADA(d.status),
    ehAdmin && ENCERRADA(d.status),
    podeCancelar(d, currentUser),
  ].filter(Boolean).length;

  return (
    <div className="acn-dav-det-1"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="acn-dav-det-2">

        {/* Header */}
        <div className={'acn-dav-det-cab st-' + chaveStatus(d.status)}>
          <div className="acn-dav-g-2">
            <div className="acn-dav-det-3">{d.status.toUpperCase()}{sitRelogio === 'pausada' || sitRelogio === 'pausada-auto' ? ' (PAUSADA)' : ''} · {d.prioridade}</div>
            <div className="acn-dav-det-4">{d.titulo}</div>
            {temEtapas ? (
              <div className="acn-dav-det-5">
                {etapasConcluidas}/{etapas.length} etapas concluídas
              </div>
            ) : (
              d.responsavel_nome && <div className="acn-dav-det-6">👤 {d.responsavel_nome}</div>
            )}
          </div>
          <Botao className="acn-dav-b acn-dav-det-7" onClick={onClose}>✕</Botao>
        </div>

        {/* Barra de progresso (etapas múltiplas) */}
        {temEtapas && (
          <div className="acn-dav-det-8">
            <div className="acn-dav-det-prog-fill" style={{ width: `${pct}%` }} />
          </div>
        )}

        {/* Alertas de prazo */}
        {alerta && (
          <div className={'acn-dav-det-alerta al-' + alerta}>
            {alerta === 'vencida' ? '🔴 TAREFA VENCIDA' : `🟡 Vence em ${diasV} dia${diasV === 1 ? '' : 's'}`} — {fmtDate(d.prazo)}
          </div>
        )}

        {/* Barra de ações */}
        <div className={'acn-dav-det-9' + (acoesDaBarra >= 2 ? ' acn-pilulas' : '')}>
          {!temEtapas && d.status === 'Pendente' && (
            <Botao className="acn-dav-b acn-dav-det-10 ativa" onClick={iniciar}>
              ▶ Iniciar Execução
            </Botao>
          )}
          {!temEtapas && d.status === 'Em Andamento' && (
            <Botao className="acn-dav-b acn-dav-det-11 ativa" onClick={concluir}>
              ✓ Concluir
            </Botao>
          )}
          {!temEtapas && d.status === 'Em Andamento' && (sitRelogio === 'rodando'
            ? <Botao className="acn-dav-b acn-dav-bt-pausar" onClick={() => mudarRelogio('pausa')} disabled={salvando}>⏸ Pausar</Botao>
            : <Botao className="acn-dav-b acn-dav-bt-retomar ativa" onClick={() => mudarRelogio('retomada')} disabled={salvando}>▶ Retomar</Botao>)}
          {!temEtapas && d.status !== 'Cancelada' && (
            <Botao onClick={() => setMostrarDesignar(v => !v)}
              className={'acn-dav-b acn-dav-bt-designar' + (mostrarDesignar ? '' : ' ativa')}>
              👤 {d.responsavel_nome ? 'Reatribuir' : 'Designar'}
            </Botao>
          )}
          {!ENCERRADA(d.status) && (
            <Botao onClick={() => { setMostrarReprogramar(v => !v); setMostrarDesignar(false); setEditando(false); }}
              className={'acn-dav-b acn-dav-bt-reprogramar' + (mostrarReprogramar ? '' : ' ativa')}>
              📅 Reprogramar
            </Botao>
          )}
          {d.status !== 'Cancelada' && (
            <Botao onClick={() => { setEditando(v => !v); setMostrarDesignar(false); setMostrarReprogramar(false); }}
              className={'acn-dav-b acn-dav-bt-editar' + (acoesDaBarra === 1 ? ' solo' : '')}>
              ✏️ Editar
            </Botao>
          )}
          {camposSetor.valorItens && !d.pedido_compra_id && ehComprador(currentUser, d) && !ENCERRADA(d.status) && (
            <Botao className="acn-dav-b acn-dav-det-11 ativa" onClick={gerarPedidoCompra} disabled={salvando}
              title="Leva esta demanda para o fluxo de compra: Mesa de Cotações (com desconto), aprovação, OC e valor gasto">
              🛒 Gerar pedido de compra
            </Botao>
          )}
          {ehAdmin && ENCERRADA(d.status) && (
            <Botao onClick={() => setMostrarReabrir(v => !v)}
              title="Admin: volta a demanda concluída ou cancelada por engano"
              className={'acn-dav-b acn-dav-bt-reabrir' + (acoesDaBarra === 1 ? ' solo' : '')}>
              ↺ Reabrir
            </Botao>
          )}
          {podeCancelar(d, currentUser) && (
            <Botao onClick={() => { setMostrarCancelar(v => !v); setEditando(false); setMostrarDesignar(false); setMostrarReprogramar(false); }}
              className={'acn-dav-b ' + ('acn-dav-bt-cancelar' + (mostrarCancelar ? ' aberto' : ''))}>
              ✖ Cancelar demanda
            </Botao>
          )}
        </div>

        {d.status === 'Cancelada' && (
          <div className="acn-dav-det-12">
            <strong>Cancelada</strong> por {d.cancelada_por || '—'} em {fmtDT(d.cancelada_em)}{d.motivo_cancelamento ? ` — ${d.motivo_cancelamento}` : ''}
          </div>
        )}

        <div className="acn-dav-det-13">

          {/* ── Demanda composta e envolvidos (08/10/2026) ── */}
          {erroLeitura && (
            <Faixa tom="erro">Não foi possível atualizar esta demanda ({erroLeitura}). O que aparece pode estar desatualizado: feche e abra de novo.</Faixa>
          )}
          {!temEtapas && d.status === 'Em Andamento' && <FaixaDoRelogio item={d} agora={agora} />}
          <GrupoDaDemanda demanda={d} />
          <MembrosDaDemanda demanda={d} currentUser={currentUser} podeEditar={!ENCERRADA(d.status) && podeMexerNaDemanda}
            onSaved={() => { reload(); onRefresh(); }} />

          {/* ── Centro de custo (setor Compras) ── */}
          {camposSetor.centroCusto && (
            <div className="acn-dav-det-14">
              <span className="acn-dav-det-15">🏷️ Centro de custo</span>
              {editando || (!d.centro_custo && ehComprador(currentUser, d) && !ENCERRADA(d.status))
                ? <CentroCustoSelect value={d.centro_custo_id} onChange={gravarCentroCusto} style={{ flex:1, minWidth:180, fontSize:11 }} />
                : <span className={'acn-dav-cc-txt' + (d.centro_custo ? '' : ' vazio')}>{d.centro_custo || 'não informado'}</span>}
              {!d.centro_custo && !editando && !ehComprador(currentUser, d) && (
                <span className="acn-dav-det-16">o comprador pode completar</span>
              )}
            </div>
          )}

          {/* ── Reabrir (Admin) ── */}
          {mostrarReabrir && (
            <div className="acn-dav-det-17">
              <div className="acn-dav-g-3">↺ REABRIR DEMANDA ({d.status})</div>
              <div className="acn-dav-det-18">
                <select className="acn-dav-det-19" value={reabrirForm.status} onChange={e => setReabrirForm(f => ({ ...f, status: e.target.value }))} aria-label="Voltar para">
                  <option value="Pendente">Voltar para Pendente</option>
                  <option value="Em Andamento">Voltar para Em Andamento</option>
                </select>
                <input className="acn-dav-det-20" value={reabrirForm.motivo} onChange={e => setReabrirForm(f => ({ ...f, motivo: e.target.value }))} aria-label="Motivo da reabertura"
                  placeholder="Motivo (ex.: concluída sem querer)" />
              </div>
              <div className="acn-dav-det-21">
                <Botao className="acn-dav-b acn-dav-det-22" onClick={reabrirDemanda} disabled={salvando}>
                  {salvando ? '...' : 'Confirmar reabertura'}
                </Botao>
                <Botao className="acn-dav-b acn-dav-det-23" onClick={() => setMostrarReabrir(false)}>Voltar</Botao>
              </div>
            </div>
          )}

          {/* ── Pedido de compra gerado desta demanda ── */}
          {pedidoCompra && (
            <div className="acn-dav-det-24" onClick={() => abrirVinculo({ tipo: 'compra', id: pedidoCompra.id, descricao: pedidoCompra.numero_pedido })} role="link" tabIndex={0}>
              <strong className="acn-dav-det-25">🛒 {pedidoCompra.numero_pedido}</strong>
              {pedidoCompra.numero_oc && <span className="acn-dav-det-26">{pedidoCompra.numero_oc}</span>}
              <span className="acn-badge acn-dav-det-27">{pedidoCompra.status_compra}</span>
              {pedidoCompra.fornecedor && <span>{pedidoCompra.fornecedor}</span>}
              {pedidoCompra.valor_compra != null && <strong>{Number(pedidoCompra.valor_compra).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })}</strong>}
              <span className="acn-dav-det-28">abrir em Compras →</span>
            </div>
          )}

          {/* ── Cancelar demanda ── */}
          {mostrarCancelar && (
            <div className="acn-dav-det-29">
              <div className="acn-dav-det-30">✖ CANCELAR DEMANDA</div>
              <label className="acn-dav-det-31">MOTIVO *</label>
              <input className="acn-dav-det-32" value={motivoCancelar} onChange={e=>setMotivoCancelar(e.target.value)} autoFocus aria-label="Motivo do cancelamento"
                placeholder="Ex.: não é mais necessária, aberta em duplicidade..." />
              <div className="acn-dav-det-21">
                <Botao className="acn-dav-b acn-dav-det-33" onClick={cancelarDemanda} disabled={salvando}>
                  {salvando ? '...' : 'Confirmar cancelamento'}
                </Botao>
                <Botao className="acn-dav-b acn-dav-det-23" onClick={() => setMostrarCancelar(false)}>
                  Voltar
                </Botao>
              </div>
            </div>
          )}

          {/* ── Formação de preço da demanda: vincula e tira direto no detalhe, sem o Editar (pedido do usuário em 16/10/2026) ── */}
          {!editando && (
            <FormacaoDaDemanda demanda={d} currentUser={currentUser} podeMexer={d.status !== 'Cancelada'}
              onMudou={async () => { await reload(); onRefresh(); }} />
          )}

          {/* ── Vínculos (várias OPs, lote, outros processos) — a formação de preço tem o bloco próprio, logo acima ── */}
          {!editando && <VinculosView vinculos={vinculos.filter(v => v.tipo !== 'formacao')} />}

          {/* ── Pintura pedida (Serralheria): quem abriu definiu, aqui é leitura ── */}
          {!editando && camposSetor.pintura && d.pintura && (
            <PinturaCampos valor={d} onChange={() => {}} somenteLeitura />
          )}

          {/* ── Itens da demanda ── */}
          {!editando && (
            <ItensDemandaView itens={d.itens || []} mostrarValor={!!camposSetor.valorItens}
              onSalvarValores={camposSetor.valorItens && ehComprador(currentUser, d) && !ENCERRADA(d.status) ? async (novos) => {
                const { error } = await supabase.from('demandas_avulsas')
                  .update({ itens: novos, atualizado_em: new Date().toISOString() }).eq('id', d.id);
                if (error) { alert('Não foi possível salvar os valores: ' + error.message); return; }
                await reload(); onRefresh();
              } : undefined} />
          )}

          {/* ── Designar responsável (demanda simples) ── */}
          {mostrarDesignar && !temEtapas && (
            <div className="acn-dav-det-34">
              <div className="acn-dav-det-35">👤 DESIGNAR RESPONSÁVEL</div>
              <div className="acn-dav-det-36">
                <div>
                  <label className="acn-dav-det-31">NOME *</label>
                  <ColaboradorSelect className="acn-dav-det-37" value={designarForm.responsavel_nome}
                    onChange={v=>setDesignarForm(f=>({...f,responsavel_nome:v}))}
                    incluirUsuariosDaAba={abaDoSetor(initial.setor)}
                    departamentos={departamentosDoSetor(initial.setor)}
                    placeholder="Selecione" />
                </div>
                <div>
                  <label className="acn-dav-det-31">E-MAIL</label>
                  <input className="acn-dav-det-37" type="email" value={designarForm.responsavel_email} onChange={e=>setDesignarForm(f=>({...f,responsavel_email:e.target.value}))} />
                </div>
              </div>
              <div className="acn-dav-g-4">
                <label className="acn-dav-det-31">PRAZO *</label>
                <input className="acn-dav-det-37" type="date" value={designarForm.prazo} onChange={e=>setDesignarForm(f=>({...f,prazo:e.target.value}))} />
              </div>
              <div className="acn-dav-det-21">
                <Botao className="acn-dav-b acn-dav-det-38" onClick={salvarDesignar} disabled={salvando}>
                  {salvando ? '...' : '✓ Salvar'}
                </Botao>
                <Botao className="acn-dav-b acn-dav-det-23" onClick={() => setMostrarDesignar(false)}>
                  Cancelar
                </Botao>
              </div>
            </div>
          )}

          {/* ── Reprogramar prazo ── */}
          {mostrarReprogramar && (
            <div className="acn-dav-det-39">
              <div className="acn-dav-det-40">📅 REPROGRAMAR PRAZO</div>
              <div className="acn-dav-det-41">
                Prazo atual: <strong className={'acn-dav-prazo' + (alerta === 'vencida' ? ' al-vencida' : '')}>{fmtDate(d.prazo)}</strong>
              </div>
              <div className="acn-dav-det-36">
                <div>
                  <label className="acn-dav-det-31">NOVA DATA *</label>
                  <input className="acn-dav-det-42" type="date" value={reprogramarForm.nova_data} onChange={e=>setReprogramarForm(f=>({...f,nova_data:e.target.value}))}
                    min={hojeISO()} />
                </div>
                <div>
                  <label className="acn-dav-det-31">MOTIVO</label>
                  <input className="acn-dav-det-42" value={reprogramarForm.motivo} onChange={e=>setReprogramarForm(f=>({...f,motivo:e.target.value}))}
                    placeholder="Ex: cliente solicitou, aguardando peça..." />
                </div>
              </div>
              <div className="acn-dav-det-21">
                <Botao className="acn-dav-b acn-dav-det-43" onClick={salvarReprogramar} disabled={salvando}>
                  {salvando ? '...' : '✓ Confirmar'}
                </Botao>
                <Botao className="acn-dav-b acn-dav-det-23" onClick={() => setMostrarReprogramar(false)}>
                  Cancelar
                </Botao>
              </div>
            </div>
          )}

          {/* ── Editar dados básicos ── */}
          {editando && (
            <div className="acn-dav-det-44">
              <div className="acn-dav-det-45">✏️ EDITAR</div>
              <div className="acn-dav-g-5">
                <div>
                  <label className="acn-dav-det-31">TÍTULO</label>
                  <input className="acn-dav-det-46" value={editForm.titulo} onChange={e=>setEditForm(f=>({...f,titulo:e.target.value}))} />
                </div>
                <div>
                  <label className="acn-dav-det-31">DESCRIÇÃO</label>
                  <MencaoTextarea className="acn-dav-g-6" value={editForm.descricao} onChange={v=>setEditForm(f=>({...f,descricao:v}))} rows={2} />
                </div>
                <div>
                  <label className="acn-dav-det-31">PRIORIDADE</label>
                  <div className="acn-dav-g-7">
                    {['Alta','Média','Baixa'].map(p => (
                      <Botao key={p} onClick={() => setEditForm(f=>({...f,prioridade:p}))}
                        className={'acn-dav-b ' + ('acn-dav-prio-ed prio-' + chavePrio(p) + (editForm.prioridade === p ? ' sel' : ''))}>
                        {p}
                      </Botao>
                    ))}
                  </div>
                </div>
                <ItensDemandaEditor itens={itensEdit} onChange={setItensEdit} comValor={!!camposSetor.valorItens} comFornecedor={!!camposSetor.valorItens}
                  categoriaPreferida={CATEGORIA_DO_SETOR[d.setor] || ''} />
                <div>
                  <label className="acn-dav-det-31">VÍNCULOS (OPCIONAL)</label>
                  <VinculosEditor vinculos={vinculos} onChange={setVinculos} tipos={TIPOS_PADRAO} />
                </div>
                <div>
                  <label className="acn-dav-det-31">OBSERVAÇÕES</label>
                  <MencaoTextarea className="acn-dav-g-6" value={editForm.observacoes} onChange={v=>setEditForm(f=>({...f,observacoes:v}))} rows={3} />
                </div>
                <div className="acn-dav-det-21">
                  <Botao className="acn-dav-b acn-dav-det-47" onClick={salvarEdicao} disabled={salvando}>
                    {salvando ? '...' : '✓ Salvar'}
                  </Botao>
                  <Botao className="acn-dav-b acn-dav-det-23" onClick={() => setEditando(false)}>
                    Cancelar
                  </Botao>
                </div>
              </div>
            </div>
          )}

          {/* ── Info principal (demanda simples) ── */}
          {!editando && !temEtapas && (
            <div className="acn-dav-det-48">
              <InfoBlock label="Prazo" value={fmtDate(d.prazo)} alert={alerta} />
              <InfoBlock label="Prioridade" value={d.prioridade} tom={'prio-' + chavePrio(d.prioridade)} />
              <InfoBlock label="Início Execução" value={fmtDT(d.data_inicio)} />
              <InfoBlock label="Conclusão" value={fmtDT(d.data_fim)} />
              {d.data_inicio && (
                <InfoBlock label={d.data_fim ? 'Tempo trabalhado (horas úteis)' : 'Trabalhado até agora (horas úteis)'} value={tempoDemanda.uteis} tom="info" />
              )}
              {d.data_inicio && tempoDemanda.extras && (
                <InfoBlock label="Hora extra" value={tempoDemanda.extras} tom="info" />
              )}
              <InfoBlock label="Criado por" value={`${d.criado_por_nome} · ${fmtDT(d.criado_em)}`} />
              {d.descricao && <div className="acn-dav-det-49"><InfoBlock label="Descrição" value={<Linkify text={d.descricao} />} /></div>}
              {d.observacoes && <div className="acn-dav-det-49"><InfoBlock label="Observações" value={<Linkify text={d.observacoes} />} /></div>}
            </div>
          )}

          {/* ── ETAPAS MÚLTIPLAS ── */}
          {temEtapas && !editando && (
            <div>
              <div className="acn-dav-det-50">
                <span>📋 Etapas ({etapasConcluidas}/{etapas.length} concluídas){tempoDemanda.totalMs > 0 ? ` · ${tempoDemanda.uteis} trabalhadas${tempoDemanda.extras ? ` + ${tempoDemanda.extras} de hora extra` : ''}` : ''}</span>
                <span className={'acn-dav-pct' + (pct === 100 ? ' ok' : '')}>{pct}%</span>
              </div>
              {etapas.map((e, i) => (
                <EtapaCard key={i} etapa={e} idx={i} total={etapas.length} onUpdate={updateEtapa} currentUser={currentUser} demandaId={d.id} agora={agora} />
              ))}
            </div>
          )}

          {/* ── Nova Informação ── */}
          <div className="acn-dav-det-51">
            <div className="acn-dav-g-3">📝 NOVA INFORMAÇÃO GERAL</div>
            <MencaoTextarea className="acn-dav-det-52"
              value={novaInfo}
              onChange={setNovaInfo}
              rows={3}
              placeholder="Atualização geral, ocorrência, decisão... use @Nome para mencionar"
            />
            <div className="acn-dav-g-1">
              <Botao className="acn-dav-b acn-dav-det-22" onClick={adicionarInfo} disabled={salvando || !novaInfo.trim()}>
                {salvando ? '...' : '+ Adicionar'}
              </Botao>
              <label className="acn-dav-det-53">
                📎 Anexar arquivo
                <input className="acn-dav-det-54" type="file" multiple ref={fileRef}
                  onChange={e => { if (e.target.files?.length) uploadFiles(e.target.files); }} />
              </label>
            </div>
          </div>

          {/* ── Informações anteriores ── */}
          {(d.informacoes || []).length > 0 && (
            <div>
              <div className="acn-dav-det-55">
                Histórico ({d.informacoes.length})
              </div>
              {[...(d.informacoes || [])].reverse().map((info: any, i: number) => {
                const isReprog = info.tipo === 'reprogramacao';
                return (
                  <div key={i} className={'acn-dav-hist' + (isReprog ? ' reprog' : '')}>
                    <div className="acn-dav-det-56">
                      {isReprog && <span className="acn-dav-det-57">📅 REPROGRAMAÇÃO</span>}
                      {info.usuario} · {fmtDT(info.data)}
                    </div>
                    <div className={'acn-dav-hist-txt' + (isReprog ? ' reprog' : '')}>{info.texto}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Anexos ── */}
          {anexos.length > 0 && (
            <div>
              <div className="acn-dav-det-55">
                Arquivos ({anexos.length})
              </div>
              <div className="acn-dav-det-58">
                {anexos.map(a => (
                  <div className="acn-dav-det-59" key={a.id}>
                    <span className="acn-dav-det-60">{a.tipo === 'foto' ? '🖼️' : '📄'}</span>
                    <a className="acn-dav-det-61" href={a.url} target="_blank" rel="noreferrer">
                      {a.nome}
                    </a>
                    <span className="acn-dav-g-8">{a.criado_por}</span>
                    <Botao className="acn-dav-b acn-dav-det-62" onClick={() => excluirAnexo(a.id)}>✕</Botao>
                    <DescricaoDoAnexo anexo={a} pode={podeMexerNaDemanda || a.criado_por === currentUser?.nome} onSaved={reload} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ label, value, alert = null, tom = null }) {   // `tom` no lugar da cor escrita: "prio-alta", "info"…
  return (
    <div className="acn-dav-inf-1">
      <div className="acn-dav-inf-2">{label}</div>
      <div className={'acn-dav-inf-val' + (alert ? ' al-' + alert : tom ? ' ' + tom : '')}>
        {value}{alert === 'vencida' ? ' 🔴' : alert === 'urgente' ? ' 🟡' : ''}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL NOVA DEMANDA (com suporte a múltiplas etapas)
// ─────────────────────────────────────────────────────────────────────────────
const etapaVazia = (num: number) => ({
  num,
  responsavel_nome: '',
  responsavel_email: '',
  prazo: '',
  obs_criacao: '',
  obs_execucao: [],
  status: 'Pendente',
  data_inicio: null,
  data_fim: null,
  // Vínculo opcional dessa etapa específica a um processo (OP/OS/PV/Compra/OFI)
  // — independente do vínculo (também opcional) da demanda como um todo.
  vinculo_tipo: null,
  vinculo_id: null,
  vinculo_descricao: null,
});

export function NovaDemandaModal({ currentUser, setor, setoresDestino, vinculoInicial, origem, onClose, onSaved }: {
  currentUser: any;
  setor?: string;
  // Quando presente com mais de 1 opção, mostra um seletor "Setor de Destino"
  // no topo do form — substitui o antigo "Enviar Demanda para Setor" (botões
  // de setor + modal separado) por uma escolha dentro do mesmo formulário rico.
  setoresDestino?: string[];
  // Pré-preenche o vínculo ao abrir — usado pelo botão "+Demanda" por OPL
  // (PCPTab.tsx), que já sabe a qual OP a demanda deve ficar vinculada.
  vinculoInicial?: VinculoValue | null;
  // de onde foi aberta (ex.: 'engenharia'), gravado na demanda
  origem?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ titulo:'', descricao:'', prioridade:'Média', observacoes:'' });
  const [pintura, setPintura] = useState({ pintura: false, pintura_tipo: '' });
  const [setorAlvo, setSetorAlvo] = useState(setor || setoresDestino?.[0] || '');
  // 08/10/2026 (pedidos do usuário): (1) vários setores = demanda composta, com uma PARTE por setor; (2) colaboradores envolvidos, como no Trello; (3) descrição de cada anexo.
  const [setoresAlvo, setSetoresAlvo] = useState<string[]>([setor || setoresDestino?.[0] || '']);
  const [membros, setMembros] = useState<any[]>([]);
  const [descAnexos, setDescAnexos] = useState<Record<string, string>>({});
  const composta = setoresAlvo.length > 1;
  // Compras é uma solicitação de compra com formulário próprio: não se mistura com outros setores
  const alternarSetor = (s: string) => {
    if (s === 'Compras') { setSetoresAlvo(['Compras']); setSetorAlvo('Compras'); return; }
    const base = setoresAlvo.filter(x => x !== 'Compras');
    const novo = base.includes(s) ? base.filter(x => x !== s) : [...base, s];
    if (!novo.length) return;
    setSetoresAlvo(novo); setSetorAlvo(novo[0]);
    if (novo.length > 1) { setQtdEtapas(1); setEtapas(prev => prev.slice(0, 1)); }   // demanda composta: cada setor define o seu responsável; sem etapas internas
  };
  const [qtdEtapas, setQtdEtapas] = useState(1);
  const [etapas, setEtapas] = useState<any[]>([etapaVazia(1)]);
  const [vinculos, setVinculos] = useState<VinculoValue[]>(vinculoInicial ? [vinculoInicial] : []);
  const vinculo = vinculos[0] || null;
  const [itens, setItens] = useState<any[]>([itemVazio()]);
  // Compras: a solicitação é a mesma de todo o sistema (SolicitacaoCompra.tsx) — mesmo formulário e mesma gravação (05/10/2026)
  const [sc, setSc] = useState(() => solicitacaoCompraVazia({ vinculo: vinculoInicial || null }));
  const centroObrigatorio = useCentroObrigatorio(); // regra "exigir o centro de custo" (Etapa 15c)
  const [anexos, setAnexos] = useState<File[]>([]);   // foto, planilha, PDF... enviados junto com a demanda
  const [salvando, setSalvando] = useState(false);
  const [centroCustoId, setCentroCustoId] = useState<string | null>(null);
  const [centros, setCentros] = useState<any[]>([]);
  const campos = camposDoSetor(setorAlvo);
  useEffect(() => { if (campos.centroCusto && !centros.length) fetchCentrosCusto().then(setCentros); }, [campos.centroCusto]);
  const nomeCentro = (id: string | null) => {
    const c = centros.find((x: any) => x.id === id);
    return c ? `${c.codigo} — ${c.nome}` : null;
  };
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}));

  // Ajusta array de etapas quando qtd muda
  const mudarQtd = (n: number) => {
    const q = Math.max(1, Math.min(10, n));
    setQtdEtapas(q);
    setEtapas(prev => {
      const novo = [...prev];
      while (novo.length < q) novo.push(etapaVazia(novo.length + 1));
      return novo.slice(0, q);
    });
  };

  const setEtapa = (idx: number, k: string, v: string) => {
    setEtapas(prev => prev.map((e, i) => i === idx ? { ...e, [k]: v } : e));
  };

  const setEtapaVinculo = (idx: number, v: VinculoValue | null) => {
    setEtapas(prev => prev.map((e, i) => i === idx
      ? { ...e, vinculo_tipo: v?.tipo || null, vinculo_id: v?.id || null, vinculo_descricao: v?.descricao || null }
      : e));
  };

  const salvar = async () => {
    if (!setorAlvo) { alert('Selecione o setor de destino!'); return; }
    // Compras não tem mais lista própria de demanda: o pedido entra direto no quadro de Requisições, com cotação e aprovação
    // (decidido em 21/09/2026) — e, desde 05/10/2026, pelo MESMO formulário e pela MESMA gravação de toda solicitação de compra.
    if (setorAlvo === 'Compras') {
      const falta = validarSolicitacaoCompra(sc, centroObrigatorio);
      if (falta) { alert(falta); return; }
      setSalvando(true);
      const r: any = await enviarSolicitacaoCompra({ valor: sc, currentUser, origemSetor: origem || 'Demanda geral' });
      setSalvando(false);
      if (r.erro) { alert('Não foi possível abrir a requisição de compra: ' + r.erro); return; }
      if (r.errosAnexos?.length) alert('A requisição foi criada, mas houve falha ao enviar alguns anexos:\n\n' + r.errosAnexos.join('\n'));
      alert(`Requisição ${r.numero_pedido} aberta no quadro do Compras.`);
      onSaved(); onClose();
      return;
    }
    if (!form.titulo.trim()) { alert('Informe o título!'); return; }
    if (qtdEtapas > 1) {
      for (let i = 0; i < etapas.length; i++) {
        if (!etapas[i].responsavel_nome.trim()) { alert(`Informe o responsável da Etapa ${i+1}!`); return; }
        if (!etapas[i].prazo) { alert(`Informe o prazo da Etapa ${i+1}!`); return; }
      }
    }
    setSalvando(true);
    const agora = new Date().toISOString();
    const emails = await emailsDosResponsaveis(etapas.map(e => e.responsavel_nome));
    const payload: any = {
      ...form,
      setor: setorAlvo,
      status: 'Pendente',
      informacoes: [],
      itens: itensPreenchidos(itens),
      origem: origem || null,
      etapas: qtdEtapas > 1 ? etapas.map(e => ({
        ...e,
        responsavel_email: e.responsavel_email || emails[e.responsavel_nome] || '',
        prazo: e.prazo ? dateToISO(e.prazo) : null,
      })) : [],
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
      criado_em: agora,
      atualizado_em: agora,
      // Vínculos são opcionais: várias OPs, o lote inteiro ou outros processos
      ...camposDosVinculos(vinculos),
      // campo do setor: Compras aponta o centro de custo
      centro_custo_id: campos.centroCusto ? centroCustoId : null,
      centro_custo: campos.centroCusto ? nomeCentro(centroCustoId) : null,
      // campo do setor: Serralheria diz se a peça vai pintura (e qual)
      pintura: campos.pintura ? !!pintura.pintura : false,
      pintura_tipo: campos.pintura && pintura.pintura ? (pintura.pintura_tipo || '').trim() || null : null,
    };
    // Para demanda simples, deixa campos no nível raiz vazios
    if (qtdEtapas === 1) {
      payload.responsavel_nome = etapas[0].responsavel_nome || null;
      payload.responsavel_email = etapas[0].responsavel_email || emails[etapas[0].responsavel_nome] || null;
      payload.prazo = etapas[0].prazo ? dateToISO(etapas[0].prazo) : null;
    }
    // 08/10/2026: demanda para vários setores = uma PARTE por setor (linha própria em demandas_avulsas), ligadas pelo mesmo grupo_id; uma só = como sempre
    const alvos = composta ? setoresAlvo : [setorAlvo];
    const grupoId = composta ? crypto.randomUUID() : null;
    const criadas: any[] = []; const falhasSetor: string[] = [];
    for (const s of alvos) {
      const cs = camposDoSetor(s);
      const parte: any = {
        ...payload, setor: s, grupo_id: grupoId, membros,
        centro_custo_id: cs.centroCusto ? centroCustoId : null, centro_custo: cs.centroCusto ? nomeCentro(centroCustoId) : null,
        pintura: cs.pintura ? !!pintura.pintura : false,
        pintura_tipo: cs.pintura && pintura.pintura ? (pintura.pintura_tipo || '').trim() || null : null,
      };
      if (composta) { parte.etapas = []; parte.responsavel_nome = null; parte.responsavel_email = null; parte.prazo = etapas[0].prazo ? dateToISO(etapas[0].prazo) : null; }
      const { data: n, error: erroParte } = await supabase.from('demandas_avulsas').insert([parte]).select('id,setor').single();
      if (erroParte || !n) falhasSetor.push(s + (erroParte ? ': ' + erroParte.message : '')); else criadas.push(n);
    }
    if (!criadas.length) { setSalvando(false); alert('Não foi possível criar a demanda: ' + falhasSetor.join('; ')); return; }
    if (falhasSetor.length) alert('Estas partes NÃO foram criadas: ' + falhasSetor.join('; ') + '. As demais foram criadas.');
    const nova = criadas[0];
    if (anexos.length) {
      const falhas: string[] = [];
      for (const f of anexos) {
        const r = await uploadAnexo(f, nova.id);   // sobe uma vez; cada parte aponta para o mesmo arquivo
        if (!r.url) { falhas.push(f.name + ' (' + r.erro + ')'); continue; }
        for (const c of criadas) {
          const { error: erroIns } = await supabase.from('demanda_avulsa_anexos').insert([{
            demanda_id: c.id, nome: f.name, url: r.url, tipo: f.type.startsWith('image/') ? 'foto' : 'documento', criado_por: currentUser?.nome,
            descricao: (descAnexos[chaveArquivo(f)] || '').trim() || null,
          }]);
          if (erroIns) falhas.push(f.name + ' (não registrado em uma das partes: ' + erroIns.message + ')');
        }
      }
      if (falhas.length) alert('A demanda foi criada, mas houve falha ao enviar estes anexos:\n\n' + falhas.join('\n'));
    }
    if (form.descricao?.trim() && nova?.id) {
      await salvarMencoes({
        texto:             form.descricao,
        mencionanteId:     String(currentUser?.id || currentUser?.email || ''),
        mencionanteNome:   currentUser?.nome || '',
        contexto:          'demanda_avulsa',
        contextoId:        String(nova.id),
        contextoDescricao: form.titulo || 'Demanda Avulsa',
        campo:             'descricao',
        abaDestino:        String(nova.setor || setorAlvo).toLowerCase(),
      });
    }
    // envolvidos: avisa cada um uma vez (a demanda composta tem várias partes, mas o aviso é um só, na primeira)
    if (membros.length) {
      const falhasAviso = await notificarParticipantes({
        novos: membros, autor: currentUser, contexto: 'demanda_avulsa', contextoId: String(nova.id), descricao: form.titulo || 'Demanda',
        abaDestino: String(nova.setor || setorAlvo).toLowerCase(), trecho: `Você foi adicionado como envolvido na demanda "${form.titulo}"`,
      });
      if (falhasAviso.length) alert('A demanda foi criada, mas não consegui avisar: ' + falhasAviso.join('; '));
    }
    // Painel "de despacho" (tem setoresDestino) — avisa o setor destino, mesmo
    // aviso que o sistema antigo ("Enviar Demanda para Setor") já mandava.
    if (setoresDestino && setoresDestino.length > 1) {
      const nomeCriador = currentUser?.nome || currentUser?.email || 'Usuário';
      const ops = vinculos.filter(v => v.tipo === 'op').map(v => String(v.descricao || '').split(' — ')[0]);
      for (const c of criadas) notificarEvento('demanda_criada_setor', msg.demandaCriada(c.setor, ops.join(', '), form.titulo, nomeCriador), c.setor);
    }
    setSalvando(false);
    onSaved();
    onClose();
  };

  return (
    <div className="acn-dav-nova-1"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'acn-dav-nova-2' + (setorAlvo === 'Compras' ? ' acn-dav-nova-compras' : '')}>
        <div className="acn-dav-nova-3">
          <span>{setorAlvo === 'Compras' ? '+ Nova solicitação de compra' : '+ Nova Demanda Avulsa'}</span>
          <Botao className="acn-dav-b acn-dav-nova-4" onClick={onClose}>✕</Botao>
        </div>

        <div className="acn-dav-nova-5">
          {/* Setor de destino — só aparece quando o painel permite despachar
              pra outros setores (substitui o antigo "Enviar Demanda para Setor") */}
          {setoresDestino && setoresDestino.length > 1 && (
            <div>
              <label className="acn-dav-nova-6">
                Setor(es) de destino * <span className="acn-dav-nova-7">— escolha um ou vários</span>
              </label>
              <div className="acn-dav-nova-8">
                {setoresDestino.map(s => (
                  <Botao key={s} onClick={() => alternarSetor(s)} aria-pressed={setoresAlvo.includes(s)}
                    className={'acn-dav-b ' + ('acn-dav-setor' + (setoresAlvo.includes(s) ? ' sel' : ''))}>
                    {s}
                  </Botao>
                ))}
              </div>
            </div>
          )}

          {composta && (
            <div className="acn-dav-nova-9">
              🧩 <strong>Demanda composta para {setoresAlvo.length} setores ({setoresAlvo.join(', ')}).</strong> Cada setor recebe a SUA parte, com responsável e andamento próprios; quem criou acompanha todas as partes e a demanda só fecha quando todas concluem.
              {' '}O responsável de cada parte é definido por cada setor.
            </div>
          )}

          {/* Compras: a solicitação inteira (lista de itens, prioridade, prazo, centro de custo, vínculo, fornecedor, link, anexos e observações) é o formulário compartilhado */}
          {setorAlvo === 'Compras' ? (
            <CamposSolicitacaoCompra valor={sc} onChange={setSc} />
          ) : (<>
          {/* Campo do setor de destino — Compras: centro de custo */}
          {campos.centroCusto && (
            <div>
              <label className="acn-dav-nova-6">
                Centro de Custo
              </label>
              <CentroCustoSelect value={centroCustoId} onChange={setCentroCustoId} style={{ width:'100%', fontSize:11 }} />
              <div className="acn-dav-nova-10">
                Onde a compra desta demanda será apontada. Dá para deixar em branco e informar depois.
              </div>
            </div>
          )}

          {/* Dados principais */}
          <div className="acn-dav-g-5">
            <div>
              <label className="acn-dav-nova-11">Título *</label>
              <input value={form.titulo} onChange={e=>set('titulo',e.target.value)} autoFocus
                placeholder="Ex: Revisar BOM do projeto X"
                className={'acn-dav-nova-tit' + (form.titulo ? '' : ' falta')} />
            </div>
            <div>
              <label className="acn-dav-nova-11">
                {setorAlvo === 'Compras' ? 'Descrição — motivo da compra' : 'Descrição'}
              </label>
              <MencaoTextarea className="acn-dav-g-6" value={form.descricao} onChange={v=>set('descricao',v)} rows={2} />
            </div>
            {campos.pintura && <PinturaCampos valor={pintura} onChange={v => setPintura(p => ({ ...p, ...v }))} />}
            <ItensDemandaEditor itens={itens} onChange={setItens} categoriaPreferida={CATEGORIA_DO_SETOR[setorAlvo] || ''}
              comValor={!!campos.valorItens} comFornecedor={!!campos.valorItens} dica={campos.valorItens ? 'Valor é opcional: se não souber, o comprador completa.' : ''}
              titulo={setorAlvo === 'Compras' ? 'Itens a comprar' : CATEGORIA_DO_SETOR[setorAlvo] ? 'Modelos e quantidades' : 'Itens (opcional)'} />
            <div>
              <label className="acn-dav-nova-6">Prioridade</label>
              <div className="acn-dav-g-7">
                {['Alta','Média','Baixa'].map(p => (
                  <Botao key={p} onClick={() => set('prioridade',p)}
                    className={'acn-dav-b ' + ('acn-dav-prio-nova prio-' + chavePrio(p) + (form.prioridade === p ? ' sel' : ''))}>
                    {p}
                  </Botao>
                ))}
              </div>
            </div>
          </div>

          {/* Colaboradores envolvidos (como os membros de um card do Trello): aparecem na demanda, são avisados e a veem em "Minhas solicitações" */}
          <ParticipantesPicker value={membros} onChange={setMembros} donoEmail={currentUser?.email}
            rotulo="Colaboradores envolvidos (opcional — são avisados e veem a demanda)" />

          {/* Vínculo opcional a um processo já em andamento */}
          <div>
            <label className="acn-dav-nova-6">
              Vincular a processos (opcional — várias OPs ou o lote inteiro)
            </label>
            <VinculosEditor vinculos={vinculos} onChange={setVinculos} />
          </div>

          {/* Anexos já na criação (foto, planilha, PDF...) */}
          <div>
            <label className="acn-dav-nova-6">
              Anexos (opcional)
            </label>
            <EscolherAnexos arquivos={anexos} onChange={setAnexos} />
            <DescricoesDosArquivos arquivos={anexos} descricoes={descAnexos} onChange={setDescAnexos} />
          </div>

          {/* Seletor de quantidade de etapas */}
          <div className={'acn-dav-qtd' + (composta ? ' oculto' : '')}>
            <label className="acn-dav-nova-12">
              Quantidade de Etapas
            </label>
            <div className="acn-dav-nova-13">
              <Botao className="acn-dav-b acn-dav-nova-14" onClick={() => mudarQtd(qtdEtapas - 1)} disabled={qtdEtapas <= 1}>−</Botao>
              <span className="acn-dav-nova-15">{qtdEtapas}</span>
              <Botao className="acn-dav-b acn-dav-nova-14" onClick={() => mudarQtd(qtdEtapas + 1)} disabled={qtdEtapas >= 10}>+</Botao>
              <span className="acn-dav-nova-16">
                {qtdEtapas === 1 ? 'Demanda simples' : `${qtdEtapas} etapas independentes`}
              </span>
            </div>
          </div>

          {/* Formulários por etapa */}
          <div className="acn-dav-nova-17">
            {etapas.map((e, i) => (
              <div key={i} className={'acn-dav-nova-et' + (qtdEtapas > 1 ? ' varias' : '')}>
                {qtdEtapas > 1 && (
                  <div className="acn-dav-g-3">
                    ETAPA {i + 1} de {qtdEtapas}
                  </div>
                )}
                <div className={'acn-dav-nova-grade' + (composta ? ' composta' : '')}>
                  <div className={composta ? 'acn-dav-oculto' : undefined}>
                    <label className="acn-dav-nova-11">
                      Responsável{qtdEtapas > 1 ? ' *' : ''}
                    </label>
                    <ColaboradorSelect value={e.responsavel_nome}
                      onChange={v=>setEtapa(i,'responsavel_nome',v)}
                      incluirUsuariosDaAba={abaDoSetor(e.setor || setorAlvo)}
                      departamentos={departamentosDoSetor(e.setor || setorAlvo)}
                      placeholder="Selecione o responsável"
                      className={'acn-dav-campo-resp' + (qtdEtapas > 1 && !e.responsavel_nome ? ' falta' : '')} />
                  </div>
                  <div>
                    <label className="acn-dav-nova-11">
                      Prazo{qtdEtapas > 1 ? ' *' : ''}
                    </label>
                    <input type="date" value={e.prazo} onChange={ev=>setEtapa(i,'prazo',ev.target.value)}
                      className={'acn-dav-campo-data' + (qtdEtapas > 1 && !e.prazo ? ' falta' : '')} />
                  </div>
                </div>
                {/* Vínculo próprio só faz sentido quando há mais de uma etapa;
                    na demanda simples vale o vínculo geral lá de cima */}
                {qtdEtapas > 1 && (
                  <div className="acn-dav-g-4">
                    <label className="acn-dav-nova-11">
                      Processo desta etapa, se for outro (opcional)
                    </label>
                    <VinculoPicker
                      value={e.vinculo_tipo ? { tipo: e.vinculo_tipo, id: e.vinculo_id, descricao: e.vinculo_descricao } : null}
                      onSelect={v => setEtapaVinculo(i, v)}
                      onClear={() => setEtapaVinculo(i, null)}
                    />
                  </div>
                )}
                <div>
                  <label className="acn-dav-nova-11">Observações</label>
                  <textarea className="acn-dav-nova-18" value={e.obs_criacao} onChange={ev=>setEtapa(i,'obs_criacao',ev.target.value)} rows={2} />
                </div>
              </div>
            ))}
          </div>
          </>)}
        </div>

        <div className="acn-dav-nova-19">
          <Botao className="acn-dav-b acn-dav-nova-20" onClick={onClose}>Cancelar</Botao>
          <Botao className="acn-dav-b acn-dav-nova-21" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : setorAlvo === 'Compras' ? 'Enviar para Compras' : composta ? `+ Criar para ${setoresAlvo.length} setores` : `+ Criar${qtdEtapas > 1 ? ` (${qtdEtapas} etapas)` : ''}`}
          </Botao>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD DA LISTA
// ─────────────────────────────────────────────────────────────────────────────
function DemandaCard({ d, onClick, grupo, agora }: any) {
  const alerta = alertClass(d.prazo, d.status);
  const diasV = diasParaVencer(d.prazo);
  const modCor = alerta ? 'al-' + alerta : 'st-' + chaveStatus(d.status);   // atraso manda (borda e fundo); sem atraso vale a cor do status
  const etapas: any[] = d.etapas || [];
  const temEtapas = etapas.length > 0;
  const etapasConcluidas = etapas.filter(e => e.status === 'Concluída').length;
  const pct = temEtapas ? Math.round((etapasConcluidas / etapas.length) * 100) : 0;

  // Alertas nas etapas
  const etapasVencidas = etapas.filter(e => alertClass(e.prazo, e.status) === 'vencida').length;
  const etapasUrgentes = etapas.filter(e => alertClass(e.prazo, e.status) === 'urgente').length;

  return (
    <div onClick={onClick}
      className={'acn-dav-card ' + modCor}>
      <div className="acn-dav-card-1">
        <div className="acn-dav-g-2">
          <div className="acn-dav-card-2">
            <span className={'acn-dav-st st-' + chaveStatus(d.status)}>{d.status}</span>
            <span className={'acn-dav-prio-selo prio-' + chavePrio(d.prioridade)}>{d.prioridade}</span>
            {temEtapas && (
              <span className="acn-dav-card-3">
                📋 {etapasConcluidas}/{etapas.length} etapas
              </span>
            )}
            {etapasVencidas > 0 && <span className="acn-dav-card-4">🔴 {etapasVencidas} etapa(s) vencida(s)</span>}
            {etapasUrgentes > 0 && etapasVencidas === 0 && <span className="acn-dav-card-5">🟡 {etapasUrgentes} urgente(s)</span>}
            {!temEtapas && alerta && (
              <span className={'acn-dav-al-txt al-' + alerta}>
                {alerta==='vencida' ? '🔴 VENCIDA' : `🟡 ${diasV}d`}
              </span>
            )}
            {d.vinculo_tipo && (
              <span className="acn-dav-card-6">
                🔗 {TIPO_LABEL[d.vinculo_tipo] || d.vinculo_tipo}: {d.vinculo_descricao}
                {vinculosDaDemanda(d).length > 1 && ` +${vinculosDaDemanda(d).length - 1}`}
              </span>
            )}
            {grupo && grupo.total > 1 && (
              <span className="acn-dav-card-7" title="Demanda composta: uma parte por setor">
                🧩 {grupo.concluidas}/{grupo.total} setores
              </span>
            )}
            <MembrosResumo d={d} />
            {(d.itens || []).length > 0 && (
              <span className="acn-dav-card-8">
                📦 {d.itens.length} ite{d.itens.length > 1 ? 'ns' : 'm'}
              </span>
            )}
          </div>
          <div className="acn-dav-card-9">{d.titulo}</div>
          {d.descricao && <div className="acn-dav-card-10">{d.descricao}</div>}

          {/* Barra de progresso (multi-etapa) */}
          {temEtapas && (
            <div className="acn-dav-card-11">
              <div className={'acn-dav-card-prog-fill' + (pct === 100 ? ' ok' : '')} style={{ width: `${pct}%` }} />
            </div>
          )}

          {!temEtapas && (
            <div className="acn-dav-card-12">
              {d.responsavel_nome && <span className="acn-dav-card-13">👤 {d.responsavel_nome}</span>}
              {d.prazo && <span className={'acn-dav-card-prazo' + (alerta ? ' al-' + alerta : '')}>⏰ {fmtDate(d.prazo)}</span>}
              {d.data_inicio && !d.data_fim && d.status === 'Em Andamento' && (
                <span className="acn-dav-card-14" title="Tempo trabalhado em horas úteis">{situacaoDoRelogio(d, agora) === 'rodando' ? '▶' : '⏸'} {fmtTempo(tempoEmTexto(d, agora).totalMs)}</span>
              )}
            </div>
          )}
        </div>
        {(d.informacoes?.length > 0) && (
          <span className="acn-dav-g-8">💬 {d.informacoes.length}</span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAINEL PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function DemandaAvulsaPanel({ currentUser, setor, setoresDestino, abrirComVinculo, onAbrirComVinculoConsumido }: {
  currentUser: any;
  setor: string;
  // Quando presente, o "+ Nova Demanda" ganha um seletor de setor de destino
  // (substitui o antigo "Enviar Demanda para Setor" que existia em algumas telas).
  setoresDestino?: string[];
  // Gatilho externo: outro lugar da tela (ex.: botão "+Demanda" numa linha de
  // OPL em PCPTab.tsx) pode abrir a Nova Demanda já com um vínculo pronto.
  abrirComVinculo?: VinculoValue | null;
  onAbrirComVinculoConsumido?: () => void;
}) {
  const agoraDaLista = useAgora(60000);   // pausa e horas úteis (16/10/2026): o cartão troca ▶ por ⏸ às 17:48 sem recarregar
  const [demandas, setDemandas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('ativas');
  const [filtroResp, setFiltroResp] = useState<string>('');
  const [filtroStatusSpec, setFiltroStatusSpec] = useState<string>('');
  const [modalNova, setModalNova] = useState(false);
  const [vinculoParaNova, setVinculoParaNova] = useState<VinculoValue | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [grupos, setGrupos] = useState<Record<string, { total: number; concluidas: number }>>({});   // demanda composta: quantas partes já concluíram
  const [erroLista, setErroLista] = useState('');   // 7.x (16/10/2026): leitura recusada não pode parecer "nenhuma demanda"

  // Abre "Nova Demanda" já com um vínculo pronto quando disparado de fora.
  useEffect(() => {
    if (abrirComVinculo) {
      setVinculoParaNova(abrirComVinculo);
      setModalNova(true);
      onAbrirComVinculoConsumido?.();
    }
  }, [abrirComVinculo]);

  const fetch = useCallback(async (silent=false) => {
    if (!silent) setLoading(true);
    const { data, error: erroLer } = await supabase.from('demandas_avulsas')
      .select('*').eq('setor', setor)
      .order('criado_em', { ascending: false });
    // 7.x (16/10/2026): com a leitura recusada a lista que já estava na tela fica (antes virava "Nenhuma demanda ativa") e a faixa vermelha avisa
    if (erroLer) { setErroLista(erroLer.message); if (!silent) setLoading(false); return; }
    setErroLista('');
    setDemandas(data || []);
    const gids = [...new Set((data || []).map((x: any) => x.grupo_id).filter(Boolean))];
    if (gids.length) {
      const { data: partes } = await supabase.from('demandas_avulsas').select('grupo_id,status').in('grupo_id', gids);
      const m: Record<string, { total: number; concluidas: number }> = {};
      (partes || []).filter((x: any) => x.status !== 'Cancelada').forEach((x: any) => { const g = (m[x.grupo_id] ||= { total: 0, concluidas: 0 }); g.total++; if (x.status === 'Concluída') g.concluidas++; });
      setGrupos(m);
    } else setGrupos({});
    if (!silent) setLoading(false);
  }, [setor]);

  useEffect(() => { fetch(); const t = setInterval(()=>fetch(true), 30000); return () => clearInterval(t); }, [fetch]);

  // Deep-link vindo do painel de Menções ("Demanda Avulsa X" clicável): abre o
  // detalhe da demanda direto, em vez de só cair na aba Engenharia genérica.
  // Usa um global (window.__acnDeepLink) além do evento porque, se este painel
  // ainda não estava montado quando o link foi clicado, o listener abaixo só
  // existe DEPOIS do mount — o global cobre esse caso lendo no próprio efeito.
  useEffect(() => {
    const tentarAbrir = () => {
      const pend = (window as any).__acnDeepLink;
      if (!pend || pend.contexto !== 'demanda_avulsa') return;
      (window as any).__acnDeepLink = null;
      supabase.from('demandas_avulsas').select('*').eq('id', pend.contextoId).maybeSingle()
        .then(({ data }) => { if (data) setSelected(data); });
    };
    tentarAbrir();
    window.addEventListener('acn:abrir-registro', tentarAbrir);
    return () => window.removeEventListener('acn:abrir-registro', tentarAbrir);
  }, []);

  const isVencida = (d: any) => {
    if (ENCERRADA(d.status)) return false;
    const etapas = d.etapas || [];
    if (etapas.length > 0) return etapas.some((e: any) => alertClass(e.prazo, e.status) === 'vencida');
    return alertClass(d.prazo, d.status) === 'vencida';
  };

  const lista = demandas.filter(d => {
    // Filtro principal de aba
    if (filtroStatus === 'ativas' && ENCERRADA(d.status)) return false;
    if (filtroStatus === 'concluidas' && !ENCERRADA(d.status)) return false;
    if (filtroStatus === 'vencidas' && !isVencida(d)) return false;
    // Filtro por status específico
    if (filtroStatusSpec && d.status !== filtroStatusSpec) return false;
    // Filtro por responsável
    if (filtroResp) {
      if (!combinaBusca(d.responsavel_nome, filtroResp)) return false;
    }
    return true;
  });

  // Lista de responsáveis únicos para o dropdown
  const responsaveis = Array.from(new Set(
    demandas.map(d => d.responsavel_nome).filter(Boolean)
  )).sort() as string[];

  const vencidas = demandas.filter(isVencida).length;
  const urgentes = demandas.filter(d => {
    if (ENCERRADA(d.status)) return false;
    const etapas = d.etapas || [];
    if (etapas.length > 0) return etapas.some((e: any) => alertClass(e.prazo, e.status) === 'urgente') && !etapas.some((e: any) => alertClass(e.prazo, e.status) === 'vencida');
    return alertClass(d.prazo, d.status) === 'urgente';
  }).length;

  return (
    <div className="sec-card acn-dav-pn-1">
      <div className="sec-hdr">
        <span className="acn-dav-g-1">
          ⚡ Demandas Avulsas — {setor}
          {vencidas > 0 && (
            <span onClick={() => setFiltroStatus(filtroStatus==='vencidas'?'ativas':'vencidas')}
              className={'acn-dav-badge-venc' + (filtroStatus === 'vencidas' ? ' ativo' : '')}>
              🔴 {vencidas} vencida{vencidas>1?'s':''}
            </span>
          )}
          {urgentes > 0 && filtroStatus!=='vencidas' && (
            <span className="acn-dav-pn-2">
              🟡 {urgentes} urgente{urgentes>1?'s':''}
            </span>
          )}
        </span>
        <Botao className="acn-dav-b acn-dav-pn-3" onClick={() => { setVinculoParaNova(null); setModalNova(true); }}>
          + Nova Demanda
        </Botao>
      </div>

      <div className="acn-dav-pn-4">
        {[['ativas','Ativas'],['concluidas','Encerradas'],['vencidas','Vencidas'],['todas','Todas']].map(([v,l]) => (
          <Botao key={v} onClick={() => setFiltroStatus(v)}
            className={'acn-dav-b ' + ('acn-dav-chip' + (filtroStatus === v ? ' sel' : '') + (v === 'vencidas' ? ' venc' : ''))}>
            {v==='vencidas'?'🔴 ':''}{ l}
          </Botao>
        ))}
        <div className="acn-dav-pn-5" />
        {/* Filtro por status específico */}
        <select className="acn-dav-pn-6" value={filtroStatusSpec} onChange={e=>{const v=e.target.value;setFiltroStatusSpec(v);if(ENCERRADA(v))setFiltroStatus('concluidas');else if(v&&filtroStatus==='concluidas')setFiltroStatus('ativas');}}>
          <option value="">Status: Todos</option>
          <option value="Pendente">Pendente</option>
          <option value="Em Andamento">Em Andamento</option>
          <option value="Concluída">Concluída</option>
          <option value="Cancelada">Cancelada</option>
        </select>
        {/* Filtro por responsável */}
        {responsaveis.length > 0 && (
          <select className="acn-dav-pn-6" value={filtroResp} onChange={e=>setFiltroResp(e.target.value)}>
            <option value="">Responsável: Todos</option>
            {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        {(filtroResp || filtroStatusSpec) && (
          <Botao className="acn-dav-b acn-dav-pn-7" onClick={() => { setFiltroResp(''); setFiltroStatusSpec(''); }}>
            ✕ Limpar filtros
          </Botao>
        )}
        <span className="acn-dav-pn-8">{lista.length} demandas</span>
      </div>

      <div className="sec-body acn-dav-pn-9">
        {erroLista && (
          <Faixa tom="erro">Não foi possível ler as demandas ({erroLista}). A lista abaixo pode estar incompleta ou desatualizada.</Faixa>
        )}
        {loading ? (
          <div className="acn-empty">Carregando...</div>
        ) : lista.length === 0 ? (erroLista ? null : (   // com a leitura recusada a faixa vermelha já explica; "nenhuma demanda" seria mentira
          <div className="acn-empty">
            {filtroStatus === 'ativas' ? 'Nenhuma demanda ativa. Clique em "+ Nova Demanda" para criar.' : 'Nenhuma demanda encontrada.'}
          </div>
        )) : (
          lista.map(d => (
            <DemandaCard key={d.id} d={d} onClick={() => setSelected(d)} grupo={d.grupo_id ? grupos[d.grupo_id] : undefined} agora={agoraDaLista} />
          ))
        )}
      </div>

      {modalNova && (
        <NovaDemandaModal currentUser={currentUser} setor={setor} setoresDestino={setoresDestino}
          vinculoInicial={vinculoParaNova}
          onClose={() => { setModalNova(false); setVinculoParaNova(null); }} onSaved={fetch} />
      )}
      {selected && (
        <ModalDetalhe
          demanda={selected}
          currentUser={currentUser}
          onClose={() => setSelected(null)}
          onRefresh={() => {
            fetch();
            supabase.from('demandas_avulsas').select('*').eq('id', selected.id).single()
              .then(({ data }) => { if (data) setSelected(data); });
          }}
        />
      )}
    </div>
  );
}
