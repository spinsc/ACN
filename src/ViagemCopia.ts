// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — duplicar uma viagem (pedido do usuário em 04/11/2026, melhorias 2)
//
// Serve para a viagem parecida com uma que já existe (o mesmo cliente de novo, a mesma região): leva o que é do ROTEIRO e do ORÇAMENTO e deixa para trás tudo o que é de UMA viagem só.
//   • Leva: título (com "(cópia)"), número de pessoas, ponto de saída, paradas e dias no local, ida e volta, melhor ordem, rota já calculada e os custos.
//   • Não leva: data de saída, ligações (OP, PV, licitação), equipe, veículo, km, verba, pedágio, hotel, serviço e contrato, custo real e comprovantes, histórico, etapa e a OP que gerou.
// A cópia abre na janela de "Nova viagem" para a pessoa conferir antes de salvar; nada é gravado até ela salvar. O roteiro e a rota vêm iguais, então a rota não aparece como desatualizada.
// ─────────────────────────────────────────────────────────────────────────────

const clone = (x: any) => (x === null || x === undefined ? x : JSON.parse(JSON.stringify(x)));

export function dadosDaCopia(v: any) {
  return {
    titulo: `${String(v?.titulo || 'Viagem').trim()} (cópia)`,
    pessoas: v?.pessoas || 1,
    origem: clone(v?.origem) || null,
    paradas: clone(v?.paradas) || [],
    ida_e_volta: !!v?.ida_e_volta,
    otimizar_ordem: !!v?.otimizar_ordem,
    rota: clone(v?.rota) || null,
    custos: clone(v?.custos) || {},
  };
}
