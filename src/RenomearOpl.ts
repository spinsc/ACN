import { supabase } from './supabaseClient';

// Troca o número de uma OP já criada. Só Admin e gerentes (a tela esconde o
// botão — podeAlterarNumeroOplPv — e o banco confere de novo).
// O número é guardado como TEXTO em ~30 colunas de outras tabelas (pedidos,
// histórico, CQ, anexos...), então a troca é feita pela função renomear_opl
// (sql/renomear_opl.sql): OP, desmembradas /NN e referências numa transação só.
// Retorna o número novo, ou null se cancelou ou deu erro.
export async function renomearOpl(op: { id: string; opl: string }, usuario: any): Promise<string | null> {
  const bruto = String(op?.opl || '');
  const atual = bruto.trim();
  const digitado = window.prompt(`Novo número para a OP ${atual}:`, atual);
  if (digitado == null) return null;
  const novo = digitado.trim();
  if (!novo || novo === atual) return null;

  // Desmembradas (BASE/02, BASE/03...) acompanham a base
  let desmembradas: string[] = [];
  if (!/\/\d+$/.test(bruto)) {
    const prefixo = bruto.replace(/[\\%_]/g, m => '\\' + m);
    const { data } = await supabase.from('oples').select('opl').like('opl', `${prefixo}/%`);
    desmembradas = (data || []).map((r: any) => String(r.opl))
      .filter(o => o.startsWith(bruto) && /^\/\d+$/.test(o.slice(bruto.length)));
  }
  const maiorSufixo = Math.max(0, ...desmembradas.map(o => o.length - bruto.length));
  if (novo.length + maiorSufixo > 50) {
    alert(`O número pode ter no máximo ${50 - maiorSufixo} caracteres.`);
    return null;
  }

  const ok = window.confirm(
    `Trocar o número da OP\n\n${atual}  →  ${novo}\n\n` +
    (desmembradas.length
      ? `As ${desmembradas.length} OP(s) desmembradas também mudam (${atual}/02 → ${novo}/02...).\n\n`
      : '') +
    'O número também é atualizado nos pedidos, histórico, CQ, anexos e demais registros ligados a esta OP. ' +
    'A troca fica registrada no histórico da OP.');
  if (!ok) return null;

  const { data, error } = await supabase.rpc('renomear_opl', {
    p_opl_id: op.id, p_novo: novo, p_email: usuario?.email || '',
  });
  if (error) { alert('Não foi possível trocar o número: ' + error.message); return null; }
  alert(`✅ Número alterado: ${data.antigo} → ${data.novo}` +
    (data.ops > 1 ? ` (e ${data.ops - 1} desmembrada(s))` : '') +
    `.\n${data.referencias} registro(s) ligados à OP foram atualizados.`);
  return data.novo;
}
