// ─────────────────────────────────────────────────────────────────────────────
// ENDEREÇO DE ENVIO É DO COMERCIAL (pedido do usuário em 26/11/2026)
//
// Quem preenche e corrige o endereço de entrega de uma OP de envio de material é o COMERCIAL (o vendedor, ao gerar a OP, ou depois pela edição da OP).
// O Almoxarifado e o Telecom só consultam: a janela de embalagem mostra o endereço sem campo para digitar. Se o endereço está incompleto ou inválido,
// a embalagem trava e o botão "Avisar o Comercial" põe uma menção para o vendedor da OP dizendo o que falta. Antes (15/10/2026) o Almoxarifado
// completava e ajustava o endereço — e o ajuste ficava só no histórico, sem o vendedor saber.
//
// As regras de "o que falta" moram aqui, puras, para a tela e a conferência da gravação não dizerem coisas diferentes. O aviso grava na caixa de
// Menções (contexto `op`, campo `acompanhamento`, como a chegada do veículo) e no andamento da OP.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { soDigitosCep, cepComFormatoValido } from './Cep';
import { exigeEnderecoCompleto, enderecoQueFalta } from './EnderecoEntrega';

// o mesmo critério de nome de ChegadaDoVeiculo.ts: sem acento, maiúsculo, espaços juntos
const semAcentoMaiusculo = (v: any) => String(v ?? '').normalize('NFD').replace(new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g'), '').toUpperCase().replace(/\s+/g, ' ').trim();
const emailMin = (v: any) => String(v ?? '').trim().toLowerCase();
const ehConta = (u: any, nome: any) => !!semAcentoMaiusculo(nome) && semAcentoMaiusculo(u?.nome) === semAcentoMaiusculo(nome);
/** A conta de teste do sistema (ZZTESTE) nunca recebe aviso de verdade. */
const ehContaDeTeste = (u: any) => /^ZZTESTE/i.test(String(u?.nome || ''));

/**
 * O que falta ou está errado no endereço de entrega, nas palavras de quem lê. `o` é a OP (ou o molde da janela). Lista vazia = pode embalar.
 * CEP, cidade e UF valem para toda OP de envio; rua, número, bairro, complemento, destinatário e telefone só com frete por conta da empresa (CIF).
 */
export function faltasDoEndereco(o: any, tipoProjeto?: any, fluxo?: any): string[] {
  const faltas: string[] = [];
  if (!soDigitosCep(o?.destino_cep)) faltas.push('CEP de entrega');
  else if (!cepComFormatoValido(o?.destino_cep)) faltas.push('CEP de entrega inválido (precisa de 8 dígitos e não vale só zeros)');
  if (!String(o?.destino_cidade ?? '').trim()) faltas.push('cidade de entrega');
  if (!String(o?.destino_uf ?? '').trim()) faltas.push('UF de entrega');
  if (exigeEnderecoCompleto(tipoProjeto, fluxo, o?.frete_responsavel)) {
    for (const f of enderecoQueFalta(o)) {
      // o CEP, a cidade e a UF já foram ditos acima, na forma mais precisa
      if (/^(CEP|cidade|UF) de entrega$/.test(f)) continue;
      faltas.push(f);
    }
  }
  return [...new Set(faltas)];
}

export type DestinatarioComercial = { id: string; nome: string };

/**
 * Quem é avisado: o responsável comercial e o vendedor da OP; se nenhum for usuário ativo do sistema, quem abriu a OP. Nunca quem aciona o botão
 * (se quem aciona é o próprio vendedor, a lista fica vazia e a tela diz isso) e nunca a conta de teste. Puro, para testar sem banco.
 */
export function quemCorrigeOEndereco({ op, usuarios, autorId = null }: { op: any; usuarios: any[]; autorId?: any }): DestinatarioComercial[] {
  const ativos = (usuarios || []).filter(u => u && u.ativo !== false && !ehContaDeTeste(u));
  let alvos = ativos.filter(u => ehConta(u, op?.responsavel_comercial) || ehConta(u, op?.vendedor));
  if (!alvos.length && (op?.criado_por || op?.criado_por_nome)) {
    alvos = ativos.filter(u => (op?.criado_por && emailMin(u.email) === emailMin(op.criado_por)) || ehConta(u, op?.criado_por_nome));
  }
  const vistos = new Set<string>();
  const saida: DestinatarioComercial[] = [];
  for (const u of alvos) {
    const id = String(u.id);
    if (vistos.has(id) || (autorId && id === String(autorId))) continue;
    vistos.add(id);
    saida.push({ id, nome: u.nome });
  }
  return saida;
}

/** O texto do aviso: diz a OP, quem avisa e o que falta. */
export function textoDoAvisoDeEndereco({ op, quem, faltas }: { op: any; quem: string; faltas: string[] }): string {
  return `Endereço de entrega da OP ${op?.opl} precisa ser corrigido pelo Comercial — ${quem} não consegue embalar o envio. Falta: ${faltas.join('; ')}.`
    + ' Corrija na edição da OP; o setor reabre a janela de embalagem depois.';
}

export type ResultadoDoAviso = { ok: boolean; erro?: string; avisados?: string[]; semHistorico?: string };

/**
 * Avisa o vendedor da OP. Falha nunca é silenciosa: `erro` volta em português para a tela mostrar em vermelho. O andamento da OP é gravado
 * junto (a menção do campo `acompanhamento` abre essa caixa); se só ele falhar, o aviso já saiu e a falha vem em `semHistorico`.
 */
export async function avisarComercialDoEndereco({ op, usuario, faltas, setor }: { op: any; usuario: any; faltas: string[]; setor?: string }): Promise<ResultadoDoAviso> {
  if (!op?.opl) return { ok: false, erro: 'Não achei a OP para avisar o Comercial.' };
  if (!faltas?.length) return { ok: false, erro: 'O endereço desta OP está completo: não há o que avisar.' };
  const quem = usuario?.nome || 'O setor';
  const quando = new Date().toISOString();

  let alvos: DestinatarioComercial[] = [];
  try {
    const { data: usuarios, error } = await supabase.from('auth_usuarios').select('id,nome,email,ativo').eq('ativo', true);
    if (error) return { ok: false, erro: `Não foi possível ler quem é o vendedor da OP (${error.message}). Tente de novo.` };
    alvos = quemCorrigeOEndereco({ op, usuarios: usuarios || [], autorId: usuario?.id });
  } catch (e: any) {
    return { ok: false, erro: `Não foi possível ler quem é o vendedor da OP (${String(e?.message || e)}). Tente de novo.` };
  }
  if (!alvos.length) {
    return { ok: false, erro: 'Não achei o vendedor desta OP entre os usuários ativos (ou o vendedor é você). Peça ao Comercial pelo chat, pela edição da OP ou pelo andamento da OP.' };
  }

  const texto = textoDoAvisoDeEndereco({ op, quem, faltas });
  const linhas = alvos.map(a => ({
    mencionado_id: a.id, mencionado_nome: a.nome,
    mencionante_id: String(usuario?.id || ''), mencionante_nome: quem,
    contexto: 'op', contexto_id: String(op.opl), contexto_descricao: `OP ${op.opl}${op.cliente_nome ? ' — ' + op.cliente_nome : ''}`,
    campo: 'acompanhamento', texto_trecho: texto, aba_destino: 'crm', lida: false, criado_em: quando,
  }));
  const { error: erroMenc } = await supabase.from('mencoes').insert(linhas);
  if (erroMenc) return { ok: false, erro: `Não foi possível avisar o Comercial: ${erroMenc.message}` };

  const r: ResultadoDoAviso = { ok: true, avisados: alvos.map(a => a.nome) };
  try {
    const { error } = await supabase.from('op_acompanhamentos').insert({
      referencia_id: op.opl, referencia_tipo: 'op', referencia_desc: `OP ${op.opl}`, setor: setor || usuario?.perfil || 'Almoxarifado', texto,
      usuario_id: String(usuario?.id || ''), usuario_nome: quem, criado_em: quando,
    });
    if (error) r.semHistorico = error.message;
  } catch (e: any) { r.semHistorico = String(e?.message || e); }
  return r;
}
