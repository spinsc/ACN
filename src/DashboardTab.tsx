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
import QualidadeTab from './QualidadeTab';
import FiscalTab from './FiscalTab';
import LogisticaTab from './LogisticaTab';
import VistoriasPatio from './VistoriasPatio';
import MarketingTab from './MarketingTab';
import SetorDemandaTab from './SetorDemandaTab';
import AdminTab from './AdminTab';
import RelatoriosTab from './RelatoriosTab';
import SacTab from './SacTab';
import ChatWidget from './ChatWidget';


interface Props { currentUser: any; onLogout: () => void; }

const METRICAS_CONFIG = [
  { key: 'engenharia',   nome: 'ENGENHARIA',   desc: 'Lead Time Liberacao BOM',               meta: 8,  tol: 16,  campo: 'tempo_engenharia_horas',   diretriz: 'Parametros normais mantidos.' },
  { key: 'pcp',          nome: 'PCP',           desc: 'BOM Lancado x Liberacao Producao',      meta: 24, tol: 48,  campo: 'tempo_pcp_horas',          diretriz: 'Triagem e distribuicao em fluxo.' },
  { key: 'compras',      nome: 'COMPRAS',       desc: 'Solicitacao x Efetivacao de Pedido',    meta: 24, tol: 72,  campo: 'tempo_compras_horas',       diretriz: 'Velocidade de compras.' },
  { key: 'almoxarifado', nome: 'ALMOXARIFADO',  desc: 'Kiting Solicitado x Concluido',         meta: 8,  tol: 24,  campo: 'tempo_almoxarifado_horas',  diretriz: 'Separacao operacional.' },
  { key: 'chicotes',     nome: 'CHICOTES',      desc: 'Tempo Fabricacao (Pedido x Entrega)',   meta: 48, tol: 96,  campo: 'tempo_chicotes_horas',      diretriz: 'Linha de chicotes.' },
  { key: 'laboratorio',  nome: 'LABORATORIO',   desc: 'Solicitacao x Devolucao',               meta: 24, tol: 72,  campo: 'tempo_laboratorio_horas',   diretriz: 'Bancada de ensaios.' },
  { key: 'producao',     nome: 'PRODUCAO',      desc: 'Lead Time Execucao (Inicio x Fim)',     meta: 16, tol: 48,  campo: 'tempo_producao_horas',      diretriz: 'Execucao de linha.' },
  { key: 'qualidade',    nome: 'CQ',            desc: 'Fila Checklist x Liberacao',            meta: 1,  tol: 3,   campo: 'tempo_qualidade_horas',     diretriz: 'Auditoria de patio fluindo.' },
  { key: 'logistica',    nome: 'LOGISTICA',     desc: 'Despacho x Retorno',                    meta: 48, tol: 120, campo: 'tempo_logistica_horas',     diretriz: 'Manifestos em movimento.' },
  { key: 'serralheria',  nome: 'SERRALHERIA',   desc: 'Mobilizacao + Execucao (Total)',        meta: 24, tol: 72,  campo: 'tempo_serralheria_horas',   diretriz: 'Mob. media: x | Exec. media: x' },
  { key: 'fiscal',       nome: 'FISCAL',        desc: 'Liberacao Comercial x Emissao NF',      meta: 2,  tol: 6,   campo: 'tempo_fiscal_horas',        diretriz: 'Faturamento sincrono.' },
];

const SIDEBAR_GROUPS = [
  {
    section: 'Geral',
    items: [
      { id: 'dashboard', label: 'Dashboard' },
    ],
  },
  {
    section: 'Operações',
    items: [
      { id: 'comercial',  label: 'Comercial' },
      { id: 'engenharia', label: 'Engenharia' },
      { id: 'ajustes',    label: 'Ajustes de Projeto' },
      { id: 'pcp',        label: 'PCP' },
    ],
  },
  {
    section: 'Produção',
    items: [
      { id: 'serralheria',  label: 'Serralheria' },
      { id: 'chicotes',     label: 'Chicotes' },
      { id: 'laboratorio',  label: 'Laboratório' },
      { id: 'compras',      label: 'Compras' },
      { id: 'almoxarifado', label: 'Almoxarifado' },
      { id: 'producao',     label: 'Produção' },
    ],
  },
  {
    section: 'Qualidade & Entrega',
    items: [
      { id: 'qualidade', label: 'Ctrl. Qualidade' },
      { id: 'logistica', label: 'Logística In/Out' },
      { id: 'vistorias', label: 'Vistorias Pátio' },
    ],
  },
  {
    section: 'Marketing',
    items: [
      { id: 'marketing', label: 'Marketing' },
    ],
  },
  {
    section: 'SAC',
    items: [
      { id: 'sac', label: 'SAC' },
    ],
  },
  {
    section: 'Fiscal & Admin',
    items: [
      { id: 'fiscal',     label: 'Fiscal' },
      { id: 'relatorios', label: 'Relatórios' },
      { id: 'admin',      label: 'Admin' },
    ],
  },
];

const CSS = `
/* ── RESET ── */
*, *::before, *::after { box-sizing:border-box; }
html, body { margin:0; padding:0; height:100%; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; font-size:11px; background:#f8fafc; color:#374151; overflow:hidden; }

/* ── APP SHELL ── */
.acn-app  { display:flex; flex-direction:column; height:100vh; width:100%; }
.acn-body { display:flex; flex:1; overflow:hidden; width:100%; }

/* ── TOPBAR ── */
.acn-header { background:#0f766e; color:#fff; padding:0 14px; display:flex; align-items:center; gap:10px; height:42px; flex-shrink:0; }
.acn-logo h1 { margin:0; font-size:13px; font-weight:700; color:#fff; letter-spacing:.4px; }
.acn-logo h1 span { color:#99f6e4; }
.acn-logo p  { margin:0; font-size:8px; color:#99f6e4; opacity:.75; }
.acn-period  { display:flex; align-items:center; gap:4px; background:rgba(0,0,0,.18); padding:3px 8px; border-radius:4px; }
.acn-period span  { font-size:9px; color:#ccfbf1; }
.acn-period input { font-size:9px; padding:2px 4px; border-radius:3px; border:none; color:#0f172a; background:#f0fdfa; }
.acn-period button { font-size:8px; font-weight:700; background:rgba(0,0,0,.25); color:#ccfbf1; border:none; padding:2px 7px; border-radius:3px; cursor:pointer; }
.acn-period button:hover { background:rgba(0,0,0,.38); }
.acn-right { margin-left:auto; display:flex; align-items:center; gap:8px; }
.acn-user  { font-size:8px; color:#ccfbf1; text-align:right; line-height:1.5; }
.acn-user strong { display:block; color:#fff; font-size:9px; }
.acn-logout { font-size:8px; background:none; border:none; color:#99f6e4; cursor:pointer; text-decoration:underline; padding:0; }

/* ── SIDEBAR ── */
.acn-sidebar { width:160px; flex-shrink:0; background:#fff; border-right:1px solid #e8ecf0; overflow-y:auto; display:flex; flex-direction:column; padding-bottom:8px; }
.sidebar-section { padding:10px 10px 3px; font-size:8px; font-weight:700; color:#b0bac5; letter-spacing:.08em; text-transform:uppercase; }
.sidebar-item { display:flex; align-items:center; gap:6px; padding:5px 10px 5px 10px; font-size:10px; color:#52616b; cursor:pointer; border-left:2px solid transparent; transition:color .1s,background .1s; user-select:none; }
.sidebar-item:hover  { color:#0f766e; background:#f0fdfa; }
.sidebar-item.active { color:#0f766e; border-left-color:#0f766e; background:#f0fdfa; font-weight:600; }
.sidebar-dot { font-size:7px; flex-shrink:0; line-height:1; margin-top:1px; opacity:.6; }

/* ── MAIN CONTENT ── */
.acn-main { flex:1; overflow-y:auto; padding:10px 14px; background:#f4f6f9; min-width:0; }

/* ── CARDS ── */
.sec-card { background:white; border:1px solid #e8ecf0; border-radius:6px; margin-bottom:8px; overflow:hidden; box-shadow:0 1px 2px rgba(0,0,0,.04); }
.sec-hdr  { padding:6px 10px; font-size:9px; font-weight:700; color:#374151; background:#fafbfc; border-bottom:1px solid #e8ecf0; display:flex; align-items:center; justify-content:space-between; gap:8px; letter-spacing:.4px; text-transform:uppercase; }
.sec-body { padding:8px 10px; }

/* ── TABELAS ── */
.acn-main table { font-size:9px !important; width:100%; border-collapse:collapse; table-layout:auto; }
.acn-main table thead tr { background:#1e293b !important; }
.acn-main table th { background:#1e293b !important; color:#cbd5e1 !important; padding:5px 7px !important; font-size:9px !important; font-weight:600 !important; text-align:left; border:none !important; white-space:nowrap; letter-spacing:.2px; }
.acn-main table td { padding:4px 7px !important; font-size:9px !important; border-bottom:1px solid #f1f5f9 !important; vertical-align:middle !important; color:#374151; }
.acn-main table tr:last-child td { border-bottom:none !important; }
.acn-main table tr:hover td { background:#f8fafc !important; }

/* ── TIPOGRAFIA ── */
.acn-main h2 { font-size:11px !important; font-weight:700; margin:0 0 6px !important; padding:0 !important; color:#0f172a; }
.acn-main h3 { font-size:10px !important; font-weight:700; margin:0 0 5px !important; padding:0 !important; border:none !important; color:#374151; }

/* ── BOTÕES ── */
.acn-btn { font-size:9px; font-weight:600; padding:3px 8px; border:none; border-radius:4px; cursor:pointer; color:white; white-space:nowrap; line-height:1.5; }
.acn-btn:disabled { opacity:.4; cursor:not-allowed; }

/* ── BADGES ── */
.acn-badge { display:inline-block; padding:2px 6px; border-radius:3px; font-size:8px; font-weight:700; color:white; white-space:nowrap; letter-spacing:.2px; }

/* ── INPUTS ── */
.acn-input { font-size:9px; padding:3px 6px; border:1px solid #d1d5db; border-radius:4px; outline:none; box-sizing:border-box; color:#374151; background:#fff; }
.acn-input:focus { border-color:#0f766e; box-shadow:0 0 0 2px rgba(15,118,110,.10); }
.acn-label { display:block; font-size:8px; font-weight:700; color:#6b7280; margin-bottom:2px; text-transform:uppercase; letter-spacing:.4px; }
.acn-empty { text-align:center; padding:16px; color:#9ca3af; font-size:9px; font-style:italic; }

/* ── FOOTER / OPL MOVIMENTADAS ── */
.acn-footer-setor { background:#1e293b; color:#64748b; font-size:9px; padding:5px 10px; border-radius:4px; margin-top:6px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; }
.acn-footer-setor strong { color:#4ade80; }
.opl-mov-hdr  { background:#fffbeb; border:1px solid #fde68a; border-radius:4px; padding:5px 10px; font-size:10px; font-weight:700; color:#92400e; cursor:pointer; display:flex; justify-content:space-between; align-items:center; margin-top:6px; user-select:none; }
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

/* ── DARK MODE ── */
body.dark { background:#0f172a !important; color:#cbd5e1 !important; overflow:hidden; }
body.dark .acn-sidebar { background:#161d2e !important; border-color:#263045 !important; }
body.dark .sidebar-section { color:#3d4f63 !important; }
body.dark .sidebar-item { color:#7c8fa0 !important; }
body.dark .sidebar-item:hover  { background:#0d2924 !important; color:#2dd4bf !important; }
body.dark .sidebar-item.active { background:#0d2924 !important; color:#2dd4bf !important; border-left-color:#0d9488 !important; }
body.dark .acn-main { background:#0c1121 !important; }
body.dark .sec-card { background:#1e293b !important; border-color:#334155 !important; }
body.dark .sec-hdr  { background:#0f172a !important; border-color:#334155 !important; color:#94a3b8 !important; }
body.dark .sec-body { background:#1e293b !important; }
body.dark .acn-main table td   { background:#1e293b !important; color:#cbd5e1 !important; border-color:#334155 !important; }
body.dark .acn-main table th   { background:#0f172a !important; color:#94a3b8 !important; }
body.dark .acn-main table tr:hover td { background:#334155 !important; }
body.dark .acn-input  { background:#0f172a !important; border-color:#334155 !important; color:#cbd5e1 !important; }
body.dark .acn-input:focus { border-color:#0d9488 !important; box-shadow:0 0 0 2px rgba(13,148,136,.2) !important; }
body.dark .acn-label  { color:#64748b !important; }
body.dark .acn-empty  { color:#64748b !important; }
body.dark .modal-box  { background:#1e293b !important; color:#cbd5e1 !important; border:1px solid #334155; }
body.dark .modal-title { color:#e2e8f0 !important; }
body.dark .opl-mov-hdr  { background:#1c1a09 !important; border-color:#713f12 !important; color:#fbbf24 !important; }
body.dark .opl-mov-body { border-color:#713f12 !important; }
body.dark .metrics-tbl th { background:#0f172a !important; color:#64748b !important; border-color:#334155 !important; }
body.dark .metrics-tbl td { color:#cbd5e1 !important; border-color:#1e293b !important; }
body.dark .metrics-tbl tr:hover td { background:#334155 !important; }
body.dark select, body.dark textarea { background:#0f172a !important; color:#cbd5e1 !important; border-color:#334155 !important; }
body.dark h2, body.dark h3 { color:#e2e8f0 !important; }
body.dark .form-group label { color:#64748b !important; }
body.dark .crm-overdue td { background:#2d0a0a !important; }
body.dark .row-atraso td  { background:#2d0a0a !important; }
body.dark .row-alerta td  { background:#1c1505 !important; }
body.dark ::-webkit-scrollbar { width:6px; height:6px; }
body.dark ::-webkit-scrollbar-track { background:#0f172a; }
body.dark ::-webkit-scrollbar-thumb { background:#334155; border-radius:3px; }

/* ── DARK MODE: cascata de cor para filhos de containers escuros ── */
/* Tabelas: força herança nos filhos diretos, preserva badges/btns */
body.dark .acn-main table td strong,
body.dark .acn-main table td span:not(.acn-badge),
body.dark .acn-main table td p,
body.dark .acn-main table td div { color:inherit !important; }
/* Sec-body genérico */
body.dark .sec-body { color:#cbd5e1 !important; }
body.dark .sec-body p,
body.dark .sec-body span:not(.acn-badge),
body.dark .sec-body strong,
body.dark .sec-body div:not(.modal-overlay) { color:inherit !important; }
/* Modal */
body.dark .modal-box p,
body.dark .modal-box span:not(.acn-badge),
body.dark .modal-box strong,
body.dark .modal-box label { color:inherit !important; }
/* Override cores hardcoded escuras que ficam invisíveis no dark */
body.dark [style*="color:#374151"],  body.dark [style*="color: #374151"],
body.dark [style*="color:#1e293b"],  body.dark [style*="color: #1e293b"],
body.dark [style*="color:#0f172a"],  body.dark [style*="color: #0f172a"],
body.dark [style*="color:#334155"],  body.dark [style*="color: #334155"],
body.dark [style*="color:#475569"],  body.dark [style*="color: #475569"] { color:#94a3b8 !important; }
/* Cores cinza médio ficam muito escuras no dark */
body.dark [style*="color:#64748b"],  body.dark [style*="color: #64748b"],
body.dark [style*="color:#6b7280"],  body.dark [style*="color: #6b7280"],
body.dark [style*="color:#9ca3af"],  body.dark [style*="color: #9ca3af"] { color:#64748b !important; }
/* Garante que acn-badge sempre mantém cor branca independente do contexto */
body.dark .acn-badge { color:white !important; }
/* Cores funcionais (verde, vermelho, amarelo) preservadas — não sobrescrever */
/* Fix light mode: impede tema escuro do SO afetar inputs nativos */
.acn-main input, .acn-main select, .acn-main textarea { color-scheme:light; }
body.dark .acn-main input, body.dark .acn-main select, body.dark .acn-main textarea { color-scheme:dark; }
`;

export default function DashboardTab({ currentUser, onLogout }: Props) {
  const [activeTab, setActiveTab]       = useState('dashboard');
  const [filtroInicio, setFiltroInicio] = useState('');
  const [filtroFim, setFiltroFim]       = useState('');
  const [dark, setDark] = useState(() => localStorage.getItem('acn-dark') === '1');

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
          { label: 'Meta',       data: METRICAS_CONFIG.map(m => m.meta),                       borderColor:'#16a34a', borderDash:[5,5], fill:false, type:'line', pointRadius:0, tension:0 } as any,
          { label: 'Tolerancia', data: METRICAS_CONFIG.map(m => m.tol),                        borderColor:'#d97706', borderDash:[5,5], fill:false, type:'line', pointRadius:0, tension:0 } as any,
          { label: 'Realizado',  data: METRICAS_CONFIG.map(m => realizados[m.key] ?? 0),       backgroundColor:'#0d9488', borderColor:'#0f766e', borderWidth:1 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
        scales:  { y: { beginAtZero: true, title: { display: true, text: 'Horas', font: { size: 11 } } } },
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
    if (currentUser?.perfil === 'Admin') return true;
    if (id === 'dashboard') return true;
    const abas = currentUser?.abas_permitidas;
    if (!abas || !Array.isArray(abas) || abas.length === 0) return true;
    return abas.includes(id);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'comercial':    return <ComercialTab currentUser={currentUser} />;
      case 'engenharia':   return <EngenhariaTab currentUser={currentUser} />;
      case 'ajustes':      return <AjustesProjetoTab currentUser={currentUser} />;
      case 'pcp':          return <PCPTab currentUser={currentUser} />;
      case 'serralheria':  return <SetorDemandaTab currentUser={currentUser} setor="Serralheria" cor="#ea580c" />;
      case 'chicotes':     return <SetorDemandaTab currentUser={currentUser} setor="Chicotes" cor="#7c3aed" />;
      case 'laboratorio':  return <SetorDemandaTab currentUser={currentUser} setor="Laboratorio" cor="#0891b2" />;
      case 'compras':      return <SetorDemandaTab currentUser={currentUser} setor="Compras" cor="#16a34a" />;
      case 'almoxarifado': return <AlmoxarifadoTab currentUser={currentUser} />;
      case 'producao':     return <ProducaoTab currentUser={currentUser} />;
      case 'qualidade':    return <QualidadeTab currentUser={currentUser} />;
      case 'logistica':    return <LogisticaTab currentUser={currentUser} />;
      case 'vistorias':    return <VistoriasPatio currentUser={currentUser} />;
      case 'marketing':    return <MarketingTab currentUser={currentUser} />;
      case 'sac':          return <SacTab currentUser={currentUser} />;
      case 'fiscal':       return <FiscalTab currentUser={currentUser} />;
      case 'relatorios':   return <RelatoriosTab currentUser={currentUser} />;
      case 'admin':        return <AdminTab />;
      default: return null;
    }
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="acn-app">

        {/* ── TOPBAR ── */}
        <header className="acn-header">
          <div className="acn-logo">
            <h1>ACN <span>SINAL VERDE</span></h1>
            <p>Workflow Industrial · KPIs em Horas</p>
          </div>
          <div className="acn-period">
            <span>Período:</span>
            <input type="date" value={filtroInicio} onChange={e => setFiltroInicio(e.target.value)} />
            <span>a</span>
            <input type="date" value={filtroFim} onChange={e => setFiltroFim(e.target.value)} />
            <button onClick={buscarRealizados}>Atualizar</button>
          </div>
          <div className="acn-right">
            <button
              style={{ background:'rgba(0,0,0,.2)', border:'1px solid rgba(255,255,255,.2)', color:'white', fontSize:14, cursor:'pointer', borderRadius:4, padding:'2px 7px' }}
              onClick={() => setDark(d => !d)}
              title={dark ? 'Modo claro' : 'Modo escuro'}>
              {dark ? '☀️' : '🌙'}
            </button>
            <div className="acn-user">
              <strong>{currentUser?.nome || 'Usuário'}</strong>
              <span>{currentUser?.perfil || ''}</span>
              <button className="acn-logout" style={{background:'#0d9488',marginRight:4}}
                onClick={()=>{setSenhaForm({atual:'',nova:'',confirmar:''});setSenhaMsg('');setModalSenha(true);}}>
                🔑 Senha
              </button>
              <button className="acn-logout" onClick={onLogout}>Sair</button>
            </div>
          </div>
        </header>

        {/* ── BODY: SIDEBAR + MAIN ── */}
        <div className="acn-body">

          {/* ── SIDEBAR ── */}
          <nav className="acn-sidebar">
            {SIDEBAR_GROUPS.map(group => (
              <React.Fragment key={group.section}>
                <div className="sidebar-section">{group.section}</div>
                {group.items.filter(item => isVisible(item.id)).map(item => (
                  <div
                    key={item.id}
                    className={`sidebar-item${activeTab === item.id ? ' active' : ''}`}
                    onClick={() => setActiveTab(item.id)}
                  >
                    <span className="sidebar-dot">●</span>
                    {item.label}
                  </div>
                ))}
              </React.Fragment>
            ))}
          </nav>

          {/* ── MAIN ── */}
          <main className="acn-main">
            {activeTab === 'dashboard' ? (
              <div>
                <div className="sec-card">
                  <div className="sec-hdr">
                    <span>KPIs por Setor — Lead Times Médios</span>
                    <button className="acn-btn" style={{background:'#0f766e'}} onClick={buscarRealizados}>↺ Atualizar</button>
                  </div>
                  <div className="sec-body" style={{overflowX:'auto'}}>
                    <table className="metrics-tbl">
                      <thead><tr>
                        <th>Setor</th>
                        <th>Indicador</th>
                        <th style={{textAlign:'center'}}>Meta (h)</th>
                        <th style={{textAlign:'center'}}>Tolerância (h)</th>
                        <th style={{textAlign:'center'}}>Realizado (h)</th>
                        <th>Status</th>
                        <th>Diretriz</th>
                      </tr></thead>
                      <tbody>
                        {METRICAS_CONFIG.map(m => {
                          const real = realizados[m.key] ?? null;
                          const st = getStatus(real, m.meta, m.tol);
                          return (
                            <tr key={m.key}>
                              <td><strong>{m.nome}</strong></td>
                              <td style={{maxWidth:200,fontSize:9,color:'#64748b'}}>{m.desc}</td>
                              <td className="num-meta">{m.meta}h</td>
                              <td className="num-tol">{m.tol}h</td>
                              <td className="num-real">{real != null ? real.toFixed(1)+'h' : '—'}</td>
                              <td><span className={st.cls}>{st.label}</span></td>
                              <td style={{fontSize:9,color:'#64748b'}}>{m.diretriz}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="sec-card">
                  <div className="sec-hdr"><span>Gráfico de Lead Times por Setor</span></div>
                  <div className="sec-body">
                    <div className="chart-wrap">
                      <canvas ref={canvasRef} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              renderContent()
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

      <ChatWidget currentUser={currentUser} />
    </>
  );
}
