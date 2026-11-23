// vital.js — barra vital do editor de receita: OG, FG, ABV, IBU e cor sempre à vista, com a régua da faixa do
// estilo e a diferença da última mudança; pH estimado da mostura com a faixa boa (5,2–5,6). Computador: fixa abaixo
// do topo. Celular: fixa no rodapé, em 2 linhas de 3 números (OG FG ABV / IBU Cor pH).
import { el, svg, numeroBR } from "./ui.js?v=20261123q";
import { platoDeSg, corHexDeSrm, reguaDoEstilo } from "./calculos.js?v=20261123q";
import * as O from "./opcoes.js?v=20261123q";

const DIFERENCA_MS = 3000;      // quanto tempo a diferença fica na tela depois da última mudança
const ESTADOS = {
  DENTRO: { classe: "dentro", icone: "✓", texto: "no estilo" },
  PERTO_MIN: { classe: "perto", icone: "!", texto: "perto do mínimo" },
  PERTO_MAX: { classe: "perto", icone: "!", texto: "perto do máximo" },
  ABAIXO: { classe: "fora", icone: "▼", texto: "abaixo do estilo" },
  ACIMA: { classe: "fora", icone: "▲", texto: "acima do estilo" },
};

const arred = (v, casas) => (Number.isFinite(v) ? Number(v.toFixed(casas)) : null);

/** Indicadores da barra. valor/faixa já na unidade da tela (cor em EBC ou SRM, conforme o perfil). */
function indicadores() {
  const corTela = (srm) => (srm === null || srm === undefined ? null : O.corParaTela(Number(srm)));
  return [
    { chave: "og", rot: "OG", casas: 3, valor: (r) => r.og, faixa: (e) => [e.og_min, e.og_max], extra: (r) => `${numeroBR(platoDeSg(r.og), 1)} °P` },
    { chave: "fg", rot: "FG", casas: 3, valor: (r) => r.fg, faixa: (e) => [e.fg_min, e.fg_max] },
    { chave: "abv", rot: "ABV", casas: 1, sufixo: "%", valor: (r) => r.abv_pct, faixa: (e) => [e.abv_min_pct, e.abv_max_pct] },
    { chave: "ibu", rot: "IBU", casas: 0, valor: (r) => r.ibu, faixa: (e) => [e.ibu_min, e.ibu_max] },
    { chave: "cor", rot: `Cor ${O.unidadeCor()}`, casas: 1, valor: (r) => corTela(r.cor_srm), faixa: (e) => [corTela(e.cor_srm_min), corTela(e.cor_srm_max)] },
    // pH: faixa fixa (não depende do estilo). Boa 5,2–5,6; "perto" = 1/4 da largura → ideal 5,3–5,5.
    { chave: "ph", rot: "pH mostura", casas: 2, valor: (r) => r.ph_mostura?.ph ?? null, faixaFixa: [5.2, 5.6], perto: 0.25, nomeFaixa: "boa",
      estados: { DENTRO: "ideal", PERTO_MIN: "um pouco baixo", PERTO_MAX: "um pouco alto", ABAIXO: "baixo", ACIMA: "alto" } },
  ];
}

/** Copo com a cor da cerveja (SVG desenhado aqui; a cor muda a cada cálculo). */
export function copo() {
  const cerveja = svg("path", { class: "copo-cerveja", d: "M8.6 13 H31.4 L29.2 50.2 Q29.1 52 27.3 52 H12.7 Q10.9 52 10.8 50.2 Z" });
  const n = svg("svg", { class: "copo", viewBox: "0 0 40 56", "aria-hidden": "true", focusable: "false" },
    cerveja,
    svg("path", { class: "copo-espuma", d: "M8.2 13.4 H31.8 L32.4 7.6 Q30 4.6 26.4 6.4 Q23 3.6 19.4 6 Q15.6 3.8 12.4 6.2 Q8.8 5 7.6 7.8 Z" }),
    svg("path", { class: "copo-brilho", d: "M13.4 17 L14.6 46" }),
    svg("path", { class: "copo-vidro", d: "M6.5 4 H33.5 L30.6 51 Q30.4 54 27.4 54 H12.6 Q9.6 54 9.4 51 Z" }));
  n.cerveja = cerveja;
  return n;
}

/** Campo que abre o teclado do celular (texto/número), fora de janelas (a busca é tela cheia). */
function campoDeDigitar(n) {
  return n instanceof HTMLElement && !n.closest("dialog")
    && (n.tagName === "TEXTAREA" || (n.tagName === "INPUT" && !/^(checkbox|radio|button|submit|range|color|file)$/.test(n.type)));
}

/**
 * Celular: com o teclado aberto, a barra encolhe para UMA linha fina logo acima dele (a pessoa digita a quantidade e
 * vê a OG mudar sem perder o campo de vista).
 * Teclado aberto = a visual viewport encolheu (innerHeight − altura > 120) OU há um campo de digitar em foco num
 * aparelho de toque. No iPhone o próprio iOS rola a visual viewport para cima do teclado (offsetTop cresce): por isso
 * a detecção NÃO desconta o offsetTop (antes descontava, dava 0 e a barra ficava grande, cobrindo o campo).
 * Posição: --teclado = distância do fundo da área visível ao fundo da layout viewport (onde o "bottom: 0" fica).
 */
function acompanharTeclado(barra) {
  const vv = window.visualViewport;
  const toque = window.matchMedia("(pointer: coarse)");
  let quadro = 0;
  let manter = false;
  const ajustar = () => {
    if (!barra.isConnected && barra.dataset.montada) {            // saiu do editor
      vv?.removeEventListener("resize", aoRedimensionar);
      vv?.removeEventListener("scroll", aoRolar);
      document.removeEventListener("focusin", aoRedimensionar);
      document.removeEventListener("focusout", aoSair);
      document.documentElement.classList.remove("teclado-aberto");
      return;
    }
    const altura = vv ? vv.height : window.innerHeight;
    const topo = vv ? vv.offsetTop : 0;
    const digitando = toque.matches && campoDeDigitar(document.activeElement);
    const aberto = window.innerHeight - altura > 120 || digitando;
    barra.style.setProperty("--teclado", `${Math.max(0, Math.round(window.innerHeight - altura - topo))}px`);
    barra.classList.toggle("com-teclado", aberto);
    if (aberto && barra.classList.contains("aberta")) {         // "detalhes" aberto + teclado = sem espaço: fecha
      barra.classList.remove("aberta");
      barra.querySelector(".vital-mais")?.setAttribute("aria-expanded", "false");
    }
    document.documentElement.classList.toggle("teclado-aberto", aberto);
    // Só ao abrir o teclado / trocar de campo: se a pessoa rolar a tela com o teclado aberto, não puxa de volta.
    if (manter && aberto && campoDeDigitar(document.activeElement)) manterAcimaDaBarra(document.activeElement, barra);
    manter = false;
  };
  const agendar = (comManter) => {
    manter = manter || comManter;
    cancelAnimationFrame(quadro);
    quadro = requestAnimationFrame(ajustar);
  };
  function aoRedimensionar() { agendar(true); }
  function aoRolar() { agendar(false); }
  // Ao trocar de campo (↑/↓ do teclado do iPhone) o focusout vem antes do focusin: espera um pouco para a barra não piscar.
  function aoSair() { setTimeout(() => agendar(false), 120); }
  vv?.addEventListener("resize", aoRedimensionar);
  vv?.addEventListener("scroll", aoRolar);
  document.addEventListener("focusin", aoRedimensionar);
  document.addEventListener("focusout", aoSair);
  requestAnimationFrame(() => { barra.dataset.montada = "1"; ajustar(); });
}

/**
 * Rola a página para o campo ficar entre o topo da área visível (abaixo da barra do app) e a barra de números
 * (celular, com o teclado aberto). Só rola quando precisa; instantâneo (com rolagem suave, um toque durante a animação
 * só para a rolagem e não vira clique).
 */
export function manterAcimaDaBarra(campo, barra) {
  // Só o campo que ainda está em foco (um timer atrasado não pode rolar a tela depois que a pessoa já saiu dele).
  if (!campo?.isConnected || !barra?.isConnected || campo !== document.activeElement || !campoDeDigitar(campo)) return;
  const vv = window.visualViewport;
  const topoVisivel = vv ? vv.offsetTop : 0;
  const fundoVisivel = topoVisivel + (vv ? vv.height : window.innerHeight);
  const r = campo.getBoundingClientRect();
  // A barra do app é "sticky" na layout viewport: com o iOS rolando a visual viewport ela pode estar fora de vista.
  const app = document.querySelector(".barra-app")?.getBoundingClientRect();
  const cabecalho = app && app.bottom > topoVisivel ? app.bottom - topoVisivel : 0;
  const limiteBaixo = Math.min(fundoVisivel, barra.getBoundingClientRect().top) - 16;
  const limiteAlto = topoVisivel + cabecalho + 12;
  let delta = 0;
  if (r.bottom > limiteBaixo) delta = r.bottom - limiteBaixo;
  else if (r.top < limiteAlto) delta = r.top - limiteAlto;
  if (Math.abs(delta) >= 1) window.scrollBy({ top: delta, behavior: "instant" });
}

/**
 * Cria a barra. atualizar(res, estilo, { mudanca, campo }) a cada cálculo; mudanca = true quando veio de uma edição
 * (aí aparece a diferença em relação ao valor de antes da edição); campo = de onde veio (a diferença acumula no mesmo campo).
 */
export function criarBarraVital({ aoAjustar = {}, ferramentas = null } = {}) {
  const defs = indicadores();
  let referencia = null;          // números da tentativa fixada (para comparar), ou null
  const vidro = copo();
  const itens = new Map();
  const leitor = el("p", { class: "so-leitor", role: "status" });
  const aviso = el("p", { class: "vital-aviso", role: "alert" });
  const botaoMais = el("button", {
    type: "button", class: "vital-mais", "aria-expanded": "false", "aria-label": "Mostrar detalhes dos números",
    on: { click: () => {
      const aberta = barra.classList.toggle("aberta");
      botaoMais.setAttribute("aria-expanded", String(aberta));
    } },
  }, el("span", { "aria-hidden": "true" }));

  for (const d of defs) {
    const n = {
      // Linha fina do teclado (1/6 da tela): "Cor EBC" vira "EBC" e "pH mostura" vira "pH".
      rot: d.chave === "ph" ? el("span", { class: "vital-rot" }, "pH", el("span", { class: "rot-longo", text: " mostura" }))
        : d.chave === "cor" ? el("span", { class: "vital-rot" }, el("span", { class: "rot-longo", text: "Cor " }), O.unidadeCor())
        : el("span", { class: "vital-rot", text: d.rot }),
      estado: el("span", { class: "vital-estado" }),
      // OG e IBU: o número é um botão que abre "chegar a um valor alvo".
      val: aoAjustar[d.chave]
        ? el("button", { type: "button", class: "vital-val ajustavel", title: `Clique para chegar a ${d.chave === "og" ? "uma OG" : "um IBU"} alvo`, on: { click: aoAjustar[d.chave] } })
        : el("span", { class: "vital-val" }),
      ref: el("div", { class: "vital-ref" }),
      extra: el("span", { class: "vital-extra" }),
      delta: el("span", { class: "vital-delta", "aria-hidden": "true" }),
      faixa: el("span", { class: "regua-faixa" }),
      marca: el("span", { class: "regua-marca" }),
      faixaTxt: el("span", { class: "vital-faixa" }),
      ultimo: undefined, base: null, timer: null,
    };
    n.regua = el("div", { class: "regua", "aria-hidden": "true" }, n.faixa, n.marca);
    n.raiz = el("div", { class: "vital-item", dataset: { metrica: d.chave } },
      el("div", { class: "vital-cab" }, n.rot, n.estado),
      el("div", { class: "vital-linha" }, n.val, n.delta),
      n.regua,
      el("div", { class: "vital-pe" }, n.faixaTxt, n.extra),
      n.ref);
    itens.set(d.chave, n);
  }
  const buGu = el("span", { class: "vital-val" });
  const atenuacao = el("span", { class: "vital-val" });

  const barra = el("section", { class: "vital", "aria-label": "Números da cerveja" },
    el("div", { class: "vital-copo" }, vidro),
    el("div", { class: "vital-grade" },
      [...itens.values()].map((n) => n.raiz),
      el("div", { class: "vital-item secundario" },
        el("div", { class: "vital-cab" }, el("span", { class: "vital-rot", text: "BU:GU" })),
        el("div", { class: "vital-linha" }, buGu),
        el("div", { class: "vital-cab" }, el("span", { class: "vital-rot", text: "Atenuação" })),
        el("div", { class: "vital-linha" }, atenuacao))),
    botaoMais,
    aviso,
    ferramentas,
    leitor);

  // Altura da barra para o CSS (no celular ela cobre o rodapé e o conteúdo precisa de espaço embaixo).
  if (window.ResizeObserver) {
    new ResizeObserver(() => document.documentElement.style.setProperty("--vital-h", `${barra.offsetHeight}px`)).observe(barra);
  }
  acompanharTeclado(barra);

  let timerLeitor = null;
  let campoAnterior = null;       // a diferença acumula só enquanto a pessoa mexe no MESMO campo
  function atualizar(res, estilo, { mudanca = false, campo = document.activeElement } = {}) {
    vidro.cerveja.setAttribute("fill", corHexDeSrm(res.cor_srm));
    const outroCampo = mudanca && campo !== campoAnterior;
    if (mudanca) campoAnterior = campo;
    const falas = [];
    for (const d of defs) {
      const n = itens.get(d.chave);
      const v = arred(d.valor(res), d.casas);
      const fmt = (x) => numeroBR(x, d.casas);
      n.val.textContent = v === null ? "—" : `${fmt(v)}${d.sufixo ?? ""}`;
      n.extra.textContent = d.extra ? d.extra(res) : "";

      // Régua do estilo
      const [min, max] = d.faixaFixa ?? (estilo ? d.faixa(estilo) : [null, null]);
      const regua = v === null ? null : reguaDoEstilo(v, min, max, d.perto ? { perto: d.perto } : undefined);
      const est = regua ? { ...ESTADOS[regua.estado], ...(d.estados ? { texto: d.estados[regua.estado] } : {}) } : null;
      n.raiz.className = `vital-item ${est ? `estado-${est.classe}` : "sem-estilo"}`;
      n.estado.textContent = est ? `${est.icone} ${est.texto}` : "";
      n.estado.title = n.estado.textContent;
      n.faixaTxt.textContent = regua ? `${d.nomeFaixa ?? "estilo"} ${fmt(Math.min(min, max))}–${fmt(Math.max(min, max))}${d.sufixo ?? ""}` : "";
      if (regua) {
        n.faixa.style.left = `${regua.ini * 100}%`;
        n.faixa.style.width = `${(regua.fim - regua.ini) * 100}%`;
        n.marca.style.left = `${regua.pos * 100}%`;
        n.marca.classList.toggle("alem", regua.foraDoEixo);
        if (d.chave === "cor") {
          // Fundo da régua da cor = a própria escala de cor da cerveja ao longo do eixo.
          const [a, b] = regua.eixo;
          const paradas = Array.from({ length: 9 }, (_, i) => `${corHexDeSrm(O.corDaTela(a + ((b - a) * i) / 8))} ${i * 12.5}%`);
          n.regua.style.background = `linear-gradient(to right, ${paradas.join(", ")})`;
        }
      }
      falas.push(`${d.rot} ${v === null ? "sem estimativa" : n.val.textContent}${est ? `, ${est.texto}` : ""}`);

      // Comparação com a referência fixada (fica enquanto a referência existir).
      const rv = referencia ? arred(d.valor(referencia), d.casas) : null;
      if (referencia && (v === null || rv === null)) n.ref.textContent = "";
      else if (referencia) {
        const dif = arred(v - rv, d.casas);
        n.ref.textContent = `ref. ${fmt(rv)}${d.sufixo ?? ""} · ${dif === 0 ? "igual" : `${dif > 0 ? "+" : "−"}${fmt(Math.abs(dif))}`}`;
        n.ref.classList.toggle("diferente", dif !== 0);
      } else n.ref.textContent = "";

      // Diferença: acumula enquanto a pessoa mexe no mesmo campo; some DIFERENCA_MS depois da última mudança.
      if (outroCampo) esconderDiferenca(n);
      if (mudanca && v !== null && n.ultimo !== undefined && n.ultimo !== null && v !== n.ultimo) {
        if (n.base === null) n.base = n.ultimo;
        const dif = arred(v - n.base, d.casas);
        if (dif === 0) esconderDiferenca(n);
        else {
          n.delta.textContent = `${dif > 0 ? "+" : "−"}${fmt(Math.abs(dif))}`;
          n.delta.className = `vital-delta visivel ${dif > 0 ? "sobe" : "desce"}`;
          clearTimeout(n.timer);
          n.timer = setTimeout(() => esconderDiferenca(n), DIFERENCA_MS);
        }
      }
      n.ultimo = v;
    }
    buGu.textContent = numeroBR(res.bu_gu, 2);
    atenuacao.textContent = `${numeroBR(res.atenuacao_pct, 0)}%`;
    aviso.textContent = res.avisos.includes("SEM_LEVEDURA") ? "Sem levedura: a FG fica igual à OG." : "";

    // Leitor de tela: um resumo só depois que a pessoa para de digitar.
    clearTimeout(timerLeitor);
    timerLeitor = setTimeout(() => { leitor.textContent = `${falas.join(". ")}.`; }, mudanca ? 1200 : 0);
  }

  function esconderDiferenca(n) {
    clearTimeout(n.timer);
    n.base = null;
    n.delta.classList.remove("visivel");
  }

  /** Fixa (res) ou solta (null) a referência; a próxima chamada de atualizar() mostra a comparação. */
  function definirReferencia(res) {
    referencia = res;
    barra.classList.toggle("com-referencia", Boolean(res));
  }

  return { elemento: barra, atualizar, definirReferencia };
}
