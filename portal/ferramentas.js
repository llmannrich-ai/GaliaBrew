// ferramentas.js — calculadoras avulsas (mesmas fórmulas do calculos.js).
// 24/11/2026 (pedido do responsável): a página é um menu de botões, um por ferramenta; cada ferramenta abre numa janela
// (dialog modal). O botão mostra o resultado da última conta; na janela o resultado fica preso no topo, à vista enquanto
// a roleta (celular) ou o teclado mudam os números.
import { el, preencher, numeroBR, campoNumero, campoSelect, info } from "./ui.js?v=20261125b";
import { icone } from "./icones.js?v=20261125b";
import { roletaAberta, fecharRoleta } from "./roleta.js?v=20261125b";
import { FAIXAS, FAIXAS_LUGAR as F } from "./faixas.js?v=20261125b";
import { temperaturaAguaMostura, primingGramas, refratometro, corrigirDensimetro, platoDeSg, FATOR_REFRATOMETRO_PADRAO } from "./calculos.js?v=20261125b";
import { preferencias, salvarPreferencias } from "./estado.js?v=20261125b";
import * as O from "./opcoes.js?v=20261125b";

// Volume que o grão ocupa na tina (L por kg), para saber se a mostura cabe.
const VOLUME_GRAO_L_KG = 0.67;

// Os valores ficam enquanto o portal estiver aberto (trocar de tela e voltar não apaga).
const agua = { graos_kg: 5, relacao: 3, grao_c: 20, alvo_c: 66 };
const prim = { litros: 20, co2: 2.4, temp_c: 20, acucar: "SACAROSE" };
// Fator do refratômetro e calibração do densímetro são do aparelho: ficam salvos neste navegador.
const refr = { og: 1.046, brix_fim: null, get fator() { return preferencias.fator_refratometro ?? FATOR_REFRATOMETRO_PADRAO; },
  set fator(v) { preferencias.fator_refratometro = v; salvarPreferencias(); } };
const dens = { sg: 1.050, temp_c: 25, get calibracao_c() { return preferencias.calibracao_densimetro_c ?? 20; },
  set calibracao_c(v) { preferencias.calibracao_densimetro_c = v; salvarPreferencias(); } };
const descobrir = { sg: null, brix: null };
// Densidade: aceita 1,050, 1050 e 50 (pontos).
const sg = { de: (x) => x, para: (v) => (v >= 900 ? v / 1000 : v > 2 && v < 200 ? 1 + v / 1000 : v) };

// Cada ferramenta: contas() lê os valores e devolve { metricas: [[rótulo, valor]], avisos: [{ texto, alerta }] } (sem
// DOM: serve à janela e ao resumo do botão); campos() monta o formulário; resumo(c) = a linha curta do botão.
// cor = par de fundo/traço dos papéis de parede (--pp-*), com contraste já conferido em todos os temas.
const FERRAMENTAS = [
  { id: "agua", nome: "Água da mostura", grupo: "Brassagem", icone: "brassagem", cor: "mostura",
    descricao: "Quanta água e em que temperatura colocar para o grão + água ficar na temperatura da parada.",
    contas: contasAgua, campos: camposAgua, resumo: (c) => (c.metricas.length ? `${c.metricas[0][1]} a ${c.metricas[1][1]}` : "") },
  { id: "priming", nome: "Priming", grupo: "Envase", icone: "garrafa", cor: "ferm",
    descricao: "Açúcar para carbonatar na garrafa ou no barril.",
    contas: contasPriming, campos: camposPriming, resumo: (c) => (c.metricas.length ? `${c.metricas[0][1]} de ${c.metricas[0][0].split(" (")[0].toLowerCase()} para ${curto(prim.litros)} L` : "") },
  { id: "refratometro", nome: "Refratômetro", grupo: "Medição", icone: "refratometro", cor: "lavagem",
    descricao: "Com a densidade do mosto e o °Brix da cerveja fermentando, corrige o efeito do álcool (equação de Terrill).",
    contas: contasRefratometro, campos: camposRefratometro, resumo: (c) => c.metricas.slice(0, 2).map(([r, v]) => `${r.split(" ")[0]} ${v}`).join(" · ") },
  { id: "densimetro", nome: "Densímetro", grupo: "Medição", icone: "densimetro", cor: "agua",
    descricao: "Corrige a leitura de uma amostra fora da temperatura de calibração do densímetro.",
    contas: contasDensimetro, campos: camposDensimetro, resumo: (c) => (c.metricas.length ? `${numeroBR(dens.sg, 3)} a ${curto(dens.temp_c)} °C → ${c.metricas[0][1]}` : "") },
];

export function telaFerramentas(conteudo) {
  const botoes = FERRAMENTAS.map((f) => {
    const resumo = el("span", { class: "fb-resumo" });
    const atualizar = () => { resumo.textContent = f.resumo(f.contas()) || "Abrir para calcular"; };
    const b = el("button", { type: "button", class: "ferramenta-botao", dataset: { ferramenta: f.id, cor: f.cor },
      "aria-haspopup": "dialog", on: { click: () => abrirFerramenta(f, b, atualizar) } },
      el("span", { class: "fb-icone" }, icone(f.icone)),
      el("span", { class: "fb-texto" },
        el("span", { class: "fb-grupo", text: f.grupo }),
        el("span", { class: "fb-nome", text: f.nome }),
        resumo),
      el("span", { class: "fb-seta" }, icone("abrir")));
    atualizar();
    return el("li", {}, b);
  });
  preencher(conteudo,
    el("div", { class: "titulo-linha" }, el("h2", { text: "Ferramentas" })),
    el("p", { class: "nota ferramentas-intro", text: "Calculadoras do dia da brassagem. Os números ficam guardados enquanto o app está aberto." }),
    el("ul", { class: "ferramentas-menu", "aria-label": "Ferramentas" }, botoes));
}

/** Janela da ferramenta: topo (ícone, nome, ×) com o resultado preso logo abaixo; campos e notas; "Pronto" no pé. */
function abrirFerramenta(f, botao, aoFechar) {
  if (document.querySelector("dialog.ferramenta-janela")) return;
  const resultado = el("div", { class: "fj-resultado", "aria-live": "polite" });
  const calcular = () => {
    const c = f.contas();
    preencher(resultado,
      c.metricas.length ? el("div", { class: "fj-metricas" }, c.metricas.map(([r, v]) => linha(r, v))) : null,
      c.avisos.map((a) => el("p", { class: `nota${a.alerta ? " alerta" : ""}`, text: a.texto })));
  };
  const fechar = () => { if (d.open) d.close(); };
  const idTitulo = `fj-titulo-${f.id}`;
  const d = el("dialog", { class: "ferramenta-janela", dataset: { ferramenta: f.id, cor: f.cor }, "aria-labelledby": idTitulo },
    el("div", { class: "fj-cabeca" },
      el("div", { class: "fj-topo" },
        el("span", { class: "fb-icone" }, icone(f.icone)),
        el("div", { class: "fj-titulo" }, el("span", { class: "fb-grupo", text: f.grupo }), el("h2", { id: idTitulo, text: f.nome })),
        el("button", { type: "button", class: "item-fechar", "aria-label": "Fechar", title: "Fechar", text: "×", on: { click: fechar } })),
      resultado),
    el("div", { class: "fj-corpo" },
      el("p", { class: "nota", text: f.descricao }),
      f.campos(calcular)),
    el("div", { class: "fj-pe" },
      el("button", { type: "button", class: "item-pronto", text: "Pronto", on: { click: fechar } })));

  // Tocar no fundo escuro fecha; com a roleta aberta, o toque só fecha a roleta (como na janela do item).
  let roletaNoToque = false;
  d.addEventListener("pointerdown", () => { roletaNoToque = roletaAberta(); }, true);
  d.addEventListener("click", (e) => {
    if (e.target !== d || roletaNoToque) return;
    const b = d.getBoundingClientRect();
    if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) fechar();
  });
  // Esc com a roleta aberta fecha só a roleta.
  d.addEventListener("cancel", (e) => { if (roletaAberta()) { e.preventDefault(); fecharRoleta(false); } });
  window.addEventListener("hashchange", fechar);
  d.addEventListener("close", () => {
    window.removeEventListener("hashchange", fechar);
    if (roletaAberta()) fecharRoleta(true);
    d.remove();
    aoFechar();
    if (botao.isConnected) botao.focus({ preventScroll: true });
  });
  calcular();
  document.body.append(d);
  d.showModal();
  // O foco fica no × (no celular não abre teclado nem roleta sozinho).
  d.querySelector(".item-fechar").focus({ preventScroll: true });
}

const campo = (obj, k, rot, casas, ajuda, aoMudar, extra = {}) =>
  el("label", {}, el("span", {}, rot, info(ajuda)), campoNumero(obj, k, { casas, aoMudar, rotulo: rot, ...extra }));
const linha = (rot, valor) => el("div", { class: "metrica" }, el("span", { class: "rot", text: rot }), el("span", { class: "val", text: valor }));
const aviso = (texto, alerta = false) => ({ texto, alerta });
const curto = (v) => numeroBR(v, Number.isInteger(Number(v)) ? 0 : 1);

// ---------- Água da mostura ----------
function contasAgua() {
  const litros = agua.graos_kg > 0 && agua.relacao > 0 ? agua.graos_kg * agua.relacao : null;
  const t = temperaturaAguaMostura({ graoC: agua.grao_c, alvoC: agua.alvo_c, litrosPorKg: agua.relacao });
  if (litros == null || t == null) return { metricas: [], avisos: [aviso("Preencha grãos, água/grão e as temperaturas.")] };
  return { metricas: [
    ["Água da mostura", `${numeroBR(litros, 1)} L`],
    ["Temperatura da água", `${numeroBR(t, 1)} °C`],
    ["Volume na tina", `${numeroBR(litros + agua.graos_kg * VOLUME_GRAO_L_KG, 1)} L`]], avisos: [] };
}

function camposAgua(calcular) {
  return [
    el("div", { class: "grade-form" },
      campo(agua, "graos_kg", "Grãos (kg)", 2, null, calcular, { roleta: F.graos_kg }),
      campo(agua, "relacao", "Água/grão (L/kg)", 1, O.AJUDA_VOLUME.relacao_agua_grao_l_kg, calcular, { roleta: FAIXAS.relacao_agua_grao_l_kg }),
      campo(agua, "grao_c", "Temperatura do grão (°C)", 1, "Normalmente a temperatura ambiente.", calcular, { roleta: F.temp_ambiente }),
      campo(agua, "alvo_c", "Temperatura da parada (°C)", 1, "A temperatura que a mostura deve atingir (ex.: 66 °C na sacarificação).", calcular, { roleta: F.temp_mostura })),
    el("p", { class: "nota", text: "Não conta o calor que a tina absorve: pré-aqueça a tina ou some 1 a 2 °C. Volume na tina = água + 0,67 L por kg de grão." })];
}

// ---------- Priming ----------
function contasPriming() {
  const p = primingGramas({ litros: prim.litros, co2Alvo: prim.co2, temperaturaMaxC: prim.temp_c, acucar: prim.acucar });
  if (!p) return { metricas: [], avisos: [aviso("Preencha volume, CO₂ desejado e temperatura.")] };
  return { metricas: [
    [O.rotulo(O.ACUCAR_PRIMING, prim.acucar), `${numeroBR(p.gramas, 0)} g`],
    ["Por litro", `${numeroBR(p.g_por_litro, 2)} g/L`],
    ["CO₂ que a cerveja já tem", `${numeroBR(p.co2_residual, 2)} vol`]],
  avisos: p.gramas === 0 ? [aviso("A cerveja já tem esse CO₂: não precisa de priming.", true)] : [] };
}

function camposPriming(calcular) {
  return [
    el("div", { class: "grade-form" },
      campo(prim, "litros", "Cerveja a envasar (L)", 1, null, calcular, { roleta: F.litros }),
      campo(prim, "co2", "CO₂ desejado (vol)", 1, O.AJUDA_VOLUME.co2_alvo_vol, calcular, { roleta: { ...FAIXAS.co2_alvo_vol, vazio: undefined } }),
      campo(prim, "temp_c", "Maior temperatura da fermentação (°C)", 1, O.AJUDA_VOLUME.temperatura_max_ferm, calcular, { roleta: F.temp_fermentacao }),
      el("label", { class: "largo" }, el("span", { text: "Açúcar" }), campoSelect(prim, "acucar", O.ACUCAR_PRIMING, { aoMudar: calcular, rotulo: "Açúcar" }))),
    el("details", {}, el("summary", { text: "CO₂ típico por estilo" }),
      el("table", { class: "tabela" }, el("tbody", {}, O.CO2_TIPICO.map(([e, v]) => el("tr", {}, el("td", { text: e }), el("td", { class: "num", text: v }))))))];
}

// ---------- Refratômetro ----------
function contasRefratometro() {
  if (!(refr.fator > 0) || !(refr.og > 1)) return { metricas: [], avisos: [aviso("Preencha a densidade do mosto e o fator.")] };
  // O mosto entra em densidade (SG); a equação de Terrill usa o °Brix que o refratômetro leria nele.
  const brixIni = platoDeSg(refr.og) * refr.fator;
  if (refr.brix_fim == null) return { metricas: [["OG (densidade do mosto)", numeroBR(refr.og, 3)], ["°Brix esperado no refratômetro", numeroBR(brixIni, 1)]],
    avisos: [aviso("Com a cerveja já fermentando, preencha também o °Brix atual: o álcool muda a leitura.")] };
  const r = refratometro({ brixInicial: brixIni, brixFinal: refr.brix_fim, fator: refr.fator });
  return { metricas: [
    ["OG", numeroBR(r.og, 3)],
    ["FG (densidade atual)", numeroBR(r.fg, 3)],
    r.abv_pct != null ? ["ABV", `${numeroBR(r.abv_pct, 1)}%`] : null,
    r.atenuacao_pct != null ? ["Atenuação aparente", `${numeroBR(r.atenuacao_pct, 0)}%`] : null].filter(Boolean),
  avisos: r.fg > r.og ? [aviso("O °Brix atual parece alto demais para essa densidade do mosto.", true)] : [] };
}

function camposRefratometro(calcular) {
  const saidaFator = el("div", { class: "resultado-ferramenta", "aria-live": "polite" });
  const calcularFator = () => {
    if (!(descobrir.sg > 1) || !(descobrir.brix > 0)) { preencher(saidaFator, el("p", { class: "nota", text: "Meça o mesmo mosto (antes de fermentar) com os dois aparelhos." })); return; }
    const f = descobrir.brix / platoDeSg(descobrir.sg);
    preencher(saidaFator, linha("Fator do seu refratômetro", numeroBR(f, 3)),
      el("button", { type: "button", class: "secundario pequeno", text: "Usar este fator", on: { click: () => { refr.fator = Number(f.toFixed(3)); campoFator.value = numeroBR(refr.fator, 3); calcular(); } } }));
  };
  const campoFator = campoNumero(refr, "fator", { casas: 3, aoMudar: calcular, rotulo: "Fator do refratômetro", roleta: F.fator_refratometro });
  calcularFator();
  return [
    el("div", { class: "grade-form" },
      campo(refr, "og", "Densidade do mosto (antes de fermentar)", 3, null, calcular, { placeholder: "1,050", ...sg, roleta: F.sg }),
      campo(refr, "brix_fim", "°Brix atual (fermentando)", 1, "Deixe em branco se a cerveja ainda não fermentou.", calcular, { roleta: { ...F.brix, inicial: () => (Number(refr.og) > 1 ? Number((platoDeSg(refr.og) * refr.fator / 2).toFixed(1)) : 6), vazio: "Ainda não fermentou" } }),
      el("label", {}, el("span", {}, "Fator do refratômetro", info("O mosto lê um pouco acima de açúcar puro. 1,04 é o valor comum; o seu fica salvo neste navegador.")), campoFator)),
    el("details", {}, el("summary", { text: "Descobrir o fator do meu refratômetro" }),
      el("div", { class: "grade-form" },
        campo(descobrir, "sg", "Densímetro (mosto)", 3, null, calcularFator, { placeholder: "1,050", ...sg, roleta: F.sg }),
        campo(descobrir, "brix", "Refratômetro (°Brix)", 1, null, calcularFator, { roleta: F.brix })),
      saidaFator)];
}

// ---------- Densímetro ----------
function contasDensimetro() {
  const c = corrigirDensimetro({ sg: dens.sg, tempC: dens.temp_c, calibracaoC: dens.calibracao_c });
  if (c == null || !(dens.sg > 0.98)) return { metricas: [], avisos: [aviso("Preencha a leitura e as temperaturas.")] };
  return { metricas: [["Densidade corrigida", numeroBR(c, 3)], ["Diferença", `${c >= dens.sg ? "+" : ""}${numeroBR((c - dens.sg) * 1000, 1)} pontos`]], avisos: [] };
}

function camposDensimetro(calcular) {
  return [
    el("div", { class: "grade-form" },
      campo(dens, "sg", "Leitura", 3, null, calcular, { placeholder: "1,050", ...sg, roleta: F.sg }),
      campo(dens, "temp_c", "Temperatura da amostra (°C)", 1, null, calcular, { roleta: F.temp_amostra }),
      campo(dens, "calibracao_c", "Calibração do densímetro (°C)", 1, "Vem escrita no densímetro: normalmente 20 °C (ou 15,6 °C = 60 °F). Fica salva neste navegador.", calcular, { roleta: { ...F.temp_amostra, passo: 0.1, partes: true } })),
    el("p", { class: "nota", text: "Acima de uns 40 °C a correção perde precisão: melhor esfriar a amostra." })];
}
