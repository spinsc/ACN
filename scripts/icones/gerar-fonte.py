"""Gera a fonte "ACN Icones" (src/assets/fontes/acn-icones.woff2) a partir do
mapa emoji -> Material Design Icons (scripts/icones/mapa.mjs, extraído para
icones.json por extrair.mjs).

Cada emoji/símbolo usado no sistema vira um glifo com o desenho do ícone. A
fonte entra na frente da pilha de fontes com unicode-range só desses
caracteres, então: o texto normal continua na fonte de sempre; onde houver o
emoji, o navegador desenha o ícone. Ícones com cor de status (ok, atenção,
erro...) usam a tabela COLR/CPAL; os demais usam a cor do texto.

Uso: npm run icones   (roda extrair.mjs + este script)
"""
import io, json, os
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.svgLib.path import parse_path
from fontTools.colorLib.builder import buildCOLR, buildCPAL

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
SAIDA = os.path.join(RAIZ, 'src', 'assets', 'fontes')

UPM = 1000
TOPO = 860          # viewBox 24x24 do MDI ocupa 1em: de TOPO até TOPO-1000
ESCALA = UPM / 24.0

icones = json.load(io.open(os.path.join(AQUI, 'icones.json'), encoding='utf-8'))

ordem = ['.notdef', 'vs16']
glifos = {}
larguras = {'.notdef': (UPM, 0), 'vs16': (0, 0)}
cmap = {0xFE0F: 'vs16'}
cores = []            # paleta CPAL
colr = {}

def desenhar(path_d):
    pen = TTGlyphPen(None)
    parse_path(path_d, TransformPen(Cu2QuPen(pen, max_err=1.0, reverse_direction=True),
                                    (ESCALA, 0, 0, -ESCALA, 0, TOPO)))
    return pen.glyph()

vazio = TTGlyphPen(None)
glifos['.notdef'] = vazio.glyph()
glifos['vs16'] = TTGlyphPen(None).glyph()

por_path = {}   # mesmo desenho e mesma cor = mesmo glifo
for ic in icones:
    base = ic['simbolo'].replace('️', '')
    if len(base) != 1:
        raise SystemExit('Símbolo com mais de um caractere (sequência) não suportado: %r' % ic['simbolo'])
    chave = (ic['path'], ic['cor'])
    if chave not in por_path:
        nome = 'ic%03d' % len(por_path)
        por_path[chave] = nome
        ordem.append(nome)
        glifos[nome] = desenhar(ic['path'])
        larguras[nome] = (UPM, 0)
        if ic['cor']:
            camada = nome + '.cor'
            ordem.append(camada)
            glifos[camada] = desenhar(ic['path'])
            larguras[camada] = (UPM, 0)
            h = ic['cor'].lstrip('#')
            rgba = (int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255, 1.0)
            if rgba not in cores:
                cores.append(rgba)
            colr[nome] = [(camada, cores.index(rgba))]
    cp = ord(base)
    if cp in cmap and cmap[cp] != por_path[chave]:
        raise SystemExit('Caractere %s mapeado para ícones diferentes' % hex(cp))
    cmap[cp] = por_path[chave]

fb = FontBuilder(UPM, isTTF=True)
fb.setupGlyphOrder(ordem)
fb.setupCharacterMap(cmap)
fb.setupGlyf(glifos)
fb.setupHorizontalMetrics(larguras)
fb.setupHorizontalHeader(ascent=TOPO, descent=-(UPM - TOPO))
fb.setupNameTable({'familyName': 'ACN Icones', 'styleName': 'Regular',
                   'copyright': 'Ícones: Material Design Icons (Pictogrammers), Apache License 2.0'})
fb.setupOS2(sTypoAscender=TOPO, sTypoDescender=-(UPM - TOPO), usWinAscent=TOPO, usWinDescent=UPM - TOPO)
fb.setupPost()
if colr:
    fb.font['COLR'] = buildCOLR(colr, version=0)
    fb.font['CPAL'] = buildCPAL([cores])

os.makedirs(SAIDA, exist_ok=True)
fb.font.flavor = 'woff2'
destino = os.path.join(SAIDA, 'acn-icones.woff2')
fb.save(destino)

faixas = ','.join('U+%04X' % cp for cp in sorted(cmap))
io.open(os.path.join(SAIDA, 'unicode-range.txt'), 'w', encoding='utf-8').write(faixas)
print('fonte gerada: %d glifos, %d coloridos, %d caracteres, %d bytes' % (len(por_path), len(colr), len(cmap), os.path.getsize(destino)))
