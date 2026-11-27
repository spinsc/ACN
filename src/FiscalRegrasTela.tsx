// @ts-nocheck
// Cadastros fiscais › Regras (módulo fiscal, Etapa 3, 27/11/2026): as regras fiscais versionadas (CFOP, CST, alíquota por situação), a aprovação e o simulador.
// As regras estão em FiscalMotor.ts, a leitura e a gravação em FiscalRegrasDados.ts e as tabelas em supabase/sql/fiscal_regras.sql. NADA aqui emite nota: a tabela nasce vazia e o que a
// contabilidade não confirmou fica marcado "a confirmar" e não vale para emitir. Decidido com o usuário em 27/11/2026: versão aprovada fica congelada; aprovam Admin e gerentes, e quem editou por último não aprova.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { mdiClose, mdiPlus, mdiPencilOutline, mdiDelete, mdiRefresh } from '@mdi/js';
import { Botao, Faixa, Selo } from './Interface';
import { confirmar, pedirTexto } from './Feedback';
import { podeEditarCadastroFiscal, ehAdminOuGerente } from './utils/permissoes';
import { lerEmitentes } from './FiscalDados';
import { lerVersoesDasRegras, lerRegrasDaVersao, salvarRegra, apagarRegra, criarVersaoDeRegras, descartarVersaoDeRegras, aprovarVersaoDeRegras } from './FiscalRegrasDados';
import {
  CAMPOS_DA_CONDICAO, OPCOES_DESTINO, ROTULO_DO_CAMPO, formDaRegra, erroDaRegra, resumoDasCondicoes, problemasParaAprovar, escolherRegra, compararVersoes,
} from './FiscalMotor';
import { ORIGENS_DE_NOTA } from './FiscalTiposDeNota';
import { OPCOES_TIPO_ORGAO, OPCOES_INDICADOR_IE, ORIGENS_FISCAIS } from './FiscalRegras';
import './fiscal.css';

const nomeDaOperacao = (id: string) => ORIGENS_DE_NOTA.find(o => o.id === id)?.origem || id;
const dataBR = (iso: any) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const SITUACAO = { rascunho: { rotulo: 'Rascunho', familia: 'atencao' }, aprovada: { rotulo: 'Vigente', familia: 'ok' }, substituida: { rotulo: 'Substituída', familia: 'neutro' } };

const Campo = ({ id, rotulo, largo, dica, children }) => (
  <div className={'acn-fcad-campo' + (largo ? ' acn-fcad-largo' : '')}>
    <label className="acn-label" htmlFor={id}>{rotulo}</label>{children}{dica && <p className="acn-fcad-dica">{dica}</p>}
  </div>
);
/** A moldura de janela (a mesma do resto dos cadastros; copiada aqui para esta tela não depender da tela que a hospeda). */
function Janela({ titulo, onClose, children, rodape }) {
  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-fcad-box" role="dialog" aria-label={titulo}>
        <div className="acn-modal-cab"><span className="modal-title">{titulo}</span><Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} /></div>
        <div className="acn-modal-corpo acn-form-cheio">{children}</div>
        {rodape && <div className="acn-modal-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

// ═══ A janela de uma regra ═══════════════════════════════════════════════════════════════════
function ModalRegra({ regra, versao, emitentes, currentUser, onClose, aoSalvar }) {
  const [form, setForm] = useState(() => formDaRegra(regra));
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const salvar = async () => {
    if (ocupado) return;
    setErro(''); setOcupado(true);
    const r = await salvarRegra(form, versao.id, currentUser, regra);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoSalvar(r.linha);
  };
  const faltaAlgo = erroDaRegra(form);
  return (
    <Janela titulo={regra ? 'Editar regra' : 'Nova regra'} onClose={onClose} rodape={
      <div className="acn-fcad-rodape">
        <Botao variante="primario" onClick={salvar} disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar regra'}</Botao>
        <Botao onClick={onClose}>Cancelar</Botao>
        {faltaAlgo && <span className="acn-fraco">Falta: {faltaAlgo}</span>}
      </div>}>
      {erro && <Faixa tom="erro">{erro}</Faixa>}
      <div className="acn-ajuda">Escreva a <strong>situação</strong> (o que for deixado em branco vale para qualquer caso) e o que o sistema deve <strong>mandar</strong> nela. Quando duas regras servem ao mesmo tempo, vale a que tem mais condições.</div>
      <div className="acn-fcad-grade">
        <Campo id="rg-rotulo" rotulo="Nome da regra *" largo><input id="rg-rotulo" className="acn-input" value={form.rotulo} onChange={e => set('rotulo', e.target.value)} placeholder="Ex.: Venda de mercadoria dentro do estado" /></Campo>
      </div>
      <h4 className="acn-fcad-secao-tit">Quando vale (situação)</h4>
      <div className="acn-fcad-grade">
        <Campo id="rg-emit" rotulo={ROTULO_DO_CAMPO.emitente}>
          <select id="rg-emit" className="acn-input" value={form.emitente} onChange={e => set('emitente', e.target.value)}><option value="">Qualquer empresa</option>{emitentes.map(e => <option key={e.codigo} value={e.codigo}>{e.codigo}{e.razao_social ? ` — ${e.razao_social}` : ''}</option>)}</select>
        </Campo>
        <Campo id="rg-op" rotulo={ROTULO_DO_CAMPO.tipo_operacao}>
          <select id="rg-op" className="acn-input" value={form.tipo_operacao} onChange={e => set('tipo_operacao', e.target.value)}><option value="">Qualquer operação</option>{ORIGENS_DE_NOTA.map(o => <option key={o.id} value={o.id}>{o.origem}</option>)}</select>
        </Campo>
        <Campo id="rg-dest" rotulo={ROTULO_DO_CAMPO.destino}>
          <select id="rg-dest" className="acn-input" value={form.destino} onChange={e => set('destino', e.target.value)}><option value="">Qualquer destino</option>{OPCOES_DESTINO.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select>
        </Campo>
        <Campo id="rg-org" rotulo={ROTULO_DO_CAMPO.tipo_orgao}>
          <select id="rg-org" className="acn-input" value={form.tipo_orgao} onChange={e => set('tipo_orgao', e.target.value)}><option value="">Qualquer cliente</option>{OPCOES_TIPO_ORGAO.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select>
        </Campo>
        <Campo id="rg-ie" rotulo={ROTULO_DO_CAMPO.indicador_ie}>
          <select id="rg-ie" className="acn-input" value={form.indicador_ie} onChange={e => set('indicador_ie', e.target.value)}><option value="">Qualquer</option>{OPCOES_INDICADOR_IE.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select>
        </Campo>
        <Campo id="rg-ncm" rotulo={ROTULO_DO_CAMPO.ncm_prefixo} dica="De 2 a 8 números; vale para todo NCM que começa assim."><input id="rg-ncm" className="acn-input" inputMode="numeric" value={form.ncm_prefixo} onChange={e => set('ncm_prefixo', e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="Qualquer NCM" /></Campo>
        <Campo id="rg-orig" rotulo={ROTULO_DO_CAMPO.origem_fiscal}>
          <select id="rg-orig" className="acn-input" value={form.origem_fiscal} onChange={e => set('origem_fiscal', e.target.value)}><option value="">Qualquer origem</option>{ORIGENS_FISCAIS.map(o => <option key={o.valor} value={String(o.valor)}>{o.rotulo}</option>)}</select>
        </Campo>
        <Campo id="rg-mono" rotulo={ROTULO_DO_CAMPO.monofasico}>
          <select id="rg-mono" className="acn-input" value={form.monofasico} onChange={e => set('monofasico', e.target.value)}><option value="">Tanto faz</option><option value="sim">Só monofásico</option><option value="nao">Só não monofásico</option></select>
        </Campo>
      </div>
      <h4 className="acn-fcad-secao-tit">O que o sistema manda</h4>
      <div className="acn-fcad-grade">
        <Campo id="rg-cfop" rotulo="CFOP *"><input id="rg-cfop" className="acn-input acn-fcad-mono" inputMode="numeric" value={form.cfop} onChange={e => set('cfop', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4 números" /></Campo>
        <Campo id="rg-cst" rotulo="CST ou CSOSN *" dica="2 números (regime normal) ou 3 (Simples)."><input id="rg-cst" className="acn-input acn-fcad-mono" inputMode="numeric" value={form.cst_csosn} onChange={e => set('cst_csosn', e.target.value.replace(/\D/g, '').slice(0, 3))} /></Campo>
        <Campo id="rg-ali" rotulo="Alíquota de ICMS (%)" dica="Em branco = a regra não fixa a alíquota."><input id="rg-ali" className="acn-input" inputMode="decimal" value={form.aliquota_icms_pct} onChange={e => set('aliquota_icms_pct', e.target.value.replace(/[^0-9,\.]/g, ''))} /></Campo>
        <Campo id="rg-cb" rotulo="Benefício fiscal (cBenef)"><input id="rg-cb" className="acn-input acn-fcad-mono" value={form.cbenef} onChange={e => set('cbenef', e.target.value.toUpperCase().slice(0, 10))} /></Campo>
        <Campo id="rg-info" rotulo="Informação complementar da nota" largo><textarea id="rg-info" className="acn-input" rows={2} value={form.informacao_complementar} onChange={e => set('informacao_complementar', e.target.value)} /></Campo>
        <label className="acn-fcad-marca acn-fcad-largo"><input type="checkbox" checked={form.exige_nota_referenciada} onChange={e => set('exige_nota_referenciada', e.target.checked)} /> Exige a chave da nota de origem (devolução, retorno)</label>
      </div>
      <h4 className="acn-fcad-secao-tit">Confirmação da contabilidade</h4>
      <div className="acn-fcad-grade">
        <label className="acn-fcad-marca acn-fcad-largo"><input type="checkbox" checked={form.confirmada} onChange={e => set('confirmada', e.target.checked)} /> A contabilidade confirmou esta regra</label>
        <Campo id="rg-fonte" rotulo={form.confirmada ? 'Fonte *' : 'Fonte'} largo dica="Quem confirmou e onde está escrito (e-mail, parecer, data). Sem fonte a regra não vale."><input id="rg-fonte" className="acn-input" value={form.fonte} onChange={e => set('fonte', e.target.value)} /></Campo>
        <Campo id="rg-obs" rotulo="Observação" largo><textarea id="rg-obs" className="acn-input" rows={2} value={form.observacao} onChange={e => set('observacao', e.target.value)} /></Campo>
      </div>
    </Janela>
  );
}

// ═══ O simulador ═════════════════════════════════════════════════════════════════════════════
const CONTEXTO_VAZIO = { emitente: '', tipo_operacao: '', destino: '', tipo_orgao: '', indicador_ie: '', ncm: '', origem_fiscal: '', monofasico: '' };
function Simulador({ regras, emitentes, versao }) {
  const [ctx, setCtx] = useState(CONTEXTO_VAZIO);
  const set = (k: string, v: string) => setCtx(c => ({ ...c, [k]: v }));
  const escolha = useMemo(() => escolherRegra({ ...ctx, origem_fiscal: ctx.origem_fiscal === '' ? null : Number(ctx.origem_fiscal), monofasico: ctx.monofasico || null }, regras), [ctx, regras]);
  const r = escolha.regra;
  const familia = { achou: escolha.confirmada ? 'ok' : 'atencao', sem_regra: 'neutro', conflito: 'erro', faltam_dados: 'atencao' }[escolha.situacao];
  const rotulo = { achou: escolha.confirmada ? 'Achou a regra' : 'Achou, mas a confirmar', sem_regra: 'Sem regra', conflito: 'Regras que se contradizem', faltam_dados: 'Faltam dados' }[escolha.situacao];
  return (
    <div>
      <h3 className="acn-fcad-secao-tit">Simulador</h3>
      <p className="acn-fcad-dica">Diga a situação e veja qual regra da versão {versao.numero} valeria. Campo em branco quer dizer "não sei": o simulador avisa quando isso muda a resposta. <strong>Só simula: nada é emitido.</strong></p>
      <div className="acn-fcad-grade">
        <Campo id="sm-emit" rotulo="Empresa que emite"><select id="sm-emit" className="acn-input" value={ctx.emitente} onChange={e => set('emitente', e.target.value)}><option value="">Não sei</option>{emitentes.map(e => <option key={e.codigo} value={e.codigo}>{e.codigo}</option>)}</select></Campo>
        <Campo id="sm-op" rotulo="Tipo de operação"><select id="sm-op" className="acn-input" value={ctx.tipo_operacao} onChange={e => set('tipo_operacao', e.target.value)}><option value="">Não sei</option>{ORIGENS_DE_NOTA.map(o => <option key={o.id} value={o.id}>{o.origem}</option>)}</select></Campo>
        <Campo id="sm-dest" rotulo="Destino"><select id="sm-dest" className="acn-input" value={ctx.destino} onChange={e => set('destino', e.target.value)}><option value="">Não sei</option>{OPCOES_DESTINO.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select></Campo>
        <Campo id="sm-org" rotulo="Tipo de órgão"><select id="sm-org" className="acn-input" value={ctx.tipo_orgao} onChange={e => set('tipo_orgao', e.target.value)}><option value="">Não sei</option>{OPCOES_TIPO_ORGAO.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select></Campo>
        <Campo id="sm-ie" rotulo="Inscrição estadual do cliente"><select id="sm-ie" className="acn-input" value={ctx.indicador_ie} onChange={e => set('indicador_ie', e.target.value)}><option value="">Não sei</option>{OPCOES_INDICADOR_IE.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select></Campo>
        <Campo id="sm-ncm" rotulo="NCM do item"><input id="sm-ncm" className="acn-input" inputMode="numeric" value={ctx.ncm} onChange={e => set('ncm', e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="Não sei" /></Campo>
        <Campo id="sm-orig" rotulo="Origem do item"><select id="sm-orig" className="acn-input" value={ctx.origem_fiscal} onChange={e => set('origem_fiscal', e.target.value)}><option value="">Não sei</option>{ORIGENS_FISCAIS.map(o => <option key={o.valor} value={String(o.valor)}>{o.rotulo}</option>)}</select></Campo>
        <Campo id="sm-mono" rotulo="PIS/COFINS monofásico"><select id="sm-mono" className="acn-input" value={ctx.monofasico} onChange={e => set('monofasico', e.target.value)}><option value="">Não sei</option><option value="sim">Sim</option><option value="nao">Não</option></select></Campo>
      </div>
      <div className="acn-freg-resultado" role="status" aria-live="polite">
        <div><Selo familia={familia} ponto={false}>{rotulo}</Selo></div>
        <p className="acn-freg-porque">{escolha.porque}</p>
        {r && (
          <dl className="acn-freg-manda">
            <div><dt>CFOP</dt><dd className="acn-fcad-mono">{r.cfop}</dd></div>
            <div><dt>CST/CSOSN</dt><dd className="acn-fcad-mono">{r.cst_csosn}</dd></div>
            <div><dt>ICMS</dt><dd>{r.aliquota_icms_pct === null || r.aliquota_icms_pct === undefined ? 'não fixa' : `${String(r.aliquota_icms_pct).replace('.', ',')}%`}</dd></div>
            <div><dt>cBenef</dt><dd className="acn-fcad-mono">{r.cbenef || '—'}</dd></div>
            {r.exige_nota_referenciada && <div><dt>Nota de origem</dt><dd>obrigatória</dd></div>}
            {r.informacao_complementar && <div className="acn-fcad-largo"><dt>Informação complementar</dt><dd>{r.informacao_complementar}</dd></div>}
          </dl>
        )}
      </div>
    </div>
  );
}

// ═══ A tela ══════════════════════════════════════════════════════════════════════════════════
export default function FiscalRegrasTela({ currentUser }) {
  const podeEditar = podeEditarCadastroFiscal(currentUser);
  const podeAprovar = ehAdminOuGerente(currentUser);
  const [v, setV] = useState({ lido: false, versoes: [], erro: '' });
  const [emitentes, setEmitentes] = useState([]);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [rg, setRg] = useState({ id: null, regras: [], base: null, erro: '', lendo: false });
  const [janela, setJanela] = useState<any>(null);   // { regra } (regra null = nova)
  const [aviso, setAviso] = useState<{ tom: string; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const lerVersoes = useCallback(async (manter?: string) => {
    const r = await lerVersoesDasRegras();
    setV({ lido: true, versoes: r.versoes, erro: r.erro });
    if (!r.erro) setEscolhida(atual => (manter ?? atual) && r.versoes.some(x => x.id === (manter ?? atual)) ? (manter ?? atual) : (r.versoes.find(x => x.situacao === 'rascunho') || r.versoes.find(x => x.situacao === 'aprovada') || r.versoes[0])?.id || null);
  }, []);
  useEffect(() => { lerVersoes(); lerEmitentes().then(r => { if (!r.erro) setEmitentes(r.lista || []); }); }, [lerVersoes]);

  const versao = useMemo(() => v.versoes.find(x => x.id === escolhida) || null, [v, escolhida]);
  const lerRegras = useCallback(async (ver: any) => {
    if (!ver) { setRg({ id: null, regras: [], base: null, erro: '', lendo: false }); return; }
    setRg(r => ({ ...r, id: ver.id, lendo: true, erro: '' }));
    const a = await lerRegrasDaVersao(ver.id);
    let base = null;
    if (!a.erro && ver.baseada_em) { const b = await lerRegrasDaVersao(ver.baseada_em); if (!b.erro) base = b.regras; }
    setRg({ id: ver.id, regras: a.regras, base, erro: a.erro, lendo: false });
  }, []);
  useEffect(() => { lerRegras(versao); }, [versao?.id, versao?.atualizada_em, lerRegras]);

  const rascunho = v.versoes.find(x => x.situacao === 'rascunho');
  const editavel = podeEditar && versao?.situacao === 'rascunho';
  const regras = rg.id === versao?.id ? rg.regras : [];
  const problemas = useMemo(() => (versao?.situacao === 'rascunho' ? problemasParaAprovar(regras) : []), [versao, regras]);
  const mudancas = useMemo(() => (rg.base && versao ? compararVersoes(rg.base, regras) : []), [rg.base, regras, versao]);
  const ok = (texto: string) => setAviso({ tom: 'ok', texto });
  const falha = (texto: string) => setAviso({ tom: 'erro', texto });

  const novaVersao = async () => {
    if (ocupado) return;
    const vigente = v.versoes.find(x => x.situacao === 'aprovada');
    if (!await confirmar(vigente ? `Abrir um rascunho novo, começando como cópia da versão ${vigente.numero} (a vigente)?\n\nA vigente não muda enquanto o rascunho não for aprovado.` : 'Abrir o primeiro rascunho das regras fiscais (vazio)?')) return;
    setOcupado(true); setAviso(null);
    const r = await criarVersaoDeRegras(null, '', currentUser);
    setOcupado(false);
    if (!r.ok) { falha(r.erro); return; }
    await lerVersoes(r.id); ok('Rascunho aberto.');
  };
  const descartar = async () => {
    if (!versao || ocupado) return;
    if (!await confirmar(`Descartar o rascunho (versão ${versao.numero}) com as ${regras.length} regra(s) dele?\n\nA versão vigente não é afetada. Isso não pode ser desfeito.`)) return;
    setOcupado(true); setAviso(null);
    const r = await descartarVersaoDeRegras(versao, currentUser);
    setOcupado(false);
    if (!r.ok) { falha(r.erro); return; }
    setEscolhida(null); await lerVersoes(); ok('Rascunho descartado.');
  };
  const aprovar = async () => {
    if (!versao || ocupado) return;
    const proprio = versao.ultimo_editor_id && versao.ultimo_editor_id === currentUser?.id;
    if (!await confirmar(`Aprovar a versão ${versao.numero} com ${regras.length} regra(s)?\n\nDepois de aprovada ela fica CONGELADA (para mudar, abre-se uma versão nova) e passa a ser a vigente${v.versoes.some(x => x.situacao === 'aprovada') ? '; a atual vira "substituída"' : ''}.${proprio ? '\n\nAtenção: você foi a última pessoa a editar esta versão. Como Admin você pode aprovar, mas isso fica registrado.' : ''}`)) return;
    const nota = await pedirTexto('Nota da aprovação: o que mudou e quem conferiu (pelo menos 5 letras).');
    if (nota === null) return;
    setOcupado(true); setAviso(null);
    const r = await aprovarVersaoDeRegras(versao, nota, currentUser);
    setOcupado(false);
    if (!r.ok) { falha(r.erro); await lerVersoes(versao.id); return; }
    await lerVersoes(versao.id); ok(`Versão ${versao.numero} aprovada: é a vigente.`);
  };
  const tirar = async (regra: any) => {
    if (ocupado || !await confirmar(`Tirar a regra "${regra.rotulo}" do rascunho?`)) return;
    setOcupado(true); setAviso(null);
    const r = await apagarRegra(regra, currentUser);
    setOcupado(false);
    if (!r.ok) { falha(r.erro); return; }
    await lerVersoes(versao.id); await lerRegras(versao); ok('Regra tirada.');
  };
  const depoisDeSalvar = async () => { setJanela(null); await lerVersoes(versao.id); await lerRegras(versao); ok('Regra gravada.'); };

  return (
    <div>
      <div className="acn-ajuda">Aqui ficam as <strong>regras fiscais</strong>: para cada situação (empresa, tipo de operação, destino, cliente, NCM…), o CFOP, o CST e a alíquota que o sistema usará. <strong>Nada é emitido e nada trava o Fiscal.</strong> A tabela nasce vazia: nenhuma regra vale até a contabilidade confirmar e a versão ser aprovada. A versão aprovada fica congelada; para mudar, abre-se uma versão nova.</div>
      {aviso && <Faixa tom={aviso.tom} acao={<Botao pequeno variante="discreto" aria-label="Fechar aviso" icone={mdiClose} onClick={() => setAviso(null)} />}>{aviso.texto}</Faixa>}
      {v.erro && <Faixa tom="erro" acao={<Botao pequeno icone={mdiRefresh} onClick={() => lerVersoes()}>Tentar de novo</Botao>}>Não foi possível ler as versões das regras ({v.erro}). Não dá para dizer que não existe nenhuma.</Faixa>}

      <h3 className="acn-fcad-secao-tit">Versões</h3>
      <div className="acn-fcad-barra">
        {podeEditar && !rascunho && v.lido && !v.erro && <Botao pequeno variante="primario" icone={mdiPlus} onClick={novaVersao} disabled={ocupado}>Nova versão</Botao>}
        {podeEditar && rascunho && <span className="acn-fraco">Já existe um rascunho (versão {rascunho.numero}): só um por vez.</span>}
        {!podeEditar && <span className="acn-fraco">Você pode consultar as regras; quem edita é o Fiscal (aba Fiscal), e aprovam Admin e gerentes.</span>}
      </div>
      <div className="acn-rolagem">
        <table className="acn-tabela acn-densa">
          <thead><tr><th>Versão</th><th>Situação</th><th>Última alteração</th><th>Aprovação</th><th /></tr></thead>
          <tbody>
            {v.versoes.map(x => (
              <tr key={x.id} className={x.id === escolhida ? 'acn-fcad-linha-ativa' : ''}>
                <td><strong>Versão {x.numero}</strong><div className="acn-fraco">{x.titulo}</div></td>
                <td><Selo familia={SITUACAO[x.situacao].familia} ponto={false}>{SITUACAO[x.situacao].rotulo}</Selo></td>
                <td className="acn-fcad-num">{dataBR(x.atualizada_em)}{x.ultimo_editor_nome && <div className="acn-fraco">{x.ultimo_editor_nome}</div>}</td>
                <td>{x.aprovada_em ? <><span className="acn-fcad-num">{dataBR(x.aprovada_em)}</span> · {x.aprovada_por_nome || '—'}{x.aprovada_pelo_proprio_editor && <div className="acn-fraco">aprovada por quem a editou (Admin)</div>}<div className="acn-fraco">{x.nota_aprovacao}</div></> : <span className="acn-fraco">ainda não aprovada</span>}</td>
                <td className="acn-fcad-acoes"><Botao pequeno onClick={() => { setEscolhida(x.id); setAviso(null); }} disabled={x.id === escolhida}>{x.id === escolhida ? 'Aberta' : 'Abrir'}</Botao></td>
              </tr>
            ))}
            {v.lido && !v.erro && !v.versoes.length && <tr><td colSpan={5} className="acn-centro acn-fraco">Nenhuma versão ainda: as regras fiscais nascem vazias e só valem quando a contabilidade responder.{podeEditar ? ' Clique em "Nova versão" para começar.' : ''}</td></tr>}
          </tbody>
        </table>
      </div>

      {versao && (
        <>
          <h3 className="acn-fcad-secao-tit">Versão {versao.numero} <Selo familia={SITUACAO[versao.situacao].familia} ponto={false}>{SITUACAO[versao.situacao].rotulo}</Selo></h3>
          <div className="acn-fcad-barra">
            {editavel && <Botao pequeno variante="primario" icone={mdiPlus} onClick={() => setJanela({ regra: null })} disabled={ocupado}>Nova regra</Botao>}
            {versao.situacao === 'rascunho' && podeAprovar && <Botao pequeno onClick={aprovar} disabled={ocupado || problemas.length > 0 || !!rg.erro || rg.lendo} title={problemas.length ? 'Resolva o que está em vermelho abaixo antes de aprovar.' : ''}>Aprovar esta versão</Botao>}
            {versao.situacao === 'rascunho' && podeEditar && <Botao pequeno variante="discreto" onClick={descartar} disabled={ocupado}>Descartar rascunho</Botao>}
            {versao.situacao !== 'rascunho' && <span className="acn-fraco">Versão congelada: não se edita. {podeEditar && !rascunho ? 'Para mudar, use "Nova versão" (ela começa como cópia da vigente).' : ''}</span>}
          </div>
          {rg.erro && <Faixa tom="erro" acao={<Botao pequeno icone={mdiRefresh} onClick={() => lerRegras(versao)}>Tentar de novo</Botao>}>Não foi possível ler as regras desta versão ({rg.erro}).</Faixa>}
          {versao.situacao === 'rascunho' && !rg.erro && !rg.lendo && problemas.length > 0 && (
            <Faixa tom="erro"><div><strong>Para aprovar, falta resolver:</strong><ul className="acn-freg-lista">{problemas.map(p => <li key={p}>{p}</li>)}</ul></div></Faixa>
          )}
          {versao.situacao === 'rascunho' && !rg.erro && !rg.lendo && !problemas.length && <Faixa tom="ok">Tudo pronto: a versão pode ser aprovada por {podeAprovar ? 'você' : 'um gerente ou o Admin'}{versao.ultimo_editor_id === currentUser?.id ? ' (mas como foi você quem editou por último, a aprovação precisa ser de outra pessoa, ou do Admin)' : ''}.</Faixa>}

          <div className="acn-rolagem">
            <table className="acn-tabela acn-densa">
              <thead><tr><th>Regra</th><th>Quando vale</th><th>O sistema manda</th><th>Situação</th>{editavel && <th />}</tr></thead>
              <tbody>
                {regras.map(r => {
                  const conds = resumoDasCondicoes(r, nomeDaOperacao);
                  return (
                    <tr key={r.id}>
                      <td><strong>{r.rotulo}</strong>{r.observacao && <div className="acn-fraco">{r.observacao}</div>}</td>
                      <td>{conds.length ? <div className="acn-freg-conds">{conds.map(c => <Selo key={c} familia="neutro" ponto={false}>{c}</Selo>)}</div> : <span className="acn-fraco">qualquer situação</span>}</td>
                      <td className="acn-fcad-mono">CFOP {r.cfop} · CST {r.cst_csosn}{r.aliquota_icms_pct !== null && r.aliquota_icms_pct !== undefined ? ` · ICMS ${String(r.aliquota_icms_pct).replace('.', ',')}%` : ''}{r.cbenef ? ` · ${r.cbenef}` : ''}{r.exige_nota_referenciada ? ' · nota de origem' : ''}</td>
                      <td>{r.confirmada ? <><Selo familia="ok" ponto={false}>Confirmada</Selo><div className="acn-fraco">{r.fonte}</div></> : <Selo familia="atencao" ponto={false}>A confirmar</Selo>}</td>
                      {editavel && <td className="acn-fcad-acoes"><Botao pequeno variante="discreto" icone={mdiPencilOutline} aria-label={`Editar ${r.rotulo}`} onClick={() => setJanela({ regra: r })} /><Botao pequeno variante="discreto" icone={mdiDelete} aria-label={`Tirar ${r.rotulo}`} onClick={() => tirar(r)} disabled={ocupado} /></td>}
                    </tr>
                  );
                })}
                {!rg.lendo && !rg.erro && !regras.length && <tr><td colSpan={editavel ? 5 : 4} className="acn-centro acn-fraco">Esta versão não tem nenhuma regra.{editavel ? ' Clique em "Nova regra".' : ''}</td></tr>}
                {rg.lendo && <tr><td colSpan={editavel ? 5 : 4} className="acn-centro acn-fraco">Lendo as regras…</td></tr>}
              </tbody>
            </table>
          </div>

          {mudancas.length > 0 && (
            <>
              <h4 className="acn-fcad-secao-tit">O que mudou em relação à versão de partida</h4>
              <ul className="acn-freg-lista">
                {mudancas.map(m => (
                  <li key={m.regra.id}><Selo familia={m.tipo === 'nova' ? 'ok' : m.tipo === 'tirada' ? 'erro' : 'atencao'} ponto={false}>{m.tipo === 'nova' ? 'Nova' : m.tipo === 'tirada' ? 'Tirada' : 'Mudou'}</Selo> <strong>{m.regra.rotulo}</strong>{m.campos ? ` — mudou: ${m.campos.join(', ')}` : ''}</li>
                ))}
              </ul>
            </>
          )}

          {!rg.erro && <Simulador regras={regras} emitentes={emitentes} versao={versao} />}
        </>
      )}

      {janela && versao && <ModalRegra regra={janela.regra} versao={versao} emitentes={emitentes} currentUser={currentUser} onClose={() => setJanela(null)} aoSalvar={depoisDeSalvar} />}
    </div>
  );
}
