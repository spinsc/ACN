import { supabase } from './supabaseClient';
import { iniciarVerComo } from './VerComo';
import { explicarErroDeEnvio } from './ErroDeArquivo';
import { enviarArquivoPrivado } from './ArquivoPrivado';
import { LinkDeArquivo } from './ArquivoPrivadoTela';
import { confirmarRemocao, mostrarAviso } from './Feedback';
import { Faixa } from './Interface';
import { explicarErroDoBanco } from './ErroDoBanco';
import React, { useState, useEffect } from 'react';
import { CentrosCustoManager } from './CentroCustoFicha';
import { confirmar } from './Feedback';
import { CampoTelefone } from './CampoTelefone';
import { erroDeTelefone, whatsappParaGravar } from './Telefone';
import PainelFeriados from './FeriadosAdmin';
import PermissoesDoUsuario from './PermissoesDoUsuario';
import MatrizDePermissoes from './MatrizDePermissoes';
import HistoricoDePermissoes from './HistoricoDePermissoes';
import { Tag, Chips } from './Interface';
import { resumoDosExtras, IDS_DAS_ABAS, ligarExtrasDoModelo } from './PermissoesCatalogo';
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
// 12e88 (26/11/2026): o painel Responsáveis por perfil (quem recebe as Menções de um perfil sem tê-lo) mora em AdminPainelNotificacoes.tsx, no padrão do design system, com a 7.x de achados no cabeçalho dele.
import { PainelNotificacoes } from './AdminPainelNotificacoes';
// 12e89 (27/11/2026): o painel Departamentos (Compras) (o gestor que aprova os pedidos de cada departamento) mora em AdminPainelDepartamentos.tsx, no padrão do design system, com a 7.x de achados no cabeçalho dele.
import { PainelDepartamentosCompras } from './AdminPainelDepartamentos';
// 12e90 (27/11/2026): o painel Dados / Limpeza (ver, deletar e limpar registros, sempre com a cópia na Lixeira) mora em AdminPainelDados.tsx, no padrão do design system, com a 7.x de achados no cabeçalho dele.
import { PainelDados } from './AdminPainelDados';
// 12e91 (27/11/2026): o painel Perfis de Acesso (o modelo de telas e permissões de cada perfil) mora em AdminPainelPerfis.tsx, no padrão do design system, com a 7.x de achados no cabeçalho dele.
import { PainelPerfis } from './AdminPainelPerfis';
// 12e92 (27/11/2026): o painel Avisos (os avisos do sistema que aparecem no 📌 de todo mundo) mora em AdminPainelAvisos.tsx, no padrão do design system, com a 7.x de achados no cabeçalho dele.
import { PainelAvisos } from './AdminPainelAvisos';
// 12e93 (27/11/2026): o painel Plataformas (as plataformas de licitação, com o desconto e a retenção da Formação de Preços) mora em AdminPainelPlataformas.tsx, no padrão do design system, com a 7.x de achados no cabeçalho dele.
import { PainelPlataformas } from './AdminPainelPlataformas';
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
  const [form, setForm] = useState<Record<string, any>>({ nome:'', email:'', senha:'', perfil:'Comercial', whatsapp:'', abas_permitidas: ['dashboard'], pode_autorizar_rh: false, permissoes_crm: [], permissoes_rh: [], recebe_alerta_analise: false, pode_aprovar_compra: false, ve_todas_tarefas_financeiro: false, pode_deletar_anexos: false, pode_postar_inicio: false, pode_gerir_terceiros: false, pode_excluir_op: false, pode_alterar_numero_op: false, pode_excluir_formacao: false, pode_copiar_op: false, pode_excluir_registros: false, pode_corrigir_data_nota: false, ver_valores: true });
  const [showForm, setShowForm] = useState(false);
  const [histPessoa, setHistPessoa] = useState('');   // 24/11/2026: pessoa do botão "Histórico" da linha
  const [visao, setVisao] = useState('lista');   // 24/11/2026: 'lista' (editar) ou 'matriz' (quem tem o quê, só leitura)
  const [loading, setLoading] = useState(false);
  const [modalEditar, setModalEditar] = useState(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({ nome:'', email:'', whatsapp:'', perfil:'', novaSenha:'', abas_permitidas: TODAS_ABAS.map(a=>a.id), pode_autorizar_rh: false, permissoes_crm: [], permissoes_rh: [], recebe_alerta_analise: false, pode_postar_inicio: false, pode_gerir_terceiros: false, pode_excluir_op: false, pode_alterar_numero_op: false, pode_excluir_formacao: false, pode_copiar_op: false, pode_excluir_registros: false, pode_corrigir_data_nota: false, ver_valores: true, gestor_id: null });
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

// ─────────────────────────────────────────────────────────────────────────────
// PAINEL ALÇADAS DE APROVAÇÃO (Compras Fase 2)
// ─────────────────────────────────────────────────────────────────────────────
const VAZIO_ALCADA = { nivel: '', nome: '', valor_minimo: '', perfis_aprovadores: [] as string[] };

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

export default function AdminTab() {
  // 26/11/2026 (Fase 4 do plano de endereços, com o OK do usuário para só esta linha, sem migrar a tela): a aba tem endereço (#/admin/perfis…); Usuários é a padrão
  const [abaAtiva, setAbaAtiva] = useAbaNoEndereco({ tela: 'admin' });

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
      {abaAtiva === 'perfis'       && <PainelPerfis padroes={{ abas: PERFIS_PADRAO_ABAS, rh: PERFIS_PADRAO_RH, fixos: PERFIS }} />}
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
      {abaAtiva === 'notificacoes' && <PainelNotificacoes perfis={PERFIS} />}
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
