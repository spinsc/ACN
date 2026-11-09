// @ts-nocheck
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// TELA INÍCIO — a janela de quem posta (09/11/2026): os slides do carrossel (imagem, período, ordem, o que abre ao clicar) e as datas da empresa que aparecem em "Próximos dias".
// Regra do usuário (09/11/2026, decisão final): todo usuário do sistema VÊ o carrossel; só o Admin e quem recebeu a marca "Pode postar na tela Início" (Admin → Usuários) EDITAM, nesta janela.
// O banco confere de novo em toda gravação (função pode_postar_inicio). Não existe "Quem vê" por perfil: todo slide no ar aparece para todo mundo.
// Nada é apagado sem pergunta, e "Tirar do ar" guarda o slide como rascunho (a imagem fica). Slide com a data final vencida sai do ar sozinho e continua na lista como "Encerrado".
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Icone from './Icone';
import { Botao, Faixa, Selo, Abas, Chips, diaISO, diaBR } from './Interface';
import { mostrarAviso, confirmar } from './Feedback';
import {
  situacaoDoSlide, ROTULO_DA_SITUACAO, ordenarSlides, textoDoPeriodo, reordenar, erroDoSlide, erroDaImagem, endereco, MEDIDA_IDEAL_DA_IMAGEM,
  TAMANHO_MAXIMO_DA_IMAGEM, horaCurta,
} from './InicioModelo';
import {
  lerSlides, enderecosDasImagens, criarSlide, editarSlide, apagarSlide, mudarRascunho, salvarOrdem, lerTodasAsDatas, erroDaData, gravarData, apagarData,
} from './InicioDados';
import { mdiClose, mdiPlus, mdiPencilOutline, mdiTrashCanOutline, mdiArrowUp, mdiArrowDown, mdiEyeOffOutline, mdiEyeOutline, mdiImageOutline, mdiContentSaveOutline, mdiImagePlusOutline, mdiCalendarStar } from '@mdi/js';

const FAMILIA_DA_SITUACAO = { no_ar: 'ok', agendado: 'info', encerrado: 'neutro', rascunho: 'atencao' };
const formVazio = (usuario: any) => ({ titulo: '', legenda: '', area: usuario?.perfil && usuario.perfil !== 'Admin' ? usuario.perfil : '', exibir_de: '', exibir_ate: '', link_tipo: 'nenhum', link_destino: '', rascunho: false });
const formDoSlide = (s: any) => ({ titulo: s.titulo || '', legenda: s.legenda || '', area: s.area || '', exibir_de: String(s.exibir_de || '').slice(0, 10), exibir_ate: String(s.exibir_ate || '').slice(0, 10), link_tipo: s.link_tipo || 'nenhum', link_destino: s.link_destino || '', rascunho: !!s.rascunho });

// ── os slides ────────────────────────────────────────────────────────────────────────────────────────────
function PainelDosSlides({ currentUser, abasParaLink, aoMudar }: any) {
  const hoje = diaISO(new Date());
  const [dados, setDados] = useState<any>({ lista: [], carregando: true, erro: '' });
  const [enderecos, setEnderecos] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState('todos');
  const [editando, setEditando] = useState<any>(null);          // o slide aberto na edição (null = slide novo)
  const [f, setF] = useState<any>(() => formVazio(currentUser));
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState('');
  const [dimensao, setDimensao] = useState<{ l: number; a: number } | null>(null);
  const [sobre, setSobre] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));

  const recarregar = useCallback(async () => {
    const r = await lerSlides();
    if (r.erro) { setDados((d: any) => ({ ...d, carregando: false, erro: r.erro })); return; }
    setDados({ lista: r.lista, carregando: false, erro: '' });
    const e = await enderecosDasImagens(r.lista.map((s: any) => s.imagem_path));
    setEnderecos(e.mapa);
  }, []);
  useEffect(() => { recarregar(); }, [recarregar]);
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa); }, [previa]);

  const lista = useMemo(() => ordenarSlides(dados.lista), [dados.lista]);
  const situacao = (s: any) => situacaoDoSlide(s, hoje);
  const contagem = (sit: string) => lista.filter(s => situacao(s) === sit).length;
  const visiveis = lista.filter(s => filtro === 'todos' || (filtro === 'no_ar' && situacao(s) === 'no_ar') || (filtro === 'agendado' && situacao(s) === 'agendado') || (filtro === 'outros' && ['rascunho', 'encerrado'].includes(situacao(s))));

  const limparForm = () => { setEditando(null); setF(formVazio(currentUser)); setArquivo(null); setPrevia(''); setDimensao(null); if (entrada.current) entrada.current.value = ''; };
  const escolher = (file: File | undefined | null) => {
    if (!file) return;
    const erro = erroDaImagem(file);
    if (erro) { mostrarAviso(erro); if (entrada.current) entrada.current.value = ''; return; }
    const url = URL.createObjectURL(file);
    setArquivo(file); setPrevia(url); setDimensao(null);
    const img = new Image();
    img.onload = () => setDimensao({ l: img.naturalWidth, a: img.naturalHeight });
    img.src = url;
  };
  const abrirEdicao = (s: any) => { setEditando(s); setF(formDoSlide(s)); setArquivo(null); setPrevia(''); setDimensao(null); if (entrada.current) entrada.current.value = ''; };

  const proporcaoFora = dimensao && Math.abs(dimensao.l / dimensao.a - 8 / 3) / (8 / 3) > 0.15;
  const imagemMostrada = previa || (editando && enderecos[editando.imagem_path]) || '';

  const salvar = async (comoRascunho: boolean) => {
    if (ocupado) return;
    const dados2 = { ...f, rascunho: editando ? f.rascunho : comoRascunho, link_destino: f.link_tipo === 'url' ? (endereco(f.link_destino) || f.link_destino) : f.link_destino };
    const erro = erroDoSlide(dados2, { temImagem: !!arquivo || !!editando });
    if (erro) { mostrarAviso(erro, 'atencao'); return; }
    setOcupado(true);
    const r = editando ? await editarSlide(editando, dados2, arquivo, currentUser) : await criarSlide(dados2, arquivo, dados.lista, currentUser);
    setOcupado(false);
    if (r.erro) { mostrarAviso(r.erro); return; }
    mostrarAviso(editando ? 'Slide atualizado.' : comoRascunho ? 'Slide guardado como rascunho.' : 'Slide publicado.', 'ok');
    limparForm(); await recarregar(); aoMudar?.();
  };
  const mover = async (s: any, delta: number) => {
    const mud = reordenar(lista, s.id, delta);
    if (!mud.length || ocupado) return;
    setOcupado(true);
    const r = await salvarOrdem(mud);
    setOcupado(false);
    if (r.erro) mostrarAviso(r.erro);
    await recarregar(); aoMudar?.();
  };
  const alternarNoAr = async (s: any) => {
    if (ocupado) return;
    setOcupado(true);
    const r = await mudarRascunho(s, !s.rascunho, currentUser);
    setOcupado(false);
    if (r.erro) { mostrarAviso(r.erro); return; }
    mostrarAviso(s.rascunho ? 'Slide de volta ao ar (se a data permitir).' : 'Slide tirado do ar. Ele fica na lista como rascunho.', 'ok');
    await recarregar(); aoMudar?.();
  };
  const apagar = async (s: any) => {
    if (ocupado) return;
    if (!await confirmar(`Apagar o slide «${s.titulo}»?\n\nA imagem também sai do sistema e não dá para desfazer. Se só quer tirar do ar por um tempo, use "Tirar do ar".`)) return;
    setOcupado(true);
    const r = await apagarSlide(s);
    setOcupado(false);
    if (r.erro) { mostrarAviso(r.erro); return; }
    mostrarAviso('Slide apagado.', 'ok');
    if (editando?.id === s.id) limparForm();
    await recarregar(); aoMudar?.();
  };

  return (
    <div className="acn-ini-ger-cols">
      <div>
        <div className="acn-ini-item">
          <div className="texto"><span className="acn-ini-forte">Ordem de exibição</span> <span className="acn-ini-fraco acn-ini-pequeno">use as setas para subir ou descer</span></div>
          <Botao variante="primario" pequeno icone={mdiPlus} onClick={limparForm}>Novo slide</Botao>
        </div>
        <Chips rotulo="Mostrar" ativo={filtro} onChange={setFiltro} itens={[
          { id: 'todos', rotulo: 'Todos', contagem: lista.length }, { id: 'no_ar', rotulo: 'No ar', contagem: contagem('no_ar') },
          { id: 'agendado', rotulo: 'Agendados', contagem: contagem('agendado') }, { id: 'outros', rotulo: 'Rascunhos e encerrados', contagem: contagem('rascunho') + contagem('encerrado') },
        ]} />
        <div className="acn-ini-espaco" />
        {dados.erro && <Faixa tom="erro" acao={<Botao pequeno onClick={recarregar}>Tentar de novo</Botao>}>Não foi possível ler os slides: {dados.erro}</Faixa>}
        {dados.carregando && <div className="acn-ini-fraco">Carregando…</div>}
        {!dados.carregando && !dados.erro && !visiveis.length && <div className="acn-ini-fraco">{lista.length ? 'Nenhum slide neste filtro.' : 'Nenhum slide ainda. Preencha o quadro ao lado para postar o primeiro.'}</div>}
        {visiveis.map((s: any) => {
          const sit = situacao(s);
          return (
            <div key={s.id} className={`acn-ini-linha-slide${editando?.id === s.id ? ' editando' : ''}${sit === 'encerrado' ? ' apagada' : ''}`}>
              <div className="acn-ini-mini">{enderecos[s.imagem_path] ? <img src={enderecos[s.imagem_path]} alt="" /> : <Icone path={mdiImageOutline} size={22} />}</div>
              <div className="texto">
                <div className="acn-ini-forte">{s.titulo}</div>
                <div className="acn-ini-fraco acn-ini-pequeno">{[s.area, textoDoPeriodo(s), s.link_tipo === 'aba' ? 'abre uma tela' : s.link_tipo === 'url' ? 'abre um link' : ''].filter(Boolean).join(' · ')}</div>
              </div>
              <Selo familia={FAMILIA_DA_SITUACAO[sit]}>{ROTULO_DA_SITUACAO[sit]}</Selo>
              <div className="acoes">
                <Botao variante="discreto" pequeno icone={mdiArrowUp} aria-label={`Subir «${s.titulo}»`} title="Subir na ordem" disabled={ocupado || lista[0]?.id === s.id} onClick={() => mover(s, -1)} />
                <Botao variante="discreto" pequeno icone={mdiArrowDown} aria-label={`Descer «${s.titulo}»`} title="Descer na ordem" disabled={ocupado || lista[lista.length - 1]?.id === s.id} onClick={() => mover(s, 1)} />
                <Botao variante="discreto" pequeno icone={s.rascunho ? mdiEyeOutline : mdiEyeOffOutline} aria-label={s.rascunho ? `Pôr «${s.titulo}» no ar` : `Tirar «${s.titulo}» do ar`} title={s.rascunho ? 'Pôr no ar' : 'Tirar do ar'} disabled={ocupado} onClick={() => alternarNoAr(s)} />
                <Botao variante="discreto" pequeno icone={mdiPencilOutline} aria-label={`Editar «${s.titulo}»`} title="Editar" disabled={ocupado} onClick={() => abrirEdicao(s)} />
                <Botao variante="discreto" pequeno icone={mdiTrashCanOutline} aria-label={`Apagar «${s.titulo}»`} title="Apagar" disabled={ocupado} onClick={() => apagar(s)} />
              </div>
            </div>
          );
        })}
        <div className="acn-ajuda">Slide com a data final vencida sai do ar sozinho e fica na lista como «Encerrado»: a imagem não se perde.</div>
      </div>

      <div>
        <div className="acn-ini-item">
          <div className="texto"><span className="acn-ini-forte">{editando ? 'Editar slide' : 'Novo slide'}</span> {editando && <span className="acn-ini-fraco acn-ini-pequeno">«{editando.titulo}»</span>}</div>
          {editando && <Botao pequeno onClick={limparForm}>Cancelar edição</Botao>}
        </div>
        <label className="acn-label">Imagem {editando ? '(deixe como está para manter a atual)' : '*'}</label>
        <div className={`acn-ini-soltar${sobre ? ' sobre' : ''}`} role="button" tabIndex={0} aria-label="Escolher a imagem do slide"
          onClick={() => entrada.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.current?.click(); } }}
          onDragOver={e => { e.preventDefault(); setSobre(true); }} onDragLeave={() => setSobre(false)}
          onDrop={e => { e.preventDefault(); setSobre(false); escolher(e.dataTransfer?.files?.[0]); }}>
          {imagemMostrada
            ? <div className="acn-ini-previa cheia"><img src={imagemMostrada} alt="Prévia do slide" /></div>
            : <div><Icone path={mdiImagePlusOutline} size={28} /><div className="acn-ini-forte">Solte a imagem aqui ou clique para escolher</div><div className="acn-ini-pequeno">JPG, PNG ou WEBP · ideal {MEDIDA_IDEAL_DA_IMAGEM}, com uma margem nas laterais (as setas ficam por cima) · até {TAMANHO_MAXIMO_DA_IMAGEM / 1048576} MB</div></div>}
        </div>
        <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Arquivo da imagem" onChange={e => escolher(e.target.files?.[0])} />
        {arquivo && <div className="acn-ini-fraco acn-ini-pequeno">{arquivo.name} · {(arquivo.size / 1048576).toFixed(1).replace('.', ',')} MB{dimensao ? ` · ${dimensao.l} × ${dimensao.a} px` : ''}</div>}
        {proporcaoFora && <Faixa tom="atencao">A imagem não está na proporção do carrossel (8:3, ideal {MEDIDA_IDEAL_DA_IMAGEM}): as bordas serão cortadas. Confira a prévia acima.</Faixa>}

        <div className="acn-ini-campos">
          <div className="acn-ini-campo"><label className="acn-label">Título * <span className="acn-ini-fraco">(só para a lista de quem posta)</span></label>
            <input className="acn-input" aria-label="Título do slide" maxLength={120} placeholder="Ex.: Aniversariantes de dezembro" value={f.titulo} onChange={e => set('titulo', e.target.value)} /></div>
          <div className="acn-ini-campo"><label className="acn-label">Legenda <span className="acn-ini-fraco">(aparece embaixo da imagem; se ficar vazia, aparece o título)</span></label>
            <input className="acn-input" aria-label="Legenda do slide" maxLength={200} value={f.legenda} onChange={e => set('legenda', e.target.value)} /></div>
          <div className="acn-ini-duas">
            <div className="acn-ini-campo"><label className="acn-label">No ar a partir de</label>
              <input type="date" className="acn-input" aria-label="No ar a partir de" value={f.exibir_de} onChange={e => set('exibir_de', e.target.value)} /></div>
            <div className="acn-ini-campo"><label className="acn-label">Até (último dia)</label>
              <input type="date" className="acn-input" aria-label="Último dia no ar" min={f.exibir_de || undefined} value={f.exibir_ate} onChange={e => set('exibir_ate', e.target.value)} /></div>
          </div>
          <div className="acn-ini-duas">
            <div className="acn-ini-campo"><label className="acn-label">Ao clicar na imagem</label>
              <select className="acn-input" aria-label="O que o slide abre" value={f.link_tipo} onChange={e => setF((x: any) => ({ ...x, link_tipo: e.target.value, link_destino: '' }))}>
                <option value="nenhum">Não abre nada</option><option value="aba">Abre uma tela do sistema</option><option value="url">Abre um link da internet</option>
              </select></div>
            <div className="acn-ini-campo"><label className="acn-label">Quem posta <span className="acn-ini-fraco">(aparece embaixo)</span></label>
              <input className="acn-input" aria-label="Setor que posta" maxLength={40} placeholder="Ex.: RH" value={f.area} onChange={e => set('area', e.target.value)} /></div>
          </div>
          {f.link_tipo === 'aba' && <div className="acn-ini-campo"><label className="acn-label">Tela que abre</label>
            <select className="acn-input" aria-label="Tela que o slide abre" value={f.link_destino} onChange={e => set('link_destino', e.target.value)}>
              <option value="">Escolha a tela</option>{abasParaLink.map((a: any) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select></div>}
          {f.link_tipo === 'url' && <div className="acn-ini-campo"><label className="acn-label">Endereço da internet</label>
            <input className="acn-input" aria-label="Endereço do link" placeholder="https://www.exemplo.com.br" value={f.link_destino} onChange={e => set('link_destino', e.target.value)} /></div>}
          <span className="acn-ajuda">Todo usuário do sistema vê os slides que estão no ar. Só o Admin e quem recebeu a permissão no cadastro de usuários editam.</span>
        </div>

        <div className="acn-modal-acoes">
          {editando
            ? <Botao variante="primario" icone={mdiContentSaveOutline} disabled={ocupado} onClick={() => salvar(!!editando.rascunho)}>{ocupado ? 'Salvando…' : 'Salvar alterações'}</Botao>
            : <>
                <Botao variante="primario" icone={mdiContentSaveOutline} disabled={ocupado} onClick={() => salvar(false)}>{ocupado ? 'Enviando…' : 'Publicar slide'}</Botao>
                <Botao disabled={ocupado} onClick={() => salvar(true)}>Salvar como rascunho</Botao>
              </>}
        </div>
      </div>
    </div>
  );
}

// ── as datas da empresa ──────────────────────────────────────────────────────────────────────────────────
function PainelDasDatas({ currentUser, aoMudar }: any) {
  const hoje = diaISO(new Date());
  const [dados, setDados] = useState<any>({ lista: [], carregando: true, erro: '' });
  const [f, setF] = useState<any>({ titulo: '', data: '', hora: '', local: '' });
  const [ocupado, setOcupado] = useState(false);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const recarregar = useCallback(async () => {
    const r = await lerTodasAsDatas();
    setDados({ lista: r.lista, carregando: false, erro: r.erro || '' });
  }, []);
  useEffect(() => { recarregar(); }, [recarregar]);

  const salvar = async () => {
    if (ocupado) return;
    const erro = erroDaData(f);
    if (erro) { mostrarAviso(erro, 'atencao'); return; }
    setOcupado(true);
    const r = await gravarData(f, currentUser);
    setOcupado(false);
    if (r.erro) { mostrarAviso(r.erro); return; }
    mostrarAviso(f.id ? 'Data atualizada.' : 'Data gravada.', 'ok');
    setF({ titulo: '', data: '', hora: '', local: '' }); await recarregar(); aoMudar?.();
  };
  const apagar = async (d: any) => {
    if (ocupado || !await confirmar(`Apagar «${d.titulo}» (${diaBR(d.data)})?`)) return;
    setOcupado(true);
    const r = await apagarData(d.id);
    setOcupado(false);
    if (r.erro) { mostrarAviso(r.erro); return; }
    mostrarAviso('Data apagada.', 'ok');
    if (f.id === d.id) setF({ titulo: '', data: '', hora: '', local: '' });
    await recarregar(); aoMudar?.();
  };

  return (
    <div className="acn-ini-ger-cols">
      <div>
        <div className="acn-ini-item"><div className="texto"><span className="acn-ini-forte">Datas da empresa</span> <span className="acn-ini-fraco acn-ini-pequeno">aparecem em «Próximos dias», junto dos feriados</span></div></div>
        {dados.erro && <Faixa tom="erro" acao={<Botao pequeno onClick={recarregar}>Tentar de novo</Botao>}>Não foi possível ler as datas: {dados.erro}</Faixa>}
        {dados.carregando && <div className="acn-ini-fraco">Carregando…</div>}
        {!dados.carregando && !dados.erro && !dados.lista.length && <div className="acn-ini-fraco">Nenhuma data cadastrada.</div>}
        {dados.lista.map((d: any) => (
          <div key={d.id} className={`acn-ini-linha-slide${f.id === d.id ? ' editando' : ''}${String(d.data).slice(0, 10) < hoje ? ' apagada' : ''}`}>
            <div className="texto"><div className="acn-ini-forte">{d.titulo}</div><div className="acn-ini-fraco acn-ini-pequeno">{[diaBR(d.data), horaCurta(d.hora), d.local, String(d.data).slice(0, 10) < hoje ? 'já passou' : ''].filter(Boolean).join(' · ')}</div></div>
            <div className="acoes">
              <Botao variante="discreto" pequeno icone={mdiPencilOutline} aria-label={`Editar «${d.titulo}»`} title="Editar" disabled={ocupado} onClick={() => setF({ id: d.id, titulo: d.titulo || '', data: String(d.data).slice(0, 10), hora: d.hora || '', local: d.local || '' })} />
              <Botao variante="discreto" pequeno icone={mdiTrashCanOutline} aria-label={`Apagar «${d.titulo}»`} title="Apagar" disabled={ocupado} onClick={() => apagar(d)} />
            </div>
          </div>
        ))}
      </div>
      <div>
        <div className="acn-ini-item">
          <div className="texto"><span className="acn-ini-forte">{f.id ? 'Editar data' : 'Nova data'}</span></div>
          {f.id && <Botao pequeno onClick={() => setF({ titulo: '', data: '', hora: '', local: '' })}>Cancelar edição</Botao>}
        </div>
        <div className="acn-ini-campos">
          <div className="acn-ini-campo"><label className="acn-label">O que acontece *</label>
            <input className="acn-input" aria-label="O que acontece" maxLength={120} placeholder="Ex.: Reunião geral de resultados" value={f.titulo} onChange={e => set('titulo', e.target.value)} /></div>
          <div className="acn-ini-duas">
            <div className="acn-ini-campo"><label className="acn-label">Dia *</label><input type="date" className="acn-input" aria-label="Dia" value={f.data} onChange={e => set('data', e.target.value)} /></div>
            <div className="acn-ini-campo"><label className="acn-label">Hora</label><input type="time" className="acn-input" aria-label="Hora" value={f.hora} onChange={e => set('hora', e.target.value)} /></div>
          </div>
          <div className="acn-ini-campo"><label className="acn-label">Onde</label>
            <input className="acn-input" aria-label="Onde" maxLength={80} placeholder="Ex.: sala de treinamento" value={f.local} onChange={e => set('local', e.target.value)} /></div>
        </div>
        <div className="acn-modal-acoes">
          <Botao variante="primario" icone={mdiContentSaveOutline} disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando…' : f.id ? 'Salvar alterações' : 'Gravar data'}</Botao>
        </div>
      </div>
    </div>
  );
}

// ── a janela ─────────────────────────────────────────────────────────────────────────────────────────────
export default function InicioGerenciar({ currentUser, abasParaLink = [], aoFechar, aoMudar }: any) {
  const [aba, setAba] = useState('slides');
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [aoFechar]);
  return createPortal(
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-ini-gerenciar" role="dialog" aria-label="Gerenciar a tela Início">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiImageOutline} size={18} />Gerenciar a tela Início</span>
          <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Fechar" title="Fechar" onClick={aoFechar} />
        </div>
        <div className="acn-modal-corpo">
          <Abas ativa={aba} onChange={setAba} itens={[{ id: 'slides', rotulo: 'Slides do carrossel', icone: mdiImageOutline }, { id: 'datas', rotulo: 'Datas da empresa', icone: mdiCalendarStar }]} />
          {aba === 'slides' ? <PainelDosSlides currentUser={currentUser} abasParaLink={abasParaLink} aoMudar={aoMudar} /> : <PainelDasDatas currentUser={currentUser} aoMudar={aoMudar} />}
        </div>
        <div className="acn-modal-rodape"><Botao onClick={aoFechar}>Fechar</Botao></div>
      </div>
    </div>,
    document.body,
  );
}
