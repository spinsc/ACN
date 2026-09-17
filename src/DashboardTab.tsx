// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import ComercialTab from './ComercialTab';
import EngenhariaTab from './EngenhariaTab';
import AjustesProjetoTab from './AjustesProjetoTab';
import PCPTab from './PCPTab';
import AlmoxarifadoTab from './AlmoxarifadoTab';
import ProducaoTab from './ProducaoTab';
import PainelProducaoTV from './PainelProducaoTV';
import QualidadeTab from './QualidadeTab';
import FiscalTab from './FiscalTab';
import LogisticaTab from './LogisticaTab';
import VistoriasPatio from './VistoriasPatio';
import MarketingTab from './MarketingTab';
import SetorDemandaTab from './SetorDemandaTab';
import ComprasTab from './ComprasTab';
import CadastroItensTab from './CadastroItensTab';
import CadastroProdutosTab from './CadastroProdutosTab';
import CotacoesTab from './CotacoesTab';
import AdminTab from './AdminTab';
import RelatoriosTab from './RelatoriosTab';
import FormacaoPrecosTab from './FormacaoPrecosTab';
import SacTab from './SacTab';
import VeiculosNfcTab from './VeiculosNfcTab';
import LicitacoesTab from './LicitacoesTab';
import CalendarioTab from './CalendarioTab';
import CrmTab from './CrmTab';
import ClientesTab from './ClientesTab';
import RHTab, { ComissoesTecnicosStandalone } from './RHTab';
import FinanceiroTab from './FinanceiroTab';
import ChatWidget from './ChatWidget';
import AnaliseInboxPanel, { contarAnalisesDoUsuario } from './AnaliseInboxPanel';
import AvisosOpPanel, { contarAvisosOp } from './AvisosOpPanel';
import { AlertasComprasPanel, JanelaParadasObrigatoria, carregarAlertasCompras, alertasDoUsuario, dispararMencoesEntrega } from './ComprasFluxo';
import Icone from './Icone';
import {
  mdiViewDashboardOutline, mdiCalendarMonthOutline, mdiHandshakeOutline, mdiGavel, mdiFileDocumentOutline,
  mdiAccountGroupOutline, mdiBullhornOutline, mdiRulerSquareCompass, mdiClipboardCheckOutline, mdiWarehouse,
  mdiCarWrench, mdiTelevision, mdiHammerWrench, mdiCableData, mdiFlaskOutline, mdiShieldCheckOutline,
  mdiRadioTower, mdiTruckOutline, mdiCarSearchOutline, mdiClipboardTextOutline, mdiCartOutline, mdiCashMultiple,
  mdiPackageVariantClosed, mdiTagMultipleOutline, mdiAccountTieOutline, mdiCurrencyUsd, mdiReceiptTextOutline,
  mdiChartBoxOutline, mdiCalculatorVariantOutline, mdiHeadset, mdiNfcVariant, mdiShieldAccountOutline,
  mdiMagnify, mdiMenu, mdiClose, mdiAt, mdiBellOutline, mdiClipboardSearchOutline, mdiChevronRight,
  mdiChevronDown, mdiWeatherNight, mdiWhiteBalanceSunny, mdiKeyOutline, mdiLogout, mdiRefresh,
} from '@mdi/js';
import { CabecalhoTela, Botao, Selo } from './Interface';

// Ícone de cada aba do menu lateral
const ICONE_ABA: Record<string, string> = {
  dashboard: mdiViewDashboardOutline, calendario: mdiCalendarMonthOutline,
  crm: mdiHandshakeOutline, licitacoes: mdiGavel, cotacoes: mdiFileDocumentOutline, clientes: mdiAccountGroupOutline, marketing: mdiBullhornOutline,
  engenharia: mdiRulerSquareCompass, pcp: mdiClipboardCheckOutline, almoxarifado: mdiWarehouse,
  producao: mdiCarWrench, painel_tv: mdiTelevision, serralheria: mdiHammerWrench, chicotes: mdiCableData,
  laboratorio: mdiFlaskOutline, qualidade: mdiShieldCheckOutline, telecom: mdiRadioTower,
  logistica: mdiTruckOutline, vistorias: mdiCarSearchOutline, ajustes: mdiClipboardTextOutline, compras: mdiCartOutline,
  financeiro: mdiCashMultiple, cadastro_itens: mdiPackageVariantClosed, cadastro_produtos: mdiTagMultipleOutline,
  rh: mdiAccountTieOutline, comissoes_tecnicos: mdiCurrencyUsd, fiscal: mdiReceiptTextOutline, relatorios: mdiChartBoxOutline,
  formacao_precos: mdiCalculatorVariantOutline, sac: mdiHeadset, nfc: mdiNfcVariant, admin: mdiShieldAccountOutline,
};
import { contarAnalisesPendentesPorSetor } from './AnaliseWidget';
import MencoesInboxPanel from './MencoesInboxPanel';
import AvisoSistemaWidget from './AvisoSistemaWidget';
import ContatoAlertWidget from './ContatoAlertWidget';
import ContatoComercialAlertWidget from './ContatoComercialAlertWidget';
import { OplDetalheModal } from './AcnTabShared';
import { normalizarBusca } from './SearchUtils';


interface Props { currentUser: any; onLogout: () => void; }

const METRICAS_CONFIG = [
  { key: 'engenharia',   nome: 'Engenharia',   desc: 'Lead time liberação BOM',               meta: 8,  tol: 16,  campo: 'tempo_engenharia_horas',   diretriz: 'Parâmetros normais mantidos.' },
  { key: 'pcp',          nome: 'PCP',           desc: 'BOM lançado × liberação produção',      meta: 24, tol: 48,  campo: 'tempo_pcp_horas',          diretriz: 'Triagem e distribuição em fluxo.' },
  { key: 'compras',      nome: 'Compras',       desc: 'Solicitação × efetivação do pedido',    meta: 24, tol: 72,  campo: 'tempo_compras_horas',       diretriz: 'Velocidade de compras.' },
  { key: 'almoxarifado', nome: 'Almoxarifado',  desc: 'Kiting solicitado × concluído',         meta: 8,  tol: 24,  campo: 'tempo_almoxarifado_horas',  diretriz: 'Separação operacional.' },
  { key: 'chicotes',     nome: 'Chicotes',      desc: 'Tempo fabricação (pedido × entrega)',   meta: 48, tol: 96,  campo: 'tempo_chicotes_horas',      diretriz: 'Linha de chicotes.' },
  { key: 'laboratorio',  nome: 'Laboratório',   desc: 'Solicitação × devolução',               meta: 24, tol: 72,  campo: 'tempo_laboratorio_horas',   diretriz: 'Bancada de ensaios.' },
  { key: 'producao',     nome: 'Produção',      desc: 'Lead time execução (início × fim)',     meta: 16, tol: 48,  campo: 'tempo_producao_horas',      diretriz: 'Execução de linha.' },
  { key: 'qualidade',    nome: 'Controle de qualidade', desc: 'Fila checklist × liberação',            meta: 1,  tol: 3,   campo: 'tempo_qualidade_horas',     diretriz: 'Auditoria de pátio fluindo.' },
  { key: 'logistica',    nome: 'Logística',     desc: 'Despacho × retorno',                    meta: 48, tol: 120, campo: 'tempo_logistica_horas',     diretriz: 'Manifestos em movimento.' },
  { key: 'serralheria',  nome: 'Serralheria',   desc: 'Mobilização + execução (total)',        meta: 24, tol: 72,  campo: 'tempo_serralheria_horas',   diretriz: 'Mobilização e execução.' },
  { key: 'fiscal',       nome: 'Fiscal',        desc: 'Liberação comercial × emissão NF',      meta: 2,  tol: 6,   campo: 'tempo_fiscal_horas',        diretriz: 'Faturamento síncrono.' },
];

const SIDEBAR_GROUPS = [
  {
    section: 'Dashboard',
    items: [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'calendario', label: 'Calendário' },
    ],
  },
  {
    section: 'Comercial',
    items: [
      { id: 'crm',        label: 'Comercial / CRM' },
      { id: 'licitacoes', label: 'Licitações' },
      { id: 'cotacoes',   label: 'Cotações' },
      { id: 'clientes',  label: 'Clientes' },
      { id: 'marketing', label: 'Marketing' },
    ],
  },
  {
    section: 'Controle de produção',
    items: [
      { id: 'engenharia',   label: 'Engenharia' },
      { id: 'pcp',          label: 'PCP' },
      { id: 'almoxarifado', label: 'Almoxarifado' },
    ],
  },
  {
    section: 'Produção',
    items: [
      { id: 'producao',    label: 'Adaptação' },
      { id: 'painel_tv',   label: 'Painel TV' },
      { id: 'serralheria', label: 'Serralheria' },
      { id: 'chicotes',    label: 'Chicotes' },
      { id: 'laboratorio', label: 'Laboratório' },
      { id: 'qualidade',   label: 'Controle de qualidade' },
      { id: 'telecom',     label: 'Telecom' },
    ],
  },
  {
    section: 'Administrativo',
    items: [
      { id: 'logistica',  label: 'Logística In/Out' },
      { id: 'vistorias',  label: 'Vistorias de pátio' },
      { id: 'ajustes',    label: 'Demandas gerais' },
      { id: 'compras',         label: 'Compras' },
      { id: 'financeiro',      label: 'Financeiro' },
      { id: 'cadastro_itens',    label: 'Cadastro de itens' },
      { id: 'cadastro_produtos', label: 'Produtos e mercadorias' },
      { id: 'rh',                label: 'RH' },
      { id: 'comissoes_tecnicos', label: 'Comissões' },
      { id: 'fiscal',     label: 'Fiscal' },
      { id: 'relatorios',      label: 'Relatórios' },
      { id: 'formacao_precos', label: 'Formação de preços' },
    ],
  },
  {
    section: 'SAC',
    items: [
      { id: 'sac', label: 'SAC' },
      { id: 'nfc', label: 'Dossiê NFC' },
    ],
  },
  {
    section: 'Admin',
    items: [
      { id: 'admin', label: 'Admin' },
    ],
  },
];

const CSS = `
/* ── RESET ── */
*, *::before, *::after { box-sizing:border-box; }
html, body { margin:0; padding:0; height:100%; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; font-size:11px; background:#f8fafc; color:#374151; overflow:hidden; }

/* ── CASCA: menu lateral + coluna (cabeçalho + conteúdo) ── */
.acn-app    { display:flex; height:100vh; width:100%; }
.acn-coluna { flex:1; min-width:0; display:flex; flex-direction:column; height:100%; } /* acompanha a altura real da tela (no celular .acn-app usa 100dvh) */

/* ── CABEÇALHO ── */
.acn-header { background:#fff; color:#17212b; padding:0 20px; display:flex; align-items:center; gap:14px; height:56px; flex-shrink:0; border-bottom:1px solid #dee4ea; position:relative; z-index:20; }
.acn-aba-selo { display:flex; align-items:center; gap:6px; min-width:0; font-size:13px; color:#6b7886; white-space:nowrap; }
.acn-trilha-sep { display:flex; color:#9aa5b1; }
.acn-trilha-aba { color:#17212b; font-weight:600; overflow:hidden; text-overflow:ellipsis; }
.acn-busca { position:relative; flex:0 1 440px; min-width:180px; margin-left:auto; }
.acn-busca-campo { display:flex; align-items:center; gap:8px; height:36px; padding:0 10px; background:#f8fafb; border:1px solid #dee4ea; border-radius:8px; color:#6b7886; transition:border-color .12s, box-shadow .12s, background .12s; }
.acn-busca-campo:focus-within { background:#fff; border-color:#0e7068; box-shadow:0 0 0 3px rgba(14,112,104,.18); }
.acn-busca-campo input { flex:1; min-width:0; border:none; outline:none; background:transparent; font-size:13px; color:#17212b; box-shadow:none !important; }
.acn-busca-campo input::placeholder { color:#8a96a3; }
.acn-busca-status { font-size:12px; color:#8a96a3; }
.acn-busca-limpar { display:flex; border:none; background:none; color:#8a96a3; cursor:pointer; padding:2px; border-radius:4px; }
.acn-busca-limpar:hover { color:#17212b; background:#eef1f4; }
.acn-kbd { font:500 11px 'IBM Plex Mono', ui-monospace, monospace; padding:1px 6px; border:1px solid #dee4ea; border-radius:4px; color:#6b7886; background:#fff; white-space:nowrap; }
.acn-busca-resultados { background:#fff; border:1px solid #dee4ea; border-radius:10px; box-shadow:0 18px 48px rgba(23,33,43,.18), 0 4px 12px rgba(23,33,43,.08); }
.acn-right { display:flex; align-items:center; gap:2px; }
.acn-notif { position:relative; display:flex; align-items:center; gap:6px; height:36px; padding:0 10px; border-radius:8px; color:#3b4856; cursor:pointer; user-select:none; font-size:13px; font-weight:500; }
.acn-notif:hover { background:#eef1f4; color:#17212b; }
.acn-notif-icone { display:flex; align-items:center; gap:6px; }
.acn-notif-contador { min-width:18px; height:18px; padding:0 5px; border-radius:999px; font-size:11px; font-weight:700; line-height:18px; text-align:center; color:#fff; }
.acn-notif-contador.tom-info    { background:#245fb8; }
.acn-notif-contador.tom-marca   { background:#0e7068; }
.acn-notif-contador.tom-atencao { background:#c2700f; }
.acn-user-btn { display:flex; align-items:center; justify-content:center; width:34px; height:34px; margin-left:8px; border-radius:50%; border:none; background:#e3f2ef; color:#0a544e; font-weight:700; font-size:12px; cursor:pointer; flex-shrink:0; padding:0; }
.acn-user-btn:hover { background:#cfe9e4; }
.acn-user-menu { display:block; position:fixed; top:60px; right:16px; z-index:5000; min-width:240px; background:#fff; color:#17212b; border:1px solid #dee4ea; border-radius:10px; box-shadow:0 18px 48px rgba(23,33,43,.18); overflow:hidden; }
.acn-user-menu .acn-user-menu-topo { padding:12px 14px; border-bottom:1px solid #edf1f4; }
.acn-user-menu .acn-user-menu-topo strong { display:block; font-size:14px; font-weight:600; }
.acn-user-menu .acn-user-menu-topo span { font-size:12px; color:#6b7886; }
.acn-user-menu button { display:flex; align-items:center; gap:10px; width:100%; min-height:40px; padding:0 14px; border:none; background:none; font-size:13px; color:#3b4856; cursor:pointer; text-align:left; }
.acn-user-menu button:hover { background:#f3f5f7; color:#17212b; }
.acn-user-menu-fundo { position:fixed; inset:0; z-index:4999; }
.acn-faixa-vercomo { background:#7c2d12; color:#fff; font-size:12px; font-weight:600; padding:6px 16px; display:flex; align-items:center; justify-content:center; gap:10px; flex-shrink:0; }
.acn-faixa-vercomo button { background:#fff; color:#7c2d12; border:none; border-radius:6px; padding:3px 10px; font-weight:700; cursor:pointer; font-size:12px; }

/* ── MENU LATERAL ── */
.acn-sidebar { width:232px; flex-shrink:0; background:#fff; border-right:1px solid #dee4ea; display:flex; flex-direction:column; height:100vh; }
.acn-marca { height:56px; display:flex; align-items:center; padding:0 16px; border-bottom:1px solid #edf1f4; flex-shrink:0; }
.acn-marca img { height:36px; max-width:100%; object-fit:contain; }
.acn-nav-lista { flex:1; overflow-y:auto; padding:8px 8px 12px; display:flex; flex-direction:column; gap:1px; }
.sidebar-section { display:flex; align-items:center; justify-content:space-between; width:100%; padding:14px 10px 4px; border:none; background:none; font-size:11px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:#8a96a3; cursor:pointer; text-align:left; }
.sidebar-section:hover { color:#3b4856; }
.sidebar-item { display:flex; align-items:center; gap:10px; width:100%; min-height:32px; padding:0 10px; border:none; background:none; border-radius:6px; font-size:13px; color:#3b4856; cursor:pointer; text-align:left; user-select:none; transition:background .1s, color .1s; white-space:nowrap; }
.sidebar-item .sidebar-icone { color:#8a96a3; }
.sidebar-item:hover { background:#f3f5f7; color:#17212b; }
.sidebar-item.active { background:#e3f2ef; color:#0a544e; font-weight:600; }
.sidebar-item.active .sidebar-icone { color:#0e7068; }
.sidebar-rotulo { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; }
.sidebar-contador { margin-left:auto; min-width:18px; height:18px; padding:0 6px; border-radius:999px; background:#fcf1df; color:#9a5708; font-size:11px; font-weight:700; line-height:18px; text-align:center; }
.acn-parceiro { padding:10px 16px 12px; border-top:1px solid #edf1f4; flex-shrink:0; }
.acn-parceiro img { height:30px; max-width:100%; object-fit:contain; opacity:.9; display:block; }

/* ── MAIN CONTENT ── */
.acn-main { flex:1; overflow-y:auto; padding:10px 14px; background:#f4f6f9; min-width:0; }

/* ── CARDS ── */
.sec-card { background:white; border:1px solid #e8ecf0; border-radius:6px; margin-bottom:8px; overflow:hidden; box-shadow:0 1px 2px rgba(0,0,0,.04); }
.sec-hdr  { padding:6px 10px; font-size:9px; font-weight:700; color:#374151; background:#fafbfc; border-bottom:1px solid #e8ecf0; display:flex; align-items:center; justify-content:space-between; gap:8px; letter-spacing:.4px; text-transform:uppercase; cursor:pointer; user-select:none; }
.sec-hdr::after { content:'▾'; font-size:11px; opacity:.45; margin-left:auto; flex-shrink:0; }
.sec-hdr.no-collapse::after { display:none; }
.sec-card.sec-collapsed .sec-hdr::after { content:'▸'; }
.sec-card.sec-collapsed .sec-body { display:none !important; }
.sec-card.sec-collapsed .sec-hdr { border-bottom:none; }
.sec-body { padding:8px 10px; }

/* ── TABELAS ── */
.acn-main table { font-size:9px !important; width:100%; border-collapse:collapse; table-layout:auto; }
.acn-main table thead tr { background:#1e293b !important; }
.acn-main table th { background:#1e293b !important; color:#cbd5e1 !important; padding:2px 7px !important; font-size:9px !important; font-weight:600 !important; text-align:left; border:none !important; white-space:nowrap; letter-spacing:.2px; }
.acn-main table td { padding:4px 7px !important; font-size:9px !important; border-bottom:1px solid #f1f5f9 !important; vertical-align:middle !important; color:#374151; }
.acn-main table tr:last-child td { border-bottom:none !important; }
.acn-main table tr:hover td { background:#f8fafc !important; }

/* ── TIPOGRAFIA ── */
.acn-main h2 { font-size:11px !important; font-weight:700; margin:0 0 6px !important; padding:0 !important; color:#0f172a; }
.acn-main h3 { font-size:10px !important; font-weight:700; margin:0 0 5px !important; padding:0 !important; border:none !important; color:#374151; }

/* ── BOTÕES ── */
.acn-btn { font-size:8px !important; font-weight:700; padding:2px 6px; border:none; border-radius:4px; cursor:pointer; color:white; white-space:nowrap; line-height:1; }
.acn-btn:disabled { opacity:.4; cursor:not-allowed; }
/* Tab-style navigation buttons (usados em AdminTab, DashboardTab, etc.) */
.acn-tab-btn         { background:#f1f5f9; color:#475569 !important; }
.acn-tab-btn.ativo   { background:#1e293b; color:#ffffff !important; }
body.dark .acn-tab-btn       { background:#334155 !important; color:#94a3b8 !important; }
body.dark .acn-tab-btn.ativo { background:#0f766e !important; color:#ffffff !important; }

/* ── BADGES ── */
.acn-badge { display:inline-block; padding:2px 6px; border-radius:3px; font-size:8px; font-weight:700; color:white; white-space:nowrap; letter-spacing:.2px; line-height:1; }

/* ── INPUTS ── */
.acn-input { font-size:9px; padding:3px 6px; border:1px solid #d1d5db; border-radius:4px; outline:none; box-sizing:border-box; color:#374151; background:#fff; }
.acn-input:focus { border-color:#0f766e; box-shadow:0 0 0 2px rgba(15,118,110,.10); }
.acn-label { display:block; font-size:8px; font-weight:700; color:#6b7280; margin-bottom:2px; text-transform:uppercase; letter-spacing:.4px; }
.acn-empty { text-align:center; padding:16px; color:#9ca3af; font-size:9px; font-style:italic; }

/* ── FOOTER / OPL MOVIMENTADAS ── */
.acn-footer-setor { background:var(--acn-surface); color:var(--acn-muted); border:1px solid var(--acn-line); font-size:9px; padding:5px 10px; border-radius:4px; margin-top:6px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; }
.acn-footer-setor strong { color:var(--acn-brand-ink); }
body.dark .acn-footer-setor { background:#1e293b !important; border-color:#334155 !important; color:#94a3b8 !important; }
body.dark .acn-footer-setor strong { color:#7fd8cc !important; }
.opl-mov-hdr  { background:var(--acn-surface); border:1px solid var(--acn-line); border-radius:4px; padding:5px 10px; font-size:10px; font-weight:600; color:var(--acn-ink); cursor:pointer; display:flex; justify-content:space-between; align-items:center; margin-top:6px; user-select:none; }
.opl-mov-body { border:1px solid #fde68a; border-top:none; border-radius:0 0 4px 4px; overflow:hidden; }

/* ── MODAL ── */
.modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:1000; }
.modal-box { background:white; border-radius:8px; padding:20px; max-width:500px; width:94%; max-height:90vh; overflow-y:auto; box-shadow:0 8px 32px rgba(0,0,0,.25); }
.modal-title { font-size:13px; font-weight:700; color:#0f172a; margin:0 0 14px; }

/* ── FORMS ── */
.form-row   { display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
.form-group { flex:1; min-width:100px; }

/* ── ALERTAS — cores fortes só aqui ── */
.crm-overdue td { background:#fef2f2 !important; }
.row-atraso td  { background:#fef2f2 !important; }
.row-alerta td  { background:#fffbeb !important; }

/* ── DASHBOARD MÉTRICAS ── */
.metrics-tbl { width:100%; border-collapse:collapse; font-size:10px; }
.metrics-tbl th { background:#f8fafc; padding:6px 8px; text-align:left; font-weight:700; color:#6b7280; border-bottom:1px solid #e2e8f0; font-size:9px; text-transform:uppercase; letter-spacing:.3px; }
.metrics-tbl td { padding:5px 8px; border-bottom:1px solid #f1f5f9; font-size:10px; }
.metrics-tbl tr:last-child td { border-bottom:none; }
.metrics-tbl tr:hover td { background:#f8fafc; }
.num-meta { color:#16a34a; font-weight:700; text-align:center; }
.num-tol  { color:#d97706; font-weight:700; text-align:center; }
.num-real { color:#3b82f6; font-weight:700; text-align:center; }
.st-sem-dados { display:inline-flex; align-items:center; gap:3px; color:#9ca3af; font-size:9px; }
.st-sem-dados::before { content:''; display:inline-block; width:6px; height:6px; border-radius:50%; background:#d1d5db; }
.st-ok   { display:inline-flex; align-items:center; gap:3px; color:#15803d; font-size:9px; font-weight:700; }
.st-ok::before   { content:''; display:inline-block; width:6px; height:6px; border-radius:50%; background:#22c55e; }
.st-warn { display:inline-flex; align-items:center; gap:3px; color:#b45309; font-size:9px; font-weight:700; }
.st-warn::before { content:''; display:inline-block; width:6px; height:6px; border-radius:50%; background:#f59e0b; }
.st-crit { display:inline-flex; align-items:center; gap:3px; color:#dc2626; font-size:9px; font-weight:700; }
.st-crit::before { content:''; display:inline-block; width:6px; height:6px; border-radius:50%; background:#ef4444; }
.chart-wrap { position:relative; width:100%; height:260px; }

@media print { .acn-sidebar, .acn-header { display:none; } .acn-main { padding:0; } }

/* ══════════════════════════════════════════════════════════════════
   NOTIFICAÇÕES WHATSAPP
   ══════════════════════════════════════════════════════════════════ */
@keyframes acn-wa-ping {
  0%   { transform: scale(1);   opacity: 1; }
  70%  { transform: scale(2.2); opacity: 0; }
  100% { transform: scale(2.2); opacity: 0; }
}
@keyframes acn-wa-glow {
  0%, 100% { background: #16a34a; }
  50%       { background: #22c55e; box-shadow: 0 0 6px #22c55e88; }
}
@keyframes acn-wa-badge-pulse {
  0%, 100% { transform: scale(1); }
  50%       { transform: scale(1.18); }
}

/* Ponto vermelho na sidebar (CRM) */
.acn-wa-sidebar-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 15px;
  height: 15px;
  background: #ef4444;
  border-radius: 8px;
  font-size: 8px;
  font-weight: 800;
  color: #fff;
  padding: 0 3px;
  margin-left: 5px;
  position: relative;
  flex-shrink: 0;
  animation: acn-wa-badge-pulse 1.4s ease-in-out infinite;
}
.acn-wa-sidebar-dot::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 8px;
  background: #ef4444;
  animation: acn-wa-ping 1.4s ease-out infinite;
  z-index: -1;
}

/* Badge verde nas msgs não lidas (cards de contato) */
.acn-wa-unread-badge {
  animation: acn-wa-badge-pulse 1.4s ease-in-out infinite;
}

/* Aba WA pulsando quando tem msgs não lidas */
.acn-wa-tab-ativa {
  animation: acn-wa-glow 1.6s ease-in-out infinite;
  border-radius: 4px;
  padding: 2px 5px;
}

/* ══════════════════════════════════════════════════════════════════
   MOBILE — tela estreita (< 700px)
   ══════════════════════════════════════════════════════════════════ */
.acn-hamburger { display:none; align-items:center; justify-content:center; width:36px; height:36px; background:transparent; border:none; border-radius:8px; color:#3b4856; cursor:pointer; flex-shrink:0; }
.acn-hamburger:hover { background:#eef1f4; }

@media (max-width:700px) {
  /* Menu vira gaveta; cabeçalho enxuto */
  .acn-hamburger { display:flex; }
  .acn-header { padding:0 8px; gap:8px; }
  .acn-trilha-secao, .acn-trilha-sep, .acn-rotulo, .acn-kbd { display:none; }
  .acn-busca { min-width:110px; }
  .acn-sidebar {
    position:fixed; top:0; bottom:0; left:-250px; z-index:300; width:240px;
    transition:left .22s ease; box-shadow:none;
  }
  .acn-sidebar.mob-open { left:0; box-shadow:3px 0 16px rgba(0,0,0,.25); }
  .acn-mob-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,.40); z-index:299; }
  .acn-mob-overlay.mob-open { display:block; }

  .acn-main  { padding:8px; }
  .sec-body  { overflow-x:auto; -webkit-overflow-scrolling:touch; }
  .acn-btn { font-size:10px !important; padding:5px 8px !important; min-height:28px; }

  .modal-overlay { align-items:flex-end; }
  .modal-box {
    max-width:100% !important; width:100% !important; max-height:88vh !important;
    border-radius:12px 12px 0 0 !important; margin:0 !important;
  }
  div[style*="width:min(700px"], div[style*="width:min(640px"], div[style*="width:min(500px"], div[style*="width:min(460px"] {
    width:100vw !important; max-width:100vw !important;
  }
}

@media (max-width:400px) {
  .acn-main { padding:6px; }
}

/* ══════════════════════════════════════════════════════════════════
   LIGHT MODE — força modo claro independente do tema do SO
   ══════════════════════════════════════════════════════════════════ */
.acn-app { color-scheme: light; background:#f4f6f9; color:#374151; }
.acn-main  { color:#374151; }
.sec-card  { color:#374151; }
.modal-box { color:#374151; }
/* Inputs sempre claros no modo light */
.acn-main input, .acn-main select, .acn-main textarea { color-scheme:light; color:#374151 !important; background:#fff !important; }

/* ══════════════════════════════════════════════════════════════════
   DARK MODE — estrutura
   ══════════════════════════════════════════════════════════════════ */
body.dark { background:#0f172a !important; color:#cbd5e1 !important; overflow:hidden; color-scheme:dark; }
body.dark .acn-app   { color-scheme:dark; background:#0f172a; color:#cbd5e1; }
body.dark .acn-sidebar { background:#161d2e !important; border-color:#263045 !important; }
body.dark .acn-header { background:#161d2e !important; border-color:#263045 !important; color:#cbd5e1 !important; }
body.dark .acn-trilha-aba { color:#e2e8f0 !important; }
body.dark .acn-busca-campo { background:#0f172a !important; border-color:#334155 !important; }
body.dark .acn-busca-campo input { color:#e2e8f0 !important; background:transparent !important; }
body.dark .acn-kbd { background:#1e293b !important; border-color:#334155 !important; color:#94a3b8 !important; }
body.dark .acn-busca-resultados { background:#1e293b !important; border-color:#334155 !important; }
body.dark .acn-notif { color:#cbd5e1 !important; }
body.dark .acn-notif:hover, body.dark .acn-hamburger:hover { background:#1e293b !important; }
body.dark .acn-hamburger { color:#cbd5e1 !important; }
body.dark .acn-user-btn { background:#133a36 !important; color:#86d9ce !important; }
body.dark .acn-user-menu { background:#1e293b !important; border-color:#334155 !important; color:#e2e8f0 !important; }
body.dark .acn-user-menu button { color:#cbd5e1 !important; }
body.dark .acn-user-menu button:hover { background:#0f172a !important; }
body.dark .acn-marca, body.dark .acn-parceiro, body.dark .acn-user-menu .acn-user-menu-topo { border-color:#263045 !important; }
body.dark .sidebar-item .sidebar-icone { color:#64748b; }
body.dark .sidebar-item.active .sidebar-icone { color:#2dd4bf; }
body.dark .sidebar-section { color:#7d8ea3 !important; }
body.dark .sidebar-item { color:#7c8fa0 !important; }
body.dark .sidebar-item:hover  { background:#0d2924 !important; color:#2dd4bf !important; }
body.dark .sidebar-item.active { background:#0d2924 !important; color:#2dd4bf !important; border-left-color:#0d9488 !important; }
body.dark .acn-main { background:#0c1121 !important; color:#cbd5e1 !important; }
body.dark .sec-card { background:#1e293b !important; border-color:#334155 !important; color:#cbd5e1 !important; }
body.dark .sec-hdr  { background:#0f172a !important; border-color:#334155 !important; color:#94a3b8 !important; }
body.dark .sec-body { background:#1e293b !important; color:#cbd5e1 !important; }
body.dark .acn-main table td   { background:#1e293b !important; color:#cbd5e1 !important; border-color:#334155 !important; }
body.dark .acn-main table th   { background:#0f172a !important; color:#94a3b8 !important; }
body.dark .acn-main table tr:hover td { background:#334155 !important; }
body.dark .acn-input  { background:#0f172a !important; border-color:#334155 !important; color:#cbd5e1 !important; }
body.dark .acn-input:focus { border-color:#0d9488 !important; box-shadow:0 0 0 2px rgba(13,148,136,.2) !important; }
body.dark .acn-label  { color:#94a3b8 !important; }
body.dark .acn-empty  { color:#94a3b8 !important; }
body.dark .modal-box  { background:#1e293b !important; color:#cbd5e1 !important; border:1px solid #334155 !important; }
body.dark .modal-title { color:#e2e8f0 !important; }
body.dark .opl-mov-hdr  { background:#1e293b !important; border-color:#334155 !important; color:#f1f5f9 !important; }
body.dark .opl-mov-body { border-color:#713f12 !important; }
body.dark .metrics-tbl th { background:#0f172a !important; color:#94a3b8 !important; border-color:#334155 !important; }
body.dark .metrics-tbl td { color:#cbd5e1 !important; border-color:#1e293b !important; }
body.dark .metrics-tbl tr:hover td { background:#334155 !important; }
body.dark h2, body.dark h3 { color:#e2e8f0 !important; }
body.dark .form-group label { color:#94a3b8 !important; }
body.dark .crm-overdue td { background:#2d0a0a !important; }
body.dark .row-atraso td  { background:#2d0a0a !important; }
body.dark .row-alerta td  { background:#1c1505 !important; }
body.dark ::-webkit-scrollbar { width:6px; height:6px; }
body.dark ::-webkit-scrollbar-track { background:#0f172a; }
body.dark ::-webkit-scrollbar-thumb { background:#334155; border-radius:3px; }
/* Inputs no dark */
body.dark input, body.dark select, body.dark textarea { background:#0f172a !important; color:#cbd5e1 !important; border-color:#334155 !important; color-scheme:dark; }

/* ──────────────────────────────────────────────────────────────────
   DARK MODE: inline style overrides — textos escuros → claros
   ────────────────────────────────────────────────────────────────── */
/* Textos quase-pretos que ficam invisíveis em dark */
body.dark [style*="color:#1f2937"], body.dark [style*="color:rgb(31, 41, 55)"], body.dark [style*="color: #1f2937"], body.dark [style*="color: rgb(31, 41, 55)"],
body.dark [style*="color:#374151"], body.dark [style*="color:rgb(55, 65, 81)"], body.dark [style*="color: #374151"], body.dark [style*="color: rgb(55, 65, 81)"],
body.dark [style*="color:#1e293b"], body.dark [style*="color:rgb(30, 41, 59)"], body.dark [style*="color: #1e293b"], body.dark [style*="color: rgb(30, 41, 59)"],
body.dark [style*="color:#0f172a"], body.dark [style*="color:rgb(15, 23, 42)"], body.dark [style*="color: #0f172a"], body.dark [style*="color: rgb(15, 23, 42)"],
body.dark [style*="color:#334155"], body.dark [style*="color:rgb(51, 65, 85)"], body.dark [style*="color: #334155"], body.dark [style*="color: rgb(51, 65, 85)"],
body.dark [style*="color:#111827"], body.dark [style*="color:rgb(17, 24, 39)"], body.dark [style*="color: #111827"], body.dark [style*="color: rgb(17, 24, 39)"],
body.dark [style*="color:#166534"], body.dark [style*="color:rgb(22, 101, 52)"], body.dark [style*="color: #166534"], body.dark [style*="color: rgb(22, 101, 52)"],
body.dark [style*="color:#5b21b6"], body.dark [style*="color:rgb(91, 33, 182)"], body.dark [style*="color: #5b21b6"], body.dark [style*="color: rgb(91, 33, 182)"],
body.dark [style*="color:#1a3a52"], body.dark [style*="color:rgb(26, 58, 82)"], body.dark [style*="color: #1a3a52"], body.dark [style*="color: rgb(26, 58, 82)"],
body.dark [style*="color:#991b1b"], body.dark [style*="color:rgb(153, 27, 27)"], body.dark [style*="color: #991b1b"], body.dark [style*="color: rgb(153, 27, 27)"],
body.dark [style*="color:#475569"], body.dark [style*="color:rgb(71, 85, 105)"], body.dark [style*="color: #475569"], body.dark [style*="color: rgb(71, 85, 105)"] { color:#94a3b8 !important; }

/* Cinzas médios — ajustar para não ficarem pesados */
body.dark [style*="color:#64748b"], body.dark [style*="color:rgb(100, 116, 139)"], body.dark [style*="color: #64748b"], body.dark [style*="color: rgb(100, 116, 139)"],
body.dark [style*="color:#6b7280"], body.dark [style*="color:rgb(107, 114, 128)"], body.dark [style*="color: #6b7280"], body.dark [style*="color: rgb(107, 114, 128)"],
body.dark [style*="color:#9ca3af"], body.dark [style*="color:rgb(156, 163, 175)"], body.dark [style*="color: #9ca3af"], body.dark [style*="color: rgb(156, 163, 175)"] { color:#94a3b8 !important; }

/* ──────────────────────────────────────────────────────────────────
   DARK MODE: cobertura ampla de cores de texto escuras/saturadas
   Levantado via grep de todo color:'#...' inline em src/*.tsx que
   ainda não tinha equivalente claro no dark — cada grupo mapeia pro
   tom claro da MESMA família de cor já usada nos badges acima (①-④),
   pra manter o significado semântico (verde=sucesso, vermelho=erro,
   âmbar=atenção, etc.) só invertendo escuro↔claro.
   ────────────────────────────────────────────────────────────────── */
/* cinza/neutro */
body.dark [style*="color:#333"], body.dark [style*="color:rgb(51, 51, 51)"], body.dark [style*="color: #333"], body.dark [style*="color: rgb(51, 51, 51)"],
body.dark [style*="color:#383d41"], body.dark [style*="color:rgb(56, 61, 65)"], body.dark [style*="color: #383d41"], body.dark [style*="color: rgb(56, 61, 65)"] { color:#94a3b8 !important; }
body.dark [style*="color:#666"], body.dark [style*="color:rgb(102, 102, 102)"], body.dark [style*="color: #666"], body.dark [style*="color: rgb(102, 102, 102)"],
body.dark [style*="color:#78716c"], body.dark [style*="color:rgb(120, 113, 108)"], body.dark [style*="color: #78716c"], body.dark [style*="color: rgb(120, 113, 108)"],
body.dark [style*="color:#4b5563"], body.dark [style*="color:rgb(75, 85, 99)"], body.dark [style*="color: #4b5563"], body.dark [style*="color: rgb(75, 85, 99)"] { color:#a3b1c2 !important; }
/* vermelho (erro/crítico) */
body.dark [style*="color:#dc2626"], body.dark [style*="color:rgb(220, 38, 38)"], body.dark [style*="color: #dc2626"], body.dark [style*="color: rgb(220, 38, 38)"],
body.dark [style*="color:#ef4444"], body.dark [style*="color:rgb(239, 68, 68)"], body.dark [style*="color: #ef4444"], body.dark [style*="color: rgb(239, 68, 68)"],
body.dark [style*="color:#7f1d1d"], body.dark [style*="color:rgb(127, 29, 29)"], body.dark [style*="color: #7f1d1d"], body.dark [style*="color: rgb(127, 29, 29)"],
body.dark [style*="color:#b91c1c"], body.dark [style*="color:rgb(185, 28, 28)"], body.dark [style*="color: #b91c1c"], body.dark [style*="color: rgb(185, 28, 28)"] { color:#fca5a5 !important; }
/* rosa/magenta */
body.dark [style*="color:#9d174d"], body.dark [style*="color:rgb(157, 23, 77)"], body.dark [style*="color: #9d174d"], body.dark [style*="color: rgb(157, 23, 77)"],
body.dark [style*="color:#831843"], body.dark [style*="color:rgb(131, 24, 67)"], body.dark [style*="color: #831843"], body.dark [style*="color: rgb(131, 24, 67)"] { color:#f9a8d4 !important; }
/* laranja/marrom (atenção) */
body.dark [style*="color:#92400e"], body.dark [style*="color:rgb(146, 64, 14)"], body.dark [style*="color: #92400e"], body.dark [style*="color: rgb(146, 64, 14)"],
body.dark [style*="color:#b45309"], body.dark [style*="color:rgb(180, 83, 9)"], body.dark [style*="color: #b45309"], body.dark [style*="color: rgb(180, 83, 9)"],
body.dark [style*="color:#78350f"], body.dark [style*="color:rgb(120, 53, 15)"], body.dark [style*="color: #78350f"], body.dark [style*="color: rgb(120, 53, 15)"],
body.dark [style*="color:#9a3412"], body.dark [style*="color:rgb(154, 52, 18)"], body.dark [style*="color: #9a3412"], body.dark [style*="color: rgb(154, 52, 18)"],
body.dark [style*="color:#d97706"], body.dark [style*="color:rgb(217, 119, 6)"], body.dark [style*="color: #d97706"], body.dark [style*="color: rgb(217, 119, 6)"],
body.dark [style*="color:#c2410c"], body.dark [style*="color:rgb(194, 65, 12)"], body.dark [style*="color: #c2410c"], body.dark [style*="color: rgb(194, 65, 12)"],
body.dark [style*="color:#713f12"], body.dark [style*="color:rgb(113, 63, 18)"], body.dark [style*="color: #713f12"], body.dark [style*="color: rgb(113, 63, 18)"],
body.dark [style*="color:#f97316"], body.dark [style*="color:rgb(249, 115, 22)"], body.dark [style*="color: #f97316"], body.dark [style*="color: rgb(249, 115, 22)"],
body.dark [style*="color:#854d0e"], body.dark [style*="color:rgb(133, 77, 14)"], body.dark [style*="color: #854d0e"], body.dark [style*="color: rgb(133, 77, 14)"],
body.dark [style*="color:#7c2d12"], body.dark [style*="color:rgb(124, 45, 18)"], body.dark [style*="color: #7c2d12"], body.dark [style*="color: rgb(124, 45, 18)"] { color:#fdba74 !important; }
/* âmbar/amarelo */
body.dark [style*="color:#856404"], body.dark [style*="color:rgb(133, 100, 4)"], body.dark [style*="color: #856404"], body.dark [style*="color: rgb(133, 100, 4)"] { color:#fde68a !important; }
/* verde (sucesso) */
body.dark [style*="color:#16a34a"], body.dark [style*="color:rgb(22, 163, 74)"], body.dark [style*="color: #16a34a"], body.dark [style*="color: rgb(22, 163, 74)"],
body.dark [style*="color:#15803d"], body.dark [style*="color:rgb(21, 128, 61)"], body.dark [style*="color: #15803d"], body.dark [style*="color: rgb(21, 128, 61)"],
body.dark [style*="color:#22c55e"], body.dark [style*="color:rgb(34, 197, 94)"], body.dark [style*="color: #22c55e"], body.dark [style*="color: rgb(34, 197, 94)"],
body.dark [style*="color:#059669"], body.dark [style*="color:rgb(5, 150, 105)"], body.dark [style*="color: #059669"], body.dark [style*="color: rgb(5, 150, 105)"],
body.dark [style*="color:#155724"], body.dark [style*="color:rgb(21, 87, 36)"], body.dark [style*="color: #155724"], body.dark [style*="color: rgb(21, 87, 36)"],
body.dark [style*="color:#14532d"], body.dark [style*="color:rgb(20, 83, 45)"], body.dark [style*="color: #14532d"], body.dark [style*="color: rgb(20, 83, 45)"],
body.dark [style*="color:#065f46"], body.dark [style*="color:rgb(6, 95, 70)"], body.dark [style*="color: #065f46"], body.dark [style*="color: rgb(6, 95, 70)"],
body.dark [style*="color:#064e3b"], body.dark [style*="color:rgb(6, 78, 59)"], body.dark [style*="color: #064e3b"], body.dark [style*="color: rgb(6, 78, 59)"] { color:#86efac !important; }
/* teal (marca ACN — 0f766e é usado ~80x como texto) */
body.dark [style*="color:#0f766e"], body.dark [style*="color:rgb(15, 118, 110)"], body.dark [style*="color: #0f766e"], body.dark [style*="color: rgb(15, 118, 110)"],
body.dark [style*="color:#0891b2"], body.dark [style*="color:rgb(8, 145, 178)"], body.dark [style*="color: #0891b2"], body.dark [style*="color: rgb(8, 145, 178)"],
body.dark [style*="color:#0e7490"], body.dark [style*="color:rgb(14, 116, 144)"], body.dark [style*="color: #0e7490"], body.dark [style*="color: rgb(14, 116, 144)"],
body.dark [style*="color:#0d9488"], body.dark [style*="color:rgb(13, 148, 136)"], body.dark [style*="color: #0d9488"], body.dark [style*="color: rgb(13, 148, 136)"] { color:#2dd4bf !important; }
/* azul */
body.dark [style*="color:#2563eb"], body.dark [style*="color:rgb(37, 99, 235)"], body.dark [style*="color: #2563eb"], body.dark [style*="color: rgb(37, 99, 235)"],
body.dark [style*="color:#0369a1"], body.dark [style*="color:rgb(3, 105, 161)"], body.dark [style*="color: #0369a1"], body.dark [style*="color: rgb(3, 105, 161)"],
body.dark [style*="color:#1d4ed8"], body.dark [style*="color:rgb(29, 78, 216)"], body.dark [style*="color: #1d4ed8"], body.dark [style*="color: rgb(29, 78, 216)"],
body.dark [style*="color:#3b82f6"], body.dark [style*="color:rgb(59, 130, 246)"], body.dark [style*="color: #3b82f6"], body.dark [style*="color: rgb(59, 130, 246)"],
body.dark [style*="color:#1e3a5f"], body.dark [style*="color:rgb(30, 58, 95)"], body.dark [style*="color: #1e3a5f"], body.dark [style*="color: rgb(30, 58, 95)"],
body.dark [style*="color:#1e3a8a"], body.dark [style*="color:rgb(30, 58, 138)"], body.dark [style*="color: #1e3a8a"], body.dark [style*="color: rgb(30, 58, 138)"],
body.dark [style*="color:#0ea5e9"], body.dark [style*="color:rgb(14, 165, 233)"], body.dark [style*="color: #0ea5e9"], body.dark [style*="color: rgb(14, 165, 233)"] { color:#93c5fd !important; }
/* índigo */
body.dark [style*="color:#6366f1"], body.dark [style*="color:rgb(99, 102, 241)"], body.dark [style*="color: #6366f1"], body.dark [style*="color: rgb(99, 102, 241)"],
body.dark [style*="color:#1e40af"], body.dark [style*="color:rgb(30, 64, 175)"], body.dark [style*="color: #1e40af"], body.dark [style*="color: rgb(30, 64, 175)"],
body.dark [style*="color:#4f46e5"], body.dark [style*="color:rgb(79, 70, 229)"], body.dark [style*="color: #4f46e5"], body.dark [style*="color: rgb(79, 70, 229)"],
body.dark [style*="color:#4338ca"], body.dark [style*="color:rgb(67, 56, 202)"], body.dark [style*="color: #4338ca"], body.dark [style*="color: rgb(67, 56, 202)"],
body.dark [style*="color:#3730a3"], body.dark [style*="color:rgb(55, 48, 163)"], body.dark [style*="color: #3730a3"], body.dark [style*="color: rgb(55, 48, 163)"] { color:#c7d2fe !important; }
/* roxo */
body.dark [style*="color:#7c3aed"], body.dark [style*="color:rgb(124, 58, 237)"], body.dark [style*="color: #7c3aed"], body.dark [style*="color: rgb(124, 58, 237)"],
body.dark [style*="color:#6d28d9"], body.dark [style*="color:rgb(109, 40, 217)"], body.dark [style*="color: #6d28d9"], body.dark [style*="color: rgb(109, 40, 217)"],
body.dark [style*="color:#7c6f9c"], body.dark [style*="color:rgb(124, 111, 156)"], body.dark [style*="color: #7c6f9c"], body.dark [style*="color: rgb(124, 111, 156)"],
body.dark [style*="color:#4c1d95"], body.dark [style*="color:rgb(76, 29, 149)"], body.dark [style*="color: #4c1d95"], body.dark [style*="color: rgb(76, 29, 149)"],
body.dark [style*="color:#a21caf"], body.dark [style*="color:rgb(162, 28, 175)"], body.dark [style*="color: #a21caf"], body.dark [style*="color: rgb(162, 28, 175)"],
body.dark [style*="color:#8b5cf6"], body.dark [style*="color:rgb(139, 92, 246)"], body.dark [style*="color: #8b5cf6"], body.dark [style*="color: rgb(139, 92, 246)"],
body.dark [style*="color:#6b21a8"], body.dark [style*="color:rgb(107, 33, 168)"], body.dark [style*="color: #6b21a8"], body.dark [style*="color: rgb(107, 33, 168)"] { color:#c4b5fd !important; }

/* ──────────────────────────────────────────────────────────────────
   DARK MODE: inline style overrides — fundos claros → escuros
   Cobertos: background (shorthand) e background-color (React camelCase)
   ────────────────────────────────────────────────────────────────── */

/* ① Brancos/quase-brancos → fundo escuro com texto claro */
body.dark [style*="background:#fff"], body.dark [style*="background:rgb(255, 255, 255)"],            body.dark [style*="background: #fff"], body.dark [style*="background: rgb(255, 255, 255)"],
body.dark [style*="background-color:#fff"], body.dark [style*="background-color:rgb(255, 255, 255)"],      body.dark [style*="background-color: #fff"], body.dark [style*="background-color: rgb(255, 255, 255)"],
body.dark [style*="background:white"],           body.dark [style*="background: white"],
body.dark [style*="background-color:white"],     body.dark [style*="background-color: white"],
body.dark [style*="background:#ffffff"],         body.dark [style*="background: #ffffff"],
body.dark [style*="background-color:#ffffff"],   body.dark [style*="background-color: #ffffff"],
body.dark [style*="background:#f8fafc"], body.dark [style*="background:rgb(248, 250, 252)"],         body.dark [style*="background: #f8fafc"], body.dark [style*="background: rgb(248, 250, 252)"],
body.dark [style*="background-color:#f8fafc"], body.dark [style*="background-color:rgb(248, 250, 252)"],   body.dark [style*="background-color: #f8fafc"], body.dark [style*="background-color: rgb(248, 250, 252)"],
body.dark [style*="background:#f9fafb"], body.dark [style*="background:rgb(249, 250, 251)"],         body.dark [style*="background: #f9fafb"], body.dark [style*="background: rgb(249, 250, 251)"],
body.dark [style*="background-color:#f9fafb"], body.dark [style*="background-color:rgb(249, 250, 251)"],   body.dark [style*="background-color: #f9fafb"], body.dark [style*="background-color: rgb(249, 250, 251)"] { background:#1e293b !important; color:#cbd5e1 !important; }

/* ② Cinzas claros → fundo escuro médio */
body.dark [style*="background:#f1f5f9"], body.dark [style*="background:rgb(241, 245, 249)"],         body.dark [style*="background: #f1f5f9"], body.dark [style*="background: rgb(241, 245, 249)"],
body.dark [style*="background-color:#f1f5f9"], body.dark [style*="background-color:rgb(241, 245, 249)"],   body.dark [style*="background-color: #f1f5f9"], body.dark [style*="background-color: rgb(241, 245, 249)"],
body.dark [style*="background:#f0f9ff"], body.dark [style*="background:rgb(240, 249, 255)"],         body.dark [style*="background: #f0f9ff"], body.dark [style*="background: rgb(240, 249, 255)"],
body.dark [style*="background:#fafbfc"], body.dark [style*="background:rgb(250, 251, 252)"],         body.dark [style*="background: #fafbfc"], body.dark [style*="background: rgb(250, 251, 252)"],
body.dark [style*="background:#f4f6f9"], body.dark [style*="background:rgb(244, 246, 249)"],         body.dark [style*="background: #f4f6f9"], body.dark [style*="background: rgb(244, 246, 249)"],
body.dark [style*="background-color:#f4f6f9"], body.dark [style*="background-color:rgb(244, 246, 249)"],   body.dark [style*="background-color: #f4f6f9"], body.dark [style*="background-color: rgb(244, 246, 249)"],
body.dark [style*="background:#f0fdfa"], body.dark [style*="background:rgb(240, 253, 250)"],         body.dark [style*="background: #f0fdfa"], body.dark [style*="background: rgb(240, 253, 250)"],
body.dark [style*="background-color:#f0fdfa"], body.dark [style*="background-color:rgb(240, 253, 250)"],   body.dark [style*="background-color: #f0fdfa"], body.dark [style*="background-color: rgb(240, 253, 250)"] { background:#162032 !important; color:#cbd5e1 !important; }

/* ③ Cinza-borda (#e2e8f0) — comum em botões desabilitados e cards → slate escuro */
body.dark [style*="background:#e2e8f0"], body.dark [style*="background:rgb(226, 232, 240)"],         body.dark [style*="background: #e2e8f0"], body.dark [style*="background: rgb(226, 232, 240)"],
body.dark [style*="background-color:#e2e8f0"], body.dark [style*="background-color:rgb(226, 232, 240)"],   body.dark [style*="background-color: #e2e8f0"], body.dark [style*="background-color: rgb(226, 232, 240)"],
body.dark [style*="background:#e8ecf0"], body.dark [style*="background:rgb(232, 236, 240)"],         body.dark [style*="background: #e8ecf0"], body.dark [style*="background: rgb(232, 236, 240)"],
body.dark [style*="background:#eef2f6"], body.dark [style*="background:rgb(238, 242, 246)"],         body.dark [style*="background: #eef2f6"], body.dark [style*="background: rgb(238, 242, 246)"] { background:#334155 !important; color:#94a3b8 !important; }

/* ④ Fundos coloridos claros */
body.dark [style*="background:#eff6ff"], body.dark [style*="background:rgb(239, 246, 255)"],  body.dark [style*="background: #eff6ff"], body.dark [style*="background: rgb(239, 246, 255)"],
body.dark [style*="background-color:#eff6ff"], body.dark [style*="background-color:rgb(239, 246, 255)"] { background:#1e3a5f !important; color:#93c5fd !important; }
body.dark [style*="background:#dbeafe"], body.dark [style*="background:rgb(219, 234, 254)"],  body.dark [style*="background: #dbeafe"], body.dark [style*="background: rgb(219, 234, 254)"],
body.dark [style*="background-color:#dbeafe"], body.dark [style*="background-color:rgb(219, 234, 254)"] { background:#1e3a5f !important; color:#93c5fd !important; }
body.dark [style*="background:#f5f3ff"], body.dark [style*="background:rgb(245, 243, 255)"],  body.dark [style*="background: #f5f3ff"], body.dark [style*="background: rgb(245, 243, 255)"],
body.dark [style*="background-color:#f5f3ff"], body.dark [style*="background-color:rgb(245, 243, 255)"] { background:#2d1b5c !important; color:#c4b5fd !important; }
body.dark [style*="background:#f0fdf4"], body.dark [style*="background:rgb(240, 253, 244)"],  body.dark [style*="background: #f0fdf4"], body.dark [style*="background: rgb(240, 253, 244)"],
body.dark [style*="background-color:#f0fdf4"], body.dark [style*="background-color:rgb(240, 253, 244)"] { background:#0d2818 !important; color:#86efac !important; }
body.dark [style*="background:#fffbeb"], body.dark [style*="background:rgb(255, 251, 235)"],  body.dark [style*="background: #fffbeb"], body.dark [style*="background: rgb(255, 251, 235)"],
body.dark [style*="background-color:#fffbeb"], body.dark [style*="background-color:rgb(255, 251, 235)"] { background:#1c1505 !important; color:#fde68a !important; }
body.dark [style*="background:#fef3c7"], body.dark [style*="background:rgb(254, 243, 199)"],  body.dark [style*="background: #fef3c7"], body.dark [style*="background: rgb(254, 243, 199)"],
body.dark [style*="background-color:#fef3c7"], body.dark [style*="background-color:rgb(254, 243, 199)"] { background:#1c1505 !important; color:#fde68a !important; }
body.dark [style*="background:#fef2f2"], body.dark [style*="background:rgb(254, 242, 242)"],  body.dark [style*="background: #fef2f2"], body.dark [style*="background: rgb(254, 242, 242)"],
body.dark [style*="background:#fff5f5"], body.dark [style*="background:rgb(255, 245, 245)"],  body.dark [style*="background: #fff5f5"], body.dark [style*="background: rgb(255, 245, 245)"],
body.dark [style*="background:#fee2e2"], body.dark [style*="background:rgb(254, 226, 226)"],  body.dark [style*="background: #fee2e2"], body.dark [style*="background: rgb(254, 226, 226)"],
body.dark [style*="background-color:#fee2e2"], body.dark [style*="background-color:rgb(254, 226, 226)"] { background:#2d0a0a !important; color:#fca5a5 !important; }
body.dark [style*="background:#fff7ed"], body.dark [style*="background:rgb(255, 247, 237)"],  body.dark [style*="background: #fff7ed"], body.dark [style*="background: rgb(255, 247, 237)"],
body.dark [style*="background-color:#fff7ed"], body.dark [style*="background-color:rgb(255, 247, 237)"] { background:#1c1505 !important; color:#fdba74 !important; }

/* ──────────────────────────────────────────────────────────────────
   DARK MODE: bordas claras → escuras
   ────────────────────────────────────────────────────────────────── */
body.dark [style*="border:1px solid #e2e8f0"], body.dark [style*="border:1px solid rgb(226, 232, 240)"], body.dark [style*="border: 1px solid #e2e8f0"], body.dark [style*="border: 1px solid rgb(226, 232, 240)"],
body.dark [style*="border:1px solid #d1d5db"], body.dark [style*="border:1px solid rgb(209, 213, 219)"], body.dark [style*="border: 1px solid #d1d5db"], body.dark [style*="border: 1px solid rgb(209, 213, 219)"],
body.dark [style*="border:1px solid #e8ecf0"], body.dark [style*="border:1px solid rgb(232, 236, 240)"], body.dark [style*="border: 1px solid #e8ecf0"], body.dark [style*="border: 1px solid rgb(232, 236, 240)"],
body.dark [style*="border:1px solid #e0e0e0"], body.dark [style*="border:1px solid rgb(224, 224, 224)"], body.dark [style*="border: 1px solid #e0e0e0"], body.dark [style*="border: 1px solid rgb(224, 224, 224)"],
body.dark [style*="border:1.5px solid #e2e8f0"], body.dark [style*="border:1.5px solid rgb(226, 232, 240)"], body.dark [style*="border: 1.5px solid #e2e8f0"], body.dark [style*="border: 1.5px solid rgb(226, 232, 240)"],
body.dark [style*="borderBottom:1px solid #e2e8f0"], body.dark [style*="borderBottom:1px solid rgb(226, 232, 240)"], body.dark [style*="border-bottom:1px solid #e2e8f0"], body.dark [style*="border-bottom:1px solid rgb(226, 232, 240)"],
body.dark [style*="borderTop:1px solid #e2e8f0"], body.dark [style*="borderTop:1px solid rgb(226, 232, 240)"], body.dark [style*="border-top:1px solid #e2e8f0"], body.dark [style*="border-top:1px solid rgb(226, 232, 240)"] { border-color:#334155 !important; }

/* ──────────────────────────────────────────────────────────────────
   DARK MODE: herança de cor em elementos filhos
   ────────────────────────────────────────────────────────────────── */
body.dark .acn-main table td strong,
body.dark .acn-main table td span:not(.acn-badge),
body.dark .acn-main table td p,
body.dark .acn-main table td div { color:inherit !important; }
body.dark .sec-body p,
body.dark .sec-body span:not(.acn-badge),
body.dark .sec-body strong { color:inherit !important; }
body.dark .modal-box p,
body.dark .modal-box span:not(.acn-badge),
body.dark .modal-box strong,
body.dark .modal-box label { color:inherit !important; }

/* Badges e botões coloridos: texto sempre branco (exceto acn-tab-btn que tem cor própria) */
body.dark .acn-badge { color:white !important; }
body.dark .acn-btn:not(.acn-tab-btn) { color:white !important; }
/* Links de anexo */
body.dark a[style*="color:#2563eb"], body.dark a[style*="color:rgb(37, 99, 235)"] { color:#60a5fa !important; }
`;

export default function DashboardTab({ currentUser: currentUserProp, onLogout }: Props) {
  // currentUser pode não ter campos novos (localStorage antigo) — recarrega do banco
  const [currentUser, setCurrentUser] = useState<any>(currentUserProp);

  // "Ver como" (AdminTab.tsx > Painel de Usuários): quando o admin está
  // visualizando o sistema com a sessão de outro usuário, admin_sessao_original
  // guarda a sessão real dele pra poder voltar.
  const [sessaoOriginalAdmin] = useState<string | null>(() => {
    try { return localStorage.getItem('admin_sessao_original'); } catch { return null; }
  });
  const voltarParaAdmin = () => {
    try {
      const orig = localStorage.getItem('admin_sessao_original');
      if (!orig) return;
      localStorage.setItem('user', orig);
      localStorage.removeItem('admin_sessao_original');
    } catch (_) {}
    window.location.href = window.location.origin + import.meta.env.BASE_URL;
  };

  useEffect(() => {
    if (!currentUserProp?.id) return;
    supabase.from('auth_usuarios')
      .select('id,email,nome,perfil,abas_permitidas,pode_autorizar_rh,permissoes_crm,permissoes_rh,recebe_alerta_analise')
      .eq('id', currentUserProp.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const merged = { ...currentUserProp, ...data };
        setCurrentUser(merged);
        // Atualiza localStorage para próximo login não precisar recarregar
        try { localStorage.setItem('user', JSON.stringify(merged)); } catch(_) {}
      });
  }, [currentUserProp?.id]);

  const [activeTab, setActiveTab]       = useState('dashboard');
  const [pendingOpenLicitId, setPendingOpenLicitId] = useState<string|null>(null);
  const [pendingOpenCrmId, setPendingOpenCrmId]     = useState<string|null>(null);

  // ── Busca Global ──────────────────────────────────────────────────────────
  const [globalBusca, setGlobalBusca]           = useState('');
  const [globalResultados, setGlobalResultados] = useState<any[]>([]);
  const [globalBuscando, setGlobalBuscando]     = useState(false);
  const [showGlobalRes, setShowGlobalRes]       = useState(false);
  const [globalOplAberto, setGlobalOplAberto]   = useState<any|null>(null);
  const globalDebounce = useRef<any>(null);
  const globalBarRef   = useRef<any>(null);
  const [dark, setDark] = useState(() => localStorage.getItem('acn-dark') === '1');
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  // Celular: busca abre numa faixa abaixo do cabeçalho; nome/senha/sair num menu (ver responsivo.css)
  const [buscaMobile, setBuscaMobile]   = useState(false);
  const [menuUsuario, setMenuUsuario]   = useState(false);
  const [sectionsCollapsed, setSectionsCollapsed] = useState<Set<string>>(new Set());
  const [waNotifCount, setWaNotifCount] = useState(0);
  // Pendências de análise técnica por setor — contador no menu das abas que
  // têm o quadro de análises (Engenharia, Produção). Tempo real + a cada 60s.
  const [analisesPorSetor, setAnalisesPorSetor] = useState<Record<string, number>>({});
  useEffect(() => {
    const atualizar = () => contarAnalisesPendentesPorSetor().then(setAnalisesPorSetor).catch(() => {});
    atualizar();
    const iv = setInterval(atualizar, 60000);
    const ch = supabase.channel('menu-analises-pendentes')
      .on('postgres_changes', { event:'*', schema:'public', table:'analise_setores' }, atualizar)
      .on('postgres_changes', { event:'*', schema:'public', table:'analise_solicitacoes' }, atualizar)
      .subscribe();
    return () => { clearInterval(iv); supabase.removeChannel(ch); };
  }, []);
  const [analiseAlertCount, setAnaliseAlertCount] = useState(0);
  const [showAnalisePanel, setShowAnalisePanel] = useState(false);
  const [mencoesCount, setMencoesCount]         = useState(0);
  const [showMencoesPanel, setShowMencoesPanel] = useState(false);
  const [avisosOpCount, setAvisosOpCount]       = useState(0);
  const [showAvisosOp, setShowAvisosOp]         = useState(false);
  // Compras (e Almoxarifado, nas entregas atrasadas): o botão Avisos mostra os alertas de compras
  const usaAlertasCompras = ['Compras', 'Almoxarifado'].includes(currentUser?.perfil);
  const [alertasCompras, setAlertasCompras]     = useState<any[]>([]);
  const [showAlertasCompras, setShowAlertasCompras] = useState(false);

  // Ctrl+K (ou ⌘K) leva direto para a busca geral
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const campo = globalBarRef.current?.querySelector('input');
        if (campo) { setBuscaMobile(true); setTimeout(() => campo.focus(), 30); }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Fecha dropdown de busca ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (globalBarRef.current && !globalBarRef.current.contains(e.target as Node)) {
        setShowGlobalRes(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Escuta contagem de msgs WA não lidas emitida pelo ContactosSection
  useEffect(() => {
    const handler = (e: any) => setWaNotifCount(e.detail?.count || 0);
    window.addEventListener('crm:wa-unread-count', handler);
    return () => window.removeEventListener('crm:wa-unread-count', handler);
  }, []);

  // Badge de análises — para todos; conta só o que é do(s) setor(es) da pessoa
  useEffect(() => {
    if (!currentUser?.id) return;
    const fetchAnalise = async () => {
      try { setAnaliseAlertCount(await contarAnalisesDoUsuario(currentUser)); } catch(_) {}
    };
    fetchAnalise();
    const iv = setInterval(fetchAnalise, 60000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.perfil, currentUser?.recebe_alerta_analise]);

  // Badge de menções — contagem de menções PENDENTES (não resolvidas, não só
  // não lidas — "lida" só significa "vista", "resolvida" é o que de fato tira
  // a pendência da frente do usuário).
  useEffect(() => {
    if (!currentUser?.id) return;
    const fetchMencoes = async () => {
      try {
        // Busca por id E por nome (fallback p/ usuários com id trocado após recriação),
        // mesmo critério usado no MencoesInboxPanel — mantém badge e painel consistentes.
        const uid  = String(currentUser.id || '');
        const nome = String(currentUser.nome || '');
        let orFilter = `mencionado_id.eq.${uid}`;
        if (nome) orFilter += `,mencionado_nome.ilike.%${nome}%`;
        const { count } = await supabase
          .from('mencoes')
          .select('id', { count: 'exact', head: true })
          .or(orFilter)
          .neq('contexto', 'op_adaptacao')   // avisos de OP têm botão próprio
          .eq('resolvida', false);
        setMencoesCount(count || 0);
        setAvisosOpCount(await contarAvisosOp(currentUser));
      } catch { /* mencoes table may not exist yet */ }
    };
    fetchMencoes();
    const iv = setInterval(fetchMencoes, 30000);
    return () => clearInterval(iv);
  }, [currentUser?.id]);

  // Alertas de Compras: parados (48h/24h úteis) e entregas atrasadas
  const recarregarAlertasCompras = React.useCallback(async () => {
    if (!usaAlertasCompras) return;
    try {
      const todos = await carregarAlertasCompras();
      setAlertasCompras(alertasDoUsuario(todos, currentUser));
      dispararMencoesEntrega(todos, currentUser);
    } catch (e) { console.warn('Falha ao carregar alertas de compras:', e); }
  }, [usaAlertasCompras, currentUser?.email, currentUser?.perfil]);
  useEffect(() => {
    if (!usaAlertasCompras) return;
    recarregarAlertasCompras();
    const iv = setInterval(recarregarAlertasCompras, 120000);
    const foco = () => recarregarAlertasCompras();
    window.addEventListener('focus', foco);
    return () => { clearInterval(iv); window.removeEventListener('focus', foco); };
  }, [recarregarAlertasCompras]);

  // ── Collapse global: clique em qualquer .sec-hdr colapsa/expande o .sec-card pai ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const hdr = (e.target as HTMLElement).closest('.sec-hdr');
      if (!hdr) return;
      // Não colapsa se o clique foi em botão ou input dentro do header
      if ((e.target as HTMLElement).closest('button,input,select,a')) return;
      const card = hdr.closest('.sec-card');
      if (card) card.classList.toggle('sec-collapsed');
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  // Navegação cross-tab vinda do CRM
  useEffect(() => {
    const handler = () => setActiveTab('sac');
    window.addEventListener('crm:navegar-sac', handler);
    return () => window.removeEventListener('crm:navegar-sac', handler);
  }, []);

  // Navegação cross-tab: Telecom → Licitações ou CRM (abre card específico)
  useEffect(() => {
    const handler = (e: any) => {
      const { origem, origemId } = e.detail || {};
      if (!origemId) return;
      if (origem === 'crm') {
        // Processos novos ficam em crm_oportunidades (funil = 'licitacao' ou 'venda_direta')
        setPendingOpenCrmId(origemId);
        setActiveTab('crm');
      } else if (origem === 'licitacao') {
        // Compatibilidade com processos antigos na tabela licitacoes
        setPendingOpenLicitId(origemId);
        setActiveTab('licitacoes');
      }
    };
    window.addEventListener('analise:abrir-origem', handler);
    return () => window.removeEventListener('analise:abrir-origem', handler);
  }, []);

  // Troca de aba genérica disparada por VinculoPicker.tsx's abrirVinculo() —
  // usado pelo vínculo opcional (OP/OS/PV/Compra/OFI) das Demandas Avulsas.
  // Só troca a aba; quem escuta 'acn:abrir-registro' na aba de destino (já
  // roteada aqui embaixo) cuida de abrir o registro específico.
  useEffect(() => {
    const handler = (e: any) => {
      const { aba } = e.detail || {};
      if (aba) setActiveTab(aba);
    };
    window.addEventListener('acn:trocar-aba', handler);
    return () => window.removeEventListener('acn:trocar-aba', handler);
  }, []);

  // Trocar senha
  const [modalSenha, setModalSenha] = useState(!!currentUser?.primeiro_acesso);
  const [senhaForm, setSenhaForm]   = useState({ atual:'', nova:'', confirmar:'' });
  const [senhaMsg, setSenhaMsg]     = useState('');
  const [senhaLoading, setSenhaLoading] = useState(false);

  const salvarSenha = async () => {
    setSenhaMsg('');
    if (!senhaForm.nova || senhaForm.nova.length < 4) { setSenhaMsg('error:Mínimo 4 caracteres.'); return; }
    if (senhaForm.nova !== senhaForm.confirmar) { setSenhaMsg('error:As senhas não coincidem.'); return; }
    setSenhaLoading(true);
    try {
      // Verifica senha atual no banco (exceto primeiro acesso)
      if (!currentUser?.primeiro_acesso) {
        const { data } = await supabase.from('auth_usuarios').select('senha').eq('id', currentUser.id).single();
        if (data?.senha !== senhaForm.atual) { setSenhaMsg('error:Senha atual incorreta.'); setSenhaLoading(false); return; }
      }
      const { error } = await supabase.from('auth_usuarios')
        .update({ senha: senhaForm.nova, primeiro_acesso: false, senha_temp: null, senha_temp_expiry: null })
        .eq('id', currentUser.id);
      if (error) throw error;
      // Atualiza localStorage
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, primeiro_acesso: false }));
      setSenhaMsg('ok:Senha alterada com sucesso!');
      setTimeout(() => { setModalSenha(false); setSenhaForm({ atual:'', nova:'', confirmar:'' }); setSenhaMsg(''); }, 1500);
    } catch (e: any) {
      setSenhaMsg('error:Erro: ' + e.message);
    } finally {
      setSenhaLoading(false);
    }
  };

  useEffect(() => {
    document.body.classList.toggle('dark', dark);
    localStorage.setItem('acn-dark', dark ? '1' : '0');
  }, [dark]);

  const [realizados, setRealizados] = useState<Record<string, number | null>>({});
  const chartRef  = useRef<Chart | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => { buscarRealizados(); }, []);

  const buscarRealizados = async () => {
    try {
      // Métricas baseadas em oples (fluxo OPL)
      const METRICAS_OPL = ['engenharia','pcp','producao','qualidade','logistica','fiscal'];
      const camposOpl = METRICAS_CONFIG
        .filter(m => METRICAS_OPL.includes(m.key))
        .map(m => m.campo).join(', ');

      // Métricas baseadas em demandas_setoriais (setores de apoio)
      const SETOR_MAP: Record<string, string> = {
        chicotes:     'Chicotes',
        serralheria:  'Serralheria',
        laboratorio:  'Laboratorio',
        compras:      'Compras',
        almoxarifado: 'Almoxarifado',
      };

      const [oplsRes, demandasRes] = await Promise.all([
        supabase.from('oples').select(camposOpl),
        supabase.from('demandas_setoriais')
          .select('setor_destino, tempo_execucao_horas')
          .eq('status', 'Concluido')
          .gt('tempo_execucao_horas', 0),
      ]);

      const medias: Record<string, number | null> = {};

      // Calcula médias OPL
      if (oplsRes.data && oplsRes.data.length > 0) {
        METRICAS_CONFIG.filter(m => METRICAS_OPL.includes(m.key)).forEach(m => {
          const vals = (oplsRes.data as any[]).map(r => r[m.campo]).filter(v => v != null && v > 0);
          medias[m.key] = vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
        });
      }

      // Calcula médias por setor (demandas_setoriais)
      const demandasData = demandasRes.data || [];
      Object.entries(SETOR_MAP).forEach(([key, setorNome]) => {
        const vals = demandasData
          .filter((d: any) => d.setor_destino === setorNome)
          .map((d: any) => Number(d.tempo_execucao_horas))
          .filter(v => v > 0);
        medias[key] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      });

      setRealizados(medias);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (activeTab !== 'dashboard' || !canvasRef.current) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: METRICAS_CONFIG.map(m => m.nome),
        datasets: [
          { label: 'Meta',       data: METRICAS_CONFIG.map(m => m.meta),                       borderColor:'#1b7f43', borderDash:[5,5], fill:false, type:'line', pointRadius:0, tension:0 } as any,
          { label: 'Tolerância', data: METRICAS_CONFIG.map(m => m.tol),                        borderColor:'#9a5708', borderDash:[5,5], fill:false, type:'line', pointRadius:0, tension:0 } as any,
          { label: 'Realizado',  data: METRICAS_CONFIG.map(m => realizados[m.key] ?? 0),       backgroundColor:'#0e7068', borderColor:'#0a5c55', borderWidth:0, borderRadius:4, maxBarThickness:36 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', align: 'end', labels: { font: { size: 12, family: "'IBM Plex Sans', sans-serif" }, boxWidth: 12, color: '#6b7886' } } },
        scales:  {
          x: { grid: { display: false }, ticks: { font: { size: 11, family: "'IBM Plex Sans', sans-serif" }, color: '#6b7886' } },
          y: { beginAtZero: true, grid: { color: '#edf1f4' }, border: { display: false },
               ticks: { font: { size: 11, family: "'IBM Plex Sans', sans-serif" }, color: '#6b7886' },
               title: { display: true, text: 'Horas', font: { size: 12, family: "'IBM Plex Sans', sans-serif" }, color: '#6b7886' } },
        },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [activeTab, realizados]);

  const getStatus = (real: number | null, meta: number, tol: number) => {
    if (real == null) return { label: 'Sem dados', cls: 'st-sem-dados' };
    if (real <= meta)  return { label: 'NO PRAZO',  cls: 'st-ok' };
    if (real <= tol)   return { label: 'ATENCAO',   cls: 'st-warn' };
    return { label: 'CRITICO', cls: 'st-crit' };
  };

  const isVisible = (id: string) => {
    if (id === 'comissoes_tecnicos') {
      // Acesso restrito: só aparece pra quem NÃO tem a aba "RH" inteira (que
      // já mostra Comissões dentro, inclusive Admin) mas tem essa permissão
      // específica — checado ANTES do bypass geral de Admin, de propósito.
      const abas = currentUser?.abas_permitidas;
      const temAbaCompleta = currentUser?.perfil === 'Admin'
        || (Array.isArray(abas) && abas.length > 0 ? abas.includes('rh') : true);
      if (temAbaCompleta) return false;
      return Array.isArray(currentUser?.permissoes_rh) && currentUser.permissoes_rh.includes('comissoes_tecnicos');
    }
    if (currentUser?.perfil === 'Admin') return true;
    if (id === 'dashboard') return true;
    // Painel de TV e so leitura e serve a producao inteira (gerente e tecnicos),
    // entao fica visivel a todos, independente das abas liberadas.
    if (id === 'painel_tv') return true;
    const abas = currentUser?.abas_permitidas;
    if (!abas || !Array.isArray(abas) || abas.length === 0) return true;
    return abas.includes(id);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'calendario':   return <CalendarioTab currentUser={currentUser} />;
      case 'engenharia':   return <EngenhariaTab currentUser={currentUser} />;
      case 'telecom':      return <SetorDemandaTab currentUser={currentUser} setor="Telecom" cor="#0891b2" />;
      case 'ajustes':      return <AjustesProjetoTab currentUser={currentUser} />;
      case 'pcp':          return <PCPTab currentUser={currentUser} />;
      case 'serralheria':  return <SetorDemandaTab currentUser={currentUser} setor="Serralheria" cor="#ea580c" />;
      case 'chicotes':     return <SetorDemandaTab currentUser={currentUser} setor="Chicotes" cor="#7c3aed" />;
      case 'laboratorio':  return <SetorDemandaTab currentUser={currentUser} setor="Laboratorio" cor="#0891b2" />;
      case 'compras':         return <><SetorDemandaTab currentUser={currentUser} setor="Compras" cor="#16a34a" /><ComprasTab currentUser={currentUser} /></>;
      case 'financeiro':      return <FinanceiroTab currentUser={currentUser} />;
      case 'cadastro_itens':    return <CadastroItensTab currentUser={currentUser} />;
      case 'cadastro_produtos': return <CadastroProdutosTab currentUser={currentUser} />;
      case 'almoxarifado': return <AlmoxarifadoTab currentUser={currentUser} />;
      case 'producao':     return <ProducaoTab currentUser={currentUser} />;
      case 'painel_tv':    return <PainelProducaoTV />;
      case 'qualidade':    return <QualidadeTab currentUser={currentUser} />;
      case 'logistica':    return <LogisticaTab currentUser={currentUser} />;
      case 'vistorias':    return <VistoriasPatio currentUser={currentUser} />;
      case 'marketing':    return <MarketingTab currentUser={currentUser} />;
      case 'sac':          return <SacTab currentUser={currentUser} />;
      case 'nfc':          return <VeiculosNfcTab currentUser={currentUser} />;
      case 'clientes':     return <ClientesTab currentUser={currentUser} />;
      case 'crm':          return <CrmTab currentUser={currentUser} autoOpenOpId={pendingOpenCrmId} onAutoOpenConsumed={() => setPendingOpenCrmId(null)} />;
      case 'cotacoes':     return <CotacoesTab currentUser={currentUser} onAbrirCrmCard={(id) => { setPendingOpenCrmId(id); setActiveTab('crm'); }} />;
      case 'licitacoes':   return <LicitacoesTab currentUser={currentUser} autoOpenLicitId={pendingOpenLicitId} onAutoOpenConsumed={() => setPendingOpenLicitId(null)} />;
      case 'rh':           return <RHTab currentUser={currentUser} />;
      case 'comissoes_tecnicos': return <ComissoesTecnicosStandalone currentUser={currentUser} />;
      case 'fiscal':       return <FiscalTab currentUser={currentUser} />;
      case 'relatorios':      return <RelatoriosTab currentUser={currentUser} />;
      case 'formacao_precos': return <FormacaoPrecosTab currentUser={currentUser} />;
      case 'admin':           return <AdminTab />;
      default: return null;
    }
  };

  // ── Helpers busca global ──────────────────────────────────────────────────
  const hilite = (text: string, termo: string) => {
    if (!text || !termo) return text || '—';
    const s = String(text);
    // normalizarBusca preserva o tamanho/posição da string original pra
    // caracteres acentuados comuns do português (confirmado: NFD decompõe 1
    // caractere acentuado em base+marca, e a marca removida é exatamente o
    // que o NFD acrescentou) — então o índice encontrado no texto
    // normalizado aponta certo pro texto original, com acento e tudo.
    const idx = normalizarBusca(s).indexOf(normalizarBusca(termo));
    if (idx === -1) return s;
    return (
      <>{s.slice(0, idx)}<mark style={{ background:'#fef08a', padding:0, borderRadius:2, fontWeight:700 }}>{s.slice(idx, idx + termo.length)}</mark>{s.slice(idx + termo.length)}</>
    );
  };

  const getContexto = (r: any, termo: string): { campo: string; valor: string } | null => {
    const t = normalizarBusca(termo);
    const chk = (v: string) => v && normalizarBusca(v).includes(t);
    if (r._tipo === 'crm') {
      if (chk(r.numero_edital)) return { campo: 'Edital', valor: r.numero_edital };
      if (chk(r.orgao))         return { campo: 'Órgão',  valor: r.orgao };
      if (chk(r.responsavel_nome)) return { campo: 'Responsável', valor: r.responsavel_nome };
    } else if (r._tipo === 'opl') {
      if (chk(r.cliente_nome)) return { campo: 'Cliente', valor: r.cliente_nome };
      if (chk(r.veiculo))      return { campo: 'Veículo', valor: r.veiculo };
      if (chk(r.modelo))       return { campo: 'Modelo',  valor: r.modelo };
    } else if (r._tipo === 'os') {
      if (chk(r.cliente_nome))     return { campo: 'Cliente',     valor: r.cliente_nome };
      if (chk(r.veiculo_modelo))   return { campo: 'Veículo',     valor: r.veiculo_modelo };
      if (chk(r.equipamento_nome)) return { campo: 'Equipamento', valor: r.equipamento_nome };
    } else if (r._tipo === 'licitacao') {
      if (chk(r.orgao))  return { campo: 'Órgão',  valor: r.orgao };
      if (chk(r.numero)) return { campo: 'Número', valor: r.numero };
    } else if (r._tipo === 'item') {
      if (chk(r.codigo))    return { campo: 'Código',     valor: r.codigo };
      if (chk(r.marca))     return { campo: 'Marca',      valor: r.marca };
      if (chk(r.fornecedor))return { campo: 'Fornecedor', valor: r.fornecedor };
    } else if (r._tipo === 'produto') {
      if (chk(r.codigo))    return { campo: 'Código',    valor: r.codigo };
      if (chk(r.categoria)) return { campo: 'Categoria', valor: r.categoria };
    } else if (r._tipo === 'engenharia') {
      if (chk(r.numero_opl))   return { campo: 'OPL',      valor: r.numero_opl };
      if (chk(r.cliente_nome)) return { campo: 'Cliente',  valor: r.cliente_nome };
      if (chk(r.descricao))    return { campo: 'Descrição', valor: r.descricao };
    }
    return null;
  };

  const buscarGlobal = async (termo: string) => {
    if (!termo.trim() || termo.length < 2) { setGlobalResultados([]); setGlobalBuscando(false); return; }
    setGlobalBuscando(true);
    // Busca pelas colunas *_norm (geradas no banco via normalizar_busca —
    // lower+unaccent) em vez das colunas cruas — ignora acento/maiúscula.
    // O termo digitado também precisa ir normalizado, senão "É"/"e" nunca
    // bateriam com o que foi salvo em minúsculo sem acento na coluna gerada.
    const t = normalizarBusca(termo);
    const [r1, r2, r3, r4, r5, r6, r7] = await Promise.all([
      supabase.from('crm_oportunidades')
        .select('id,titulo,numero_edital,orgao,responsavel_nome,funil')
        .or(`titulo_norm.ilike.%${t}%,numero_edital_norm.ilike.%${t}%,orgao_norm.ilike.%${t}%,responsavel_nome_norm.ilike.%${t}%`)
        .limit(6),
      supabase.from('oples')
        .select('id,opl,cliente_nome,modelo,veiculo,status_geral,tipo_projeto')
        .or(`opl_norm.ilike.%${t}%,cliente_nome_norm.ilike.%${t}%,modelo_norm.ilike.%${t}%,veiculo_norm.ilike.%${t}%`)
        .limit(6),
      // colunas certas dessa tabela são veiculo_modelo/equipamento_nome (não
      // veiculo/modelo, que não existem aqui — corrigido de brinde)
      supabase.from('sac_ordens_servico')
        .select('id,numero_os,cliente_nome,veiculo_modelo,equipamento_nome,status')
        .or(`numero_os_norm.ilike.%${t}%,cliente_nome_norm.ilike.%${t}%,veiculo_modelo_norm.ilike.%${t}%,equipamento_nome_norm.ilike.%${t}%`)
        .limit(6),
      supabase.from('licitacoes')
        .select('id,numero,nome_projeto,orgao,status')
        .or(`numero_norm.ilike.%${t}%,nome_projeto_norm.ilike.%${t}%,orgao_norm.ilike.%${t}%`)
        .limit(6),
      supabase.from('cadastro_itens')
        .select('id,codigo,nome,marca,fornecedor')
        .or(`nome_norm.ilike.%${t}%,codigo_norm.ilike.%${t}%,marca_norm.ilike.%${t}%`)
        .limit(6),
      supabase.from('cadastro_produtos')
        .select('id,codigo,nome,categoria')
        .or(`nome_norm.ilike.%${t}%,codigo_norm.ilike.%${t}%`)
        .limit(6),
      supabase.from('engenharia_desenvolvimento')
        .select('id,titulo,numero_opl,cliente_nome,descricao')
        .or(`titulo_norm.ilike.%${t}%,numero_opl_norm.ilike.%${t}%,cliente_nome_norm.ilike.%${t}%,descricao_norm.ilike.%${t}%`)
        .limit(6),
    ]);
    const res = [
      ...(r1.data||[]).map(r => ({ _tipo:'crm', ...r })),
      ...(r2.data||[]).map(r => ({ _tipo:'opl', ...r })),
      ...(r3.data||[]).map(r => ({ _tipo:'os',  ...r })),
      ...(r4.data||[]).map(r => ({ _tipo:'licitacao', ...r })),
      ...(r5.data||[]).map(r => ({ _tipo:'item',       ...r })),
      ...(r6.data||[]).map(r => ({ _tipo:'produto',    ...r })),
      ...(r7.data||[]).map(r => ({ _tipo:'engenharia', ...r })),
    ];
    setGlobalResultados(res);
    setGlobalBuscando(false);
    setShowGlobalRes(true);
  };

  const onGlobalInput = (v: string) => {
    setGlobalBusca(v);
    clearTimeout(globalDebounce.current);
    if (!v.trim()) { setGlobalResultados([]); setShowGlobalRes(false); return; }
    globalDebounce.current = setTimeout(() => buscarGlobal(v), 320);
  };

  const abrirResultado = async (r: any) => {
    const termoBusca = globalBusca;
    setShowGlobalRes(false);
    setBuscaMobile(false);
    setGlobalBusca('');
    setGlobalResultados([]);
    if (r._tipo === 'crm') {
      setPendingOpenCrmId(r.id);
      setActiveTab('crm');
    } else if (r._tipo === 'opl') {
      const { data } = await supabase.from('oples').select('*').eq('id', r.id).single();
      if (data) setGlobalOplAberto(data);
    } else if (r._tipo === 'os') {
      setActiveTab('sac');
      setTimeout(() => window.dispatchEvent(new CustomEvent('os:abrir-global', { detail: { id: r.id } })), 400);
    } else if (r._tipo === 'licitacao') {
      setPendingOpenLicitId(r.id);
      setActiveTab('licitacoes');
    } else if (r._tipo === 'item') {
      setActiveTab('cadastro_itens');
    } else if (r._tipo === 'produto') {
      setActiveTab('cadastro_produtos');
    } else if (r._tipo === 'engenharia') {
      setActiveTab('engenharia');
      setTimeout(() => window.dispatchEvent(new CustomEvent('engenharia:abrir-desenvolvimento', { detail: { termo: termoBusca } })), 400);
    }
  };

  const TIPO_META: Record<string, { icon: string; cor: string; label: string }> = {
    crm:        { icon:'🤝', cor:'#7c3aed', label:'Processo CRM' },
    opl:        { icon:'🏭', cor:'#0891b2', label:'OP / OPL' },
    os:         { icon:'🔧', cor:'#0f766e', label:'OS' },
    licitacao:  { icon:'🏛️', cor:'#1d4ed8', label:'Licitação' },
    item:       { icon:'📦', cor:'#b45309', label:'Item do Catálogo' },
    produto:    { icon:'🏷️', cor:'#be185d', label:'Produto Formado' },
    engenharia: { icon:'🔩', cor:'#0e7490', label:'Desenvolvimento (Engenharia)' },
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="acn-app">

        {/* Overlay escuro no celular/tablet quando o menu está aberto */}
        <div
          className={`acn-mob-overlay${sidebarOpen ? ' mob-open' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />

        {/* ── MENU LATERAL ── */}
        <nav className={`acn-sidebar${sidebarOpen ? ' mob-open' : ''}`} aria-label="Menu principal">
          <div className="acn-marca">
            <img src={import.meta.env.BASE_URL + 'logo.png'} alt="ACN Sinal Verde" />
          </div>
          <div className="acn-nav-lista">
            {SIDEBAR_GROUPS.map(group => {
              const collapsed = sectionsCollapsed.has(group.section);
              const visibleItems = group.items.filter(item => isVisible(item.id));
              if (visibleItems.length === 0) return null;
              const soUmItemSemTitulo = group.section === 'Dashboard';
              return (
                <React.Fragment key={group.section}>
                  {!soUmItemSemTitulo && (
                    <button type="button"
                      className="sidebar-section"
                      aria-expanded={!collapsed}
                      onClick={() => setSectionsCollapsed(prev => {
                        const next = new Set(prev);
                        next.has(group.section) ? next.delete(group.section) : next.add(group.section);
                        return next;
                      })}>
                      <span>{group.section}</span>
                      <Icone path={mdiChevronDown} size={14} style={{ transform: collapsed ? 'rotate(-90deg)' : undefined, transition:'transform .15s' }} />
                    </button>
                  )}
                  {!collapsed && visibleItems.map(item => (
                    <button type="button"
                      key={item.id}
                      className={`sidebar-item${activeTab === item.id ? ' active' : ''}`}
                      aria-current={activeTab === item.id ? 'page' : undefined}
                      onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}>
                      <Icone path={ICONE_ABA[item.id] || mdiViewDashboardOutline} size={18} className="sidebar-icone" />
                      <span className="sidebar-rotulo">{item.label}</span>
                      {(() => {
                        const setorDaAba = ({ engenharia: 'Engenharia', producao: 'Producao' } as Record<string, string>)[item.id];
                        const n = setorDaAba ? (analisesPorSetor[setorDaAba] || 0) : 0;
                        return n > 0 ? (
                          <span className="sidebar-contador" title={`${n} análise(s) técnica(s) aguardando este setor`}>{n}</span>
                        ) : null;
                      })()}
                      {item.id === 'crm' && waNotifCount > 0 && (
                        <span className="acn-wa-sidebar-dot">
                          {waNotifCount > 9 ? '9+' : waNotifCount}
                        </span>
                      )}
                    </button>
                  ))}
                </React.Fragment>
              );
            })}
          </div>
          <div className="acn-parceiro">
            <img src={import.meta.env.BASE_URL + 'motorola.png'} alt="Motorola Solutions Gold Channel Partner" />
          </div>
        </nav>

        <div className="acn-coluna">
        {/* ── CABEÇALHO ── */}
        <header className={`acn-header${buscaMobile ? ' acn-busca-aberta' : ''}`}>
          {/* Celular/tablet: abre o menu */}
          <button
            className="acn-hamburger"
            onClick={() => setSidebarOpen(o => !o)}
            aria-label="Menu" title="Menu">
            <Icone path={sidebarOpen ? mdiClose : mdiMenu} size={22} />
          </button>

          {/* Caminho da tela: seção › aba */}
          {(() => {
            for (const g of SIDEBAR_GROUPS) {
              const item = g.items.find(i => i.id === activeTab);
              if (item) return (
                <div className="acn-aba-selo">
                  {g.section !== 'Dashboard' && <span className="acn-trilha-secao">{g.section}</span>}
                  {g.section !== 'Dashboard' && <span className="acn-trilha-sep"><Icone path={mdiChevronRight} size={14} /></span>}
                  <span className="acn-trilha-aba">{item.label}</span>
                </div>
              );
            }
            return <div className="acn-aba-selo"><span className="acn-trilha-aba">Início</span></div>;
          })()}

          {/* ── BUSCA GLOBAL ── */}
          <div ref={globalBarRef} className="acn-busca">
            <div className="acn-busca-campo">
              <Icone path={mdiMagnify} size={18} className="acn-busca-lupa" />
              <input
                value={globalBusca}
                onChange={e => onGlobalInput(e.target.value)}
                onFocus={() => globalResultados.length > 0 && setShowGlobalRes(true)}
                placeholder="Buscar OP, OS, processo, cliente, órgão…"
                aria-label="Busca geral"
              />
              {globalBuscando && <span className="acn-busca-status">buscando…</span>}
              {globalBusca && !globalBuscando && (
                <button className="acn-busca-limpar" aria-label="Limpar busca"
                  onClick={() => { setGlobalBusca(''); setGlobalResultados([]); setShowGlobalRes(false); }}>
                  <Icone path={mdiClose} size={16} />
                </button>
              )}
              {!globalBusca && <kbd className="acn-kbd">Ctrl K</kbd>}
            </div>

            {/* Dropdown de resultados */}
            {showGlobalRes && (
              <div className="acn-busca-resultados" style={{ position:'absolute', top:'calc(100% + 6px)', left:0, right:0,
                zIndex:9999, maxHeight:460, overflowY:'auto' }}>

                {globalResultados.length === 0 && !globalBuscando && (
                  <div style={{ padding:'16px 14px', color:'#9ca3af', fontSize:11, textAlign:'center' }}>
                    Nenhum resultado para "{globalBusca}"
                  </div>
                )}

                {/* Agrupar por tipo */}
                {(['crm','opl','os','licitacao','item','produto','engenharia'] as const).map(tipo => {
                  const grupo = globalResultados.filter(r => r._tipo === tipo);
                  if (!grupo.length) return null;
                  const meta = TIPO_META[tipo];
                  return (
                    <div key={tipo}>
                      {/* Header do grupo */}
                      <div style={{ padding:'6px 12px 4px', fontSize:9, fontWeight:800, color:meta.cor,
                        textTransform:'uppercase', letterSpacing:.5, borderBottom:'1px solid #f1f5f9',
                        background:'#fafafa', position:'sticky', top:0 }}>
                        {meta.icon} {meta.label}
                      </div>
                      {grupo.map((r, i) => {
                        const titulo = r._tipo==='crm'       ? r.titulo
                                     : r._tipo==='opl'        ? `${r.opl || ''} — ${r.cliente_nome || ''}`
                                     : r._tipo==='os'         ? `OS ${r.numero_os || ''} — ${r.cliente_nome || ''}`
                                     : r._tipo==='licitacao'  ? `${r.numero || ''} — ${r.nome_projeto || ''}`
                                     : r._tipo==='item'       ? `${r.codigo ? r.codigo + ' — ' : ''}${r.nome || ''}`
                                     : r._tipo==='engenharia' ? `${r.titulo || ''}${r.numero_opl ? ' — ' + r.numero_opl : ''}`
                                     : `${r.codigo ? r.codigo + ' — ' : ''}${r.nome || ''}`;
                        const ctx = getContexto(r, globalBusca);
                        const status = r.status_geral || r.funil || r.status || '';
                        return (
                          <div key={r.id||i}
                            onClick={() => abrirResultado(r)}
                            style={{ padding:'9px 14px', cursor:'pointer', borderBottom:'1px solid #f8fafc',
                              transition:'background .1s' }}
                            onMouseEnter={e => (e.currentTarget.style.background='#f0f9ff')}
                            onMouseLeave={e => (e.currentTarget.style.background='transparent')}>

                            {/* Título principal com highlight */}
                            <div style={{ fontSize:12, fontWeight:600, color:'#1e293b', marginBottom: ctx ? 3 : 0, lineHeight:1.4 }}>
                              {hilite(titulo, globalBusca)}
                            </div>

                            {/* Contexto: campo onde a busca bateu */}
                            {ctx && (
                              <div style={{ fontSize:10, color:'#64748b', display:'flex', alignItems:'center', gap:4 }}>
                                <span style={{ fontWeight:600, color:meta.cor }}>{ctx.campo}:</span>
                                <span>{hilite(ctx.valor, globalBusca)}</span>
                              </div>
                            )}

                            {/* Badge de status */}
                            {status && (
                              <span style={{ display:'inline-block', marginTop:3, fontSize:8, fontWeight:700,
                                background: meta.cor + '18', color: meta.cor, borderRadius:4, padding:'1px 6px' }}>
                                {status}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                <div style={{ padding:'6px 12px', fontSize:9, color:'#94a3b8', borderTop:'1px solid #f1f5f9', textAlign:'center' }}>
                  {globalResultados.length} resultado(s) — clique para abrir
                </div>
              </div>
            )}
          </div>

          {/* Celular: lupa que abre a busca (escondida no computador) */}
          <button className="acn-busca-btn" title="Buscar" aria-label="Buscar"
            onClick={() => {
              setBuscaMobile(b => !b);
              setTimeout(() => globalBarRef.current?.querySelector('input')?.focus(), 50);
            }}>
            <Icone path={buscaMobile ? mdiClose : mdiMagnify} size={20} />
          </button>

          <div className="acn-right">
            {/* Menções */}
            <div className={`acn-notif${mencoesCount > 0 ? ' com-contador' : ''}`} role="button" tabIndex={0}
              title={mencoesCount > 0 ? `${mencoesCount} menção(ões) pendente(s)` : 'Menções'}
              onClick={() => setShowMencoesPanel(true)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setShowMencoesPanel(true); }}>
              <span className="acn-notif-icone"><Icone path={mdiAt} size={18} /><span className="acn-rotulo">Menções</span></span>
              {mencoesCount > 0 && <span className="acn-notif-contador tom-info">{mencoesCount}</span>}
            </div>
            {/* Avisos automáticos de andamento das OPs */}
            {(() => {
              // Compras vê só os alertas de compras; Almoxarifado vê avisos de OP + entregas atrasadas
              const qtd = currentUser?.perfil === 'Compras' ? alertasCompras.length : avisosOpCount + (usaAlertasCompras ? alertasCompras.length : 0);
              const abrir = () => usaAlertasCompras ? setShowAlertasCompras(true) : setShowAvisosOp(true);
              const titulo = currentUser?.perfil === 'Compras'
                ? (qtd ? `${qtd} alerta(s) de compras` : 'Avisos de compras')
                : (qtd ? `${qtd} aviso(s)` : 'Avisos');
              return (
                <div className={`acn-notif${qtd > 0 ? ' com-contador' : ''}`} role="button" tabIndex={0} title={titulo}
                  onClick={abrir} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') abrir(); }}>
                  <span className="acn-notif-icone"><Icone path={mdiBellOutline} size={18} /><span className="acn-rotulo">Avisos</span></span>
                  {qtd > 0 && <span className={`acn-notif-contador ${usaAlertasCompras && alertasCompras.length ? 'tom-atencao' : 'tom-marca'}`}>{qtd}</span>}
                </div>
              );
            })()}
            {currentUser?.id && (
              <div className={`acn-notif${analiseAlertCount > 0 ? ' com-contador' : ''}`} role="button" tabIndex={0}
                title={analiseAlertCount > 0 ? `${analiseAlertCount} análise(s) pendente(s) do seu setor` : 'Análises'}
                onClick={() => setShowAnalisePanel(true)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setShowAnalisePanel(true); }}>
                <span className="acn-notif-icone"><Icone path={mdiClipboardSearchOutline} size={18} /><span className="acn-rotulo">Análise</span></span>
                {analiseAlertCount > 0 && <span className="acn-notif-contador tom-atencao">{analiseAlertCount}</span>}
              </div>
            )}
            {/* Iniciais do usuário abrem o menu (tema, senha, sair) */}
            <button className="acn-user-btn" aria-haspopup="menu" aria-expanded={menuUsuario}
              title={currentUser?.nome || 'Usuário'} onClick={() => setMenuUsuario(m => !m)}>
              {String(currentUser?.nome || 'U').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()}
            </button>
          </div>
          {menuUsuario && (
            <>
              <div className="acn-user-menu-fundo" onClick={() => setMenuUsuario(false)} />
              <div className="acn-user-menu" role="menu">
                <div className="acn-user-menu-topo">
                  <strong>{currentUser?.nome || 'Usuário'}</strong>
                  <span>{currentUser?.perfil || ''}</span>
                </div>
                <button role="menuitem" onClick={() => { setMenuUsuario(false); setDark(d => !d); }}>
                  <Icone path={dark ? mdiWhiteBalanceSunny : mdiWeatherNight} size={18} />{dark ? 'Modo claro' : 'Modo escuro'}
                </button>
                <button role="menuitem" onClick={() => { setMenuUsuario(false); setSenhaForm({atual:'',nova:'',confirmar:''}); setSenhaMsg(''); setModalSenha(true); }}>
                  <Icone path={mdiKeyOutline} size={18} />Trocar senha
                </button>
                <button role="menuitem" onClick={() => { setMenuUsuario(false); onLogout(); }}>
                  <Icone path={mdiLogout} size={18} />Sair
                </button>
              </div>
            </>
          )}
        </header>

        {/* ── FAIXA "VER COMO" ── visível só enquanto o admin está testando com a sessão de outro usuário */}
        {sessaoOriginalAdmin && (
          <div className="acn-faixa-vercomo">
            <span>👁️ Visualizando o sistema como <strong>{currentUser?.nome}</strong> ({currentUser?.perfil || '—'})</span>
            <button onClick={voltarParaAdmin}>← Voltar ao Admin</button>
          </div>
        )}

          <main className={`acn-main${activeTab === 'painel_tv' ? ' acn-main-tv' : ''}`}>
            {activeTab === 'dashboard' ? (
              <div>
                <CabecalhoTela
                  titulo="Dashboard"
                  subtitulo="Lead time médio por setor · período atual"
                  acoes={<Botao variante="secundario" icone={mdiRefresh} onClick={buscarRealizados}>Atualizar</Botao>}
                />
                {/* Resumo de status dos setores — mesma regra de getStatus() usada na tabela abaixo */}
                {(() => {
                  const contagem = { ok: 0, warn: 0, crit: 0, sem: 0 };
                  METRICAS_CONFIG.forEach(m => {
                    const st = getStatus(realizados[m.key] ?? null, m.meta, m.tol);
                    if (st.cls === 'st-ok') contagem.ok++;
                    else if (st.cls === 'st-warn') contagem.warn++;
                    else if (st.cls === 'st-crit') contagem.crit++;
                    else contagem.sem++;
                  });
                  const cards = [
                    { label: 'No prazo',   valor: contagem.ok,   sub: 'setores dentro da meta',   cor: 'var(--acn-ok)' },
                    { label: 'Em atenção', valor: contagem.warn, sub: 'acima da meta',            cor: 'var(--acn-warn)' },
                    { label: 'Crítico',    valor: contagem.crit, sub: 'acima da tolerância',      cor: 'var(--acn-bad)' },
                    { label: 'Sem dados',  valor: contagem.sem,  sub: 'sem registro no período',  cor: 'var(--acn-neutral)' },
                  ];
                  return (
                    <div className="acn-kpis">
                      {cards.map(c => (
                        <div key={c.label} className="acn-kpi">
                          <span className="rot"><i style={{ background: c.cor }} />{c.label}</span>
                          <span className="val acn-num">{c.valor}</span>
                          <span className="sub">{c.sub}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                <div className="sec-card">
                  <div className="sec-hdr">
                    <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                      KPIs por setor <Selo familia="neutro" ponto={false}>{METRICAS_CONFIG.length} setores</Selo>
                    </span>
                  </div>
                  <div className="sec-body" style={{ overflowX:'auto', padding:0 }}>
                    <table className="acn-tabela">
                      <thead><tr>
                        <th>Setor</th>
                        <th>Indicador</th>
                        <th style={{ textAlign:'right' }}>Meta</th>
                        <th style={{ textAlign:'right' }}>Tolerância</th>
                        <th style={{ textAlign:'right' }}>Realizado</th>
                        <th>Status</th>
                        <th>Diretriz</th>
                      </tr></thead>
                      <tbody>
                        {METRICAS_CONFIG.map(m => {
                          const real = realizados[m.key] ?? null;
                          const st = getStatus(real, m.meta, m.tol);
                          const fam = st.cls === 'st-ok' ? 'ok' : st.cls === 'st-warn' ? 'atencao' : st.cls === 'st-crit' ? 'erro' : 'neutro';
                          const cor = st.cls === 'st-ok' ? 'var(--acn-ok)' : st.cls === 'st-warn' ? 'var(--acn-warn)' : 'var(--acn-bad)';
                          const usoTol = real != null && m.tol ? Math.min(100, Math.round((real / m.tol) * 100)) : 0;
                          const h = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' h';
                          return (
                            <tr key={m.key} className={st.cls === 'st-crit' ? 'acn-linha-alerta' : ''}>
                              <td className="acn-forte" style={{ whiteSpace:'nowrap' }}>{m.nome}</td>
                              <td style={{ minWidth:180 }}>{m.desc}</td>
                              <td className="acn-num" style={{ textAlign:'right', whiteSpace:'nowrap' }}>{h(m.meta)}</td>
                              <td className="acn-num" style={{ textAlign:'right', whiteSpace:'nowrap' }}>{h(m.tol)}</td>
                              <td style={{ whiteSpace:'nowrap' }}>
                                {real != null ? (
                                  <div className="acn-barra" title={`${usoTol}% da tolerância`}>
                                    <span><i style={{ width: `${Math.max(3, usoTol)}%`, background: cor }} /></span>
                                    <b className="acn-num acn-forte">{h(real)}</b>
                                  </div>
                                ) : <div className="acn-fraco" style={{ textAlign:'right' }}>—</div>}
                              </td>
                              <td><Selo familia={fam as any}>{st.cls === 'st-ok' ? 'No prazo' : st.cls === 'st-warn' ? 'Atenção' : st.cls === 'st-crit' ? 'Crítico' : 'Sem dados'}</Selo></td>
                              <td className="acn-fraco" style={{ minWidth:160 }}>{m.diretriz}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="sec-card">
                  <div className="sec-hdr"><span>Lead times por setor</span></div>
                  <div className="sec-body">
                    <div className="chart-wrap">
                      <canvas ref={canvasRef} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Título da tela para as abas que ainda não têm cabeçalho próprio */}
                {!['producao', 'crm', 'painel_tv', 'licitacoes', 'nfc'].includes(activeTab) && (() => {
                  const item = SIDEBAR_GROUPS.flatMap(g => g.items).find(i => i.id === activeTab);
                  return item ? <CabecalhoTela titulo={item.label} /> : null;
                })()}
                {renderContent()}
              </>
            )}
          </main>
        </div>
      </div>

      {/* MODAL TROCAR SENHA */}
      {modalSenha && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:380}}>
            <div className="modal-title">
              🔑 {currentUser?.primeiro_acesso ? 'Defina sua Nova Senha' : 'Alterar Senha'}
            </div>
            {currentUser?.primeiro_acesso && (
              <div style={{fontSize:12,color:'#92400e',background:'#fef3c7',padding:'8px 10px',borderRadius:6,marginBottom:12,lineHeight:1.5}}>
                ⚠️ Por segurança, defina uma senha pessoal antes de continuar.
              </div>
            )}
            {senhaMsg && (
              <div style={{fontSize:12,padding:'8px 10px',borderRadius:6,marginBottom:10,
                background: senhaMsg.startsWith('ok:') ? '#f0fdf4' : '#fef2f2',
                color: senhaMsg.startsWith('ok:') ? '#166534' : '#991b1b',
                border: `1px solid ${senhaMsg.startsWith('ok:') ? '#86efac' : '#fca5a5'}`}}>
                {senhaMsg.startsWith('ok:') ? '✅ ' : '❌ '}{senhaMsg.slice(3)}
              </div>
            )}
            {!currentUser?.primeiro_acesso && (
              <div style={{marginBottom:10}}>
                <label className="acn-label">Senha Atual</label>
                <input className="acn-input" type="password" style={{width:'100%'}}
                  value={senhaForm.atual} onChange={e=>setSenhaForm(f=>({...f,atual:e.target.value}))} />
              </div>
            )}
            <div style={{marginBottom:10}}>
              <label className="acn-label">Nova Senha (mín. 4 caracteres)</label>
              <input className="acn-input" type="password" style={{width:'100%'}}
                value={senhaForm.nova} onChange={e=>setSenhaForm(f=>({...f,nova:e.target.value}))} />
            </div>
            <div style={{marginBottom:14}}>
              <label className="acn-label">Confirmar Nova Senha</label>
              <input className="acn-input" type="password" style={{width:'100%'}}
                value={senhaForm.confirmar} onChange={e=>setSenhaForm(f=>({...f,confirmar:e.target.value}))}
                onKeyDown={e=>e.key==='Enter'&&salvarSenha()} />
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1,padding:'9px'}}
                onClick={salvarSenha} disabled={senhaLoading}>
                {senhaLoading ? 'Salvando...' : 'SALVAR SENHA'}
              </button>
              {!currentUser?.primeiro_acesso && (
                <button className="acn-btn" style={{background:'#94a3b8',padding:'9px'}}
                  onClick={()=>{setModalSenha(false);setSenhaMsg('');}}>
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <AvisoSistemaWidget currentUser={currentUser} />
      <ContatoAlertWidget currentUser={currentUser} />
      <ContatoComercialAlertWidget currentUser={currentUser} />
      <ChatWidget currentUser={currentUser} onNavigate={setActiveTab} />

      {/* ── OPL aberto via busca global (modal flutuante) ── */}
      {globalOplAberto && (
        <OplDetalheModal
          opl={globalOplAberto}
          onClose={() => setGlobalOplAberto(null)}
          currentUser={currentUser}
        />
      )}

      {/* Painel lateral de Análises Orçamentárias */}
      {showAnalisePanel && (
        <AnaliseInboxPanel
          currentUser={currentUser}
          onClose={() => setShowAnalisePanel(false)}
          onCountChange={n => setAnaliseAlertCount(n)}
          onNavigate={(tab) => { setShowAnalisePanel(false); setActiveTab(tab); }}
        />
      )}

      {/* Painel de Avisos de Compras (Compras e Almoxarifado) */}
      {showAlertasCompras && (
        <AlertasComprasPanel currentUser={currentUser}
          onClose={() => { setShowAlertasCompras(false); recarregarAlertasCompras(); }}
          onCountChange={() => recarregarAlertasCompras()}
          onAbrirCompras={isVisible('compras') ? () => { setShowAlertasCompras(false); setActiveTab('compras'); } : undefined}
          onAvisosOp={currentUser?.perfil !== 'Compras' ? () => { setShowAlertasCompras(false); setShowAvisosOp(true); } : undefined}
          qtdAvisosOp={avisosOpCount} />
      )}
      {/* Requisições paradas: Compras precisa informar o motivo antes de seguir */}
      {currentUser?.perfil === 'Compras' && !sessaoOriginalAdmin && (
        <JanelaParadasObrigatoria alertas={alertasCompras} currentUser={currentUser} onRespondido={recarregarAlertasCompras} />
      )}

      {/* Painel de Avisos de OP */}
      {showAvisosOp && (
        <AvisosOpPanel currentUser={currentUser} onClose={() => setShowAvisosOp(false)}
          onCountChange={n => setAvisosOpCount(n)} />
      )}

      {/* Painel lateral de Menções */}
      {showMencoesPanel && (
        <MencoesInboxPanel
          currentUser={currentUser}
          onClose={() => setShowMencoesPanel(false)}
          onCountChange={n => setMencoesCount(n)}
          onNavigate={(tab) => { setShowMencoesPanel(false); setActiveTab(tab); }}
        />
      )}
    </>
  );
}
