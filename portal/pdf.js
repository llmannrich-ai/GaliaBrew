// pdf.js — gerador de PDF próprio do GaliaBrew (sem biblioteca: o site não depende de CDN e a CSP segue 'self').
// Uma PÁGINA é uma lista de itens em pontos (1/72 pol), com a origem no canto de CIMA à esquerda:
//   { tipo: "texto", x, y (linha de base), txt, tam, negrito, cor, alinh: "inicio" | "meio" | "fim" }
//   { tipo: "ret", x, y, l, a, cor }                    retângulo cheio
//   { tipo: "linha", x1, y1, x2, y2, cor, esp }
// O visualizador (relatorio.js) desenha os MESMOS itens em SVG; por isso o que se vê é o que sai no arquivo.
// Fontes: Helvetica e Helvetica-Bold (padrão de todo leitor de PDF, não precisam ir dentro do arquivo), WinAnsi.
// Módulo puro (roda no Node): testes em portal/testes/pdf.test.mjs.

export const A4 = { largura: 595.28, altura: 841.89 };

// Larguras (milésimos do tamanho da fonte) dos caracteres 32 a 126, das métricas públicas das fontes padrão.
const L_NORMAL = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667,
  944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500,
  278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const L_NEGRITO = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667,
  944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556,
  333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
// Fora do ASCII: [normal, negrito]. Letra acentuada usa a largura da letra sem acento.
const L_EXTRA = {
  "°": [400, 400], "º": [365, 365], "ª": [370, 370], "·": [278, 278], "–": [556, 556], "—": [1000, 1000], "•": [350, 350], "…": [1000, 1000],
  "×": [584, 584], "÷": [584, 584], "±": [584, 584], "‘": [222, 278], "’": [222, 278], "“": [333, 500], "”": [333, 500], "«": [556, 556], "»": [556, 556],
  "ß": [611, 611], "æ": [889, 889], "Æ": [1000, 1000], "ø": [611, 611], "Ø": [778, 778], "½": [834, 834], "¼": [834, 834], "¾": [834, 834],
  "µ": [556, 611], "²": [333, 333], "³": [333, 333], "¹": [333, 333], "§": [556, 556], "©": [737, 737], "®": [737, 737], "€": [556, 556],
  "™": [1000, 1000], " ": [278, 278], "¿": [611, 611], "¡": [333, 333], "£": [556, 556], "¢": [556, 556], "¬": [584, 584], "´": [333, 333],
};

// WinAnsi (CP1252): 32-126 e 160-255 = o próprio código; estes ficam entre 128 e 159.
const CP1252 = { "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c,
  "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c,
  "ž": 0x9e, "Ÿ": 0x9f };
const codigo = (c) => {
  const n = c.charCodeAt(0);
  if ((n >= 32 && n <= 126) || (n >= 160 && n <= 255)) return n;
  return CP1252[c] ?? null;
};

const TROCAS = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "⁰": "0", "⁴": "4", "⁵": "5", "⁶": "6",
  "⁷": "7", "⁸": "8", "⁹": "9", "≥": ">=", "≤": "<=", "→": "->", "←": "<-", "−": "-", "‐": "-", "‑": "-", "≈": "~", "✓": "ok", " ": " ", " ": " ",
  "\t": " ", "​": "" };
/** Texto só com caracteres que a fonte do PDF tem (CO₂ → CO2, ≥ → >=; o que não existe vira "?"). Uma linha só. */
export function limparTexto(txt) {
  let s = "";
  for (const c of String(txt ?? "").normalize("NFC").replace(/[\r\n]+/g, " ")) {
    if (TROCAS[c] !== undefined) { s += TROCAS[c]; continue; }
    if (codigo(c) !== null) { s += c; continue; }
    const base = c.normalize("NFD").replace(/[̀-ͯ]/g, "");      // letra com acento que o CP1252 não tem (ě → e)
    s += base.length === 1 && codigo(base) !== null ? base : "?";
  }
  return s;
}

/** Largura do texto (já limpo) em pontos. */
export function larguraTexto(txt, tam, negrito = false) {
  const tabela = negrito ? L_NEGRITO : L_NORMAL;
  let soma = 0;
  for (const c of String(txt)) {
    const n = c.charCodeAt(0);
    if (n >= 32 && n <= 126) soma += tabela[n - 32];
    else if (L_EXTRA[c]) soma += L_EXTRA[c][negrito ? 1 : 0];
    else {
      const b = c.normalize("NFD").charCodeAt(0);
      soma += b >= 32 && b <= 126 ? tabela[b - 32] : 556;
    }
  }
  return (soma * tam) / 1000;
}

/** Quebra em linhas que cabem em `largura` (respeita as quebras do texto; palavra maior que a linha é partida). */
export function quebrarTexto(txt, tam, largura, negrito = false) {
  const linhas = [];
  for (const paragrafo of String(txt ?? "").split(/\r?\n/)) {
    const palavras = limparTexto(paragrafo).split(" ").filter(Boolean);
    let atual = "";
    for (let p of palavras) {
      const tentativa = atual ? `${atual} ${p}` : p;
      if (larguraTexto(tentativa, tam, negrito) <= largura) { atual = tentativa; continue; }
      if (atual) linhas.push(atual);
      while (larguraTexto(p, tam, negrito) > largura && p.length > 1) {
        let n = p.length - 1;
        while (n > 1 && larguraTexto(p.slice(0, n), tam, negrito) > largura) n--;
        linhas.push(p.slice(0, n));
        p = p.slice(n);
      }
      atual = p;
    }
    linhas.push(atual);
  }
  return linhas;
}

/** Corta com reticências para caber em `largura`. */
export function encurtarTexto(txt, tam, largura, negrito = false) {
  let s = limparTexto(txt);
  if (larguraTexto(s, tam, negrito) <= largura) return s;
  while (s.length > 1 && larguraTexto(`${s}…`, tam, negrito) > largura) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

const n2 = (v) => String(Number(v.toFixed(2)));
function rgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? "") ?? [0, "00", "00", "00"];
  return [1, 2, 3].map((i) => String(Number((parseInt(m[i], 16) / 255).toFixed(3)))).join(" ");
}
const hexTexto = (txt) => {
  let h = "";
  for (const c of limparTexto(txt)) h += (codigo(c) ?? 63).toString(16).padStart(2, "0");
  return `<${h}>`;
};
const hexUtf16 = (txt) => {
  let h = "feff";
  for (let i = 0; i < txt.length; i++) h += txt.charCodeAt(i).toString(16).padStart(4, "0");
  return `<${h}>`;
};

function conteudoDaPagina(pagina) {
  const alt = pagina.altura;
  const ops = [];
  for (const it of pagina.itens) {
    if (it.tipo === "ret") {
      ops.push(`${rgb(it.cor)} rg ${n2(it.x)} ${n2(alt - it.y - it.a)} ${n2(it.l)} ${n2(it.a)} re f`);
    } else if (it.tipo === "linha") {
      ops.push(`${rgb(it.cor)} RG ${n2(it.esp ?? 0.5)} w ${n2(it.x1)} ${n2(alt - it.y1)} m ${n2(it.x2)} ${n2(alt - it.y2)} l S`);
    } else if (it.tipo === "texto") {
      const txt = limparTexto(it.txt);
      if (!txt) continue;
      const larg = larguraTexto(txt, it.tam, it.negrito);
      const x = it.alinh === "fim" ? it.x - larg : it.alinh === "meio" ? it.x - larg / 2 : it.x;
      ops.push(`BT /${it.negrito ? "F2" : "F1"} ${n2(it.tam)} Tf ${rgb(it.cor)} rg ${n2(x)} ${n2(alt - it.y)} Td ${hexTexto(txt)} Tj ET`);
    }
  }
  return ops.join("\n");
}

/** Monta o arquivo PDF (Uint8Array) a partir das páginas. O arquivo inteiro é ASCII (texto em hexadecimal). */
export function gerarPdf(paginas, { titulo = "Documento", autor = "", data = new Date() } = {}) {
  const objetos = [];                     // objetos[i] = corpo do objeto nº i + 1
  const novo = (corpo) => objetos.push(corpo);
  novo("<< /Type /Catalog /Pages 2 0 R /Lang (pt-BR) >>");
  novo("");                               // 2 = Pages (preenchido depois, quando se sabe os números das páginas)
  novo("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  novo("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const filhos = [];
  for (const p of paginas) {
    const c = conteudoDaPagina(p);
    novo(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`);
    const nConteudo = objetos.length;
    novo(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n2(p.largura)} ${n2(p.altura)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${nConteudo} 0 R >>`);
    filhos.push(`${objetos.length} 0 R`);
  }
  objetos[1] = `<< /Type /Pages /Kids [${filhos.join(" ")}] /Count ${filhos.length} >>`;
  const z = (v) => String(v).padStart(2, "0");
  const quando = `D:${data.getFullYear()}${z(data.getMonth() + 1)}${z(data.getDate())}${z(data.getHours())}${z(data.getMinutes())}${z(data.getSeconds())}`;
  novo(`<< /Title ${hexUtf16(titulo)} /Author ${hexUtf16(autor)} /Creator ${hexUtf16("GaliaBrew")} /Producer ${hexUtf16("GaliaBrew")} /CreationDate (${quando}) >>`);
  const nInfo = objetos.length;

  let saida = "%PDF-1.4\n";
  const posicoes = [];
  objetos.forEach((corpo, i) => {
    posicoes.push(saida.length);
    saida += `${i + 1} 0 obj\n${corpo}\nendobj\n`;
  });
  const inicioXref = saida.length;
  saida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const p of posicoes) saida += `${String(p).padStart(10, "0")} 00000 n \n`;
  saida += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Info ${nInfo} 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  const bytes = new Uint8Array(saida.length);
  for (let i = 0; i < saida.length; i++) bytes[i] = saida.charCodeAt(i) & 0x7f;
  return bytes;
}
