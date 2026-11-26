// Cada parte abre o navegador, monta a situação e tira as fotos dela. Ver fotos.cjs (dados inventados, gravação bloqueada).

// retângulo que cobre vários elementos (com folga), para fotografar um pedaço da tela
const retanguloDe = (page, seletores, folga = 8) => page.evaluate((sels, folga) => {
  const els = sels.flatMap(s => (typeof s === 'string' ? [...document.querySelectorAll(s)] : [s])).filter(e => e && e.offsetParent !== null || (e && getComputedStyle(e).position === 'fixed'));
  if (!els.length) return null;
  const rs = els.map(e => e.getBoundingClientRect());
  const x0 = Math.max(0, Math.min(...rs.map(r => r.left)) - folga), y0 = Math.max(0, Math.min(...rs.map(r => r.top)) - folga);
  const x1 = Math.min(innerWidth, Math.max(...rs.map(r => r.right)) + folga), y1 = Math.min(innerHeight, Math.max(...rs.map(r => r.bottom)) + folga);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}, seletores, folga);
// marca a linha da tabela que tem o texto e devolve um seletor para ela
const marcaLinha = async (page, texto, marca = 'fl') => {
  await page.evaluate(() => document.querySelectorAll('[data-fl]').forEach(e => e.removeAttribute('data-fl')));
  const ok = await page.evaluate((t, m) => { const l = [...document.querySelectorAll('table tbody tr')].find(x => x.innerText.includes(t)); if (!l) return false; l.setAttribute('data-' + m, '1'); l.scrollIntoView({ block: 'center' }); return true; }, texto, marca);
  await new Promise(r => setTimeout(r, 250));
  return ok ? `[data-${marca}="1"]` : null;
};
const fotoDaLinha = async (H, page, texto, nome) => {
  const sel = await marcaLinha(page, texto);
  if (!sel) { console.log('SEM LINHA', texto); return false; }
  return H.salvar(page, nome, { el: sel });
};
// foto de uma região da tela (um ou mais seletores), com folga
const fotoDaRegiao = async (H, page, nome, seletores, folga) => {
  const r = await retanguloDe(page, seletores, folga);
  if (!r) { console.log('SEM REGIÃO', nome, seletores); return false; }
  return H.salvar(page, nome, { clip: r });
};

module.exports = {
  // 01 e 02: a tela inteira e o alto da tela
  async tela(H) {
    const { browser, page } = await H.preparar();
    try {
      await H.irParaAdaptacao(page);
      await H.salvar(page, '01-tela-inicial');
      await H.salvar(page, '02-alto-da-tela', { clip: { x: 0, y: 60, width: 1500, height: 320 } });
    } finally { await browser.close(); }
  },

  // 03 e 04: os filtros (com "Mais filtros" aberto) e as filas
  async filtros(H) {
    const { browser, page } = await H.preparar();
    try {
      await H.irParaAdaptacao(page);
      await H.clicaTexto(page, 'button', '^Mais filtros$');
      await H.espera(500);
      await fotoDaRegiao(H, page, '03-filtros', ['.sec-card .acn-filtros'], 6);
      await fotoDaRegiao(H, page, '04-filas', ['.acn-filtros-dir'], 10);
    } finally { await browser.close(); }
  },

  // 05 a 09: as linhas da fila, uma por situação
  async linha(H) {
    const { browser, page } = await H.preparar();
    try {
      await H.irParaAdaptacao(page);
      await fotoDaLinha(H, page, 'D1060.2611', '05-linha-aguardando');
      await fotoDaLinha(H, page, 'D1051.2611', '06-linha-em-producao');
      await fotoDaLinha(H, page, 'A1832.2611', '07-linha-pausada');
      await fotoDaLinha(H, page, 'D1039.2611', '08-linha-atrasada-sem-box');
      await H.clicaTexto(page, '.acn-filtros-dir button', '^Adaptação');
      await H.espera(300);
      await fotoDaLinha(H, page, 'A1850.2611', '09-linha-adaptacao-externa');
    } finally { await browser.close(); }
  },

  // 10 e 11: o menu ⋯ de uma OP que espera e de uma OP em produção
  async menus(H) {
    const { browser, page } = await H.preparar();
    try {
      await H.irParaAdaptacao(page);
      await marcaLinha(page, 'D1060.2611', 'fl');
      await H.abreMenuDaLinha(page, 'D1060.2611');
      await fotoDaRegiao(H, page, '10-menu-aguardando', ['[data-fl="1"]', '.acn-menu'], 10);
      await page.keyboard.press('Escape'); await H.espera(300);
      await marcaLinha(page, 'D1051.2611', 'fl');
      await H.abreMenuDaLinha(page, 'D1051.2611');
      await fotoDaRegiao(H, page, '11-menu-em-producao', ['[data-fl="1"]', '.acn-menu'], 10);
    } finally { await browser.close(); }
  },

  // 12 e 13: a visão Kanban e um cartão
  async kanban(H) {
    const { browser, page } = await H.preparar({ largura: 1760, altura: 1000 });
    try {
      await H.irParaAdaptacao(page);
      await H.clicaTexto(page, '.acn-chips button', '^Kanban');
      await H.espera(900);
      await H.salvar(page, '12-kanban', { clip: { x: 0, y: 56, width: 1760, height: 700 } });
      await page.evaluate(() => { const c = [...document.querySelectorAll('.acn-kcard')].find(k => k.innerText.includes('D1051.2611')); if (c) c.setAttribute('data-foto-alvo', '1'); });
      await H.salvar(page, '13-cartao-kanban', { el: '[data-foto-alvo="1"]' });
    } finally { await browser.close(); }
  },

  // 14 e 15: o lote fechado e aberto
  async lote(H) {
    const { browser, page } = await H.preparar();
    try {
      await H.irParaAdaptacao(page);
      const sel = await marcaLinha(page, 'A1844.2611', 'fl');
      await fotoDaLinha(H, page, 'A1844.2611', '14-lote-fechado');
      await H.clicaTexto(page, 'button', '^Ver unidades$');
      await H.espera(600);
      await page.evaluate(() => { document.querySelectorAll('table tbody tr').forEach(l => { if (/A1844\.2611/.test(l.innerText)) l.setAttribute('data-lote', '1'); }); });
      await fotoDaRegiao(H, page, '15-lote-aberto', ['[data-lote="1"]'], 6);
    } finally { await browser.close(); }
  },

  // 16: OP reprovada pelo CQ (a faixa de motivo) e a que já está em retrabalho
  async retrabalho(H) {
    const { browser, page } = await H.preparar();
    try {
      await H.irParaAdaptacao(page);
      await page.evaluate(() => { document.querySelectorAll('table tbody tr').forEach(l => { if (l.classList.contains('acn-linha-alerta')) l.setAttribute('data-ret', '1'); }); });
      await fotoDaRegiao(H, page, '16-retrabalho', ['[data-ret="1"]'], 4);
    } finally { await browser.close(); }
  },

  // 17 a 20: a janela Iniciar produção (individual, dupla, equipe e o aviso de BOX ocupado)
  async iniciar(H) {
    const { browser, page } = await H.preparar({ altura: 1000 });
    const escolheBox = async (...nomes) => {
      await page.evaluate(() => document.querySelector('.modal-box .acn-selmulti-btn')?.click()); await H.espera(400);
      for (const n of nomes) { await page.evaluate((t) => { const o = [...document.querySelectorAll('[role=option], .acn-selmulti-op, .acn-selmulti-lista li, .acn-selmulti-lista button')].find(x => x.innerText.trim() === t); if (o) o.click(); }, n); await H.espera(250); }
      await page.keyboard.press('Escape'); await H.espera(300);
    };
    try {
      await H.irParaAdaptacao(page);
      await H.botaoDaLinha(page, 'D1060.2611', 'Iniciar');
      await page.select('.modal-box select', 'Pedro Alves'); await H.espera(300);
      await page.evaluate(() => document.querySelector('.modal-box .acn-selmulti-btn')?.click()); await H.espera(500);
      await H.fotoDaJanela(page, '17-iniciar-box-aberto');
      await page.keyboard.press('Escape'); await H.espera(300);
      await escolheBox('BOX 06');
      await H.fotoDaJanela(page, '18-iniciar-individual');
      await H.clicaTexto(page, '.modal-box .acn-chips button', '^Dupla$'); await H.espera(500);
      await H.fotoDaJanela(page, '19-iniciar-dupla');
      await H.clicaTexto(page, '.modal-box .acn-chips button', '^Equipe$'); await H.espera(500);
      await page.evaluate(() => { const e = [...document.querySelectorAll('.acn-prod-equipe')].find(x => x.innerText.includes('Equipe Beta')); if (e) e.click(); }); await H.espera(300);
      await H.fotoDaJanela(page, '20-iniciar-equipe');
      // BOX que já tem outra OP: avisa em vermelho, mas deixa seguir
      await H.clicaTexto(page, '.modal-box .acn-chips button', '^Individual$'); await H.espera(300);
      await page.evaluate(() => { const t = document.querySelector('.modal-box .acn-selmulti-btn'); t?.click(); }); await H.espera(300);
      await page.evaluate(() => { const o = [...document.querySelectorAll('[role=option], .acn-selmulti-op, .acn-selmulti-lista li, .acn-selmulti-lista button')].find(x => x.innerText.trim() === 'BOX 06'); if (o) o.click(); }); await H.espera(200);
      await page.evaluate(() => { const o = [...document.querySelectorAll('[role=option], .acn-selmulti-op, .acn-selmulti-lista li, .acn-selmulti-lista button')].find(x => x.innerText.trim() === 'BOX 03'); if (o) o.click(); }); await H.espera(200);
      await page.keyboard.press('Escape'); await H.espera(400);
      await H.fotoDaJanela(page, '21-iniciar-box-ocupado');
    } finally { await browser.close(); }
  },

  // 22 a 27: as janelas do menu ⋯ de uma OP em produção (BOX, responsável, equipe, acompanhamento, anexos, detalhes)
  async janelas(H) {
    const { browser, page } = await H.preparar({ altura: 1000 });
    const abre = async (rotulo) => { await H.abreMenuDaLinha(page, 'D1051.2611'); return H.itemDoMenu(page, rotulo); };
    try {
      await H.irParaAdaptacao(page);
      if (await abre('BOX do carro')) { await H.fotoDaJanela(page, '22-box-do-carro'); await H.fecha(page); }
      if (await abre('Editar responsável')) { await H.fotoDaJanela(page, '23-editar-responsavel'); await H.fecha(page); }
      if (await abre('Equipe')) { await H.espera(1200); await H.fotoDaJanela(page, '24-equipe-da-op'); await H.fecha(page); }
      if (await abre('Acompanhamento')) { await H.espera(1200); await H.fotoDaJanela(page, '25-acompanhamento'); await H.fecha(page); }
      if (await abre('Anexos')) { await H.espera(1200); await H.fotoDaJanela(page, '26-anexos'); await H.fecha(page); }
    } finally { await browser.close(); }
  },

  // 27 e 28: Ver detalhes (a janela da OP) e o botão "Veículo chegou à matriz"
  async detalhes(H) {
    const { browser, page } = await H.preparar({ largura: 1500, altura: 1100 });
    try {
      await H.irParaAdaptacao(page);
      await H.abreMenuDaLinha(page, 'D1051.2611');
      await H.itemDoMenu(page, 'Ver detalhes');
      await H.espera(2500);
      await H.salvar(page, '27-detalhes-da-op', { el: '.acn-opl' });
      const ok = await page.evaluate(() => { const b = [...document.querySelectorAll('.acn-opl button')].find(x => /Veículo chegou à matriz/.test(x.innerText)); if (!b) return false; b.scrollIntoView({ block: 'center' }); b.setAttribute('data-foto-alvo', '1'); return true; });
      console.log('botão da chegada:', ok);
      await H.espera(400);
      if (ok) await page.evaluate(() => { const b = document.querySelector('[data-foto-alvo="1"]'); let c = b.closest('.acn-opl-bloco') || b.parentElement; while (c.parentElement && !/VEÍCULO E ENTREGA/i.test(c.innerText.slice(0, 60)) && c.parentElement.className !== 'acn-opl-corpo') c = c.parentElement; c.setAttribute('data-foto-card', '1'); });
      if (ok) await H.salvar(page, '28-veiculo-chegou', { el: '[data-foto-card="1"]' });
    } finally { await browser.close(); }
  },

  // 29: concluir com pendência de fabricação em aberto (o sistema barra e diz o que falta)
  async concluir(H) {
    const { browser, page, alertas } = await H.preparar({ altura: 900 });
    try {
      await H.irParaAdaptacao(page);
      await H.clicaTexto(page, 'table button', '^Ver unidades$'); await H.espera(500);
      await H.botaoDaLinha(page, 'A1844.2611/01', 'Concluir');
      await H.espera(2200);
      console.log('alertas:', JSON.stringify(alertas));
      await H.salvar(page, '29-concluir-com-pendencia');
    } finally { await browser.close(); }
  },

  // 30: devolver ao PCP (pede o motivo)
  async devolver(H) {
    const { browser, page } = await H.preparar({ altura: 900 });
    try {
      await H.irParaAdaptacao(page);
      await H.abreMenuDaLinha(page, 'D1039.2611');
      await H.itemDoMenu(page, 'Devolver ao PCP');
      await page.evaluate(() => { const t = document.querySelector('.modal-box textarea'); if (!t) return; const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, 'Faltou o suporte da barra no kit. A OP precisa voltar para o PCP rever a lista de material.'); t.dispatchEvent(new Event('input', { bubbles: true })); });
      await H.espera(400);
      await H.fotoDaJanela(page, '30-devolver-ao-pcp');
    } finally { await browser.close(); }
  },

  // 31 e 32: ação em lote (várias OPs marcadas) e a janela Importar técnicos/equipes
  async lote_acoes(H) {
    const { browser, page } = await H.preparar({ altura: 900 });
    try {
      await H.irParaAdaptacao(page);
      await H.clicaTexto(page, 'table button', '^Ver unidades$'); await H.espera(500);
      for (const t of ['A1844.2611/02', 'A1844.2611/03', 'D1060.2611']) await page.evaluate((x) => { const l = [...document.querySelectorAll('table tbody tr')].find(r => r.innerText.includes(x)); l?.querySelector('input[type=checkbox]')?.click(); }, t);
      await H.espera(500);
      await H.salvar(page, '31-selecao-em-lote', { clip: { x: 0, y: 380, width: 1500, height: 520 } });
      await H.clicaTexto(page, '.acn-barra-selecao button', 'Atribuir técnicos'); await H.espera(900);
      await page.evaluate(() => { const t = document.querySelector('.modal-box textarea'); if (!t) return; const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, '9BG1234EXEMPLO0012\tPedro Alves\n9BG1234EXEMPLO0013\tEquipe Beta\n9BD1234EXEMPLO0001\tJoão Matos + Lucas Nunes'); t.dispatchEvent(new Event('input', { bubbles: true })); });
      await H.espera(900);
      await H.fotoDaJanela(page, '32-importar-tecnicos');
    } finally { await browser.close(); }
  },

  // 33 a 44: a aba SAC veicular (lista e as janelas de cada etapa)
  async veicular(H) {
    const { browser, page } = await H.preparar({ largura: 1500, altura: 1000 });
    try {
      await H.irParaAdaptacao(page, 'veicular');
      await H.salvar(page, '33-sac-veicular-lista');
      await H.salvar(page, '54-faixa-veiculo-atrasado', { clip: { x: 0, y: 60, width: 1500, height: 270 } });
      await fotoDaLinha(H, page, 'OS-2611-009', '53-linha-veiculo-atrasado');
      await fotoDaLinha(H, page, 'OS-2611-014', '34-linha-definir-data');
      await fotoDaLinha(H, page, 'OS-2611-003', '38-linha-em-execucao');
      await fotoDaLinha(H, page, 'OS-2611-002', '42-linha-revisao-pendente');
      const abrirE = async (texto, rotulo, nome, antes) => {
        await H.botaoDaLinha(page, texto, rotulo);
        await H.espera(700);
        if (antes) await antes();
        await H.fotoDaJanela(page, nome);
        await H.fecha(page);
        await H.espera(300);
      };
      await abrirE('OS-2611-014', 'VER', '44-ver-os');
      await abrirE('OS-2611-014', 'Definir Data', '34-definir-data', async () => {
        await page.evaluate(() => { const i = document.querySelector('.modal-box input[type=date]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const d = new Date(); d.setDate(d.getDate() + 3); set.call(i, d.toISOString().slice(0, 10)); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
        await H.espera(300);
      });
      await abrirE('OS-2611-012', 'Chegou', '35-confirmar-chegada');
      await abrirE('OS-2611-011', 'Inserir Materiais', '36-verificacao-orcamento');
      await abrirE('OS-2611-005', 'Iniciar', '37-iniciar-manutencao', async () => {
        await H.clicaTexto(page, '.modal-box .acn-chips button', '^Equipe$');
        await H.espera(400);
      });
      await abrirE('OS-2611-003', 'Obs.', '43-obs-producao', async () => {
        await page.evaluate(() => { const t = document.querySelector('.modal-box textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, 'Sirene trocada e barra religada. Falta apertar os suportes e testar o comando.'); t.dispatchEvent(new Event('input', { bubbles: true })); });
        await H.espera(300);
      });
      await abrirE('OS-2611-003', 'Itens', '39-conferencia-de-itens');
      await abrirE('OS-2611-003', 'Concluir', '40-concluir-manutencao');
      await abrirE('OS-2611-003', 'EQUIPE', '41-equipe-da-os');
    } finally { await browser.close(); }
  },

  // 45 a 47: Agendamentos (OPs de manutenção que esperam data, calendário do mês e a lista)
  async agenda(H) {
    const { browser, page } = await H.preparar({ largura: 1500, altura: 1100 });
    try {
      await H.irParaAdaptacao(page, 'agenda');
      await H.salvar(page, '45-agendamentos');
      await H.clicaTexto(page, 'button', '^AGENDAR$');
      await H.espera(800);
      await page.evaluate(() => { const i = document.querySelector('.modal-box input[type=date]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const d = new Date(); d.setDate(d.getDate() + 6); set.call(i, d.toISOString().slice(0, 10)); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); const t = document.querySelector('.modal-box textarea'); const st = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; st.call(t, 'Barra sinalizadora sem comando. O cliente deixa o carro de manhã.'); t.dispatchEvent(new Event('input', { bubbles: true })); });
      await H.espera(400);
      await H.fotoDaJanela(page, '46-agendar-manutencao');
      await H.fecha(page);
      await H.espera(300);
      await H.clicaTexto(page, '.sec-hdr button', '^Lista$');
      await H.espera(600);
      await fotoDaRegiao(H, page, '47-agendamentos-lista', ['.sec-card'], 4);
    } finally { await browser.close(); }
  },

  // 48 a 50: Voucher (formulário, tipos de serviço e a lista dos emitidos)
  async voucher(H) {
    const { browser, page } = await H.preparar({ largura: 1500, altura: 1300 });
    try {
      await H.irParaAdaptacao(page, 'voucher');
      const digita = (placeholder, valor) => page.evaluate((p, v) => { const i = [...document.querySelectorAll('.acn-prod-v-form input')].find(x => x.placeholder === p); if (!i) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); return true; }, placeholder, valor);
      await page.select('.acn-prod-v-form select', 'Lavagem');
      await digita('Ex: PV-2024-001', 'PV-2611-0131');
      await digita('Nome do prestador...', 'Lava Rápido Exemplo');
      await digita('Nome do autorizador...', 'Ricardo Gomes');
      await digita('Ex: ABC-1234', 'ABC-1D23');
      await digita('Ex: Fiat Strada 2023', 'Fiat Toro Endurance');
      await digita('0,00', '90');
      await page.evaluate(() => { const i = document.querySelector('.acn-prod-v-form input[type=date]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const d = new Date(); d.setDate(d.getDate() + 1); set.call(i, d.toISOString().slice(0, 10)); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
      await H.espera(500);
      await H.salvar(page, '48-voucher-formulario', { el: '.acn-prod-v-form' });
      await page.click('button[aria-label="Gerenciar tipos de serviço"]');
      await H.espera(500);
      await fotoDaRegiao(H, page, '49-voucher-tipos', ['.acn-prod-v-grade > div:first-child'], 10);
      await page.click('button[aria-label="Gerenciar tipos de serviço"]');
      await H.espera(300);
      const todos = await page.$$('.sec-card');
      if (todos[1]) { await H.salvar(page, '50-voucher-lista', { el: '.sec-card', indice: 1 }); }
    } finally { await browser.close(); }
  },

  // 51 e 52: Equipes (lista e a janela Nova Equipe)
  async equipes(H) {
    const { browser, page } = await H.preparar({ largura: 1500, altura: 900 });
    try {
      await H.irParaAdaptacao(page, 'equipes');
      await fotoDaRegiao(H, page, '51-equipes-lista', ['.acn-prod-eq-topo', '.acn-prod-eq-lista'], 10);
      await H.clicaTexto(page, 'button', '^Nova Equipe$');
      await H.espera(700);
      await page.evaluate(() => { const i = document.querySelector('.modal-box input.acn-input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Equipe Delta'); i.dispatchEvent(new Event('input', { bubbles: true })); });
      await H.espera(300);
      await H.fotoDaJanela(page, '52-nova-equipe');
    } finally { await browser.close(); }
  },
};
