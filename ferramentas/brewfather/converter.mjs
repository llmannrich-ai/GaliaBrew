// Converte as receitas de um backup completo do Brewfather (backup.json) para o formato de salvar_receita(p jsonb)
// e recalcula OG/FG/ABV/IBU/cor com o portal/calculos.js, comparando com os números do Brewfather.
//
// Uso: node ferramentas/brewfather/converter.mjs <backup.json> <saida.json>
// O estilo vai como `estilo_nome` (chave ignorada por salvar_receita); o importar.py troca pelo estilo_id do catálogo.
// Não grava nada no banco.
import fs from "node:fs";
import { calcularReceita, srmDeLovibond } from "../../portal/calculos.js";

const [, , backupPath, saidaPath] = process.argv;
if (!backupPath || !saidaPath) {
  console.error("Uso: node ferramentas/brewfather/converter.mjs <backup.json> <saida.json>");
  process.exit(2);
}

const d = JSON.parse(fs.readFileSync(backupPath, "utf8"));
const receitasBf = d?.data?.recipes;
if (!Array.isArray(receitasBf)) throw new Error("Arquivo não parece um backup do Brewfather (data.recipes ausente).");

const n = (x, def = null) => (x === null || x === undefined || x === "" || Number.isNaN(+x) ? def : +x);
const pos = (x) => (n(x) > 0 ? n(x) : null);
const naoNeg = (x) => (n(x) !== null && n(x) >= 0 ? n(x) : null);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Valores do Brewfather → listas (CHECK) do banco.
const TIPO_FERM = { Grain: "GRAO", Adjunct: "GRAO", Sugar: "ACUCAR", "Dry Extract": "EXTRATO_SECO", "Liquid Extract": "EXTRATO",
  Fruit: "FRUTA", Juice: "SUCO", Honey: "MEL", Other: "OUTRO" };
const FORMA_LUP = { Pellet: "PELLET", Leaf: "FLOR", Plug: "PLUG", Extract: "EXTRATO", Cryo: "CRIO" };
const TIPO_LEV = { Ale: "ALE", Lager: "LAGER", Wheat: "TRIGO", Wine: "VINHO", Champagne: "VINHO", Kveik: "KVEIK" };
const FORMA_LEV = { Dry: "SECA", Liquid: "LIQUIDA", Slant: "SLANT", Culture: "CULTURA" };
const UNID_LEV = { pkg: "PACOTE", "billion cells": "BILHOES_CELULAS", ml: "ML", g: "G" };
const TIPO_OUTRO = { "Water Agent": "SAL_AGUA", Fining: "CLARIFICANTE", Spice: "TEMPERO", Flavor: "SABOR", Herb: "ERVA", Other: "OUTRO" };
const UNID_OUTRO = { g: "G", kg: "KG", ml: "ML", l: "L", items: "UN", tsp: "COLHER_CHA", tbsp: "COLHER_SOPA" };
const ETAPA_OUTRO = { Mash: "MOSTURA", Sparge: "MOSTURA", Boil: "FERVURA", Primary: "FERMENTACAO", Secondary: "FERMENTACAO",
  Bottling: "ENVASE" };
const NOME_FERMENT = { Primary: "Primária", Secondary: "Secundária", Tertiary: "Terciária", Conditioning: "Maturação",
  "Cold Crash": "Cold crash" };
// Nomes do BJCP 2015 (ou do Brewfather) que mudaram no catálogo BJCP 2021.
const ESTILO_ALIAS = { "English Barleywine": "English Barley Wine", "Red IPA": "Specialty IPA" };

const avisos = [];
const saida = [];
for (const r of receitasBf) {
  const ferms = r.fermentables || [];
  if (ferms.length === 0) {
    avisos.push(`Ignorada (sem fermentáveis): "${r.name ?? ""}"`);
    continue;
  }
  const eq = r.equipment || {};
  const estiloBf = r.style?.name ?? null;
  const p = {
    nome: (r.name || "").trim() || "Nova receita (sem nome no Brewfather)",
    tipo: r.type === "Partial Mash" ? "PARCIAL" : r.type === "Extract" ? "EXTRATO" : "ALL_GRAIN",
    autor: r.author || null,
    estilo_nome: estiloBf ? (ESTILO_ALIAS[estiloBf] ?? estiloBf) : null,
    volume_lote_l: pos(r.batchSize ?? eq.batchSize) ?? 20,
    // O GaliaBrew aplica a eficiência ao açúcar do grão e mede a OG no pós-fervura: equivale à eficiência
    // de MOSTURA do Brewfather (com ela, 100 de 102 receitas batem a OG em ±0,002).
    eficiencia_pct: clamp(n(r.mashEfficiency ?? eq.mashEfficiency, 72), 0, 100),
    fervura_min: Math.round(n(r.boilTime ?? eq.boilTime, 60)),
    evaporacao_l_h: Math.max(0, n(eq.boilOffPerHr, 3)),
    perda_panela_l: Math.max(0, n(eq.trubChillerLoss, 0)),
    absorcao_grao_l_kg: Math.max(0, n(eq.grainAbsorptionRate, 1)),
    relacao_agua_grao_l_kg: Math.max(0, n(eq.waterGrainRatio, 3)),
    perda_tina_l: Math.max(0, n(eq.mashTunDeadSpace, 0)),
    publica: false,
    notas: [r.notes, r.description].filter((x) => typeof x === "string" && x.trim()).join("\n\n") || null,
    extras: {
      fonte: "brewfather",
      brewfather_id: r._id,
      importado_em: new Date().toISOString().slice(0, 10),
      brewfather: { og: r.og, fg: r.fg, abv: r.abv, ibu: r.ibu, cor_srm: r.color, estilo: estiloBf,
        guia: r.style?.styleGuide ?? null, equipamento: eq.name ?? null, eficiencia_mostura: r.mashEfficiency ?? null,
        eficiencia_total: r.efficiency ?? null },
    },
  };

  p.fermentaveis = ferms.filter((f) => pos(f.amount)).map((f) => {
    const tipo = TIPO_FERM[f.type] || "OUTRO";
    const rend = n(f.potentialPercentage) ?? (n(f.potential) ? ((n(f.potential) - 1) / 0.04621) * 100 : 75);
    return {
      nome: f.name, tipo, rendimento_pct: clamp(rend, 0, 100), umidade_pct: 0,  // rendimento do Brewfather já é "como está"
      cor_srm: Math.max(0, srmDeLovibond(n(f.color, 0))),                      // cor do malte no Brewfather vem em °L
      fermentavel_pct: f.notFermentable ? 0 : 100, quantidade_kg: +f.amount,
      etapa: tipo === "GRAO" || f.use === "Mash" ? "MOSTURA" : "FERVURA",
    };
  });

  p.lupulos = (r.hops || []).filter((h) => pos(h.amount)).map((h) => {
    const base = { nome: h.name, forma: FORMA_LUP[h.type] || "OUTRO", alfa_pct: clamp(n(h.alpha, 0), 0, 100), quantidade_g: +h.amount };
    if (h.use === "Dry Hop") return { ...base, etapa: "DRY_HOP", dia: Math.max(0, Math.round(n(h.day, 0))) };
    if (h.use === "Aroma" || h.use === "Whirlpool") {
      const t = pos(h.temp) ?? pos(r.avgWeightedHopstandTemp);
      return { ...base, etapa: "WHIRLPOOL", tempo_min: naoNeg(h.time), temperatura_c: t !== null ? clamp(t, 0, 100) : null };
    }
    if (h.use === "First Wort") return { ...base, etapa: "PRIMEIRO_MOSTO", tempo_min: naoNeg(h.time) };
    if (h.use === "Mash") return { ...base, etapa: "MOSTURA", tempo_min: naoNeg(h.time) };
    return { ...base, etapa: "FERVURA", tempo_min: Math.max(0, n(h.time, 0)) };
  });

  p.leveduras = (r.yeasts || []).map((y) => ({
    nome: y.name + (y.productId && !String(y.name).includes(y.productId) ? ` (${y.productId})` : ""),
    tipo: TIPO_LEV[y.type] || "OUTRO",
    forma: FORMA_LEV[y.form] || "SECA",
    atenuacao_pct: n(y.attenuation) !== null ? clamp(+y.attenuation, 0, 100) : null,
    quantidade: pos(y.amount),
    unidade: pos(y.amount) ? UNID_LEV[y.unit] || "UN" : null,
    etapa: "PRIMARIA",
  }));

  p.outros = (r.miscs || []).filter((m) => pos(m.amount)).map((m) => ({
    nome: m.name, tipo: TIPO_OUTRO[m.type] || "OUTRO", quantidade: +m.amount, unidade: UNID_OUTRO[m.unit] || "UN",
    etapa: ETAPA_OUTRO[m.use] || "FERVURA", tempo_min: m.timeIsDays ? null : naoNeg(m.time),
  }));

  p.mostura = ((r.mash || {}).steps || []).filter((s) => n(s.stepTemp) !== null).map((s, i) => ({
    nome: (s.name || "").trim() || `Passo ${i + 1}`,
    tipo: s.type === "Decoction" ? "DECOCCAO" : s.type === "Infusion" ? "INFUSAO" : "TEMPERATURA",
    temperatura_c: clamp(+s.stepTemp, 0, 100), tempo_min: Math.max(0, Math.round(n(s.stepTime, 0))),
    rampa_min: pos(s.rampTime) ? Math.round(s.rampTime) : null,
  }));

  p.fermentacao = ((r.fermentation || {}).steps || []).filter((s) => n(s.stepTemp) !== null).map((s, i) => ({
    nome: NOME_FERMENT[s.type] || s.type || `Etapa ${i + 1}`, temperatura_c: +s.stepTemp, dias: Math.max(0, n(s.stepTime, 0)),
  }));

  const c = calcularReceita(p);
  Object.assign(p, { og_calc: +c.og.toFixed(4), fg_calc: +c.fg.toFixed(4), abv_calc_pct: +c.abv_pct.toFixed(2),
    ibu_calc: +c.ibu.toFixed(1), cor_srm_calc: +c.cor_srm.toFixed(1) });
  saida.push(p);
}
fs.writeFileSync(saidaPath, JSON.stringify(saida));

// Relatório: GaliaBrew × Brewfather.
const dif = (campo, chaveBf, rel) => saida
  .map((p) => { const a = p[campo], b = p.extras.brewfather[chaveBf];
    return [p.nome, b == null ? null : rel ? (b > 0 ? (a - b) / b : null) : a - b]; })
  .filter((x) => x[1] !== null);
const resumo = (arr, casas) => {
  const v = arr.map((x) => Math.abs(x[1])).sort((a, b) => a - b);
  const piores = [...arr].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3).map((x) => `${x[0]} (${x[1].toFixed(casas)})`);
  return `mediana ${v[Math.floor(v.length / 2)]?.toFixed(casas)} | máx ${v.at(-1)?.toFixed(casas)} | piores: ${piores.join("; ")}`;
};
const og = dif("og_calc", "og");
console.log(`Convertidas: ${saida.length} de ${receitasBf.length} → ${saidaPath}`);
console.log(`OG  (dif.):      ${resumo(og, 4)}  — dentro de ±0,002: ${og.filter((x) => Math.abs(x[1]) <= 0.002).length}/${og.length}`);
console.log(`FG  (dif.):      ${resumo(dif("fg_calc", "fg"), 4)}`);
console.log(`IBU (dif. rel.): ${resumo(dif("ibu_calc", "ibu", true), 2)}  — whirlpool conta 0 no GaliaBrew`);
console.log(`Cor (dif. rel.): ${resumo(dif("cor_srm_calc", "cor_srm", true), 2)}`);
for (const a of avisos) console.log("Aviso:", a);
