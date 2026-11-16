// Cadastro de fornecedores do Compras (pedido do usuário em 16/11/2026): o fornecedor de uma cotação tem de ser um fornecedor cadastrado; o comprador cadastra antes, na aba
// "Fornecedores" do Compras (ou pelo atalho da própria cotação). Cadastro "mais completo" (escolha do usuário): nome, razão social, CNPJ/CPF, contato, telefone, e-mail,
// endereço, condição de pagamento padrão, categorias e observação. Os nomes digitados nas 382 cotações antigas NÃO foram importados (escolha do usuário): elas seguem com o
// nome escrito, sem fornecedor_id, e a tela as distingue como "fornecedor sem cadastro".
import { supabase } from './supabaseClient';
import { normalizarBusca } from './SearchUtils';
import { erroDeTelefone } from './Telefone';
import { cepParaGravar } from './Cep';

export type FornecedorCompras = {
  id: string; nome: string; nome_norm: string; razao_social: string | null; cnpj_cpf: string | null; contato_nome: string | null; telefone: string | null; email: string | null;
  cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null;
  condicao_pagamento: string | null; categorias: string[]; observacao: string | null; ativo: boolean;
};

/** As categorias de material que o comprador pode marcar (lista fechada para o filtro de "quem fornece o quê" funcionar; "Outros" cobre o resto). */
export const CATEGORIAS_DE_FORNECEDOR = [
  'Elétrica e iluminação', 'Eletrônicos e telecom', 'Ferragens e fixação', 'Chapas e perfis (metal)', 'Pintura e acabamento', 'Plásticos e borrachas',
  'Cabos e chicotes', 'Ferramentas e EPI', 'Escritório e limpeza', 'Frete e serviços', 'Outros',
];

export const chaveFornecedor = (nome: unknown): string => normalizarBusca(String(nome ?? '')).replace(/\s+/g, ' ').trim();
export const soDigitos = (v: unknown): string => String(v ?? '').replace(/\D/g, '');

/** CPF (11) ou CNPJ (14) só em dígitos, com a máscara na tela. Devolve '' se vazio. */
export function formatarDocumento(v: unknown): string {
  const d = soDigitos(v).slice(0, 14);
  if (d.length <= 11) return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

export const FORM_VAZIO_FORNECEDOR = {
  nome: '', razao_social: '', cnpj_cpf: '', contato_nome: '', telefone: '', email: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
  condicao_pagamento: '', categorias: [] as string[], observacao: '',
};

export const formDoFornecedor = (f: Partial<FornecedorCompras> | null): typeof FORM_VAZIO_FORNECEDOR => ({
  ...FORM_VAZIO_FORNECEDOR,
  ...(f ? {
    nome: f.nome || '', razao_social: f.razao_social || '', cnpj_cpf: formatarDocumento(f.cnpj_cpf), contato_nome: f.contato_nome || '', telefone: f.telefone || '', email: f.email || '',
    cep: f.cep || '', logradouro: f.logradouro || '', numero: f.numero || '', complemento: f.complemento || '', bairro: f.bairro || '', cidade: f.cidade || '', uf: f.uf || '',
    condicao_pagamento: f.condicao_pagamento || '', categorias: f.categorias || [], observacao: f.observacao || '',
  } : {}),
});

/** A frase do que está errado no cadastro, ou null. `existentes` é a lista inteira (para barrar nome e documento repetidos); `id` é o do que está sendo editado. */
export function erroDoFornecedor(form: typeof FORM_VAZIO_FORNECEDOR, existentes: FornecedorCompras[], id?: string | null): string | null {
  if (!form.nome.trim()) return 'Informe o nome do fornecedor.';
  const chave = chaveFornecedor(form.nome);
  const igual = existentes.find(f => f.id !== id && f.nome_norm === chave);
  if (igual) return `Já existe um fornecedor com esse nome: ${igual.nome}${igual.ativo ? '' : ' (inativo; reative-o em vez de cadastrar de novo)'}.`;
  const d = soDigitos(form.cnpj_cpf);
  if (d && d.length !== 11 && d.length !== 14) return 'O CPF tem 11 números e o CNPJ tem 14; confira o documento.';
  if (d) {
    const dono = existentes.find(f => f.id !== id && f.cnpj_cpf === d);
    if (dono) return `Esse ${d.length === 11 ? 'CPF' : 'CNPJ'} já está cadastrado em ${dono.nome}.`;
  }
  const email = form.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'O e-mail não parece válido (exemplo: compras@empresa.com.br).';
  const tel = erroDeTelefone(form.telefone, 'telefone');
  if (tel) return tel;
  if (form.uf.trim() && !/^[A-Za-z]{2}$/.test(form.uf.trim())) return 'A UF tem 2 letras (ex.: SC).';
  return null;
}

const vazioNulo = (v: string) => (v.trim() ? v.trim() : null);

export const fornecedorParaGravar = (form: typeof FORM_VAZIO_FORNECEDOR) => ({
  nome: form.nome.trim().replace(/\s+/g, ' '),
  nome_norm: chaveFornecedor(form.nome),
  razao_social: vazioNulo(form.razao_social),
  cnpj_cpf: soDigitos(form.cnpj_cpf) || null,
  contato_nome: vazioNulo(form.contato_nome),
  telefone: vazioNulo(form.telefone),
  email: vazioNulo(form.email.toLowerCase()),
  cep: cepParaGravar(form.cep),
  logradouro: vazioNulo(form.logradouro), numero: vazioNulo(form.numero), complemento: vazioNulo(form.complemento), bairro: vazioNulo(form.bairro),
  cidade: vazioNulo(form.cidade), uf: form.uf.trim() ? form.uf.trim().toUpperCase() : null,
  condicao_pagamento: vazioNulo(form.condicao_pagamento),
  categorias: form.categorias,
  observacao: vazioNulo(form.observacao),
});

const COLUNAS = 'id,nome,nome_norm,razao_social,cnpj_cpf,contato_nome,telefone,email,cep,logradouro,numero,complemento,bairro,cidade,uf,condicao_pagamento,categorias,observacao,ativo';

/** Lê todos os fornecedores. Leitura recusada devolve o erro (a tela avisa em vez de mostrar "nenhum fornecedor"). */
export async function lerFornecedores(): Promise<{ lista: FornecedorCompras[]; erro: string | null }> {
  const { data, error } = await supabase.from('compras_fornecedores').select(COLUNAS).order('nome').range(0, 4999);
  if (error || !data) return { lista: [], erro: error?.message || 'sem resposta' };
  return { lista: data as FornecedorCompras[], erro: null };
}

/** Cadastra (sem id) ou corrige (com id) um fornecedor. Devolve o registro gravado ou a frase do erro. */
export async function salvarFornecedor(form: typeof FORM_VAZIO_FORNECEDOR, existentes: FornecedorCompras[], quem: { email?: string; nome?: string } | null, id?: string | null)
  : Promise<{ fornecedor?: FornecedorCompras; antes?: FornecedorCompras | null; erro?: string }> {
  const e = erroDoFornecedor(form, existentes, id);
  if (e) return { erro: e };
  const campos = fornecedorParaGravar(form);
  const agora = new Date().toISOString();
  if (id) {
    const antes = existentes.find(f => f.id === id) || null;
    const { data, error } = await supabase.from('compras_fornecedores').update({ ...campos, atualizado_em: agora, atualizado_por: quem?.nome || null }).eq('id', id).select(COLUNAS);
    if (error) return { erro: `Não foi possível gravar o fornecedor: ${error.message}` };
    if (!data?.length) return { erro: 'Não foi possível gravar o fornecedor (o cadastro não foi atualizado).' };
    return { fornecedor: data[0] as FornecedorCompras, antes };
  }
  const { data, error } = await supabase.from('compras_fornecedores').insert([{ ...campos, criado_por: quem?.nome || quem?.email || null }]).select(COLUNAS);
  if (error) {
    // o banco também barra nome e documento repetidos (duas pessoas cadastrando ao mesmo tempo)
    if (/compras_fornecedores_nome_norm_uk/.test(error.message)) return { erro: 'Já existe um fornecedor com esse nome (cadastrado agora há pouco). Atualize a lista.' };
    if (/compras_fornecedores_documento_uk/.test(error.message)) return { erro: 'Esse CPF/CNPJ já está cadastrado em outro fornecedor. Atualize a lista.' };
    return { erro: `Não foi possível cadastrar o fornecedor: ${error.message}` };
  }
  if (!data?.length) return { erro: 'Não foi possível cadastrar o fornecedor (nada foi gravado).' };
  return { fornecedor: data[0] as FornecedorCompras, antes: null };
}

/** Ativa ou desativa (nada se apaga: as cotações já feitas apontam para o fornecedor). */
export async function mudarAtivoDoFornecedor(f: FornecedorCompras, ativo: boolean, quem: { nome?: string } | null): Promise<string | null> {
  const { data, error } = await supabase.from('compras_fornecedores').update({ ativo, atualizado_em: new Date().toISOString(), atualizado_por: quem?.nome || null }).eq('id', f.id).select('id');
  if (error) return `Não foi possível ${ativo ? 'reativar' : 'desativar'} o fornecedor: ${error.message}`;
  if (!data?.length) return `Não foi possível ${ativo ? 'reativar' : 'desativar'} o fornecedor (o cadastro não foi atualizado).`;
  return null;
}

/** Quantas cotações apontam para o fornecedor (para a lista e para a pergunta ao desativar). Leitura que falha devolve null. */
export async function contarCotacoesDosFornecedores(): Promise<Record<string, number> | null> {
  const { data, error } = await supabase.from('pcp_cotacoes_fornecedores').select('fornecedor_id').not('fornecedor_id', 'is', null).range(0, 9999);
  if (error || !data) return null;
  const mapa: Record<string, number> = {};
  for (const l of data as any[]) mapa[l.fornecedor_id] = (mapa[l.fornecedor_id] || 0) + 1;
  return mapa;
}
