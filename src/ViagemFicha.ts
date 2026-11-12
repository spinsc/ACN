// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — a ficha da equipe (pedido do usuário em 04/11/2026, melhorias depois da fatia 3)
//
// Uma folha só, para quem vai viajar levar no carro: o roteiro dia a dia, o veículo e o km de saída, a equipe, o serviço e o contrato, o hotel e a verba. Não leva o orçamento nem
// a margem (isso é da direção e do Financeiro); leva a VERBA liberada, que é o que a equipe pode gastar. No pé, os espaços para anotar o km na volta, o que gastou e assinar.
// Mesma técnica da impressão do orçamento: abre uma janela com o HTML e chama o imprimir do navegador.
// ─────────────────────────────────────────────────────────────────────────────
import { calcularViagem, fmtKm, fmtReais, textoDoRoteiro, dataComDiaDaSemana } from './ViagemCalculo';
import { montarRoteiro } from './ViagemRoteiro';
import { nomeCurto } from './ViagemRota';
import { rotuloDoStatus, statusDaViagem } from './ViagemFluxo';

const esc = (t: any) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const placa = (p: any) => { const n = String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return n.length === 7 ? `${n.slice(0, 3)}-${n.slice(3)}` : String(p || ''); };
const comQuebra = (t: any) => esc(t).replace(/\n/g, '<br>');
const linha = (rotulo: string, valor: string) => (valor ? `<tr><th>${rotulo}</th><td>${valor}</td></tr>` : '');

/** O HTML da ficha. Pura (sem janela), para o teste conferir o que sai na folha. */
export function htmlDaFicha(v: any, veiculos: any[] = []): string {
  const r = calcularViagem(v);
  // 05/11/2026 (pedido do usuário): os veículos a atender, das OS e das OPs da viagem; chassi e placa que o cadastro não tem saem como linha em branco, para o técnico escrever à mão
  const emBranco = '<span style="display:inline-block;min-width:120px;height:16px;border-bottom:1px solid #111"></span>';
  const linhasVeiculos = (Array.isArray(veiculos) ? veiculos : []).map((x: any) => `<tr><td>${esc(x.origem)}</td><td>${esc(x.cliente)}</td><td>${esc(x.veiculo) || '—'}</td><td>${x.placa ? esc(placa(x.placa)) : emBranco}</td><td>${x.chassi ? esc(x.chassi) : emBranco}</td></tr>`).join('');
  const roteiro = montarRoteiro(v);
  const equipe = (Array.isArray(v?.equipe) ? v.equipe : []).map((m: any) => esc(m.nome)).join(', ');
  const hotel = v?.hotel || {};
  const temHotel = ['nome', 'endereco', 'telefone', 'observacao'].some(k => String(hotel[k] || '').trim());
  const anexos = (Array.isArray(v?.contrato_anexos) ? v.contrato_anexos : []).map((a: any) => esc(a.nome)).join('; ');
  const ligacoes = (Array.isArray(v?.vinculos) ? v.vinculos : []).map((x: any) => esc(x.descricao)).join('; ') || esc(v?.vinculo || '');
  const pedagio = v?.pedagio_modo === 'reembolso' ? 'Reembolso: a equipe paga e pede o reembolso depois (guarde os comprovantes).' : v?.pedagio_modo === 'convenio' ? 'Convênio (tag): passa sem pagar na cancela.' : '';
  const roteiroTexto = roteiro ? comQuebra(textoDoRoteiro(v, roteiro)).replace(/ {2}/g, '&nbsp;&nbsp;') : '';
  const pernas = (v?.rota?.pernas || []).map((p: any) => `<tr><td>${esc(nomeCurto(p.de))}</td><td>${esc(nomeCurto(p.para))}</td><td class="d">${fmtKm(p.km)}</td></tr>`).join('');
  const saida = v?.data_saida ? esc(dataComDiaDaSemana(v.data_saida)) + (v?.custos?.hora_saida ? ` às ${esc(v.custos.hora_saida)}` : '') : '';
  const kmSaida = v?.km_saida != null && v.km_saida !== '' ? `${Number(v.km_saida).toLocaleString('pt-BR')} km` : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ficha da viagem</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12.5px;color:#111;margin:22px}
      h1{font-size:19px;margin:0 0 2px}h2{font-size:13px;margin:16px 0 5px;padding-bottom:3px;border-bottom:2px solid #1f7a3a;text-transform:uppercase;letter-spacing:.04em}
      .sub{color:#555;margin-bottom:6px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 7px;text-align:left;vertical-align:top}
      th{background:#f1f5f9;width:28%}td.d{text-align:right;width:20%}.dia{margin-bottom:6px}
      .pe{margin-top:22px}.pe td{height:34px}.assina{margin-top:30px;display:flex;gap:40px}.assina div{flex:1;border-top:1px solid #111;padding-top:3px;font-size:11px}
      @media print{body{margin:12mm}h2{break-after:avoid}table,.dia{break-inside:avoid}}
    </style></head><body>
    <h1>${esc(v?.titulo || 'Viagem')}</h1>
    <div class="sub">Ficha da equipe · etapa: ${esc(rotuloDoStatus(statusDaViagem(v)))}${ligacoes ? ' · ligada a ' + ligacoes : ''}</div>
    <h2>A viagem</h2>
    <table>${linha('Saída', saida)}${linha('Percurso', r.temRota ? `${fmtKm(r.km)} · ${r.dias} dia(s) · ${r.noites} noite(s)` : '')}${linha('Equipe', equipe)}${linha('Veículo', v?.veiculo_nome ? esc(v.veiculo_nome) + (v.veiculo_placa ? ' · ' + esc(placa(v.veiculo_placa)) : '') : '')}${linha('Km na saída', kmSaida)}</table>
    ${linhasVeiculos ? `<h2>Veículos a atender</h2><table><thead><tr><th>OS / OP</th><th>Cliente</th><th>Veículo</th><th>Placa</th><th>Chassi</th></tr></thead><tbody>${linhasVeiculos}</tbody></table>` : ''}
    ${v?.servico_descricao || v?.contrato_obs || anexos ? `<h2>Serviço e contrato</h2><table>${linha('O que vai ser feito', comQuebra(v.servico_descricao))}${linha('Contrato', comQuebra(v.contrato_obs))}${linha('Arquivos do contrato', anexos ? anexos + ' (estão na viagem, no sistema)' : '')}</table>` : ''}
    ${temHotel ? `<h2>Hotel</h2><table>${linha('Hotel', esc(hotel.nome))}${linha('Endereço', esc(hotel.endereco))}${linha('Telefone', esc(hotel.telefone))}${linha('Reserva e observações', esc(hotel.observacao))}</table>` : ''}
    <h2>Verba e pedágio</h2>
    <table>${linha('Verba liberada', Number(v?.verba_total) > 0 ? esc(fmtReais(Number(v.verba_total))) : 'ainda não definida')}${linha('Pedágio', esc(pedagio))}</table>
    ${roteiroTexto ? `<h2>Roteiro dia a dia</h2><div class="dia">${roteiroTexto}</div>` : ''}
    ${pernas ? `<h2>Trechos</h2><table><thead><tr><th>De</th><th>Para</th><th class="d">Distância</th></tr></thead><tbody>${pernas}</tbody></table>` : ''}
    <div class="pe"><h2>Na volta</h2>
      <table><tr><th>Km do painel na volta</th><td></td><th>Data e hora da chegada</th><td></td></tr>
      <tr><th>Gastos (combustível, pedágio, hotel, alimentação, outros)</th><td colspan="3"></td></tr>
      <tr><th>Ocorrências / observações</th><td colspan="3"></td></tr></table>
      <div class="assina"><div>Responsável pela equipe</div><div>Adaptação (conferência)</div></div>
    </div>
    <script>window.onload=function(){window.print()}<\/script></body></html>`;
}

/** Abre a janela de impressão da ficha. Devolve falso se o navegador bloqueou a janela. */
export function abrirFicha(v: any, veiculos: any[] = []): boolean {
  const w = window.open('', '_blank', 'width=860,height=720');
  if (!w) return false;
  w.document.write(htmlDaFicha(v, veiculos)); w.document.close();
  return true;
}
