// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — o provisionamento e a frota (pedido do usuário em 04/11/2026, fatia 2)
//
// Em Provisionamento cada setor "nutre" a sua parte da viagem: a ADAPTAÇÃO define a equipe, o veículo da frota, a placa e o km; o COMERCIAL descreve o serviço e anexa o
// contrato com o cliente; o FINANCEIRO lança a verba total, diz se o pedágio é reembolso ou convênio e dá os dados do hotel. Quem pode mexer em cada parte está em
// permissoesDaViagem (ViagemFluxo.ts): quem não pode vê a parte travada. A tela da viagem (ViagensTab.tsx) só junta as peças e grava cada parte no seu grupo de colunas.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabaseClient';
import { mostrarAviso, confirmar } from './Feedback';
import { logChange } from './AuditSystem';
import { Botao, Selo, Faixa, Chips, SelectMultiplo, hojeISO } from './Interface';
import { TIPOS_DE_MANUTENCAO, situacaoDaRevisao, erroDaManutencao, linhaDaManutencao, historicoDeKm } from './FrotaManutencao';
import { conflitosDaViagem, frasesDosConflitos } from './ViagemConflitos';
import { frasesDeReserva } from './ViagemReservas';
import Icone from './Icone';
import { useColaboradores } from './ColaboradorSelect';
import { nomeSeguroDeArquivo } from './FormatosArquivo';
import { explicarErroDeEnvio } from './ErroDeArquivo';
import { CampoNumero } from './ViagemCampos';
import { fmtReais } from './ViagemCalculo';
import { situacaoDaVerba, textoDaVerba } from './ViagemVerba';
import { GrupoComTrava } from './ViagemTrava';
import { mdiPlus, mdiClose, mdiPaperclip, mdiContentSaveOutline, mdiPencilOutline, mdiCarOutline, mdiHistory, mdiCashCheck } from '@mdi/js';

const BUCKET = 'acn-media';
const LIMITE_ANEXO = 20 * 1024 * 1024;   // contrato escaneado cabe; vídeo não

/** Placa sem hífen e em maiúsculas: é assim que o banco compara (duas placas iguais não entram na frota). */
export const placaNormalizada = (p: any) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** "ABC1D23" → "ABC-1D23" só para mostrar */
export const placaParaMostrar = (p: any) => { const n = placaNormalizada(p); return n.length === 7 ? `${n.slice(0, 3)}-${n.slice(3)}` : String(p || ''); };

/** Os veículos da frota (todos, ativos primeiro). Leitura recusada devolve o erro, nunca "lista vazia" calada. */
export async function lerFrota(): Promise<{ lista: any[]; erro: string }> {
  const { data, error } = await supabase.from('frota_veiculos').select('*').order('ativo', { ascending: false }).order('apelido');
  if (error) return { lista: [], erro: error.message };
  return { lista: data || [], erro: '' };
}

// ── a parte de cada setor ────────────────────────────────────────────────────
export function Parte({ titulo, quem, pode, children }: any) {
  return (
    <div className="acn-quadro">
      <div className="acn-quadro-titulo">{titulo} <span className="acn-vg-quem">{quem}{pode ? '' : ' · só leitura para você'}</span></div>
      <fieldset className="acn-vg-fs" disabled={!pode}>{children}</fieldset>
    </div>
  );
}

export function BlocoProvisionamento({ v, set, pode, frota, erroFrota, orcamento, aoAnexarContrato, aoTirarContrato, subindoContrato, outras, erroOutras, reservas, erroReservas, aoLiberarVerba, liberandoVerba, trava }: any) {
  const { list: colaboradores } = useColaboradores();
  // conflito (04/11/2026): a mesma pessoa ou o mesmo carro em duas viagens que se sobrepõem; é aviso em vermelho, não trava
  const frasesDeConflito = [...frasesDosConflitos(conflitosDaViagem(v, outras || [], hojeISO())), ...frasesDeReserva(v, reservas || [], hojeISO())];   // 04/11/2026: o veículo reservado para uso interno também é conflito
  const equipeIds = (v.equipe || []).map((m: any) => String(m.id));
  const opcoes = colaboradores.map((c: any) => ({ valor: String(c.id), rotulo: c.nome }));
  // quem já está na equipe e saiu da lista de colaboradores (desligado depois) continua aparecendo
  const extras = (v.equipe || []).filter((m: any) => !opcoes.some((o: any) => o.valor === String(m.id))).map((m: any) => ({ valor: String(m.id), rotulo: m.nome }));
  const escolherEquipe = (ids: string[]) => set('equipe', ids.map(id => { const o = [...opcoes, ...extras].find((x: any) => x.valor === id); return { id, nome: o?.rotulo || '—' }; }));
  const veiculos = frota.filter((f: any) => f.ativo || f.id === v.frota_id);
  const escolherVeiculo = (id: string) => {
    const f = frota.find((x: any) => x.id === id);
    if (!f) { set('frota_id', null); set('veiculo_nome', null); set('veiculo_placa', null); return; }
    set('frota_id', f.id); set('veiculo_nome', f.apelido); set('veiculo_placa', f.placa);
    // o km que o cadastro guarda vem como sugestão, só se a pessoa ainda não digitou o da saída
    if ((v.km_saida === null || v.km_saida === undefined || v.km_saida === '') && f.km_atual != null) set('km_saida', Number(f.km_atual));
  };
  const hotel = v.hotel || {};
  const setHotel = (campo: string, valor: string) => set('hotel', { ...hotel, [campo]: valor });
  const verba = Number(v.verba_total) || 0;
  const situacaoVerba = situacaoDaVerba(v);
  const noProvisionamento = ['provisionamento', 'aprovada'].includes(String(v.status));   // só nela a verba se libera
  const diaDaLiberacao = v.verba_liberada_em ? new Date(v.verba_liberada_em).toLocaleDateString('pt-BR') : '';
  const pessoasOrc = Math.max(1, Math.floor(Number(v.pessoas) || 1));

  return (
    <>
      <Parte titulo="EQUIPE E VEÍCULO" quem="Adaptação" pode={pode.adaptacao}>
        <div className="acn-vg-campo"><label className="acn-label">Equipe que vai *</label>
          <SelectMultiplo rotulo="Equipe que vai" placeholder="Escolha quem vai na viagem" opcoes={[...opcoes, ...extras]} valores={equipeIds} onChange={escolherEquipe} />
          {equipeIds.length > 0 && equipeIds.length !== pessoasOrc && <div className="acn-ajuda">A equipe tem {equipeIds.length} pessoa(s) e o orçamento conta {pessoasOrc}: ajuste "Pessoas" nos dados da viagem para a alimentação sair certa.</div>}
        </div>
        <div className="acn-vg-grade">
          <div className="acn-vg-campo"><label className="acn-label">Veículo da frota *</label>
            <select className="acn-input" aria-label="Veículo da frota" value={v.frota_id || ''} onChange={e => escolherVeiculo(e.target.value)}>
              <option value="">Escolha o veículo…</option>
              {veiculos.map((f: any) => <option key={f.id} value={f.id}>{f.apelido} — {placaParaMostrar(f.placa)}{f.ativo ? '' : ' (inativo)'}</option>)}
            </select>
            {erroFrota ? <div className="acn-vg-erro">Não foi possível ler a frota ({erroFrota}).</div>
              : !frota.length ? <div className="acn-ajuda">Nenhum veículo cadastrado ainda: use o botão "Frota" no alto da tela.</div> : null}
          </div>
          <div className="acn-vg-campo"><label className="acn-label">Placa</label>
            <input className="acn-input" aria-label="Placa do veículo" readOnly value={v.veiculo_placa ? placaParaMostrar(v.veiculo_placa) : ''} placeholder="vem do veículo escolhido" /></div>
          <CampoNumero key={'km' + (v.frota_id || '')} rotulo="Km do carro na saída *" valor={v.km_saida} vazioNulo sufixo="km" ajuda="O km que o painel marca na hora de sair." onChange={(n: number | null) => set('km_saida', n)} />
        </div>
        {frasesDeConflito.length > 0 && (
          <Faixa tom="erro">
            <strong>Conflito de datas.</strong>
            {frasesDeConflito.map((f, i) => <div key={i}>{f}</div>)}
            <div className="acn-ajuda">Confira as datas antes de a equipe sair. O sistema só avisa: quem decide é a Adaptação.</div>
          </Faixa>
        )}
        {(erroOutras || erroReservas) && <div className="acn-ajuda">Não foi possível conferir {erroOutras ? 'as outras viagens' : 'as reservas do veículo'} ({erroOutras || erroReservas}); o aviso de conflito não vale agora.</div>}
      </Parte>

      <Parte titulo="SERVIÇO E CONTRATO" quem="Comercial" pode={pode.comercial}>
        <div className="acn-vg-campo"><label className="acn-label" htmlFor="vg-servico">Descrição do serviço</label>
          <textarea id="vg-servico" className="acn-input" rows={3} placeholder="O que a equipe vai fazer no local (instalação, treinamento, ajuste…)" value={v.servico_descricao || ''} onChange={e => set('servico_descricao', e.target.value)} /></div>
        <div className="acn-vg-campo"><label className="acn-label" htmlFor="vg-contrato-obs">Contrato com o cliente</label>
          <textarea id="vg-contrato-obs" className="acn-input" rows={2} placeholder="Número do contrato, cláusulas que a equipe precisa saber, quem assina no local…" value={v.contrato_obs || ''} onChange={e => set('contrato_obs', e.target.value)} /></div>
        <div className="acn-vg-campo">
          <label className="acn-label">Arquivos do contrato {(v.contrato_anexos || []).length > 0 && `(${v.contrato_anexos.length})`}</label>
          <ul className="acn-vg-anexos">
            {(v.contrato_anexos || []).map((a: any, i: number) => (
              <li key={a.path || i}>
                <a href={a.url} target="_blank" rel="noreferrer"><Icone path={mdiPaperclip} size={14} /> {a.nome}</a>
                {pode.comercial && <Botao variante="discreto" pequeno icone={mdiClose} aria-label={`Tirar ${a.nome}`} title="Tirar o arquivo" onClick={() => aoTirarContrato(i)} />}
              </li>
            ))}
          </ul>
          {pode.comercial && (v.id
            ? <label className="acn-vg-anexar"><input type="file" multiple disabled={subindoContrato} onChange={aoAnexarContrato} /><span className="acn-b acn-b-secundario acn-b-p"><Icone path={mdiPaperclip} size={15} />{subindoContrato ? 'Enviando…' : 'Anexar o contrato'}</span></label>
            : <div className="acn-ajuda">Salve a viagem para poder anexar arquivos.</div>)}
        </div>
      </Parte>

      <Parte titulo="VERBA, PEDÁGIO E HOTEL" quem="Financeiro" pode={pode.financeiro}>
        {/* 05/11/2026: o que o Financeiro já preencheu e gravou fica travado; "Editar" pede o motivo e deixa o valor de antes no histórico (ViagemTrava.tsx) */}
        <div className="acn-vg-grade">
          <div>
            <GrupoComTrava grupo="verba" trava={trava}>
              <CampoNumero rotulo="Verba total necessária *" valor={v.verba_total} vazioNulo sufixo="R$" ajuda={orcamento > 0 ? `O orçamento da viagem calcula ${fmtReais(orcamento)}.` : 'Todo o dinheiro que a viagem vai precisar.'} onChange={(n: number | null) => set('verba_total', n)} />
            </GrupoComTrava>
          </div>
          <div>
            <GrupoComTrava grupo="pedagio" trava={trava}>
              <div className="acn-vg-campo"><label className="acn-label">Pedágio</label>
                <Chips ativo={v.pedagio_modo || ''} onChange={(id: string) => set('pedagio_modo', id || null)} rotulo="Pedágio" itens={[{ id: 'reembolso', rotulo: 'Reembolso' }, { id: 'convenio', rotulo: 'Convênio' }]} />
                <div className="acn-ajuda">{v.pedagio_modo === 'reembolso' ? 'A equipe paga e depois pede o reembolso.' : v.pedagio_modo === 'convenio' ? 'Passa pelo convênio (tag), sem pagar na cancela.' : 'Ainda não definido.'}</div></div>
            </GrupoComTrava>
          </div>
        </div>
        {/* 04/11/2026: o Financeiro LIBERA a verba (ViagemVerba.ts); a equipe só sai com ela liberada */}
        <div className="acn-vg-verba-estado">
          {situacaoVerba === 'liberada' && <Selo familia="ok" ponto={false}>{textoDaVerba(v)}{diaDaLiberacao ? ' em ' + diaDaLiberacao : ''}</Selo>}
          {situacaoVerba === 'mudou' && !noProvisionamento && <Selo familia="atencao" ponto={false}>{textoDaVerba(v)}</Selo>}
          {noProvisionamento && (situacaoVerba === 'a_liberar' || situacaoVerba === 'mudou') && (
            <>
              <Selo familia="erro" ponto={false}>{situacaoVerba === 'mudou' ? 'A verba mudou depois de liberada' : 'Verba ainda não liberada'}</Selo>
              {v.id && <Botao pequeno variante="primario" icone={mdiCashCheck} disabled={liberandoVerba} onClick={aoLiberarVerba}>{liberandoVerba ? 'Liberando…' : 'Liberar verba'}</Botao>}
              <span className="acn-ajuda">{textoDaVerba(v)}. Salve a viagem com o valor certo antes de liberar.</span>
            </>
          )}
          {noProvisionamento && situacaoVerba === 'sem_verba' && <span className="acn-ajuda">Informe a verba total, salve a viagem e libere: a equipe só sai com a verba liberada.</span>}
        </div>
        <GrupoComTrava grupo="hotel" trava={trava}>
        <div className="acn-vg-grade">
          <div className="acn-vg-campo"><label className="acn-label">Hotel</label>
            <input className="acn-input" aria-label="Nome do hotel" placeholder="Nome do hotel" value={hotel.nome || ''} onChange={e => setHotel('nome', e.target.value)} /></div>
          <div className="acn-vg-campo"><label className="acn-label">Telefone do hotel</label>
            <input className="acn-input" aria-label="Telefone do hotel" value={hotel.telefone || ''} onChange={e => setHotel('telefone', e.target.value)} /></div>
          <div className="acn-vg-campo acn-vg-largo"><label className="acn-label">Endereço do hotel</label>
            <input className="acn-input" aria-label="Endereço do hotel" value={hotel.endereco || ''} onChange={e => setHotel('endereco', e.target.value)} /></div>
          <div className="acn-vg-campo acn-vg-largo"><label className="acn-label">Reserva e observações</label>
            <input className="acn-input" aria-label="Reserva e observações do hotel" placeholder="Número da reserva, café incluso, datas…" value={hotel.observacao || ''} onChange={e => setHotel('observacao', e.target.value)} /></div>
        </div>
        </GrupoComTrava>
      </Parte>
    </>
  );
}

// ── o que cada parte grava ───────────────────────────────────────────────────
/** As colunas de cada grupo: quem salva grava só o grupo que pode editar, para não passar por cima do que outro setor preencheu. */
export function camposDoGrupo(v: any, pode: any) {
  const c: any = {};
  if (pode.adaptacao) Object.assign(c, { equipe: v.equipe || [], frota_id: v.frota_id || null, veiculo_nome: v.veiculo_nome || null, veiculo_placa: v.veiculo_placa || null, km_saida: v.km_saida === '' ? null : (v.km_saida ?? null), km_volta: v.km_volta === '' ? null : (v.km_volta ?? null) });
  if (pode.comercial) Object.assign(c, { servico_descricao: String(v.servico_descricao || '').trim() || null, contrato_obs: String(v.contrato_obs || '').trim() || null });
  if (pode.financeiro) {
    const h = v.hotel || {};
    const temHotel = ['nome', 'endereco', 'telefone', 'observacao'].some(k => String(h[k] || '').trim());
    Object.assign(c, { verba_total: v.verba_total ?? null, pedagio_modo: v.pedagio_modo || null, custo_real: custoRealParaGravar(v.custo_real), hotel: temHotel ? { nome: h.nome || '', endereco: h.endereco || '', telefone: h.telefone || '', observacao: h.observacao || '' } : null });
  }
  return c;
}

/** O custo real só é gravado se algum item foi lançado (tudo em branco = nulo, a viagem ainda não prestou contas). */
function custoRealParaGravar(c: any) {
  if (!c) return null;
  const itens = ['combustivel', 'pedagios', 'hospedagem', 'alimentacao', 'outros'];
  const lancou = itens.some(k => c[k] !== null && c[k] !== undefined && c[k] !== '');
  const obs = String(c.observacao || '').trim();
  if (!lancou && !obs) return null;
  const r: any = {};
  for (const k of itens) r[k] = c[k] === '' || c[k] === undefined ? null : c[k];
  r.observacao = obs;
  return r;
}

/** Sobe os arquivos do contrato e grava a lista JÁ (só a coluna do contrato): o arquivo não se perde se a pessoa fechar a janela sem salvar. */
export async function anexarContrato(viagem: any, arquivos: File[], currentUser: any): Promise<{ lista: any[]; erro: string }> {
  const atuais = Array.isArray(viagem.contrato_anexos) ? viagem.contrato_anexos : [];
  const novos: any[] = [];
  let erro = '';
  for (const f of arquivos) {
    if (f.size > LIMITE_ANEXO) { erro = `Não foi possível enviar "${f.name}": o arquivo passa de 20 MB.`; continue; }
    const caminho = `viagens/${viagem.id}/contrato/${Date.now()}-${nomeSeguroDeArquivo(f.name)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(caminho, f, { upsert: false });
    if (error) { erro = `Não foi possível enviar "${f.name}": ${explicarErroDeEnvio(error, f)}`; continue; }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(caminho);
    novos.push({ nome: f.name, url: pub.publicUrl, path: caminho, tamanho: f.size, por: currentUser?.nome || currentUser?.email || null, em: new Date().toISOString() });
  }
  if (!novos.length) return { lista: atuais, erro };
  const lista = [...atuais, ...novos];
  const { data, error } = await supabase.from('viagens').update({ contrato_anexos: lista, atualizado_em: new Date().toISOString() }).eq('id', viagem.id).select('id');
  if (error || !data?.length) return { lista: atuais, erro: 'Não foi possível guardar o contrato na viagem: ' + (error?.message || 'o banco não confirmou') + ' (o arquivo subiu, mas não ficou ligado).' };
  logChange({ module: 'viagens', entityType: 'viagens', entityId: viagem.id, changeType: 'UPDATE', field: 'contrato_anexos', oldRow: { contrato_anexos: atuais.length }, newRow: { contrato_anexos: lista.length }, user: currentUser });
  return { lista, erro };
}

export async function tirarContrato(viagem: any, indice: number, currentUser: any): Promise<{ lista: any[]; erro: string }> {
  const atuais = Array.isArray(viagem.contrato_anexos) ? viagem.contrato_anexos : [];
  const alvo = atuais[indice];
  if (!alvo) return { lista: atuais, erro: '' };
  if (!await confirmar(`Tirar o arquivo "${alvo.nome}" do contrato desta viagem?\n\nO arquivo sai da lista (continua guardado no armazenamento).`)) return { lista: atuais, erro: '' };
  const lista = atuais.filter((_: any, i: number) => i !== indice);
  const { data, error } = await supabase.from('viagens').update({ contrato_anexos: lista, atualizado_em: new Date().toISOString() }).eq('id', viagem.id).select('id');
  if (error || !data?.length) return { lista: atuais, erro: 'Não foi possível tirar o arquivo: ' + (error?.message || 'o banco não confirmou') };
  logChange({ module: 'viagens', entityType: 'viagens', entityId: viagem.id, changeType: 'UPDATE', field: 'contrato_anexos', oldRow: { removido: alvo.nome }, newRow: { contrato_anexos: lista.length }, user: currentUser });
  return { lista, erro: '' };
}

// ── o cadastro de frota ──────────────────────────────────────────────────────
const FORM_FROTA = { id: null, apelido: '', modelo: '', placa: '', km_atual: null, ativo: true };

export function FrotaModal({ currentUser, aoFechar, aoMudar }: any) {
  const [lista, setLista] = useState<any[]>([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<any>({ ...FORM_FROTA });
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, val: any) => setForm((f: any) => ({ ...f, [k]: val }));
  // manutenção e histórico de km (04/11/2026): lidos junto da lista; a leitura que falha não vira "sem manutenção", vira aviso
  const [manutencoes, setManutencoes] = useState<any[]>([]);
  const [viagensFrota, setViagensFrota] = useState<any[]>([]);
  const [erroHistorico, setErroHistorico] = useState('');
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const hoje = hojeISO();

  const carregar = async () => {
    const r = await lerFrota();
    setErro(r.erro); if (!r.erro) setLista(r.lista); setCarregando(false);
    const [m, vg] = await Promise.all([
      supabase.from('frota_manutencoes').select('*').order('data', { ascending: false }).order('criado_em', { ascending: false }),
      supabase.from('viagens').select('id,titulo,status,data_saida,frota_id,km_saida,km_volta').not('frota_id', 'is', null),
    ]);
    const falha = m.error || vg.error;
    setErroHistorico(falha ? falha.message : '');
    if (!m.error) setManutencoes(m.data || []);
    if (!vg.error) setViagensFrota(vg.data || []);
  };
  useEffect(() => { carregar(); }, []);

  const salvar = async () => {
    if (salvando) return;
    const apelido = String(form.apelido || '').trim();
    const placa = placaNormalizada(form.placa);
    if (!apelido) { mostrarAviso('Informe o nome do veículo (por exemplo, "Strada branca").', 'atencao'); return; }
    // placa antiga (ABC-1234) ou do Mercosul (ABC-1D23): três letras, um número, uma letra ou número e dois números
    if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa)) { mostrarAviso('Informe a placa no formato ABC-1234 ou ABC-1D23.', 'atencao'); return; }
    setSalvando(true);
    const agora = new Date().toISOString();
    const por = currentUser?.nome || currentUser?.email || null;
    const linha = { apelido, modelo: String(form.modelo || '').trim() || null, placa, km_atual: form.km_atual === '' ? null : (form.km_atual ?? null), ativo: !!form.ativo };
    const { data, error } = form.id
      ? await supabase.from('frota_veiculos').update({ ...linha, atualizado_em: agora, atualizado_por_nome: por }).eq('id', form.id).select('id')
      : await supabase.from('frota_veiculos').insert([{ ...linha, criado_por_nome: por, atualizado_por_nome: por }]).select('id');
    setSalvando(false);
    if (error || !data?.length) {
      const repetida = /frota_veiculos_placa_uq|duplicate key/i.test(error?.message || '');
      mostrarAviso(repetida ? 'Não foi possível salvar: já existe um veículo com essa placa na frota.' : 'Não foi possível salvar o veículo: ' + (error?.message || 'o banco não confirmou a gravação'));
      return;
    }
    logChange({ module: 'viagens', entityType: 'frota_veiculos', entityId: data[0].id, changeType: form.id ? 'UPDATE' : 'INSERT', oldRow: null, newRow: linha, user: currentUser });
    mostrarAviso(form.id ? 'Veículo atualizado.' : 'Veículo cadastrado.', 'ok');
    setForm({ ...FORM_FROTA });
    await carregar(); aoMudar?.();
  };

  return createPortal(
    <div className="modal-overlay acn-vg-ov">
      <div className="modal-box acn-modal-cadastro acn-vg-frota" role="dialog" aria-label="Frota">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiCarOutline} size={18} />Frota de viagens</span>
          <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Fechar" title="Fechar" onClick={aoFechar} />
        </div>
        <div className="acn-modal-corpo acn-vg-corpo">
          <div className="acn-quadro">
            <div className="acn-quadro-titulo">{form.id ? 'EDITAR VEÍCULO' : 'NOVO VEÍCULO'}</div>
            <div className="acn-vg-grade">
              <div className="acn-vg-campo"><label className="acn-label">Nome *</label>
                <input className="acn-input" aria-label="Nome do veículo" placeholder="Ex.: Strada branca" value={form.apelido} onChange={e => set('apelido', e.target.value)} /></div>
              <div className="acn-vg-campo"><label className="acn-label">Modelo</label>
                <input className="acn-input" aria-label="Modelo do veículo" placeholder="Ex.: Fiat Strada 1.4" value={form.modelo || ''} onChange={e => set('modelo', e.target.value)} /></div>
              <div className="acn-vg-campo"><label className="acn-label">Placa *</label>
                <input className="acn-input" aria-label="Placa do veículo" placeholder="ABC-1D23" maxLength={8} value={form.placa} onChange={e => set('placa', e.target.value.toUpperCase())} /></div>
              <CampoNumero key={form.id || 'novo'} rotulo="Km atual" valor={form.km_atual} vazioNulo sufixo="km" onChange={(n: number | null) => set('km_atual', n)} />
            </div>
            <label className="acn-vg-check"><input type="checkbox" checked={!!form.ativo} onChange={e => set('ativo', e.target.checked)} /> Em uso (veículo desativado deixa de aparecer na escolha das viagens, sem apagar o histórico)</label>
            <div className="acn-vg-acoes">
              <Botao variante="primario" icone={mdiContentSaveOutline} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : form.id ? 'Salvar veículo' : 'Cadastrar veículo'}</Botao>
              {form.id && <Botao onClick={() => setForm({ ...FORM_FROTA })}>Cancelar a edição</Botao>}
            </div>
          </div>
          <div className="acn-quadro">
            <div className="acn-quadro-titulo">VEÍCULOS ({lista.length})</div>
            {erro && <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>Não foi possível ler a frota ({erro}).</Faixa>}
            {carregando && <div className="acn-ajuda">Carregando…</div>}
            {!carregando && !erro && !lista.length && <div className="acn-ajuda">Nenhum veículo cadastrado ainda.</div>}
            {erroHistorico && <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>Não foi possível ler as manutenções e o histórico de km ({erroHistorico}). O aviso de revisão não vale agora.</Faixa>}
            <table className="acn-tabela">
              <tbody>
                {lista.map(f => {
                  const rev = erroHistorico ? null : situacaoDaRevisao(f, manutencoes.filter((m: any) => m.frota_id === f.id), hoje);
                  return (
                    <tr key={f.id}>
                      <td><strong>{f.apelido}</strong>{f.modelo ? <div className="acn-ajuda">{f.modelo}</div> : null}</td>
                      <td className="acn-num">{placaParaMostrar(f.placa)}</td>
                      <td className="dir acn-num">{f.km_atual != null ? `${Number(f.km_atual).toLocaleString('pt-BR')} km` : '—'}</td>
                      <td>{f.ativo ? <Selo familia="ok" ponto={false}>Em uso</Selo> : <Selo familia="neutro" ponto={false}>Inativo</Selo>}</td>
                      <td className="acn-vg-revisao">{rev && (rev.estado === 'vencida' || rev.estado === 'perto')
                        ? <Selo familia={rev.estado === 'vencida' ? 'erro' : 'atencao'} ponto={false} title={rev.texto}>{rev.estado === 'vencida' ? 'Revisão vencida' : 'Revisão perto'}</Selo>
                        : rev ? <span className="acn-ajuda">{rev.texto}</span> : null}</td>
                      <td className="dir">
                        <Botao variante="discreto" pequeno icone={mdiHistory} aria-label={`Histórico de ${f.apelido}`} title="Histórico de km e manutenção" onClick={() => setDetalhe(detalhe === f.id ? null : f.id)} />
                        <Botao variante="discreto" pequeno icone={mdiPencilOutline} aria-label={`Editar ${f.apelido}`} title="Editar" onClick={() => setForm({ ...f })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {detalhe && lista.find(f => f.id === detalhe) && (
            <HistoricoDoVeiculo veiculo={lista.find(f => f.id === detalhe)} manutencoes={manutencoes.filter((m: any) => m.frota_id === detalhe)} viagens={viagensFrota} currentUser={currentUser}
              aoMudar={carregar} aoFechar={() => setDetalhe(null)} />
          )}
        </div>
        <div className="acn-modal-rodape"><Botao onClick={aoFechar}>Fechar</Botao></div>
      </div>
    </div>,
    document.body,
  );
}

// ── histórico de km e manutenção de um veículo (04/11/2026) ───────────────────
const FORM_MANUT = { data: '', tipo: 'Revisão', descricao: '', km: null, custo: null, proxima_km: null, proxima_data: '' };

function HistoricoDoVeiculo({ veiculo, manutencoes, viagens, currentUser, aoMudar, aoFechar }: any) {
  const hoje = hojeISO();
  const [form, setForm] = useState<any>({ ...FORM_MANUT, data: hoje, km: veiculo.km_atual ?? null });
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, val: any) => setForm((f: any) => ({ ...f, [k]: val }));
  const h = historicoDeKm(viagens, veiculo.id);
  const rev = situacaoDaRevisao(veiculo, manutencoes, hoje);
  const gastoTotal = manutencoes.reduce((s: number, m: any) => s + (Number(m.custo) || 0), 0);

  const registrar = async () => {
    if (salvando) return;
    const erro = erroDaManutencao({ ...form, frota_id: veiculo.id }, hoje);
    if (erro) { mostrarAviso(erro, 'atencao'); return; }
    setSalvando(true);
    const linha = linhaDaManutencao({ ...form, frota_id: veiculo.id }, currentUser?.nome || currentUser?.email || null);
    const { data, error } = await supabase.from('frota_manutencoes').insert([linha]).select('id');
    setSalvando(false);
    if (error || !data?.length) { mostrarAviso('Não foi possível registrar a manutenção: ' + (error?.message || 'o banco não confirmou a gravação')); return; }
    logChange({ module: 'viagens', entityType: 'frota_manutencoes', entityId: data[0].id, changeType: 'INSERT', oldRow: null, newRow: linha, user: currentUser });
    mostrarAviso('Manutenção registrada.', 'ok');
    setForm({ ...FORM_MANUT, data: hoje, km: veiculo.km_atual ?? null });
    aoMudar?.();
  };

  const apagar = async (m: any) => {
    if (!await confirmar(`Apagar o registro "${m.tipo}" de ${new Date(m.data + 'T12:00:00').toLocaleDateString('pt-BR')}?\n\nUse só para um registro lançado por engano.`)) return;
    const { data, error } = await supabase.from('frota_manutencoes').delete().eq('id', m.id).select('id');
    if (error || !data?.length) { mostrarAviso('Não foi possível apagar o registro: ' + (error?.message || 'o banco não confirmou')); return; }
    logChange({ module: 'viagens', entityType: 'frota_manutencoes', entityId: m.id, changeType: 'DELETE', oldRow: m, newRow: null, user: currentUser });
    aoMudar?.();
  };

  return (
    <div className="acn-quadro" data-historico-veiculo={veiculo.id}>
      <div className="acn-quadro-titulo">HISTÓRICO · {veiculo.apelido} {placaParaMostrar(veiculo.placa)}
        <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Fechar o histórico" title="Fechar o histórico" onClick={aoFechar} /></div>
      {(rev.estado === 'vencida' || rev.estado === 'perto')
        ? <Faixa tom="erro">{rev.texto}.</Faixa>
        : <div className="acn-ajuda">{rev.texto}.</div>}

      <div className="acn-vg-subtitulo">Km rodado em viagens {h.viagens.length > 0 && <span className="acn-num">· {h.totalRodado.toLocaleString('pt-BR')} km em {h.viagens.length} viagem(ns)</span>}</div>
      {!h.viagens.length && <div className="acn-ajuda">Nenhuma viagem finalizada com este veículo ainda.</div>}
      {h.viagens.length > 0 && (
        <table className="acn-tabela">
          <thead><tr><th>Viagem</th><th>Saída</th><th className="dir">Km saída</th><th className="dir">Km volta</th><th className="dir">Rodado</th></tr></thead>
          <tbody>{h.viagens.map(x => (
            <tr key={x.id}><td>{x.titulo}</td><td>{x.data ? new Date(x.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
              <td className="dir acn-num">{x.saida != null ? x.saida.toLocaleString('pt-BR') : '—'}</td><td className="dir acn-num">{x.volta != null ? x.volta.toLocaleString('pt-BR') : '—'}</td>
              <td className="dir acn-num">{x.rodado != null ? `${x.rodado.toLocaleString('pt-BR')} km` : '—'}</td></tr>
          ))}</tbody>
        </table>
      )}

      <div className="acn-vg-subtitulo">Manutenções {manutencoes.length > 0 && <span className="acn-num">· {fmtReais(gastoTotal)} gastos em {manutencoes.length} registro(s)</span>}</div>
      {!manutencoes.length && <div className="acn-ajuda">Nenhuma manutenção registrada.</div>}
      {manutencoes.length > 0 && (
        <table className="acn-tabela">
          <thead><tr><th>Data</th><th>Tipo</th><th className="dir">Km</th><th className="dir">Custo</th><th>Próxima</th><th /></tr></thead>
          <tbody>{manutencoes.map((m: any) => (
            <tr key={m.id}>
              <td>{new Date(m.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
              <td>{m.tipo}{m.descricao ? <div className="acn-ajuda">{m.descricao}</div> : null}</td>
              <td className="dir acn-num">{m.km != null ? Number(m.km).toLocaleString('pt-BR') : '—'}</td>
              <td className="dir acn-num">{m.custo != null ? fmtReais(Number(m.custo)) : '—'}</td>
              <td className="acn-num">{[m.proxima_km != null ? `${Number(m.proxima_km).toLocaleString('pt-BR')} km` : '', m.proxima_data ? new Date(m.proxima_data + 'T12:00:00').toLocaleDateString('pt-BR') : ''].filter(Boolean).join(' ou ') || '—'}</td>
              <td className="dir"><Botao variante="discreto" pequeno icone={mdiClose} aria-label={`Apagar o registro ${m.tipo}`} title="Apagar o registro (lançado por engano)" onClick={() => apagar(m)} /></td>
            </tr>
          ))}</tbody>
        </table>
      )}

      <div className="acn-vg-subtitulo">Registrar manutenção</div>
      <div className="acn-vg-grade">
        <div className="acn-vg-campo"><label className="acn-label">Data *</label>
          <input type="date" className="acn-input" aria-label="Data da manutenção" max={hoje} value={form.data} onChange={e => set('data', e.target.value)} /></div>
        <div className="acn-vg-campo"><label className="acn-label">Tipo *</label>
          <select className="acn-input" aria-label="Tipo da manutenção" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
            {TIPOS_DE_MANUTENCAO.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
        <CampoNumero key={'mk' + veiculo.id} rotulo="Km do painel" valor={form.km} vazioNulo sufixo="km" onChange={(n: number | null) => set('km', n)} />
        <CampoNumero key={'mc' + veiculo.id} rotulo="Custo" valor={form.custo} vazioNulo sufixo="R$" onChange={(n: number | null) => set('custo', n)} />
        <CampoNumero key={'mp' + veiculo.id} rotulo="Próxima revisão em" valor={form.proxima_km} vazioNulo sufixo="km" ajuda="Opcional: a tela avisa quando o veículo chegar perto." onChange={(n: number | null) => set('proxima_km', n)} />
        <div className="acn-vg-campo"><label className="acn-label">Ou na data</label>
          <input type="date" className="acn-input" aria-label="Data da próxima revisão" value={form.proxima_data} onChange={e => set('proxima_data', e.target.value)} /></div>
        <div className="acn-vg-campo acn-vg-largo"><label className="acn-label">O que foi feito</label>
          <input className="acn-input" aria-label="O que foi feito na manutenção" placeholder="Ex.: óleo e filtros, pastilha dianteira" value={form.descricao} onChange={e => set('descricao', e.target.value)} /></div>
      </div>
      <div className="acn-vg-acoes"><Botao variante="primario" icone={mdiContentSaveOutline} disabled={salvando} onClick={registrar}>{salvando ? 'Salvando…' : 'Registrar manutenção'}</Botao></div>
    </div>
  );
}
