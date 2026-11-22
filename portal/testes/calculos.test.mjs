// Testes do calculos.js. Rodar: node --test portal/testes/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  platoDeSg, sgDePlato, platoDeAcucar, abv, utilizacaoTinseth, ibuTinseth, srmMorey, ebcDeSrm,
  lovibondDeSrm, srmDeLovibond, calcularReceita, compararComEstilo, corHexDeSrm, fatorIsomerizacao, acucarDeSg, sgDeAcucar,
} from "../calculos.js";

const perto = (real, esperado, tol, msg) =>
  assert.ok(Math.abs(real - esperado) <= tol, `${msg ?? ""} esperado ${esperado} ± ${tol}, veio ${real}`);

test("°Plato × SG (polinômio da ASBC) e volta", () => {
  perto(platoDeSg(1.040), 10.0, 0.05, "1,040 →");
  perto(platoDeSg(1.000), 0, 0.01, "água →");
  for (const sg of [1.010, 1.048, 1.075, 1.110]) perto(sgDePlato(platoDeSg(sg)), sg, 1e-6, `ida e volta ${sg}`);
});

test("°Plato pela massa de açúcar: 1 kg em 10 L", () => {
  // água = 10 − 1/1,587 = 9,3699 L ≈ 9,3699 kg; °P = 1 / 10,3699 × 100 = 9,643
  perto(platoDeAcucar(1, 10), 9.643, 0.001);
  assert.equal(platoDeAcucar(0, 0), 0);
});

test("OG e FG batem com o Brewtarget nas 28 receitas de exemplo", () => {
  const { receitas } = JSON.parse(readFileSync(new URL("./gabarito-brewtarget.json", import.meta.url), "utf8"));
  assert.equal(receitas.length, 28);
  for (const g of receitas) {
    const r = calcularReceita(g.receita);
    perto(r.og, g.og, 0.0005, `${g.nome} OG`);
    perto(r.fg, g.fg, 0.0005, `${g.nome} FG`);
  }
});

test("Açúcar não fermentável (lactose) fica todo na FG", () => {
  const base = {
    volume_lote_l: 20, perda_panela_l: 0, eficiencia_pct: 100, fervura_min: 60,
    leveduras: [{ atenuacao_pct: 100 }],
  };
  const sem = calcularReceita({ ...base, fermentaveis: [{ tipo: "ACUCAR", rendimento_pct: 100, quantidade_kg: 1, etapa: "FERVURA" }] });
  perto(sem.fg, 1.0, 1e-9, "100% fermentável e atenuação 100% → FG 1,000");
  const com = calcularReceita({
    ...base,
    fermentaveis: [
      { tipo: "ACUCAR", rendimento_pct: 100, quantidade_kg: 1, etapa: "FERVURA" },
      { tipo: "ACUCAR", rendimento_pct: 100, quantidade_kg: 0.5, etapa: "FERVURA", fermentavel_pct: 0 },
    ],
  });
  assert.ok(com.fg > 1.009 && com.fg < 1.011, `lactose 0,5 kg em 20 L deixa ~10 pontos, veio ${com.fg}`);
});

test("Eficiência só no grão da mostura; grão fora da mostura rende 60%", () => {
  const base = { volume_lote_l: 20, perda_panela_l: 0, fervura_min: 60, leveduras: [] };
  const grao = { tipo: "GRAO", rendimento_pct: 80, quantidade_kg: 4, etapa: "MOSTURA" };
  const a = calcularReceita({ ...base, eficiencia_pct: 70, fermentaveis: [grao] });
  const b = calcularReceita({ ...base, eficiencia_pct: 100, fermentaveis: [{ ...grao, quantidade_kg: 2.8 }] });
  perto(a.og, b.og, 1e-9, "4 kg a 70% = 2,8 kg a 100%");
  const extrato = calcularReceita({ ...base, eficiencia_pct: 10, fermentaveis: [{ tipo: "EXTRATO_SECO", rendimento_pct: 95, quantidade_kg: 2, etapa: "FERVURA" }] });
  const extrato100 = calcularReceita({ ...base, eficiencia_pct: 100, fermentaveis: [{ tipo: "EXTRATO_SECO", rendimento_pct: 95, quantidade_kg: 2, etapa: "FERVURA" }] });
  perto(extrato.og, extrato100.og, 1e-9, "extrato não depende da eficiência");
  const infusao = calcularReceita({ ...base, eficiencia_pct: 100, fermentaveis: [{ ...grao, etapa: "FERVURA" }] });
  const equivalente = calcularReceita({ ...base, eficiencia_pct: 100, fermentaveis: [{ ...grao, quantidade_kg: 2.4 }] });
  perto(infusao.og, equivalente.og, 1e-9, "4 kg em infusão = 2,4 kg na mostura");
  assert.deepEqual(a.avisos, ["SEM_LEVEDURA"]);
});

test("ABV: tabela do HMRC e fórmula de reserva", () => {
  const a = abv(1.050, 1.010);          // 40,0 pontos × 0,130
  perto(a.abv_pct, 5.2, 1e-9);
  assert.equal(a.metodo, "HMRC");
  perto(abv(1.040, 1.010).abv_pct, 30 * 0.129, 1e-9);
  const forte = abv(1.130, 1.020);      // 110 pontos: fora da tabela → (76,08 × 0,11 ÷ 0,645) × (1,02 ÷ 0,794)
  assert.equal(forte.metodo, "DANIELS");
  perto(forte.abv_pct, 16.668, 0.001);
  assert.equal(abv(1.010, 1.020).metodo, "INVALIDO");
});

test("Tinseth: utilização bate com a tabela publicada", () => {
  perto(utilizacaoTinseth(1.050, 60), 0.231, 0.0015, "1,050 / 60 min");
  perto(utilizacaoTinseth(1.030, 15), 0.137, 0.0015, "1,030 / 15 min");
  perto(utilizacaoTinseth(1.080, 30), 0.135, 0.0015, "1,080 / 30 min");
  perto(utilizacaoTinseth(1.100, 90), 0.157, 0.0015, "1,100 / 90 min");
  assert.equal(utilizacaoTinseth(1.050, 0), 0);
  // 28,35 g a 6,4% em 18,93 L, 60 min, 1,050: 0,2307 × 95,85 mg/L ≈ 22,1 IBU
  perto(ibuTinseth({ alfaPct: 6.4, gramas: 28.35, minutos: 60, sgMosto: 1.050, litros: 18.93 }), 22.1, 0.1);
});

test("Fator de isomerização por temperatura (Malowicz)", () => {
  perto(fatorIsomerizacao(100), 1, 0.02, "100 °C");
  perto(fatorIsomerizacao(90), 0.49, 0.01, "90 °C");
  perto(fatorIsomerizacao(85), 0.337, 0.005, "85 °C");
  perto(fatorIsomerizacao(80), 0.229, 0.005, "80 °C");
  assert.ok(fatorIsomerizacao(70) < 0.11);
  assert.equal(fatorIsomerizacao(110), 1, "nunca passa de 1");
});

test("IBU do whirlpool: Tinseth × fator da temperatura; sem temperatura = 80 °C", () => {
  const base = {
    volume_lote_l: 20, perda_panela_l: 0, evaporacao_l_h: 0, eficiencia_pct: 75, fervura_min: 60,
    fermentaveis: [{ tipo: "GRAO", rendimento_pct: 80, quantidade_kg: 4.5, etapa: "MOSTURA", cor_srm: 2 }],
    leveduras: [{ atenuacao_pct: 75 }],
  };
  const h = { alfa_pct: 10, quantidade_g: 25, etapa: "WHIRLPOOL", tempo_min: 30 };
  const a85 = calcularReceita({ ...base, lupulos: [{ ...h, temperatura_c: 85 }] });
  const tinseth = ibuTinseth({ alfaPct: 10, gramas: 25, minutos: 30, sgMosto: a85.og, litros: 20 });
  perto(a85.ibu, tinseth * fatorIsomerizacao(85), 1e-6);
  // Caso real do Brewfather (NEAPA 83a): 25 g a 10% por 30 min a 85 °C deu 7,7 IBU.
  perto(a85.ibu, 7.7, 0.6, "perto do Brewfather");
  const semTemp = calcularReceita({ ...base, lupulos: [{ ...h, temperatura_c: null }] });
  perto(semTemp.ibu, tinseth * fatorIsomerizacao(80), 1e-6);
  const semTempo = calcularReceita({ ...base, lupulos: [{ ...h, tempo_min: 0, temperatura_c: 90 }] });
  assert.equal(semTempo.ibu, 0);
  // Lúpulo da fervura continua isomerizando no whirlpool: Tinseth de t a t + whirlpool, × fator da temperatura.
  const ferv = { alfa_pct: 13, quantidade_g: 30, etapa: "FERVURA", tempo_min: 5 };
  const so = calcularReceita({ ...base, lupulos: [ferv] });
  const com = calcularReceita({ ...base, lupulos: [ferv, { ...h, tempo_min: 10, temperatura_c: 90 }] });
  const lup = { alfaPct: 13, gramas: 30, sgMosto: so.og, litros: 20 };
  const extra = fatorIsomerizacao(90) * (ibuTinseth({ ...lup, minutos: 15 }) - ibuTinseth({ ...lup, minutos: 5 }));
  perto(com.lupulos[0].ibu, so.lupulos[0].ibu + extra, 1e-6);
  assert.ok(com.lupulos[0].ibu / so.lupulos[0].ibu > 1.5, "lúpulo de 5 min ganha muito num whirlpool de 10 min a 90 °C");
});

test("IBU da receita: fervura conta, primeiro mosto +10%, dry hop não", () => {
  const base = {
    volume_lote_l: 20, perda_panela_l: 0, evaporacao_l_h: 0, eficiencia_pct: 75, fervura_min: 60,
    fermentaveis: [{ tipo: "GRAO", rendimento_pct: 80, quantidade_kg: 4.5, etapa: "MOSTURA", cor_srm: 2 }],
    leveduras: [{ atenuacao_pct: 75 }],
  };
  const h = { alfa_pct: 10, quantidade_g: 30 };
  const fervura = calcularReceita({ ...base, lupulos: [{ ...h, etapa: "FERVURA", tempo_min: 60 }] });
  const esperado = ibuTinseth({ alfaPct: 10, gramas: 30, minutos: 60, sgMosto: fervura.og, litros: 20 });
  perto(fervura.ibu, esperado, 1e-6, "sem evaporação a gravidade da panela = OG");
  const fwh = calcularReceita({ ...base, lupulos: [{ ...h, etapa: "PRIMEIRO_MOSTO" }] });
  perto(fwh.ibu, esperado * 1.1, 1e-6);
  const semAmargor = calcularReceita({
    ...base,
    lupulos: [{ ...h, etapa: "DRY_HOP", dia: 3 }, { ...h, etapa: "ENVASE" }, { ...h, etapa: "MOSTURA", tempo_min: 60 }],
  });
  assert.equal(semAmargor.ibu, 0);
  // Com evaporação a panela começa mais diluída: utilização maior, IBU maior.
  const comEvaporacao = calcularReceita({ ...base, evaporacao_l_h: 4, lupulos: [{ ...h, etapa: "FERVURA", tempo_min: 60 }] });
  assert.ok(comEvaporacao.ibu > fervura.ibu);
  assert.ok(comEvaporacao.sg_pre_fervura < comEvaporacao.og);
});

test("Cor: Morey, conversões e cor da tela", () => {
  perto(srmMorey(10), 7.24, 0.01);
  perto(ebcDeSrm(10), 19.7, 1e-9);
  perto(srmDeLovibond(lovibondDeSrm(12)), 12, 1e-9);
  // 5 lb de malte 2 °L em 5 gal → MCU 2 → SRM 2,40
  const r = calcularReceita({
    volume_lote_l: 18.9270589, perda_panela_l: 0, fervura_min: 60, eficiencia_pct: 75,
    fermentaveis: [{ tipo: "GRAO", rendimento_pct: 80, quantidade_kg: 2.26796185, etapa: "MOSTURA", cor_srm: srmDeLovibond(2) }],
  });
  perto(r.cor_srm, srmMorey(2), 1e-6);
  assert.match(corHexDeSrm(r.cor_srm), /^#[0-9a-f]{6}$/);
  assert.equal(corHexDeSrm(0), "#fff5c8");
});

test("Volumes de água", () => {
  const r = calcularReceita({
    volume_lote_l: 20, perda_panela_l: 1, evaporacao_l_h: 3, fervura_min: 60, eficiencia_pct: 72,
    absorcao_grao_l_kg: 1, relacao_agua_grao_l_kg: 3, perda_tina_l: 0.5,
    fermentaveis: [{ tipo: "GRAO", rendimento_pct: 80, quantidade_kg: 5, etapa: "MOSTURA" }],
  });
  perto(r.volumes.pos_fervura_l, 21, 1e-9);
  perto(r.volumes.pre_fervura_l, 24, 1e-9);
  perto(r.volumes.agua_total_l, 24 + 5 + 0.5, 1e-9);
  perto(r.volumes.agua_mostura_l, 15, 1e-9);
  perto(r.volumes.agua_lavagem_l, 14.5, 1e-9);
});

test("Faixa do estilo", () => {
  const res = { og: 1.050, fg: 1.012, ibu: 40, cor_srm: 8, abv_pct: 5 };
  const e = { og_min: 1.045, og_max: 1.060, fg_min: 1.010, fg_max: 1.015, ibu_min: 30, ibu_max: 50, cor_srm_min: 5, cor_srm_max: 10 };
  assert.deepEqual(compararComEstilo(res, e), { og: "DENTRO", fg: "DENTRO", ibu: "DENTRO", cor_srm: "DENTRO", abv_pct: null });
  assert.equal(compararComEstilo({ ...res, ibu: 60 }, e).ibu, "ACIMA");
  assert.equal(compararComEstilo(res, null), null);
});

test("Lote medido: eficiência, ABV e atenuação reais", () => {
  perto(acucarDeSg(sgDeAcucar(1, 10), 10), 1, 1e-6, "acucarDeSg é o inverso de sgDeAcucar");
  const base = {
    volume_lote_l: 20, perda_panela_l: 1, evaporacao_l_h: 3, eficiencia_pct: 70, fervura_min: 60,
    fermentaveis: [
      { tipo: "GRAO", rendimento_pct: 80, quantidade_kg: 5, etapa: "MOSTURA", cor_srm: 2 },
      { tipo: "ACUCAR", rendimento_pct: 100, quantidade_kg: 0.5, etapa: "FERVURA", cor_srm: 0 },
    ],
    leveduras: [{ atenuacao_pct: 75 }],
  };
  const plano = calcularReceita(base);
  assert.equal(plano.medido.eficiencia_pct, null, "sem medidas não calcula");
  // OG medida igual à planejada, no volume planejado = eficiência planejada.
  const igual = calcularReceita({ ...base, og_medida: plano.og, fg_medida: plano.fg });
  perto(igual.medido.eficiencia_pct, 70, 0.01);
  perto(igual.medido.abv_pct, plano.abv_pct, 1e-9);
  perto(igual.medido.atenuacao_pct, ((plano.og - plano.fg) / (plano.og - 1)) * 100, 1e-9);
  // OG mais baixa = eficiência menor; mais volume com a mesma OG = eficiência maior.
  const baixa = calcularReceita({ ...base, og_medida: plano.og - 0.004 });
  assert.ok(baixa.medido.eficiencia_pct < 70);
  const maisVolume = calcularReceita({ ...base, og_medida: plano.og, volume_final_l: 22 });
  assert.ok(maisVolume.medido.eficiencia_pct > 70);
  assert.equal(calcularReceita({ ...base, og_medida: 1.050, fg_medida: 1.060 }).medido.abv_pct, null, "FG acima da OG não dá ABV");
});

test("Receita vazia não quebra", () => {
  const r = calcularReceita({});
  assert.equal(r.og, 1);
  assert.equal(r.ibu, 0);
  assert.deepEqual(r.avisos, ["SEM_VOLUME"]);
});
