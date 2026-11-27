// Regras puras dos cadastros fiscais (preparação do módulo fiscal, 26/11/2026; plano local em MODULO_FISCAL/). Sem banco e sem importação de outro arquivo:
// o teste (`ferramentas/teste_fiscal/`) as carrega direto no Node.
//
// Decisão do usuário em 26/11/2026: a emissão da nota vai usar um serviço de terceiro SÓ para transmitir; as regras, os cadastros e as travas são nossos. Estes são os cadastros que a
// especificação do Fiscal (13/11/2026) pede e o sistema não tinha. Campo vazio = "ninguém respondeu ainda" (é o que o relatório de pendências conta): nenhum campo tem valor padrão.

export const soDigitos = (v: unknown): string => String(v ?? '').replace(/\D/g, '');

// ── Opções de campo (o texto de tela e o valor gravado no banco) ──
export const OPCOES_INDICADOR_IE = [
  { valor: 'contribuinte', rotulo: 'Contribuinte do ICMS (tem inscrição estadual ativa)' },
  { valor: 'isento', rotulo: 'Contribuinte isento de inscrição' },
  { valor: 'nao_contribuinte', rotulo: 'Não contribuinte (pessoa física, órgão público sem inscrição)' },
] as const;

export const OPCOES_TIPO_ORGAO = [
  { valor: 'nenhum', rotulo: 'Não é órgão público' },
  { valor: 'estadual_sc', rotulo: 'Órgão estadual de Santa Catarina (direta, fundação ou autarquia)' },
  { valor: 'estadual_outro', rotulo: 'Órgão estadual de outro estado' },
  { valor: 'municipal', rotulo: 'Órgão municipal' },
  { valor: 'federal', rotulo: 'Órgão federal' },
] as const;

export const ORIGENS_FISCAIS = [
  { valor: 0, rotulo: '0 — Nacional' },
  { valor: 1, rotulo: '1 — Estrangeira, importação direta' },
  { valor: 2, rotulo: '2 — Estrangeira, comprada no mercado interno' },
  { valor: 3, rotulo: '3 — Nacional com mais de 40% de conteúdo importado' },
  { valor: 4, rotulo: '4 — Nacional, produção conforme processos básicos' },
  { valor: 5, rotulo: '5 — Nacional com até 40% de conteúdo importado' },
  { valor: 6, rotulo: '6 — Estrangeira, importação direta, sem similar nacional' },
  { valor: 7, rotulo: '7 — Estrangeira, mercado interno, sem similar nacional' },
  { valor: 8, rotulo: '8 — Nacional com mais de 70% de conteúdo importado' },
] as const;

export const OPCOES_CRT = [
  { valor: 1, rotulo: '1 — Simples Nacional' },
  { valor: 2, rotulo: '2 — Simples Nacional, excesso de sublimite' },
  { valor: 3, rotulo: '3 — Regime normal (Lucro Presumido ou Real)' },
  { valor: 4, rotulo: '4 — MEI' },
] as const;

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

// ── Documentos ──
export function cnpjValido(v: unknown): boolean {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (base: string) => {
    let soma = 0, peso = base.length - 7;
    for (const c of base) { soma += Number(c) * peso--; if (peso < 2) peso = 9; }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(d.slice(0, 12)) === Number(d[12]) && dv(d.slice(0, 13)) === Number(d[13]);
}

export function cpfValido(v: unknown): boolean {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (base: string) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(d.slice(0, 9)) === Number(d[9]) && dv(d.slice(0, 10)) === Number(d[10]);
}

/** CPF (11) ou CNPJ (14) com os dígitos verificadores certos. */
export const documentoValido = (v: unknown): boolean => { const d = soDigitos(v); return d.length === 11 ? cpfValido(d) : d.length === 14 ? cnpjValido(d) : false; };

export const ncmValido = (v: unknown): boolean => soDigitos(v).length === 8;
export const formatarNcm = (v: unknown): string => soDigitos(v).slice(0, 8).replace(/^(\d{4})(\d)/, '$1.$2').replace(/^(\d{4})\.(\d{2})(\d)/, '$1.$2.$3');
export const formatarCest = (v: unknown): string => soDigitos(v).slice(0, 7).replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');

// ── Cliente (o destinatário da nota) ──
export type FiscalCliente = {
  inscricao_estadual: string; indicador_ie: string; tipo_orgao: string; retem_ir: '' | 'sim' | 'nao'; codigo_ibge: string;
  inscricao_municipal: string; inscricao_suframa: string; observacao: string;
};

export const FISCAL_CLIENTE_VAZIO: FiscalCliente = {
  inscricao_estadual: '', indicador_ie: '', tipo_orgao: '', retem_ir: '', codigo_ibge: '', inscricao_municipal: '', inscricao_suframa: '', observacao: '',
};

/** A linha do banco (ou nada) na forma que a tela edita: texto em tudo, "sim"/"nao" no lugar do boolean. */
export function formDoFiscalCliente(linha: any): FiscalCliente {
  if (!linha) return { ...FISCAL_CLIENTE_VAZIO };
  return {
    inscricao_estadual: linha.inscricao_estadual || '', indicador_ie: linha.indicador_ie || '', tipo_orgao: linha.tipo_orgao || '',
    retem_ir: linha.retem_ir === true ? 'sim' : linha.retem_ir === false ? 'nao' : '', codigo_ibge: linha.codigo_ibge || '',
    inscricao_municipal: linha.inscricao_municipal || '', inscricao_suframa: linha.inscricao_suframa || '', observacao: linha.observacao || '',
  };
}

/** A frase do que está errado, ou null. Salvar com campo vazio vale (ninguém é obrigado a responder tudo de uma vez); o que se informa tem de estar certo. */
export function erroDoFiscalCliente(f: FiscalCliente): string | null {
  const ie = soDigitos(f.inscricao_estadual);
  if (ie && (ie.length < 2 || ie.length > 14)) return 'A inscrição estadual deve ter de 2 a 14 dígitos (só números).';
  // Regra da especificação: a nota nunca leva inscrição estadual quando o destinatário não é contribuinte (indicador 9).
  if (ie && (f.indicador_ie === 'nao_contribuinte' || f.indicador_ie === 'isento')) return 'Cliente não contribuinte ou isento não tem inscrição estadual: apague o número ou mude o indicador.';
  if (f.indicador_ie === 'contribuinte' && !ie) return 'Cliente contribuinte precisa da inscrição estadual.';
  if (f.codigo_ibge && !/^\d{7}$/.test(f.codigo_ibge)) return 'O código do município (IBGE) tem 7 dígitos.';
  return null;
}

export function fiscalClienteParaGravar(f: FiscalCliente, usuarioId: string | null) {
  const ie = soDigitos(f.inscricao_estadual);
  return {
    inscricao_estadual: ie || null,
    indicador_ie: f.indicador_ie || null,
    tipo_orgao: f.tipo_orgao || null,
    retem_ir: f.retem_ir === 'sim' ? true : f.retem_ir === 'nao' ? false : null,
    codigo_ibge: soDigitos(f.codigo_ibge) || null,
    inscricao_municipal: f.inscricao_municipal.trim() || null,
    inscricao_suframa: soDigitos(f.inscricao_suframa) || null,
    observacao: f.observacao.trim() || null,
    atualizado_em: new Date().toISOString(),
    atualizado_por_id: usuarioId,
  };
}

export const CAMPOS_FISCAIS_DO_CLIENTE = [
  { chave: 'indicador_ie', rotulo: 'Contribuinte' },
  { chave: 'inscricao_estadual', rotulo: 'Inscrição estadual' },
  { chave: 'tipo_orgao', rotulo: 'Tipo de órgão' },
  { chave: 'retem_ir', rotulo: 'Retém IR' },
  { chave: 'codigo_ibge', rotulo: 'Código IBGE' },
] as const;

/** Chaves dos campos que ainda faltam (a linha do banco, ou nada, e o cadastro do cliente). Inscrição estadual só é cobrada de quem é contribuinte. */
export function faltasDoCliente(fiscal: any): string[] {
  const f = fiscal || {};
  const falta: string[] = [];
  if (!f.indicador_ie) falta.push('indicador_ie');
  if (f.indicador_ie === 'contribuinte' && !soDigitos(f.inscricao_estadual)) falta.push('inscricao_estadual');
  if (!f.tipo_orgao) falta.push('tipo_orgao');
  if (f.retem_ir !== true && f.retem_ir !== false) falta.push('retem_ir');
  if (!/^\d{7}$/.test(String(f.codigo_ibge || ''))) falta.push('codigo_ibge');
  return falta;
}

// ── Item (o produto da nota) ──
export type FiscalItem = { cest: string; cest_nao_se_aplica: boolean; origem_fiscal: string; monofasico: '' | 'sim' | 'nao'; enquadramento_ipi: string };
export const FISCAL_ITEM_VAZIO: FiscalItem = { cest: '', cest_nao_se_aplica: false, origem_fiscal: '', monofasico: '', enquadramento_ipi: '' };

export function formDoFiscalItem(linha: any): FiscalItem {
  if (!linha) return { ...FISCAL_ITEM_VAZIO };
  return {
    cest: linha.cest || '', cest_nao_se_aplica: linha.cest_nao_se_aplica === true,
    origem_fiscal: linha.origem_fiscal === null || linha.origem_fiscal === undefined ? '' : String(linha.origem_fiscal),
    monofasico: linha.monofasico === true ? 'sim' : linha.monofasico === false ? 'nao' : '', enquadramento_ipi: linha.enquadramento_ipi || '',
  };
}

export function erroDoFiscalItem(f: FiscalItem): string | null {
  const cest = soDigitos(f.cest);
  if (cest && cest.length !== 7) return 'O CEST tem 7 dígitos.';
  if (cest && f.cest_nao_se_aplica) return 'Informe o CEST ou marque "não se aplica", não os dois.';
  const enq = soDigitos(f.enquadramento_ipi);
  if (enq && enq.length !== 3) return 'O enquadramento do IPI tem 3 dígitos (ex.: 999).';
  if (f.origem_fiscal !== '' && !(Number(f.origem_fiscal) >= 0 && Number(f.origem_fiscal) <= 8)) return 'A origem vai de 0 a 8.';
  return null;
}

export function fiscalItemParaGravar(f: FiscalItem, usuarioId: string | null) {
  return {
    cest: soDigitos(f.cest) || null,
    cest_nao_se_aplica: f.cest_nao_se_aplica === true,
    origem_fiscal: f.origem_fiscal === '' ? null : Number(f.origem_fiscal),
    monofasico: f.monofasico === 'sim' ? true : f.monofasico === 'nao' ? false : null,
    enquadramento_ipi: soDigitos(f.enquadramento_ipi) || null,
    atualizado_em: new Date().toISOString(),
    atualizado_por_id: usuarioId,
  };
}

export const CAMPOS_FISCAIS_DO_ITEM = [
  { chave: 'ncm', rotulo: 'NCM' },
  { chave: 'origem_fiscal', rotulo: 'Origem' },
  { chave: 'monofasico', rotulo: 'Monofásico' },
  { chave: 'cest', rotulo: 'CEST' },
  { chave: 'enquadramento_ipi', rotulo: 'Enquadramento IPI' },
] as const;

/** O que falta no item: NCM (8 dígitos, vem do cadastro do item), origem, monofásico, CEST (a menos que "não se aplica") e, só se o item paga IPI, o enquadramento. */
export function faltasDoItem(item: any, fiscal: any): string[] {
  const f = fiscal || {};
  const falta: string[] = [];
  if (!ncmValido(item?.ncm)) falta.push('ncm');
  if (f.origem_fiscal === null || f.origem_fiscal === undefined) falta.push('origem_fiscal');
  if (f.monofasico !== true && f.monofasico !== false) falta.push('monofasico');
  if (!f.cest_nao_se_aplica && soDigitos(f.cest).length !== 7) falta.push('cest');
  if (Number(item?.ipi_pct) > 0 && soDigitos(f.enquadramento_ipi).length !== 3) falta.push('enquadramento_ipi');
  return falta;
}

// ── Empresa que emite a nota ──
export type FiscalEmitente = {
  razao_social: string; nome_fantasia: string; cnpj: string; inscricao_estadual: string; inscricao_municipal: string; crt: string; cnae: string;
  cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string; codigo_ibge: string;
  telefone: string; email_fiscal: string; serie_nfe: string; serie_nfe_nova: string; serie_nfse: string; observacao: string;
};

export const FISCAL_EMITENTE_VAZIO: FiscalEmitente = {
  razao_social: '', nome_fantasia: '', cnpj: '', inscricao_estadual: '', inscricao_municipal: '', crt: '', cnae: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '',
  cidade: '', uf: '', codigo_ibge: '', telefone: '', email_fiscal: '', serie_nfe: '', serie_nfe_nova: '', serie_nfse: '', observacao: '',
};

export function formDoEmitente(linha: any): FiscalEmitente {
  const f: any = { ...FISCAL_EMITENTE_VAZIO };
  if (linha) for (const k of Object.keys(f)) f[k] = linha[k] === null || linha[k] === undefined ? '' : String(linha[k]);
  return f;
}

export function erroDoEmitente(f: FiscalEmitente): string | null {
  if (f.cnpj && !cnpjValido(f.cnpj)) return 'O CNPJ da empresa não é válido (confira os dígitos).';
  if (f.codigo_ibge && !/^\d{7}$/.test(f.codigo_ibge)) return 'O código do município (IBGE) tem 7 dígitos.';
  if (f.uf && !UFS.includes(f.uf.toUpperCase())) return 'UF inválida.';
  for (const [k, r] of [['serie_nfe', 'A série da NF-e'], ['serie_nfe_nova', 'A série nova da NF-e']] as const) {
    if (f[k] && !/^\d{1,3}$/.test(f[k].trim())) return `${r} é um número de 1 a 3 dígitos.`;
  }
  // Na transição o sistema novo não pode usar a mesma série do antigo: a numeração colidiria (especificação do Fiscal, passo 3 da implantação).
  if (f.serie_nfe && f.serie_nfe_nova && Number(f.serie_nfe) === Number(f.serie_nfe_nova)) return 'A série nova tem de ser diferente da série em uso hoje, senão a numeração das notas colide.';
  return null;
}

export function emitenteParaGravar(f: FiscalEmitente, usuarioId: string | null) {
  const t = (v: string) => v.trim() || null;
  return {
    razao_social: t(f.razao_social), nome_fantasia: t(f.nome_fantasia), cnpj: soDigitos(f.cnpj) || null,
    inscricao_estadual: soDigitos(f.inscricao_estadual) || null, inscricao_municipal: t(f.inscricao_municipal), crt: f.crt === '' ? null : Number(f.crt),
    cnae: soDigitos(f.cnae) || null, cep: soDigitos(f.cep) || null, logradouro: t(f.logradouro), numero: t(f.numero), complemento: t(f.complemento), bairro: t(f.bairro),
    cidade: t(f.cidade), uf: f.uf ? f.uf.toUpperCase() : null, codigo_ibge: soDigitos(f.codigo_ibge) || null, telefone: t(f.telefone), email_fiscal: t(f.email_fiscal),
    serie_nfe: f.serie_nfe === '' ? null : Number(f.serie_nfe), serie_nfe_nova: f.serie_nfe_nova === '' ? null : Number(f.serie_nfe_nova), serie_nfse: t(f.serie_nfse),
    observacao: t(f.observacao), atualizado_em: new Date().toISOString(), atualizado_por_id: usuarioId,
  };
}

/** O que ainda falta para a empresa poder emitir (o relatório de pendências e o selo da lista). */
export function faltasDoEmitente(e: any): string[] {
  const f = e || {};
  const falta: string[] = [];
  if (!f.razao_social) falta.push('razão social');
  if (!cnpjValido(f.cnpj)) falta.push('CNPJ');
  if (!soDigitos(f.inscricao_estadual)) falta.push('inscrição estadual');
  if (!f.crt) falta.push('regime (CRT)');
  if (!f.inscricao_municipal) falta.push('inscrição municipal');
  if (!f.cep || !f.logradouro || !f.numero || !f.bairro || !f.cidade || !f.uf) falta.push('endereço fiscal');
  if (!/^\d{7}$/.test(String(f.codigo_ibge || ''))) falta.push('código IBGE');
  if (f.serie_nfe === null || f.serie_nfe === undefined) falta.push('série da NF-e');
  return falta;
}

// ── Transportadora ──
export type FiscalTransportadora = {
  nome: string; razao_social: string; documento: string; inscricao_estadual: string; rntrc: string;
  cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string; telefone: string; email: string; observacao: string;
};
export const FISCAL_TRANSPORTADORA_VAZIA: FiscalTransportadora = {
  nome: '', razao_social: '', documento: '', inscricao_estadual: '', rntrc: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', telefone: '', email: '', observacao: '',
};

export function formDaTransportadora(linha: any): FiscalTransportadora {
  const f: any = { ...FISCAL_TRANSPORTADORA_VAZIA };
  if (linha) for (const k of Object.keys(f)) f[k] = linha[k] === null || linha[k] === undefined ? '' : String(linha[k]);
  return f;
}

export function erroDaTransportadora(f: FiscalTransportadora): string | null {
  if (!f.nome.trim()) return 'Informe o nome da transportadora.';
  if (f.documento && !documentoValido(f.documento)) return 'O CNPJ ou CPF não é válido (confira os dígitos).';
  if (f.uf && !UFS.includes(f.uf.toUpperCase())) return 'UF inválida.';
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return 'O e-mail não parece certo.';
  return null;
}

export function transportadoraParaGravar(f: FiscalTransportadora, usuarioId: string | null) {
  const t = (v: string) => v.trim() || null;
  return {
    nome: f.nome.trim(), razao_social: t(f.razao_social), documento: soDigitos(f.documento) || null, inscricao_estadual: soDigitos(f.inscricao_estadual) || null, rntrc: soDigitos(f.rntrc) || null,
    cep: soDigitos(f.cep) || null, logradouro: t(f.logradouro), numero: t(f.numero), complemento: t(f.complemento), bairro: t(f.bairro), cidade: t(f.cidade),
    uf: f.uf ? f.uf.toUpperCase() : null, telefone: t(f.telefone), email: t(f.email), observacao: t(f.observacao), atualizado_em: new Date().toISOString(), atualizado_por_id: usuarioId,
  };
}
