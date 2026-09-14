"""Tira emojis dos lugares onde ícone NÃO aparece (decidido com o usuário em
14/09/2026): janelas alert/confirm/prompt, mensagens de WhatsApp/e-mail,
textos de notificação e histórico, PDFs (jsPDF), páginas de impressão
(window.open + document.write), <option> de listas e dicas title=.

Na tela, emoji vira ícone pela fonte "ACN Icones" (ver mapa.mjs). Setas e
marcas tipográficas (→ ✓ ✕ ▼ ●...) são texto comum e ficam.

Uso: python scripts/icones/limpar-textos.py          (simulação: só lista)
     python scripts/icones/limpar-textos.py --aplicar
"""
import io, os, re, sys, glob, collections

AQUI = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(os.path.dirname(AQUI)), 'src')
APLICAR = '--aplicar' in sys.argv

# Pictogramas (saem). Tipográficos (ficam): setas, ✓ ✕ ✗ ✔ ▼ ▲ ▸ ▾ ◀ ▶ ● ○ ☰ ⇅ ⇥ ▦ ◧ ◫ ◨ ⎘ ✎ ✚ ➤ ↳
PICTO = re.compile('(?:[\U0001F000-\U0001FAFF]|[☀-➿⬀-⯿⏩-⏺⌚⌛⌨⏏](?=️)|[⏰-⏺✅❌⚠⛔⭐⚡⚙⚖♻⚓✏✉✈☑☀⚫⬆↩✖✍▶⛶])️?')
# ⚠ ✅ ❌ etc. mesmo sem FE0F saem; ▶ só com FE0F (▶️) sai — o ▶ puro é seta de texto
TIPOGRAFICOS_QUE_FICAM = set('→←↑↓↔✓✕✗✔▼▲▸▾◀●○☰⇅⇥▦◧◫◨⎘✎✚➤↳↺↻↪')

def remover_emojis(txt):
    def troca(m):
        s = m.group(0)
        base = s.replace('️', '')
        if base in TIPOGRAFICOS_QUE_FICAM or (base == '▶' and '️' not in s) or (base == '⛶'):
            return s
        return '\x00'
    t = PICTO.sub(troca, txt)
    if '\x00' not in t:
        return txt
    # emoji + espaço seguinte some junto; espaço duplo resultante vira um
    t = re.sub('\x00[  ]?', '', t)
    t = re.sub(r'(?<=\S)  +(?=\S)', ' ', t)
    return t

# ── varredura léxica simples: acha o argumento de chamadas e literais ────────
def fim_da_chamada(s, i):
    """i aponta para '('. Devolve o índice do ')' correspondente, pulando strings."""
    prof, j, n = 0, i, len(s)
    while j < n:
        c = s[j]
        if c in '\'"':
            q = c; j += 1
            while j < n and s[j] != q:
                if s[j] == '\\': j += 1
                j += 1
        elif c == '`':
            j = fim_template(s, j)
        elif c == '(':
            prof += 1
        elif c == ')':
            prof -= 1
            if prof == 0: return j
        j += 1
    return n - 1

def fim_template(s, i):
    j, n = i + 1, len(s)
    while j < n:
        if s[j] == '\\': j += 2; continue
        if s[j] == '`': return j
        if s[j] == '$' and j + 1 < n and s[j+1] == '{':
            prof = 1; j += 2
            while j < n and prof:
                if s[j] == '{': prof += 1
                elif s[j] == '}': prof -= 1
                elif s[j] == '`': j = fim_template(s, j)
                elif s[j] in '\'"':
                    q = s[j]; j += 1
                    while j < n and s[j] != q:
                        if s[j] == '\\': j += 1
                        j += 1
                j += 1
            continue
        j += 1
    return n - 1

CHAMADAS = re.compile(r'\b(?:window\.)?(?:alert|confirm|prompt)\s*\(|\bnotificarEvento\s*\(|\bnotificarWhatsApp\s*\(|\bnotificarEnvolvidosOp\s*\(|\bdoc\.text\s*\(|\bdocument\.write\s*\(|\bautoTable\s*\(|\bregistrarAndamento\s*\(|\bdoc\.setTitle\s*\(')
PROPS = re.compile(r'''(?:\b(?:evento|texto|conteudo|descricao|mensagem|subject|html|texto_trecho|contexto_descricao|notas|obs)\s*:\s*|\btitle\s*=\s*\{?\s*)(`|'|")''')
# Modelo HTML de impressão/e-mail: template que começa com marcação e é atribuído
# a variável (html = `<...`), devolvido (return `<...`) ou escrito (write(`<...`).
HTML_TPL = re.compile(r'(?:\b(?:html|corpo|body|conteudoHtml)\s*\+?=\s*|\breturn\s+|write\(\s*)`\s*<')

def trechos(s):
    """Faixas [ini, fim) onde emojis devem sair."""
    faixas = []
    for m in CHAMADAS.finditer(s):
        ab = s.index('(', m.start())
        faixas.append((ab, fim_da_chamada(s, ab) + 1, m.group(0).strip('( ')))
    for m in HTML_TPL.finditer(s):
        ini = s.index('`', m.start())
        faixas.append((ini, fim_template(s, ini) + 1, 'html'))
    for m in PROPS.finditer(s):
        if m.group(0).lstrip().startswith('title'):
            # title= de componente (<Sec title=...>) é título NA TELA: fica com ícone.
            # Só a dica de mouse de elemento HTML (<button title=...>) perde o emoji.
            lt = s.rfind('<', 0, m.start())
            tag = re.match(r'<([A-Za-z0-9_.]+)', s[lt:lt + 40])
            if not tag or tag.group(1)[0].isupper():
                continue
        q = m.group(1); ini = m.end() - 1
        if q == '`':
            fim = fim_template(s, ini) + 1
        else:
            fim = ini + 1
            while fim < len(s) and s[fim] != q and s[fim] != '\n':
                if s[fim] == '\\': fim += 1
                fim += 1
            fim += 1
        faixas.append((ini, fim, m.group(0).split(':')[0].split('=')[0].strip()))
    for m in re.finditer(r'<option\b[^>]*>', s):
        fim = s.find('</option>', m.end())
        if fim != -1 and fim - m.end() < 400:
            faixas.append((m.end(), fim, 'option'))
    return faixas

def processar(arq, rel_arquivos):
    s = io.open(arq, encoding='utf-8').read()
    if os.path.basename(arq) == 'whatsappHelper.ts':
        faixas = [(0, len(s), 'whatsapp')]   # arquivo só de mensagens de WhatsApp
    else:
        faixas = sorted(trechos(s), key=lambda x: x[0])
    # funde sobreposições (maior faixa manda)
    unidas = []
    for a, b, k in faixas:
        if unidas and a < unidas[-1][1]:
            unidas[-1] = (unidas[-1][0], max(b, unidas[-1][1]), unidas[-1][2])
        else:
            unidas.append((a, b, k))
    novo, pos, mudancas = [], 0, []
    for a, b, k in unidas:
        trecho = s[a:b]
        limpo = remover_emojis(trecho)
        if limpo != trecho:
            linha = s.count('\n', 0, a) + 1
            antes = [x.group(0) for x in PICTO.finditer(trecho)]
            mudancas.append((linha, k, ''.join(antes)))
        novo.append(s[pos:a]); novo.append(limpo); pos = b
    novo.append(s[pos:])
    resultado = ''.join(novo)
    if mudancas and APLICAR:
        t = arq + '.tmp'
        io.open(t, 'w', encoding='utf-8', newline='').write(resultado)
        os.replace(t, arq)
    return mudancas

total = collections.Counter(); por_arquivo = {}
arquivos = sorted(glob.glob(os.path.join(SRC, '**', '*.ts*'), recursive=True))
for arq in arquivos:
    ms = processar(arq, arquivos)
    if ms:
        por_arquivo[os.path.relpath(arq, SRC)] = ms
        for _, k, e in ms: total[k] += 1
print(('APLICADO' if APLICAR else 'SIMULAÇÃO'), '— trechos alterados por tipo:', dict(total))
for f, ms in por_arquivo.items():
    print(f, len(ms), ' '.join(f'L{l}:{k}:{e}' for l, k, e in ms[:6]) + (' ...' if len(ms) > 6 else ''))
