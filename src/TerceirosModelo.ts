// Serviços de terceiros: as regras e a leitura/gravação dos CADASTROS, tipos de serviço e prestadores (fatia T1 do PLANO_SERVICOS_TERCEIROS.md, pedido do usuário em 22/11/2026).
// Quem pode o quê vale na tela E no banco: o banco é quem confere (políticas das tabelas); a tela só deixa de oferecer o botão que não vai funcionar.
//  • prestadores: Admin, gerentes e quem tem a aba Adaptação cadastram e corrigem (`podeGerirPrestadoresDeTerceiros`); tipos de serviço: só o Admin (`podeEditarTiposDeTerceiros`).
//    As duas são suposições minhas, a confirmar com o usuário (plano, seção 6).
//  • nada se apaga: tipo e prestador se DESATIVAM, porque os serviços já pedidos apontam para eles. Leitura recusada devolve o erro, nunca "lista vazia" (a tela avisa).
//  • o cadastro de prestadores é PRÓPRIO deste módulo (decidido com o usuário), não o de fornecedores do Compras: o prestador é quem faz o serviço, o fornecedor é quem vende material.
import { supabase } from './supabaseClient';
import { normalizarBusca } from './SearchUtils';
import { erroDeTelefone } from './Telefone';
import { cepParaGravar } from './Cep';
import { explicarErroDoBanco } from './ErroDoBanco';
import { lerPaginado } from './LerPaginado';
import { soDigitos, formatarDocumento } from './ComprasFornecedores';

export { formatarDocumento };

export type QuemMarcaData = 'solicitante' | 'adaptacao';
export type OndeSeFaz = 'fabrica' | 'prestador';

export type TipoDeServico = {
  id: string; nome: string; nome_norm: string; quem_marca_data: QuemMarcaData; onde_padrao: OndeSeFaz | null;
  usa_ordem_em_lote: boolean; ativo: boolean; ordem: number;
};

export type PrestadorDeTerceiros = {
  id: string; nome: string; nome_norm: string; razao_social: string | null; cnpj_cpf: string | null; contato_nome: string | null; telefone: string | null; email: string | null;
  cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null;
  tipos_ids: string[]; observacao: string | null; ativo: boolean;
};

type Quem = { email?: string; nome?: string } | null;

/** O nome como o banco o guarda para barrar repetido: sem acento, em minúsculas e com um espaço só entre as palavras (a mesma conta do cadastro de fornecedores do Compras). */
export const chaveDoNome = (nome: unknown): string => normalizarBusca(String(nome ?? '')).replace(/\s+/g, ' ').trim();

const vazioNulo = (v: string): string | null => (v.trim() ? v.trim() : null);

// ── o que cada escolha do tipo quer dizer, em palavras da fábrica ───────────────────────────────────────────────────────────────────────────────
export const OPCOES_QUEM_MARCA_DATA: { id: QuemMarcaData; rotulo: string; explicacao: string }[] = [
  { id: 'solicitante', rotulo: 'Quem pediu o serviço', explicacao: 'Quem pede escolhe o prestador e marca o dia.' },
  { id: 'adaptacao', rotulo: 'A Adaptação', explicacao: 'Quem pede só diz o dia que gostaria; a Adaptação escolhe o prestador e marca o dia.' },
];

export const rotuloDeQuemMarca = (q: QuemMarcaData | null | undefined): string => (q === 'adaptacao' ? 'A Adaptação' : 'Quem pediu');
export const rotuloDoOnde = (onde: OndeSeFaz | null | undefined): string => (onde === 'fabrica' ? 'Na fábrica' : onde === 'prestador' ? 'No prestador' : 'Cada pedido escolhe');

// ═══ PRESTADORES ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

export const FORM_VAZIO_PRESTADOR = {
  nome: '', razao_social: '', cnpj_cpf: '', contato_nome: '', telefone: '', email: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
  tipos_ids: [] as string[], observacao: '',
};
export type FormPrestador = typeof FORM_VAZIO_PRESTADOR;

export const formDoPrestador = (p: Partial<PrestadorDeTerceiros> | null): FormPrestador => ({
  ...FORM_VAZIO_PRESTADOR,
  ...(p ? {
    nome: p.nome || '', razao_social: p.razao_social || '', cnpj_cpf: formatarDocumento(p.cnpj_cpf), contato_nome: p.contato_nome || '', telefone: p.telefone || '', email: p.email || '',
    cep: p.cep || '', logradouro: p.logradouro || '', numero: p.numero || '', complemento: p.complemento || '', bairro: p.bairro || '', cidade: p.cidade || '', uf: p.uf || '',
    tipos_ids: p.tipos_ids || [], observacao: p.observacao || '',
  } : {}),
});

/** A frase do que está errado no cadastro, ou null. `existentes` é a lista inteira (para barrar nome e documento repetidos); `id` é o do que está sendo editado. */
export function erroDoPrestador(form: FormPrestador, existentes: PrestadorDeTerceiros[], id?: string | null): string | null {
  if (!form.nome.trim()) return 'Informe o nome do prestador.';
  const chave = chaveDoNome(form.nome);
  const igual = existentes.find(p => p.id !== id && p.nome_norm === chave);
  if (igual) return `Já existe um prestador com esse nome: ${igual.nome}${igual.ativo ? '' : ' (inativo; reative-o em vez de cadastrar de novo)'}.`;
  const d = soDigitos(form.cnpj_cpf);
  if (d && d.length !== 11 && d.length !== 14) return 'O CPF tem 11 números e o CNPJ tem 14; confira o documento.';
  if (d) {
    const dono = existentes.find(p => p.id !== id && p.cnpj_cpf === d);
    if (dono) return `Esse ${d.length === 11 ? 'CPF' : 'CNPJ'} já está cadastrado em ${dono.nome}.`;
  }
  const email = form.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'O e-mail não parece válido (exemplo: contato@empresa.com.br).';
  const tel = erroDeTelefone(form.telefone, 'telefone');
  if (tel) return tel;
  if (form.uf.trim() && !/^[A-Za-z]{2}$/.test(form.uf.trim())) return 'A UF tem 2 letras (ex.: SC).';
  return null;
}

export const prestadorParaGravar = (form: FormPrestador) => ({
  nome: form.nome.trim().replace(/\s+/g, ' '),
  nome_norm: chaveDoNome(form.nome),
  razao_social: vazioNulo(form.razao_social),
  cnpj_cpf: soDigitos(form.cnpj_cpf) || null,
  contato_nome: vazioNulo(form.contato_nome),
  telefone: vazioNulo(form.telefone),
  email: vazioNulo(form.email.toLowerCase()),
  cep: cepParaGravar(form.cep),
  logradouro: vazioNulo(form.logradouro), numero: vazioNulo(form.numero), complemento: vazioNulo(form.complemento), bairro: vazioNulo(form.bairro),
  cidade: vazioNulo(form.cidade), uf: form.uf.trim() ? form.uf.trim().toUpperCase() : null,
  tipos_ids: form.tipos_ids,
  observacao: vazioNulo(form.observacao),
});

const COLUNAS_PRESTADOR = 'id,nome,nome_norm,razao_social,cnpj_cpf,contato_nome,telefone,email,cep,logradouro,numero,complemento,bairro,cidade,uf,tipos_ids,observacao,ativo';

/** O prestador atende o tipo? Quem não marcou nenhum tipo aparece para qualquer um (a janela de pedir, na fatia T2, usa esta mesma conta). */
export const prestadorFazOTipo = (p: Pick<PrestadorDeTerceiros, 'tipos_ids'>, tipoId: string): boolean => !p.tipos_ids?.length || p.tipos_ids.includes(tipoId);

/** Os nomes dos tipos que o prestador marcou, na ordem da lista de tipos (vazio = não limitou: faz qualquer serviço). */
export const nomesDosTiposDoPrestador = (p: Pick<PrestadorDeTerceiros, 'tipos_ids'>, tipos: TipoDeServico[]): string[] =>
  tipos.filter(t => p.tipos_ids?.includes(t.id)).map(t => t.nome);

/** Lê todos os prestadores. Leitura recusada devolve o erro (a tela avisa em vez de mostrar "nenhum prestador"). */
export async function lerPrestadores(): Promise<{ lista: PrestadorDeTerceiros[]; erro: string | null }> {
  const { data, error } = await supabase.from('terceiros_prestadores').select(COLUNAS_PRESTADOR).order('nome').range(0, 4999);
  if (error || !data) return { lista: [], erro: error?.message || 'sem resposta' };
  return { lista: data as PrestadorDeTerceiros[], erro: null };
}

/** Cadastra (sem id) ou corrige (com id) um prestador. Devolve o registro gravado ou a frase do erro. */
export async function salvarPrestador(form: FormPrestador, existentes: PrestadorDeTerceiros[], quem: Quem, id?: string | null)
  : Promise<{ prestador?: PrestadorDeTerceiros; antes?: PrestadorDeTerceiros | null; erro?: string }> {
  const e = erroDoPrestador(form, existentes, id);
  if (e) return { erro: e };
  const campos = prestadorParaGravar(form);
  const agora = new Date().toISOString();
  if (id) {
    const antes = existentes.find(p => p.id === id) || null;
    const { data, error } = await supabase.from('terceiros_prestadores').update({ ...campos, atualizado_em: agora, atualizado_por: quem?.nome || null }).eq('id', id).select(COLUNAS_PRESTADOR);
    if (error) return { erro: `Não foi possível gravar o prestador: ${explicarErroDoBanco(error)}` };
    if (!data?.length) return { erro: 'Não foi possível gravar o prestador: nada foi atualizado. Atualize a lista e tente de novo; se repetir, só Admin, gerentes e a Adaptação alteram prestadores.' };
    return { prestador: data[0] as PrestadorDeTerceiros, antes };
  }
  const { data, error } = await supabase.from('terceiros_prestadores').insert([{ ...campos, criado_por: quem?.nome || quem?.email || null }]).select(COLUNAS_PRESTADOR);
  if (error) {
    // o banco também barra nome e documento repetidos (duas pessoas cadastrando ao mesmo tempo)
    if (/terceiros_prestadores_nome_norm_uk/.test(error.message)) return { erro: 'Já existe um prestador com esse nome (cadastrado agora há pouco). Atualize a lista.' };
    if (/terceiros_prestadores_documento_uk/.test(error.message)) return { erro: 'Esse CPF/CNPJ já está cadastrado em outro prestador. Atualize a lista.' };
    return { erro: `Não foi possível cadastrar o prestador: ${explicarErroDoBanco(error)}` };
  }
  if (!data?.length) return { erro: 'Não foi possível cadastrar o prestador: nada foi gravado.' };
  return { prestador: data[0] as PrestadorDeTerceiros, antes: null };
}

/** Ativa ou desativa (nada se apaga: os serviços já feitos apontam para o prestador). Devolve a frase do erro, ou null se deu certo. */
export async function mudarAtivoDoPrestador(p: PrestadorDeTerceiros, ativo: boolean, quem: Quem): Promise<string | null> {
  const { data, error } = await supabase.from('terceiros_prestadores').update({ ativo, atualizado_em: new Date().toISOString(), atualizado_por: quem?.nome || null }).eq('id', p.id).select('id');
  if (error) return `Não foi possível ${ativo ? 'reativar' : 'desativar'} o prestador: ${explicarErroDoBanco(error)}`;
  if (!data?.length) return `Não foi possível ${ativo ? 'reativar' : 'desativar'} o prestador: o cadastro não foi atualizado.`;
  return null;
}

/** Quantos serviços (fora os cancelados) apontam para cada prestador, para a lista e para a pergunta ao desativar. Leitura que falha devolve null. */
export async function contarServicosDosPrestadores(): Promise<Record<string, number> | null> {
  try {
    const linhas = await lerPaginado(() => supabase.from('terceiros_servicos').select('prestador_id').not('prestador_id', 'is', null).neq('status', 'cancelado').order('id'));
    const mapa: Record<string, number> = {};
    for (const l of linhas) mapa[l.prestador_id] = (mapa[l.prestador_id] || 0) + 1;
    return mapa;
  } catch {
    return null;
  }
}

// ═══ TIPOS DE SERVIÇO ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

export const FORM_VAZIO_TIPO = {
  nome: '', quem_marca_data: 'solicitante' as QuemMarcaData, onde_padrao: '' as '' | OndeSeFaz, usa_ordem_em_lote: false, ordem: '',
};
export type FormTipo = typeof FORM_VAZIO_TIPO;

/** A posição de um tipo novo: 10 depois do último (o "Outro", que fica sempre no fim com 999, não conta). */
export const proximaOrdemDeTipo = (tipos: Pick<TipoDeServico, 'ordem'>[]): number =>
  Math.max(0, ...tipos.filter(t => t.ordem < 900).map(t => t.ordem)) + 10;

export const formDoTipo = (t: Partial<TipoDeServico> | null, tipos: Pick<TipoDeServico, 'ordem'>[]): FormTipo => (t
  ? { nome: t.nome || '', quem_marca_data: t.quem_marca_data || 'solicitante', onde_padrao: t.onde_padrao || '', usa_ordem_em_lote: !!t.usa_ordem_em_lote, ordem: String(t.ordem ?? '') }
  : { ...FORM_VAZIO_TIPO, ordem: String(proximaOrdemDeTipo(tipos)) });

export function erroDoTipo(form: FormTipo, existentes: TipoDeServico[], id?: string | null): string | null {
  if (!form.nome.trim()) return 'Informe o nome do tipo de serviço.';
  const igual = existentes.find(t => t.id !== id && t.nome_norm === chaveDoNome(form.nome));
  if (igual) return `Já existe um tipo com esse nome: ${igual.nome}${igual.ativo ? '' : ' (inativo; reative-o em vez de cadastrar de novo)'}.`;
  if (!/^\d{1,4}$/.test(form.ordem.trim())) return 'A posição na lista é um número de 0 a 9999 (quanto menor, mais acima).';
  return null;
}

export const tipoParaGravar = (form: FormTipo) => ({
  nome: form.nome.trim().replace(/\s+/g, ' '),
  nome_norm: chaveDoNome(form.nome),
  quem_marca_data: form.quem_marca_data,
  onde_padrao: form.onde_padrao || null,
  usa_ordem_em_lote: form.usa_ordem_em_lote,
  ordem: Number.parseInt(form.ordem.trim(), 10),
});

const COLUNAS_TIPO = 'id,nome,nome_norm,quem_marca_data,onde_padrao,usa_ordem_em_lote,ativo,ordem';

/** Lê todos os tipos (na ordem da lista). Leitura recusada devolve o erro. */
export async function lerTipos(): Promise<{ lista: TipoDeServico[]; erro: string | null }> {
  const { data, error } = await supabase.from('terceiros_tipos').select(COLUNAS_TIPO).order('ordem').order('nome').range(0, 499);
  if (error || !data) return { lista: [], erro: error?.message || 'sem resposta' };
  return { lista: data as TipoDeServico[], erro: null };
}

/** Cadastra (sem id) ou corrige (com id) um tipo. Só o Admin grava: o banco recusa os outros, e a frase diz isso quando nada foi atualizado. */
export async function salvarTipo(form: FormTipo, existentes: TipoDeServico[], quem: Quem, id?: string | null)
  : Promise<{ tipo?: TipoDeServico; antes?: TipoDeServico | null; erro?: string }> {
  const e = erroDoTipo(form, existentes, id);
  if (e) return { erro: e };
  const campos = tipoParaGravar(form);
  const agora = new Date().toISOString();
  if (id) {
    const antes = existentes.find(t => t.id === id) || null;
    const { data, error } = await supabase.from('terceiros_tipos').update({ ...campos, atualizado_em: agora, atualizado_por: quem?.nome || null }).eq('id', id).select(COLUNAS_TIPO);
    if (error) return { erro: `Não foi possível gravar o tipo: ${explicarErroDoBanco(error)}` };
    if (!data?.length) return { erro: 'Não foi possível gravar o tipo: nada foi atualizado. Só o Admin muda os tipos de serviço.' };
    return { tipo: data[0] as TipoDeServico, antes };
  }
  const { data, error } = await supabase.from('terceiros_tipos').insert([{ ...campos, criado_por: quem?.nome || quem?.email || null }]).select(COLUNAS_TIPO);
  if (error) {
    if (/terceiros_tipos_nome_norm_uk/.test(error.message)) return { erro: 'Já existe um tipo com esse nome (cadastrado agora há pouco). Atualize a lista.' };
    return { erro: `Não foi possível cadastrar o tipo: ${explicarErroDoBanco(error)}` };
  }
  if (!data?.length) return { erro: 'Não foi possível cadastrar o tipo: nada foi gravado.' };
  return { tipo: data[0] as TipoDeServico, antes: null };
}

/** Ativa ou desativa um tipo (nada se apaga: os serviços já pedidos apontam para ele). Devolve a frase do erro, ou null se deu certo. */
export async function mudarAtivoDoTipo(t: TipoDeServico, ativo: boolean, quem: Quem): Promise<string | null> {
  const { data, error } = await supabase.from('terceiros_tipos').update({ ativo, atualizado_em: new Date().toISOString(), atualizado_por: quem?.nome || null }).eq('id', t.id).select('id');
  if (error) return `Não foi possível ${ativo ? 'reativar' : 'desativar'} o tipo: ${explicarErroDoBanco(error)}`;
  if (!data?.length) return `Não foi possível ${ativo ? 'reativar' : 'desativar'} o tipo: nada foi atualizado. Só o Admin muda os tipos de serviço.`;
  return null;
}
