// Leitor e conferidor de XML de NF-e (preparação do módulo fiscal, 26/11/2026; plano local em MODULO_FISCAL/). Só LÊ e confere: não emite, não grava e não manda nada para fora
// (o arquivo é lido no navegador e some quando a janela fecha). Sem importação de outro arquivo, para o teste (`ferramentas/teste_fiscal/`) carregá-lo direto no Node.
//
// As travas vêm da seção 5 da "Especificação – Emissão de NF-e via API (ACN e DETECH)" (13/11/2026). Cada uma diz se BLOQUEIA (a nota não deveria sair assim) ou só ALERTA.
// Ficaram de fora, de propósito, as regras que a própria especificação marca como "confirmar" com a contabilidade (12% x 17% de ICMS da ACN, DIFAL de venda a RR, SC810016) e a
// consulta de IE baixada ao Sintegra: nenhuma dessas se decide só olhando o XML.

export type No = { nome: string; attrs: Record<string, string>; filhos: No[]; texto: string };

const ENTIDADES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const decodificar = (s: string) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENTIDADES[e] ?? m;
});

/** Lê um XML para uma árvore simples. Tira o prefixo de espaço de nome (`ns:tag` vira `tag`). Lança `Error` se o XML estiver mal formado. */
export function lerXml(texto: string): No {
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  const pilha: No[] = [];
  let raiz: No | null = null;
  let m: RegExpExecArray | null;
  const semPrefixo = (n: string) => n.split(':').pop() as string;
  while ((m = re.exec(texto))) {
    if (m[1] !== undefined) { if (pilha.length) pilha[pilha.length - 1].texto += m[1]; continue; }
    if (m[2] !== undefined) {
      const topo = pilha.pop();
      if (!topo || topo.nome !== semPrefixo(m[2])) throw new Error('XML mal formado: a marca </' + m[2] + '> não fecha a que estava aberta.');
      continue;
    }
    if (m[3] !== undefined) {
      const attrs: Record<string, string> = {};
      for (const a of (m[4] || '').matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[semPrefixo(a[1])] = decodificar(a[2] ?? a[3] ?? '');
      const no: No = { nome: semPrefixo(m[3]), attrs, filhos: [], texto: '' };
      if (pilha.length) pilha[pilha.length - 1].filhos.push(no); else if (!raiz) raiz = no; else throw new Error('XML mal formado: mais de uma raiz.');
      if (!m[5]) pilha.push(no);
      continue;
    }
    if (m[6] !== undefined && pilha.length) pilha[pilha.length - 1].texto += decodificar(m[6]);
  }
  if (pilha.length) throw new Error('XML mal formado: a marca <' + pilha[pilha.length - 1].nome + '> não foi fechada.');
  if (!raiz) throw new Error('O arquivo não parece um XML.');
  return raiz;
}

/** Desce por uma sequência de nomes de filhos (`filho(no, 'ide', 'nNF')`); undefined se algum não existe. */
export function filho(no: No | undefined, ...caminho: string[]): No | undefined {
  let atual = no;
  for (const nome of caminho) { atual = atual?.filhos.find(f => f.nome === nome); if (!atual) return undefined; }
  return atual;
}
export const filhos = (no: No | undefined, nome: string): No[] => (no ? no.filhos.filter(f => f.nome === nome) : []);
/** O texto de um filho (aparado), ou '' se não existe. */
export const texto = (no: No | undefined, ...caminho: string[]): string => (filho(no, ...caminho)?.texto || '').trim();
const numero = (s: string): number | null => { const n = parseFloat(s); return Number.isFinite(n) ? n : null; };
/** Procura em toda a árvore (primeiro de cada nome). */
function achar(no: No | undefined, nome: string): No | undefined {
  if (!no) return undefined;
  if (no.nome === nome) return no;
  for (const f of no.filhos) { const r = achar(f, nome); if (r) return r; }
  return undefined;
}

// ── O que se tira de cada tipo de arquivo ──
export type ItemDaNota = {
  n: number; codigo: string; descricao: string; ncm: string; cfop: string; cest: string; cBenef: string; valor: number | null;
  origem: string; cst: string; csosn: string; pICMS: number | null; vICMSDeson: string; motDesICMS: string; temUFDest: boolean; temIBSCBS: boolean;
  cstPIS: string; pPIS: number | null; cstCOFINS: string; pCOFINS: number | null;
};

export type Nota = {
  tipo: 'nota'; arquivo: string; chave: string; numero: string; serie: string; modelo: string; emitCnpj: string; emitNome: string; emitUf: string; crt: string;
  destDoc: string; destNome: string; destUf: string; destIe: string; indIEDest: string; idDest: string; indFinal: string; finNFe: string; natOp: string;
  emissao: string; ano: number | null; valorNF: number | null; tPag: string[]; nfRef: string[]; itens: ItemDaNota[]; autorizada: boolean | null; cStat: string;
};

export type Evento = { tipo: 'evento'; arquivo: string; chave: string; tpEvento: string; sequencia: string; texto: string; data: string; cStat: string };
export type Inutilizacao = { tipo: 'inutilizacao'; arquivo: string; cnpj: string; serie: string; modelo: string; de: number; ate: number; ano: string; cStat: string };
export type Arquivo = Nota | Evento | Inutilizacao | { tipo: 'outro'; arquivo: string; motivo: string };

function lerItem(det: No): ItemDaNota {
  const prod = filho(det, 'prod');
  const imposto = filho(det, 'imposto');
  const icmsGrupo = filho(imposto, 'ICMS')?.filhos[0];
  const pisGrupo = filho(imposto, 'PIS')?.filhos[0];
  const cofinsGrupo = filho(imposto, 'COFINS')?.filhos[0];
  return {
    n: Number(det.attrs.nItem) || 0, codigo: texto(prod, 'cProd'), descricao: texto(prod, 'xProd'), ncm: texto(prod, 'NCM'), cfop: texto(prod, 'CFOP'), cest: texto(prod, 'CEST'),
    cBenef: texto(prod, 'cBenef'), valor: numero(texto(prod, 'vProd')),
    origem: texto(icmsGrupo, 'orig'), cst: texto(icmsGrupo, 'CST'), csosn: texto(icmsGrupo, 'CSOSN'), pICMS: numero(texto(icmsGrupo, 'pICMS')),
    vICMSDeson: texto(icmsGrupo, 'vICMSDeson'), motDesICMS: texto(icmsGrupo, 'motDesICMS'),
    temUFDest: !!filho(imposto, 'ICMSUFDest'), temIBSCBS: !!filho(imposto, 'IBSCBS'),
    cstPIS: texto(pisGrupo, 'CST'), pPIS: numero(texto(pisGrupo, 'pPIS')), cstCOFINS: texto(cofinsGrupo, 'CST'), pCOFINS: numero(texto(cofinsGrupo, 'pCOFINS')),
  };
}

/** Lê o conteúdo de um arquivo XML (já em texto). Nunca lança: o que não se entende volta como `{ tipo: 'outro', motivo }`. */
export function lerArquivoFiscal(arquivo: string, conteudo: string): Arquivo {
  let raiz: No;
  try { raiz = lerXml(conteudo); } catch (e: any) { return { tipo: 'outro', arquivo, motivo: e?.message || 'XML ilegível' }; }

  const infNFe = achar(raiz, 'infNFe');
  if (infNFe) {
    const ide = filho(infNFe, 'ide'), emit = filho(infNFe, 'emit'), dest = filho(infNFe, 'dest');
    const prot = achar(raiz, 'infProt');
    const cStat = texto(prot, 'cStat');
    const chave = (infNFe.attrs.Id || '').replace(/^NFe/, '') || texto(prot, 'chNFe');
    const emissao = texto(ide, 'dhEmi') || texto(ide, 'dEmi');
    const pag = filho(infNFe, 'pag');
    return {
      tipo: 'nota', arquivo, chave, numero: texto(ide, 'nNF'), serie: texto(ide, 'serie'), modelo: texto(ide, 'mod'),
      emitCnpj: texto(emit, 'CNPJ'), emitNome: texto(emit, 'xNome'), emitUf: texto(emit, 'enderEmit', 'UF'), crt: texto(emit, 'CRT'),
      destDoc: texto(dest, 'CNPJ') || texto(dest, 'CPF'), destNome: texto(dest, 'xNome'), destUf: texto(dest, 'enderDest', 'UF'), destIe: texto(dest, 'IE'),
      indIEDest: texto(dest, 'indIEDest'), idDest: texto(ide, 'idDest'), indFinal: texto(ide, 'indFinal'), finNFe: texto(ide, 'finNFe'), natOp: texto(ide, 'natOp'),
      emissao, ano: /^\d{4}/.test(emissao) ? Number(emissao.slice(0, 4)) : null, valorNF: numero(texto(infNFe, 'total', 'ICMSTot', 'vNF')),
      tPag: filhos(pag, 'detPag').map(d => texto(d, 'tPag')).filter(Boolean),
      nfRef: filhos(ide, 'NFref').map(r => texto(r, 'refNFe') || texto(r, 'refNF', 'nNF')).filter(Boolean),
      itens: filhos(infNFe, 'det').map(lerItem), autorizada: cStat ? (cStat === '100' || cStat === '150') : null, cStat,
    };
  }

  const infEvento = achar(raiz, 'infEvento');
  if (infEvento) {
    const ret = achar(raiz, 'retEvento');
    const det = filho(infEvento, 'detEvento');
    return {
      tipo: 'evento', arquivo, chave: texto(infEvento, 'chNFe'), tpEvento: texto(infEvento, 'tpEvento'), sequencia: texto(infEvento, 'nSeqEvento'),
      texto: texto(det, 'xCorrecao') || texto(det, 'xJust'), data: texto(infEvento, 'dhEvento'), cStat: texto(achar(ret, 'infEvento'), 'cStat'),
    };
  }

  const inut = achar(raiz, 'infInut');
  if (inut) {
    const ret = achar(raiz, 'retInutNFe');
    return {
      tipo: 'inutilizacao', arquivo, cnpj: texto(inut, 'CNPJ'), serie: texto(inut, 'serie'), modelo: texto(inut, 'mod'), de: Number(texto(inut, 'nNFIni')) || 0,
      ate: Number(texto(inut, 'nNFFin')) || 0, ano: texto(inut, 'ano'), cStat: texto(achar(ret, 'infInut'), 'cStat'),
    };
  }
  return { tipo: 'outro', arquivo, motivo: 'Não é uma NF-e, um evento nem uma inutilização (raiz <' + raiz.nome + '>).' };
}

// ── As travas ──
export type Achado = { regra: string; nivel: 'bloqueia' | 'alerta'; texto: string };
export type EmitenteCadastrado = { cnpj: string; crt: number | null; codigo?: string };

const CSTS_QUE_PEDEM_CBENEF = ['20', '30', '40', '41', '50', '51', '70', '90'];
const eVenda = (cfop: string) => /^[56](10[1-9]|11[0-9]|12[0-5]|40[1-5])$/.test(cfop);
const soNum = (s: string) => s.replace(/\D/g, '');

/** O dígito verificador da chave de 44 dígitos (módulo 11 com pesos de 2 a 9, da direita para a esquerda). */
export function chaveValida(chave: string): boolean {
  if (!/^\d{44}$/.test(chave)) return false;
  let soma = 0, peso = 2;
  for (let i = 42; i >= 0; i--) { soma += Number(chave[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11;
  return (r < 2 ? 0 : 11 - r) === Number(chave[43]);
}

const doisDecimais = (n: number | null) => (n === null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }));

/** Confere uma nota sozinha. `emitentes` são as empresas cadastradas no Fiscal (para saber o regime que cada uma deveria ter). */
export function conferirNota(n: Nota, emitentes: EmitenteCadastrado[] = []): Achado[] {
  const a: Achado[] = [];
  const ach = (regra: string, nivel: Achado['nivel'], texto: string) => a.push({ regra, nivel, texto });
  const itens = n.itens;
  const lista = (xs: number[]) => (xs.length > 6 ? xs.slice(0, 6).join(', ') + ' e mais ' + (xs.length - 6) : xs.join(', '));

  // a chave bate com a própria nota (CNPJ, série, número e dígito verificador)
  if (n.chave) {
    if (!chaveValida(n.chave)) ach('chave_invalida', 'bloqueia', 'A chave de acesso não passa na conferência do dígito verificador.');
    else {
      if (n.emitCnpj && n.chave.slice(6, 20) !== soNum(n.emitCnpj)) ach('chave_cnpj', 'bloqueia', 'O CNPJ dentro da chave não é o do emitente da nota.');
      if (n.numero && Number(n.chave.slice(25, 34)) !== Number(n.numero)) ach('chave_numero', 'bloqueia', 'O número dentro da chave não é o número da nota.');
      if (n.serie !== '' && Number(n.chave.slice(22, 25)) !== Number(n.serie)) ach('chave_serie', 'bloqueia', 'A série dentro da chave não é a série da nota.');
    }
  }
  if (n.autorizada === null) ach('sem_protocolo', 'alerta', 'O arquivo não traz o protocolo de autorização (não é o XML "procNFe" devolvido pela SEFAZ).');
  else if (n.autorizada === false) ach('nao_autorizada', 'bloqueia', `A SEFAZ não autorizou esta nota (situação ${n.cStat}).`);

  // CFOP × destino: o primeiro dígito vem de onde a nota vai (5 em SC, 6 em outra UF, 7 exterior)
  const prefixo = n.idDest === '1' ? '5' : n.idDest === '2' ? '6' : n.idDest === '3' ? '7' : '';
  if (prefixo && n.finNFe !== '4') {
    const ruins = itens.filter(i => i.cfop && i.cfop[0] !== prefixo && i.cfop[0] !== '1' && i.cfop[0] !== '2' && i.cfop[0] !== '3');
    if (ruins.length) ach('cfop_destino', 'bloqueia', `CFOP incompatível com o destino (o certo começa com ${prefixo}) nos itens ${lista(ruins.map(i => i.n))}.`);
  }

  // regime do emitente
  const cad = emitentes.find(e => soNum(e.cnpj) === soNum(n.emitCnpj));
  if (n.emitCnpj && !cad && emitentes.length) ach('emitente_nao_cadastrado', 'alerta', 'O CNPJ do emitente não está no cadastro de Empresas emitentes.');
  if (cad && cad.crt && n.crt && Number(n.crt) !== cad.crt) ach('crt_diferente', 'bloqueia', `O regime da nota (CRT ${n.crt}) não é o cadastrado para a empresa (CRT ${cad.crt}).`);
  const crt = n.crt;
  if (crt === '3') {
    const comSn = itens.filter(i => i.csosn);
    if (comSn.length) ach('csosn_em_regime_normal', 'bloqueia', `Empresa de regime normal com CSOSN (código do Simples) nos itens ${lista(comSn.map(i => i.n))}.`);
  }
  if (crt === '1') {
    const comCst = itens.filter(i => i.cst && !i.csosn);
    if (comCst.length) ach('cst_em_simples', 'bloqueia', `Empresa do Simples com CST (código do regime normal) nos itens ${lista(comCst.map(i => i.n))}.`);
  }

  // isenção de órgão estadual de SC: o ICMS dispensado precisa de valor e motivo
  const semDeson = itens.filter(i => i.cst === '40' && i.cBenef === 'SC810010' && (!i.vICMSDeson || !i.motDesICMS));
  if (semDeson.length) ach('cst40_sem_desoneracao', 'bloqueia', `CST 40 com o benefício SC810010 sem o valor e o motivo do ICMS desonerado nos itens ${lista(semDeson.map(i => i.n))}.`);

  // benefício fiscal obrigatório
  if (crt === '3') {
    const semBenef = itens.filter(i => CSTS_QUE_PEDEM_CBENEF.includes(i.cst) && !i.cBenef);
    if (semBenef.length) ach('cbenef_faltando', 'bloqueia', `O CST exige o código de benefício fiscal (cBenef) e ele está vazio nos itens ${lista(semBenef.map(i => i.n))}.`);

    // PIS/COFINS cumulativo errado
    const pis = itens.filter(i => i.cstPIS === '01' && ((i.pPIS !== null && Math.abs(i.pPIS - 1.65) > 0.0001) || (i.pCOFINS !== null && Math.abs(i.pCOFINS - 7.6) > 0.0001)));
    if (pis.length) ach('pis_cofins_aliquota', 'bloqueia', `PIS/COFINS com CST 01 fora de 1,65% e 7,6% nos itens ${lista(pis.map(i => i.n))}.`);

    // reforma tributária: a ACN informa IBS/CBS desde 2026
    if ((n.ano ?? 0) >= 2026) {
      const semIbs = itens.filter(i => !i.temIBSCBS);
      if (semIbs.length) ach('ibscbs_faltando', 'alerta', `${semIbs.length === itens.length ? 'Nenhum item traz' : 'Itens sem'} o grupo de IBS/CBS (${semIbs.length} de ${itens.length}).`);
    }
  }

  // forma de pagamento: "sem pagamento" só vale em devolução, remessa e ajuste
  if (n.finNFe === '1' && n.tPag.includes('90') && itens.some(i => eVenda(i.cfop))) ach('pagamento_90', 'alerta', 'Venda com forma de pagamento "90" (sem pagamento): informe o meio real (boleto, cartão, PIX…).');

  // destinatário
  if (n.indIEDest === '9' && n.destIe) ach('ie_com_indicador_9', 'bloqueia', 'Destinatário marcado como sem inscrição estadual (indicador 9), mas a nota leva inscrição estadual.');
  if (n.idDest === '2' && n.indFinal === '1' && n.indIEDest === '9' && !itens.some(i => i.temUFDest)) ach('difal_faltando', 'bloqueia', 'Venda interestadual a não contribuinte sem o grupo do ICMS do estado de destino (DIFAL).');
  const imp = itens.filter(i => n.idDest === '2' && n.indIEDest === '1' && ['1', '2', '3', '8'].includes(i.origem) && i.pICMS !== null && Math.abs(i.pICMS - 4) > 0.0001);
  if (imp.length) ach('importado_interestadual', 'bloqueia', `Produto importado vendido a contribuinte de outro estado deve sair com 4% de ICMS; saiu diferente nos itens ${lista(imp.map(i => i.n))}.`);

  // devolução
  if (n.finNFe === '4' && !n.nfRef.length) ach('devolucao_sem_referencia', 'bloqueia', 'Devolução sem a chave da nota de origem (refNFe).');

  return a;
}

export type Lote = { notas: Nota[]; eventos: Evento[]; inutilizacoes: Inutilizacao[]; outros: { arquivo: string; motivo: string }[] };
export type AchadoDeLote = Achado & { arquivos?: string[] };

const SITUACAO_OK_DO_EVENTO = ['135', '136', '155'];
const CARTA = '110110', CANCELAMENTO = '110111';

/** Separa o que foi lido por tipo. */
export function montarLote(arquivos: Arquivo[]): Lote {
  const l: Lote = { notas: [], eventos: [], inutilizacoes: [], outros: [] };
  for (const a of arquivos) {
    if (a.tipo === 'nota') l.notas.push(a); else if (a.tipo === 'evento') l.eventos.push(a); else if (a.tipo === 'inutilizacao') l.inutilizacoes.push(a);
    else l.outros.push({ arquivo: a.arquivo, motivo: a.motivo });
  }
  return l;
}

/** Notas que tiveram o cancelamento aceito (chave → true). */
export const chavesCanceladas = (eventos: Evento[]): Set<string> => new Set(eventos.filter(e => e.tpEvento === CANCELAMENTO && (!e.cStat || SITUACAO_OK_DO_EVENTO.includes(e.cStat))).map(e => e.chave));

/** Confere o que só se vê olhando várias notas juntas. */
export function conferirLote(l: Lote): AchadoDeLote[] {
  const a: AchadoDeLote[] = [];

  // a mesma chave em dois arquivos
  const porChave = new Map<string, string[]>();
  for (const n of l.notas) if (n.chave) porChave.set(n.chave, [...(porChave.get(n.chave) || []), n.arquivo]);
  for (const [chave, arqs] of porChave) if (arqs.length > 1) a.push({ regra: 'nota_repetida', nivel: 'alerta', texto: `A nota de chave ${chave} está em ${arqs.length} arquivos.`, arquivos: arqs });

  // cartas de correção que mudam o que a carta não pode mudar (o texto é livre: a busca é por palavra, então é para a pessoa conferir)
  for (const e of l.eventos) {
    if (e.tpEvento !== CARTA) continue;
    const bloqueia = /\b(NCM|DIFAL|al[ií]quota|base de c[aá]lculo)\b/i.test(e.texto);
    const alerta = /\b(valor|quantidade|qtd|pre[cç]o)\b/i.test(e.texto);
    if (bloqueia || alerta) a.push({ regra: 'carta_muda_imposto', nivel: bloqueia ? 'bloqueia' : 'alerta', texto: `Carta de correção da nota ${e.chave.slice(25, 34).replace(/^0+/, '')} (${e.chave.slice(22, 25).replace(/^0+/, '') || '0'}) que parece mudar ${bloqueia ? 'imposto' : 'valor ou quantidade'}: "${e.texto.slice(0, 160)}${e.texto.length > 160 ? '…' : ''}".`, arquivos: [e.arquivo] });
  }

  // números que faltam na sequência de cada série (menos os inutilizados)
  const grupos = new Map<string, { cnpj: string; serie: string; numeros: Set<number> }>();
  for (const n of l.notas) {
    const num = Number(n.numero); if (!num || !n.emitCnpj) continue;
    const k = soNum(n.emitCnpj) + '|' + Number(n.serie) + '|' + n.modelo;
    if (!grupos.has(k)) grupos.set(k, { cnpj: soNum(n.emitCnpj), serie: String(Number(n.serie)), numeros: new Set() });
    grupos.get(k)!.numeros.add(num);
  }
  for (const g of grupos.values()) {
    const ordem = [...g.numeros].sort((x, y) => x - y);
    const inut = l.inutilizacoes.filter(i => soNum(i.cnpj) === g.cnpj && String(Number(i.serie)) === g.serie);
    const faltam: number[] = [];
    for (let x = ordem[0]; x <= ordem[ordem.length - 1]; x++) if (!g.numeros.has(x) && !inut.some(i => x >= i.de && x <= i.ate)) faltam.push(x);
    if (faltam.length) {
      const faixas: string[] = []; let ini = faltam[0], ant = faltam[0];
      for (const x of [...faltam.slice(1), Infinity]) { if (x !== ant + 1) { faixas.push(ini === ant ? String(ini) : `${ini}–${ant}`); ini = x; } ant = x; }
      a.push({ regra: 'numero_pulado', nivel: 'alerta', texto: `Série ${g.serie} do CNPJ ${g.cnpj}: ${faltam.length} número${faltam.length > 1 ? 's' : ''} sem XML entre ${ordem[0]} e ${ordem[ordem.length - 1]} (${faixas.slice(0, 12).join(', ')}${faixas.length > 12 ? ' e mais' : ''}). Pode ter sido cancelado, inutilizado ou só não estar na pasta.` });
    }
  }

  // natureza da operação da devolução escrita de jeitos diferentes
  const nat = new Map<string, Map<string, number>>();
  for (const n of l.notas) {
    if (n.finNFe !== '4' || !n.natOp) continue;
    const k = soNum(n.emitCnpj); const m = nat.get(k) || new Map<string, number>(); m.set(n.natOp, (m.get(n.natOp) || 0) + 1); nat.set(k, m);
  }
  for (const [cnpj, m] of nat) if (m.size > 1) a.push({ regra: 'natureza_devolucao', nivel: 'alerta', texto: `CNPJ ${cnpj}: a natureza da operação da devolução aparece de ${m.size} jeitos (${[...m].map(([t, c]) => `"${t}" ×${c}`).join('; ')}). O texto deve ser fixo.` });

  // o mesmo código de produto com NCM ou origem diferentes
  const prod = new Map<string, Map<string, number>>();
  for (const n of l.notas) for (const i of n.itens) {
    if (!i.codigo) continue;
    const k = soNum(n.emitCnpj) + '|' + i.codigo; const m = prod.get(k) || new Map<string, number>();
    const v = `NCM ${i.ncm || '—'}, origem ${i.origem || '—'}`; m.set(v, (m.get(v) || 0) + 1); prod.set(k, m);
  }
  let divergentes = 0;
  for (const [k, m] of prod) if (m.size > 1) { divergentes++; if (divergentes <= 25) a.push({ regra: 'produto_divergente', nivel: 'alerta', texto: `Produto ${k.split('|')[1]} com cadastro diferente entre notas: ${[...m].map(([v, c]) => `${v} (${c}×)`).join(' e ')}.` }); }
  if (divergentes > 25) a.push({ regra: 'produto_divergente', nivel: 'alerta', texto: `E mais ${divergentes - 25} produtos com NCM ou origem diferentes entre notas.` });

  return a;
}

export const NOMES_DAS_REGRAS: Record<string, string> = {
  chave_invalida: 'Chave inválida', chave_cnpj: 'Chave com outro CNPJ', chave_numero: 'Chave com outro número', chave_serie: 'Chave com outra série',
  sem_protocolo: 'Sem protocolo', nao_autorizada: 'Não autorizada', cfop_destino: 'CFOP × destino', emitente_nao_cadastrado: 'Emitente não cadastrado', crt_diferente: 'Regime diferente do cadastro',
  csosn_em_regime_normal: 'CSOSN em regime normal', cst_em_simples: 'CST no Simples', cst40_sem_desoneracao: 'CST 40 sem desoneração', cbenef_faltando: 'cBenef faltando',
  pis_cofins_aliquota: 'PIS/COFINS fora da alíquota', ibscbs_faltando: 'IBS/CBS faltando', pagamento_90: 'Pagamento 90 em venda', ie_com_indicador_9: 'IE com indicador 9',
  difal_faltando: 'DIFAL faltando', importado_interestadual: 'Importado fora de 4%', devolucao_sem_referencia: 'Devolução sem referência', nota_repetida: 'Nota repetida',
  carta_muda_imposto: 'Carta de correção suspeita', numero_pulado: 'Número pulado', natureza_devolucao: 'Natureza da devolução', produto_divergente: 'Produto divergente',
};

export { doisDecimais as formatarNumeroDoXml };
