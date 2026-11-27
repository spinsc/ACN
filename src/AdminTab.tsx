// @ts-nocheck
import { supabase } from './supabaseClient';
import { anexarValoresDosFretes, anexarValoresDasCotacoesDeFrete, anexarValoresDoFaturamento } from './FreteValores';
import { iniciarVerComo } from './VerComo';
import { explicarErroDeEnvio } from './ErroDeArquivo';
import { enviarArquivoPrivado } from './ArquivoPrivado';
import { LinkDeArquivo } from './ArquivoPrivadoTela';
import { confirmarRemocao, mostrarAviso } from './Feedback';
import { Faixa } from './Interface';
import { explicarErroDoBanco } from './ErroDoBanco';
import React, { useState, useEffect } from 'react';
import Linkify from './Linkify';
import { criadoEmLabel, paraCampoDataHora } from './AvisoSistemaWidget';
import { podePublicarAviso, podeMexerNoAviso } from './utils/permissoes';
import { CentrosCustoManager } from './CentroCustoFicha';
import { confirmar } from './Feedback';
import { CampoTelefone } from './CampoTelefone';
import { erroDeTelefone, whatsappParaGravar } from './Telefone';
import PainelFeriados from './FeriadosAdmin';
import PermissoesDoUsuario from './PermissoesDoUsuario';
import MatrizDePermissoes from './MatrizDePermissoes';
import HistoricoDePermissoes from './HistoricoDePermissoes';
import { Tag, Chips } from './Interface';
import { resumoDosExtras, IDS_DAS_ABAS, extrasMarcadosDoForm, formDosExtras, ligarExtrasDoModelo, contarExtrasDoModelo } from './PermissoesCatalogo';
// só conta as abas que a tela de permissões mostra (24/11/2026): ids guardados fora do catálogo, como comissoes_tecnicos, não entram na conta
const contarAbas = (abas: string[]) => IDS_DAS_ABAS.filter(id => abas.includes(id)).length;
import { PainelFipeSync } from './Veiculos';
import { PainelFichasVeiculos } from './VeiculoCadastro';
import ConfigEstruturaTela from './ConfigEstruturaTela';
import FluxoConfigTela from './FluxoConfigTela';
// 12e83 (26/11/2026): os painéis Config. Email, Config. Cotações, Faixas de Markup e Config. NFC moram em AdminPaineisConfig.tsx, já no padrão do design system
import { PainelEmailCfg, PainelCotacoesCfg, PainelMarkupCfg, PainelNfcCfg } from './AdminPaineisConfig';
// 12e84 (26/11/2026): o painel Logs do Sistema (log de movimentações das OPs) mora em AdminPainelLogs.tsx, já no padrão do design system
import { PainelLogs } from './AdminPainelLogs';
// 12e85 (26/11/2026): o painel Checklist CQ (itens que a Qualidade confere em cada veículo) mora em AdminPainelChecklist.tsx, já no padrão do design system
import { PainelChecklist } from './AdminPainelChecklist';
// 12e86 (26/11/2026): o painel Metas KPI (as metas de lead time por setor e o realizado) mora em AdminPainelKPI.tsx, no padrão do design system, com a 7.x de achados no cabeçalho dele.
import { PainelKPI } from './AdminPainelKPI';
// 12e87 (26/11/2026): o painel Lixeira (24h) mora em AdminPainelLixeira.tsx, no padrão do design system, com a 7.x de achados no cabeçalho dele.
import { PainelLixeira } from './AdminPainelLixeira';
import { CampoMoeda } from './CampoMoeda';
import { useAbaNoEndereco } from './AbaNoEndereco';


const PERFIS = [
  'Admin','Gerente','Gerente Comercial','Gerente administrativo','Gerente Produção','Gerente de Licitações','Comercial',
  'Engenharia','PCP','Produção','Chicote','Serralheria',
  'Laboratório','Compras','Almoxarifado','CQ',
  'Logística','Vistorias','Fiscal','SAC','CRM',
  'Licitações','RH','Marketing','Visualizador',
];

// ---- USUARIOS ----
const TODAS_ABAS = [
  { id:'dashboard',    label:'Dashboard' },
  { id:'comercial',    label:'1. Comercial' },
  { id:'engenharia',   label:'2. Engenharia' },
  { id:'ajustes',      label:'2b. Demandas Avulsas' },
  { id:'pcp',          label:'3. PCP' },
  { id:'serralheria',  label:'4b. Serralheria' },
  { id:'chicotes',     label:'4c. Chicotes' },
  { id:'laboratorio',  label:'5. Laboratorio' },
  { id:'compras',      label:'6. Compras' },
  { id:'almoxarifado', label:'7. Almoxarifado' },
  { id:'producao',     label:'8. Producao' },
  { id:'qualidade',    label:'9. CQ & Historico' },
  { id:'logistica',    label:'10. Logistica In/Out' },
  { id:'vistorias',    label:'11. Vistorias Patio' },
  { id:'fiscal',       label:'12. Fiscal' },
  { id:'marketing',    label:'Marketing' },
  { id:'sac',          label:'SAC' },
  { id:'nfc',          label:'📱 Dossiê NFC' },
  { id:'telecom',      label:'Telecom' },
  { id:'crm',          label:'CRM' },
  { id:'licitacoes',   label:'Licitações' },
  { id:'cotacoes',     label:'Cotações' },
  { id:'rh',           label:'RH' },
  { id:'comissoes_tecnicos', label:'Comissões de Técnicos (sem o RH inteiro)' },
  { id:'relatorios',      label:'Relatorios' },
  { id:'formacao_precos', label:'Formação de Preços' },
  { id:'viagens',         label:'Viagens' },
  // Abas que existiam no menu mas ficaram de fora desta lista — sem estar aqui,
  // o Admin não conseguia liberá-las para ninguém (17/09/2026).
  { id:'cadastro_itens',    label:'Cadastro de Itens' },
  { id:'cadastro_produtos', label:'Produtos e Mercadorias' },
  { id:'clientes',          label:'Clientes' },
  { id:'calendario',        label:'Calendário' },
  { id:'financeiro',        label:'Financeiro' },
  { id:'admin',           label:'Admin' },
];

// ---- PERMISSÕES PADRÃO POR PERFIL ----
const PERFIS_PADRAO_ABAS: Record<string, string[]> = {
  'Admin':             ['dashboard','comercial','engenharia','ajustes','pcp','serralheria','chicotes','laboratorio','compras','almoxarifado','producao','qualidade','logistica','vistorias','fiscal','marketing','sac','telecom','crm','licitacoes','rh','relatorios','admin','viagens'],
  'Gerente':           ['dashboard','comercial','engenharia','ajustes','pcp','serralheria','chicotes','laboratorio','compras','almoxarifado','producao','qualidade','logistica','vistorias','fiscal','marketing','sac','telecom','crm','licitacoes','rh','relatorios','admin','viagens'],
  'Gerente Comercial': ['dashboard','comercial','crm','licitacoes','relatorios','rh','cotacoes','formacao_precos','cadastro_itens','cadastro_produtos','viagens'],
  'Comercial':         ['dashboard','comercial','crm','licitacoes','cotacoes','formacao_precos','cadastro_itens','cadastro_produtos','logistica','sac','ajustes','viagens'],
  'Engenharia':        ['dashboard','engenharia','ajustes','compras','almoxarifado'],
  'PCP':               ['dashboard','pcp','comercial','engenharia'],
  'Produção':          ['dashboard','producao','pcp'],
  'Chicote':           ['dashboard','chicotes','compras'],
  'Serralheria':       ['dashboard','serralheria','compras'],
  'Laboratório':       ['dashboard','laboratorio'],
  'Compras':           ['dashboard','compras','almoxarifado'],
  'Almoxarifado':      ['dashboard','almoxarifado','compras'],
  'CQ':                ['dashboard','qualidade'],
  'Logística':         ['dashboard','logistica','vistorias'],
  'Vistorias':         ['dashboard','vistorias'],
  'Fiscal':            ['dashboard','fiscal','comercial'],
  'SAC':               ['dashboard','sac','comercial'],
  'CRM':               ['dashboard','crm','comercial'],
  'Licitações':        ['dashboard','licitacoes','crm','comercial','cotacoes','formacao_precos','cadastro_itens','cadastro_produtos','logistica','sac','ajustes','viagens'],
  'RH':                ['dashboard','rh'],
  'Marketing':         ['dashboard','marketing','sac'],
  'Visualizador':      ['dashboard'],
};

const PERFIS_PADRAO_RH: Record<string, boolean> = {
  'Admin': true, 'Gerente': true, 'Gerente Comercial': true, 'RH': true,
};

function PainelUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [form, setForm] = useState({ nome:'', email:'', senha:'', perfil:'Comercial', whatsapp:'', abas_permitidas: ['dashboard'], pode_autorizar_rh: false, permissoes_crm: [], permissoes_rh: [], recebe_alerta_analise: false, pode_aprovar_compra: false, ve_todas_tarefas_financeiro: false, pode_deletar_anexos: false, pode_postar_inicio: false, pode_gerir_terceiros: false, pode_excluir_op: false, pode_alterar_numero_op: false, pode_excluir_formacao: false, pode_copiar_op: false, pode_excluir_registros: false, pode_corrigir_data_nota: false, ver_valores: true });
  const [showForm, setShowForm] = useState(false);
  const [histPessoa, setHistPessoa] = useState('');   // 24/11/2026: pessoa do botão "Histórico" da linha
  const [visao, setVisao] = useState('lista');   // 24/11/2026: 'lista' (editar) ou 'matriz' (quem tem o quê, só leitura)
  const [loading, setLoading] = useState(false);
  const [modalEditar, setModalEditar] = useState(null);
  const [editForm, setEditForm] = useState({ nome:'', email:'', whatsapp:'', perfil:'', novaSenha:'', abas_permitidas: TODAS_ABAS.map(a=>a.id), pode_autorizar_rh: false, permissoes_crm: [], permissoes_rh: [], recebe_alerta_analise: false, pode_postar_inicio: false, pode_gerir_terceiros: false, pode_excluir_op: false, pode_alterar_numero_op: false, pode_excluir_formacao: false, pode_copiar_op: false, pode_excluir_registros: false, pode_corrigir_data_nota: false, ver_valores: true, gestor_id: null });
  const [perfisDB, setPerfisDB] = useState([]);
  // Etapa 16c (10/10/2026): definir a senha de OUTRA pessoa exige a senha de quem está definindo (um Admin) — conferida no servidor, que guarda só o resumo da nova.
  const [senhaAdmin, setSenhaAdmin] = useState('');

  // Perfis disponíveis = padrão + qualquer extra criado no banco
  const perfisDisponiveis = [
    ...PERFIS,
    ...(perfisDB as any[]).map((p:any)=>p.nome).filter((n:string)=>!PERFIS.includes(n)),
  ];

  useEffect(() => { fetchUsuarios(); fetchPerfisDB(); }, []);

  const fetchUsuarios = async () => {
    setLoading(true);
    const { data } = await supabase.from('auth_usuarios').select('*').order('nome');
    setUsuarios(data || []);
    setLoading(false);
  };

  const fetchPerfisDB = async () => {
    try {
      const { data } = await supabase.from('admin_perfis_sistema').select('nome, abas_permitidas, pode_autorizar_rh, extras');
      setPerfisDB(data || []);
    } catch {}
  };

  const aplicarPerfil = (nomePerfil: string, target: 'form' | 'editForm') => {
    const pDB = perfisDB.find((p: any) => p.nome === nomePerfil);
    const abas: string[] = pDB ? (pDB.abas_permitidas || ['dashboard']) : (PERFIS_PADRAO_ABAS[nomePerfil] || ['dashboard']);
    const autoRH: boolean = pDB ? (pDB.pode_autorizar_rh || false) : (PERFIS_PADRAO_RH[nomePerfil] || false);
    // 24/11/2026: o modelo também liga as permissões extras que guarda (só liga: nunca tira as que a pessoa já tem)
    const extras = pDB?.extras || {};
    if (target === 'form') {
      setForm(f => ({ ...f, abas_permitidas: abas, pode_autorizar_rh: autoRH || extras.pode_autorizar_rh === true, ...ligarExtrasDoModelo(f, extras) }));
    } else {
      setEditForm(f => ({ ...f, abas_permitidas: abas, pode_autorizar_rh: autoRH || extras.pode_autorizar_rh === true, ...ligarExtrasDoModelo(f, extras) }));
    }
  };

  const abrirEditar = (u) => {
    const abas = Array.isArray(u.abas_permitidas) && u.abas_permitidas.length > 0
      ? u.abas_permitidas
      : TODAS_ABAS.map(a=>a.id);
    setEditForm({ nome: u.nome||'', email: u.email||'', whatsapp: u.whatsapp||'', perfil: u.perfil||'Operador', novaSenha:'', abas_permitidas: abas, pode_autorizar_rh: u.pode_autorizar_rh||false, permissoes_crm: Array.isArray(u.permissoes_crm) ? u.permissoes_crm : [], permissoes_rh: Array.isArray(u.permissoes_rh) ? u.permissoes_rh : [], recebe_alerta_analise: u.recebe_alerta_analise||false, pode_aprovar_compra: u.pode_aprovar_compra||false, ve_todas_tarefas_financeiro: u.ve_todas_tarefas_financeiro||false, pode_deletar_anexos: u.pode_deletar_anexos||false, pode_postar_inicio: u.pode_postar_inicio === true, pode_gerir_terceiros: u.pode_gerir_terceiros === true, pode_excluir_op: u.pode_excluir_op === true, pode_alterar_numero_op: u.pode_alterar_numero_op === true, pode_excluir_formacao: u.pode_excluir_formacao === true, pode_copiar_op: u.pode_copiar_op === true, pode_excluir_registros: u.pode_excluir_registros === true, pode_corrigir_data_nota: u.pode_corrigir_data_nota === true, ver_valores: u.ver_valores !== false, gestor_id: u.gestor_id || null });
    setModalEditar(u);
  };

  const definirSenhaPeloAdmin = async (usuarioId, nova) => {
    const eu = JSON.parse(localStorage.getItem('user') || '{}');
    if (!senhaAdmin) { alert('Informe a sua senha (de Admin) para definir a senha de outra pessoa.'); return false; }
    const { data, error } = await supabase.rpc('auth_admin_definir_senha', { p_admin_id: eu?.id, p_admin_senha: senhaAdmin, p_usuario_id: usuarioId, p_nova: nova });
    if (error) { alert('Erro: ' + error.message); return false; }
    if (!data?.ok) {
      alert(data?.erro === 'sem_permissao' ? 'Sua senha de Admin não confere (ou você não é Admin).' : data?.erro === 'senha_curta' ? 'A senha precisa ter no mínimo 4 caracteres.' : 'Não foi possível definir a senha: ' + (data?.erro || 'erro'));
      return false;
    }
    return true;
  };

  const salvarEdicao = async () => {
    if (!editForm.nome || !editForm.email) { alert('Nome e e-mail são obrigatórios!'); return; }
    // 04/11/2026: o WhatsApp preenchido precisa ser completo (DDD + número); grava só dígitos com o 55 na frente, como o envio de mensagem espera
    const recusaWhats = erroDeTelefone(editForm.whatsapp, 'WhatsApp');
    if (recusaWhats) { alert(recusaWhats); return; }
    // a senha vai primeiro: se a senha do Admin não conferir, nada do cadastro é gravado pela metade
    if (editForm.novaSenha.length >= 4 && !(await definirSenhaPeloAdmin(modalEditar.id, editForm.novaSenha))) return;
    const updates = {
      nome: editForm.nome.toUpperCase(),
      email: editForm.email,
      perfil: editForm.perfil,
      whatsapp: whatsappParaGravar(editForm.whatsapp) || null,
      abas_permitidas: editForm.abas_permitidas,
      pode_autorizar_rh: editForm.pode_autorizar_rh,
      pode_aprovar_compra: !!editForm.pode_aprovar_compra,
      ve_todas_tarefas_financeiro: !!editForm.ve_todas_tarefas_financeiro,
      // a caixa "Pode excluir anexos em Licitações" existia na tela, mas não era carregada nem gravada:
      // abria sempre desmarcada e marcar não tinha efeito (achado em 29/09/2026)
      pode_deletar_anexos: !!editForm.pode_deletar_anexos,
      // Tela Início (09/11/2026): quem pode postar slides do carrossel, datas da empresa e imagens (o Admin sempre pode; o banco confere pela função pode_postar_inicio)
      pode_postar_inicio: !!editForm.pode_postar_inicio,
      // Serviços de terceiros (24/11/2026): quem cadastra prestadores e monta a ordem em lote além de Admin, gerentes e Adaptação (o banco confere pela marca)
      pode_gerir_terceiros: !!editForm.pode_gerir_terceiros,
      // Ações sensíveis por pessoa (24/11/2026, etapa 5 da revisão de permissões); os bancos conferem as marcas de excluir OP, nº da OP e excluir formação
      pode_excluir_op: !!editForm.pode_excluir_op,
      pode_alterar_numero_op: !!editForm.pode_alterar_numero_op,
      pode_excluir_formacao: !!editForm.pode_excluir_formacao,
      pode_copiar_op: !!editForm.pode_copiar_op,
      pode_excluir_registros: !!editForm.pode_excluir_registros,
      pode_corrigir_data_nota: !!editForm.pode_corrigir_data_nota,
      permissoes_crm: editForm.permissoes_crm,
      permissoes_rh: editForm.permissoes_rh,
      recebe_alerta_analise: editForm.recebe_alerta_analise,
      gestor_id: editForm.gestor_id || null,
    };
    const renomeou = updates.nome !== modalEditar.nome;
    const { error } = await supabase.from('auth_usuarios').update(updates).eq('id', modalEditar.id);
    if (error) { alert('Não foi possível salvar: ' + explicarErroDoBanco(error)); return; }
    // ver_valores salvo separadamente — requer coluna no BD:
    // ALTER TABLE auth_usuarios ADD COLUMN IF NOT EXISTS ver_valores boolean DEFAULT true;
    await supabase.from('auth_usuarios').update({ ver_valores: editForm.ver_valores }).eq('id', modalEditar.id);
    // plano "pessoa por ID" (U5, 24/11/2026): o banco leva o nome novo a todos os registros da pessoa pelo ID e anota quantos acompanharam; o Admin vê o número na hora
    if (renomeou) {
      const { data: reg, error: erroReg } = await supabase.from('usuarios_renomeios').select('registros').eq('usuario_id', modalEditar.id).order('em', { ascending: false }).limit(1).maybeSingle();
      if (erroReg || !reg) mostrarAviso(`Nome alterado para ${updates.nome}. Os registros da pessoa acompanham o nome novo pelo ID (não foi possível ler quantos).`, 'info');
      else mostrarAviso(`Nome alterado para ${updates.nome}: ${Number(reg.registros).toLocaleString('pt-BR')} registros (responsável, criado por, menções, histórico…) acompanharam o nome novo.`, 'ok');
    }
    setSenhaAdmin(''); setModalEditar(null); fetchUsuarios();
  };

  // "Ver como" — pra o admin testar o sistema exatamente com o perfil/
  // permissões de outro usuário, sem precisar saber a senha dele. Salva a
  // sessão atual (pra poder voltar, ver o banner/botão em DashboardTab.tsx)
  // e troca a sessão ativa pela do usuário-alvo, montada no mesmo formato
  // usado no login (ver LoginTab.tsx).
  const verComoUsuario = async (u: any) => {
    if (!u.ativo) { alert('Este usuário está inativo — reative antes de testar com a sessão dele.'); return; }
    if (!await confirmar(`Acessar o sistema como "${u.nome}" (${u.perfil})?\n\nVocê pode voltar a qualquer momento pelo botão "Voltar ao Admin" que vai aparecer no topo da tela.`)) return;
    // 12/11/2026: o banco também passa a obedecer a pessoa vista (antes só a tela trocava e o banco seguia com a permissão do Admin).
    // Se o banco não aceitar, não troca nada: ver "como" só na tela daria uma imagem falsa do que a pessoa enxerga.
    const ligou = await iniciarVerComo(u.email);
    if (!ligou.ok) { alert('Não foi possível ligar o "Ver como" no banco: ' + (ligou.erro || 'sem resposta') + '\n\nNada foi trocado.'); return; }
    try {
      const atual = localStorage.getItem('user');
      if (atual) localStorage.setItem('admin_sessao_original', atual);
      localStorage.setItem('user', JSON.stringify({
        id: u.id, email: u.email, nome: u.nome, perfil: u.perfil,
        abas_permitidas: Array.isArray(u.abas_permitidas) ? u.abas_permitidas : [],
        primeiro_acesso: false,
        pode_autorizar_rh: u.pode_autorizar_rh || false,
        permissoes_crm: Array.isArray(u.permissoes_crm) ? u.permissoes_crm : [],
        permissoes_rh: Array.isArray(u.permissoes_rh) ? u.permissoes_rh : [],
        recebe_alerta_analise: u.recebe_alerta_analise || false,
        pode_aprovar_compra: u.pode_aprovar_compra || false,
        eh_dev: u.eh_dev || false,
        ver_valores: u.ver_valores !== false,                      // R7 (13/10/2026): como o login monta (vazio vale "vê")
        pode_deletar_anexos: u.pode_deletar_anexos === true,
        pode_postar_inicio: u.pode_postar_inicio === true,
        pode_gerir_terceiros: u.pode_gerir_terceiros === true,
        pode_excluir_op: u.pode_excluir_op === true, pode_alterar_numero_op: u.pode_alterar_numero_op === true, pode_excluir_formacao: u.pode_excluir_formacao === true, pode_copiar_op: u.pode_copiar_op === true, pode_excluir_registros: u.pode_excluir_registros === true, pode_corrigir_data_nota: u.pode_corrigir_data_nota === true,
        ultimo_login_anterior: null,
      }));
    } catch (e: any) { alert('Erro: ' + e.message); return; }
    window.location.href = window.location.origin + import.meta.env.BASE_URL;
  };

  const excluirUsuario = async (u) => {
    if (!await confirmar(`Excluir permanentemente "${u.nome}"? Esta ação não pode ser desfeita.`)) return;
    await supabase.from('auth_usuarios').delete().eq('id', u.id);
    fetchUsuarios();
  };

  const salvar = async () => {
    if (!form.nome || !form.email || !form.senha) { alert('Preencha nome, email e senha!'); return; }
    if (form.senha.length < 4) { alert('A senha precisa ter no mínimo 4 caracteres.'); return; }
    const recusaWhats = erroDeTelefone(form.whatsapp, 'WhatsApp');   // 04/11/2026: WhatsApp preenchido precisa ser completo
    if (recusaWhats) { alert(recusaWhats); return; }
    if (!senhaAdmin) { alert('Informe a sua senha (de Admin) para criar o usuário com senha.'); return; }
    // confere a senha do Admin ANTES de criar, para não deixar um usuário criado sem senha por causa de um erro de digitação
    const eu = JSON.parse(localStorage.getItem('user') || '{}');
    const { data: adminConfere, error: erroConfere } = await supabase.rpc('auth_confirmar_senha', { p_usuario_id: eu?.id, p_senha: senhaAdmin });
    if (erroConfere) { alert('Erro: ' + erroConfere.message); return; }
    if (adminConfere !== true) { alert('Sua senha de Admin não confere.'); return; }
    // a senha nunca vai para a tabela de usuários (16d: a coluna deixou de existir): o usuário nasce sem senha e ela é definida pela função do servidor, que guarda só o resumo
    const { senha: _senhaDigitada, ...dadosDoUsuario } = form;
    const { data: novo, error } = await supabase.from('auth_usuarios').insert([{ ...dadosDoUsuario, whatsapp: whatsappParaGravar(form.whatsapp) || null, ativo: true }]).select('id').single();
    if (error) { alert('Não foi possível criar o usuário: ' + explicarErroDoBanco(error)); return; }
    if (!(await definirSenhaPeloAdmin(novo.id, form.senha))) alert('O usuário foi criado, mas ficou SEM senha definida. Abra "Editar" nele e defina a senha.');
    setSenhaAdmin('');
    setForm({ nome:'', email:'', senha:'', perfil:'Comercial', whatsapp:'', abas_permitidas: ['dashboard'], pode_autorizar_rh: false, permissoes_crm: [], permissoes_rh: [], recebe_alerta_analise: false, pode_aprovar_compra: false, ve_todas_tarefas_financeiro: false, pode_deletar_anexos: false, pode_postar_inicio: false, pode_gerir_terceiros: false, ver_valores: true });
    setShowForm(false); fetchUsuarios();
  };

  const toggleAtivo = async (u) => {
    await supabase.from('auth_usuarios').update({ ativo: !u.ativo }).eq('id', u.id);
    fetchUsuarios();
  };

  const alterarPerfil = async (u, perfil) => {
    await supabase.from('auth_usuarios').update({ perfil }).eq('id', u.id);
    fetchUsuarios();
  };

  return (
    <div>
      {/* MODAL EDITAR USUÁRIO */}
      {modalEditar && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:820,width:"95vw",maxHeight:'90vh',overflowY:'auto'}}>
            <div className="modal-title">✏️ Editar Usuário — {modalEditar.nome}</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
              <div style={{gridColumn:'1/-1'}}>
                <label className="acn-label">Nome *</label>
                <input className="acn-input" style={{width:'100%'}}
                  value={editForm.nome}
                  onChange={e=>setEditForm(f=>({...f,nome:e.target.value.toUpperCase()}))} />
                {/* U5 do plano "pessoa por ID" (24/11/2026): renomear é seguro, o nome novo acompanha todos os registros pelo ID da pessoa */}
                <div style={{marginTop:6}}>
                  <Faixa tom={String(editForm.nome || '').trim() !== String(modalEditar.nome || '').trim() ? 'atencao' : 'info'}>
                    {String(editForm.nome || '').trim() !== String(modalEditar.nome || '').trim()
                      ? <>Ao salvar, <b>{modalEditar.nome}</b> passa a ser <b>{String(editForm.nome || '').trim()}</b> em todos os registros (responsável, criado por, menções, histórico…): a pessoa é a mesma, pelo ID. Você verá quantos acompanharam.</>
                      : <>Pode renomear sem medo: o nome novo acompanha todos os registros da pessoa pelo ID, inclusive os antigos. Dois usuários não podem ter o mesmo nome.</>}
                  </Faixa>
                </div>
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label className="acn-label">E-mail *</label>
                <input className="acn-input" style={{width:'100%'}} type="email"
                  value={editForm.email}
                  onChange={e=>setEditForm(f=>({...f,email:e.target.value}))} />
              </div>
              <div>
                <label className="acn-label">📱 WhatsApp (DDD + número)</label>
                <CampoTelefone whatsapp style={{width:'100%'}}
                  placeholder="(11) 98765-4321"
                  valor={editForm.whatsapp}
                  onChange={v=>setEditForm(f=>({...f,whatsapp:v}))} />
              </div>
              <div>
                <label className="acn-label">Perfil</label>
                <select className="acn-input" style={{width:'100%'}}
                  value={editForm.perfil}
                  onChange={e=>setEditForm(f=>({...f,perfil:e.target.value}))}>
                  {perfisDisponiveis.map(p=><option key={p}>{p}</option>)}
                </select>
                <button className="acn-btn" style={{width:'100%',marginTop:4,background:'#0369a1',fontSize:9,padding:'3px 0'}}
                  onClick={()=>aplicarPerfil(editForm.perfil,'editForm')}
                  title="Preenche as abas e permissões conforme o perfil selecionado">
                  ⚡ Aplicar permissões do perfil
                </button>
              </div>
              <div>
                <label className="acn-label">👔 Gestor</label>
                <select className="acn-input" style={{width:'100%'}}
                  value={editForm.gestor_id || ''}
                  onChange={e=>setEditForm(f=>({...f,gestor_id:e.target.value || null}))}>
                  <option value="">— Nenhum —</option>
                  {usuarios.filter((u:any)=>u.id!==modalEditar.id).map((u:any)=>
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  )}
                </select>
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label className="acn-label">Nova Senha (deixe em branco para manter)</label>
                <input className="acn-input" style={{width:'100%'}} type="password"
                  placeholder="Mínimo 4 caracteres"
                  value={editForm.novaSenha}
                  onChange={e=>setEditForm(f=>({...f,novaSenha:e.target.value}))} />
              </div>
              {editForm.novaSenha.length > 0 && (
                <div style={{gridColumn:'1/-1'}}>
                  <label className="acn-label">Sua senha de Admin (para confirmar a nova senha)</label>
                  <input className="acn-input acn-adm-senha-admin" type="password" value={senhaAdmin}
                    onChange={e=>setSenhaAdmin(e.target.value)} />
                </div>
              )}
            </div>
            {/* Abas e permissões extras agrupadas como o menu (24/11/2026, pedido do usuário) */}
            <PermissoesDoUsuario valor={editForm} onChange={patch=>setEditForm(f=>({...f,...patch}))} />
            <div style={{display:'flex',gap:8,marginTop:4}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1}} onClick={salvarEdicao}>SALVAR</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalEditar(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="sec-card">
        <div className="sec-hdr">
          <span>Usuarios do Sistema ({usuarios.length})</span>
          <Chips rotulo="Visão" ativo={visao} onChange={setVisao} itens={[{ id: 'lista', rotulo: 'Lista' }, { id: 'matriz', rotulo: 'Matriz: quem tem o quê' }, { id: 'historico', rotulo: 'Histórico de permissões' }]} />
          {visao === 'lista' && (
            <button className="acn-btn" style={{background:'#1e293b'}} onClick={()=>setShowForm(s=>!s)}>
              {showForm ? 'Cancelar' : '+ Novo Usuario'}
            </button>
          )}
        </div>
        {visao === 'matriz' && <div className="sec-body"><MatrizDePermissoes usuarios={usuarios} /></div>}
        {visao === 'historico' && <div className="sec-body"><HistoricoDePermissoes usuarios={usuarios} pessoaInicial={histPessoa} aoLimparPessoa={()=>setHistPessoa('')} /></div>}
        {visao === 'lista' && showForm && (
          <div className="sec-body" style={{borderBottom:'1px solid #e2e8f0'}}>
            <div className="form-row">
              <div className="form-group"><label className="acn-label">Nome Completo *</label>
                <input className="acn-input" style={{width:'100%'}} value={form.nome}
                  onChange={e=>setForm({...form,nome:e.target.value.toUpperCase()})} /></div>
              <div className="form-group"><label className="acn-label">E-mail (login) *</label>
                <input type="email" className="acn-input" style={{width:'100%'}} value={form.email}
                  onChange={e=>setForm({...form,email:e.target.value})} /></div>
              <div className="form-group"><label className="acn-label">Senha *</label>
                <input type="password" className="acn-input" style={{width:'100%'}} value={form.senha}
                  onChange={e=>setForm({...form,senha:e.target.value})} /></div>
              <div className="form-group"><label className="acn-label">Sua senha de Admin * (para confirmar)</label>
                <input type="password" className="acn-input acn-adm-senha-admin" value={senhaAdmin}
                  onChange={e=>setSenhaAdmin(e.target.value)} /></div>
              <div className="form-group"><label className="acn-label">Perfil</label>
                <select className="acn-input" style={{width:'100%'}} value={form.perfil}
                  onChange={e=>setForm({...form,perfil:e.target.value})}>
                  {perfisDisponiveis.map(p=><option key={p}>{p}</option>)}
                </select>
                <button className="acn-btn" style={{width:'100%',marginTop:4,background:'#0369a1',fontSize:9,padding:'3px 0'}}
                  onClick={()=>aplicarPerfil(form.perfil,'form')}
                  title="Preenche as abas conforme o perfil">
                  ⚡ Aplicar permissões do perfil
                </button>
              </div>
              <div className="form-group"><label className="acn-label">WhatsApp (DDD + número)</label>
                <CampoTelefone whatsapp style={{width:'100%'}} valor={form.whatsapp}
                  placeholder="Ex: (11) 98765-4321"
                  onChange={v=>setForm({...form,whatsapp:v})} />
              </div>
            </div>
            {/* Abas e permissões extras agrupadas como o menu (24/11/2026) */}
            <div style={{marginTop:8}}><PermissoesDoUsuario valor={form} onChange={patch=>setForm(f=>({...f,...patch}))} /></div>
            <button className="acn-btn" style={{background:'#22c55e',width:'100%',padding:'7px',marginTop:10}} onClick={salvar}>
              Criar Usuario
            </button>
          </div>
        )}
        {visao === 'lista' && <div className="sec-body" style={{overflowX:'auto',padding:0}}>
          {loading ? <div className="acn-empty">Carregando...</div> : (
            <table>
              <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>📱 WhatsApp</th><th>Abas</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>
                {usuarios.length === 0
                  ? <tr><td colSpan={7} className="acn-empty">Nenhum usuario cadastrado.</td></tr>
                  : usuarios.map(u => {
                    const abas = Array.isArray(u.abas_permitidas) ? u.abas_permitidas : TODAS_ABAS.map(a=>a.id);
                    return (
                      <tr key={u.id} style={{opacity: u.ativo ? 1 : 0.5}}>
                        <td><strong>{u.nome}</strong></td>
                        <td>{u.email}</td>
                        <td>
                          <select className="acn-input" style={{padding:'2px 6px'}} value={u.perfil||'Operador'}
                            onChange={e=>alterarPerfil(u,e.target.value)}>
                            {perfisDisponiveis.map(p=><option key={p}>{p}</option>)}
                          </select>
                        </td>
                        <td>
                          <span style={{fontSize:9, color: u.whatsapp ? '#166534' : '#94a3b8', fontWeight: u.whatsapp ? 700 : 400}}>
                            {u.whatsapp ? `✓ ${u.whatsapp}` : '—'}
                          </span>
                        </td>
                        <td>
                          <div className="acn-perm-lista">
                            <span className="acn-perm-lista-abas">{contarAbas(abas) >= IDS_DAS_ABAS.length ? 'Todas as abas' : contarAbas(abas) + ' abas'}</span>
                            {resumoDosExtras(u).map(t => <Tag key={t}>{t}</Tag>)}
                          </div>
                        </td>
                        <td>
                          <span className="acn-badge" style={{background: u.ativo?'#22c55e':'#ef4444'}}>
                            {u.ativo?'Ativo':'Inativo'}
                          </span>
                        </td>
                        <td>
                          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                            <button className="acn-btn" style={{background:'#0ea5e9',fontSize:9}}
                              onClick={()=>verComoUsuario(u)}
                              title="Acessar o sistema com a sessão deste usuário, pra testar as permissões dele">
                              👁️ Ver como
                            </button>
                            <button className="acn-btn" style={{background:'#f59e0b',fontSize:9}}
                              onClick={()=>abrirEditar(u)}>✏️ Editar</button>
                            <button className="acn-btn" style={{background:'#64748b',fontSize:9}}
                              onClick={()=>{ setHistPessoa(String(u.id)); setVisao('historico'); }}
                              title="Ver quem mudou as permissões desta pessoa">🕘 Histórico</button>
                            <button className="acn-btn"
                              style={{background: u.ativo?'#ef4444':'#22c55e',fontSize:9}}
                              onClick={()=>toggleAtivo(u)}>
                              {u.ativo ? 'Desativar' : 'Reativar'}
                            </button>
                            {!u.ativo && (
                              <button className="acn-btn" style={{background:'#7f1d1d',fontSize:9}}
                                onClick={()=>excluirUsuario(u)}>🗑️ Excluir</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>}
      </div>
    </div>
  );
}

// ---- PAINEL DE PERFIS ----
function PainelPerfis() {
  const [perfis, setPerfis] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null); // {mode:'novo'|'editar', id?, nome?}
  const [form, setForm] = useState({ nome:'', descricao:'', abas_permitidas:['dashboard'], pode_autorizar_rh:false, ...formDosExtras({}) });
  const [salvando, setSalvando] = useState(false);
  const [importando, setImportando] = useState(false);

  useEffect(() => { fetchPerfis(); }, []);

  const fetchPerfis = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('admin_perfis_sistema').select('*').order('nome');
      if (!error) setPerfis(data || []);
    } catch {}
    setLoading(false);
  };

  const abrirNovo = () => {
    setForm({ nome:'', descricao:'', abas_permitidas:['dashboard'], pode_autorizar_rh:false, ...formDosExtras({}) });
    setModal({ mode:'novo' });
  };

  const abrirEditar = (p) => {
    setForm({ nome:p.nome, descricao:p.descricao||'', abas_permitidas:Array.isArray(p.abas_permitidas)?p.abas_permitidas:['dashboard'], pode_autorizar_rh:p.pode_autorizar_rh||false, ...formDosExtras({ ...(p.extras||{}), pode_autorizar_rh: p.pode_autorizar_rh === true || p.extras?.pode_autorizar_rh === true }) });
    setModal({ mode:'editar', id:p.id, nome:p.nome });
  };

  const toggleAba = (id) => setForm(f => ({
    ...f,
    abas_permitidas: f.abas_permitidas.includes(id)
      ? (id==='dashboard' ? f.abas_permitidas : f.abas_permitidas.filter(a=>a!==id))
      : [...f.abas_permitidas, id]
  }));

  const salvar = async () => {
    if (!form.nome.trim()) { alert('Informe um nome para o perfil.'); return; }
    setSalvando(true);
    try {
      if (modal.mode === 'novo') {
        const { error } = await supabase.from('admin_perfis_sistema').insert([{
          nome: form.nome.trim(), descricao: form.descricao,
          abas_permitidas: form.abas_permitidas, pode_autorizar_rh: form.pode_autorizar_rh, extras: extrasMarcadosDoForm(form),
        }]);
        if (error) { alert('Erro: ' + error.message); return; }
      } else {
        const { error } = await supabase.from('admin_perfis_sistema').update({
          nome: form.nome.trim(), descricao: form.descricao,
          abas_permitidas: form.abas_permitidas, pode_autorizar_rh: form.pode_autorizar_rh, extras: extrasMarcadosDoForm(form),
        }).eq('id', modal.id);
        if (error) { alert('Erro: ' + error.message); return; }
      }
      setModal(null); fetchPerfis();
    } finally { setSalvando(false); }
  };

  const excluir = async (p) => {
    if (!await confirmar(`Excluir perfil "${p.nome}"?`)) return;
    await supabase.from('admin_perfis_sistema').delete().eq('id', p.id);
    fetchPerfis();
  };

  const importarPadroes = async () => {
    if (!await confirmar('Isso vai criar todos os perfis padrão que ainda não existem. Continuar?')) return;
    setImportando(true);
    const padroes = Object.entries(PERFIS_PADRAO_ABAS).map(([nome, abas]) => ({
      nome, abas_permitidas: abas,
      pode_autorizar_rh: PERFIS_PADRAO_RH[nome] || false, descricao: '',
    }));
    const existentes = perfis.map((p:any) => p.nome);
    const novos = padroes.filter(p => !existentes.includes(p.nome));
    if (novos.length === 0) { alert('Todos os perfis padrão já existem.'); setImportando(false); return; }
    const { error } = await supabase.from('admin_perfis_sistema').insert(novos);
    if (error) alert('Erro: ' + error.message);
    fetchPerfis(); setImportando(false);
  };

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">
          <span>Perfis de Acesso ({perfis.length})</span>
          <div style={{display:'flex',gap:6}}>
            <button className="acn-btn" style={{background:'#0369a1',fontSize:10}}
              onClick={importarPadroes} disabled={importando}>
              {importando ? 'Importando...' : '⚡ Importar Perfis Padrão'}
            </button>
            <button className="acn-btn" style={{background:'#166534'}} onClick={abrirNovo}>
              + Novo Perfil
            </button>
          </div>
        </div>
        <div style={{padding:'7px 12px',fontSize:10,color:'#64748b',background:'#f0fdf4',borderBottom:'1px solid #e2e8f0'}}>
          Configure as permissões padrão de cada perfil. Ao clicar em <strong>⚡ Aplicar permissões do perfil</strong> na tela de usuário, as abas serão preenchidas automaticamente.
        </div>
        {loading ? <div className="acn-empty">Carregando...</div>
        : perfis.length === 0 ? (
          <div className="acn-empty" style={{padding:24,textAlign:'center'}}>
            Nenhum perfil cadastrado.<br/>
            <button className="acn-btn" style={{background:'#0369a1',marginTop:12}} onClick={importarPadroes}>
              ⚡ Importar Perfis Padrão
            </button>
          </div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table>
              <thead><tr>
                <th>Perfil</th>
                <th>Descrição</th>
                <th style={{textAlign:'center'}}>Abas Liberadas</th>
                <th style={{textAlign:'center'}}>Autoriza RH</th>
                <th style={{textAlign:'center'}}>Outras extras</th>
                <th>Ações</th>
              </tr></thead>
              <tbody>
                {perfis.map((p:any) => (
                  <tr key={p.id}>
                    <td><strong>{p.nome}</strong></td>
                    <td style={{fontSize:10,color:'#64748b'}}>{p.descricao||'—'}</td>
                    <td style={{textAlign:'center'}}>
                      <span style={{fontSize:10,fontWeight:700,
                        color: (p.abas_permitidas||[]).length===TODAS_ABAS.length ? '#22c55e' : '#3b82f6'}}>
                        {(p.abas_permitidas||[]).length===TODAS_ABAS.length
                          ? `Todas (${TODAS_ABAS.length})`
                          : `${(p.abas_permitidas||[]).length} abas`}
                      </span>
                    </td>
                    <td style={{textAlign:'center'}}>
                      {p.pode_autorizar_rh
                        ? <span style={{color:'#7c3aed',fontWeight:700,fontSize:13}}>✓</span>
                        : <span style={{color:'#e2e8f0'}}>—</span>}
                    </td>
                    <td style={{textAlign:'center',fontSize:11,color:'#475569'}}>{Math.max(0, contarExtrasDoModelo(p.extras) - (p.extras?.pode_autorizar_rh === true ? 1 : 0)) || '—'}</td>
                    <td>
                      <div style={{display:'flex',gap:4}}>
                        <button className="acn-btn" style={{background:'#f59e0b',fontSize:9}}
                          onClick={()=>abrirEditar(p)}>✏️ Editar</button>
                        <button className="acn-btn" style={{background:'#ef4444',fontSize:9}}
                          onClick={()=>excluir(p)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL CRIAR/EDITAR PERFIL */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:760,maxHeight:'92vh',overflowY:'auto'}}>
            <div className="modal-title">
              {modal.mode==='novo' ? '+ Novo Perfil de Acesso' : `✏️ Editar Perfil — ${modal.nome}`}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
              <div style={{gridColumn:'1/-1'}}>
                <label className="acn-label">Nome do Perfil *</label>
                <input className="acn-input" style={{width:'100%'}}
                  value={form.nome} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} />
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label className="acn-label">Descrição (opcional)</label>
                <input className="acn-input" style={{width:'100%'}}
                  placeholder="Ex: Acesso ao módulo de Engenharia e Demandas Avulsas"
                  value={form.descricao} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} />
              </div>
            </div>

            {/* 24/11/2026: o modelo usa o mesmo bloco do cadastro de usuário (telas + permissões extras) */}
            <div style={{marginBottom:12}}>
              <PermissoesDoUsuario modelo valor={form} onChange={patch=>setForm(f=>({...f,...patch}))} />
            </div>

            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1,padding:'7px'}} onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'SALVAR PERFIL'}
              </button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModal(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- PAINEL DADOS / LIMPEZA ----
const TABELAS_CONFIG = [
  { id:'oples',                 label:'OPs',                    desc:'Ordens de Produção',                      cor:'#2563eb' },
  { id:'sac_ordens_servico',    label:'SAC — OS',                desc:'Ordens de Serviço SAC',                   cor:'#0f766e' },
  { id:'demandas_setoriais',    label:'Demandas Setoriais',       desc:'Demandas e Ajustes',                      cor:'#f59e0b' },
  { id:'demandas_avulsas',      label:'Demandas Avulsas',         desc:'Engenharia — tarefas livres',             cor:'#7c3aed' },
  { id:'logistica_manifestos',  label:'Logística In/Out',         desc:'Manifestos de envio/recebimento',         cor:'#0891b2' },
  { id:'rh_autorizacoes',       label:'Autorizações RH',          desc:'Autorizações de saída/entrada antecipada',cor:'#ea580c' },
  // ── CRM / Licitações ──────────────────────────────────────────────────────
  { id:'licitacoes',            label:'Licitações',                desc:'Base de licitações cadastradas',          cor:'#1e3a5f' },
  { id:'crm_oportunidades',     label:'CRM — Oportunidades',      desc:'Licitações e Vendas Diretas',             cor:'#0891b2' },
  { id:'crm_historico',         label:'CRM — Histórico',          desc:'Movimentações e auditoria do funil',      cor:'#0369a1' },
  { id:'crm_vendas',            label:'CRM — Vendas Fechadas',    desc:'OPs/OSs geradas a partir do CRM',         cor:'#16a34a' },
  { id:'crm_contatos',          label:'CRM — Contatos',           desc:'Pessoas físicas e leads do CRM',          cor:'#0d9488' },
  { id:'crm_interacoes',        label:'CRM — Interações',         desc:'Ligações, WA, reuniões registradas',      cor:'#6366f1' },
  { id:'crm_anexos',            label:'CRM — Anexos',             desc:'Arquivos anexados às oportunidades',      cor:'#78716c' },
  // ── Compras / Financeiro ─────────────────────────────────────────────────
  { id:'pcp_pedidos_compra',       label:'Compras — Pedidos',        desc:'Requisições de compra e status',          cor:'#b45309' },
  { id:'pcp_cotacoes_fornecedores',label:'Compras — Cotações',       desc:'Cotações de fornecedores (Mesa)',         cor:'#d97706' },
  { id:'pcp_aprovacoes',           label:'Compras — Aprovações',     desc:'Alçadas e aprovações por departamento',   cor:'#c2410c' },
  { id:'pcp_pedidos_faturamento',  label:'Financeiro — Faturamento', desc:'Conferência técnica e faturamento de compras', cor:'#065f46' },
  // ── Fretes / Chicotes / Serralheria ─────────────────────────────────────
  { id:'pcp_fretes',               label:'Fretes',                   desc:'Cotações e contratação de frete',         cor:'#0e7490' },
  { id:'pcp_cotacoes_fretes',      label:'Fretes — Cotações',        desc:'Cotações de transportadoras',             cor:'#155e75' },
  { id:'pcp_pedidos_chicotes',     label:'Chicotes — Pedidos',       desc:'Pedidos internos de chicotes',            cor:'#4d7c0f' },
  { id:'pcp_pedidos_serralheria',  label:'Serralheria — Pedidos',    desc:'Pedidos internos de serralheria',         cor:'#65a30d' },
  // ── Outros ───────────────────────────────────────────────────────────────
  { id:'clientes',              label:'Cadastro Clientes',         desc:'Base unificada de clientes PF/PJ',        cor:'#0f766e' },
  { id:'logs_movimentacao_opl', label:'Logs de OP',              desc:'Histórico de movimentações',              cor:'#475569' },
  { id:'cq_auditorias',         label:'Auditorias CQ',            desc:'Registros de qualidade',                  cor:'#dc2626' },
  { id:'vistorias_patio',       label:'Vistorias de Pátio',       desc:'Vistorias de veículos no pátio',          cor:'#334155' },
  { id:'vouchers_servico',      label:'Vouchers de Serviço',      desc:'Vouchers autorizados (terceiros)',        cor:'#9333ea' },
  { id:'ajustes_trabalhos',     label:'Ajustes/Retrabalhos',      desc:'Registros de ajuste pós-entrega',         cor:'#be123c' },
  { id:'analise_solicitacoes',  label:'Análise entre Setores',    desc:'Solicitações de análise técnica',         cor:'#7c2d12' },
  { id:'agenda_compromissos',   label:'Agenda',                   desc:'Compromissos agendados',                  cor:'#4338ca' },
  { id:'agendamentos_manutencao',label:'Agend. Manutenção',       desc:'Agenda de manutenção veicular',           cor:'#0369a1' },
  { id:'chamados_suporte',      label:'Chamados de Suporte',      desc:'Chamados abertos pelos usuários',         cor:'#57534e' },
  { id:'mencoes',               label:'Menções (@)',              desc:'Notificações de menção entre usuários',   cor:'#525252' },
  { id:'op_acompanhamentos',    label:'Acompanhamentos de OP',   desc:'Comentários/andamento nas OPs',          cor:'#71717a' },
  { id:'licitacao_documentos',  label:'Licitações — Documentos',  desc:'Notas e documentos anexados a licitações',cor:'#312e81' },
  { id:'veiculos_nfc',          label:'Dossiê NFC — Veículos',    desc:'Veículos cadastrados no dossiê NFC',      cor:'#166534' },
];

function PainelDados() {
  const [tabelaAtiva, setTabelaAtiva] = useState('oples');
  const [registros, setRegistros] = useState([]);
  const [avisoValores, setAvisoValores] = useState('');
  const [loading, setLoading] = useState(false);
  const [contagens, setContagens] = useState({});
  const [selecionados, setSelecionados] = useState(new Set());
  const [confirmLimpar, setConfirmLimpar] = useState(null);
  const [deletando, setDeletando] = useState(false);

  useEffect(() => { fetchContagens(); }, []);
  useEffect(() => { fetchRegistros(); setSelecionados(new Set()); }, [tabelaAtiva]);

  const fetchContagens = async () => {
    const counts = {};
    for (const t of TABELAS_CONFIG) {
      const { count } = await supabase.from(t.id).select('*', { count:'exact', head:true });
      counts[t.id] = count ?? 0;
    }
    setContagens(counts);
  };

  const fetchRegistros = async () => {
    setLoading(true);
    const orderCol = tabelaAtiva === 'oples'               ? 'data_entrada'
      : tabelaAtiva === 'logs_movimentacao_opl'             ? 'data_hora'
      : tabelaAtiva === 'demandas_setoriais'                ? 'data_abertura'
      : tabelaAtiva === 'sac_ordens_servico'                ? 'data_abertura'
      : tabelaAtiva === 'cq_auditorias'                     ? 'created_at'
      : tabelaAtiva === 'logistica_manifestos'              ? 'data'
      : tabelaAtiva === 'rh_autorizacoes'                   ? 'data'
      : tabelaAtiva === 'crm_interacoes'                    ? 'data_interacao'
      : tabelaAtiva === 'licitacoes'                        ? 'criado_em'
      // tabelas com data_criacao
      : ['pcp_pedidos_compra','pcp_pedidos_chicotes','pcp_pedidos_serralheria','vistorias_patio']
        .includes(tabelaAtiva) ? 'data_criacao'
      : tabelaAtiva === 'ajustes_trabalhos'                 ? 'data_abertura'
      // tabelas com criado_em
      : ['demandas_avulsas','crm_oportunidades','crm_historico','crm_vendas',
         'crm_contatos','crm_anexos','clientes','pcp_cotacoes_fornecedores','pcp_aprovacoes',
         'pcp_pedidos_faturamento','pcp_fretes','pcp_cotacoes_fretes','analise_solicitacoes',
         'agenda_compromissos','mencoes','op_acompanhamentos','licitacao_documentos',
         'veiculos_nfc','vouchers_servico'].includes(tabelaAtiva) ? 'criado_em'
      : 'created_at';
    const { data, error } = await supabase.from(tabelaAtiva).select('*')
      .order(orderCol, { ascending: false }).limit(200);
    if (error) console.error('[PainelDados] fetchRegistros error:', error);
    // 26/11/2026 (V4d do "ver valores no banco", pedido do usuário): as colunas de dinheiro destas três tabelas ficam sempre nulas; o valor mora nas tabelas
    // `*_valores`, que o banco entrega ao Admin. Sem recolocá-lo a lista mostraria "—" e o JSON do registro, nulo. A cópia na lixeira (deletarSelecionados) leva o valor junto.
    let linhas = data || [];
    let falhaValores = '';
    if (!error && linhas.length) {
      const recolocar = tabelaAtiva === 'pcp_pedidos_faturamento' ? anexarValoresDoFaturamento(linhas).then(r => ({ linhas: r.faturamentos, erro: r.erro }))
        : tabelaAtiva === 'pcp_cotacoes_fretes' ? anexarValoresDasCotacoesDeFrete(linhas).then(r => ({ linhas: r.cotacoes, erro: r.erro }))
        : tabelaAtiva === 'pcp_fretes' ? anexarValoresDosFretes(linhas).then(r => ({ linhas: r.fretes, erro: r.erro }))
        : null;
      if (recolocar) {
        const r = await recolocar;
        if (r.erro) falhaValores = r.erro; else linhas = r.linhas;
      }
    }
    setAvisoValores(falhaValores ? `Não foi possível ler os valores desta tabela (${falhaValores}). Os campos de dinheiro aparecem vazios, mas isso não quer dizer que não existam.` : '');
    setRegistros(linhas);
    setLoading(false);
  };

  const toggleSelecionado = (id) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleTodos = () => {
    if (selecionados.size === registros.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(registros.map(r => r.id)));
    }
  };

  const deletarSelecionados = async () => {
    if (selecionados.size === 0) return;
    if (!await confirmar(`Deletar ${selecionados.size} registro(s) selecionado(s)?\n\nVocê poderá restaurar por até 24h na aba Lixeira.`)) return;
    setDeletando(true);
    const ids = Array.from(selecionados);
    // Salvar cópia na lixeira antes de deletar
    const registrosParaDeletar = registros.filter(r => ids.includes(r.id));
    if (registrosParaDeletar.length > 0) {
      await supabase.from('lixeira').insert(
        registrosParaDeletar.map(r => ({ tabela: tabelaAtiva, registro_id: String(r.id), dados: r }))
      );
    }
    const { error } = await supabase.from(tabelaAtiva).delete().in('id', ids);
    if (error) {
      console.error('[PainelDados] deletarSelecionados error:', error);
      alert(`Erro ao deletar: ${error.message}`);
    }
    setSelecionados(new Set());
    setDeletando(false);
    fetchRegistros(); fetchContagens();
  };

  const limparTabela = async (tabelaId) => {
    setDeletando(true);
    // Salvar até 500 registros na lixeira antes de deletar
    const { data: todos } = await supabase.from(tabelaId).select('*').limit(500);
    if (todos && todos.length > 0) {
      await supabase.from('lixeira').insert(
        todos.map(r => ({ tabela: tabelaId, registro_id: String(r.id), dados: r }))
      );
    }
    // Para tabelas com id uuid usa neq com uuid nulo; para bigint usa gt(0)
    const { error } = await supabase.from(tabelaId).delete().gte('id', 0);
    if (error) {
      // fallback para uuid
      await supabase.from(tabelaId).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }
    setConfirmLimpar(null);
    setDeletando(false);
    fetchRegistros(); fetchContagens();
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
  const tabelaInfo = TABELAS_CONFIG.find(t => t.id === tabelaAtiva);

  const getResumo = (r) => {
    if (tabelaAtiva === 'oples')
      return `OP ${r.opl || r.numero_opl || r.id} — ${r.cliente_nome || r.cliente || '?'} — ${r.status_geral || '?'}`;
    if (tabelaAtiva === 'demandas_setoriais')
      return `[${r.setor_destino}] ${r.descricao?.substring(0,60) || '?'} — ${r.status}`;
    if (tabelaAtiva === 'demandas_avulsas')
      return `[${r.status || '?'}] ${r.titulo?.substring(0,70) || '?'} — ${r.criado_por_nome || r.criado_por || '?'} · Prioridade: ${r.prioridade || '?'}`;
    if (tabelaAtiva === 'logistica_manifestos')
      return `${r.tipo || '?'} — ${r.descricao?.substring(0,60) || r.transportadora || '?'} — ${r.criado_por_nome || r.criado_por || '?'}`;
    if (tabelaAtiva === 'licitacoes')
      return `[${r.status || '?'}] ${r.numero || '?'} — ${r.nome_projeto || '?'} — ${r.orgao || '?'} — ${r.classificacao || '?'}`;
    if (tabelaAtiva === 'crm_oportunidades')
      return `[${r.funil === 'licitacao' ? '🏛️ Licitação' : '💼 Venda'}] ${r.titulo || '?'} — ${r.orgao || '?'} — Etapa: ${r.estagio_id ? '✓' : '?'} — R$ ${r.valor_estimado ? Number(r.valor_estimado).toLocaleString('pt-BR') : '—'}`;
    if (tabelaAtiva === 'crm_historico')
      return `${r.tipo || '?'}: ${r.conteudo?.substring(0,60) || '?'} — por ${r.usuario_nome || '?'}`;
    if (tabelaAtiva === 'crm_vendas')
      return `${r.tipo || '?'} — Número: ${r.numero || '?'} — ${r.cliente_nome || '?'} — R$ ${r.valor ? Number(r.valor).toLocaleString('pt-BR') : '—'}`;
    if (tabelaAtiva === 'crm_contatos')
      return `${r.nome || '?'} — ${r.empresa || '?'} — ${r.whatsapp || r.email || '?'} — op: ${r.operador_nome || '?'}`;
    if (tabelaAtiva === 'crm_interacoes')
      return `[${r.tipo || '?'}] ${r.resultado || '?'}: ${r.descricao?.substring(0,60) || '?'} — ${r.operador_nome || '?'}`;
    if (tabelaAtiva === 'crm_anexos')
      return `${r.tipo || '?'} — ${r.nome || '?'} — ${r.criado_por || '?'}`;
    if (tabelaAtiva === 'clientes')
      return `[${r.tipo || '?'}] ${r.nome || '?'} — ${r.documento || '?'} — ${r.cidade || '?'}${r.estado ? '/' + r.estado : ''}`;
    if (tabelaAtiva === 'logs_movimentacao_opl')
      return `OP ${r.numero_opl} → ${r.setor}: ${r.evento?.substring(0,50)}`;
    if (tabelaAtiva === 'cq_auditorias')
      return `OP ${r.numero_opl} — ${r.resultado} — ${r.auditor_nome}`;
    if (tabelaAtiva === 'sac_ordens_servico')
      return `OS ${r.numero_os || r.id} — ${r.cliente_nome || '?'} — ${r.status || '?'} — ${r.tipo_servico || '?'}`;
    if (tabelaAtiva === 'rh_autorizacoes')
      return `[${r.tipo || '?'}] ${r.data || '?'} — Saída: ${r.hora_saida || '—'} — ${r.motivo || '?'}`.substring(0,100);
    if (tabelaAtiva === 'pcp_pedidos_compra')
      return `Pedido ${r.numero_pedido || r.id} — ${r.descricao_material?.substring(0,50) || '?'} — ${r.fornecedor || '?'} — ${r.status_compra || '?'}`;
    if (tabelaAtiva === 'pcp_cotacoes_fornecedores')
      return `Cotação — ${r.fornecedor_nome || '?'} — por ${r.criado_por_nome || '?'}`;
    if (tabelaAtiva === 'pcp_aprovacoes')
      return `[${r.tipo || '?'}] Nível ${r.nivel ?? '?'} (${r.nivel_nome || r.aprovador_nome || '?'}) — ${r.status || '?'}`;
    if (tabelaAtiva === 'pcp_pedidos_faturamento')
      return `${r.numero_oc || r.numero_pedido || r.id} — ${r.fornecedor || '?'} — R$ ${r.valor ? Number(r.valor).toLocaleString('pt-BR') : '—'} — ${r.status_faturamento || '?'}`;
    if (tabelaAtiva === 'pcp_fretes')
      return `${r.descricao?.substring(0,60) || '?'} — ${r.status || '?'} — por ${r.criado_por_nome || '?'}`;
    if (tabelaAtiva === 'pcp_cotacoes_fretes')
      return `Cotação Frete — ${r.transportadora_nome || '?'} — R$ ${r.valor ? Number(r.valor).toLocaleString('pt-BR') : '—'}`;
    if (tabelaAtiva === 'pcp_pedidos_chicotes')
      return `Pedido ${r.numero_pedido || r.id} — ${r.descricao_chicote?.substring(0,50) || '?'} — OP ${r.opl || '?'} — ${r.status_chicote || '?'}`;
    if (tabelaAtiva === 'pcp_pedidos_serralheria')
      return `Pedido ${r.numero_pedido || r.id} — ${r.descricao_trabalho?.substring(0,50) || '?'} — OP ${r.opl || '?'} — ${r.status_serralheria || '?'}`;
    if (tabelaAtiva === 'vistorias_patio')
      return `Chassi ${r.chassi || '?'} — ${r.status || '?'} — por ${r.criado_por_nome || '?'}`;
    if (tabelaAtiva === 'vouchers_servico')
      return `${r.tipo_servico || '?'} — PV/OP ${r.numero_pvop || '?'} — ${r.prestador || '?'} — R$ ${r.valor_total ? Number(r.valor_total).toLocaleString('pt-BR') : '—'}`;
    if (tabelaAtiva === 'ajustes_trabalhos')
      return `Chassi ${r.chassi || '?'} — ${r.descricao?.substring(0,60) || '?'} — ${r.status || '?'}`;
    if (tabelaAtiva === 'analise_solicitacoes')
      return `[${r.origem || '?'}] ${r.origem_titulo || r.origem_numero || '?'} — Setores: ${Array.isArray(r.setores) ? r.setores.join(', ') : r.setores || '?'} — ${r.status || '?'}`;
    if (tabelaAtiva === 'agenda_compromissos')
      return `${r.titulo?.substring(0,60) || '?'} — ${r.usuario_nome || '?'}`;
    if (tabelaAtiva === 'agendamentos_manutencao')
      return `OP ${r.numero_opl || '?'} — ${r.cliente_nome || '?'} — ${r.data_agendamento || '?'} (${r.periodo || '?'})`;
    if (tabelaAtiva === 'chamados_suporte')
      return `${r.placa || r.chassi || '?'} — ${r.orgao_cliente || '?'} — ${r.descricao_defeito?.substring(0,50) || '?'} — ${r.status || '?'}`;
    if (tabelaAtiva === 'mencoes')
      return `${r.mencionante_nome || '?'} → @${r.mencionado_nome || '?'} — ${r.contexto_descricao?.substring(0,50) || r.contexto || '?'}`;
    if (tabelaAtiva === 'op_acompanhamentos')
      return `${r.usuario_nome || '?'}: ${r.texto?.substring(0,70) || '?'}`;
    if (tabelaAtiva === 'licitacao_documentos')
      return `${r.nome || '?'} — por ${r.criado_por_nome || '?'}`;
    if (tabelaAtiva === 'veiculos_nfc')
      return `Placa ${r.placa || '?'} — Chassi ${r.chassi || '?'}`;
    return r.id;
  };

  const getDataCol = (r) => r.data_abertura || r.criado_em || r.data_interacao || r.data_msg || r.data || r.created_at || r.data_hora || r.data_contato || r.data_criacao;
  const todosSelecionados = registros.length > 0 && selecionados.size === registros.length;
  const algumSelecionado = selecionados.size > 0;

  return (
    <div>
      {/* CARDS DE CONTAGEM */}
      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
        {TABELAS_CONFIG.map(t => (
          <div key={t.id} onClick={() => setTabelaAtiva(t.id)} style={{
            flex:'1 1 140px', minWidth:130, cursor:'pointer',
            background:'white', border:`2px solid ${tabelaAtiva===t.id ? t.cor : '#e2e8f0'}`,
            borderTop:`4px solid ${t.cor}`, borderRadius:6, padding:'8px 12px', transition:'border .1s',
          }}>
            <div style={{fontSize:9,color:'#64748b',textTransform:'uppercase',letterSpacing:'.3px'}}>{t.label}</div>
            <div style={{fontSize:22,fontWeight:700,color:t.cor,margin:'2px 0'}}>{contagens[t.id] ?? '...'}</div>
            <div style={{fontSize:9,color:'#94a3b8'}}>{t.desc}</div>
          </div>
        ))}
      </div>

      {/* BARRA DE AÇÕES */}
      <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:8,flexWrap:'wrap'}}>
        {algumSelecionado ? (
          <button className="acn-btn" style={{background:'#ef4444'}} onClick={deletarSelecionados} disabled={deletando}>
            {deletando ? 'Deletando...' : `🗑 Deletar ${selecionados.size} selecionado(s)`}
          </button>
        ) : (
          <span style={{fontSize:10,color:'#94a3b8'}}>Selecione registros para deletar</span>
        )}
        <div style={{marginLeft:'auto',display:'flex',gap:6}}>
          <button className="acn-btn" style={{background:'#475569',fontSize:10}} onClick={fetchRegistros}>↺ Atualizar</button>
          <button className="acn-btn" style={{background:'#ef4444',fontSize:10}} onClick={() => setConfirmLimpar(tabelaAtiva)}>
            ⚠️ Limpar Tabela Toda
          </button>
        </div>
      </div>

      {avisoValores && (
        <div role="alert" style={{background:'#fef2f2',border:'1px solid #fecaca',color:'#b91c1c',borderRadius:6,padding:'8px 12px',fontSize:11,marginBottom:8}}>{avisoValores}</div>
      )}

      {/* TABELA */}
      <div className="sec-card">
        <div className="sec-hdr" style={{background: tabelaInfo?.cor || '#1e293b', color:'white'}}>
          <span>{tabelaInfo?.label} — {registros.length} exibidos / {contagens[tabelaAtiva] ?? 0} total</span>
          {algumSelecionado && (
            <span style={{background:'rgba(255,255,255,.2)',padding:'2px 8px',borderRadius:4,fontSize:10}}>
              {selecionados.size} selecionado(s)
            </span>
          )}
        </div>
        <div className="sec-body" style={{overflowX:'auto',padding:0}}>
          {loading ? <div className="acn-empty">Carregando...</div> : registros.length === 0 ? (
            <div className="acn-empty">Nenhum registro nesta tabela.</div>
          ) : (
            <table>
              <thead><tr>
                <th style={{width:36,textAlign:'center'}}>
                  <input type="checkbox" checked={todosSelecionados}
                    onChange={toggleTodos} style={{cursor:'pointer',accentColor:'#ef4444'}} />
                </th>
                <th style={{width:145}}>Data</th>
                <th>Resumo</th>
              </tr></thead>
              <tbody>
                {registros.map(r => {
                  const sel = selecionados.has(r.id);
                  return (
                    <tr key={r.id} style={{background: sel ? '#fef2f2' : undefined, cursor:'pointer'}}
                      onClick={() => toggleSelecionado(r.id)}>
                      <td style={{textAlign:'center'}} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={sel}
                          onChange={() => toggleSelecionado(r.id)}
                          style={{cursor:'pointer',accentColor:'#ef4444'}} />
                      </td>
                      <td style={{whiteSpace:'nowrap',color:'#64748b',fontSize:10}}>{fmtDt(getDataCol(r))}</td>
                      <td style={{ fontSize:10, maxWidth:500, wordBreak:'break-word' }}
                        title={getResumo(r)}>{getResumo(r)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* MODAL CONFIRMAR LIMPEZA TOTAL */}
      {confirmLimpar && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:400}}>
            <div className="modal-title" style={{color:'#dc2626'}}>⚠️ Limpar Tabela Inteira</div>
            <p style={{fontSize:12,color:'#374151',marginBottom:16}}>
              Isso vai deletar <strong>TODOS os {contagens[confirmLimpar]} registros</strong> da tabela{' '}
              <strong>{TABELAS_CONFIG.find(t=>t.id===confirmLimpar)?.label}</strong>.<br/>
              Esta ação <strong>não pode ser desfeita</strong>.
            </p>
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#ef4444',flex:1,padding:'8px'}}
                onClick={() => limparTabela(confirmLimpar)} disabled={deletando}>
                {deletando ? 'Deletando...' : 'SIM, LIMPAR TUDO'}
              </button>
              <button className="acn-btn" style={{background:'#94a3b8',flex:1,padding:'8px'}}
                onClick={() => setConfirmLimpar(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- PAINEL NOTIFICAÇÕES ----
// 26/11/2026 (decisão do usuário: o WhatsApp não é usado no sistema): saiu a configuração dos eventos de aviso por WhatsApp (tabela notificacoes_config).
// Fica só "quem responde por cada perfil" (notificacoes_responsaveis), que o sistema usa para saber quem recebe as Menções de um setor
// (por exemplo, a chegada do veículo à matriz avisa o PCP e a Adaptação).

function PainelNotificacoes() {
  // Quem responde por um perfil sem ter esse perfil (ex.: PCP → Matheus)
  const [responsaveis, setResponsaveis] = useState<any[]>([]);
  const [usuariosAtivos, setUsuariosAtivos] = useState<any[]>([]);
  const [novoResp, setNovoResp] = useState({ perfil: '', usuario_id: '' });
  const [falhaLeitura, setFalhaLeitura] = useState('');
  const carregarResponsaveis = async () => {
    const [r, u] = await Promise.all([
      supabase.from('notificacoes_responsaveis').select('id, perfil, usuario_id, usuario:auth_usuarios(nome)').order('perfil'),
      supabase.from('auth_usuarios').select('id, nome, perfil').eq('ativo', true).order('nome'),
    ]);
    // leitura recusada nunca vale como "ninguém definido"
    if (r.error || u.error) { setFalhaLeitura('Não foi possível ler a lista de responsáveis. Atualize a página e tente de novo.'); return; }
    setFalhaLeitura('');
    setResponsaveis(r.data || []); setUsuariosAtivos(u.data || []);
  };
  useEffect(() => { carregarResponsaveis(); }, []);
  const addResponsavel = async () => {
    if (!novoResp.perfil || !novoResp.usuario_id) { alert('Escolha o perfil e a pessoa.'); return; }
    const { error } = await supabase.from('notificacoes_responsaveis').insert([novoResp]);
    if (error) { alert('Não foi possível adicionar: ' + error.message); return; }
    setNovoResp({ perfil: '', usuario_id: '' }); carregarResponsaveis();
  };
  const removerResponsavel = async (id: string) => {
    if (!await confirmarRemocao('este responsável da lista de avisos')) return;
    await supabase.from('notificacoes_responsaveis').delete().eq('id', id);
    carregarResponsaveis();
  };
  // os perfis padrão, os que existem em usuários ativos e os que já têm responsável
  const PERFIS_LISTA = [...new Set([...PERFIS, ...usuariosAtivos.map((u: any) => u.perfil).filter(Boolean), ...responsaveis.map((r: any) => r.perfil)])];

  return (
    <div>
      {falhaLeitura && <div className="acn-empty" style={{ color: 'var(--acn-bad)' }}>{falhaLeitura}</div>}
      <div className="sec-card">
        <div className="sec-hdr"><span>👤 Quem responde por cada perfil</span></div>
        <div className="sec-body" style={{ fontSize:11 }}>
          <div style={{ fontSize:10, color:'#64748b', marginBottom:8 }}>
            Recebe os avisos (Menções) de um perfil sem ter esse perfil (ex.: PCP → quem cuida do PCP). As permissões da pessoa não mudam.
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
            {responsaveis.map((r: any) => (
              <span key={r.id} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 9px', border:'1px solid #99f6e4', background:'#f0fdfa', borderRadius:12 }}>
                <strong>{r.perfil}</strong> → {r.usuario?.nome || '—'}
                <button onClick={() => removerResponsavel(r.id)} aria-label={`Remover ${r.usuario?.nome} de ${r.perfil}`}
                  style={{ border:'none', background:'none', color:'#94a3b8', cursor:'pointer', padding:0 }}>✕</button>
              </span>
            ))}
            {!responsaveis.length && !falhaLeitura && <span style={{ color:'#94a3b8' }}>Nenhum definido.</span>}
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <select className="acn-input" style={{ width:'auto' }} value={novoResp.perfil} onChange={e => setNovoResp(f => ({ ...f, perfil: e.target.value }))} aria-label="Perfil">
              <option value="">Perfil...</option>
              {PERFIS_LISTA.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="acn-input" style={{ width:'auto' }} value={novoResp.usuario_id} onChange={e => setNovoResp(f => ({ ...f, usuario_id: e.target.value }))} aria-label="Pessoa">
              <option value="">Pessoa...</option>
              {usuariosAtivos.map((u: any) => <option key={u.id} value={u.id}>{u.nome} ({u.perfil})</option>)}
            </select>
            <button className="acn-btn" style={{ background:'#0f766e' }} onClick={addResponsavel}>Adicionar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- PAINEL DE PLATAFORMAS ----
function PainelPlataformas() {
  const [plataformas, setPlataformas] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [form, setForm]               = useState({ nome:'', desconto_pct:0, retencao_pct:0 });
  const [editando, setEditando]       = useState(null);
  const [showForm, setShowForm]       = useState(false);
  const [salvando, setSalvando]       = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('plataformas_licitacao').select('*').order('nome');
    setPlataformas(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const salvar = async () => {
    if (!form.nome.trim()) { alert('Informe o nome da plataforma.'); return; }
    setSalvando(true);
    if (editando) {
      await supabase.from('plataformas_licitacao').update({
        nome: form.nome.trim(),
        desconto_pct: Number(form.desconto_pct) || 0,
        retencao_pct: Number(form.retencao_pct) || 0,
      }).eq('id', editando.id);
    } else {
      await supabase.from('plataformas_licitacao').insert([{
        nome: form.nome.trim(),
        desconto_pct: Number(form.desconto_pct) || 0,
        retencao_pct: Number(form.retencao_pct) || 0,
      }]);
    }
    setForm({ nome:'', desconto_pct:0, retencao_pct:0 });
    setEditando(null); setShowForm(false); setSalvando(false);
    load();
  };

  const excluir = async (id) => {
    if (!await confirmar('Excluir esta plataforma?')) return;
    await supabase.from('plataformas_licitacao').delete().eq('id', id);
    load();
  };

  const toggleAtivo = async (p) => {
    await supabase.from('plataformas_licitacao').update({ ativo: !p.ativo }).eq('id', p.id);
    load();
  };

  return (
    <div className="sec-card">
      <div className="sec-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span>🏪 Plataformas de Licitação</span>
        <button className="acn-btn" style={{ background:'#0891b2', fontSize:10 }}
          onClick={() => { setForm({ nome:'', desconto_pct:0, retencao_pct:0 }); setEditando(null); setShowForm(true); }}>
          + Nova Plataforma
        </button>
      </div>
      <div className="sec-body">
        <p style={{ fontSize:10, color:'#64748b', marginBottom:12 }}>
          Plataformas homologadas pelos órgãos públicos para gestão de contratação (NEO, QFrotas, Prime...).
          O desconto e a retenção são aplicados automaticamente na Formação de Preços quando a plataforma é selecionada.
        </p>

        {showForm && (
          <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:12, marginBottom:12 }}>
            <div style={{ fontWeight:700, fontSize:11, marginBottom:10 }}>
              {editando ? '✏️ Editar Plataforma' : '+ Nova Plataforma'}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:8, marginBottom:10 }}>
              <div>
                <label className="acn-label">Nome da Plataforma *</label>
                <input className="acn-input" style={{ width:'100%' }}
                  placeholder="Ex: NEO, QFrotas, Prime"
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  autoFocus />
              </div>
              <div>
                <label className="acn-label">Desconto (%)</label>
                <input type="number" className="acn-input" style={{ width:'100%' }}
                  min={0} max={100} step={0.01}
                  value={form.desconto_pct}
                  onChange={e => setForm(f => ({ ...f, desconto_pct: e.target.value }))} />
              </div>
              <div>
                <label className="acn-label">Retenção (%)</label>
                <input type="number" className="acn-input" style={{ width:'100%' }}
                  min={0} max={100} step={0.01}
                  value={form.retencao_pct}
                  onChange={e => setForm(f => ({ ...f, retencao_pct: e.target.value }))} />
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="acn-btn" style={{ background:'#16a34a', flex:1 }} onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'SALVAR'}
              </button>
              <button className="acn-btn" style={{ background:'#94a3b8' }} onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {loading && <div style={{ textAlign:'center', padding:20, color:'#64748b', fontSize:11 }}>Carregando...</div>}
        {!loading && plataformas.length === 0 && (
          <div style={{ textAlign:'center', padding:20, color:'#9ca3af', fontSize:11 }}>
            Nenhuma plataforma cadastrada. Clique em <strong>+ Nova Plataforma</strong> para começar.
          </div>
        )}

        {plataformas.length > 0 && (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Plataforma</th>
                <th style={{ padding:'6px 8px', textAlign:'center', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Desconto</th>
                <th style={{ padding:'6px 8px', textAlign:'center', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Retenção</th>
                <th style={{ padding:'6px 8px', textAlign:'center', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Status</th>
                <th style={{ padding:'6px 8px', borderBottom:'1px solid #e2e8f0' }}></th>
              </tr>
            </thead>
            <tbody>
              {plataformas.map(p => (
                <tr key={p.id} style={{ borderBottom:'1px solid #f1f5f9', opacity: p.ativo ? 1 : 0.45 }}>
                  <td style={{ padding:'8px 8px', fontWeight:700 }}>{p.nome}</td>
                  <td style={{ padding:'8px 8px', textAlign:'center', color:'#059669', fontWeight:700 }}>{Number(p.desconto_pct||0).toFixed(2)}%</td>
                  <td style={{ padding:'8px 8px', textAlign:'center', color:'#dc2626', fontWeight:700 }}>{Number(p.retencao_pct||0).toFixed(2)}%</td>
                  <td style={{ padding:'8px 8px', textAlign:'center' }}>
                    <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:10,
                      background: p.ativo ? '#dcfce7' : '#f1f5f9',
                      color:      p.ativo ? '#16a34a'  : '#94a3b8' }}>
                      {p.ativo ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td style={{ padding:'8px 6px' }}>
                    <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                      <button className="acn-btn" style={{ background: p.ativo ? '#f59e0b' : '#16a34a', fontSize:9, padding:'2px 8px' }}
                        onClick={() => toggleAtivo(p)}>
                        {p.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                      <button className="acn-btn" style={{ background:'#0891b2', fontSize:9, padding:'2px 8px' }}
                        onClick={() => { setForm({ nome:p.nome, desconto_pct:p.desconto_pct||0, retencao_pct:p.retencao_pct||0 }); setEditando(p); setShowForm(true); }}>
                        ✏️
                      </button>
                      <button style={{ background:'none', border:'1px solid #fca5a5', color:'#dc2626', borderRadius:4, padding:'2px 7px', fontSize:9, cursor:'pointer' }}
                        onClick={() => excluir(p.id)}>
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// PAINEL ALÇADAS DE APROVAÇÃO (Compras Fase 2)
// ─────────────────────────────────────────────────────────────────────────────
const VAZIO_ALCADA = { nivel: '', nome: '', valor_minimo: '', perfis_aprovadores: [] as string[] };
const VAZIO_DEPARTAMENTO = { nome: '', gestor_id: '', gestor_nome: '' };

function PainelAlcadasAprovacao() {
  const [alcadas, setAlcadas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm]       = useState({ ...VAZIO_ALCADA });
  const [editando, setEditando] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('compras_alcadas_aprovacao').select('*').order('nivel');
    setAlcadas(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const togglePerfil = (perfil: string) => {
    setForm(f => ({
      ...f,
      perfis_aprovadores: f.perfis_aprovadores.includes(perfil)
        ? f.perfis_aprovadores.filter(p => p !== perfil)
        : [...f.perfis_aprovadores, perfil],
    }));
  };

  const salvar = async () => {
    if (!form.nivel || !form.nome.trim() || !form.valor_minimo) {
      alert('Informe nível, nome e valor mínimo.'); return;
    }
    if (form.perfis_aprovadores.length === 0) {
      alert('Selecione ao menos um perfil aprovador.'); return;
    }
    setSalvando(true);
    const payload = {
      nivel: parseInt(form.nivel, 10),
      nome: form.nome.trim(),
      valor_minimo: parseFloat(String(form.valor_minimo).replace(',', '.')),
      perfis_aprovadores: form.perfis_aprovadores,
    };
    if (editando) {
      await supabase.from('compras_alcadas_aprovacao').update(payload).eq('id', editando.id);
    } else {
      await supabase.from('compras_alcadas_aprovacao').insert([{ ...payload, ativo: true }]);
    }
    setForm({ ...VAZIO_ALCADA });
    setEditando(null); setShowForm(false); setSalvando(false);
    load();
  };

  const toggleAtivo = async (a) => {
    await supabase.from('compras_alcadas_aprovacao').update({ ativo: !a.ativo }).eq('id', a.id);
    load();
  };

  return (
    <div className="sec-card">
      <div className="sec-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span>✅ Alçadas de Aprovação de Compras</span>
        <button className="acn-btn" style={{ background:'#0f766e', fontSize:10 }}
          onClick={() => { setForm({ ...VAZIO_ALCADA }); setEditando(null); setShowForm(true); }}>
          + Novo Nível
        </button>
      </div>
      <div className="sec-body">
        <p style={{ fontSize:10, color:'#64748b', marginBottom:12 }}>
          Compras com valor igual ou acima do "valor mínimo" de um nível precisam da aprovação de alguém
          com um dos perfis selecionados antes de virar "Comprado". Níveis são aprovados em ordem (do
          menor pro maior). Sem nenhum nível ativo aqui, o fluxo de Compras funciona como hoje (sem aprovação).
        </p>

        {showForm && (
          <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:12, marginBottom:12 }}>
            <div style={{ fontWeight:700, fontSize:11, marginBottom:10 }}>
              {editando ? '✏️ Editar Nível' : '+ Novo Nível de Aprovação'}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr 1fr', gap:8, marginBottom:8 }}>
              <div>
                <label className="acn-label">Nível *</label>
                <input className="acn-input" type="number" style={{ width:'100%' }}
                  placeholder="1, 2, 3..."
                  value={form.nivel}
                  onChange={e => setForm(f => ({ ...f, nivel: e.target.value }))} />
              </div>
              <div>
                <label className="acn-label">Nome *</label>
                <input className="acn-input" style={{ width:'100%' }}
                  placeholder="Ex: Gerência, Diretoria"
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
              </div>
              <div>
                <label className="acn-label">Valor Mínimo (R$) *</label>
                <CampoMoeda className="acn-input" style={{ width:'100%' }}
                  placeholder="Ex: 5000,00"
                  value={form.valor_minimo}
                  onChange={reais => setForm(f => ({ ...f, valor_minimo: reais }))} />
              </div>
            </div>
            <div style={{ marginBottom:10 }}>
              <label className="acn-label">Perfis aprovadores *</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:4 }}>
                {PERFIS.map(p => (
                  <label key={p} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, cursor:'pointer',
                    padding:'4px 9px', border:`1.5px solid ${form.perfis_aprovadores.includes(p)?'#0f766e':'#e2e8f0'}`,
                    borderRadius:5, background: form.perfis_aprovadores.includes(p)?'#f0fdfa':'#fff' }}>
                    <input type="checkbox" checked={form.perfis_aprovadores.includes(p)}
                      onChange={() => togglePerfil(p)} style={{ display:'none' }} />
                    {p}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="acn-btn" style={{ background:'#16a34a', flex:1 }} onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'SALVAR'}
              </button>
              <button className="acn-btn" style={{ background:'#94a3b8' }} onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {loading && <div style={{ textAlign:'center', padding:20, color:'#64748b', fontSize:11 }}>Carregando...</div>}
        {!loading && alcadas.length === 0 && (
          <div style={{ textAlign:'center', padding:20, color:'#9ca3af', fontSize:11 }}>
            Nenhum nível de alçada cadastrado. Clique em <strong>+ Novo Nível</strong> para começar.
          </div>
        )}

        {alcadas.length > 0 && (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Nível</th>
                <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Nome</th>
                <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Valor Mínimo</th>
                <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Aprovadores</th>
                <th style={{ padding:'6px 8px', textAlign:'center', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Status</th>
                <th style={{ padding:'6px 8px', borderBottom:'1px solid #e2e8f0' }}></th>
              </tr>
            </thead>
            <tbody>
              {alcadas.map(a => (
                <tr key={a.id} style={{ borderBottom:'1px solid #f1f5f9', opacity: a.ativo ? 1 : 0.45 }}>
                  <td style={{ padding:'8px 8px', fontWeight:700, fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace", color:'#0f766e' }}>{a.nivel}</td>
                  <td style={{ padding:'8px 8px', fontWeight:700 }}>{a.nome}</td>
                  <td style={{ padding:'8px 8px' }}>R$ {Number(a.valor_minimo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding:'8px 8px', color:'#64748b' }}>{(a.perfis_aprovadores || []).join(', ') || '—'}</td>
                  <td style={{ padding:'8px 8px', textAlign:'center' }}>
                    <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:10,
                      background: a.ativo ? '#dcfce7' : '#f1f5f9',
                      color:      a.ativo ? '#16a34a'  : '#94a3b8' }}>
                      {a.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={{ padding:'8px 6px' }}>
                    <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                      <button className="acn-btn" style={{ background: a.ativo ? '#f59e0b' : '#16a34a', fontSize:9, padding:'2px 8px' }}
                        onClick={() => toggleAtivo(a)}>
                        {a.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                      <button className="acn-btn" style={{ background:'#0891b2', fontSize:9, padding:'2px 8px' }}
                        onClick={() => { setForm({ nivel:String(a.nivel), nome:a.nome, valor_minimo:String(a.valor_minimo), perfis_aprovadores:a.perfis_aprovadores||[] }); setEditando(a); setShowForm(true); }}>
                        ✏️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAINEL ALÇADAS DE APROVAÇÃO DE FRETES (mesmo padrão de PainelAlcadasAprovacao,
// tabela própria — faixas de valor de frete são de escala bem menor que compras)
// ─────────────────────────────────────────────────────────────────────────────
function PainelAlcadasAprovacaoFretes() {
  const [alcadas, setAlcadas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm]       = useState({ ...VAZIO_ALCADA });
  const [editando, setEditando] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('fretes_alcadas_aprovacao').select('*').order('nivel');
    setAlcadas(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const togglePerfil = (perfil: string) => {
    setForm(f => ({
      ...f,
      perfis_aprovadores: f.perfis_aprovadores.includes(perfil)
        ? f.perfis_aprovadores.filter(p => p !== perfil)
        : [...f.perfis_aprovadores, perfil],
    }));
  };

  const salvar = async () => {
    if (!form.nivel || !form.nome.trim() || !form.valor_minimo) {
      alert('Informe nível, nome e valor mínimo.'); return;
    }
    if (form.perfis_aprovadores.length === 0) {
      alert('Selecione ao menos um perfil aprovador.'); return;
    }
    setSalvando(true);
    const payload = {
      nivel: parseInt(form.nivel, 10),
      nome: form.nome.trim(),
      valor_minimo: parseFloat(String(form.valor_minimo).replace(',', '.')),
      perfis_aprovadores: form.perfis_aprovadores,
    };
    if (editando) {
      await supabase.from('fretes_alcadas_aprovacao').update(payload).eq('id', editando.id);
    } else {
      await supabase.from('fretes_alcadas_aprovacao').insert([{ ...payload, ativo: true }]);
    }
    setForm({ ...VAZIO_ALCADA });
    setEditando(null); setShowForm(false); setSalvando(false);
    load();
  };

  const toggleAtivo = async (a) => {
    await supabase.from('fretes_alcadas_aprovacao').update({ ativo: !a.ativo }).eq('id', a.id);
    load();
  };

  return (
    <div className="sec-card">
      <div className="sec-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span>🚚 Alçadas de Aprovação de Fretes</span>
        <button className="acn-btn" style={{ background:'#0f766e', fontSize:10 }}
          onClick={() => { setForm({ ...VAZIO_ALCADA }); setEditando(null); setShowForm(true); }}>
          + Novo Nível
        </button>
      </div>
      <div className="sec-body">
        <p style={{ fontSize:10, color:'#64748b', marginBottom:12 }}>
          Fretes com a cotação vencedora igual ou acima do "valor mínimo" de um nível precisam da aprovação de
          alguém com um dos perfis selecionados antes de virar "Em Trânsito". Níveis são aprovados em ordem (do
          menor pro maior). Sem nenhum nível ativo aqui, o fluxo de Fretes funciona como hoje (sem aprovação).
        </p>

        {showForm && (
          <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:12, marginBottom:12 }}>
            <div style={{ fontWeight:700, fontSize:11, marginBottom:10 }}>
              {editando ? '✏️ Editar Nível' : '+ Novo Nível de Aprovação'}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr 1fr', gap:8, marginBottom:8 }}>
              <div>
                <label className="acn-label">Nível *</label>
                <input className="acn-input" type="number" style={{ width:'100%' }}
                  placeholder="1, 2, 3..."
                  value={form.nivel}
                  onChange={e => setForm(f => ({ ...f, nivel: e.target.value }))} />
              </div>
              <div>
                <label className="acn-label">Nome *</label>
                <input className="acn-input" style={{ width:'100%' }}
                  placeholder="Ex: Gerência, Diretoria"
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
              </div>
              <div>
                <label className="acn-label">Valor Mínimo (R$) *</label>
                <CampoMoeda className="acn-input" style={{ width:'100%' }}
                  placeholder="Ex: 1500,00"
                  value={form.valor_minimo}
                  onChange={reais => setForm(f => ({ ...f, valor_minimo: reais }))} />
              </div>
            </div>
            <div style={{ marginBottom:10 }}>
              <label className="acn-label">Perfis aprovadores *</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:4 }}>
                {PERFIS.map(p => (
                  <label key={p} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, cursor:'pointer',
                    padding:'4px 9px', border:`1.5px solid ${form.perfis_aprovadores.includes(p)?'#0f766e':'#e2e8f0'}`,
                    borderRadius:5, background: form.perfis_aprovadores.includes(p)?'#f0fdfa':'#fff' }}>
                    <input type="checkbox" checked={form.perfis_aprovadores.includes(p)}
                      onChange={() => togglePerfil(p)} style={{ display:'none' }} />
                    {p}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="acn-btn" style={{ background:'#16a34a', flex:1 }} onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'SALVAR'}
              </button>
              <button className="acn-btn" style={{ background:'#94a3b8' }} onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {loading && <div style={{ textAlign:'center', padding:20, color:'#64748b', fontSize:11 }}>Carregando...</div>}
        {!loading && alcadas.length === 0 && (
          <div style={{ textAlign:'center', padding:20, color:'#9ca3af', fontSize:11 }}>
            Nenhum nível de alçada cadastrado. Clique em <strong>+ Novo Nível</strong> para começar.
          </div>
        )}

        {alcadas.length > 0 && (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Nível</th>
                <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Nome</th>
                <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Valor Mínimo</th>
                <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Aprovadores</th>
                <th style={{ padding:'6px 8px', textAlign:'center', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Status</th>
                <th style={{ padding:'6px 8px', borderBottom:'1px solid #e2e8f0' }}></th>
              </tr>
            </thead>
            <tbody>
              {alcadas.map(a => (
                <tr key={a.id} style={{ borderBottom:'1px solid #f1f5f9', opacity: a.ativo ? 1 : 0.45 }}>
                  <td style={{ padding:'8px 8px', fontWeight:700, fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace", color:'#0f766e' }}>{a.nivel}</td>
                  <td style={{ padding:'8px 8px', fontWeight:700 }}>{a.nome}</td>
                  <td style={{ padding:'8px 8px' }}>R$ {Number(a.valor_minimo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding:'8px 8px', color:'#64748b' }}>{(a.perfis_aprovadores || []).join(', ') || '—'}</td>
                  <td style={{ padding:'8px 8px', textAlign:'center' }}>
                    <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:10,
                      background: a.ativo ? '#dcfce7' : '#f1f5f9',
                      color:      a.ativo ? '#16a34a'  : '#94a3b8' }}>
                      {a.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={{ padding:'8px 6px' }}>
                    <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                      <button className="acn-btn" style={{ background: a.ativo ? '#f59e0b' : '#16a34a', fontSize:9, padding:'2px 8px' }}
                        onClick={() => toggleAtivo(a)}>
                        {a.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                      <button className="acn-btn" style={{ background:'#0891b2', fontSize:9, padding:'2px 8px' }}
                        onClick={() => { setForm({ nivel:String(a.nivel), nome:a.nome, valor_minimo:String(a.valor_minimo), perfis_aprovadores:a.perfis_aprovadores||[] }); setEditando(a); setShowForm(true); }}>
                        ✏️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAINEL DEPARTAMENTOS DE COMPRAS (aprovação por gestor)
// ─────────────────────────────────────────────────────────────────────────────
function PainelDepartamentosCompras() {
  const [departamentos, setDepartamentos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm]       = useState({ ...VAZIO_DEPARTAMENTO });
  const [editando, setEditando] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: deps }, { data: users }] = await Promise.all([
      supabase.from('compras_departamentos').select('*').order('nome'),
      supabase.from('auth_usuarios').select('id,nome').eq('ativo', true).order('nome'),
    ]);
    setDepartamentos(deps || []);
    setUsuarios(users || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const salvar = async () => {
    if (!form.nome.trim() || !form.gestor_id) {
      alert('Informe nome e gestor responsável.'); return;
    }
    setSalvando(true);
    const payload = { nome: form.nome.trim(), gestor_id: form.gestor_id, gestor_nome: form.gestor_nome };
    if (editando) {
      await supabase.from('compras_departamentos').update(payload).eq('id', editando.id);
    } else {
      await supabase.from('compras_departamentos').insert([{ ...payload, ativo: true }]);
    }
    setForm({ ...VAZIO_DEPARTAMENTO });
    setEditando(null); setShowForm(false); setSalvando(false);
    load();
  };

  const toggleAtivo = async (d) => {
    await supabase.from('compras_departamentos').update({ ativo: !d.ativo }).eq('id', d.id);
    load();
  };

  return (
    <div className="sec-card">
      <div className="sec-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span>🏢 Departamentos de Compras</span>
        <button className="acn-btn" style={{ background:'#0f766e', fontSize:10 }}
          onClick={() => { setForm({ ...VAZIO_DEPARTAMENTO }); setEditando(null); setShowForm(true); }}>
          + Novo Departamento
        </button>
      </div>
      <div className="sec-body">
        <p style={{ fontSize:10, color:'#64748b', marginBottom:12 }}>
          Cada pedido de compra pode ser vinculado a um departamento. Assim que a 1ª cotação de fornecedor
          é lançada nesse pedido, o gestor responsável é mencionado e precisa aprovar — em paralelo às
          alçadas por valor, quando também se aplicarem.
        </p>

        {showForm && (
          <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:12, marginBottom:12 }}>
            <div style={{ fontWeight:700, fontSize:11, marginBottom:10 }}>
              {editando ? '✏️ Editar Departamento' : '+ Novo Departamento'}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
              <div>
                <label className="acn-label">Nome *</label>
                <input className="acn-input" style={{ width:'100%' }}
                  placeholder="Ex: Engenharia, Produção"
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
              </div>
              <div>
                <label className="acn-label">Gestor Responsável *</label>
                <select className="acn-input" style={{ width:'100%' }}
                  value={form.gestor_id}
                  onChange={e => {
                    const u = usuarios.find((u:any) => String(u.id) === e.target.value);
                    setForm(f => ({ ...f, gestor_id: e.target.value, gestor_nome: u ? u.nome : '' }));
                  }}>
                  <option value="">Selecione...</option>
                  {usuarios.map((u:any) => (
                    <option key={u.id} value={String(u.id)}>{u.nome}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="acn-btn" style={{ background:'#16a34a', flex:1 }} onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'SALVAR'}
              </button>
              <button className="acn-btn" style={{ background:'#94a3b8' }} onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {loading && <div style={{ textAlign:'center', padding:20, color:'#64748b', fontSize:11 }}>Carregando...</div>}
        {!loading && departamentos.length === 0 && (
          <div style={{ textAlign:'center', padding:20, color:'#9ca3af', fontSize:11 }}>
            Nenhum departamento cadastrado. Clique em <strong>+ Novo Departamento</strong> para começar.
          </div>
        )}

        {departamentos.length > 0 && (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Nome</th>
                <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Gestor Responsável</th>
                <th style={{ padding:'6px 8px', textAlign:'center', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Status</th>
                <th style={{ padding:'6px 8px', borderBottom:'1px solid #e2e8f0' }}></th>
              </tr>
            </thead>
            <tbody>
              {departamentos.map((d:any) => (
                <tr key={d.id} style={{ borderBottom:'1px solid #f1f5f9', opacity: d.ativo ? 1 : 0.45 }}>
                  <td style={{ padding:'8px 8px', fontWeight:700 }}>{d.nome}</td>
                  <td style={{ padding:'8px 8px', color:'#64748b' }}>{d.gestor_nome}</td>
                  <td style={{ padding:'8px 8px', textAlign:'center' }}>
                    <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:10,
                      background: d.ativo ? '#dcfce7' : '#f1f5f9',
                      color:      d.ativo ? '#16a34a'  : '#94a3b8' }}>
                      {d.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={{ padding:'8px 6px' }}>
                    <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                      <button className="acn-btn" style={{ background: d.ativo ? '#f59e0b' : '#16a34a', fontSize:9, padding:'2px 8px' }}
                        onClick={() => toggleAtivo(d)}>
                        {d.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                      <button className="acn-btn" style={{ background:'#0891b2', fontSize:9, padding:'2px 8px' }}
                        onClick={() => { setForm({ nome:d.nome, gestor_id:d.gestor_id, gestor_nome:d.gestor_nome }); setEditando(d); setShowForm(true); }}>
                        ✏️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAINEL CONTRATOS PADRÃO PARA TERCEIROS
// ─────────────────────────────────────────────────────────────────────────────
async function uploadContratoArquivo(file: File): Promise<{ url: string; nome: string; error?: string }> {
  // Nomes de arquivo com acentos/parênteses/etc quebram a key do storage —
  // mantém só letras/números/ponto/traço/underscore, preservando a extensão.
  const nomeLimpo = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const path = `contratos-padrao/${Date.now()}_${nomeLimpo}`;
  // bucket privado (plano do bucket privado, B1, 26/11/2026): o banco guarda "privado:<caminho>"
  const { valor, erro } = await enviarArquivoPrivado(path, file, file.type || undefined);
  if (erro || !valor) return { url: '', nome: '', error: explicarErroDeEnvio(erro, file) };
  return { url: valor, nome: file.name };
}

const VAZIO_CONTRATO = { tipo: '', nome: '', descricao: '' };

function PainelContratosPadrao() {
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const [contratos, setContratos] = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const [form, setForm]           = useState({ ...VAZIO_CONTRATO });
  const [arquivo, setArquivo]     = useState<File | null>(null);
  const [editando, setEditando]   = useState<any>(null);
  const [showForm, setShowForm]   = useState(false);
  const [salvando, setSalvando]   = useState(false);
  const [filtroTipo, setFiltroTipo] = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('contratos_padrao').select('*').order('tipo').order('nome');
    setContratos(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const tipos = [...new Set(contratos.map(c => c.tipo))].sort();
  const listados = contratos.filter(c => !filtroTipo || c.tipo === filtroTipo);

  const salvar = async () => {
    if (!form.tipo.trim() || !form.nome.trim()) { alert('Informe tipo e nome do contrato.'); return; }
    if (!editando && !arquivo) { alert('Anexe o arquivo do contrato.'); return; }
    if (arquivo && arquivo.size > 10 * 1024 * 1024) {
      alert(`Arquivo muito grande (${(arquivo.size/1024/1024).toFixed(1)} MB). O limite é 10 MB.`);
      return;
    }
    setSalvando(true);
    let anexo: { url: string; nome: string } | null = null;
    if (arquivo) {
      const res = await uploadContratoArquivo(arquivo);
      if (res.error) { alert('Erro ao enviar o arquivo: ' + res.error); setSalvando(false); return; }
      anexo = res;
    }
    if (editando) {
      await supabase.from('contratos_padrao').update({
        tipo: form.tipo.trim(), nome: form.nome.trim(), descricao: form.descricao.trim() || null,
        ...(anexo ? { arquivo_url: anexo.url, arquivo_nome: anexo.nome } : {}),
      }).eq('id', editando.id);
    } else {
      await supabase.from('contratos_padrao').insert([{
        tipo: form.tipo.trim(), nome: form.nome.trim(), descricao: form.descricao.trim() || null,
        arquivo_url: anexo!.url, arquivo_nome: anexo!.nome,
        ativo: true, criado_por: currentUser?.email,
      }]);
    }
    setForm({ ...VAZIO_CONTRATO }); setArquivo(null);
    setEditando(null); setShowForm(false); setSalvando(false);
    load();
  };

  const toggleAtivo = async (c: any) => {
    await supabase.from('contratos_padrao').update({ ativo: !c.ativo }).eq('id', c.id);
    load();
  };

  return (
    <div className="sec-card">
      <div className="sec-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span>📄 Contratos Padrão para Terceiros</span>
        <button className="acn-btn" style={{ background:'#0f766e', fontSize:10 }}
          onClick={() => { setForm({ ...VAZIO_CONTRATO }); setArquivo(null); setEditando(null); setShowForm(true); }}>
          + Novo Contrato Padrão
        </button>
      </div>
      <div className="sec-body">
        <p style={{ fontSize:10, color:'#64748b', marginBottom:12 }}>
          Modelos de contrato para usar conforme a demanda (prestação de serviço, comodato, confidencialidade, etc).
          O campo Tipo é livre — crie quantas categorias precisar.
        </p>

        {showForm && (
          <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:12, marginBottom:12 }}>
            <div style={{ fontWeight:700, fontSize:11, marginBottom:10 }}>
              {editando ? '✏️ Editar Contrato Padrão' : '+ Novo Contrato Padrão'}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:8, marginBottom:8 }}>
              <div>
                <label className="acn-label">Tipo *</label>
                <input className="acn-input" style={{ width:'100%' }} list="tipos-contrato-padrao"
                  placeholder="Ex: Prestação de Serviço"
                  value={form.tipo}
                  onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                  autoFocus />
                <datalist id="tipos-contrato-padrao">
                  {tipos.map(t => <option key={t} value={t} />)}
                </datalist>
              </div>
              <div>
                <label className="acn-label">Nome *</label>
                <input className="acn-input" style={{ width:'100%' }}
                  placeholder="Nome/título do modelo"
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginBottom:10 }}>
              <label className="acn-label">Descrição</label>
              <textarea className="acn-input" rows={2} style={{ width:'100%', resize:'vertical' }}
                placeholder="Quando usar este modelo (opcional)"
                value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
            </div>
            <div style={{ marginBottom:10 }}>
              <label className="acn-label">Arquivo {editando ? '(deixe em branco para manter o atual)' : '*'}</label>
              <input type="file" accept=".pdf,.doc,.docx,.odt"
                onChange={e => setArquivo(e.target.files?.[0] || null)} />
              {editando?.arquivo_nome && !arquivo && (
                <div style={{ fontSize:9, color:'#64748b', marginTop:3 }}>Atual: {editando.arquivo_nome}</div>
              )}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="acn-btn" style={{ background:'#16a34a', flex:1 }} onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'SALVAR'}
              </button>
              <button className="acn-btn" style={{ background:'#94a3b8' }} onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {contratos.length > 0 && (
          <div style={{ marginBottom:10, display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ fontSize:9, color:'#64748b', fontWeight:700 }}>Filtrar por tipo:</span>
            <button className="acn-btn" style={{ fontSize:9, padding:'2px 8px', background: !filtroTipo ? '#0f766e' : '#e2e8f0', color: !filtroTipo ? '#fff' : '#374151' }}
              onClick={() => setFiltroTipo('')}>Todos</button>
            {tipos.map(t => (
              <button key={t} className="acn-btn" style={{ fontSize:9, padding:'2px 8px', background: filtroTipo===t ? '#0f766e' : '#e2e8f0', color: filtroTipo===t ? '#fff' : '#374151' }}
                onClick={() => setFiltroTipo(t)}>{t}</button>
            ))}
          </div>
        )}

        {loading && <div style={{ textAlign:'center', padding:20, color:'#64748b', fontSize:11 }}>Carregando...</div>}
        {!loading && contratos.length === 0 && (
          <div style={{ textAlign:'center', padding:20, color:'#9ca3af', fontSize:11 }}>
            Nenhum contrato padrão cadastrado. Clique em <strong>+ Novo Contrato Padrão</strong> para começar.
          </div>
        )}

        {listados.length > 0 && (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Tipo</th>
                <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Nome</th>
                <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Descrição</th>
                <th style={{ padding:'6px 8px', textAlign:'center', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Status</th>
                <th style={{ padding:'6px 8px', borderBottom:'1px solid #e2e8f0' }}></th>
              </tr>
            </thead>
            <tbody>
              {listados.map(c => (
                <tr key={c.id} style={{ borderBottom:'1px solid #f1f5f9', opacity: c.ativo ? 1 : 0.45 }}>
                  <td style={{ padding:'8px 8px', fontWeight:700, color:'#0f766e' }}>{c.tipo}</td>
                  <td style={{ padding:'8px 8px', fontWeight:700 }}>{c.nome}</td>
                  <td style={{ padding:'8px 8px', color:'#64748b', maxWidth:220, wordBreak:'break-word' }} title={c.descricao || ''}>
                    {c.descricao || '—'}
                  </td>
                  <td style={{ padding:'8px 8px', textAlign:'center' }}>
                    <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:10,
                      background: c.ativo ? '#dcfce7' : '#f1f5f9',
                      color:      c.ativo ? '#16a34a'  : '#94a3b8' }}>
                      {c.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={{ padding:'8px 6px' }}>
                    <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                      {c.arquivo_url && (
                        <LinkDeArquivo valor={c.arquivo_url} className="acn-btn" style={{ background:'#2563eb', fontSize:9, padding:'2px 8px', textDecoration:'none' }}>⬇ Baixar</LinkDeArquivo>
                      )}
                      <button className="acn-btn" style={{ background: c.ativo ? '#f59e0b' : '#16a34a', fontSize:9, padding:'2px 8px' }}
                        onClick={() => toggleAtivo(c)}>
                        {c.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                      <button className="acn-btn" style={{ background:'#0891b2', fontSize:9, padding:'2px 8px' }}
                        onClick={() => { setForm({ tipo:c.tipo, nome:c.nome, descricao:c.descricao||'' }); setArquivo(null); setEditando(c); setShowForm(true); }}>
                        ✏️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---- ADMINTAB PRINCIPAL ----
const ABAS_ADMIN = [
  { id:'usuarios',       label:'Usuários' },
  { id:'perfis',         label:'🔐 Perfis de Acesso' },
  { id:'plataformas',    label:'🏪 Plataformas' },
  { id:'centros_custo',  label:'🏷️ Centros de Custo' },
  { id:'alcadas_aprovacao', label:'✅ Alçadas de Aprovação' },
  { id:'alcadas_aprovacao_fretes', label:'🚚 Alçadas de Fretes' },
  { id:'departamentos_compras', label:'🏢 Departamentos (Compras)' },
  { id:'contratos_padrao', label:'📄 Contratos Padrão' },
  { id:'email_cfg',      label:'📧 Config. Email' },
  { id:'cotacoes_cfg',   label:'📋 Config. Cotações' },
  { id:'markup_cfg',     label:'📈 Faixas de Markup' },
  { id:'nfc_cfg',        label:'📱 Config. NFC' },
  { id:'notificacoes',   label:'🔔 Responsáveis por perfil' },
  { id:'feriados',       label:'📅 Feriados' },
  { id:'veiculos',       label:'🚗 Veículos' },
  { id:'estruturas',     label:'🧩 Estruturas' },
  { id:'fluxo_cfg',      label:'🚦 Venda × Veículo' },
  { id:'checklist',      label:'Checklist CQ' },
  { id:'kpis',           label:'Metas KPI' },
  { id:'avisos',         label:'📢 Avisos' },
  { id:'logs',           label:'Logs do Sistema' },
  { id:'dados',          label:'🗑 Dados / Limpeza' },
  { id:'lixeira',        label:'♻️ Lixeira (24h)' },
];

// ─────────────────────────────────────────────────────────────────────────────
// PAINEL AVISOS DO SISTEMA
// ─────────────────────────────────────────────────────────────────────────────
const VAZIO_AVISO = {
  titulo: '', mensagem: '', tipo: 'admin', criticidade: 'media',
  permanente: false, data_expiracao: '',
};

const COR_CRIT: Record<string, { bg: string; border: string }> = {
  baixa: { bg: '#fef9c3', border: '#ca8a04' },
  media: { bg: '#ffedd5', border: '#ea580c' },
  alta:  { bg: '#fee2e2', border: '#dc2626' },
};




// ─────────────────────────────────────────────────────────────────────────────
// PAINEL AVISOS DO SISTEMA
// ─────────────────────────────────────────────────────────────────────────────
function PainelAvisos() {
  const currentUser                = JSON.parse(localStorage.getItem('user') || '{}');
  // Só Admin publica (02/10/2026, pedido do usuário). Editar, pausar e excluir: só o autor do aviso ou quem tem a marca DEV (podeMexerNoAviso). A caixa "Pode publicar Avisos do Sistema" do cadastro de usuário saiu.
  const podeGerenciar              = podePublicarAviso(currentUser);

  const [avisos, setAvisos]       = useState<any[]>([]);
  const [form, setForm]           = useState<any>({ ...VAZIO_AVISO });
  const [editId, setEditId]       = useState<string|null>(null);
  const [salvando, setSalvando]   = useState(false);
  const [filtro, setFiltro]       = useState<'todos'|'ativos'|'expirados'>('ativos');

  const carregar = async () => {
    const { data } = await supabase.from('avisos_sistema').select('*').order('criado_em', { ascending: false });
    setAvisos(data || []);
  };
  useEffect(() => { carregar(); }, []);

  const salvar = async () => {
    if (!form.titulo?.trim() || !form.mensagem?.trim()) return;
    const alvo = editId ? avisos.find((x: any) => x.id === editId) : null;
    if (editId ? !(alvo && podeMexerNoAviso(currentUser, alvo)) : !podePublicarAviso(currentUser)) { alert('Você não tem permissão para fazer isso com este aviso.'); return; }
    setSalvando(true);
    const payload: any = {
      titulo:      form.titulo.trim(),
      mensagem:    form.mensagem.trim(),
      tipo:        form.tipo,
      criticidade: form.criticidade,
      permanente:  !!form.permanente,
      data_expiracao: (!form.permanente && form.data_expiracao) ? new Date(form.data_expiracao).toISOString() : null,
    };
    let erro: any = null;
    if (editId) {
      // editar NÃO mexe em "ativo": antes o payload forçava ativo:true e editar um aviso desativado o reativava
      ({ error: erro } = await supabase.from('avisos_sistema').update(payload).eq('id', editId));
    } else {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      payload.ativo = true;
      payload.criado_por      = user.email || '';
      payload.criado_por_nome = user.nome  || '';
      ({ error: erro } = await supabase.from('avisos_sistema').insert([payload]));
    }
    setSalvando(false);
    // Etapa de 02/10/2026: a gravação recusada limpava o formulário como se tivesse dado certo. Agora avisa e mantém o que foi digitado.
    if (erro) { alert('Erro ao salvar o aviso: ' + erro.message); return; }
    if (editId) setEditId(null);
    setForm({ ...VAZIO_AVISO });
    await carregar();
  };

  const excluir = async (av: any) => {
    if (!podeMexerNoAviso(currentUser, av)) return;
    if (!await confirmar(`Excluir o aviso "${av.titulo}"?`)) return;
    const { error } = await supabase.from('avisos_sistema').delete().eq('id', av.id);
    if (error) { alert('Erro ao excluir o aviso: ' + error.message); return; }
    await carregar();
  };

  const toggleAtivo = async (av: any) => {
    if (!podeMexerNoAviso(currentUser, av)) return;
    const { error } = await supabase.from('avisos_sistema').update({ ativo: !av.ativo }).eq('id', av.id);
    if (error) { alert('Erro ao ' + (av.ativo ? 'desativar' : 'reativar') + ' o aviso: ' + error.message); return; }
    await carregar();
  };

  const iniciarEdicao = (av: any) => {
    if (!podeMexerNoAviso(currentUser, av)) return;
    setEditId(av.id);
    setForm({
      titulo: av.titulo, mensagem: av.mensagem, tipo: av.tipo,
      criticidade: av.criticidade, permanente: av.permanente,
      data_expiracao: paraCampoDataHora(av.data_expiracao),
    });
  };

  const now = new Date();
  const visiveis = avisos.filter(av => {
    if (filtro === 'ativos')    return av.ativo && (av.permanente || !av.data_expiracao || new Date(av.data_expiracao) > now);
    if (filtro === 'expirados') return !av.ativo || (!av.permanente && av.data_expiracao && new Date(av.data_expiracao) <= now);
    return true;
  });

  const inpStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', border: '1px solid #d1d5db',
    borderRadius: 4, fontSize: 11, boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: podeGerenciar ? '340px 1fr' : '1fr', gap: 16, alignItems: 'start' }}>

      {/* ── FORMULÁRIO ── */}
      {podeGerenciar && <div className="sec-card">
        <div className="sec-header" style={{ background: '#1e293b', color: '#fff', padding: '8px 12px', fontWeight: 700, fontSize: 11 }}>
          {editId ? '✏️ Editar Aviso' : '+ Novo Aviso'}
        </div>
        <div className="sec-body" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 2 }}>Título *</label>
            <input value={form.titulo} onChange={e => setForm({...form, titulo: e.target.value})}
              placeholder="Ex: Reunião amanhã às 9h" style={inpStyle} />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 2 }}>Mensagem *</label>
            <textarea value={form.mensagem} onChange={e => setForm({...form, mensagem: e.target.value})}
              rows={4} placeholder="Texto completo do aviso..." style={{ ...inpStyle, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 2 }}>Origem</label>
              <select value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value})} style={inpStyle}>
                <option value="admin">Admin</option>
                <option value="diretoria">Diretoria</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 2 }}>Criticidade</label>
              <select value={form.criticidade} onChange={e => setForm({...form, criticidade: e.target.value})} style={inpStyle}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
              <input type="checkbox" checked={form.permanente}
                onChange={e => setForm({...form, permanente: e.target.checked, data_expiracao: ''})} />
              <span>📌 Manter permanentemente</span>
            </label>
          </div>
          {!form.permanente && (
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 2 }}>Válido até</label>
              <input type="datetime-local" value={form.data_expiracao}
                onChange={e => setForm({...form, data_expiracao: e.target.value})} style={inpStyle} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button onClick={salvar} disabled={salvando || !form.titulo?.trim() || !form.mensagem?.trim()}
              style={{ flex: 1, background: '#1e293b', color: '#fff', border: 'none', borderRadius: 4,
                padding: '7px 0', fontWeight: 700, fontSize: 11, cursor: 'pointer',
                opacity: (!form.titulo?.trim() || !form.mensagem?.trim()) ? .5 : 1 }}>
              {salvando ? 'Salvando...' : editId ? '💾 Atualizar' : '📢 Publicar'}
            </button>
            {editId && (
              <button onClick={() => { setEditId(null); setForm({ ...VAZIO_AVISO }); }}
                style={{ background: '#94a3b8', color: '#fff', border: 'none', borderRadius: 4,
                  padding: '7px 12px', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                ✕
              </button>
            )}
          </div>
        </div>
      </div>}

      {/* ── LISTA ── */}
      <div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {(['ativos','todos','expirados'] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 10,
                fontWeight: 700, cursor: 'pointer', background: filtro === f ? '#1e293b' : '#fff',
                color: filtro === f ? '#fff' : '#374151' }}>
              {f === 'ativos' ? '✅ Ativos' : f === 'todos' ? '📋 Todos' : '⏰ Expirados'}
            </button>
          ))}
        </div>

        {visiveis.length === 0 && (
          <div style={{ color: '#9ca3af', fontSize: 12, textAlign: 'center', padding: 32 }}>
            Nenhum aviso encontrado.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visiveis.map(av => {
            const c = COR_CRIT[av.criticidade] ?? COR_CRIT.media;
            const expirou = !av.permanente && av.data_expiracao && new Date(av.data_expiracao) <= now;
            return (
              <div key={av.id} style={{
                borderLeft: `4px solid ${c.border}`, background: expirou ? '#f8fafc' : c.bg,
                borderRadius: 6, padding: '10px 14px',
                opacity: expirou || !av.ativo ? .65 : 1,
                boxShadow: '0 1px 4px rgba(0,0,0,.06)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {av.titulo}
                      <span style={{
                        background: av.tipo === 'diretoria' ? '#1e293b' : '#0369a1',
                        color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 700,
                      }}>{av.tipo === 'diretoria' ? '🏢 Diretoria' : '👮 Admin'}</span>
                      <span style={{
                        background: c.border, color: '#fff', borderRadius: 3,
                        padding: '1px 5px', fontSize: 9, fontWeight: 700, textTransform: 'capitalize',
                      }}>{av.criticidade}</span>
                      {!av.ativo && <span style={{ background: '#94a3b8', color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>inativo</span>}
                      {expirou && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>expirado</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#374151', whiteSpace: 'pre-wrap', marginBottom: 4 }}><Linkify text={av.mensagem} /></div>
                    <div style={{ fontSize: 9, color: '#6b7280', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span>✍️ {av.criado_por_nome || '—'}</span>
                      {criadoEmLabel(av) && <span>{criadoEmLabel(av)}</span>}
                      <span>{av.permanente ? '📌 Permanente' : av.data_expiracao ? `⏱ Até ${new Date(av.data_expiracao).toLocaleString('pt-BR')}` : ''}</span>
                    </div>
                  </div>
                  {podeMexerNoAviso(currentUser, av) && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button onClick={() => iniciarEdicao(av)}
                      style={{ background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1',
                        borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>
                      ✏️
                    </button>
                    <button onClick={() => toggleAtivo(av)}
                      title={av.ativo ? 'Desativar' : 'Reativar'}
                      style={{ background: av.ativo ? '#fef9c3' : '#f0fdf4', border: `1px solid ${av.ativo ? '#ca8a04' : '#16a34a'}`,
                        color: av.ativo ? '#854d0e' : '#15803d', borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>
                      {av.ativo ? '⏸' : '▶️'}
                    </button>
                    <button onClick={() => excluir(av)}
                      style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626',
                        borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>
                      🗑
                    </button>
                  </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function AdminTab() {
  // 26/11/2026 (Fase 4 do plano de endereços, com o OK do usuário para só esta linha, sem migrar a tela): a aba tem endereço (#/admin/perfis…); Usuários é a padrão
  const [abaAtiva, setAbaAtiva] = useAbaNoEndereco({ tela: 'admin' }) as [string, (v: any) => void];

  return (
    <div>
      <div className="sec-card" style={{marginBottom:10}}>
        <div className="sec-body" style={{padding:'6px 10px',display:'flex',gap:4,flexWrap:'wrap'}}>
          {ABAS_ADMIN.map(a => (
            <button
              key={a.id}
              className={`acn-btn acn-tab-btn${abaAtiva === a.id ? ' ativo' : ''}`}
              onClick={() => setAbaAtiva(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {abaAtiva === 'usuarios'     && <PainelUsuarios />}
      {abaAtiva === 'perfis'       && <PainelPerfis />}
      {abaAtiva === 'plataformas'  && <PainelPlataformas />}
      {/* o usuário vai junto para o histórico de alterações e o autor das despesas lançadas aqui (Etapa 15a, 05/10/2026) */}
      {abaAtiva === 'centros_custo' && <CentrosCustoManager currentUser={JSON.parse(localStorage.getItem('user') || '{}')} />}
      {abaAtiva === 'alcadas_aprovacao' && <PainelAlcadasAprovacao />}
      {abaAtiva === 'alcadas_aprovacao_fretes' && <PainelAlcadasAprovacaoFretes />}
      {abaAtiva === 'departamentos_compras' && <PainelDepartamentosCompras />}
      {abaAtiva === 'contratos_padrao' && <PainelContratosPadrao />}
      {abaAtiva === 'email_cfg' && <PainelEmailCfg />}
      {abaAtiva === 'cotacoes_cfg' && <PainelCotacoesCfg />}
      {abaAtiva === 'markup_cfg' && <PainelMarkupCfg />}
      {abaAtiva === 'nfc_cfg'      && <PainelNfcCfg />}
      {abaAtiva === 'notificacoes' && <PainelNotificacoes />}
      {abaAtiva === 'feriados'     && <PainelFeriados />}
      {/* AdminTab não recebe o usuário por props; os painéis daqui leem do
          localStorage, como os outros desta tela já fazem. */}
      {abaAtiva === 'veiculos'     && (
        <>
          <PainelFipeSync currentUser={JSON.parse(localStorage.getItem('user') || '{}')} />
          <PainelFichasVeiculos currentUser={JSON.parse(localStorage.getItem('user') || '{}')} />
        </>
      )}
      {abaAtiva === 'estruturas'   && <ConfigEstruturaTela currentUser={JSON.parse(localStorage.getItem('user') || '{}')} />}
      {abaAtiva === 'fluxo_cfg'    && <FluxoConfigTela currentUser={JSON.parse(localStorage.getItem('user') || '{}')} />}
      {abaAtiva === 'checklist'    && <PainelChecklist />}
      {abaAtiva === 'kpis'         && <PainelKPI />}
      {abaAtiva === 'avisos'       && <PainelAvisos />}
      {abaAtiva === 'logs'         && <PainelLogs />}
      {abaAtiva === 'dados'        && <PainelDados />}
      {abaAtiva === 'lixeira'      && <PainelLixeira />}
    </div>
  );
}
