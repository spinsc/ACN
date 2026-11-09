// @ts-nocheck
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// TELA INÍCIO (09/11/2026, pedido do RH: um lugar para postar a imagem dos aniversariantes do mês). É a tela em que o sistema abre; o Dashboard geral continua no menu (grupo Dashboard).
// Decidido com o usuário: quem posta é quem tem a marca "Pode postar na tela Início" no cadastro de usuários (e o Admin); o tempo é o de Palhoça/SC; a tela foi feita completa de uma vez.
// As regras (o que está no ar, ordem, feriados, tempo) estão em InicioModelo.ts; a leitura e a gravação em InicioDados.ts; a janela de postar em InicioGerenciar.tsx.
// Cada cartão lê o que é dele e falha sozinho: se o tempo ou os aniversariantes não vierem, o carrossel e os outros cartões continuam.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Icone from './Icone';
import { CabecalhoTela, Botao, Selo, Faixa, diaISO, diaBR } from './Interface';
import { mostrarAviso } from './Feedback';
import { podePostarNoInicio } from './utils/permissoes';
import {
  SEGUNDOS_POR_SLIDE, slidesDoCarrossel, textoDoPeriodo, proximasDatas, rotuloDoAniversario, iniciais, nomeProprio, primeiroNome, saudacao, dataPorExtenso, semanaIso,
  diaDoMes, mesCurto, CIDADE_DO_CLIMA,
} from './InicioModelo';
import { lerSlides, enderecosDasImagens, lerDatas, lerAniversariantes, lerNovidades } from './InicioDados';
import { lerClima } from './InicioClima';
import InicioGerenciar from './InicioGerenciar';
import './inicio.css';
import {
  mdiChevronLeft, mdiChevronRight, mdiPause, mdiPlay, mdiFullscreen, mdiFullscreenExit, mdiPencilOutline, mdiAt, mdiClipboardSearchOutline, mdiBellOutline, mdiCartCheck, mdiRefresh,
  mdiWeatherSunny, mdiWeatherPartlyCloudy, mdiWeatherCloudy, mdiWeatherRainy, mdiWeatherLightningRainy, mdiWeatherFog, mdiWeatherSnowy, mdiViewDashboardOutline,
  mdiFileDocumentPlusOutline, mdiFormatListChecks, mdiCalendarOutline, mdiBookOpenPageVariantOutline, mdiMagnify, mdiImageOutline, mdiWeatherWindy,
} from '@mdi/js';

const ICONE_DO_CLIMA = { sol: mdiWeatherSunny, sol_nuvem: mdiWeatherPartlyCloudy, nuvem: mdiWeatherCloudy, chuva: mdiWeatherRainy, tempestade: mdiWeatherLightningRainy, neblina: mdiWeatherFog, neve: mdiWeatherSnowy };
const IconeDoClima = ({ icone, size = 28 }: any) => <span className={`acn-ini-clima-icone ${icone}`}><Icone path={ICONE_DO_CLIMA[icone] || mdiWeatherCloudy} size={size} /></span>;

// ── o carrossel ──────────────────────────────────────────────────────────────────────────────────────────
/** O foco veio do teclado? (`:focus-visible`). Navegador que não conhece o seletor: trata como teclado, o lado seguro (o carrossel para). */
const focoDoTeclado = (el: any): boolean => { try { return !!el?.matches?.(':focus-visible'); } catch { return true; } };

function Carrossel({ slides, enderecos, aoAbrir, aoFalharImagem, podePostar, aoGerenciar }: any) {
  const n = slides.length;
  const [i, setI] = useState(0);
  const [pausaMouse, setPausaMouse] = useState(false);
  const [pausaFoco, setPausaFoco] = useState(false);
  const [pausaManual, setPausaManual] = useState(false);
  const [cheia, setCheia] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const toque = useRef<number | null>(null);
  // quem pediu menos movimento no sistema operacional não leva a passagem automática (as setas e os pontos continuam)
  const reduzir = useMemo(() => { try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }, []);
  const parado = pausaMouse || pausaFoco || pausaManual || reduzir;
  const ir = useCallback((k: number) => setI(((k % n) + n) % n), [n]);

  useEffect(() => { if (i >= n) setI(0); }, [n, i]);
  useEffect(() => {
    if (n < 2 || parado) return;
    const t = setTimeout(() => setI(x => (x + 1) % n), SEGUNDOS_POR_SLIDE * 1000);
    return () => clearTimeout(t);
  }, [i, n, parado]);
  useEffect(() => {
    const h = () => setCheia(document.fullscreenElement === caixa.current);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const atual = slides[Math.min(i, n - 1)] || {};
  const alternarTelaCheia = () => {
    try { if (document.fullscreenElement) document.exitFullscreen(); else caixa.current?.requestFullscreen?.(); }
    catch { mostrarAviso('Não foi possível abrir em tela cheia neste navegador.'); }
  };
  const podeTelaCheia = typeof document !== 'undefined' && !!document.fullscreenEnabled;

  return (
    <div className="acn-ini-carrossel-card">
      {/* Pausa só pelo MOUSE em cima e pelo foco do TECLADO (09/11/2026): o toque no celular dispara "mouse em cima" de mentira e o clique numa seta ou ponto deixa o foco nele; sem essa distinção,
          o primeiro toque nos cantos da imagem deixava o carrossel parado até a pessoa tocar fora. Quem quer parar de vez usa o botão de pausa ("1 de 5"). */}
      <div ref={caixa} className="acn-ini-carrossel" tabIndex={0} role="region" aria-roledescription="carrossel" aria-label="Imagens e comunicados"
        onPointerEnter={e => { if (e.pointerType === 'mouse') setPausaMouse(true); }} onPointerLeave={e => { if (e.pointerType === 'mouse') setPausaMouse(false); }}
        onFocus={e => setPausaFoco(focoDoTeclado(e.target))} onBlur={() => setPausaFoco(false)}
        onKeyDown={e => { if (e.key === 'ArrowLeft') { e.preventDefault(); ir(i - 1); } else if (e.key === 'ArrowRight') { e.preventDefault(); ir(i + 1); } }}
        onTouchStart={e => { toque.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={e => { const x0 = toque.current; toque.current = null; const x1 = e.changedTouches[0]?.clientX; if (x0 != null && x1 != null && Math.abs(x1 - x0) > 50) ir(i + (x1 < x0 ? 1 : -1)); }}>
        <div className="acn-ini-janela" aria-live={parado ? 'polite' : 'off'}>
          <div className="acn-ini-faixa" style={{ transform: `translateX(-${i * 100}%)` }}>
            {slides.map((s: any, k: number) => {
              const url = enderecos[s.imagem_path];
              const abre = s.link_tipo && s.link_tipo !== 'nenhum' && s.link_destino;
              const conteudo = url
                ? <img src={url} alt={s.titulo} draggable={false} onError={aoFalharImagem} />
                : <div className="acn-ini-sem-imagem">{s.titulo}</div>;
              return (
                <div key={s.id} className="acn-ini-slide" role="group" aria-roledescription="slide" aria-label={`${k + 1} de ${n}`} aria-hidden={k !== i}>
                  {abre
                    ? <button type="button" className="acn-ini-slide-link" tabIndex={k === i ? 0 : -1} aria-label={`${s.titulo}: abrir`} onClick={() => aoAbrir(s)}>{conteudo}</button>
                    : conteudo}
                </div>
              );
            })}
          </div>
          {n > 1 && <button type="button" className="acn-ini-seta e" aria-label="Slide anterior" onClick={() => ir(i - 1)}><Icone path={mdiChevronLeft} size={24} /></button>}
          {n > 1 && <button type="button" className="acn-ini-seta d" aria-label="Próximo slide" onClick={() => ir(i + 1)}><Icone path={mdiChevronRight} size={24} /></button>}
          {podeTelaCheia && <button type="button" className="acn-ini-tela-cheia" aria-label={cheia ? 'Sair da tela cheia' : 'Abrir em tela cheia (para a TV)'} title={cheia ? 'Sair da tela cheia' : 'Tela cheia (para a TV)'} onClick={alternarTelaCheia}><Icone path={cheia ? mdiFullscreenExit : mdiFullscreen} size={20} /></button>}
          {n > 1 && (
            <div className="acn-ini-base">
              <div className="acn-ini-pontos">
                {slides.map((s: any, k: number) => <button key={s.id} type="button" className="acn-ini-ponto" aria-label={`Ir para o slide ${k + 1}: ${s.titulo}`} aria-current={k === i} onClick={() => ir(k)} />)}
              </div>
              <button type="button" className="acn-ini-contador" aria-label={pausaManual ? 'Voltar a passar os slides sozinho' : 'Parar de passar os slides sozinho'} onClick={() => setPausaManual(p => !p)}>
                <Icone path={pausaManual || reduzir ? mdiPlay : mdiPause} size={14} />{Math.min(i, n - 1) + 1} de {n}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="acn-ini-rodape">
        {atual.area && <Selo familia="marca" ponto={false}>{atual.area}</Selo>}
        <span className="texto">{atual.legenda || atual.titulo}</span>
        {atual.exibir_ate && <Selo familia="neutro" ponto={false}>no ar até {diaBR(atual.exibir_ate).slice(0, 5)}</Selo>}
        {podePostar && <span className="cresce"><Botao variante="primario" pequeno icone={mdiPencilOutline} onClick={aoGerenciar}>Gerenciar slides</Botao></span>}
      </div>
    </div>
  );
}

// ── a tela ───────────────────────────────────────────────────────────────────────────────────────────────
export default function InicioTab({ currentUser, podeAbrir, irPara, contagens = {}, abrir = {}, abasParaLink = [] }: any) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 60000); return () => clearInterval(t); }, []);
  const hoje = diaISO(agora);
  const podePostar = podePostarNoInicio(currentUser);   // botões de editar: só o Admin e quem tem a marca no cadastro; ver o carrossel é de todos

  const [slides, setSlides] = useState<any>({ todos: [], carregando: true, erro: '' });
  const [enderecos, setEnderecos] = useState<Record<string, string>>({});
  const [datas, setDatas] = useState<any>({ lista: [], erro: '' });
  const [aniv, setAniv] = useState<any>({ lista: [], erro: '', carregando: true });
  const [novidades, setNovidades] = useState<any>({ lista: [], erro: '', carregando: true });
  const [clima, setClima] = useState<any>({ carregando: true });
  const [gerenciando, setGerenciando] = useState(false);

  const carregarSlides = useCallback(async () => {
    const r = await lerSlides();
    if (r.erro) { setSlides((s: any) => ({ ...s, carregando: false, erro: r.erro })); return; }
    setSlides({ todos: r.lista, carregando: false, erro: '' });
    const doDia = slidesDoCarrossel(r.lista, diaISO(new Date()));
    const e = await enderecosDasImagens(doDia.map((s: any) => s.imagem_path));
    setEnderecos(e.mapa);
    if (e.erro) setSlides((s: any) => ({ ...s, erro: 'Não foi possível abrir as imagens do carrossel (' + e.erro + ').' }));
  }, []);
  const carregarOutros = useCallback(async () => {
    const [d, a, n] = await Promise.all([lerDatas(diaISO(new Date())), lerAniversariantes(7), lerNovidades(4)]);
    setDatas({ lista: d.lista, erro: d.erro || '' });
    setAniv({ lista: a.lista, erro: a.erro || '', carregando: false });
    setNovidades({ lista: n.lista, erro: n.erro || '', carregando: false });
  }, []);
  const carregarClima = useCallback(async (forcar = false) => {
    if (forcar) setClima((c: any) => ({ ...c, carregando: true }));
    const r = await lerClima({ forcar });
    setClima({ ...r, carregando: false });
  }, []);

  useEffect(() => {
    carregarSlides(); carregarOutros(); carregarClima();
    // os endereços das imagens valem 1 hora: a cada 30 minutos a tela pede de novo (e já traz slide novo e dado novo)
    const t = setInterval(() => { carregarSlides(); carregarOutros(); carregarClima(); }, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, [carregarSlides, carregarOutros, carregarClima]);

  const noAr = useMemo(() => slidesDoCarrossel(slides.todos, hoje), [slides.todos, hoje]);
  // a imagem que não abre (endereço vencido) pede os endereços de novo, no máximo uma vez por minuto
  const ultimaRenovacao = useRef(0);
  const aoFalharImagem = useCallback(() => { if (Date.now() - ultimaRenovacao.current < 60000) return; ultimaRenovacao.current = Date.now(); carregarSlides(); }, [carregarSlides]);

  const abrirSlide = (s: any) => {
    if (s.link_tipo === 'aba') {
      if (podeAbrir && !podeAbrir(s.link_destino)) { mostrarAviso('Você não tem acesso a essa tela. Peça a liberação a um Admin.', 'atencao'); return; }
      irPara(s.link_destino);
    } else if (s.link_tipo === 'url') window.open(s.link_destino, '_blank', 'noopener,noreferrer');
  };

  const proximos = useMemo(() => proximasDatas(hoje, datas.lista, { limite: 5, dias: 60 }), [hoje, datas.lista]);
  const hora = agora.getHours();
  const nome = primeiroNome(currentUser?.nome);
  const ok = (id: string) => !podeAbrir || podeAbrir(id);
  const atalhos = [
    { id: 'ajustes', rotulo: 'Nova demanda', icone: mdiFileDocumentPlusOutline, vai: () => irPara('ajustes') },
    { id: 'minhas_solicitacoes', rotulo: 'Minhas solicitações', icone: mdiFormatListChecks, vai: () => irPara('minhas_solicitacoes') },
    { id: 'calendario', rotulo: 'Calendário', icone: mdiCalendarOutline, vai: () => irPara('calendario') },
    { id: 'manuais', rotulo: 'Manuais', icone: mdiBookOpenPageVariantOutline, vai: () => irPara('manuais') },
    { id: '*', rotulo: 'Buscar OP, OS, cliente', icone: mdiMagnify, vai: () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })) },
    { id: 'dashboard', rotulo: 'Dashboard geral', icone: mdiViewDashboardOutline, vai: () => irPara('dashboard') },
  ].filter(a => a.id === '*' || ok(a.id));

  const linhasDeHoje = [
    { chave: 'mencoes', rotulo: 'Menções', texto: 'pendentes para você', n: contagens.mencoes, vai: abrir.mencoes, icone: mdiAt },
    { chave: 'analises', rotulo: 'Análises', texto: 'entre setores, do seu setor', n: contagens.analises, vai: abrir.analises, icone: mdiClipboardSearchOutline },
    { chave: 'avisos', rotulo: 'Avisos', texto: 'das OPs e das compras', n: contagens.avisos, vai: abrir.avisos, icone: mdiBellOutline },
    ...(contagens.comprasEsperando != null ? [{ chave: 'compras', rotulo: 'Compras', texto: 'esperando a sua aprovação', n: contagens.comprasEsperando, vai: () => irPara('compras'), icone: mdiCartCheck }] : []),
  ];

  const c = clima.clima;
  return (
    <div className="acn-ini">
      <CabecalhoTela
        titulo={`${saudacao(hora)}${nome ? ', ' + nome : ''}`}
        subtitulo={`${dataPorExtenso(hoje)} · semana ${semanaIso(hoje)}`}
        acoes={<>
          {c && <span className="acn-ini-chip" title={`Previsão para ${CIDADE_DO_CLIMA.nome}`}><IconeDoClima icone={c.agora.icone} size={18} />{c.agora.temp}° · {c.agora.texto.toLowerCase()}</span>}
          {ok('dashboard') && <Botao icone={mdiViewDashboardOutline} onClick={() => irPara('dashboard')}>Dashboard geral</Botao>}
        </>}
      />

      <div className="acn-ini-grade">
        <div className="acn-ini-col">
          {slides.erro && <Faixa tom="erro" acao={<Botao pequeno icone={mdiRefresh} onClick={carregarSlides}>Tentar de novo</Botao>}>Não foi possível ler o carrossel: {slides.erro}</Faixa>}
          {noAr.length > 0
            ? <Carrossel slides={noAr} enderecos={enderecos} aoAbrir={abrirSlide} aoFalharImagem={aoFalharImagem} podePostar={podePostar} aoGerenciar={() => setGerenciando(true)} />
            : (
              <div className="acn-ini-carrossel-card">
                <div className="acn-ini-vazio">
                  <Icone path={mdiImageOutline} size={40} />
                  <strong>{slides.carregando ? 'Carregando…' : `Bem-vindo(a) ao sistema da ACN Sinal Verde${nome ? ', ' + nome : ''}`}</strong>
                  {/* com a leitura recusada a faixa vermelha acima já diz o que houve: não afirmar "não há imagem" (pode haver) nem abrir a postagem sobre uma lista que não foi lida (a ordem dos slides sairia errada) */}
                  {!slides.carregando && !slides.erro && <p>{podePostar ? 'Ainda não há nenhuma imagem no ar. Poste a primeira (por exemplo, os aniversariantes do mês) e ela aparece aqui para todo mundo.' : 'Quando houver comunicados em imagem, eles passam aqui.'}</p>}
                  {!slides.carregando && !slides.erro && podePostar && <Botao variante="primario" icone={mdiPencilOutline} onClick={() => setGerenciando(true)}>Postar um slide</Botao>}
                </div>
              </div>
            )}

          <div className="acn-ini-tres">
            <div className="acn-ini-card">
              <div className="acn-ini-card-cab">Para você hoje</div>
              <div className="acn-ini-card-corpo"><div className="acn-ini-lista">
                {linhasDeHoje.map(l => (
                  <button key={l.chave} type="button" className="acn-ini-linha-botao" onClick={() => l.vai?.()}>
                    <Icone path={l.icone} size={18} />
                    <span><span className="acn-ini-forte">{l.rotulo}</span><br /><span className="acn-ini-fraco acn-ini-pequeno">{l.n ? l.texto : 'nada pendente'}</span></span>
                    <span className={`numero${l.n ? '' : ' zero'}`}>{l.n || 0}</span>
                  </button>
                ))}
              </div></div>
            </div>

            <div className="acn-ini-card">
              <div className="acn-ini-card-cab">Novidades do sistema</div>
              <div className="acn-ini-card-corpo">
                {novidades.erro && <Faixa tom="erro">Não foi possível ler as novidades: {novidades.erro}</Faixa>}
                {!novidades.erro && !novidades.carregando && !novidades.lista.length && <div className="acn-ini-fraco">Nenhuma novidade nos últimos dias.</div>}
                <div className="acn-ini-lista">
                  {novidades.lista.map((av: any) => (
                    <div key={av.id} className="acn-ini-item">
                      <div className="texto"><div className="acn-ini-forte acn-ini-clamp">{av.titulo}</div><div className="acn-ini-fraco acn-ini-pequeno acn-ini-clamp">{String(av.mensagem || '').replace(/\s+/g, ' ')}</div></div>
                      <span className="direita acn-ini-fraco acn-ini-pequeno">{diaBR(av.criado_em).slice(0, 5)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="acn-ini-card">
              <div className="acn-ini-card-cab">Atalhos</div>
              <div className="acn-ini-card-corpo"><div className="acn-ini-atalhos">
                {atalhos.map(a => <button key={a.id} type="button" className="acn-ini-atalho" onClick={a.vai}><Icone path={a.icone} size={18} />{a.rotulo}</button>)}
              </div></div>
            </div>
          </div>
        </div>

        <div className="acn-ini-col">
          <div className="acn-ini-card">
            <div className="acn-ini-card-cab">Previsão do tempo <span className="cresce">{CIDADE_DO_CLIMA.nome}</span></div>
            <div className="acn-ini-card-corpo">
              {clima.carregando && !c && <div className="acn-ini-fraco">Carregando…</div>}
              {!clima.carregando && !c && <Faixa tom="atencao" acao={<Botao pequeno icone={mdiRefresh} onClick={() => carregarClima(true)}>Tentar de novo</Botao>}>A previsão do tempo está indisponível agora.</Faixa>}
              {c && (<>
                {clima.antigo && <div className="acn-ini-fraco acn-ini-pequeno acn-ini-mb">Mostrando a última previsão guardada: o serviço não respondeu agora.</div>}
                <div className="acn-ini-clima-topo">
                  <span className="grande"><IconeDoClima icone={c.agora.icone} size={48} /></span>
                  <span className="temp">{c.agora.temp}°</span>
                  <div className="texto"><b className="acn-ini-forte">{c.agora.texto}</b><br />máx {c.agora.max}° · mín {c.agora.min}°<br />{c.agora.chuva != null ? `chuva ${c.agora.chuva}% · ` : ''}vento {c.agora.vento} km/h</div>
                </div>
                <div className="acn-ini-dias">
                  {c.dias.map((d: any) => <div key={d.data} title={d.texto}><b>{d.rotulo}</b><IconeDoClima icone={d.icone} size={26} /><span>{d.max}° / {d.min}°</span></div>)}
                </div>
              </>)}
            </div>
          </div>

          <div className="acn-ini-card">
            <div className="acn-ini-card-cab">Aniversariantes da semana{aniv.lista.length > 0 && <Selo familia="marca" ponto={false}>{aniv.lista.length}</Selo>}</div>
            <div className="acn-ini-card-corpo">
              {aniv.erro && <Faixa tom="erro">Não foi possível ler os aniversariantes: {aniv.erro}</Faixa>}
              {!aniv.erro && !aniv.carregando && !aniv.lista.length && <div className="acn-ini-fraco">Nenhum aniversário nos próximos 7 dias.</div>}
              <div className="acn-ini-lista">
                {aniv.lista.slice(0, 6).map((a: any, k: number) => (
                  <div key={k} className="acn-ini-item">
                    <span className={`acn-ini-avatar${a.em_dias === 0 ? ' hoje' : ''}`}>{iniciais(nomeProprio(a.nome))}</span>
                    <div className="texto"><div className="acn-ini-forte">{nomeProprio(a.nome)}</div>{a.departamento && <div className="acn-ini-fraco acn-ini-pequeno">{a.departamento}</div>}</div>
                    <span className="direita">{a.em_dias === 0 ? <Selo familia="ok" ponto={false}>hoje</Selo> : <span className="acn-ini-fraco">{rotuloDoAniversario(a.em_dias, hoje)}</span>}</span>
                  </div>
                ))}
              </div>
              {aniv.lista.length > 6 && <div className="acn-ini-fraco acn-ini-pequeno acn-ini-mt">e mais {aniv.lista.length - 6} nesta semana.</div>}
            </div>
          </div>

          <div className="acn-ini-card">
            <div className="acn-ini-card-cab">Próximos dias</div>
            <div className="acn-ini-card-corpo">
              {datas.erro && <Faixa tom="erro">Não foi possível ler as datas da empresa: {datas.erro} Os feriados continuam valendo.</Faixa>}
              <div className="acn-ini-lista">
                {proximos.map((p, k) => (
                  <div key={k} className="acn-ini-item">
                    <div className="acn-ini-dia"><span>{mesCurto(p.data)}</span><b>{diaDoMes(p.data)}</b></div>
                    <div className="texto"><div className="acn-ini-forte">{p.titulo}</div><div className="acn-ini-fraco acn-ini-pequeno">{p.detalhe}</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {gerenciando && <InicioGerenciar currentUser={currentUser} abasParaLink={abasParaLink} aoFechar={() => setGerenciando(false)} aoMudar={() => { carregarSlides(); carregarOutros(); }} />}
    </div>
  );
}
