// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// NovaOpOsModal — criação centralizada de OP (Ordem de Produção) ou OS
// Pode ser chamado de qualquer aba: Comercial/CRM, card CRM, SAC, etc.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { EXT_PLANILHAS, contentTypeUpload } from './FormatosArquivo';
import { ClienteAutocomplete } from './ClienteUtils';
import { FLUXOS, UFS, soEnvio, TIPO_VENDA_ENVIO, fluxoEfetivo, terminaEmEnvio } from './FluxoEntrega';
import { ColaboradorSelect } from './ColaboradorSelect';
import { DEPTOS } from './RhDepartamentos';
import { dividirValorEmUnidades } from './AcnTabShared';
import { ORIGENS, origemDeOportunidade } from './OrigemVenda';
import { GruposLoteMisto, grupoInicial, validarGrupos, unidadesDosGrupos, LETRA, type GrupoLote } from './LoteMisto';
import { ItensVendidosEditor } from './OpItens';
import { itensPreenchidos } from './DemandaItens';
import { hojeISO, Botao } from './Interface';
import { mostrarAviso } from './Feedback';
import { SelectVeiculo } from './VeiculoCadastro';
import { carregarVeiculos } from './Veiculos';
import { modoDoVeiculoOuErro } from './ConfigEstrutura';
import FotosVeiculo from './FotosVeiculo';
import { PerguntasDaVenda, respostasDaUnidade, gravarConfiguracaoDaOp } from './PerguntasDaVenda';
import { recusaPorPerguntasDoCarro } from './OpObrigatorios';
import { CampoCep } from './CampoCep';
import { conferirCepAntesDeSalvar, cepParaGravar } from './Cep';

// ─── Upload inline de anexos (pós-criação da OP) ─────────────────────────────
function UploadAnexosInline({ oplId, oplNumero, currentUser }) {
  const [arquivos, setArquivos] = useState<{nome:string;url:string}[]>([]);
  const [uploading, setUploading] = useState(false);
  // 7.x (14/10/2026): arquivo que não subiu (ou que subiu e não foi registrado na OP) aparecia como se nada tivesse acontecido, ou pior, como "✅" na lista
  const [falhas, setFalhas] = useState<string[]>([]);
  const ref = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList) => {
    setUploading(true);
    setFalhas([]);
    const novasFalhas: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const safe = oplNumero.replace(/[^a-zA-Z0-9-]/g, '_');
      const safeName = f.name.replace(/[^a-zA-Z0-9_\-\.]/g, '_').slice(0, 100);
      const path = `opl-anexos/${safe}/${Date.now()}_${safeName}`;
      const ct = contentTypeUpload(f);
      const { data: up, error } = await supabase.storage.from('acn-media').upload(path, f, { upsert: true, contentType: ct });
      if (error || !up) { novasFalhas.push(`${f.name}: não foi enviado (${error?.message || 'sem resposta'}).`); continue; }
      const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
      const { error: errReg } = await supabase.from('opl_anexos').insert({
        opl_id: oplId, opl_numero: oplNumero, setor: 'Comercial',
        tipo: f.type.startsWith('image/') ? 'foto' : 'documento',
        nome: f.name, url: pub?.publicUrl || '', criado_por: currentUser?.nome,
      });
      if (errReg) { novasFalhas.push(`${f.name}: foi enviado, mas não ficou registrado na OP (${errReg.message}) — os outros setores não vão ver.`); continue; }
      setArquivos(prev => [...prev, { nome: f.name, url: pub?.publicUrl || '' }]);
    }
    setFalhas(novasFalhas);
    if (ref.current) ref.current.value = '';
    setUploading(false);
  };

  return (
    <div>
      <label className={'acn-nop-up' + (uploading ? ' enviando' : '')}>
        {uploading ? 'Enviando...' : '📎 Selecionar Arquivos'}
        <input ref={ref} type="file" multiple disabled={uploading}
          accept={`.pdf,.doc,.docx,${EXT_PLANILHAS},.png,.jpg,.jpeg,.txt`}
          onChange={e => { if (e.target.files?.length) upload(e.target.files); }}
          className="acn-nop-oculto" />
      </label>
      {falhas.length > 0 && (
        <div className="acn-nop-falhas">
          {falhas.map((m, i) => <div key={i}>⚠️ {m}</div>)}
        </div>
      )}
      {arquivos.length > 0 && (
        <div className="acn-nop-arqs">
          {arquivos.map((a,i) => (
            <div key={i} className="acn-nop-arq">
              <span>✅</span>
              <a href={a.url} target="_blank" rel="noreferrer" className="acn-nop-arq-lnk">{a.nome}</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Fluxo de entrega (rota da venda) — decide em qual fila a OP cai depois.
// Tipo de Projeto diz O QUE e o produto. Como e entregue passou a ser o
// Fluxo de Entrega (FluxoEntrega.ts), entao 'Execucao por Terceiro',
// 'Envio de Material para Terceiro' e 'Envio de Produto Vendido' sairam
// daqui: eram rota, nao produto, e manter os dois criterios faria eles
// divergirem (tipo dizendo envio e fluxo dizendo adaptacao, por exemplo).
// OPs antigas com esses valores continuam validas - ver TIPO_LEGADO abaixo.
const TIPOS_PROJETO = [
  { emoji:'🚔', label:'Transformacao Veicular Ostensiva' },
  { emoji:'🥷', label:'Transformacao Veicular Discreta' },
  { emoji:'📻', label:'Radio' },
  { emoji:'📦', label:'Modulo Expansivel' },
  { emoji:'🧰', label:'Venda para Envio' },
  { emoji:'⚓', label:'Flutuante' },
  { emoji:'🔧', label:'Manutencao' },
  { emoji:'⚠️', label:'Garantia' },
  { emoji:'📋', label:'Orcamento' },
  { emoji:'🔀', label:'Demanda Direta para Engenharia' },
  { emoji:'🚚', label:'Reboque' },
];

const TIPOS_OS = [
  'Manutenção Corretiva',
  'Manutenção Preventiva',
  'Instalação',
  'Visita Técnica',
  'Treinamento',
  'Garantia',
  'Suporte Remoto',
  'Outro',
];

// exportada porque o modal de edição da OP (OplEdicao.tsx) oferece os mesmos
// tipos: duas listas separadas sairiam do lugar na primeira vez que alguém
// incluísse um serviço novo aqui e esquecesse do outro lado (24/09/2026)
export const TIPOS_SERVICO_TERCEIRO = ['Película', 'Blindagem', 'Plotagem', 'Pintura', 'Outro'];

const VAZIO = {
  tipo:          'OP',   // 'OP' | 'OS'
  empresa:       'ACN',  // 'ACN' | 'Detech'

  // ── Campos OP ────────────────────────────────────────────────────────────
  pedido_venda:           '',   // 4 dígitos — gera o número da OP automaticamente
  opl:                    '',   // derivado: PPPP.YYMMM  (ou PPPP.YYMMM/01, /02...)
  tipo_projeto:           'Transformacao Veicular Ostensiva',
  origem_venda:           '',   // 'licitacao' | 'venda_direta' — obrigatório (Kanban e Painel TV)
  fluxo_entrega:          '',   // obrigatório: decide se cai na Adaptação, na Fabricação ou vai direto pra envio
  destino_cidade:         '',
  destino_uf:             '',
  destino_cep:            '',
  chassi:                 '',
  placa:                  '',   // sempre ativo
  modelo:                 '',
  veiculo_id:             '',
  quantidade:             1,
  veiculos:               [] as {chassi:string, placa:string, modelo:string}[], // para desmembramento
  valor_total:            '',
  frete_responsavel:      '',   // 'CIF' (empresa paga) | 'FOB' (cliente paga) — só Venda para Envio
  valor_mao_de_obra:      '',
  valor_mao_de_obra_serralheria: '',
  prazo_entrega:          '',
  prazo_garantia:         '',   // texto livre: "12 meses a partir da entrega", etc.
  data_chegada_veiculo:   '',
  observacoes:            '',

  // ── Serviço de Terceiro ───────────────────────────────────────────────────
  servico_terceiro:        false,
  tipos_servico_terceiro:  [] as string[], // múltiplos tipos
  obs_servico_terceiro:    '',

  // ── Resumo dos Serviços ───────────────────────────────────────────────────
  resumo_servicos:        '',
  // O que foi vendido (obrigatório na OP): informa o PCP (a Engenharia só recebe pedidos de desenvolvimento, desde a Etapa 18). No lote, por unidade.
  itens_vendidos:         [] as any[],
  fotos_veiculo:          [] as any[],   // como o carro chegou
  licitacao_id:           null as string | null,   // vem do prefill da Licitação (formação ligada a ela)

  // ── Campos OS ────────────────────────────────────────────────────────────
  tipo_servico:           'Manutenção Corretiva',
  descricao_problema:     '',
  equipamento:            '',
  numero_serie:           '',

  // ── Comum ─────────────────────────────────────────────────────────────────
  cliente_nome:           '',
  _cliente_id:            null,
  responsavel:            '',
  data_entrada:           hojeISO(),
};

interface Props {
  isOpen:            boolean;
  onClose:           () => void;
  onSaved?:          (record: any, tipo: 'op' | 'os') => void;
  currentUser:       any;
  crmCard?:          any; // card CRM para pré-preenchimento e vínculo
}

// 7.x (14/10/2026): o valor digitado era lido tirando TODOS os pontos e trocando a vírgula por ponto — "1500.50" virava 150.050 (cem vezes mais) e texto ("abc", "R$ 45000", "12x") virava vazio, sem avisar.
// Agora: com vírgula, o ponto é separador de milhar ("45.000,50"); sem vírgula, ponto seguido de 3 dígitos é milhar ("45.000") e ponto seguido de 1 ou 2 dígitos é decimal ("1500.50"); "R$" é ignorado;
// o que não for número (ou for negativo) é recusado com a mensagem. Retorna { vazio } quando o campo está em branco.
export function lerValorDigitado(texto: any): { vazio?: true; valor?: number; invalido?: true } {
  const t = String(texto ?? '').replace(/R\$/gi, '').replace(/\s+/g, '');
  if (!t) return { vazio: true };
  let n: string;
  if (t.includes(',')) { if (!/^\d{1,3}(\.\d{3})*,\d+$|^\d+,\d+$/.test(t)) return { invalido: true }; n = t.replace(/\./g, '').replace(',', '.'); }
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) n = t.replace(/\./g, '');
  else if (/^\d+(\.\d{1,2})?$/.test(t)) n = t;
  else return { invalido: true };
  const v = parseFloat(n);
  return Number.isFinite(v) ? { valor: v } : { invalido: true };
}

// Número da OS no padrão do SAC ("OS-0038/2026"). Mesma regra de SacTab.tsx (gerarNumeroOS): primeiro a função atômica do banco; se ela falhar, maior número do ano + 1.
async function gerarNumeroOS(): Promise<string> {
  const { data: rpcData, error: rpcErr } = await supabase.rpc('proximo_numero_os');
  if (!rpcErr && rpcData) return rpcData as string;
  const ano = new Date().getFullYear();
  const { data } = await supabase.from('sac_ordens_servico').select('numero_os').like('numero_os', `OS-%-${ano}`);
  let max = 0;
  for (const row of (data || [])) {
    const m = row.numero_os?.match(/^OS-(\d+)\//);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  return `OS-${String(max + 1).padStart(4, '0')}/${ano}`;
}

export default function NovaOpOsModal({ isOpen, onClose, onSaved, currentUser, crmCard }: Props) {
  const [form, setForm]       = useState({ ...VAZIO });
  // Venda para Envio já define a rota (envio de material): o campo Fluxo de
  // Entrega some e tudo que depende do fluxo usa este valor.
  const ehVendaEnvio = form.tipo_projeto === TIPO_VENDA_ENVIO;
  const fluxoEf = fluxoEfetivo(form.tipo_projeto, form.fluxo_entrega);

  // O formulário se adapta ao tipo de venda: adaptação precisa do veículo, envio
  // nem sempre. Quem decide é a Administração (Etapa 7.2, 28/09/2026).
  // 'oculto' = só o modelo em texto livre; nos outros, só o select de veículo —
  // os dois juntos são a mesma informação pedida duas vezes.
  const [modoVeiculo, setModoVeiculo] = useState('opcional');
  // 7.x (14/10/2026): se a leitura da regra do veículo falhasse, ela voltava "opcional" em silêncio e a OP saía sem o veículo que a Administração exige; agora a falha aparece e barra o salvar até dar certo
  const [modoErro, setModoErro] = useState<string | null>(null);
  const [modoPronto, setModoPronto] = useState(false);
  const [tentativaModo, setTentativaModo] = useState(0);
  useEffect(() => {
    let vivo = true;
    setModoPronto(false);
    modoDoVeiculoOuErro(fluxoEf).then(({ modo, erro }) => { if (!vivo) return; setModoVeiculo(modo); setModoErro(erro); setModoPronto(true); });
    return () => { vivo = false; };
  }, [fluxoEf, tentativaModo]);
  const mostraVeiculo = modoVeiculo !== 'oculto';
  const veiculoObrigatorio = modoVeiculo === 'obrigatorio';
  // Quem paga o frete importa em TODA OP que sai daqui embalada, não só na
  // "Venda para Envio": envio para adaptação de terceiro e fabricação de
  // serralheria com envio também param na embalagem e também precisam saber
  // se abre cotação. Antes só a venda de envio era perguntada, e as outras
  // chegavam no Almoxarifado sem resposta (corrigido em 24/09/2026).
  const precisaFrete = terminaEmEnvio(fluxoEf);

  const [salvando, setSalvando] = useState(false);
  const salvandoRef = useRef(false);   // 7.x (14/10/2026): trava o clique duplo em "Criar" — a conferência do CEP e a do número demoram, e o botão só desabilita depois delas
  const [erro, setErro]       = useState('');
  // Pedido de venda: com PV, a OP se liga à oportunidade do CRM com aquele número
  // (e libera carregar os itens da formação oficial); sem PV, o número da OP é digitado.
  const [semPv, setSemPv]         = useState(false);
  const [pvAchados, setPvAchados] = useState<any[] | null>(null);   // null = ainda não buscou
  const [pvCard, setPvCard]       = useState<any>(null);
  // 7.x (14/10/2026): leitura do CRM que falha parecia "PV não encontrado" e a OP saía sem vínculo; agora o erro aparece, com "Tentar de novo", e barra o salvar
  const [pvErro, setPvErro]       = useState<string | null>(null);
  const [tentativaPv, setTentativaPv] = useState(0);
  // Lote misto: adaptações e itens diferentes entre os veículos do mesmo lote
  const [loteMisto, setLoteMisto] = useState(false);
  const [grupos, setGrupos]       = useState<GrupoLote[]>(grupoInicial(1));
  // Com lote misto ativo, serviços/itens/valor vêm do grupo de cada unidade —
  // os campos únicos (lá embaixo) somem pra não conviver com dois donos do
  // mesmo dado.
  const loteEhMisto = loteMisto && Number(form.quantidade) > 1 && !soEnvio(fluxoEf);
  const [savedOp, setSavedOp] = useState<any>(null); // passo 2: documentos

  // Catálogo de modelos de reboque — cadastrável direto por aqui, fica salvo
  // pra reaproveitar em OPs futuras (tipo_projeto === 'Reboque').
  // para preencher o texto livre de modelo quando um veículo é escolhido
  const [veiculosCarregados, setVeiculosCarregados] = useState<any[]>([]);
  // respostas sobre o carro, por unidade do lote — o índice 0 é o padrão
  const [respostasCarro, setRespostasCarro] = useState<any>({});
  // R8 (13/10/2026): quantas perguntas do carro ainda estão sem resposta (quem avisa é o próprio bloco "Sobre o carro")
  const [perguntasCarroPendentes, setPerguntasCarroPendentes] = useState(0);
  useEffect(() => { carregarVeiculos().then(setVeiculosCarregados); }, []);
  const [modelosReboque, setModelosReboque]   = useState<{id:string,nome:string}[]>([]);
  const [modelosErro, setModelosErro]         = useState<string | null>(null);   // 7.x: leitura que falha deixava a lista vazia sem avisar
  const [novoModeloReboque, setNovoModeloReboque] = useState('');
  const [mostrandoNovoModelo, setMostrandoNovoModelo] = useState(false);

  const fetchModelosReboque = async () => {
    const { data, error } = await supabase.from('oples_reboque_modelos').select('id,nome').eq('ativo', true).order('nome');
    setModelosErro(error ? error.message : null);
    if (!error) setModelosReboque(data || []);   // com erro, mantém o que já estava
  };

  const salvarNovoModeloReboque = async () => {
    const nome = novoModeloReboque.trim();
    if (!nome) return;
    const { error } = await supabase.from('oples_reboque_modelos').insert([{ nome }]);
    if (error && !/duplicate/i.test(error.message)) { alert('Erro ao salvar modelo: ' + error.message); return; }
    setF('modelo', nome);
    setNovoModeloReboque('');
    setMostrandoNovoModelo(false);
    fetchModelosReboque();
  };

  // Prefill lido UMA vez por abertura e guardado aqui: em desenvolvimento o
  // StrictMode roda este efeito duas vezes — a 1ª lia e apagava a chave, a 2ª
  // não achava mais nada e zerava o formulário. O ref sobrevive às duas.
  const prefillRef = useRef<any>(undefined);   // undefined = ainda não lido nesta abertura

  // Pré-preenche quando crmCard muda
  useEffect(() => {
    if (!isOpen) { prefillRef.current = undefined; return; }
    setSavedOp(null);
    setLoteMisto(false);
    setGrupos(grupoInicial(1));
    fetchModelosReboque();
    // Prefill vindo de uma Licitação (pedido de entrega → "Gerar OP"), gravado no
    // localStorage. Lido AQUI, na abertura, e aplicado por ÚLTIMO: antes era um
    // efeito separado que rodava primeiro, e este aqui zerava o formulário logo
    // depois — o prefill nunca chegava na tela (nem o do antigo "Preparar OP").
    if (prefillRef.current === undefined) {
      let lido: any = null;
      try {
        const bruto = localStorage.getItem('acn_nova_op_prefill');
        if (bruto) { localStorage.removeItem('acn_nova_op_prefill'); lido = JSON.parse(bruto); }
      } catch { /* prefill é conveniência: se falhar, abre em branco mesmo */ }
      prefillRef.current = lido;
    }
    const pre = prefillRef.current;
    if (crmCard) {
      setForm(f => ({
        ...f,
        cliente_nome: crmCard.orgao || crmCard.titulo || '',
        _cliente_id:  crmCard.cliente_id || null,
        responsavel:  crmCard.responsavel_nome || '',
        observacoes:  crmCard.titulo || '',
        origem_venda: origemDeOportunidade(crmCard),
        // dados do card (PV): empresa, valor, fluxo e destino
        ...(crmCard.empresa_vencedora || crmCard.faturamento_empresa
          ? { empresa: /detech/i.test(crmCard.empresa_vencedora || crmCard.faturamento_empresa) ? 'Detech' : 'ACN' } : {}),
        ...(crmCard.valor_registrado != null ? { valor_total: String(crmCard.valor_registrado).replace('.', ',') } : {}),
        ...(crmCard.fluxo_entrega ? { fluxo_entrega: crmCard.fluxo_entrega } : {}),
        ...(crmCard.destino_cidade ? { destino_cidade: crmCard.destino_cidade } : {}),
        ...(crmCard.destino_uf ? { destino_uf: crmCard.destino_uf } : {}),
        ...(crmCard.destino_cep ? { destino_cep: crmCard.destino_cep } : {}),
        ...(crmCard.prazo_entrega_comercial ? { prazo_entrega: String(crmCard.prazo_entrega_comercial).slice(0, 10) } : {}),
        ...(crmCard.ctrl_prazo_garantia ? { prazo_garantia: crmCard.ctrl_prazo_garantia } : {}),
        ...(pre || {}),
      }));
      if (Number(crmCard.quantidade) > 1) setF('quantidade', Number(crmCard.quantidade));
      // card com PV: já preenche o pedido de venda (e o número da OP)
      const pvDoCard = String(crmCard.numero_pv || '').replace(/\D/g, '').slice(0, 4);
      if (pvDoCard) setF('pedido_venda', pvDoCard);
    } else {
      setForm({ ...VAZIO, data_entrada: hojeISO(), ...(pre || {}) });
    }
    setSemPv(false); setPvAchados(null); setPvCard(null); setPvErro(null);
    setErro('');
  }, [isOpen, crmCard?.id]);

  useEffect(() => {
    const pv = String(form.pedido_venda || '');
    if (!isOpen || semPv || crmCard || pv.length !== 4) { setPvAchados(null); setPvCard(null); setPvErro(null); return; }
    let vivo = true;
    setPvErro(null); setPvAchados(null);
    supabase.from('crm_oportunidades').select('id,titulo,numero_pv,responsavel_nome,orgao,cliente_id,funil')
      .eq('numero_pv', pv).limit(5)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) { setPvErro(error.message); setPvAchados(null); setPvCard(null); return; }
        const lista = data || [];
        setPvAchados(lista);
        setPvCard(lista.length === 1 ? lista[0] : null);
      });
    return () => { vivo = false; };
  }, [form.pedido_venda, semPv, isOpen, crmCard?.id, tentativaPv]);
  const oportunidadeVinculada = crmCard || pvCard;

  const setF = (k: string, v: any) => setForm(f => {
    const next = { ...f, [k]: v };
    // Ao digitar pedido_venda, deriva o número da OP automaticamente
    // Número da OP: A (ACN) ou D (Detech) + PV + "." + ano + mês (ex.: A1651.2609).
    // Trocar a empresa troca a letra.
    if (k === 'pedido_venda' || (k === 'empresa' && f.pedido_venda)) {
      const pv = String(k === 'pedido_venda' ? v : f.pedido_venda).replace(/\D/g,'').slice(0,4);
      const now = new Date();
      const yy = String(now.getFullYear()).slice(-2);
      const mm = String(now.getMonth() + 1).padStart(2,'0');
      const letra = /detech/i.test(k === 'empresa' ? v : next.empresa) ? 'D' : 'A';
      next.opl = pv ? `${letra}${pv.padStart(4,'0')}.${yy}${mm}` : '';
    }
    // Ao mudar quantidade, ajusta o array veiculos
    if (k === 'quantidade') {
      const qty = Math.max(1, parseInt(v) || 1);
      const prev = f.veiculos || [];
      const veiculos = Array.from({ length: qty }, (_, i) => prev[i] || { chassi:'', placa:'', modelo:'', veiculo_id:'' });
      next.veiculos = veiculos;
    }
    return next;
  });

  // 7.x (14/10/2026): o clique duplo em "Criar" gravava duas vezes quando a conferência do CEP demorava (o banco barra o número repetido, mas a pessoa via um erro de "chave duplicada" com a OP já criada)
  const salvar = async () => {
    if (salvandoRef.current) return;
    salvandoRef.current = true;
    try { await executarSalvar(); } finally { salvandoRef.current = false; }
  };

  const executarSalvar = async () => {
    setErro('');
    if (!form.cliente_nome.trim()) { setErro('Informe o cliente.'); return; }
    if (form.tipo === 'OP' && !form.opl.trim()) {
      setErro(semPv ? 'Informe o número da OP.' : 'Informe o pedido de venda (4 dígitos) ou marque "OP sem pedido de venda".'); return;
    }
    if (form.tipo === 'OS' && !form.descricao_problema.trim()) { setErro('Descreva o problema/serviço.'); return; }
    if (!form.prazo_entrega) { setErro('Informe o prazo de entrega.'); return; }
    if (!form.responsavel.trim()) { setErro('Informe o responsável.'); return; }
    // Sem fluxo de entrega a OP não tem como ser roteada e acabaria caindo na
    // Adaptação por omissão — que é justamente o problema que isto resolve.
    if (form.tipo === 'OP' && !fluxoEf) { setErro('Selecione o Fluxo de Entrega.'); return; }
    if (form.tipo === 'OP' && !form.origem_venda) { setErro('Informe a origem da venda: Licitação ou Venda direta.'); return; }
    // Veículo obrigatório é por tipo de venda, configurado na Administração:
    // adaptação precisa saber qual carro; envio de material nem sempre.
    if (form.tipo === 'OP' && modoErro) { setErro(`Não foi possível conferir se este tipo de venda exige o veículo (${modoErro}). Toque em "Tentar de novo" antes de criar a OP.`); return; }
    if (form.tipo === 'OP' && !modoPronto) { setErro('Aguarde um instante: conferindo se este tipo de venda exige o veículo.'); return; }
    // 7.x (14/10/2026): a lista de unidades (form.veiculos) só existe quando a quantidade passa de 1 — com UM veículo ela vinha vazia, "faltaEmAlguma" dava falso e o veículo obrigatório nunca barrava (desde 28/09/2026, 7 OPs de Adaptação na matriz saíram sem veículo).
    // Agora a conferência olha uma unidade por veículo do lote, e só o cabeçalho quando não há lote. Venda para Envio não tem veículo neste formulário e não é conferida.
    if (form.tipo === 'OP' && veiculoObrigatorio && !ehVendaEnvio) {
      const faltaNoCabecalho = !form.veiculo_id;
      const qtdVeic = Math.max(1, parseInt(String(form.quantidade)) || 1);
      const unidades: any[] = qtdVeic > 1 && !soEnvio(fluxoEf) ? Array.from({ length: qtdVeic }, (_, i) => (form.veiculos || [])[i]) : [undefined];
      const faltaEmAlguma = unidades.some(u => !(u?.veiculo_id || form.veiculo_id));
      if (faltaNoCabecalho && faltaEmAlguma) {
        setErro('Este tipo de venda exige o veículo. Escolha o veículo do catálogo (ou cadastre no "+ Novo").');
        return;
      }
      if (faltaEmAlguma) { setErro('Há unidade do lote sem veículo. Escolha o veículo de cada carro.'); return; }
    }
    // 7.x (14/10/2026): quantidade e valores precisam ser números de verdade (antes "0", vazio e "2,5" viravam 1 sem aviso e valor ilegível virava vazio)
    if (form.tipo === 'OP') {
      if (!/^\d+$/.test(String(form.quantidade).trim()) || parseInt(String(form.quantidade)) < 1) { setErro('Informe a quantidade: um número inteiro, de 1 em diante.'); return; }
      const camposValor: [string, any][] = [['Valor Total', form.valor_total]];
      if (!ehVendaEnvio) camposValor.push(['Valor M.O.', form.valor_mao_de_obra], ['Valor M.O. Serralheria', form.valor_mao_de_obra_serralheria]);
      for (const [rotulo, texto] of camposValor) {
        if (lerValorDigitado(texto).invalido) { setErro(`${rotulo} inválido: "${String(texto).trim()}". Use só números, por exemplo 45000 ou 45.000,50.`); return; }
      }
      // PV digitado: a conferência no CRM precisa ter terminado e dado certo (antes, leitura com erro ou ainda em andamento criava a OP sem vínculo, em silêncio)
      if (!semPv && !crmCard && String(form.pedido_venda || '').length === 4) {
        if (pvErro) { setErro(`Não foi possível conferir o pedido de venda no CRM (${pvErro}). Toque em "Tentar de novo" antes de criar a OP.`); return; }
        if (pvAchados === null) { setErro('Aguarde um instante: conferindo o pedido de venda no CRM.'); return; }
      }
    }
    if (precisaFrete && !form.frete_responsavel) { setErro('Informe quem paga o frete: CIF (empresa) ou FOB (cliente).'); return; }
    // Lote misto: cada grupo tem seus próprios itens (validado em validarGrupos,
    // mais abaixo) — a lista única daqui não vale nesse caso.
    if (form.tipo === 'OP' && !loteEhMisto && itensPreenchidos(form.itens_vendidos || []).length === 0) {
      setErro('Informe pelo menos 1 item vendido (o que o PCP vai receber para esta OP).'); return;
    }
    // R8 (13/10/2026, decisão do usuário de 01/10/2026): quem abre a OP é quem sabe a resposta, e o PCP deve receber tudo respondido. Só vale quando o bloco "Sobre o carro"
    // aparece (a venda leva o Conjunto Elétrico e algum item tem pergunta) e há veículo escolhido — sem veículo as respostas nem são gravadas. Lote misto não mostra o bloco.
    const recusaCarro = recusaPorPerguntasDoCarro({
      tipo: form.tipo, loteMisto: loteEhMisto, pendentes: perguntasCarroPendentes,
      temVeiculo: !!form.veiculo_id || (form.veiculos || []).some((u: any) => !!u?.veiculo_id),
    });
    if (recusaCarro) { setErro(recusaCarro); return; }
    // R17 (13/10/2026): o CEP de entrega, quando informado, precisa ser válido (a mesma conferência da embalagem); continua opcional aqui
    if (form.tipo === 'OP') {
      const recusaCep = await conferirCepAntesDeSalvar(form.destino_cep, 'CEP de entrega');
      if (recusaCep) { setErro(recusaCep); return; }
    }


    setSalvando(true);
    try {
      if (form.tipo === 'OP') {
        const baseOpl = form.opl.trim();
        const qty = Math.max(1, parseInt(String(form.quantidade)) || 1);
        // O lote (/01, /02...) existe para acompanhar CADA VEÍCULO pela
        // produção. Venda que vai direto para envio (kit, material) não entra
        // na produção: desmembrar só criaria N OPs, N embalagens e N pedidos
        // de frete para uma remessa só. Nesse caso sai UMA OP com a quantidade.
        const semLote = soEnvio(fluxoEf);
        const desmembrar = qty > 1 && !semLote;
        const misto = desmembrar && loteMisto;
        if (misto) {
          const errGrupos = validarGrupos(grupos, qty);
          if (errGrupos) { setErro(errGrupos); setSalvando(false); return; }
        }

        // Número repetido: confere todos os números que serão criados (no lote, cada /NN),
        // antes de gravar — senão o lote parava no meio ao bater num número já existente
        const numeros = desmembrar ? Array.from({ length: qty }, (_, i) => `${baseOpl}/${String(i + 1).padStart(2, '0')}`) : [baseOpl];
        const { data: existentes, error: errExistentes } = await supabase.from('oples').select('opl').in('opl', numeros);
        // 7.x: leitura que falha pulava a conferência do número repetido em silêncio — num lote, a gravação parava no meio ao bater num número existente
        if (errExistentes) { setErro(`Não foi possível conferir se o número da OP já existe (${errExistentes.message}). Tente de novo.`); setSalvando(false); return; }
        if (existentes?.length) {
          setErro(`Já existe OP com este número: ${existentes.map((e: any) => e.opl).join(', ')}. Use um número diferente.`);
          setSalvando(false);
          return;
        }

        const parseMoedaOuNull = (v: any) => { const r = lerValorDigitado(v); return r.valor !== undefined ? r.valor : null; };

        const makePayload = (oplNum: string, veiculo?: {chassi:string, placa:string, modelo?:string, veiculo_id?:string}, valores?: {total: number|null, mo: number|null, moSerr: number|null}) => ({
          opl:                    oplNum,
          tipo_op:                'OPL',
          faturamento_empresa:    form.empresa,
          tipo_projeto:           form.tipo_projeto,
          origem_venda:           form.origem_venda || null,
          fluxo_entrega:          fluxoEf || null,
          destino_cidade:         form.destino_cidade?.trim() || null,
          destino_uf:             form.destino_uf || null,
          destino_cep:            cepParaGravar(form.destino_cep),
          chassi:                 ehVendaEnvio ? null : ((veiculo?.chassi || form.chassi) || null),
          placa:                  ehVendaEnvio ? null : ((veiculo?.placa  || form.placa)  || null),
          modelo:                 ehVendaEnvio ? null : ((veiculo?.modelo || form.modelo) || null),
          veiculo_id:             ehVendaEnvio ? null : ((veiculo?.veiculo_id || form.veiculo_id) || null),
          quantidade:             semLote ? qty : 1,
          frete_responsavel:      precisaFrete ? (form.frete_responsavel || null) : null,
          valor_total:            valores ? valores.total : parseMoedaOuNull(form.valor_total),
          valor_mao_de_obra:      ehVendaEnvio ? null : (valores ? valores.mo    : parseMoedaOuNull(form.valor_mao_de_obra)),
          valor_mao_de_obra_serralheria: ehVendaEnvio ? null : (valores ? valores.moSerr : parseMoedaOuNull(form.valor_mao_de_obra_serralheria)),
          data_entrada:           form.data_entrada,
          data_prevista_entrega:  form.prazo_entrega || null,
          prazo_garantia:         form.prazo_garantia?.trim() || null,
          data_chegada_veiculo:   ehVendaEnvio ? null : (form.data_chegada_veiculo || null),
          cliente_nome:           form.cliente_nome.trim(),
          responsavel_comercial:  form.responsavel.trim(),
          observacoes_comercial:  form.observacoes || null,
          // Etapa 18e (13/10/2026): a OP nasce direto no PCP (decisão do usuário em 12/10/2026: a Engenharia só recebe pedidos de desenvolvimento)
          status_geral:           'Em Espera PCP',
          data_chegada_pcp:       new Date().toISOString(),   // ponto de partida do relógio do PCP
          criado_por:             currentUser?.email,
          criado_por_nome:        currentUser?.nome,
          crm_oportunidade_id:    oportunidadeVinculada?.id || null,
          // 09/10/2026 (pedido do usuário): a OP lançada a partir de uma licitação Vencida guarda de qual licitação veio — o prefill da Licitação (botão "Lançar OP" e "Gerar OP"
          // do pedido) já trazia o id, mas ele só servia para carregar os itens da formação de preços e nunca era gravado
          licitacao_id:           form.licitacao_id || null,
          servico_terceiro:       !ehVendaEnvio && !!form.servico_terceiro,
          ...(!ehVendaEnvio && form.servico_terceiro && form.tipos_servico_terceiro.length > 0
            ? { tipos_servico_terceiro: form.tipos_servico_terceiro }
            : {}),
          tipo_servico_terceiro:  !ehVendaEnvio && form.servico_terceiro && form.tipos_servico_terceiro.length ? form.tipos_servico_terceiro[0] : null,
          obs_servico_terceiro:   (!ehVendaEnvio && form.servico_terceiro && form.tipos_servico_terceiro.includes('Outro')) ? (form.obs_servico_terceiro || null) : null,
          resumo_servicos:        form.resumo_servicos || null,
          itens_vendidos:         itensPreenchidos(form.itens_vendidos || []),
          // as fotos valem para toda unidade do lote: é o mesmo lote de carros
          // que chegou, fotografado na entrada
          fotos_veiculo:          ehVendaEnvio ? [] : (form.fotos_veiculo || []),
        });

        let firstData: any;
        const criadas: string[] = [];   // 7.x: o lote é gravado uma OP por vez; se uma falha no meio, a pessoa precisa saber quais já existem
        const avisosConfig: string[] = [];
        if (desmembrar) {
          // Criar uma OP por veículo com sufixo /01, /02... — valor dividido
          // igualmente entre as unidades (resto de arredondamento na última).
          const veiculos = form.veiculos || [];
          const valoresTotal = dividirValorEmUnidades(parseMoedaOuNull(form.valor_total), qty);
          const valoresMO     = dividirValorEmUnidades(parseMoedaOuNull(form.valor_mao_de_obra), qty);
          const valoresMOSerr = dividirValorEmUnidades(parseMoedaOuNull(form.valor_mao_de_obra_serralheria), qty);
          const unidades = misto ? unidadesDosGrupos(grupos) : null;
          for (let i = 0; i < qty; i++) {
            const suf = String(i + 1).padStart(2, '0');
            const payload: any = makePayload(`${baseOpl}/${suf}`, veiculos[i], { total: valoresTotal[i], mo: valoresMO[i], moSerr: valoresMOSerr[i] });
            if (unidades) {
              // lote misto: serviços, itens vendidos (e valor, se informado por grupo) da unidade vêm do grupo
              payload.resumo_servicos = unidades[i].servicos;
              payload.itens_vendidos = unidades[i].itens;
              if (unidades[i].valor != null) payload.valor_total = unidades[i].valor;
            }
            const { data, error } = await supabase.from('oples')
              .insert([payload])
              .select().single();
            if (error) {
              if (criadas.length) {
                throw new Error(`A OP ${baseOpl}/${suf} não foi criada (${error.message}). Já foram criadas: ${criadas.join(', ')}. Não crie o lote de novo. Para criar as que faltam, marque "OP sem pedido de venda" e digite o número completo de cada uma (por exemplo ${baseOpl}/${suf}), com quantidade 1.`);
              }
              throw error;
            }
            criadas.push(`${baseOpl}/${suf}`);
            // a OP só existe agora, então é aqui que as respostas e o material
            // são gravados — no formulário ainda não havia id
            const falhaConfig = await gravarConfiguracaoDaOp({
              opl: data, respostas: respostasDaUnidade(respostasCarro, i),
              currentUser,
            });
            if (falhaConfig) avisosConfig.push(`${data.opl}: ${falhaConfig}`);
            if (i === 0) firstData = data;
          }
          onSaved?.(firstData, 'op');
          alert(`${qty} OPs criadas: ${baseOpl}/01 até ${baseOpl}/${String(qty).padStart(2,'0')}`);
          // 7.x: as respostas sobre o carro e a lista de material são gravadas depois da OP; se falharem, a OP existe e a pessoa precisa saber
          if (avisosConfig.length) mostrarAviso(`As OPs foram criadas, mas nem tudo foi gravado:\n${avisosConfig.join('\n')}\nAbra a OP e confira as respostas sobre o carro e a lista de material.`, 'atencao');
          onClose();
          return;
        } else {
          const { data, error } = await supabase.from('oples').insert([makePayload(baseOpl)]).select().single();
          if (error) throw error;
          const falhaConfig = await gravarConfiguracaoDaOp({
            opl: data, respostas: respostasDaUnidade(respostasCarro, 0), currentUser,
          });
          // 7.x: a OP já existe; se as respostas sobre o carro ou a lista de material não foram gravadas, o aviso fica na tela (aviso solto, porque quem chamou pode fechar este modal em seguida)
          if (falhaConfig) mostrarAviso(`A OP ${data.opl} foi criada, mas nem tudo foi gravado: ${falhaConfig}\nAbra a OP e confira as respostas sobre o carro e a lista de material.`, 'atencao');
          onSaved?.(data, 'op');
          setSavedOp(data);
          return; // vai para o passo 2 (documentos) em vez de fechar
        }
      } else {
        // Correção de 07/10/2026 (erro "Could not find the 'criado_por' column of 'sac_ordens_servico'" mostrado à Letícia ao lançar a OS pelo card do CRM):
        // este caminho foi escrito em 23/07 com nomes de coluna que a tabela nunca teve (criado_por, descricao_problema, equipamento, data_prevista) e sem gerar o
        // número da OS; por isso nenhuma OS saiu daqui — as que existem vieram da tela do SAC. Agora grava nas colunas reais e gera o número como o SAC faz.
        const payloadBase: any = {
          tipo_servico:         form.tipo_servico,
          defeito_reclamado:    form.descricao_problema.trim(),
          equipamento_nome:     form.equipamento || null,
          numero_serie:         form.numero_serie || null,
          empresa:              form.empresa,
          cliente_nome:         form.cliente_nome.trim(),
          responsavel_nome:     form.responsavel.trim(),
          data_abertura:        form.data_entrada,
          data_prevista_entrega: form.prazo_entrega || null,
          observacoes:          form.observacoes || null,
          resumo_servicos:      form.resumo_servicos || null,
          status:               'Aberta',
          criado_por_nome:      currentUser?.nome,
          criado_por_email:     currentUser?.email,
          atualizado_em:        new Date().toISOString(),
          crm_oportunidade_id:  crmCard?.id || null,
        };
        // Se o número sorteado já existir (23505), gera o próximo e tenta de novo, como no SAC.
        let data: any = null;
        for (let tentativa = 0; tentativa < 5; tentativa++) {
          const numero_os = await gerarNumeroOS();
          const r = await supabase.from('sac_ordens_servico').insert([{ ...payloadBase, numero_os }]).select().single();
          if (!r.error) { data = r.data; break; }
          if (r.error.code !== '23505') throw r.error;
        }
        if (!data) throw new Error('Não foi possível gerar um número de OS único. Tente de novo.');
        onSaved?.(data, 'os');
      }
      onClose();
    } catch (e: any) {
      setErro(e.message || 'Erro ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  if (!isOpen) return null;

  // ── Passo 2: documentos após OP criada ──────────────────────────────────────
  if (savedOp) {
    return (
      <div className="acn-nop-ov">
        <div className="acn-nop-modal acn-nop-modal-2">
          <div className="acn-nop-cab acn-nop-cab-2">
            <div className="acn-nop-cab-ic">📎</div>
            <div className="acn-nop-cab-meio">
              <div className="acn-nop-cab-sup acn-nop-cab-sup-2">OP CRIADA COM SUCESSO</div>
              <div className="acn-nop-cab-tit">Anexar Documentos — {savedOp.opl}</div>
            </div>
          </div>
          <div className="acn-nop-p2-corpo">
            <div className="acn-nop-ok">
              ✅ OP <strong>{savedOp.opl}</strong> criada! Agora você pode anexar documentos (proposta, orçamento, fotos) que acompanharão esta OP em todos os setores.
            </div>
            <UploadAnexosInline oplId={savedOp.id} oplNumero={savedOp.opl} currentUser={currentUser} />
          </div>
          <div className="acn-nop-rodape">
            <Botao variante="secundario" className="acn-nop-b-rod" onClick={onClose}>
              Pular
            </Botao>
            <Botao variante="primario" className="acn-nop-b-rod acn-nop-b-rod-p" onClick={onClose}>
              ✅ Concluir
            </Botao>
          </div>
        </div>
      </div>
    );
  }

  const isOP = form.tipo === 'OP';

  return (
    <div className="acn-nop-ov">
      <div className="acn-nop-modal acn-nop-modal-1">

        {/* Header */}
        <div className="acn-nop-cab">
          <div className="acn-nop-cab-ic">{isOP ? '🔧' : '📋'}</div>
          <div className="acn-nop-cab-meio">
            <div className="acn-nop-cab-sup">
              {crmCard ? `VINCULADO: ${crmCard.titulo}` : 'GERAÇÃO CENTRALIZADA'}
            </div>
            <div className="acn-nop-cab-tit">Nova {isOP ? 'Ordem de Produção (OP)' : 'Ordem de Serviço (OS)'}</div>
          </div>
          <Botao className="acn-nop-b acn-nop-fechar" onClick={onClose}>✕</Botao>
        </div>

        {/* Body */}
        <div className="acn-nop-corpo">

          {/* Tipo + Empresa */}
          <div className="acn-nop-gr g2 m12">
            <div>
              <div className="acn-nop-rot r4">Tipo de Documento *</div>
              <div className="acn-nop-togs">
                {(['OP','OS'] as const).map(t => (
                  <label key={t} className={'acn-nop-tog' + (form.tipo===t ? ' sel' : '')}>
                    <input type="radio" name="tipo" value={t} checked={form.tipo===t}
                      onChange={() => setF('tipo', t)} className="acn-nop-oculto" />
                    {t === 'OP' ? '🔧' : '📋'} {t}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="acn-nop-rot r4">Empresa *</div>
              <div className="acn-nop-togs">
                {(['ACN','Detech'] as const).map(e => (
                  <label key={e} className={'acn-nop-tog' + (form.empresa===e ? ' sel' : '')}>
                    <input type="radio" name="empresa" value={e} checked={form.empresa===e}
                      onChange={() => setF('empresa', e)} className="acn-nop-oculto" />
                    {e}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Cliente */}
          <div className="acn-nop-bl">
            <div className="acn-nop-rot">Cliente *</div>
            <ClienteAutocomplete
              value={form.cliente_nome}
              onChange={v => setF('cliente_nome', v)}
              onSelect={c => setForm(f => ({ ...f, cliente_nome: c.nome, _cliente_id: c.id }))}
              placeholder="Nome do cliente..."
            />
          </div>

          {/* Campos OP */}
          {isOP && (
            <>
              {/* ITENS VENDIDOS VÊM PRIMEIRO — pedido do usuário em 26/09/2026.
                  Não é gosto de tela: são os itens que decidem quais perguntas
                  cada carro vai receber (a árvore de configuração). Preenchê-los
                  depois do veículo obrigaria a voltar e refazer. No lote misto a
                  lista de cada grupo continua sendo editada lá embaixo. */}
              {!loteEhMisto && (
                <div className="acn-nop-itens">
                  <div className="acn-nop-rot-box">
                    1 · O QUE FOI VENDIDO
                  </div>
                  <ItensVendidosEditor itens={form.itens_vendidos || []} onChange={v => setF('itens_vendidos', v)}
                    crmId={oportunidadeVinculada?.id || null} licitacaoId={form.licitacao_id || null}
                    unidades={Number(form.quantidade) > 1 && !soEnvio(fluxoEf) ? Number(form.quantidade) : 1} />
                </div>
              )}

              {/* As perguntas sobre o carro vêm dos itens vendidos e são
                  respondidas aqui, pelo vendedor — ele é quem está com o
                  cliente. Só aparecem quando a venda leva Conjunto de
                  Instalação (regra de 28/09/2026). */}
              {!loteEhMisto && (
                <PerguntasDaVenda itensVendidos={form.itens_vendidos || []}
                  veiculoId={form.veiculo_id}
                  unidades={Number(form.quantidade) || 1}
                  loteMisto={loteMisto && Number(form.quantidade) > 1 && !soEnvio(fluxoEf)}
                  respostas={respostasCarro} onChange={setRespostasCarro} onPendentes={setPerguntasCarroPendentes} />
              )}

              {/* Fotos de como o carro chegou. Só faz sentido quando há carro:
                  venda de envio não tem veículo aqui (28/09/2026). */}
              {!ehVendaEnvio && (
                <FotosVeiculo valor={form.fotos_veiculo} currentUser={currentUser}
                  onChange={v => setF('fotos_veiculo', v)} />
              )}

              {/* Número OP: Pedido de Venda → PPPP.YYMMM */}
              <div className="acn-nop-gr g2">
                <div>
                  {semPv ? (
                    <>
                      <div className="acn-nop-rot">Número da OP * (sem pedido de venda)</div>
                      <input className="acn-input acn-nop-w" placeholder="Ex: 0000.2609 ou A1530.2608" aria-label="Número da OP"
                        value={form.opl} onChange={e => setForm(f => ({ ...f, opl: e.target.value.trimStart() }))} />
                    </>
                  ) : (
                    <>
                      <div className="acn-nop-rot">N° Pedido de Venda * (4 dígitos)</div>
                      <input className="acn-input acn-nop-w" placeholder="Ex: 1212" maxLength={4} aria-label="Pedido de venda"
                        value={form.pedido_venda} onChange={e => setF('pedido_venda', e.target.value.replace(/\D/g,''))} />
                    </>
                  )}
                  <label className="acn-nop-chk">
                    <input type="checkbox" checked={semPv} disabled={!!crmCard?.numero_pv}
                      onChange={e => { const v = e.target.checked; setSemPv(v); setForm(f => ({ ...f, pedido_venda: '', opl: '' })); }} />
                    OP sem pedido de venda
                  </label>
                  {!semPv && crmCard && (
                    <div className="acn-nop-pv-nota ok">🔗 Vinculada ao card do CRM: {crmCard.titulo}</div>
                  )}
                  {!semPv && !crmCard && pvErro && (
                    <div className="acn-nop-pv-nota erro">
                      ⚠️ Não foi possível conferir o PV {form.pedido_venda} no CRM ({pvErro}).{' '}
                      <Botao className="acn-nop-b acn-nop-lnk" onClick={() => setTentativaPv(n => n + 1)}>Tentar de novo</Botao>
                    </div>
                  )}
                  {!semPv && !crmCard && pvAchados && (
                    pvAchados.length === 0 ? (
                      <div className="acn-nop-pv-nota aviso">PV {form.pedido_venda} não encontrado no CRM — a OP será criada sem vínculo.</div>
                    ) : pvAchados.length === 1 ? (
                      <div className="acn-nop-pv-nota ok">🔗 Vinculada ao PV {pvCard?.numero_pv}: {pvCard?.titulo}</div>
                    ) : (
                      <div className="acn-nop-pv-varias">
                        <div className="acn-nop-pv-nota aviso sem-margem">Mais de uma oportunidade com o PV {form.pedido_venda}. Escolha:</div>
                        <select className="acn-input acn-nop-w acn-nop-sel-p" aria-label="Oportunidade do PV"
                          value={pvCard?.id || ''} onChange={e => setPvCard(pvAchados.find(x => x.id === e.target.value) || null)}>
                          <option value="">— nenhuma (sem vínculo) —</option>
                          {pvAchados.map(x => <option key={x.id} value={x.id}>{x.titulo}</option>)}
                        </select>
                      </div>
                    )
                  )}
                </div>
                <div>
                  <div className="acn-nop-rot">Número OP gerado</div>
                  <div className={'acn-nop-opl' + (form.opl ? ' ok' : '')}>
                    {form.opl || 'A0000.AAMM'}
                    {form.opl && Number(form.quantidade) > 1 && !soEnvio(fluxoEf) && (
                      <span className="acn-nop-opl-lote">
                        → /01…/{String(form.quantidade).padStart(2,'0')}
                      </span>
                    )}
                    {form.opl && Number(form.quantidade) > 1 && soEnvio(fluxoEf) && (
                      <span className="acn-nop-opl-un">
                        · 1 OP com {form.quantidade} un.
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* Origem da venda — aparece no Kanban da Adaptação e no Painel TV */}
              <div className="acn-nop-bl">
                <div className="acn-nop-rot r4">
                  Origem da venda *{crmCard && <span className="acn-nop-rot-sub"> · definida pelo funil do CRM</span>}
                </div>
                <div className="acn-nop-togs">
                  {ORIGENS.map(o => (
                    <Botao key={o.valor} className={'acn-nop-b acn-nop-origem' + (form.origem_venda === o.valor ? ' sel' : '')} data-origem={o.valor}
                      onClick={() => setF('origem_venda', o.valor)}>
                      {o.emoji} {o.label}
                    </Botao>
                  ))}
                </div>
              </div>
              <div className="acn-nop-gr g21">
                <div>
                  <div className="acn-nop-rot">Tipo de Projeto *</div>
                  <select className="acn-input acn-nop-w" value={form.tipo_projeto}
                    onChange={e => setF('tipo_projeto', e.target.value)}>
                    {TIPOS_PROJETO.map(t => (
                      <option key={t.label} value={t.label}>{t.emoji} {t.label}</option>
                    ))}
                    {/* OP antiga com tipo que saiu da lista continua exibindo o
                        proprio valor, em vez de aparecer em branco. */}
                    {form.tipo_projeto && !TIPOS_PROJETO.some(t => t.label === form.tipo_projeto) && (
                      <option value={form.tipo_projeto}>{form.tipo_projeto} (descontinuado)</option>
                    )}
                  </select>
                </div>
                <div>
                  <div className="acn-nop-rot">
                    {soEnvio(fluxoEf) ? 'Quantidade' : 'Qtd. Veículos'}
                  </div>
                  <input className="acn-input acn-nop-w" type="number" min={1}
                    value={form.quantidade} onChange={e => setF('quantidade', e.target.value)} />
                </div>
              </div>

              {/* Fluxo de entrega — é o que impede que item de puro envio caia na
                  fila da Adaptação. Sem isso preenchido a OP não é criada. */}
              {ehVendaEnvio ? (
                <div className="acn-nop-fluxo-env">
                  🚦 Fluxo de entrega: <strong>Envio de material</strong> (automático em Venda para Envio)
                </div>
              ) : (
              <div className="acn-nop-fluxo">
                <div className="acn-nop-fluxo-tit">🚦 Fluxo de Entrega *</div>
                <select className="acn-input acn-nop-w" value={form.fluxo_entrega}
                  onChange={e => setF('fluxo_entrega', e.target.value)}>
                  <option value="">— Selecione como esta venda será entregue —</option>
                  {FLUXOS.map(f => <option key={f.valor} value={f.valor}>{f.label}</option>)}
                </select>
                <div className="acn-nop-fluxo-aj">
                  {form.fluxo_entrega
                    ? FLUXOS.find(f => f.valor === form.fluxo_entrega)?.ajuda
                    : 'Define se a OP vai para a Adaptação, para a Fabricação, ou direto para separação e envio.'}
                </div>
              </div>
              )}

              {modoErro && (
                <div className="acn-nop-aviso-erro">
                  ⚠️ Não foi possível conferir se este tipo de venda exige o veículo ({modoErro}).{' '}
                  <Botao className="acn-nop-b acn-nop-lnk" onClick={() => setTentativaModo(n => n + 1)}>Tentar de novo</Botao>
                </div>
              )}

              {/* Quem paga o frete: se for o cliente (FOB), a Logística não
                  precisa cotar — o Almoxarifado pula direto essa etapa ao
                  embalar (regra pedida pelo usuário em 24/09/2026). Aparece em
                  qualquer fluxo que termine com a mercadoria saindo daqui. */}
              {precisaFrete && (
                <div className="acn-nop-frete-box">
                  <div className="acn-nop-rot">🚚 Frete *</div>
                  <div className="acn-nop-togs">
                    {[
                      { v:'CIF', label:'CIF — a empresa paga o frete' },
                      { v:'FOB', label:'FOB — o cliente paga o frete' },
                    ].map(opt => (
                      <Botao key={opt.v} className={'acn-nop-b acn-nop-frete' + (form.frete_responsavel === opt.v ? ' sel' : '')}
                        onClick={() => setF('frete_responsavel', opt.v)}>
                        {opt.label}
                      </Botao>
                    ))}
                  </div>
                  <div className={'acn-nop-frete-aj' + (form.frete_responsavel === 'FOB' ? ' fob' : '')}>
                    {form.frete_responsavel === 'FOB'
                      ? 'Cliente paga o frete: esta OP não vai para cotação da Logística — segue direto para liberação comercial depois de embalada.'
                      : 'Depois de embalada, a OP abre pedido de frete para a Logística cotar.'}
                  </div>
                </div>
              )}

              {/* Destino — pode ficar em branco agora e ser completado depois na
                  própria OPL; é o dado que o aproveitamento de frete vai usar. */}
              <div className="acn-nop-gr g211">
                <div>
                  <div className="acn-nop-rot">Cidade de Entrega</div>
                  <input className="acn-input acn-nop-w" placeholder="Opcional — pode preencher depois"
                    value={form.destino_cidade} onChange={e => setF('destino_cidade', e.target.value)} />
                </div>
                <div>
                  <div className="acn-nop-rot">UF</div>
                  <select className="acn-input acn-nop-w" value={form.destino_uf}
                    onChange={e => setF('destino_uf', e.target.value)}>
                    <option value="">—</option>
                    {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <div className="acn-nop-rot">CEP</div>
                  <CampoCep valor={form.destino_cep} onChange={v => setF('destino_cep', v)} estilo={{ width:'100%' }} rotulo="CEP de entrega"
                    onResultado={(r) => { if (r.status === 'ok') { setF('destino_cidade', r.cidade); setF('destino_uf', r.uf); } }} />
                </div>
              </div>

              {/* Envio direto: quantidade é só um número na mesma OP — sem lote
                  e sem dados por veículo. Avisa, para não parecer que sumiu. */}
              {Number(form.quantidade) > 1 && soEnvio(fluxoEf) && (
                <div className="acn-nop-env-nota">
                  📦 <strong>Envio:</strong> será criada <strong>1 OP com quantidade {form.quantidade}</strong>, sem lote —
                  como não passa pela produção, não há veículo para acompanhar um a um.
                </div>
              )}

              {/* Veículos individuais quando qty > 1 e a OP vai gerar lote */}
              {Number(form.quantidade) > 1 && !soEnvio(fluxoEf) && (
                <div className="acn-nop-lote">
                  <div className="acn-nop-lote-tit">
                    🚗 Dados por Veículo (desmembramento)
                  </div>
                  {/* Lote misto: grupos de veículos com serviços diferentes */}
                  <label className="acn-nop-lote-chk">
                    <input type="checkbox" checked={loteMisto}
                      onChange={e => {
                        setLoteMisto(e.target.checked);
                        if (e.target.checked) setGrupos(grupoInicial(Number(form.quantidade) || 1, form.resumo_servicos || '', form.itens_vendidos || []));
                      }} />
                    Adaptações e/ou itens diferentes entre os veículos (lote misto)
                  </label>
                  {/* O usuário pediu a escolha como dois botões, em 26/09/2026:
                      é a primeira decisão do lote e estava escondida num
                      checkbox de uma linha. A caixa acima continua e manda no
                      estado — os botões só a tornam visível. */}
                  <div className="acn-nop-lote-bts">
                    {[{ misto:false, rotulo:'Lote igual', ajuda:'Todos os carros iguais — informe só a quantidade' },
                      { misto:true,  rotulo:'Lote customizável', ajuda:'Carro a carro: veículo e itens podem variar' }].map(op => (
                      <Botao key={op.rotulo} title={op.ajuda} className={'acn-nop-b acn-nop-lote-bt' + (loteMisto === op.misto ? ' sel' : '')}
                        onClick={() => {
                          setLoteMisto(op.misto);
                          if (op.misto) setGrupos(grupoInicial(Number(form.quantidade) || 1, form.resumo_servicos || '', form.itens_vendidos || []));
                        }}>
                        {op.rotulo}
                      </Botao>
                    ))}
                  </div>
                  {loteMisto && (
                    <div className="acn-nop-lote-grupos">
                      <GruposLoteMisto quantidade={Number(form.quantidade) || 1} grupos={grupos} onChange={setGrupos}
                        crmId={oportunidadeVinculada?.id || null} licitacaoId={form.licitacao_id || null} />
                      <div className="acn-nop-lote-nota">
                        Um grupo com 1 veículo é o carro personalizado sozinho — crie um grupo por unidade pra deixar o lote todo diferente.
                      </div>
                    </div>
                  )}
                  {/* Modelo também por unidade — carro pode variar mesmo sem lote misto
                      (ex.: mesmo serviço em modelos diferentes). Chassi/placa já eram por unidade. */}
                  {/* Na grade abaixo, o minmax dá piso à coluna do veículo e deixa
                      as outras encolherem: sem o piso ela sumia, sem o minmax(0,…)
                      nas outras o nome do veículo empurrava a Placa para fora. */}
                  {(form.veiculos || []).map((v, i) => (
                    <div key={i} className="acn-nop-un">
                      <span className={'acn-nop-un-n' + (loteMisto ? ' misto' : '')}>
                        {String(i+1).padStart(2,'0')}
                        {loteMisto && (() => { const u = unidadesDosGrupos(grupos)[i]; return u ? <span className="acn-nop-un-g">{LETRA(u.grupo)}</span> : null; })()}
                      </span>
                      {/* Veículo POR UNIDADE — sem isto, um lote com carros
                          diferentes gravaria o mesmo veículo em todas as OPs
                          irmãs, e a estrutura de material sairia errada em
                          todas menos uma (corrigido em 26/09/2026). */}
                      {/* minWidth:0 é o que impede a coluna de esticar: numa
                          grade o filho não encolhe abaixo do conteúdo por
                          padrão, e o nome do veículo empurrava a Placa para
                          fora da tela. */}
                      {mostraVeiculo ? (
                        <SelectVeiculo compacto style={{ minWidth: 0 }}
                          valor={v.veiculo_id || ''} currentUser={currentUser}
                          recarregarEm={form.veiculo_id}
                          onChange={(id, ficha) => {
                            const veiculos = [...(form.veiculos||[])];
                            // a ficha vem do próprio seletor (inclui a que acabou de ser cadastrada no
                            // "+ Novo"); a lista carregada só no início é a reserva (29/09/2026)
                            const vc = ficha || veiculosCarregados.find(x => x.id === id);
                            veiculos[i] = { ...veiculos[i], veiculo_id: id,
                                            modelo: vc ? vc.nome_exibicao : veiculos[i]?.modelo };
                            setF('veiculos', veiculos);
                          }} />
                      ) : <span />}
                      <input className="acn-input" placeholder="Modelo" value={v.modelo || ''}
                        onChange={e => {
                          const veiculos = [...(form.veiculos||[])];
                          veiculos[i] = { ...veiculos[i], modelo: e.target.value };
                          setF('veiculos', veiculos);
                        }} />
                      <input className="acn-input" placeholder="Chassi" value={v.chassi}
                        onChange={e => {
                          const veiculos = [...(form.veiculos||[])];
                          veiculos[i] = { ...veiculos[i], chassi: e.target.value };
                          setF('veiculos', veiculos);
                        }} />
                      <input className="acn-input" placeholder="Placa" value={v.placa}
                        onChange={e => {
                          const veiculos = [...(form.veiculos||[])];
                          veiculos[i] = { ...veiculos[i], placa: e.target.value.toUpperCase() };
                          setF('veiculos', veiculos);
                        }} />
                    </div>
                  ))}
                </div>
              )}

              {/* Venda para Envio: não há veículo. Placa, chassi, modelo, mão de obra,
                  recebimento do veículo e serviço de terceiro (película, blindagem...)
                  não se aplicam. O que foi vendido já está no PV — anexe-o no passo 2
                  (documentos); não se recadastra item aqui. */}
              {ehVendaEnvio ? (<>
                <div className="acn-nop-bl">
                  <div className="acn-nop-rot">Valor Total (R$)</div>
                  <input className="acn-input acn-nop-w" placeholder="Ex: 45000"
                    value={form.valor_total} onChange={e => setF('valor_total', e.target.value)} />
                </div>
              </>) : (<>
              <div className="acn-nop-gr g3">
                <div>
                  <div className="acn-nop-rot">Placa</div>
                  <input className="acn-input acn-nop-w" placeholder="Ex: ABC-1234"
                    value={form.placa} onChange={e => setF('placa', e.target.value.toUpperCase())} />
                </div>
                <div>
                  <div className="acn-nop-rot">Chassi</div>
                  <input className="acn-input acn-nop-w" placeholder="Opcional"
                    value={form.chassi} onChange={e => setF('chassi', e.target.value)} />
                </div>
                <div>
                  <div className="acn-nop-rot">Modelo</div>
                  {form.tipo_projeto === 'Reboque' ? (
                    mostrandoNovoModelo ? (
                      <div className="acn-nop-mod">
                        <input className="acn-input acn-nop-w" placeholder="Nome do novo modelo"
                          value={novoModeloReboque} onChange={e => setNovoModeloReboque(e.target.value)} autoFocus
                          onKeyDown={e => e.key === 'Enter' && salvarNovoModeloReboque()} />
                        <Botao variante="primario" className="acn-nop-b acn-nop-mod-ok" onClick={salvarNovoModeloReboque}>✓</Botao>
                        <Botao variante="secundario" className="acn-nop-b acn-nop-mod-x" onClick={() => { setMostrandoNovoModelo(false); setNovoModeloReboque(''); }}>✕</Botao>
                      </div>
                    ) : (
                      <>
                      <select className="acn-input acn-nop-w" value={form.modelo}
                        onChange={e => { if (e.target.value === '___NOVO___') setMostrandoNovoModelo(true); else setF('modelo', e.target.value); }}>
                        <option value="">— Selecione o modelo —</option>
                        {modelosReboque.map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                        <option value="___NOVO___">➕ Novo modelo...</option>
                      </select>
                      {modelosErro && <div className="acn-nop-modelos-erro">⚠️ Não foi possível carregar os modelos de reboque ({modelosErro}).</div>}
                      </>
                    )
                  ) : (
                    /* Um OU outro, nunca os dois: são a mesma informação, e dois
                       campos pedindo o mesmo confundem quem preenche (corrigido
                       com o usuário em 28/09/2026). Quem manda é a configuração
                       por tipo de venda, na Administração. */
                    mostraVeiculo ? (
                      <SelectVeiculo valor={form.veiculo_id} currentUser={currentUser}
                        placeholder={veiculoObrigatorio
                          ? 'Escolha o veículo (obrigatório nesta venda)'
                          : 'Procure o veículo (marca, modelo ou ano)'}
                        onChange={(id, ficha) => {
                          setF('veiculo_id', id);
                          // o texto livre acompanha, para relatório antigo e
                          // busca continuarem enxergando o modelo. A ficha vem do próprio
                          // seletor: procurar só na lista carregada no início deixava o
                          // modelo em branco para veículo recém-cadastrado (lote 1673.2609,
                          // 29/09/2026).
                          const v = ficha || veiculosCarregados.find(x => x.id === id);
                          if (v) setF('modelo', v.nome_exibicao);
                        }} />
                    ) : (
                      <input className="acn-input acn-nop-w"
                        placeholder="Modelo (opcional)"
                        value={form.modelo} onChange={e => setF('modelo', e.target.value)} />
                    )
                  )}
                </div>
              </div>
              <div className="acn-nop-gr g2">
                <div>
                  <div className="acn-nop-rot">Valor Total (R$)</div>
                  <input className="acn-input acn-nop-w" placeholder="Ex: 45000"
                    value={form.valor_total} onChange={e => setF('valor_total', e.target.value)} />
                </div>
                <div>
                  <div className="acn-nop-rot">Valor M.O. (R$)</div>
                  <input className="acn-input acn-nop-w" placeholder="Ex: 12000"
                    value={form.valor_mao_de_obra} onChange={e => setF('valor_mao_de_obra', e.target.value)} />
                </div>
              </div>
              <div className="acn-nop-bl">
                <div className="acn-nop-rot">Valor M.O. Serralheria (R$)</div>
                <input className="acn-input acn-nop-w" placeholder="Ex: 5000"
                  value={form.valor_mao_de_obra_serralheria} onChange={e => setF('valor_mao_de_obra_serralheria', e.target.value)} />
              </div>

              <div className="acn-nop-bl">
                <div className="acn-nop-rot">Data de Recebimento do Veículo</div>
                <input type="date" className="acn-input acn-nop-w"
                  value={form.data_chegada_veiculo} onChange={e => setF('data_chegada_veiculo', e.target.value)} />
              </div>

              {/* ── Serviço de Terceiro ──────────────────────────────────────── */}
              <div className={'acn-nop-st' + (form.servico_terceiro ? ' ativo' : '')}>
                <label className="acn-nop-st-lbl">
                  <input type="checkbox" checked={form.servico_terceiro}
                    onChange={e => setF('servico_terceiro', e.target.checked)}
                    className="acn-nop-st-chk" />
                  <span className={'acn-nop-st-tit' + (form.servico_terceiro ? ' ativo' : '')}>
                    ⚠️ Necessita Serviço de Terceiro
                  </span>
                  {form.servico_terceiro && (
                    <span className="acn-nop-st-chip">ATENÇÃO</span>
                  )}
                </label>

                {form.servico_terceiro && (
                  <div className="acn-nop-st-corpo">
                    <div className="acn-nop-st-rot">
                      Tipos de Serviço de Terceiro * <span className="acn-nop-st-sub">(marque todos que se aplicam)</span>
                    </div>
                    <div className="acn-nop-st-tipos">
                      {TIPOS_SERVICO_TERCEIRO.map(t => {
                        const sel = form.tipos_servico_terceiro.includes(t);
                        return (
                          <label key={t} className={'acn-nop-st-tipo' + (sel ? ' sel' : '')}>
                            <input type="checkbox" checked={sel}
                              onChange={() => setF('tipos_servico_terceiro',
                                sel ? form.tipos_servico_terceiro.filter(x => x !== t)
                                    : [...form.tipos_servico_terceiro, t])}
                              className="acn-nop-st-ck" />
                            {t}
                          </label>
                        );
                      })}
                    </div>
                    {form.tipos_servico_terceiro.includes('Outro') && (
                      <input className="acn-input acn-nop-w"
                        placeholder="Descreva o(s) serviço(s) de terceiro..."
                        value={form.obs_servico_terceiro}
                        onChange={e => setF('obs_servico_terceiro', e.target.value)} />
                    )}
                  </div>
                )}
              </div>
              </>)}
            </>
          )}

          {/* Os itens vendidos subiram para o topo do formulário em 26/09/2026
              — eles decidem as perguntas de configuração de cada carro. No lote
              misto continuam por grupo, editados em Dados por Veículo. */}

          {/* Resumo dos Serviços — OP (no lote misto, cada unidade usa o do seu grupo) */}
          {isOP && loteEhMisto && (
            <div className="acn-nop-lm-aviso">
              🧩 Lote misto: o resumo dos serviços e os itens vendidos de cada unidade vêm do seu grupo (acima, em Dados por Veículo).
            </div>
          )}
          {isOP && !loteEhMisto && (
            <div className="acn-nop-bl">
              <div className="acn-nop-rot">Resumo dos Serviços a serem executados</div>
              <textarea className="acn-input acn-nop-w acn-nop-ta acn-nop-ta-auto" rows={3}
                placeholder="Descreva os serviços que serão executados nesta OP..."
                value={form.resumo_servicos} onChange={e => setF('resumo_servicos', e.target.value)}
                onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }} />
            </div>
          )}

          {/* Campos OS */}
          {!isOP && (
            <>
              <div className="acn-nop-gr g2">
                <div>
                  <div className="acn-nop-rot">Tipo de Serviço *</div>
                  <select className="acn-input acn-nop-w" value={form.tipo_servico}
                    onChange={e => setF('tipo_servico', e.target.value)}>
                    {TIPOS_OS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <div className="acn-nop-rot">Equipamento</div>
                  <input className="acn-input acn-nop-w" placeholder="Ex: Rádio Motorola APX"
                    value={form.equipamento} onChange={e => setF('equipamento', e.target.value)} />
                </div>
              </div>
              <div className="acn-nop-bl">
                <div className="acn-nop-rot">Descrição do problema / serviço *</div>
                <textarea className="acn-input acn-nop-w acn-nop-ta" rows={3}
                  placeholder="Descreva o que precisa ser feito..."
                  value={form.descricao_problema} onChange={e => setF('descricao_problema', e.target.value)} />
              </div>
              <div className="acn-nop-bl">
                <div className="acn-nop-rot">Resumo dos Serviços a serem executados</div>
                <textarea className="acn-input acn-nop-w acn-nop-ta acn-nop-ta-auto" rows={3}
                  placeholder="Descreva os serviços que serão executados nesta OS..."
                  value={form.resumo_servicos} onChange={e => setF('resumo_servicos', e.target.value)}
                  onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }} />
              </div>
            </>
          )}

          {/* Campos comuns */}
          <div className="acn-nop-gr g2">
            <div>
              <div className="acn-nop-rot">Data de Entrada *</div>
              <input type="date" className="acn-input acn-nop-w"
                value={form.data_entrada} onChange={e => setF('data_entrada', e.target.value)} />
            </div>
            <div>
              <div className="acn-nop-rot">Prazo de Entrega *</div>
              <input type="date" className="acn-input acn-nop-w"
                value={form.prazo_entrega} onChange={e => setF('prazo_entrega', e.target.value)} />
            </div>
          </div>

          {form.tipo === 'OP' && (
            <div className="acn-nop-bl">
              <div className="acn-nop-rot">Prazo de Garantia</div>
              <input className="acn-input acn-nop-w" maxLength={300}
                placeholder="Ex: 12 meses a partir da entrega · 90 dias mão de obra, 1 ano equipamento"
                value={form.prazo_garantia} onChange={e => setF('prazo_garantia', e.target.value)} />
            </div>
          )}

          <div className="acn-nop-bl">
            <div className="acn-nop-rot">Responsável *</div>
            <ColaboradorSelect departamentos={DEPTOS.comercial}
              value={form.responsavel}
              onChange={v => setF('responsavel', v)}
              placeholder="Selecione o responsável..."
            />
          </div>

          <div className="acn-nop-bl">
            <div className="acn-nop-rot">Observações</div>
            <textarea className="acn-input acn-nop-w acn-nop-ta" rows={2}
              placeholder="Observações adicionais..."
              value={form.observacoes} onChange={e => setF('observacoes', e.target.value)} />
          </div>

          {/* Vínculo CRM */}
          {crmCard && (
            <div className="acn-nop-vinc">
              🔗 Esta {isOP ? 'OP' : 'OS'} será vinculada ao card CRM: <strong>{crmCard.titulo}</strong>
            </div>
          )}

          {erro && (
            <div className="acn-nop-erro">
              ⚠️ {erro}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="acn-nop-rodape">
          <Botao variante="secundario" className="acn-nop-b-rod" onClick={onClose}>
            Cancelar
          </Botao>
          <Botao variante="primario" className="acn-nop-b-rod acn-nop-b-rod-p" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : `✅ Criar ${isOP ? 'OP' : 'OS'}`}
          </Botao>
        </div>
      </div>
    </div>
  );
}
