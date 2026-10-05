// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAÇÃO DE COMPRA ÚNICA
//
// Pedido do usuário em 05/10/2026: "toda solicitação de compra, independente de
// onde ela é gerada, deve se comportar igual". A compra aberta pela OP (CRM) e a
// emitida pela licitação vencida não tinham a lista de material, e as pessoas
// passaram a listar o material na descrição; a "Nova demanda" do Compras tinha a
// lista, mas descartava os anexos e as @menções.
//
// Agora existe UM formulário (CamposSolicitacaoCompra), UMA gravação
// (enviarSolicitacaoCompra, que passa por criarRequisicaoCompra) e UMA janela
// (ModalSolicitarCompra). Quem pede compra — CRM, Licitações, a "Nova demanda" do
// Compras — usa as mesmas peças e ganha o mesmo comportamento: lista de itens
// (com busca no catálogo), prioridade, prazo, centro de custo, vínculo, fornecedor
// sugerido, link, anexos e observações com @menção. A requisição que nasce sozinha
// (reposição de estoque, pintura) já passava por criarRequisicaoCompra.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { criarRequisicaoCompra, enviarAnexosCompra, EscolherAnexos } from './ComprasFluxo';
import { ItensDemandaEditor, itemVazio, itensPreenchidos } from './DemandaItens';
import { CentroCustoSelect, fetchCentrosCusto } from './CentroCustoShared';
import { AvisoSaldoCentro, useCentroObrigatorio, lerCentroObrigatorio, MSG_CENTRO_OBRIGATORIO } from './CentroCustoUso';
import { VinculoPicker } from './VinculoPicker';
import MencaoTextarea, { salvarMencoes } from './MencaoTextarea';
import { ColaboradorSelect } from './ColaboradorSelect';
import { Botao, Faixa } from './Interface';

export const solicitacaoCompraVazia = (inicial: any = {}) => ({
  titulo: '', descricao: '', itens: [itemVazio()], prioridade: 'Média', prazo: '',
  centroCustoId: null as string | null, vinculo: null as any, fornecedor: '', linkUrl: '',
  comprador: '', anexos: [] as File[], observacoes: '',
  ...inicial,
});

/**
 * Devolve o que falta preencher (texto para a pessoa) ou null se está pronta para enviar.
 * `centroObrigatorio`: a regra "exigir o centro de custo" (Admin › Centros de Custo; Etapa 15c, 05/10/2026) — vem de useCentroObrigatorio().
 */
export function validarSolicitacaoCompra(v: any, centroObrigatorio = false): string | null {
  if (!String(v?.titulo || '').trim()) return 'Informe o título — o que está sendo comprado.';
  if (centroObrigatorio && !v?.centroCustoId) return MSG_CENTRO_OBRIGATORIO;
  // A lista é o que o Compras cota e confere no recebimento; sem ela a pessoa acabava escrevendo o material na descrição.
  if (!itensPreenchidos(v?.itens || []).length) return 'Informe pelo menos um item a comprar (se for um serviço, o nome do serviço serve de item).';
  return null;
}

const PRIORIDADES = ['Alta', 'Média', 'Baixa'];

/** Os campos da solicitação, iguais em qualquer lugar. Controlado: `valor` e `onChange` vêm de quem usa. */
export function CamposSolicitacaoCompra({ valor, onChange }: { valor: any; onChange: (v: any) => void }) {
  const set = (k: string, v: any) => onChange({ ...valor, [k]: v });
  const centroObrigatorio = useCentroObrigatorio();
  return (
    <>
      <div className="form-group">
        <label className="acn-label">Título — o que está sendo comprado *</label>
        <input className="acn-input" autoFocus value={valor.titulo} onChange={e => set('titulo', e.target.value)}
          placeholder="Ex.: Material para a OP A1662.2609" />
      </div>
      <div className="form-group">
        <label className="acn-label">Motivo da compra</label>
        <MencaoTextarea value={valor.descricao} onChange={v => set('descricao', v)} rows={2}
          placeholder="Para que serve, urgência, referências... @Nome para mencionar" />
      </div>
      <ItensDemandaEditor itens={valor.itens} onChange={v => set('itens', v)} titulo="Itens a comprar" comValor
        dica="Valor é opcional: se não souber, o comprador completa." />
      <div className="form-group">
        <label className="acn-label">Prioridade</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {PRIORIDADES.map(p => (
            <Botao key={p} pequeno variante={valor.prioridade === p ? 'primario' : 'secundario'} aria-pressed={valor.prioridade === p}
              onClick={() => set('prioridade', p)}>{p}</Botao>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label className="acn-label">Prazo desejado (opcional)</label>
        <input className="acn-input" type="date" value={valor.prazo} onChange={e => set('prazo', e.target.value)} />
      </div>
      <div className="form-group">
        <label className="acn-label">{centroObrigatorio ? 'Centro de custo *' : 'Centro de custo (opcional)'}</label>
        <CentroCustoSelect value={valor.centroCustoId} onChange={v => set('centroCustoId', v)} style={{ width: '100%' }} />
        <div className="acn-ajuda">{centroObrigatorio ? 'Obrigatório: onde a compra será apontada.' : 'Onde a compra será apontada. Dá para deixar em branco e informar depois.'}</div>
        {/* Etapa 15c: aviso (só aviso) quando o centro já usou 80% do orçamento do mês ou do ano */}
        <AvisoSaldoCentro centroId={valor.centroCustoId} />
      </div>
      <div className="form-group">
        <label className="acn-label">Vincular a um processo (opcional)</label>
        <VinculoPicker value={valor.vinculo} onSelect={v => set('vinculo', v)} onClear={() => set('vinculo', null)} />
        <div className="acn-ajuda">OP, OS, PV, outra compra… A compra com OP vinculada aparece como "Demanda de OP".</div>
      </div>
      <div className="form-group">
        <label className="acn-label">Fornecedor sugerido (opcional)</label>
        <input className="acn-input" value={valor.fornecedor} onChange={e => set('fornecedor', e.target.value)} placeholder="Nome do fornecedor…" />
      </div>
      <div className="form-group">
        <label className="acn-label">Link (opcional)</label>
        <input className="acn-input" value={valor.linkUrl} onChange={e => set('linkUrl', e.target.value)}
          placeholder="https://… (página do produto, especificação, cotação online)" />
      </div>
      <div className="form-group">
        <label className="acn-label">Comprador responsável (opcional)</label>
        <ColaboradorSelect value={valor.comprador} onChange={v => set('comprador', v)} incluirUsuariosDaAba="compras"
          placeholder="Deixe em branco para o Compras definir" style={{ width: '100%' }} />
      </div>
      <div className="form-group">
        <label className="acn-label">Anexos (opcional)</label>
        <EscolherAnexos arquivos={valor.anexos} onChange={a => set('anexos', a)} />
      </div>
      <div className="form-group">
        <label className="acn-label">Observações</label>
        <MencaoTextarea value={valor.observacoes} onChange={v => set('observacoes', v)} rows={2}
          placeholder="Especificações técnicas, referências… @Nome para mencionar" />
      </div>
    </>
  );
}

/**
 * Grava a solicitação — o mesmo caminho para todo mundo. Devolve { id, numero_pedido, errosAnexos } ou { erro }.
 * `contexto` entra no começo das observações (ex.: de qual oportunidade ou licitação veio); `opl` é o número da OP em texto quando não há vínculo.
 */
export async function enviarSolicitacaoCompra({ valor, currentUser, origemSetor = 'Demanda geral', oportunidadeId = null, opl = null, contexto = '' }: any) {
  // a regra vale para TODA solicitação, venha de onde vier (a janela confere antes; esta é a garantia final)
  if (!valor.centroCustoId && await lerCentroObrigatorio()) return { erro: MSG_CENTRO_OBRIGATORIO };
  const itens = itensPreenchidos(valor.itens || []);
  let centro: string | null = null;
  if (valor.centroCustoId) {
    const centros = await fetchCentrosCusto(true);
    const c = centros.find((x: any) => x.id === valor.centroCustoId);
    centro = c ? `${c.codigo} — ${c.nome}` : null;
  }
  const r: any = await criarRequisicaoCompra({
    titulo: valor.titulo, descricao: valor.descricao, itens, prioridade: valor.prioridade, prazo: valor.prazo || null,
    observacoes: [contexto, valor.observacoes].filter(Boolean).join('\n'),
    centro_custo: centro, centro_custo_id: valor.centroCustoId || null,
    vinculo: valor.vinculo || null, opl,
    responsavel_nome: valor.comprador || null,
    fornecedor: valor.fornecedor, linkUrl: valor.linkUrl, oportunidadeId,
    origemSetor, currentUser,
  });
  if (r.erro) return r;
  const errosAnexos = valor.anexos?.length ? await enviarAnexosCompra(r.id, valor.anexos, currentUser) : [];
  // @menções do motivo e das observações, no mesmo contexto das observações da compra (ComprasTab)
  for (const [texto, campo] of [[valor.descricao, 'descricao'], [valor.observacoes, 'observacoes_compra']]) {
    if (!String(texto || '').trim()) continue;
    await salvarMencoes({
      texto, mencionanteId: String(currentUser?.id || currentUser?.email || ''), mencionanteNome: currentUser?.nome || 'Sistema',
      contexto: 'compra', contextoId: String(r.id), contextoDescricao: `Pedido ${r.numero_pedido}`, campo, abaDestino: 'compras',
    });
  }
  return { ...r, errosAnexos };
}

/** A janela da solicitação: o mesmo desenho em qualquer tela. `onCriada(resultado, valor)` roda depois de gravar. */
export function ModalSolicitarCompra({ currentUser, titulo = 'Solicitar compra', subtitulo = '', valorInicial = {}, origemSetor, oportunidadeId = null, opl = null, contexto = '', onClose, onCriada }: any) {
  const [valor, setValor] = useState(() => solicitacaoCompraVazia(valorInicial));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const centroObrigatorio = useCentroObrigatorio();

  const enviar = async () => {
    const falta = validarSolicitacaoCompra(valor, centroObrigatorio);
    if (falta) { setErro(falta); return; }
    setSalvando(true); setErro('');
    const r: any = await enviarSolicitacaoCompra({ valor, currentUser, origemSetor, oportunidadeId, opl, contexto });
    setSalvando(false);
    if (r.erro) { setErro('Não foi possível abrir a requisição de compra: ' + r.erro); return; }
    if (r.errosAnexos?.length) alert('A requisição foi criada, mas alguns anexos não foram enviados: ' + r.errosAnexos.join('; '));
    await onCriada?.(r, valor);
    onClose?.();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 2600 }}>
      <div className="modal-box acn-modal-cadastro acn-sac-jan acn-compra-jan">
        <div className="acn-modal-cab">
          <span className="modal-title">{titulo}</span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          {subtitulo && <div className="acn-ajuda">{subtitulo}</div>}
          <CamposSolicitacaoCompra valor={valor} onChange={setValor} />
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          <Botao variante="primario" onClick={enviar} disabled={salvando}>{salvando ? 'Enviando…' : 'Enviar para Compras'}</Botao>
          <Botao onClick={onClose} disabled={salvando}>Cancelar</Botao>
        </div>
      </div>
    </div>
  );
}
