// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// SAC — a impressão da OS (A4, com a assinatura do cliente no pé). Saiu de dentro do SacTab em 05/11/2026 para a janela da Viagem também poder imprimir a OS que o técnico leva
// (pedido do usuário: a OS de atendimento externo vai impressa, o técnico preenche e o cliente assina). O texto da folha é o mesmo de antes; o que mudou:
//   • chassi em branco: se a OS é de veículo, ou nasceu de uma viagem, e o equipamento não tem chassi cadastrado, a folha traz uma linha em branco para o técnico escrever à mão (antes saía "—").
// ─────────────────────────────────────────────────────────────────────────────
const fmtDataSAC = (d: any) => !d ? '—' : /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d).split('-').reverse().join('/') : new Date(d).toLocaleDateString('pt-BR');

/** Abre a janela de impressão da OS. `STATUS_COR` é o mapa de cores das etapas (vive no SacTab). */
export function gerarPdfDaOS(os: any, STATUS_COR: any) {
  const fmtDt  = fmtDataSAC;
  // o técnico escreve à mão o que o cadastro não tem (pedido do usuário em 05/11/2026): uma linha em branco no lugar do traço
  const campoEmBranco = '<span style="display:inline-block;min-width:150px;height:18px;border-bottom:1px solid #1e293b"></span>';
  const fmtVal = (v: any) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—';
  const cor = (STATUS_COR as any)[os.status] || '#94a3b8';

  const equipLista: any[] = Array.isArray(os.equipamentos_lista) && os.equipamentos_lista.length > 0
    ? os.equipamentos_lista
    : [{ marca: os.marca||'', modelo: os.modelo||'', numero_serie: os.numero_serie||'', chassi: os.chassi||'', defeito: os.defeito_reclamado||'' }];

  // Impressão da OS (pedido do SAC em 27/10/2026): (1) a folha ganhou o campo de assinatura do cliente (assinatura, nome completo e documento, para preencher à mão) e (2) o layout ocupa a
  // PÁGINA TODA — o conteúdo vem no alto, em letra maior, e a assinatura fica no pé da folha, em vez de a OS ocupar só o primeiro terço do papel. As cores forçadas (print-color-adjust) existem
  // porque o navegador, por padrão, NÃO imprime fundo: o cabeçalho verde saía com letra branca sobre papel branco e os selos de status sumiam.
  const equipRows = equipLista.map((eq: any, idx: number) => `
    <tr class="${idx%2===0?'zebra':''}">
      <td>${equipLista.length>1?`#${idx+1} — `:''}<strong>${os.equipamento_nome||'—'}</strong></td>
      <td>${eq.marca||'—'}</td>
      <td>${eq.modelo||'—'}</td>
      <td>${os.is_manutencao_veicular ? (eq.chassi || campoEmBranco) : os.viagem_id ? (eq.chassi || eq.numero_serie || campoEmBranco) : (eq.numero_serie||'—')}</td>
      <td>${eq.defeito||'—'}</td>
    </tr>`).join('');

  const acessoriosHtml = Array.isArray(os.acessorios) && os.acessorios.length > 0
    ? `<div class="sec">
        <div class="sec-t">ACESSÓRIOS</div>
        <div class="chips">
          ${os.acessorios.map((a: any)=>`<span class="chip ${a.presente?'chip-sim':'chip-nao'}">${a.presente?'✓':'✗'} ${a.descricao}</span>`).join('')}
        </div>
      </div>` : '';

  const orcamentoHtml = os.valor_orcamento ? `
    <div class="sec">
      <div class="sec-t">ORÇAMENTO</div>
      <table class="campos">
        <tr><th>Valor</th><td>${fmtVal(os.valor_orcamento)}</td></tr>
        <tr><th>Condições</th><td>${os.condicoes_pagamento||'—'}</td></tr>
        <tr><th>Enviado em</th><td>${fmtDt(os.data_envio_orcamento)}</td></tr>
        <tr><th>KPI Elaboração</th><td>${os.kpi_orcamento_horas?`${Number(os.kpi_orcamento_horas).toFixed(1)}h úteis`:'—'}</td></tr>
        <tr><th>Situação</th><td>${os.aprovado===true?'✅ APROVADO':os.aprovado===false?'❌ REPROVADO':'Aguardando'}</td></tr>
      </table>
    </div>` : '';

  const aprovacaoHtml = os.aprovado ? `
    <div class="sec sec-ok">
      <div class="sec-t">APROVAÇÃO</div>
      <div class="com-imagem">
        <div class="txt">
          <div><strong>Aprovado por:</strong> ${os.aprovador_nome||'—'}</div>
          <div><strong>Data:</strong> ${fmtDt(os.data_aprovacao)}</div>
          ${os.data_prevista_pos_aprovacao?`<div><strong>Entrega prevista:</strong> ${fmtDt(os.data_prevista_pos_aprovacao)}</div>`:''}
          ${os.kpi_execucao_horas?`<div><strong>KPI Execução:</strong> ${Number(os.kpi_execucao_horas).toFixed(1)}h úteis</div>`:''}
        </div>
        ${os.assinatura_aprovacao_url?`<img src="${os.assinatura_aprovacao_url}" class="assinatura-img" />`:''}
      </div>
    </div>` : '';

  const retiradaHtml = os.data_saida ? `
    <div class="sec sec-ok">
      <div class="sec-t">RETIRADA</div>
      <div class="com-imagem">
        <div class="txt">
          <div><strong>Retirado por:</strong> ${os.nome_retirada_saida||'—'}</div>
          <div><strong>Data:</strong> ${fmtDt(os.data_saida)}</div>
        </div>
        ${os.assinatura_saida_url?`<img src="${os.assinatura_saida_url}" class="assinatura-img" />`:''}
      </div>
    </div>` : '';

  const html = `<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="UTF-8"/>
    <title>OS ${os.numero_os}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{font-family:Arial,sans-serif;color:#1e293b;background:white;padding:20px;font-size:13px}
      @page{size:A4;margin:12mm}
      @media print{body{padding:0}}
      /* a folha inteira: o conteúdo cresce e empurra a assinatura para o pé da página (268mm = A4 menos as margens, com folga para não abrir uma segunda folha em branco) */
      .pagina{min-height:268mm;display:flex;flex-direction:column}
      .conteudo{flex:1}
      .cab{background:#0f766e;color:white;padding:18px 20px;border-radius:4px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center}
      .cab .nome{font-weight:700;font-size:24px}
      .cab .sub{font-size:13px;opacity:.9}
      .cab .num{font-weight:700;font-size:26px;text-align:right}
      .cab .ab{font-size:12px;text-align:right}
      .status{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap}
      .status span{padding:4px 14px;border-radius:20px;font-size:13px;background:#e2e8f0}
      .status .st{color:white;font-weight:700}
      .sec{margin-bottom:16px;border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;break-inside:avoid}
      .sec-t{background:#f1f5f9;padding:8px 12px;font-weight:700;font-size:13px;color:#0f766e;border-bottom:1px solid #cbd5e1}
      .sec-ok{border-color:#86efac}
      .sec-ok .sec-t{background:#f0fdf4;color:#166534;border-color:#86efac}
      table{width:100%;border-collapse:collapse}
      td,th{padding:7px 10px;font-size:13px;text-align:left;vertical-align:top;border-bottom:1px solid #e2e8f0}
      tr:last-child td,tr:last-child th{border-bottom:0}
      .campos th{font-weight:600;color:#64748b;width:150px}
      .equip thead th{background:#f1f5f9;font-size:12px}
      .equip .zebra td{background:#f8fafc}
      .chips{padding:10px 12px;display:flex;flex-wrap:wrap;gap:8px}
      .chip{font-size:12px;padding:3px 10px;border-radius:20px;border:1px solid}
      .chip-sim{background:#dcfce7;color:#166534;border-color:#86efac}
      .chip-nao{background:#fee2e2;color:#991b1b;border-color:#fca5a5}
      .obs{padding:10px 12px;font-size:13px}
      .com-imagem{padding:12px;display:flex;align-items:center;gap:16px}
      .com-imagem .txt{flex:1;font-size:13px;line-height:1.6}
      .assinatura-img{height:70px;border:1px solid #e2e8f0;border-radius:4px;background:white}
      /* assinatura do cliente (pedido do SAC): três linhas para preencher à mão, no pé da folha; não se parte entre duas páginas */
      .fim{break-inside:avoid;page-break-inside:avoid}
      .assin-linha{display:flex;align-items:flex-end;border-bottom:1px solid #1e293b;height:12mm;margin-top:5mm;font-size:13px;font-weight:700;letter-spacing:.3px}
      .assin-alta{height:24mm}
      /* OS com orçamento, aprovação ou retirada tem mais seções: letra e espaços menores para a folha com a assinatura continuar sendo uma só */
      .denso .cab{padding:10px 16px;margin-bottom:8px}
      .denso .status{margin-bottom:8px}
      .denso .sec{margin-bottom:6px}
      .denso .sec-t{padding:5px 10px;font-size:12px}
      .denso td,.denso th{padding:4px 8px;font-size:12px}
      .denso .obs,.denso .com-imagem .txt{font-size:12px;line-height:1.45}
      .denso .com-imagem{padding:8px 10px}
      .denso .chips{padding:6px 10px}
      .denso .assin-linha{height:8mm;margin-top:2.5mm}
      .denso .assin-alta{height:16mm}
      .denso .rodape{margin-top:3mm}
      .rodape{border-top:1px solid #e2e8f0;padding-top:8px;margin-top:10mm;font-size:11px;color:#94a3b8;text-align:center}
    </style>
  </head><body>
   <div class="pagina${os.valor_orcamento || os.aprovado || os.data_saida ? ' denso' : ''}">
    <div class="conteudo">

    <!-- Cabeçalho -->
    <div class="cab">
      <div>
        <div class="nome">${os.empresa === 'DETECH' ? 'DETECH' : 'ACN SINAL VERDE'}</div>
        <div class="sub">Ordem de Serviço</div>
      </div>
      <div>
        <div class="num">${os.numero_os}</div>
        <div class="ab">Abertura: ${fmtDt(os.data_abertura)}</div>
      </div>
    </div>

    <!-- Status -->
    <div class="status">
      <span class="st" style="background:${cor}">${os.status}</span>
      <span>${os.tipo_servico}</span>
      ${os.tipo_projeto?`<span>${os.tipo_projeto}</span>`:''}
    </div>

    <!-- Cliente -->
    <div class="sec">
      <div class="sec-t">CLIENTE</div>
      <table class="campos">
        <tr>
          <th>Nome</th>
          <td>${os.cliente_nome||'—'}</td>
          <th>Empresa / Órgão</th>
          <td>${os.empresa_orgao||'—'}</td>
        </tr>
        <tr>
          <th>CPF/CNPJ</th>
          <td>${os.cpf_cnpj||'—'}</td>
          <th>Telefone</th>
          <td>${os.telefone||'—'}</td>
        </tr>
        <tr>
          <th>E-mail</th>
          <td>${os.email||'—'}</td>
          <th>Endereço</th>
          <td>${os.endereco||'—'}</td>
        </tr>
      </table>
    </div>

    <!-- Equipamentos -->
    <div class="sec">
      <div class="sec-t">EQUIPAMENTO(S) — Qtd: ${os.quantidade||1}</div>
      <table class="equip">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Marca</th>
            <th>Modelo</th>
            <th>${os.is_manutencao_veicular ? 'Chassi' : os.viagem_id ? 'Chassi / Nº série' : 'Nº Série'}</th>
            <th>Defeito Reclamado</th>
          </tr>
        </thead>
        <tbody>${equipRows}</tbody>
      </table>
    </div>

    <!-- Observações -->
    ${os.observacoes||os.observacoes_lab ? `
    <div class="sec">
      <div class="sec-t">OBSERVAÇÕES</div>
      <div class="obs">
        ${os.observacoes?`<div>${os.observacoes}</div>`:''}
        ${os.observacoes_lab?`<div style="margin-top:6px;color:#0891b2"><strong>Diagnóstico Lab:</strong> ${os.observacoes_lab}</div>`:''}
      </div>
    </div>` : ''}

    ${acessoriosHtml}
    ${orcamentoHtml}
    ${aprovacaoHtml}
    ${retiradaHtml}

    </div>

    <!-- Assinatura do cliente e rodapé: no pé da folha -->
    <div class="fim">
      <div class="assin-linha assin-alta">ASSINATURA:</div>
      <div class="assin-linha">NOME COMPLETO:</div>
      <div class="assin-linha">DOCUMENTO:</div>
      <div class="rodape">
        ACN Sinal Verde — Documento gerado em ${new Date().toLocaleString('pt-BR')}
      </div>
    </div>
   </div>

    <script>window.onload=function(){window.print()}</script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Permita pop-ups neste site para gerar o PDF.'); return; }
  w.document.write(html);
  w.document.close();
}
