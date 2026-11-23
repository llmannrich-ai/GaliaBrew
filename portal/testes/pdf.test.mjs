// Testes do gerador de PDF (portal/pdf.js). Rodar: node --test portal/testes/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { A4, gerarPdf, limparTexto, larguraTexto, quebrarTexto, encurtarTexto } from "../pdf.js";

const texto = (bytes) => Buffer.from(bytes).toString("latin1");

test("limparTexto: troca o que a fonte do PDF não tem e mantém os acentos do português", () => {
  assert.equal(limparTexto("CO₂ ≥ 2,4 · SO₄/Cl — maçã, pão, °C"), "CO2 >= 2,4 · SO4/Cl — maçã, pão, °C");
  assert.equal(limparTexto("linha 1\nlinha 2"), "linha 1 linha 2");
  assert.equal(limparTexto("Žatec 🍺"), "Žatec ?");
  assert.equal(limparTexto("Plzeň"), "Plzen");
  assert.equal(limparTexto(null), "");
});

test("larguraTexto: métricas da Helvetica (negrito é mais largo; acento não muda a largura)", () => {
  assert.equal(larguraTexto("0000", 10), 22.24);
  assert.equal(larguraTexto("ção", 10), larguraTexto("cao", 10));
  assert.ok(larguraTexto("Malte", 10, true) > larguraTexto("Malte", 10));
});

test("quebrarTexto: nenhuma linha passa da largura, nada se perde, quebras do texto valem", () => {
  const frase = "Fermentar a 18 °C por 10 dias e subir para 21 °C no fim; dry hop no dia 7 com 60 g de Citra e 40 g de Mosaic.";
  const linhas = quebrarTexto(frase, 10, 150);
  assert.ok(linhas.length > 2);
  assert.ok(linhas.every((l) => larguraTexto(l, 10) <= 150));
  assert.equal(linhas.join(" "), frase);
  assert.deepEqual(quebrarTexto("um\n\ndois", 10, 150), ["um", "", "dois"]);
  const longa = quebrarTexto("x".repeat(200), 10, 100);
  assert.ok(longa.length > 1 && longa.every((l) => larguraTexto(l, 10) <= 100) && longa.join("") === "x".repeat(200));
});

test("encurtarTexto: corta com reticências e cabe", () => {
  const t = encurtarTexto("Weyermann Carafa Special III descascado", 10, 80);
  assert.ok(t.endsWith("…") && larguraTexto(t, 10) <= 80);
  assert.equal(encurtarTexto("Pilsen", 10, 80), "Pilsen");
});

test("gerarPdf: arquivo bem formado (cabeçalho, tabela de objetos com as posições certas, páginas, texto)", () => {
  const pagina = (txt) => ({ ...A4, itens: [
    { tipo: "ret", x: 40, y: 40, l: 100, a: 20, cor: "#f3ece0" },
    { tipo: "linha", x1: 40, y1: 70, x2: 300, y2: 70, cor: "#a14f17", esp: 1.5 },
    { tipo: "texto", x: 40, y: 100, txt, tam: 12, negrito: true, cor: "#1a130d", alinh: "inicio" },
    { tipo: "texto", x: 555, y: 120, txt: "1,050", tam: 10, negrito: false, cor: "#4d4237", alinh: "fim" },
  ] });
  const pdf = texto(gerarPdf([pagina("Pão líquido"), pagina("Página 2")], { titulo: "Receita ção", data: new Date(2026, 10, 23, 9, 5, 7) }));
  assert.ok(pdf.startsWith("%PDF-1.4\n") && pdf.endsWith("%%EOF\n"));
  assert.ok(/^[\x00-\x7f]*$/.test(pdf), "arquivo só com ASCII");
  assert.match(pdf, /\/Type \/Pages \/Kids \[\d+ 0 R \d+ 0 R\] \/Count 2/);
  assert.match(pdf, /\/BaseFont \/Helvetica-Bold \/Encoding \/WinAnsiEncoding/);
  assert.match(pdf, /\/CreationDate \(D:20261123090507\)/);
  // "Pão líquido" em WinAnsi (ã = e3, í = ed), escrito em hexadecimal
  assert.ok(pdf.includes("<50e36f206ced717569646f> Tj"));
  // texto alinhado à direita: x = 555 − largura
  assert.ok(pdf.includes(`${Number((555 - larguraTexto("1,050", 10)).toFixed(2))} ${Number((A4.altura - 120).toFixed(2))} Td`));
  // cada posição da tabela xref aponta para "N 0 obj"
  const inicio = Number(pdf.match(/startxref\n(\d+)\n%%EOF\n$/)[1]);
  assert.equal(pdf.slice(inicio, inicio + 4), "xref");
  const linhas = pdf.slice(inicio).split("\n");
  const total = Number(linhas[1].split(" ")[1]);
  for (let i = 1; i < total; i++) {
    const pos = Number(linhas[2 + i].slice(0, 10));
    assert.ok(pdf.slice(pos).startsWith(`${i} 0 obj\n`), `objeto ${i}`);
  }
  // o tamanho declarado de cada conteúdo confere
  for (const m of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) assert.equal(m[2].length, Number(m[1]));
});
