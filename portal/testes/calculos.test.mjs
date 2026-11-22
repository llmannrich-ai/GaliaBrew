// Testes do calculos.js. Rodar: node --test portal/testes/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  platoDeSg, sgDePlato, platoDeAcucar, abv, utilizacaoTinseth, ibuTinseth, srmMorey, ebcDeSrm,
  lovibondDeSrm, srmDeLovibond, calcularReceita, compararComEstilo, corHexDeSrm, fatorIsomerizacao, acucarDeSg, sgDeAcucar,
  temperaturaAguaMostura, co2Residual, primingGramas,
  sgDeBrix, refratometro, corrigirDensimetro,
  SAIS, perfilAgua, leituraSulfatoCloreto,
  phMostura, classificarMalte, ACIDOS,
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

test("Água da mostura: temperatura da infusão (balanço de calor de Palmer)", () => {
  // Palmer: 1,5 qt/lb (3,13 L/kg), grão a 70 °F, alvo 154 °F → 165,2 °F (73,9 °C).
  perto(temperaturaAguaMostura({ graoC: 21.11, alvoC: 67.78, litrosPorKg: 3.13 }), 73.89, 0.05);
  // Mais água por kg = menos acima do alvo; grão na temperatura do alvo = água no alvo.
  assert.ok(temperaturaAguaMostura({ graoC: 20, alvoC: 66, litrosPorKg: 4 }) < temperaturaAguaMostura({ graoC: 20, alvoC: 66, litrosPorKg: 2.5 }));
  perto(temperaturaAguaMostura({ graoC: 66, alvoC: 66, litrosPorKg: 3 }), 66, 1e-9);
  assert.equal(temperaturaAguaMostura({ graoC: 20, alvoC: 66, litrosPorKg: 0 }), null);
  // Na receita: 1º passo da mostura, grão da receita, água da mostura ÷ kg de grão.
  const r = calcularReceita({
    volume_lote_l: 20, perda_panela_l: 1, evaporacao_l_h: 3, eficiencia_pct: 72, fervura_min: 60, relacao_agua_grao_l_kg: 3, temp_grao_c: 20,
    fermentaveis: [{ tipo: "GRAO", rendimento_pct: 80, quantidade_kg: 5, etapa: "MOSTURA", cor_srm: 2 }],
    mostura: [{ temperatura_c: 66, tempo_min: 60 }, { temperatura_c: 76, tempo_min: 10 }],
  });
  perto(r.volumes.temperatura_agua_mostura_c, temperaturaAguaMostura({ graoC: 20, alvoC: 66, litrosPorKg: 3 }), 1e-9);
});

test("Priming: CO₂ residual pela temperatura e gramas por açúcar", () => {
  perto(co2Residual(20), 0.861, 0.002, "20 °C");
  assert.ok(co2Residual(10) > co2Residual(20), "mais frio retém mais CO₂");
  // 5 galões (18,93 L), 2,4 vol, 20 °C: ~117 g de dextrose, ~106 g de sacarose (calculadoras usuais).
  perto(primingGramas({ litros: 18.93, co2Alvo: 2.4, temperaturaMaxC: 20, acucar: "DEXTROSE" }).gramas, 116.8, 0.5);
  perto(primingGramas({ litros: 18.93, co2Alvo: 2.4, temperaturaMaxC: 20 }).gramas, 106.3, 0.5);
  assert.equal(primingGramas({ litros: 20, co2Alvo: 0.5, temperaturaMaxC: 20 }).gramas, 0, "alvo abaixo do residual = 0");
  // Na receita: volume real, maior temperatura da fermentação.
  const r = calcularReceita({
    volume_lote_l: 20, volume_final_l: 18, co2_alvo_vol: 2.5, priming_acucar: "DEXTROSE",
    fermentacao: [{ temperatura_c: 18, dias: 10 }, { temperatura_c: 21, temperatura_fim_c: 22, dias: 3 }, { temperatura_c: 2, dias: 3 }],
  });
  perto(r.priming.gramas, primingGramas({ litros: 18, co2Alvo: 2.5, temperaturaMaxC: 22, acucar: "DEXTROSE" }).gramas, 1e-9);
  assert.equal(r.priming.temperatura_max_c, 22);
  assert.equal(calcularReceita({ volume_lote_l: 20 }).priming, null, "sem CO₂ desejado não calcula");
});

test("Refratômetro: mosto (°Brix ÷ fator) e cerveja fermentando (Terrill)", () => {
  perto(sgDeBrix(12, 1), sgDePlato(12), 1e-12, "fator 1: °Brix = °P");
  perto(sgDeBrix(12), sgDePlato(12 / 1.04), 1e-12, "fator padrão 1,04");
  // Terrill (cúbica): 12 → 6 °Brix com fator 1 dá FG ~1,0117 (calculadoras usuais).
  const r = refratometro({ brixInicial: 12, brixFinal: 6, fator: 1 });
  perto(r.og, 1.0484, 0.0002);
  perto(r.fg, 1.0117, 0.0002);
  perto(r.abv_pct, abv(r.og, r.fg).abv_pct, 1e-12);
  perto(r.atenuacao_pct, ((r.og - r.fg) / (r.og - 1)) * 100, 1e-9);
  // Fator maior = leituras menores = OG e FG menores.
  assert.ok(refratometro({ brixInicial: 12, brixFinal: 6, fator: 1.04 }).og < r.og);
  assert.equal(refratometro({ brixInicial: 0, brixFinal: 0 }), null);
});

test("Densímetro: correção pela temperatura da amostra", () => {
  // 1,050 lido a 100 °F num densímetro de 60 °F → ~1,056.
  perto(corrigirDensimetro({ sg: 1.050, tempC: 37.78, calibracaoC: 15.56 }), 1.0561, 0.0003);
  perto(corrigirDensimetro({ sg: 1.050, tempC: 30, calibracaoC: 20 }), 1.0526, 0.0003, "30 °C, calibrado a 20 °C");
  perto(corrigirDensimetro({ sg: 1.050, tempC: 20 }), 1.050, 1e-12, "na temperatura de calibração não muda");
  assert.ok(corrigirDensimetro({ sg: 1.050, tempC: 10 }) < 1.050, "amostra fria lê alto: correção baixa");
});

test("Água: sais em ppm, diluição, sulfato/cloreto e alcalinidade residual", () => {
  // Tabelas usuais: 1 g/L de gesso = 232,8 ppm Ca + 557,9 ppm SO₄; 1 g/L de CaCl₂·2H₂O = 272,6 Ca + 482,3 Cl.
  perto(SAIS.GESSO.calcio_ppm, 232.8, 0.1); perto(SAIS.GESSO.sulfato_ppm, 557.9, 0.1);
  perto(SAIS.CLORETO_CALCIO.calcio_ppm, 272.6, 0.1); perto(SAIS.CLORETO_CALCIO.cloreto_ppm, 482.3, 0.1);
  perto(SAIS.SULFATO_MAGNESIO.magnesio_ppm, 98.6, 0.1); perto(SAIS.CLORETO_SODIO.sodio_ppm, 393.4, 0.1);
  perto(SAIS.BICARBONATO_SODIO.bicarbonato_ppm, 726.3, 0.2);
  // 5 g de gesso em 25 L sobre água destilada = 46,6 Ca e 111,6 SO₄.
  const p = perfilAgua({ sais: [{ sal: "GESSO", gramas: 5 }], litros: 25 });
  perto(p.ions.calcio_ppm, 46.56, 0.05); perto(p.ions.sulfato_ppm, 111.6, 0.1);
  assert.equal(p.sulfato_cloreto, null, "sem cloreto não há relação");
  // Diluição 50% corta todos os íons da origem pela metade.
  const o = { calcio_ppm: 80, magnesio_ppm: 10, sodio_ppm: 20, sulfato_ppm: 40, cloreto_ppm: 40, bicarbonato_ppm: 244 };
  const d = perfilAgua({ origem: o, diluicaoPct: 50, litros: 20 });
  perto(d.ions.bicarbonato_ppm, 122, 1e-9); perto(d.sulfato_cloreto, 1, 1e-9);
  // Alcalinidade: 244 ppm HCO₃ = 200 ppm como CaCO₃; RA = 200 − 80/1,4 − 10/1,7.
  const full = perfilAgua({ origem: o, litros: 20 });
  perto(full.alcalinidade, 200.1, 0.1);
  perto(full.alcalinidade_residual, full.alcalinidade - 80 / 1.4 - 10 / 1.7, 1e-9);
  assert.equal(leituraSulfatoCloreto(3), "SECA_AMARGA"); assert.equal(leituraSulfatoCloreto(1), "EQUILIBRADA"); assert.equal(leituraSulfatoCloreto(0.5), "MALTADA");
  // Na receita: sais na água total, divididos entre mostura e lavagem.
  const r = calcularReceita({
    volume_lote_l: 20, perda_panela_l: 1, evaporacao_l_h: 3, eficiencia_pct: 72, fervura_min: 60, relacao_agua_grao_l_kg: 3,
    fermentaveis: [{ tipo: "GRAO", rendimento_pct: 80, quantidade_kg: 5, etapa: "MOSTURA", cor_srm: 2 }],
    agua_origem: o, sais: [{ sal: "GESSO", gramas: 6 }],
  });
  perto(r.agua.litros, r.volumes.agua_total_l, 1e-9);
  perto(r.agua.ions.sulfato_ppm, 40 + (557.9 * 6) / r.volumes.agua_total_l, 0.05);
  perto(r.agua.sais[0].mostura_g + r.agua.sais[0].lavagem_g, 6, 1e-9);
  perto(r.agua.sais[0].mostura_g, (6 * r.volumes.agua_mostura_l) / r.volumes.agua_total_l, 1e-9);
  assert.equal(calcularReceita({ volume_lote_l: 20 }).agua, null, "sem água nem sais não calcula");
});

test("pH da mostura: estimativa calibrada por regras práticas", () => {
  const pils = (kg) => ({ nome: "Pilsner", cor_srm: 1.8, quantidade_kg: kg });
  const ph = (maltes, ions = {}, acidos = []) => phMostura({ maltes, litros: maltes.reduce((s, x) => s + x.quantidade_kg, 0) * 3, ions, acidos });
  perto(ph([pils(5)]).ph, 5.72, 0.05, "100% pilsen em destilada");
  // ~0,07 de pH a menos por 1% de malte acidificado.
  const acid = ph([pils(4.9), { nome: "Acidulated", cor_srm: 1.7, quantidade_kg: 0.1 }]).ph;
  perto(ph([pils(5)]).ph - acid, 0.15, 0.04, "2% de malte acidificado");
  // Escura em destilada fica ácida; com água alcalina (tipo Dublin) volta para a faixa.
  const stout = [{ nome: "Pale", cor_srm: 3.5, quantidade_kg: 4 }, { nome: "Flaked barley", cor_srm: 2, quantidade_kg: 0.5 }, { nome: "Roasted Barley", cor_srm: 677, quantidade_kg: 0.5 }];
  assert.ok(ph(stout).ph < 5.4, "stout em destilada abaixo de 5,4");
  assert.ok(ph(stout, { bicarbonato_ppm: 300, calcio_ppm: 120 }).ph > ph(stout).ph + 0.1, "alcalinidade sobe o pH");
  // Kolbach: alcalinidade residual de 10 °dH (178 ppm como CaCO₃) sobe ~0,3 (aqui ~0,25) a 4 L/kg.
  const kol = phMostura({ maltes: [pils(5)], litros: 20, ions: { bicarbonato_ppm: 217 } }).ph - phMostura({ maltes: [pils(5)], litros: 20 }).ph;
  assert.ok(kol > 0.2 && kol < 0.35, `Kolbach: +${kol.toFixed(2)}`);
  // Cálcio baixa o pH; ácido baixa o pH; "quanto ácido para 5,4" leva exatamente a 5,4.
  assert.ok(ph([pils(5)], { calcio_ppm: 150 }).ph < ph([pils(5)]).ph);
  const base = ph([pils(5)]);
  const ml = base.ml_para(5.4, "LATICO_88");
  perto(ph([pils(5)], {}, [{ acido: "LATICO_88", ml }]).ph, 5.4, 0.005, "ácido sugerido chega ao alvo");
  perto(ACIDOS.LATICO_88.mmol_ml, 11.82, 0.05);
  // Classificação dos maltes pelo nome/cor.
  assert.equal(classificarMalte({ nome: "Carafa Special III", cor_srm: 600 }).classe, "TORRADO");
  assert.equal(classificarMalte({ nome: "Caramunich II", cor_srm: 60 }).classe, "CRISTAL");
  assert.equal(classificarMalte({ nome: "Acid Malt", cor_srm: 3 }).classe, "ACIDIFICADO");
  assert.equal(classificarMalte({ nome: "Munich I", cor_srm: 8 }).classe, "BASE");
  // Na receita: grãos da mostura e água da mostura.
  const r = calcularReceita({
    volume_lote_l: 20, perda_panela_l: 1, evaporacao_l_h: 3, eficiencia_pct: 72, fervura_min: 60, relacao_agua_grao_l_kg: 3,
    fermentaveis: [{ nome: "Pilsner", tipo: "GRAO", rendimento_pct: 80, quantidade_kg: 5, etapa: "MOSTURA", cor_srm: 1.8 },
      { nome: "Açúcar", tipo: "ACUCAR", rendimento_pct: 100, quantidade_kg: 0.5, etapa: "FERVURA", cor_srm: 0 }],
    acidos: [{ acido: "LATICO_88", ml: 2 }],
  });
  perto(r.ph_mostura.ph, phMostura({ maltes: [{ nome: "Pilsner", cor_srm: 1.8, quantidade_kg: 5 }], litros: r.volumes.agua_mostura_l, acidos: [{ acido: "LATICO_88", ml: 2 }] }).ph, 1e-9);
  assert.ok(r.ph_mostura.ph_sem_acido > r.ph_mostura.ph);
  assert.equal(calcularReceita({ volume_lote_l: 20 }).ph_mostura, null);
});

test("Receita vazia não quebra", () => {
  const r = calcularReceita({});
  assert.equal(r.og, 1);
  assert.equal(r.ibu, 0);
  assert.deepEqual(r.avisos, ["SEM_VOLUME"]);
});
