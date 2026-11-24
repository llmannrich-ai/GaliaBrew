// Testes das faixas da roleta (portal/faixas.js): valores das rodas, valor atual fora da grade, presets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { valoresDaFaixa, rodasDaFaixa, valorDasRodas, valorInicial, indicesDoValor, FAIXAS, FAIXAS_LUGAR, faixaCor, presetFermentavel, presetLupulo } from "../faixas.js";

const fmt = (v, c) => v.toFixed(c).replace(".", ",");

test("roda única: passo uniforme e segmentos que continuam do último valor", () => {
  assert.deepEqual(valoresDaFaixa({ min: 0, max: 3, passo: 1 }), [0, 1, 2, 3]);
  const g = valoresDaFaixa(FAIXAS.quantidade_g);
  assert.equal(g[0], 0);
  assert.equal(g[100], 100);
  assert.equal(g[101], 105);                       // depois de 100 g, de 5 em 5
  assert.equal(g.at(-1), 1000);
  assert.ok(g.every((v, i) => i === 0 || v > g[i - 1]), "em ordem, sem repetir");
  const sg = valoresDaFaixa(FAIXAS_LUGAR.sg);
  assert.equal(sg.length, 161);
  assert.ok(sg.includes(1.05) && sg.includes(0.99) && sg.includes(1.15));
});

test("roda única: valor fora da grade entra na lista (abrir e fechar não muda o número)", () => {
  const [roda] = rodasDaFaixa(FAIXAS.quantidade_g, 12.5, fmt);
  assert.equal(roda.valores[roda.indice], 12.5);
  assert.equal(roda.textos[roda.indice], "12,5");
  assert.equal(valorDasRodas(FAIXAS.quantidade_g, [roda], [roda.indice]), 12.5);
  const [acima] = rodasDaFaixa(FAIXAS.quantidade_g, 1500, fmt);      // acima do máximo
  assert.equal(acima.valores.at(-1), 1500);
});

test("duas rodas (inteiro | fração): 4,25 kg e volta", () => {
  const f = FAIXAS.quantidade_kg;
  const rodas = rodasDaFaixa(f, 4.25, fmt);
  assert.equal(rodas.length, 2);
  assert.equal(rodas[0].valores[rodas[0].indice], 4);
  assert.equal(rodas[1].textos[rodas[1].indice], "25");      // a vírgula fica entre as rodas
  assert.equal(rodas[1].valores.length, 100);
  assert.equal(valorDasRodas(f, rodas, rodas.map((r) => r.indice)), 4.25);
  // girar a fração para ,50
  assert.equal(valorDasRodas(f, rodas, [rodas[0].indice, rodas[1].valores.indexOf(0.5)]), 4.5);
  // não passa do máximo: 50 | ,99 → 50
  assert.equal(valorDasRodas(f, rodas, [rodas[0].valores.indexOf(50), 99]), 50);
  // fração fora da grade (4,255) entra na roda das frações
  const r2 = rodasDaFaixa(f, 4.255, fmt);
  assert.equal(valorDasRodas(f, r2, r2.map((r) => r.indice)), 4.255);
});

test("malte: no mínimo 100 g na roleta (0 | ,05 vira 0,10 e as rodas voltam para 0 | 10)", () => {
  const f = FAIXAS.quantidade_kg;
  const rodas = rodasDaFaixa(f, 4, fmt);
  const v = valorDasRodas(f, rodas, [rodas[0].valores.indexOf(0), rodas[1].valores.indexOf(0.05)]);
  assert.equal(v, 0.1);
  const [i0, i1] = indicesDoValor(rodas, v);
  assert.equal(rodas[0].textos[i0], "0");
  assert.equal(rodas[1].textos[i1], "10");
  // malte que já estava abaixo (30 g de acidificado de uma receita antiga) não sobe sozinho ao abrir
  const antigas = rodasDaFaixa(f, 0.03, fmt);
  assert.equal(valorDasRodas(f, antigas, antigas.map((r) => r.indice)), 0.03);
});

test("valor inicial: atual; vazio → o mais provável; dentro da faixa", () => {
  assert.equal(valorInicial(FAIXAS.eficiencia_pct, 68), 68);
  assert.equal(valorInicial(FAIXAS.eficiencia_pct, null), 72);
  assert.equal(valorInicial({ ...FAIXAS.eficiencia_pct, inicial: () => 150 }, null), 100);
  assert.equal(valorInicial({ min: 5, max: 9, passo: 1 }, null), 5);
});

test("cor: faixa na unidade da tela", () => {
  const ebc = valoresDaFaixa(faixaCor("EBC"));
  assert.ok(ebc.includes(6.5) && ebc.includes(1400) && ebc.length < 400);
  const srm = valoresDaFaixa(faixaCor("SRM"));
  assert.ok(srm.includes(1.8) && srm.includes(500));
});

test("presets: malte base, especial e cristal; lúpulo por etapa; proporcional ao lote", () => {
  const r = { volume_lote_l: 20, fermentaveis: [] };
  assert.equal(presetFermentavel({ tipo: "GRAO", cor_srm: 1.8 }, r), 4);
  r.fermentaveis.push({ tipo: "GRAO", cor_srm: 1.8, quantidade_kg: 4 });
  assert.equal(presetFermentavel({ tipo: "GRAO", cor_srm: 2 }, r), 1);
  assert.equal(presetFermentavel({ tipo: "GRAO", cor_srm: 9 }, r), 0.5);
  assert.equal(presetFermentavel({ tipo: "GRAO", cor_srm: 60 }, r), 0.25);
  assert.equal(presetFermentavel({ tipo: "ACUCAR", cor_srm: 0 }, r), 0.5);
  assert.equal(presetFermentavel({ tipo: "GRAO", cor_srm: 1.8 }, { volume_lote_l: 40, fermentaveis: [] }), 8);
  assert.equal(presetLupulo({ etapa: "FERVURA", tempo_min: 60 }, r), 20);
  assert.equal(presetLupulo({ etapa: "FERVURA", tempo_min: 10 }, r), 30);
  assert.equal(presetLupulo({ etapa: "WHIRLPOOL" }, r), 40);
  assert.equal(presetLupulo({ etapa: "DRY_HOP" }, { volume_lote_l: 10 }), 25);
});

test("todas as faixas têm min < max e valor inicial dentro", () => {
  for (const [k, f] of Object.entries({ ...FAIXAS, ...FAIXAS_LUGAR })) {
    assert.ok(f.min < f.max, k);
    const ini = valorInicial(f, null);
    assert.ok(ini >= f.min && ini <= f.max, k);
    if (!f.partes) assert.ok(valoresDaFaixa(f).length <= 1100, `${k}: roda com itens demais`);
  }
});
