// @ts-nocheck
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// TELA INÍCIO — leitura e gravação no banco (09/11/2026). As regras ficam em InicioModelo.ts.
// Duas regras de cuidado, as mesmas do resto do sistema:
//  · leitura recusada devolve `erro`, nunca "lista vazia" (a tela diz que não conseguiu ler, em vez de parecer que não há nada);
//  · gravação confere a linha devolvida: o banco, quando a regra de acesso nega um UPDATE/DELETE, responde "ok, 0 linhas" — e isso é falha, não sucesso.
// As imagens ficam no bucket PRIVADO acn-inicio; a tela pede um endereço assinado de 1 hora (a imagem dos aniversariantes tem nomes de pessoas).
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { explicarErroDoBanco } from './ErroDoBanco';
import { registrarFalhaDeEnvio } from './ErroDeArquivo';
import { caminhoDaImagem, proximaOrdem, ordenarSlides } from './InicioModelo';

const BUCKET = 'acn-inicio';
export const VALIDADE_DO_ENDERECO_S = 3600;

export async function lerSlides(): Promise<{ lista: any[]; erro?: string }> {
  const { data, error } = await supabase.from('inicio_slides').select('*').order('ordem', { ascending: true }).order('criado_em', { ascending: true });
  if (error) return { lista: [], erro: explicarErroDoBanco(error) };
  return { lista: data || [] };
}

/** Endereço assinado de cada imagem (caminho → endereço). O que não conseguir assinar fica de fora e a tela mostra o slide sem imagem. */
export async function enderecosDasImagens(caminhos: string[]): Promise<{ mapa: Record<string, string>; erro?: string }> {
  const unicos = [...new Set((caminhos || []).filter(Boolean))];
  if (!unicos.length) return { mapa: {} };
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(unicos, VALIDADE_DO_ENDERECO_S);
  if (error) return { mapa: {}, erro: explicarErroDoBanco(error) };
  const mapa: Record<string, string> = {};
  (data || []).forEach((x: any) => { if (x?.path && x?.signedUrl) mapa[x.path] = x.signedUrl; });
  return { mapa };
}

const camposDoSlide = (f: any, usuario: any) => ({
  titulo: String(f.titulo || '').trim(),
  legenda: String(f.legenda || '').trim() || null,
  area: String(f.area || '').trim() || null,
  link_tipo: f.link_tipo || 'nenhum',
  link_destino: f.link_tipo && f.link_tipo !== 'nenhum' ? (String(f.link_destino || '').trim() || null) : null,
  exibir_de: f.exibir_de || null,
  exibir_ate: f.exibir_ate || null,
  perfis_alvo: null,                       // todo usuário vê todo slide (regra de 09/11/2026); gravar null também limpa qualquer limite que um slide tenha tido
  rascunho: !!f.rascunho,
  atualizado_por_nome: usuario?.nome || usuario?.email || null,
  atualizado_em: new Date().toISOString(),
});

const removerImagem = async (caminho: string) => { if (!caminho) return; try { await supabase.storage.from(BUCKET).remove([caminho]); } catch { /* sobra de arquivo não atrapalha: o slide já está certo */ } };

/** Slide novo: sobe a imagem primeiro; se gravar a linha falhar, tira a imagem de volta (nada fica solto). */
export async function criarSlide(f: any, arquivo: File, todos: any[], usuario: any): Promise<{ erro?: string; slide?: any }> {
  const id = crypto.randomUUID();
  const caminho = caminhoDaImagem(id, arquivo.name);
  const up = await supabase.storage.from(BUCKET).upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
  if (up.error) return { erro: 'Não foi possível enviar a imagem: ' + registrarFalhaDeEnvio(up.error, arquivo) };
  const linha = { id, ...camposDoSlide(f, usuario), imagem_path: caminho, imagem_nome: arquivo.name, ordem: proximaOrdem(todos), criado_por_nome: usuario?.nome || null, criado_por_email: usuario?.email || null };
  const { data, error } = await supabase.from('inicio_slides').insert(linha).select('id');
  if (error || !data?.length) { await removerImagem(caminho); return { erro: 'Não foi possível gravar o slide: ' + (error ? explicarErroDoBanco(error) : 'o banco não aceitou a gravação (confira se você pode postar na tela Início).') }; }
  return { slide: { ...linha } };
}

/** Edita um slide; `arquivoNovo` troca a imagem (a antiga só sai depois que a gravação deu certo). */
export async function editarSlide(slide: any, f: any, arquivoNovo: File | null, usuario: any): Promise<{ erro?: string }> {
  let caminhoNovo = '';
  const mudanca: any = camposDoSlide(f, usuario);
  if (arquivoNovo) {
    caminhoNovo = caminhoDaImagem(slide.id, arquivoNovo.name);
    const up = await supabase.storage.from(BUCKET).upload(caminhoNovo, arquivoNovo, { contentType: arquivoNovo.type, upsert: false });
    if (up.error) return { erro: 'Não foi possível enviar a imagem: ' + registrarFalhaDeEnvio(up.error, arquivoNovo) };
    mudanca.imagem_path = caminhoNovo; mudanca.imagem_nome = arquivoNovo.name;
  }
  const { data, error } = await supabase.from('inicio_slides').update(mudanca).eq('id', slide.id).select('id');
  if (error || !data?.length) {
    if (caminhoNovo) await removerImagem(caminhoNovo);
    return { erro: 'Não foi possível salvar o slide: ' + (error ? explicarErroDoBanco(error) : 'o slide não foi encontrado ou você não tem permissão para mudá-lo.') };
  }
  if (caminhoNovo) await removerImagem(slide.imagem_path);
  return {};
}

export async function apagarSlide(slide: any): Promise<{ erro?: string }> {
  const { data, error } = await supabase.from('inicio_slides').delete().eq('id', slide.id).select('id');
  if (error || !data?.length) return { erro: 'Não foi possível apagar o slide: ' + (error ? explicarErroDoBanco(error) : 'ele não foi encontrado ou você não tem permissão.') };
  await removerImagem(slide.imagem_path);
  return {};
}

/** Tira do ar (rascunho) ou volta ao ar sem mexer em mais nada. */
export async function mudarRascunho(slide: any, rascunho: boolean, usuario: any): Promise<{ erro?: string }> {
  const { data, error } = await supabase.from('inicio_slides').update({ rascunho, atualizado_por_nome: usuario?.nome || usuario?.email || null, atualizado_em: new Date().toISOString() }).eq('id', slide.id).select('id');
  if (error || !data?.length) return { erro: 'Não foi possível mudar o slide: ' + (error ? explicarErroDoBanco(error) : 'ele não foi encontrado ou você não tem permissão.') };
  return {};
}

/** Grava as posições novas (só as que mudaram, vindas de `reordenar`). Se alguma falhar, avisa e a tela recarrega a lista real. */
export async function salvarOrdem(mudancas: { id: string; ordem: number }[]): Promise<{ erro?: string }> {
  const rs = await Promise.all(mudancas.map(m => supabase.from('inicio_slides').update({ ordem: m.ordem }).eq('id', m.id).select('id')));
  const ruim = rs.find(r => r.error || !r.data?.length);
  return ruim ? { erro: 'Não foi possível mudar a ordem dos slides: ' + (ruim.error ? explicarErroDoBanco(ruim.error) : 'um dos slides não foi encontrado ou você não tem permissão.') } : {};
}

// ── datas da empresa ─────────────────────────────────────────────────────────────────────────────────────

export async function lerDatas(desde: string): Promise<{ lista: any[]; erro?: string }> {
  const { data, error } = await supabase.from('inicio_datas').select('*').gte('data', desde).order('data', { ascending: true }).order('hora', { ascending: true });
  if (error) return { lista: [], erro: explicarErroDoBanco(error) };
  return { lista: data || [] };
}
/** Todas as datas (as já passadas também), para a janela de quem posta. */
export async function lerTodasAsDatas(): Promise<{ lista: any[]; erro?: string }> {
  const { data, error } = await supabase.from('inicio_datas').select('*').order('data', { ascending: false }).order('hora', { ascending: true }).limit(300);
  if (error) return { lista: [], erro: explicarErroDoBanco(error) };
  return { lista: data || [] };
}
export function erroDaData(f: any): string {
  if (!String(f?.titulo || '').trim()) return 'Escreva o que acontece nesse dia.';
  if (String(f.titulo).trim().length > 120) return 'O texto passou de 120 letras. Encurte.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f?.data || ''))) return 'Escolha o dia.';
  if (f?.hora && !/^[0-2]\d:[0-5]\d$/.test(String(f.hora))) return 'A hora não é válida.';
  return '';
}
export async function gravarData(f: any, usuario: any): Promise<{ erro?: string }> {
  const linha = { titulo: String(f.titulo).trim(), data: f.data, hora: f.hora || null, local: String(f.local || '').trim() || null };
  if (f.id) {
    const { data, error } = await supabase.from('inicio_datas').update(linha).eq('id', f.id).select('id');
    if (error || !data?.length) return { erro: 'Não foi possível salvar a data: ' + (error ? explicarErroDoBanco(error) : 'ela não foi encontrada ou você não tem permissão.') };
    return {};
  }
  const { data, error } = await supabase.from('inicio_datas').insert({ ...linha, criado_por_nome: usuario?.nome || usuario?.email || null }).select('id');
  if (error || !data?.length) return { erro: 'Não foi possível gravar a data: ' + (error ? explicarErroDoBanco(error) : 'o banco não aceitou (confira se você pode postar na tela Início).') };
  return {};
}
export async function apagarData(id: string): Promise<{ erro?: string }> {
  const { data, error } = await supabase.from('inicio_datas').delete().eq('id', id).select('id');
  if (error || !data?.length) return { erro: 'Não foi possível apagar a data: ' + (error ? explicarErroDoBanco(error) : 'ela não foi encontrada ou você não tem permissão.') };
  return {};
}

// ── aniversariantes e novidades ──────────────────────────────────────────────────────────────────────────

/**
 * TODOS os aniversariantes do mês de hoje, em ordem de dia (pedido do usuário em 09/11/2026: "deve aparecer todos os aniversariantes do mês"; a primeira versão mostrava só os
 * próximos 7 dias). A função do banco devolve só nome, departamento, dia, mês e `em_dias` (negativo = já fez aniversário neste mês) — nunca o ano nem a idade.
 */
export async function lerAniversariantesDoMes(): Promise<{ lista: any[]; erro?: string }> {
  const { data, error } = await supabase.rpc('inicio_aniversariantes_do_mes');
  if (error) return { lista: [], erro: explicarErroDoBanco(error) };
  return { lista: data || [] };
}

/** Quantas pessoas ativas há e quantas têm a data de nascimento cadastrada (só dois números, nenhum nome): é o que explica ao RH por que o cartão está vazio. */
export async function lerCoberturaDosAniversarios(): Promise<{ cobertura?: { ativos: number; com_nascimento: number }; erro?: string }> {
  const { data, error } = await supabase.rpc('inicio_aniversariantes_cobertura');
  if (error) return { erro: explicarErroDoBanco(error) };
  const linha = Array.isArray(data) ? data[0] : data;
  // vazio ou nulo não é zero (o aviso diria "ninguém tem a data" sem ter lido isso)
  const numero = (v: any) => (v === null || v === undefined || String(v).trim() === '' ? NaN : Number(v));
  if (!linha || !Number.isFinite(numero(linha.ativos)) || !Number.isFinite(numero(linha.com_nascimento))) return { erro: 'a resposta veio incompleta' };
  return { cobertura: { ativos: numero(linha.ativos), com_nascimento: numero(linha.com_nascimento) } };
}

/** As notas de atualização do sistema ainda no ar (as mesmas do botão Avisos): título, resumo e dia. */
export async function lerNovidades(limite = 4): Promise<{ lista: any[]; erro?: string }> {
  const { data, error } = await supabase.from('avisos_sistema').select('id,titulo,mensagem,criado_em,permanente,data_expiracao,criticidade').eq('ativo', true).order('criado_em', { ascending: false }).limit(30);
  if (error) return { lista: [], erro: explicarErroDoBanco(error) };
  const agora = new Date();
  const no_ar = (data || []).filter((av: any) => av.permanente || (av.data_expiracao && new Date(av.data_expiracao) > agora));
  return { lista: no_ar.slice(0, limite) };
}

export { ordenarSlides };
