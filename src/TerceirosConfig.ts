// Serviços de terceiros: o MODELO DO CONTRATO (fatia T4 do PLANO_SERVICOS_TERCEIROS.md, 23/11/2026): as empresas que contratam o serviço (ACN e DETECH) e o texto das cláusulas.
// O que não se quebra aqui:
//  • o texto que veio com o sistema é uma MINUTA minha (não sou advogado): enquanto o Admin não aprovar, toda folha impressa leva a faixa vermelha "MINUTA". Mudou o texto ou os dados, a aprovação cai;
//  • só o Admin grava (a função do banco `terceiros_config_salvar` confere; a tela só deixa de oferecer o botão); todos leem, porque quem imprime o contrato precisa do texto;
//  • leitura recusada devolve o erro, nunca "modelo vazio": a tela não imprime contrato sem cláusulas (a falha não pode parecer "o contrato não tem cláusulas").
import { supabase } from './supabaseClient';
import { explicarErroDoBanco } from './ErroDoBanco';
import { chamar, falhou, deu } from './TerceirosServicos';
import type { RespostaDoBanco } from './TerceirosServicos';

export type EmpresaDoContrato = { id: string; nome: string; razao_social: string; cnpj: string; endereco: string; telefone: string; email: string };
export type ConfigDoContrato = {
  empresas: EmpresaDoContrato[]; clausulas: string; aprovada: boolean; aprovada_por: string | null; aprovada_em: string | null; atualizado_em: string | null; atualizado_por: string | null;
};

export const CAMPOS_DA_EMPRESA: { id: Exclude<keyof EmpresaDoContrato, 'id'>; rotulo: string; dica?: string }[] = [
  { id: 'nome', rotulo: 'Nome curto (como aparece na tela)' },
  { id: 'razao_social', rotulo: 'Razão social', dica: 'O nome que vai no contrato. Em branco, vale o nome curto.' },
  { id: 'cnpj', rotulo: 'CNPJ' },
  { id: 'endereco', rotulo: 'Endereço' },
  { id: 'telefone', rotulo: 'Telefone' },
  { id: 'email', rotulo: 'E-mail' },
];

const MAXIMO_DE_EMPRESAS = 6;
const LIMITE_DO_CAMPO = 300;
const LIMITE_DO_TEXTO = 20000;
const MINIMO_DO_TEXTO = 20;

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Põe todos os campos da empresa (os que faltam viram texto vazio) para a tela nunca tropeçar num campo ausente. */
export const empresaCompleta = (e: any): EmpresaDoContrato => ({
  id: texto(e?.id), nome: texto(e?.nome), razao_social: texto(e?.razao_social), cnpj: texto(e?.cnpj), endereco: texto(e?.endereco), telefone: texto(e?.telefone), email: texto(e?.email),
});

export async function lerConfigDoContrato(): Promise<{ config: ConfigDoContrato | null; erro: string | null }> {
  try {
    const { data, error } = await supabase.from('terceiros_config').select('empresas,clausulas,aprovada,aprovada_por,aprovada_em,atualizado_em,atualizado_por').eq('id', 1).maybeSingle();
    if (error) return { config: null, erro: explicarErroDoBanco(error) };
    if (!data) return { config: null, erro: 'O modelo do contrato não foi encontrado no banco.' };
    return { config: { ...data, empresas: (Array.isArray(data.empresas) ? data.empresas : []).map(empresaCompleta) } as ConfigDoContrato, erro: null };
  } catch (e: any) {
    return { config: null, erro: explicarErroDoBanco(e) };
  }
}

/** O código da empresa (2 a 20 letras minúsculas, números ou sublinhado), tirado do nome e sem repetir os que já existem. */
export function codigoNovoDeEmpresa(nome: string, existentes: EmpresaDoContrato[]): string {
  const base = String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 16) || 'empresa';
  const usados = new Set(existentes.map(e => e.id));
  let cand = base.length >= 2 ? base : `${base}_1`;
  for (let n = 2; usados.has(cand); n++) cand = `${base.slice(0, 16)}_${n}`;
  return cand;
}

/** A frase do que está errado no modelo, ou null. O banco repete estas conferências. */
export function erroDoModelo(empresas: EmpresaDoContrato[], clausulas: string): string | null {
  if (!empresas.length || empresas.length > MAXIMO_DE_EMPRESAS) return `Informe de 1 a ${MAXIMO_DE_EMPRESAS} empresas (as que contratam o serviço).`;
  for (const e of empresas) {
    if (!e.nome.trim()) return 'Toda empresa precisa de um nome.';
    for (const c of CAMPOS_DA_EMPRESA) {
      if (String(e[c.id] ?? '').length > LIMITE_DO_CAMPO) return `O campo "${c.rotulo}" da empresa ${e.nome.trim()} passa de ${LIMITE_DO_CAMPO} letras.`;
    }
  }
  const t = clausulas.trim();
  if (t.length < MINIMO_DO_TEXTO) return 'Escreva o texto do contrato (as cláusulas, uma por linha).';
  if (t.length > LIMITE_DO_TEXTO) return `O texto do contrato passa de ${LIMITE_DO_TEXTO} letras.`;
  return null;
}

/** Salva (e, se pedido, aprova) o modelo. Só vale se o banco devolver a linha gravada; a tela troca o modelo guardado por ela. */
export async function salvarConfigDoContrato(empresas: EmpresaDoContrato[], clausulas: string, aprovar: boolean): Promise<RespostaDoBanco<ConfigDoContrato>> {
  const r = await chamar<any>('terceiros_config_salvar', {
    p_empresas: empresas.map(e => ({ id: e.id, nome: e.nome.trim(), razao_social: e.razao_social.trim(), cnpj: e.cnpj.trim(), endereco: e.endereco.trim(), telefone: e.telefone.trim(), email: e.email.trim() })),
    p_clausulas: clausulas.trim(), p_aprovar: !!aprovar,
  });
  if (!r.ok) return falhou<ConfigDoContrato>(r.erro, r.codigo);
  const d = r.dados;
  if (!d || d.id !== 1 || !Array.isArray(d.empresas)) return falhou<ConfigDoContrato>('O banco não confirmou a gravação do modelo. Leia de novo antes de tentar outra vez.');
  return deu({ ...d, empresas: d.empresas.map(empresaCompleta) } as ConfigDoContrato);
}

/** As cláusulas em lista: uma por linha, sem as linhas em branco. */
export const clausulasEmLista = (t: string): string[] => String(t || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

/**
 * A empresa que o contrato traz de partida: a OP que começa com D é da Detech e a que começa com A é da ACN (a regra de numeração de OP do sistema: "A" ou "D" + PV + ano + mês);
 * sem OP (ou sem a empresa cadastrada) vale a primeira da lista, e a pessoa pode trocar antes de imprimir.
 */
export function empresaDePartida(rotuloDaOp: string | null | undefined, empresas: EmpresaDoContrato[]): EmpresaDoContrato | null {
  if (!empresas.length) return null;
  const letra = String(rotuloDaOp || '').trim().charAt(0).toUpperCase();
  const alvo = letra === 'D' ? 'detech' : letra === 'A' ? 'acn' : '';
  return (alvo && empresas.find(e => e.id === alvo)) || empresas[0];
}

/** O nome com que a empresa assina: a razão social, ou o nome curto se ela não foi preenchida. */
export const nomeNoContrato = (e: Pick<EmpresaDoContrato, 'nome' | 'razao_social'>): string => (e.razao_social.trim() || e.nome.trim());
