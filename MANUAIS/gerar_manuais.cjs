// Gera os manuais do sistema (um por setor) a partir do texto em MANUAIS/<id>/fonte/*.md.
//   node MANUAIS/gerar_manuais.cjs            gera todos e o catálogo
//   node MANUAIS/gerar_manuais.cjs sac        gera só o manual de MANUAIS/sac
// Cada manual tem: manual.json (setor, título, descrição, data, histórico de mudanças) e fonte/*.md (ordem alfabética).
// Saída (vai para o GitHub Pages junto com o app): public/manuais/<id>/index.html (as fotos ficam em public/manuais/<id>/img/)
// e public/manuais/catalogo.json (a lista que a tela "Manuais" lê). Para criar um manual novo: pasta nova em MANUAIS com esses dois itens.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const PASTA_MANUAIS = __dirname;
const SAIDA_GERAL = path.join(RAIZ, 'public', 'manuais');

// sem argumento: gera todos (um processo por manual, para cada um começar do zero) e monta o catálogo
if (!process.argv[2]) {
  const ids = fs.readdirSync(PASTA_MANUAIS).filter(d => fs.existsSync(path.join(PASTA_MANUAIS, d, 'manual.json')));
  const catalogo = [];
  for (const id of ids) {
    const r = spawnSync(process.execPath, [__filename, id], { stdio: 'inherit' });
    if (r.status !== 0) { console.error('falhou:', id); process.exit(1); }
    const c = JSON.parse(fs.readFileSync(path.join(PASTA_MANUAIS, id, 'manual.json'), 'utf8'));
    catalogo.push({ ...c, caminho: 'manuais/' + id + '/index.html' });
  }
  catalogo.sort((a, b) => (a.ordem || 99) - (b.ordem || 99) || a.titulo.localeCompare(b.titulo, 'pt-BR'));
  fs.mkdirSync(SAIDA_GERAL, { recursive: true });
  fs.writeFileSync(path.join(SAIDA_GERAL, 'catalogo.json'), JSON.stringify(catalogo, null, 2) + '\n');
  console.log('catálogo:', catalogo.map(c => c.id).join(', '));
  process.exit(0);
}

const ID = process.argv[2];
const CFG = JSON.parse(fs.readFileSync(path.join(PASTA_MANUAIS, ID, 'manual.json'), 'utf8'));
const FONTE_DIR = path.join(PASTA_MANUAIS, ID, 'fonte');
const SAIDA = path.join(SAIDA_GERAL, ID);
fs.mkdirSync(path.join(SAIDA, 'img'), { recursive: true });
const FONTES = fs.readdirSync(FONTE_DIR).filter(f => f.endsWith('.md')).sort();
const TEXTO = FONTES.map(f => fs.readFileSync(path.join(FONTE_DIR, f), 'utf8').replace(/\r\n/g, '\n').trim()).join('\n\n');
const dataBR = iso => iso.split('-').reverse().join('/');

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = s => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');

// ---------- inline ----------
function inline(src) {
  const guarda = [];
  const poe = h => { guarda.push(h); return '\u0000' + (guarda.length - 1) + '\u0000'; };
  let s = src;
  s = s.replace(/\\([*|_`\\])/g, (_, c) => poe(esc(c)));
  s = s.replace(/`([^`]+)`/g, (_, c) => poe('<code>' + esc(c) + '</code>'));
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, a, u) => poe(`<img src="${u}" alt="${a}" loading="lazy">`));
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => poe(`<a href="${u.startsWith('#') ? '#' + slug(decodeURIComponent(u.slice(1))) : u}">${t}</a>`));
  s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => guarda[+i]);
}

// ---------- blocos ----------
const titulos = []; // { nivel, texto, id }
const usados = new Set();
function idUnico(t) {
  let b = slug(t) || 'secao', id = b, n = 2;
  while (usados.has(id)) id = b + '-' + n++;
  usados.add(id);
  return id;
}
let parte = 0;

function blocos(linhas) {
  const out = [];
  let i = 0;
  const vazia = l => /^\s*$/.test(l);
  while (i < linhas.length) {
    const l = linhas[i];
    if (vazia(l)) { i++; continue; }

    let m = l.match(/^(#{1,4}) (.*)$/);
    if (m) {
      const nivel = m[1].length, texto = m[2].trim();
      const id = idUnico(texto);
      let rotulo = '';
      if (nivel === 1) { parte++; rotulo = `<span class="parte">Parte ${parte}</span>`; }
      titulos.push({ nivel, texto, id, parte: nivel === 1 ? parte : null });
      out.push(`<h${nivel} id="${id}">${rotulo}${inline(texto)}</h${nivel}>`);
      i++; continue;
    }
    if (/^---+\s*$/.test(l)) { out.push('<hr>'); i++; continue; }

    m = l.match(/^FLUXO:\s*(.*)$/);
    if (m) {
      const passos = m[1].split(/\s*>\s*/).map(p => `<li>${inline(p)}</li>`).join('');
      out.push(`<ol class="fluxo">${passos}</ol>`);
      i++; continue;
    }

    if (/^\|/.test(l)) {
      const tab = [];
      while (i < linhas.length && /^\|/.test(linhas[i])) tab.push(linhas[i++]);
      const celulas = t => t.replace(/^\||\|\s*$/g, '').split(/(?<!\\)\|/).map(c => c.trim());
      const cab = celulas(tab[0]);
      const corpo = tab.slice(2).map(celulas);
      out.push('<div class="tabela"><table><thead><tr>' + cab.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        corpo.map(r => '<tr>' + r.map((c, k) => `<td data-rotulo="${esc(cab[k] || '').replace(/\*\*/g, '')}">${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }

    if (/^>/.test(l)) {
      const q = [];
      while (i < linhas.length && /^>/.test(linhas[i])) q.push(linhas[i++].replace(/^>\s?/, ''));
      const txt = q.join(' ');
      const tipo = /^\*\*Atenção/.test(txt) ? 'atencao' : /^\*\*Dica/.test(txt) ? 'dica' : 'nota';
      out.push(`<aside class="caixa ${tipo}">${inline(txt)}</aside>`);
      continue;
    }

    const li = l.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (li && li[1].length === 0) {
      const ordenada = /\d/.test(li[2]);
      const itens = [];
      while (i < linhas.length) {
        const a = linhas[i];
        const mi = a.match(/^([-*]|\d+\.)\s+(.*)$/);
        if (mi && /\d/.test(mi[1]) === ordenada) {
          itens.push({ topo: mi[2], filhas: [] }); i++;
        } else if (/^\s+\S/.test(a) && itens.length) {
          itens[itens.length - 1].filhas.push(a); i++;
        } else if (vazia(a)) {
          // linha em branco só continua a lista se o que vem depois ainda é dela
          let j = i; while (j < linhas.length && vazia(linhas[j])) j++;
          const prox = linhas[j];
          if (prox && (/^\s+\S/.test(prox) || (/^([-*]|\d+\.)\s+/.test(prox) && /\d/.test(prox.match(/^([-*]|\d+\.)/)[1]) === ordenada))) { i = j; }
          else break;
        } else break;
      }
      const tag = ordenada ? 'ol' : 'ul';
      out.push(`<${tag} class="${ordenada ? 'passos' : 'lista'}">` + itens.map(it => {
        let filhas = it.filhas;
        const recuo = filhas.length ? Math.min(...filhas.filter(x => x.trim()).map(x => x.match(/^\s*/)[0].length)) : 0;
        filhas = filhas.map(x => x.slice(recuo));
        return `<li>${inline(it.topo)}${filhas.length ? blocos(filhas).join('') : ''}</li>`;
      }).join('') + `</${tag}>`);
      continue;
    }

    // imagem sozinha = figura
    m = l.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (m) {
      out.push(`<figure><img src="${m[2]}" alt="${esc(m[1])}" loading="lazy"><figcaption>${inline(m[1])}</figcaption></figure>`);
      i++; continue;
    }

    // parágrafo
    const p = [];
    while (i < linhas.length && !vazia(linhas[i]) && !/^(#{1,4} |---|\||>|FLUXO:|(\s*([-*]|\d+\.)\s+))/.test(linhas[i]) && !/^!\[[^\]]*\]\([^)]+\)\s*$/.test(linhas[i])) p.push(linhas[i++]);
    if (!p.length) { p.push(linhas[i++]); }
    out.push(`<p>${inline(p.join(' '))}</p>`);
  }
  return out;
}

const corpo = blocos(TEXTO.split('\n')).join('\n');

// ---------- sumário ----------
var sumario = '';
{
  let aberto = false;
  for (const t of titulos) {
    if (t.nivel === 1) {
      if (aberto) sumario += '</ul></li>';
      sumario += `<li class="parte-sum"><a href="#${t.id}"><span>Parte ${t.parte}</span>${esc(t.texto)}</a><ul>`;
      aberto = true;
    } else if (t.nivel === 2) {
      sumario += `<li><a href="#${t.id}">${esc(t.texto)}</a></li>`;
    }
  }
  if (aberto) sumario += '</ul></li>';
}

// ---------- estilo ----------
const CSS = `
:root{
  --bg:#f6f7f4; --painel:#ffffff; --fg:#1d2a22; --suave:#56645b; --linha:#dfe4dc;
  --verde:#1f7a43; --verde-forte:#145a30; --verde-claro:#e3f1e8;
  --dica-bg:#e8f2fb; --dica-bd:#2f6fa8; --atencao-bg:#fdeceb; --atencao-bd:#c0352b; --nota-bg:#fbf4df; --nota-bd:#b0841a;
  --codigo:#eef1ec; --sombra:0 1px 2px rgba(20,40,28,.08),0 6px 20px rgba(20,40,28,.06);
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#101612; --painel:#17201a; --fg:#e6eee8; --suave:#9fb0a5; --linha:#2a372e;
  --verde:#5cc283; --verde-forte:#8fdcab; --verde-claro:#183a26;
  --dica-bg:#12273a; --dica-bd:#5aa0dc; --atencao-bg:#3a1714; --atencao-bd:#ef6a5e; --nota-bg:#33290e; --nota-bd:#d9b04a;
  --codigo:#1f2b23; --sombra:0 1px 2px rgba(0,0,0,.4);
  color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#101612; --painel:#17201a; --fg:#e6eee8; --suave:#9fb0a5; --linha:#2a372e;
  --verde:#5cc283; --verde-forte:#8fdcab; --verde-claro:#183a26;
  --dica-bg:#12273a; --dica-bd:#5aa0dc; --atencao-bg:#3a1714; --atencao-bd:#ef6a5e; --nota-bg:#33290e; --nota-bd:#d9b04a;
  --codigo:#1f2b23; --sombra:0 1px 2px rgba(0,0,0,.4);
  color-scheme:dark}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:16px}
body{background:var(--bg);color:var(--fg);font:17px/1.65 "Atkinson Hyperlegible","Segoe UI",system-ui,sans-serif;margin:0;
  padding-block:0;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.pagina{display:grid;grid-template-columns:minmax(0,1fr);gap:32px;max-width:1180px;margin:0 auto;padding-block:24px 64px}
@media(min-width:960px){.pagina{grid-template-columns:270px minmax(0,1fr);gap:48px}}
nav.sum{min-width:0}
@media(min-width:960px){nav.sum{position:sticky;top:16px;align-self:start;max-height:calc(100vh - 32px);overflow:auto;padding-right:8px}}
nav.sum h2{font:700 13px/1.2 "Bricolage Grotesque","Segoe UI",sans-serif;letter-spacing:.09em;text-transform:uppercase;color:var(--suave);margin:0 0 10px}
nav.sum ul{list-style:none;margin:0;padding:0}
nav.sum li.parte-sum{margin:0 0 8px}
nav.sum li.parte-sum>a{display:block;font-weight:700;color:var(--fg);padding:6px 0;text-decoration:none}
nav.sum li.parte-sum>a span{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--verde)}
nav.sum li.parte-sum>ul{border-left:2px solid var(--linha);margin-left:2px}
nav.sum li li a{display:block;font-size:14.5px;line-height:1.35;color:var(--suave);text-decoration:none;padding:3px 0 3px 12px}
nav.sum li li a:hover,nav.sum a.atual{color:var(--verde)}
nav.sum a.atual{font-weight:700}
@media(max-width:959px){
  nav.sum details>summary{cursor:pointer;font-weight:700;padding:10px 14px;background:var(--painel);border:1px solid var(--linha);border-radius:10px}
  nav.sum .conteudo{padding:12px 4px 0}
}
@media(min-width:960px){nav.sum details>summary{display:none}}
main{min-width:0}
.capa{padding:28px 0 8px}
.capa .selo{display:inline-block;font:700 12px/1 "Bricolage Grotesque",sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--verde-forte);background:var(--verde-claro);padding:6px 10px;border-radius:999px}
.capa h1.titulo{font:800 clamp(34px,6vw,54px)/1.05 "Bricolage Grotesque","Segoe UI",sans-serif;margin:14px 0 10px;text-wrap:balance;letter-spacing:-.02em}
.capa p{color:var(--suave);max-width:60ch;margin:0}
.embutido .imprimir{display:none}
.tema{float:right;margin-left:8px;background:var(--painel);color:var(--fg);border:1px solid var(--linha);border-radius:999px;padding:6px 12px;font:inherit;font-size:14px;cursor:pointer}
h1,h2,h3,h4{font-family:"Bricolage Grotesque","Segoe UI",sans-serif;line-height:1.2;text-wrap:balance}
main h1{font-size:clamp(28px,4.4vw,40px);font-weight:800;margin:72px 0 18px;padding-top:28px;border-top:3px solid var(--verde);letter-spacing:-.015em}
main h1 .parte{display:block;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--verde);font-weight:700;margin-bottom:6px}
main h2{font-size:clamp(23px,3.2vw,29px);font-weight:700;margin:52px 0 12px}
main h3{font-size:20px;font-weight:700;margin:34px 0 8px;color:var(--verde-forte)}
main h4{font-size:17px;margin:24px 0 6px}
p{margin:0 0 14px;max-width:72ch}
a{color:var(--verde);text-underline-offset:2px}
code{background:var(--codigo);padding:1px 6px;border-radius:5px;font-size:.92em}
hr{border:0;border-top:1px solid var(--linha);margin:36px 0}
figure{margin:18px 0 22px;max-width:100%}
figure img,li>img,p>img{display:block;max-width:100%;height:auto;border:1px solid var(--linha);border-radius:10px;box-shadow:var(--sombra);background:#fff;cursor:zoom-in}
li>img{margin:10px 0 6px}
figcaption{font-size:14px;color:var(--suave);margin-top:6px}
ol.passos,ul.lista{margin:0 0 16px;padding:0;max-width:78ch}
ul.lista{list-style:none}
ul.lista>li{position:relative;padding-left:22px;margin:6px 0}
ul.lista>li::before{content:"";position:absolute;left:4px;top:.7em;width:7px;height:7px;border-radius:50%;background:var(--verde)}
ol.passos{list-style:none;counter-reset:p}
ol.passos>li{counter-increment:p;position:relative;padding:2px 0 10px 46px;margin:0}
ol.passos>li::before{content:counter(p);position:absolute;left:0;top:1px;width:32px;height:32px;border-radius:50%;background:var(--verde);color:#fff;font:700 15px/32px "Bricolage Grotesque",sans-serif;text-align:center}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]) ol.passos>li::before{color:#0c1a11}}
:root[data-theme="dark"] ol.passos>li::before{color:#0c1a11}
ol.passos ul.lista{margin:6px 0 4px}
ol.fluxo{list-style:none;counter-reset:f;display:flex;flex-wrap:wrap;gap:8px 0;margin:14px 0 20px;padding:0}
ol.fluxo li{counter-increment:f;display:flex;align-items:center;background:var(--painel);border:1px solid var(--linha);border-radius:8px;padding:6px 11px;font-size:14.5px;line-height:1.3;box-shadow:var(--sombra);min-width:0}
ol.fluxo li:not(:last-child)::after{content:"→";color:var(--verde);font-weight:700;margin:0 0 0 11px;position:absolute;transform:translateX(calc(100% + 0px));display:none}
ol.fluxo li{margin-right:22px;position:relative}
ol.fluxo li:not(:last-child)::before{content:"›";position:absolute;right:-17px;top:50%;transform:translateY(-52%);color:var(--verde);font-weight:800;font-size:22px}
.caixa{margin:16px 0 20px;padding:12px 16px 12px 16px;border-left:5px solid var(--nota-bd);background:var(--nota-bg);border-radius:0 10px 10px 0;max-width:78ch}
.caixa.dica{border-color:var(--dica-bd);background:var(--dica-bg)}
.caixa.atencao{border-color:var(--atencao-bd);background:var(--atencao-bg)}
.caixa strong:first-child{display:inline-block;margin-right:2px}
.tabela{overflow-x:auto;margin:14px 0 22px;border:1px solid var(--linha);border-radius:10px;background:var(--painel)}
table{border-collapse:collapse;width:100%;font-size:15.5px;line-height:1.45}
th{text-align:left;background:var(--verde-claro);color:var(--verde-forte);font:700 13px/1.2 "Bricolage Grotesque",sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:10px 14px;white-space:nowrap}
td{padding:10px 14px;border-top:1px solid var(--linha);vertical-align:top;min-width:120px}
tbody tr:nth-child(even) td{background:color-mix(in srgb,var(--verde-claro) 28%,transparent)}
.zoom{position:fixed;inset:0;background:rgba(0,0,0,.82);display:none;align-items:center;justify-content:center;padding:16px;z-index:50;cursor:zoom-out}
.zoom.on{display:flex}
.zoom img{max-width:100%;max-height:100%;border-radius:8px;background:#fff}
@media print{
  :root{--bg:#fff;--painel:#fff;--fg:#111;--suave:#444;--linha:#cfd5cc;--verde:#1f7a43;--verde-forte:#145a30;--verde-claro:#e3f1e8;--sombra:none}
  body{font-size:11.5pt;padding:0}
  .pagina{display:block;padding:0}
  nav.sum,.tema{display:none}
  main h1{break-before:page;margin-top:0}
  main h2,main h3{break-after:avoid}
  figure,li,.caixa,tr{break-inside:avoid}
  img{max-height:20cm;box-shadow:none!important}
  .capa{break-after:page;padding-top:30%}
}
@media(max-width:600px){body{font-size:16.5px}ol.passos>li{padding-left:42px}td{min-width:96px}}
`;

const FONTES_LINK = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&display=swap">';

const JS = `
(function(){
  try{
    var z=document.createElement('div');z.className='zoom';z.innerHTML='<img alt="">';document.body.appendChild(z);
    document.addEventListener('click',function(e){
      var t=e.target;
      if(t.tagName==='IMG'&&t.closest('main')){z.firstChild.src=t.src;z.classList.add('on');}
      else if(z.classList.contains('on')){z.classList.remove('on');}
    });
    document.addEventListener('keydown',function(e){if(e.key==='Escape')z.classList.remove('on');});
    var links=[].slice.call(document.querySelectorAll('nav.sum a'));
    var alvo=links.map(function(a){return document.getElementById(a.getAttribute('href').slice(1));});
    function marca(){
      var atual=-1;
      for(var i=0;i<alvo.length;i++){if(alvo[i]&&alvo[i].getBoundingClientRect().top<120)atual=i;}
      links.forEach(function(a,i){a.classList.toggle('atual',i===atual);});
    }
    window.addEventListener('scroll',marca,{passive:true});marca();
    var b=document.querySelector('.tema');
    if(b)b.addEventListener('click',function(){
      var r=document.documentElement;
      var escuro=r.getAttribute('data-theme')==='dark'||(!r.getAttribute('data-theme')&&matchMedia('(prefers-color-scheme: dark)').matches);
      r.setAttribute('data-theme',escuro?'light':'dark');
    });
  }catch(e){}
})();
`;

const CAPA = `
<header class="capa">
  <button class="tema" type="button">Claro / escuro</button>
  <button class="tema imprimir" type="button">Imprimir / salvar em PDF</button>
  <span class="selo">ACN Sinal Verde · ${esc(CFG.setor)}</span>
  <h1 class="titulo">${esc(CFG.titulo)}</h1>
  <p>${esc(CFG.descricao)} Atualizado em ${dataBR(CFG.atualizadoEm)}.</p>
</header>`;

// histórico de mudanças do manual, no fim (cada ajuste de tela que mexe no manual entra em manual.json)
const HISTORICO = '<h1 id="historico-do-manual"><span class="parte">Fim</span>Histórico deste manual</h1><ul class="lista">' +
  (CFG.mudancas || []).map(m => '<li><strong>' + dataBR(m.data) + '</strong> — ' + inline(m.texto) + '</li>').join('') + '</ul>';
sumario += '<li class="parte-sum"><a href="#historico-do-manual"><span>Fim</span>Histórico deste manual</a></li>';

const IMPRIME = `
  var im=document.querySelector('.imprimir');if(im)im.addEventListener('click',function(){window.print();});
  if(window.top!==window.self)document.documentElement.classList.add('embutido');`;

const pagina = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(CFG.titulo)}</title>
${FONTES_LINK}
<style>${CSS}</style></head><body>
<div class="pagina">
<nav class="sum"><details open><summary>Sumário</summary><div class="conteudo"><h2>Sumário</h2><ul>${sumario}</ul></div></details></nav>
<main>${CAPA}${corpo}${HISTORICO}</main>
</div>
<script>${JS.replace("}catch(e){}", IMPRIME + "}catch(e){}")}</script>
</body></html>
`;
fs.writeFileSync(path.join(SAIDA, 'index.html'), pagina);

// confere se toda foto citada existe e se todo link interno tem destino
const faltam = [...corpo.matchAll(/src="(img\/[^"]+)"/g)].map(m => m[1]).filter(r => !fs.existsSync(path.join(SAIDA, r)));
const ids = new Set(titulos.map(t => t.id));
const quebrados = [...corpo.matchAll(/href="#([^"]+)"/g)].map(m => m[1]).filter(h => !ids.has(h));
console.log(ID + ': títulos', titulos.length, '| fotos citadas', (corpo.match(/src="img\//g) || []).length, '| fotos faltando', faltam, '| links quebrados', quebrados, '| index.html', (fs.statSync(path.join(SAIDA, 'index.html')).size / 1024).toFixed(0) + ' KB');
if (faltam.length || quebrados.length) process.exit(1);
