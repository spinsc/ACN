// ─────────────────────────────────────────────────────────────────────────────
// Admin › os quatro painéis de configuração pequenos: Config. Email, Config. Cotações, Faixas de Markup e Config. NFC.
//
// 12e83 (26/11/2026): saíram do AdminTab.tsx já no padrão do design system (`Botao`, `Faixa`, `mostrarAviso`, classes `acn-adm-cfg-*` do design.css, sem `style` solto).
// A 7.x que veio antes corrigiu o que passava em silêncio (ver o plano):
//  • leitura recusada deixa de valer como "configuração vazia": faixa vermelha com "Tentar de novo" e Salvar desligado (antes o Salvar gravava os valores de partida por cima);
//  • o NFC gravava chave por chave sem olhar o erro e dizia "salvas com sucesso" mesmo com a gravação recusada: agora é UMA gravação, conferida;
//  • o e-mail marcava "SMTP já configurado" ao salvar só o endereço do Fiscal (a função de servidor ignora campo vazio e grava `smtp_configurado = true`): agora a
//    primeira gravação exige servidor, usuário e senha;
//  • o motivo que a função de servidor devolve (ex.: "Só o Admin altera…") aparece em vez de "Edge Function returned a non-2xx status code";
//  • faixas de markup e desconto máximo são conferidas antes de gravar (markup: números não negativos, mínimo não passa do "bom", sem teto: a régua de Pós-vendas está em 100 e 150;
//    desconto: número de 0 a 100);
//  • o interruptor das Cotações era uma `div` que só respondia ao mouse: virou caixa de seleção com `role="switch"` (teclado e leitor de tela);
//  • os `alert()` viraram avisos do sistema e o texto de resultado que sumia em 3 s virou aviso (o de erro fica até a pessoa fechar).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { mostrarAviso } from './Feedback';
import { Botao } from './Interface';
import { explicarErroDoBanco } from './ErroDoBanco';
import { TIPOS_NEGOCIO_CRM, BANDA_MARKUP_PADRAO, SLUG_TIPO_NEGOCIO } from './MarkupTermometro';
import { useConfiguracoes, FaixaDeLeituraRecusada, motivoDaFuncao } from './AdminConfig';

const usuarioLogado = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG. EMAIL (SMTP)
// ─────────────────────────────────────────────────────────────────────────────
const CHAVES_EMAIL = ['email_fiscal_destino', 'smtp_configurado'];

export function PainelEmailCfg() {
  const currentUser = usuarioLogado();
  const leitura = useConfiguracoes(CHAVES_EMAIL);
  const [form, setForm] = useState({
    smtp_host: '', smtp_porta: '587', smtp_usuario: '', smtp_senha: '',
    smtp_from_nome: '', smtp_from_email: '',
  });
  const [destinatarioFiscal, setDestinatarioFiscal] = useState('fiscal@acn.com.br');
  const [salvando, setSalvando] = useState(false);
  const [smtpConfigurado, setSmtpConfigurado] = useState(false);
  const [testeEmail, setTesteEmail] = useState('');
  const [testando, setTestando] = useState(false);

  // configuracoes_email_smtp não tem SELECT para quem entra (de propósito: o segredo nunca volta ao navegador); só se lê a marca pública
  useEffect(() => {
    if (!leitura.dados) return;
    if (leitura.dados.email_fiscal_destino) setDestinatarioFiscal(leitura.dados.email_fiscal_destino);
    setSmtpConfigurado(leitura.dados.smtp_configurado === 'true');
  }, [leitura.dados]);

  const campo = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }));

  const erroDoFormulario = () => {
    if (!destinatarioFiscal.trim()) return 'Informe o e-mail do Fiscal: sem ele as liberações de NF não têm para onde ir.';
    if (!EMAIL_VALIDO.test(destinatarioFiscal.trim())) return 'O e-mail do Fiscal não parece um endereço válido.';
    if (form.smtp_from_email.trim() && !EMAIL_VALIDO.test(form.smtp_from_email.trim())) return 'O e-mail do remetente não parece um endereço válido.';
    if (!smtpConfigurado) {
      // a função de servidor ignora campo vazio e, com o endereço do Fiscal, grava "SMTP configurado": sem isto a marca ficava verdadeira sem servidor nenhum
      if (!form.smtp_host.trim()) return 'Informe o servidor SMTP (host): o e-mail ainda não está configurado.';
      if (!form.smtp_usuario.trim()) return 'Informe o usuário do SMTP: o e-mail ainda não está configurado.';
      if (!form.smtp_senha.trim()) return 'Informe a senha do SMTP: o e-mail ainda não está configurado.';
    }
    return '';
  };

  const salvar = async () => {
    if (salvando || !leitura.dados) return;
    const erroForm = erroDoFormulario();
    if (erroForm) { mostrarAviso(erroForm, 'atencao'); return; }
    setSalvando(true);
    // A tabela configuracoes_email_smtp não tem política de SELECT para quem entra, e UPDATE/DELETE sob RLS exigem poder ler a linha: por isso a gravação
    // passa pela função de servidor save-email-config (chave de serviço, que ignora RLS e só aceita Admin).
    const { data, error } = await supabase.functions.invoke('save-email-config', {
      body: { ...form, email_fiscal_destino: destinatarioFiscal.trim(), atualizado_por: currentUser?.email },
    });
    if (error || data?.error) {
      setSalvando(false);
      mostrarAviso('Não foi possível salvar a configuração do e-mail: ' + await motivoDaFuncao(error, data), 'erro');
      return;
    }
    setSmtpConfigurado(true);
    setForm(f => ({ ...f, smtp_senha: '' })); // nunca mantém a senha em memória após salvar
    setSalvando(false);
    mostrarAviso('Configuração do e-mail salva.', 'ok');
  };

  const enviarTeste = async () => {
    if (testando) return;
    if (!EMAIL_VALIDO.test(testeEmail.trim())) { mostrarAviso('Informe um e-mail válido para o teste.', 'atencao'); return; }
    setTestando(true);
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: { to: testeEmail.trim(), subject: 'Teste — ACN Sinal Verde', html: '<p>Email de teste enviado pelo painel de Configurações de Email.</p>' },
    });
    setTestando(false);
    if (error || data?.error) mostrarAviso('Falha no envio do teste: ' + await motivoDaFuncao(error, data), 'erro');
    else mostrarAviso(`E-mail de teste enviado para ${testeEmail.trim()}.`, 'ok');
  };

  const desligado = !leitura.dados;

  return (
    <div className="sec-card acn-adm-cfg">
      <div className="sec-hdr no-collapse">📧 Configurações de Email (SMTP)</div>
      <div className="sec-body">
        {leitura.erro && <FaixaDeLeituraRecusada oQue="a configuração do e-mail" erro={leitura.erro} onTentar={leitura.reler} />}
        <p className="acn-adm-cfg-ajuda">
          Usado para o email automático ao Fiscal quando uma OP/OS é liberada para emissão de NF, e para futuros envios automáticos (contratos, etc).
          {smtpConfigurado && <b className="acn-adm-cfg-ok"> ✅ SMTP já configurado.</b>}
        </p>

        <div className="acn-adm-cfg-grade dois-um">
          <div className="acn-adm-cfg-campo"><label className="acn-label">Servidor SMTP (host)</label>
            <input className="acn-input" placeholder="Ex: smtp.office365.com" value={form.smtp_host} onChange={campo('smtp_host')} disabled={desligado} /></div>
          <div className="acn-adm-cfg-campo"><label className="acn-label">Porta</label>
            <input className="acn-input" placeholder="587 (TLS) ou 465 (SSL)" value={form.smtp_porta} onChange={campo('smtp_porta')} disabled={desligado} /></div>
        </div>
        <div className="acn-adm-cfg-grade">
          <div className="acn-adm-cfg-campo"><label className="acn-label">Usuário SMTP</label>
            <input className="acn-input" placeholder="usuario@acn.com.br" value={form.smtp_usuario} onChange={campo('smtp_usuario')} disabled={desligado} /></div>
          <div className="acn-adm-cfg-campo"><label className="acn-label">Senha SMTP {smtpConfigurado && '(deixe em branco para manter a atual)'}</label>
            <input type="password" className="acn-input" placeholder={smtpConfigurado ? '••••••••' : 'Senha'} value={form.smtp_senha} onChange={campo('smtp_senha')} disabled={desligado} autoComplete="new-password" /></div>
        </div>
        <div className="acn-adm-cfg-grade">
          <div className="acn-adm-cfg-campo"><label className="acn-label">Nome do Remetente</label>
            <input className="acn-input" placeholder="ACN Sinal Verde" value={form.smtp_from_nome} onChange={campo('smtp_from_nome')} disabled={desligado} /></div>
          <div className="acn-adm-cfg-campo"><label className="acn-label">Email do Remetente (opcional, padrão = usuário)</label>
            <input className="acn-input" placeholder="sistema@acn.com.br" value={form.smtp_from_email} onChange={campo('smtp_from_email')} disabled={desligado} /></div>
        </div>
        <div className="acn-adm-cfg-campo">
          <label className="acn-label">Email do Fiscal (destinatário das liberações de NF)</label>
          <input className="acn-input" placeholder="fiscal@acn.com.br" value={destinatarioFiscal} onChange={e => setDestinatarioFiscal(e.target.value)} disabled={desligado} />
        </div>

        <div className="acn-adm-cfg-rodape">
          <Botao variante="primario" onClick={salvar} disabled={salvando || desligado}>{salvando ? 'Salvando…' : '💾 Salvar'}</Botao>
        </div>

        {smtpConfigurado && (
          <div className="acn-adm-cfg-teste">
            <input className="acn-input acn-adm-cfg-teste-campo" placeholder="seuemail@teste.com" value={testeEmail} onChange={e => setTesteEmail(e.target.value)} aria-label="E-mail para o teste" />
            <Botao onClick={enviarTeste} disabled={testando}>{testando ? 'Enviando…' : '✉️ Enviar Teste'}</Botao>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG. COTAÇÕES
// ─────────────────────────────────────────────────────────────────────────────
const COTACOES_CFG_KEYS = [
  { chave: 'cotacoes_ver_custos_margens', label: 'Vendedores podem ver Custos e Margens',    desc: 'Exibe colunas de custo e margem de lucro nas cotações' },
  { chave: 'cotacoes_ver_fornecedores',   label: 'Vendedores podem ver Fornecedores e Marcas', desc: 'Exibe colunas de fornecedor e marca nas cotações' },
  { chave: 'cotacoes_ver_markup',         label: 'Vendedores podem ver o Markup',            desc: 'Exibe a coluna de markup aplicado nas cotações' },
];
const CHAVES_COTACOES = [...COTACOES_CFG_KEYS.map(k => k.chave), 'cotacoes_desconto_maximo_global'];

export function PainelCotacoesCfg() {
  const leitura = useConfiguracoes(CHAVES_COTACOES);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [maxDesc, setMaxDesc] = useState('0');

  useEffect(() => {
    if (!leitura.dados) return;
    setConfig(leitura.dados);
    setMaxDesc(leitura.dados['cotacoes_desconto_maximo_global'] || '0');
  }, [leitura.dados]);

  const salvar = async () => {
    if (salvando || !leitura.dados) return;
    const desconto = Number(String(maxDesc).trim().replace(',', '.'));
    if (String(maxDesc).trim() === '' || !Number.isFinite(desconto) || desconto < 0 || desconto > 100) {
      mostrarAviso('O desconto máximo global precisa ser um número de 0 a 100.', 'atencao');
      return;
    }
    setSalvando(true);
    const currentUser = usuarioLogado();
    const agora = new Date().toISOString();
    const upserts = [
      ...COTACOES_CFG_KEYS.map(k => ({
        chave: k.chave, valor: config[k.chave] || 'false', descricao: k.desc,
        atualizado_por: currentUser?.email, atualizado_em: agora,
      })),
      {
        chave: 'cotacoes_desconto_maximo_global', valor: String(maxDesc).trim(), descricao: 'Desconto máximo global para vendedores (%)',
        atualizado_por: currentUser?.email, atualizado_em: agora,
      },
    ];
    const { error } = await supabase.from('configuracoes_sistema').upsert(upserts, { onConflict: 'chave' });
    setSalvando(false);
    if (error) { mostrarAviso('Não foi possível salvar as configurações das cotações: ' + explicarErroDoBanco(error), 'erro'); return; }
    mostrarAviso('Configurações das cotações salvas.', 'ok');
  };

  const desligado = !leitura.dados;

  return (
    <div className="sec-card acn-adm-cfg">
      <div className="sec-hdr no-collapse">📋 Visibilidade de Dados nas Cotações (para Vendedores)</div>
      <div className="sec-body">
        {leitura.erro && <FaixaDeLeituraRecusada oQue="a configuração das cotações" erro={leitura.erro} onTentar={leitura.reler} />}
        <p className="acn-adm-cfg-ajuda">
          Controle quais campos sensíveis ficam visíveis para usuários com perfil de vendedor ao visualizarem cotações na aba de Cotações.
        </p>

        {COTACOES_CFG_KEYS.map(k => {
          const ativo = config[k.chave] === 'true';
          return (
            <label key={k.chave} className={'acn-adm-cot-linha' + (ativo ? ' ativo' : '')}>
              <span className="acn-adm-cot-texto">
                <b>{k.label}</b>
                <small>{k.desc}</small>
              </span>
              <span className="acn-adm-cot-estado">
                <span className="acn-adm-cot-rotulo">{ativo ? 'Visível' : 'Oculto'}</span>
                <input type="checkbox" role="switch" className="acn-adm-cot-chave" checked={ativo} disabled={desligado}
                  aria-label={k.label}
                  onChange={() => setConfig(c => ({ ...c, [k.chave]: ativo ? 'false' : 'true' }))} />
              </span>
            </label>
          );
        })}

        <div className="acn-adm-cot-desconto">
          <div className="acn-adm-cot-desconto-titulo">Desconto Máximo Global (%)</div>
          <div className="acn-adm-cot-desconto-ajuda">
            Vendedores podem conceder até este % de desconto sem precisar de aprovação.
            (Será sobrescrito pelo desconto máximo configurado individualmente em cada cotação, se maior.)
          </div>
          <div className="acn-adm-cot-desconto-campo">
            <input type="number" min={0} max={100} step={0.5} className="acn-input acn-adm-cot-desconto-input" value={maxDesc}
              onChange={e => setMaxDesc(e.target.value)} disabled={desligado} aria-label="Desconto máximo global em porcentagem" />
            <span className="acn-fraco">%</span>
          </div>
        </div>

        <div className="acn-adm-cfg-rodape">
          <Botao variante="primario" onClick={salvar} disabled={salvando || desligado}>{salvando ? 'Salvando…' : '💾 Salvar Configurações'}</Botao>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FAIXAS DE MARKUP (por tipo de negócio do CRM)
//
// Pedido do Rafael Nunes (dono da empresa) em 23/09/2026: revenda tem markup
// normal mais baixo (~65%), venda varia bastante, pós-vendas/manutenção
// deveria exigir markup sempre mais alto — cada tipo com sua própria régua de
// cor no termômetro (ver MarkupTermometro.tsx), configurável aqui em vez de
// fixa no código, pra ele mesmo poder ajustar sem precisar pedir alteração.
// ─────────────────────────────────────────────────────────────────────────────
const CHAVES_MARKUP = Object.values(SLUG_TIPO_NEGOCIO).flatMap(s => [`markup_regua_${s}_ativa`, `markup_regua_${s}_min`, `markup_regua_${s}_bom`]);

export function PainelMarkupCfg() {
  const leitura = useConfiguracoes(CHAVES_MARKUP);
  const [cfg, setCfg] = useState<Record<string, any>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!leitura.dados) return;
    const mapa = leitura.dados;
    const inicial: Record<string, any> = {};
    for (const [tipo, slug] of Object.entries(SLUG_TIPO_NEGOCIO)) {
      const ativaStr = mapa[`markup_regua_${slug}_ativa`];
      inicial[tipo] = {
        ativa: ativaStr === undefined ? true : ativaStr !== 'false',
        min: mapa[`markup_regua_${slug}_min`] || String(BANDA_MARKUP_PADRAO.min),
        bom: mapa[`markup_regua_${slug}_bom`] || String(BANDA_MARKUP_PADRAO.bom),
      };
    }
    setCfg(inicial);
  }, [leitura.dados]);

  const setCampo = (tipo: string, campo: string, valor: any) =>
    setCfg(c => ({ ...c, [tipo]: { ...c[tipo], [campo]: valor } }));

  // Faixa que o termômetro não sabe ler (vazia, negativa, "bom" abaixo do "mínimo") era gravada do mesmo jeito. Só vale para régua ativa.
  // Suposição a confirmar (12e83): mínimo e "bom" precisam ser números não negativos e o mínimo não passa do "bom". NÃO há teto de 100: a régua real de Pós-vendas está em 100 e 150 (markup passa de 100%).
  const erroDaRegua = (tipo: string) => {
    const c = cfg[tipo] || {};
    if (c.ativa === false) return '';
    const min = Number(String(c.min ?? '').replace(',', '.')), bom = Number(String(c.bom ?? '').replace(',', '.'));
    if (String(c.min ?? '').trim() === '' || String(c.bom ?? '').trim() === '' || !Number.isFinite(min) || !Number.isFinite(bom)) return `${tipo}: informe o mínimo e o "bom a partir de" como números.`;
    if (min < 0 || bom < 0) return `${tipo}: o mínimo e o "bom a partir de" não podem ser negativos.`;
    if (min > bom) return `${tipo}: o mínimo aceitável (${min}%) não pode ser maior que o "bom a partir de" (${bom}%).`;
    return '';
  };

  const salvar = async () => {
    if (salvando || !leitura.dados) return;
    for (const tipo of TIPOS_NEGOCIO_CRM) {
      const erroTipo = erroDaRegua(tipo);
      if (erroTipo) { mostrarAviso(erroTipo, 'atencao'); return; }
    }
    setSalvando(true);
    const currentUser = usuarioLogado();
    const agora = new Date().toISOString();
    const upserts = Object.entries(SLUG_TIPO_NEGOCIO).flatMap(([tipo, slug]) => {
      const c = cfg[tipo] || {};
      return [
        { chave: `markup_regua_${slug}_ativa`, valor: c.ativa === false ? 'false' : 'true' },
        { chave: `markup_regua_${slug}_min`,   valor: String(c.min ?? BANDA_MARKUP_PADRAO.min).trim() },
        { chave: `markup_regua_${slug}_bom`,   valor: String(c.bom ?? BANDA_MARKUP_PADRAO.bom).trim() },
      ].map(r => ({ ...r, descricao: `Régua de markup — ${tipo}`, atualizado_por: currentUser?.email, atualizado_em: agora }));
    });
    const { error } = await supabase.from('configuracoes_sistema').upsert(upserts, { onConflict: 'chave' });
    setSalvando(false);
    if (error) { mostrarAviso('Não foi possível salvar as faixas de markup: ' + explicarErroDoBanco(error), 'erro'); return; }
    mostrarAviso('Faixas de markup salvas.', 'ok');
  };

  const desligado = !leitura.dados;

  return (
    <div className="sec-card acn-adm-cfg">
      <div className="sec-hdr no-collapse">📈 Faixas de Markup por Tipo de Negócio (CRM)</div>
      <div className="sec-body">
        {leitura.erro && <FaixaDeLeituraRecusada oQue="as faixas de markup" erro={leitura.erro} onTentar={leitura.reler} />}
        <p className="acn-adm-cfg-ajuda">
          Cada tipo de negócio da oportunidade (Comercial → CRM) pode ter sua própria régua de alerta no
          termômetro de markup. Abaixo de "mínimo aceitável" o markup acende vermelho; entre "mínimo" e "bom" fica
          laranja (apertado); a partir de "bom" fica amarelo, até chegar em 100% (meta, verde) — acima disso é sempre
          dourado (overmarkup), fixo pra todos os tipos. Sem "régua ativa", o markup aparece sem cor de alerta —
          use isso para o tipo que "varia bastante" e não tem um número certo.
        </p>
        {TIPOS_NEGOCIO_CRM.map(tipo => {
          const c = cfg[tipo] || { ativa: true, min: BANDA_MARKUP_PADRAO.min, bom: BANDA_MARKUP_PADRAO.bom };
          return (
            <div key={tipo} className="acn-adm-mk-tipo">
              <div className="acn-adm-mk-linha">
                <strong className="acn-adm-mk-nome">{tipo}</strong>
                <label className="acn-adm-mk-rot">
                  <input type="checkbox" checked={c.ativa !== false} disabled={desligado} onChange={e => setCampo(tipo, 'ativa', e.target.checked)} />
                  Régua ativa (mostra cor de alerta)
                </label>
                {c.ativa !== false && (<>
                  <label className="acn-adm-mk-rot">
                    Mínimo aceitável (%)
                    <input type="number" min={0} step={1} className="acn-input acn-adm-mk-num" value={c.min ?? BANDA_MARKUP_PADRAO.min}
                      disabled={desligado} onChange={e => setCampo(tipo, 'min', e.target.value)} />
                  </label>
                  <label className="acn-adm-mk-rot">
                    Bom a partir de (%)
                    <input type="number" min={0} step={1} className="acn-input acn-adm-mk-num" value={c.bom ?? BANDA_MARKUP_PADRAO.bom}
                      disabled={desligado} onChange={e => setCampo(tipo, 'bom', e.target.value)} />
                  </label>
                </>)}
              </div>
            </div>
          );
        })}
        <div className="acn-adm-cfg-rodape">
          <Botao variante="primario" onClick={salvar} disabled={salvando || desligado}>{salvando ? 'Salvando…' : '💾 Salvar Faixas de Markup'}</Botao>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG. NFC
// ─────────────────────────────────────────────────────────────────────────────
const NFC_KEYS = [
  { chave: 'nfc_endereco_maps',   label: 'Endereço Google Maps', tipo: 'text',
    desc: 'Parâmetro de busca (ex: Rua+das+Flores,123+Florianópolis+SC)' },
  { chave: 'nfc_pin_global',      label: 'PIN Global Área Restrita', tipo: 'text',
    desc: 'PIN padrão quando o veículo não tem PIN próprio' },
  { chave: 'nfc_base_url',        label: 'URL Base da Página NFC (Tag)', tipo: 'url',
    desc: 'URL onde veiculo.html está hospedado (sem ?chassi=)' },
  { chave: 'nfc_portal_url',      label: 'URL Base do Portal do Cliente', tipo: 'url',
    desc: 'URL onde portal.html está hospedado (sem ?token=). Enviada aos clientes como link de acesso.' },
  { chave: 'nfc_nome_empresa',    label: 'Nome da Empresa', tipo: 'text',
    desc: 'Exibido no cabeçalho da página pública' },
  { chave: 'nfc_logo_url',        label: 'URL do Logotipo', tipo: 'url',
    desc: 'PNG ou SVG. Deixe vazio para exibir o nome em texto.' },
];
const CHAVES_NFC = NFC_KEYS.map(k => k.chave);

export function PainelNfcCfg() {
  const leitura = useConfiguracoes(CHAVES_NFC);
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (leitura.dados) setCfg(leitura.dados); }, [leitura.dados]);

  const salvar = async () => {
    if (salvando || !leitura.dados) return;
    setSalvando(true);
    const agora = new Date().toISOString();
    // UMA gravação com as chaves do NFC, conferida: antes eram sete (uma atrás da outra; a do WhatsApp saiu em 26/11/2026 com a retirada do WhatsApp do sistema), sem olhar o erro, e a tela dizia "salvas com sucesso" de qualquer jeito
    const { error } = await supabase.from('configuracoes_sistema').upsert(
      NFC_KEYS.map(k => ({ chave: k.chave, valor: String(cfg[k.chave] || '').trim(), descricao: k.desc, atualizado_em: agora })),
      { onConflict: 'chave' },
    );
    setSalvando(false);
    if (error) { mostrarAviso('Não foi possível salvar as configurações do NFC: ' + explicarErroDoBanco(error), 'erro'); return; }
    mostrarAviso('Configurações do NFC salvas.', 'ok');
  };

  const desligado = !leitura.dados;

  return (
    <div className="sec-card acn-adm-cfg">
      <div className="sec-hdr no-collapse">📱 Configurações do Módulo NFC</div>
      <div className="sec-body">
        {leitura.erro && <FaixaDeLeituraRecusada oQue="as configurações do NFC" erro={leitura.erro} onTentar={leitura.reler} />}
        <p className="acn-adm-cfg-ajuda">
          Parametrize os dados que aparecem na página pública do veículo (acessada via etiqueta NFC).
        </p>
        {NFC_KEYS.map(k => (
          <div key={k.chave} className="acn-adm-cfg-campo">
            <label className="acn-label" htmlFor={'nfc-' + k.chave}>{k.label}</label>
            <input id={'nfc-' + k.chave} type={k.tipo} className="acn-input" value={cfg[k.chave] || ''} disabled={desligado}
              onChange={e => setCfg(c => ({ ...c, [k.chave]: e.target.value }))} placeholder={k.desc} />
            <div className="acn-adm-cfg-dica">{k.desc}</div>
          </div>
        ))}
        <div className="acn-adm-cfg-rodape">
          <Botao variante="primario" onClick={salvar} disabled={salvando || desligado}>{salvando ? 'Salvando…' : '💾 Salvar Configurações NFC'}</Botao>
        </div>
      </div>
    </div>
  );
}
