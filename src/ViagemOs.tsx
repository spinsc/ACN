// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS ↔ OS (pedido do usuário em 05/11/2026)
//
// A OS de atendimento externo (categoria do SAC com a marca "tem despesas", hoje "Servico Externo") gera a viagem quando é aprovada (gatilho do banco `viagens_sincronizar_os`), e a viagem
// também gera a OS: o técnico leva a OS impressa, preenche e o cliente assina. Decisões do usuário no mesmo dia:
//   • a OS é criada DE VERDADE no SAC, ligada à viagem (`sac_ordens_servico.viagem_id`); se a viagem nasceu de uma OS, é a mesma OS (a viagem já tem a ligação);
//   • o chassi que a OP ou a OS ainda não tem sai como linha em branco na folha, para o técnico escrever à mão;
//   • a viagem pode ser ligada à mão a outra OS (tipo "OS" no seletor de ligações, sem `viagem_id`).
// A OS nova passa pela Nova OS do SAC (o caminho de sempre: número, cobrança, etapa); aqui só se monta o que vem preenchido.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { supabase } from './supabaseClient';
import { Botao, Selo, Faixa } from './Interface';
import Icone from './Icone';
import { gerarPdfDaOS } from './SacImpressaoOS';
import { htmlDaFicha } from './ViagemFicha';
import { mdiPrinter, mdiPlus, mdiOpenInNew, mdiClipboardTextOutline } from '@mdi/js';

/** O que a viagem diz sobre as OS dela: as que nasceram dela ou a geraram (`viagem_id`) e as ligadas à mão (tipo "os" em `vinculos`). Leitura recusada devolve o erro, nunca "sem OS". */
export async function lerOsDaViagem(v: any): Promise<{ lista: any[]; erro: string }> {
  if (!v?.id) return { lista: [], erro: '' };
  const ids = (Array.isArray(v.vinculos) ? v.vinculos : []).filter((x: any) => x?.tipo === 'os' && x?.id).map((x: any) => String(x.id)).filter((id: string) => /^[0-9a-f-]{36}$/i.test(id));
  const filtro = ids.length ? `viagem_id.eq.${v.id},id.in.(${ids.join(',')})` : `viagem_id.eq.${v.id}`;
  const { data, error } = await supabase.from('sac_ordens_servico').select('*').or(filtro).order('numero_os');
  if (error) return { lista: [], erro: error.message };
  return { lista: data || [], erro: '' };
}

/** As OS que têm esta viagem (`viagem_id`), já no formato de ligação automática. Usada ao salvar a viagem, para uma janela aberta há tempo não apagar a ligação que o banco acrescentou depois. */
export async function ligacoesAutomaticasDasOs(viagemId: string): Promise<{ lista: any[]; erro: string }> {
  const { data, error } = await supabase.from('sac_ordens_servico').select('id,numero_os,cliente_nome').eq('viagem_id', viagemId).order('numero_os');
  if (error) return { lista: [], erro: error.message };
  return { lista: (data || []).map((o: any) => ({ tipo: 'os', id: String(o.id), descricao: o.numero_os + (o.cliente_nome ? ' — ' + o.cliente_nome : ''), auto: true })), erro: '' };
}

/** Junta as ligações da janela com as automáticas das OS: a automática que a janela não tinha entra, a que já estava não se repete e a automática de uma OS que deixou de ser da viagem sai. */
export function juntarLigacoesAutomaticas(vinculos: any[], automaticas: any[]) {
  const base = (Array.isArray(vinculos) ? vinculos : []).filter((y: any) => !(y.tipo === 'os' && y.auto && !automaticas.some((a: any) => String(a.id) === String(y.id))));
  const jaTem = (x: any) => base.some((y: any) => y.tipo === x.tipo && String(y.id) === String(x.id));
  return [...base.map((y: any) => (y.tipo === 'os' && automaticas.some((a: any) => String(a.id) === String(y.id)) ? { ...y, auto: true } : y)), ...automaticas.filter((a: any) => !jaTem(a))];
}

/** Os veículos a atender, para a folha da equipe: um por equipamento de cada OS e um por OP da viagem. Chassi e placa que o cadastro não tem ficam vazios (a folha deixa a linha para escrever à mão). */
export async function lerVeiculosDaViagem(v: any): Promise<{ lista: any[]; erro: string }> {
  const lista: any[] = [];
  const os = await lerOsDaViagem(v);
  if (os.erro) return { lista: [], erro: os.erro };
  for (const o of os.lista) {
    const eqs = Array.isArray(o.equipamentos_lista) && o.equipamentos_lista.length ? o.equipamentos_lista : [{ marca: o.marca, modelo: o.modelo, numero_serie: o.numero_serie, chassi: o.chassi }];
    for (const e of eqs) lista.push({ origem: o.numero_os, cliente: o.cliente_nome || '', veiculo: [o.equipamento_nome, e.marca, e.modelo].filter(Boolean).join(' ').trim(), placa: e.placa || '', chassi: e.chassi || e.numero_serie || '' });
  }
  const opIds = (Array.isArray(v?.op_ids) ? v.op_ids : []).filter(Boolean);
  if (opIds.length) {
    const { data, error } = await supabase.from('oples').select('id,opl,modelo,chassi,placa,cliente_nome').in('id', opIds).order('opl');
    if (error) return { lista: [], erro: error.message };
    for (const p of data || []) lista.push({ origem: 'OP ' + p.opl, cliente: p.cliente_nome || '', veiculo: p.modelo || '', placa: p.placa || '', chassi: p.chassi || '' });
  }
  return { lista, erro: '' };
}

const temAba = (u: any, aba: string) => !u || u.perfil === 'Admin' || !Array.isArray(u.abas_permitidas) || u.abas_permitidas.length === 0 || u.abas_permitidas.includes(aba);

/** Monta o que a Nova OS do SAC abre preenchido. Erro em texto quando falta algo (categoria de serviço externo, leitura das OPs). */
export async function dadosParaGerarOs(v: any): Promise<{ dados?: any; erro?: string }> {
  const { data: cats, error: eCat } = await supabase.from('sac_categorias').select('nome').eq('tem_despesas', true).eq('ativo', true).order('nome').limit(1);
  if (eCat) return { erro: 'não foi possível ler as categorias do SAC (' + eCat.message + ')' };
  if (!cats?.length) return { erro: 'o SAC não tem nenhuma categoria de serviço externo ativa' };
  const opIds = (Array.isArray(v?.op_ids) ? v.op_ids : []).filter(Boolean);
  let ops: any[] = [];
  if (opIds.length) {
    const { data, error } = await supabase.from('oples').select('id,opl,modelo,chassi,placa,cliente_nome,veiculo_id').in('id', opIds).order('opl');
    if (error) return { erro: 'não foi possível ler as OPs da viagem (' + error.message + ')' };
    ops = data || [];
  }
  const destino = v?.paradas?.[0]?.texto || v?.sugestao_destino || '';
  const cliente = ops.find((p: any) => p.cliente_nome)?.cliente_nome || '';
  const defeito = `Atendimento externo — viagem «${v.titulo}»`;
  const equipLista = ops.length
    ? ops.map((p: any) => ({ marca: '', modelo: p.modelo || '', numero_serie: '', chassi: p.chassi || '', placa: p.placa || '', defeito, veiculo_id: p.veiculo_id || '' }))
    : [{ marca: '', modelo: '', numero_serie: '', chassi: '', defeito, veiculo_id: '' }];
  return {
    dados: {
      viagem_id: v.id, viagem_titulo: v.titulo, tipo_projeto: cats[0].nome, cliente_nome: cliente, endereco: destino,
      equipamento_nome: ops.length ? [...new Set(ops.map((p: any) => p.modelo).filter(Boolean))].join(', ') || 'Veículo' : 'Veículo',
      observacoes: ops.length ? 'OP(s) da viagem: ' + ops.map((p: any) => p.opl).join(', ') : '',
      equipLista,
    },
  };
}

/** Imprime a ficha da equipe COM os veículos a atender. A janela abre já no clique (senão o navegador a bloqueia por vir depois da leitura) e a folha é escrita quando os veículos chegam;
 *  se a leitura falhar, a ficha sai sem a lista e o aviso diz isso. Devolve o texto do aviso ('' quando deu tudo certo). */
export async function imprimirFichaDaViagem(v: any): Promise<string> {
  const w = window.open('', '_blank', 'width=860,height=720');
  if (!w) return 'O navegador bloqueou a janela de impressão. Libere pop-ups para este site e tente de novo.';
  const r = await lerVeiculosDaViagem(v);
  w.document.write(htmlDaFicha(v, r.lista)); w.document.close();
  return r.erro ? `A ficha saiu SEM a lista de veículos a atender: não foi possível ler as OS e OPs da viagem (${r.erro}).` : '';
}

export function imprimirOs(os: any) {
  gerarPdfDaOS(os, { [os.status]: '#334155' });
}

const SELO_FAMILIA: Record<string, string> = { 'Concluído': 'ok', 'Entregue': 'ok', 'Cancelada': 'neutro', 'Reprovado': 'erro' };

/** O quadro "OS de atendimento" da janela da viagem: as OS ligadas, imprimir, abrir no SAC e gerar uma OS nova. */
export function OsDaViagem({ v, currentUser, podeGerar, aoGerar, aoAbrir, osLida, erroLeitura, carregando }: any) {
  const semAbaSac = !temAba(currentUser, 'sac');
  return (
    <div className="acn-quadro" data-teste="viagem-os">
      <div className="acn-quadro-titulo">OS DE ATENDIMENTO</div>
      <div className="acn-ajuda">A OS que o técnico leva impressa: ele preenche e o cliente assina. Chassi que a OP ou a OS ainda não tem sai como linha em branco na folha.</div>
      {erroLeitura && <Faixa tom="erro">Não foi possível ler as OS desta viagem ({erroLeitura}).</Faixa>}
      {!erroLeitura && !carregando && osLida.length === 0 && (
        <Faixa tom="atencao">Esta viagem ainda não tem OS. Sem ela o técnico não tem o que o cliente assine. {podeGerar && !semAbaSac ? 'Use "Gerar OS desta viagem".' : 'Peça ao SAC para gerar a OS desta viagem.'}</Faixa>
      )}
      {osLida.length > 0 && (
        <ul className="acn-vg-vinc-lista">
          {osLida.map((o: any) => (
            <li key={o.id} className="acn-vg-vinc">
              <span className="acn-vcp-tipo"><Icone path={mdiClipboardTextOutline} size={14} />OS</span>
              <button type="button" className="acn-vg-vinc-abrir" title="Abrir no SAC (precisa da aba SAC)" onClick={() => aoAbrir({ tipo: 'os', id: String(o.id), descricao: o.numero_os })}>{o.numero_os}{o.cliente_nome ? ' — ' + o.cliente_nome : ''}</button>
              <Selo familia={SELO_FAMILIA[o.status] || 'info'} ponto={false}>{o.status}</Selo>
              {String(o.viagem_id) === String(v.id) ? null : <span className="acn-ajuda" title="Ligada à mão: a OS não nasceu desta viagem">ligada à mão</span>}
              <Botao pequeno variante="secundario" icone={mdiPrinter} title="Imprimir a OS para o técnico levar" onClick={() => imprimirOs(o)}>Imprimir</Botao>
            </li>
          ))}
        </ul>
      )}
      {podeGerar && (
        <div className="acn-acoes">
          <Botao pequeno variante="primario" icone={mdiPlus} disabled={semAbaSac} title={semAbaSac ? 'Você não tem a aba SAC: peça ao SAC para gerar a OS' : 'Abre a Nova OS do SAC já preenchida e ligada a esta viagem'} onClick={aoGerar}>Gerar OS desta viagem</Botao>
          {semAbaSac && <span className="acn-ajuda">Você não tem a aba SAC.</span>}
        </div>
      )}
    </div>
  );
}

/** Leva o dado ao SAC (sessionStorage, o mesmo caminho do CRM) e troca de aba. Quem chama já conferiu que a viagem está salva e que a pessoa tem a aba SAC. */
export function abrirNovaOsNoSac(dados: any) {
  try { sessionStorage.setItem('pendingOsFromViagem', JSON.stringify(dados)); } catch (_) { return false; }
  window.dispatchEvent(new CustomEvent('acn:trocar-aba', { detail: { aba: 'sac' } }));
  return true;
}
