// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — comprovantes da prestação de contas (pedido do usuário em 04/11/2026, melhorias 2)
//
// O Financeiro anexa as notas e os recibos a cada item do custo real (combustível, pedágios, hospedagem, alimentação, outros). A lista fica em `viagens.comprovantes`
// ({item, nome, url, path, tamanho, por, em}) e é gravada na hora, só essa coluna, como os arquivos do contrato: o arquivo não se perde se a janela fechar sem salvar, e
// anexar não passa por cima do custo real que outra pessoa esteja digitando. Mesmo cuidado do contrato: nome seguro para o armazenamento, motivo da falha em português e
// "o arquivo subiu mas não ficou ligado" quando a gravação da lista falha.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { confirmar } from './Feedback';
import { logChange } from './AuditSystem';
import { nomeSeguroDeArquivo } from './FormatosArquivo';
import { explicarErroDeEnvio } from './ErroDeArquivo';

const BUCKET = 'acn-media';
export const LIMITE_COMPROVANTE = 20 * 1024 * 1024;
export const ITENS_DE_COMPROVANTE = ['combustivel', 'pedagios', 'hospedagem', 'alimentacao', 'outros'];

export const comprovantesDoItem = (v: any, item: string) => (Array.isArray(v?.comprovantes) ? v.comprovantes : []).filter((c: any) => c.item === item);

/** Quantos itens com valor lançado ainda estão sem nenhum comprovante (para a faixa de "falta comprovante"). */
export function itensSemComprovante(v: any): string[] {
  const real = v?.custo_real || {};
  return ITENS_DE_COMPROVANTE.filter(k => Number(real[k]) > 0 && comprovantesDoItem(v, k).length === 0);
}

export async function anexarComprovante(viagem: any, item: string, arquivos: File[], currentUser: any): Promise<{ lista: any[]; erro: string }> {
  const atuais = Array.isArray(viagem.comprovantes) ? viagem.comprovantes : [];
  const novos: any[] = [];
  let erro = '';
  for (const f of arquivos) {
    if (f.size > LIMITE_COMPROVANTE) { erro = `Não foi possível enviar "${f.name}": o arquivo passa de 20 MB.`; continue; }
    const caminho = `viagens/${viagem.id}/comprovantes/${item}/${Date.now()}-${nomeSeguroDeArquivo(f.name)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(caminho, f, { upsert: false });
    if (error) { erro = `Não foi possível enviar "${f.name}": ${explicarErroDeEnvio(error, f)}`; continue; }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(caminho);
    novos.push({ item, nome: f.name, url: pub.publicUrl, path: caminho, tamanho: f.size, por: currentUser?.nome || currentUser?.email || null, em: new Date().toISOString() });
  }
  if (!novos.length) return { lista: atuais, erro };
  const lista = [...atuais, ...novos];
  const { data, error } = await supabase.from('viagens').update({ comprovantes: lista, atualizado_em: new Date().toISOString() }).eq('id', viagem.id).select('id');
  if (error || !data?.length) return { lista: atuais, erro: 'Não foi possível guardar o comprovante na viagem: ' + (error?.message || 'o banco não confirmou') + ' (o arquivo subiu, mas não ficou ligado).' };
  logChange({ module: 'viagens', entityType: 'viagens', entityId: viagem.id, changeType: 'UPDATE', field: 'comprovantes', oldRow: { comprovantes: atuais.length }, newRow: { comprovantes: lista.length, item }, user: currentUser });
  return { lista, erro };
}

export async function tirarComprovante(viagem: any, indice: number, currentUser: any): Promise<{ lista: any[]; erro: string }> {
  const atuais = Array.isArray(viagem.comprovantes) ? viagem.comprovantes : [];
  const alvo = atuais[indice];
  if (!alvo) return { lista: atuais, erro: '' };
  if (!await confirmar(`Tirar o comprovante "${alvo.nome}" desta viagem?\n\nO arquivo sai da lista (continua guardado no armazenamento).`)) return { lista: atuais, erro: '' };
  const lista = atuais.filter((_: any, i: number) => i !== indice);
  const { data, error } = await supabase.from('viagens').update({ comprovantes: lista, atualizado_em: new Date().toISOString() }).eq('id', viagem.id).select('id');
  if (error || !data?.length) return { lista: atuais, erro: 'Não foi possível tirar o comprovante: ' + (error?.message || 'o banco não confirmou') };
  logChange({ module: 'viagens', entityType: 'viagens', entityId: viagem.id, changeType: 'UPDATE', field: 'comprovantes', oldRow: { removido: alvo.nome }, newRow: { comprovantes: lista.length }, user: currentUser });
  return { lista, erro: '' };
}
