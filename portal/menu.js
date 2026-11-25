// menu.js — menu lateral do portal: recolhível no computador, gaveta no celular.
// Ícones do icones.js; marca = copo do vital.js; arte do pé (lúpulo e cevada) desenhada aqui, em traço fino.
import { el, svg } from "./ui.js?v=20261125d";
import { sessao, preferencias, salvarPreferencias } from "./estado.js?v=20261125d";
import { icone } from "./icones.js?v=20261125d";
import { copo } from "./vital.js?v=20261125d";

const LARGURA_CELULAR = "(max-width: 959px)";
const LARGURA_EDITOR_ESTREITO = 1180;
// Tela média: o menu fica só com ícones, sem a pessoa escolher (o editor precisa da largura).
const LARGURA_COMPACTA = "(min-width: 960px) and (max-width: 1180px)";

const LINKS = [
  ["#/receitas", "Receitas", "receitas", "receitas"],
  ["#/cadastros/fermentaveis", "Cadastros", "cadastros", "malte"],
  ["#/ferramentas", "Ferramentas", "ferramentas", "ferramentas"],
  ["#/perfil", "Perfil", "perfil", "perfil"],
];

/** Copinho da marca (o mesmo desenho do copo da barra vital, na cor âmbar). */
function marcaCopo() {
  const c = copo();
  c.cerveja.setAttribute("fill", "#d08a2a");
  return c;
}

/** Arte do pé do menu: cone de lúpulo com folha e espiga de cevada. Decorativa. */
function arte() {
  const p = (d) => svg("path", { d });
  const bracteas = [];
  // Cone: fileiras de brácteas (escamas em U), mais estreitas embaixo.
  [[30, 26], [40, 30], [50, 31], [60, 29], [70, 25], [80, 19], [89, 12]].forEach(([y, meia], i) => {
    const n = i % 2 ? 3 : 2;
    const passo = (meia * 2) / n;
    for (let k = 0; k < n; k++) bracteas.push(p(`M${(70 - meia + k * passo).toFixed(1)} ${y}q${(passo / 2).toFixed(1)} 15 ${passo.toFixed(1)} 0`));
  });
  const graos = [42, 52, 62, 72, 82].map((y, i) => {
    const x = 122 - i * 1.3;
    return [
      p(`M${x} ${y + 9}c-5.5-1-8.5-5-8.5-10 5.5 1 8.5 5 8.5 10z`),
      p(`M${x} ${y + 9}c5.5-1 8.5-5 8.5-10-5.5 1-8.5 5-8.5 10z`),
      p(`M${x - 8.5} ${y - 1}l-7-16`),
      p(`M${x + 8.5} ${y - 1}l7-16`),
    ];
  });
  return svg("svg", { viewBox: "0 0 160 120", class: "arte", "aria-hidden": "true", focusable: "false" },
    p("M70 30c0-8 4-14 12-18"),                              // haste
    p("M82 12c8-6 20-5 26 2-8 6-19 6-26-2z"), p("M84 12.5c7 0 14 .6 21 1.6"),   // folha
    p("M44 30c0 30 14 60 26 75 12-15 26-45 26-75-9-5-43-5-52 0z"),             // contorno do cone
    bracteas,
    p("M112 118c4-22 8-48 10-82"), graos, p("M122 42c0-8 0-16 1-24"));      // cevada
}

const casca = () => document.querySelector(".casca");

export function abrirMenu() {
  const c = casca();
  if (!c) return;
  c.classList.add("menu-aberto");
  document.body.classList.add("travado");
  c.querySelector(".abrir-menu")?.setAttribute("aria-expanded", "true");
  c.querySelector(".lateral nav a.ativo, .lateral nav a")?.focus({ preventScroll: true });
}

export function fecharMenu() {
  document.body.classList.remove("travado");
  const c = casca();
  if (!c || !c.classList.contains("menu-aberto")) return;
  c.classList.remove("menu-aberto");
  c.querySelector(".abrir-menu")?.setAttribute("aria-expanded", "false");
}

function rotuloRecolher(b, recolhido) {
  const t = recolhido ? "Expandir menu" : "Recolher menu";
  b.setAttribute("aria-expanded", String(!recolhido));
  b.setAttribute("aria-label", t);
  b.title = t;
}

function alternarRecolhido(e) {
  preferencias.menu_recolhido = !preferencias.menu_recolhido;
  salvarPreferencias();
  casca()?.classList.toggle("recolhido", preferencias.menu_recolhido);
  rotuloRecolher(e.currentTarget, preferencias.menu_recolhido);
}

/** Marca o item da rota atual. */
export function marcarMenu() {
  const rota = location.hash.split("/")[1] || "receitas";
  for (const a of document.querySelectorAll(".lateral nav a")) {
    const r = a.dataset.rota;
    const ativo = r === rota || (r === "receitas" && rota === "receita");
    a.classList.toggle("ativo", ativo);
    if (ativo) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

/** Estrutura da página logada: menu lateral + barra do celular + área de conteúdo (#conteudo). */
export function montarCasca({ sair }) {
  const nome = sessao.perfil?.nome || sessao.usuario?.email || "";
  const recolhido = Boolean(preferencias.menu_recolhido);

  const recolher = el("button", { type: "button", class: "recolher", "aria-controls": "menu-lateral", on: { click: alternarRecolhido } },
    icone("recolher"), el("span", { class: "rotulo", text: "Recolher" }));
  rotuloRecolher(recolher, recolhido);

  const lateral = el("aside", { class: "lateral", id: "menu-lateral" },
    el("div", { class: "lateral-topo" },
      el("a", { href: "#/receitas", class: "marca", title: "GaliaBrew" }, marcaCopo(), el("span", { class: "rotulo", text: "GaliaBrew" })),
      el("button", { type: "button", class: "fechar-menu", "aria-label": "Fechar menu", title: "Fechar menu", on: { click: fecharMenu } }, icone("fechar"))),
    el("nav", { "aria-label": "Menu principal" },
      LINKS.map(([h, t, r, ic]) => el("a", { href: h, title: t, dataset: { rota: r } }, icone(ic), el("span", { class: "rotulo", text: t })))),
    arte(),
    el("div", { class: "quem" },
      el("span", { class: "avatar", "aria-hidden": "true", title: nome, text: (nome.trim()[0] || "?").toUpperCase() }),
      el("span", { class: "rotulo nome" }, el("span", { text: nome }), sessao.admin ? el("span", { class: "selo", text: "admin" }) : null),
      el("button", { type: "button", class: "sair", title: "Sair", on: { click: sair } }, icone("sair"), el("span", { class: "so-leitor", text: "Sair" }))),
    recolher);

  // No celular, escolher um item fecha a gaveta.
  lateral.addEventListener("click", (e) => {
    if (window.matchMedia(LARGURA_CELULAR).matches && e.target.closest("nav a, .marca")) fecharMenu();
  });

  const barra = el("header", { class: "barra-movel" },
    el("button", { type: "button", class: "abrir-menu", "aria-label": "Abrir menu", "aria-controls": "menu-lateral", "aria-expanded": "false", on: { click: abrirMenu } }, icone("menu")),
    el("a", { href: "#/receitas", class: "marca" }, marcaCopo(), "GaliaBrew"));

  const raiz = el("div", { class: `casca${recolhido ? " recolhido" : ""}${window.matchMedia(LARGURA_COMPACTA).matches ? " compacto" : ""}` },
    lateral,
    el("div", { class: "veu", "aria-hidden": "true", on: { click: fecharMenu } }),
    el("div", { class: "principal" }, barra, el("main", { id: "conteudo", class: "conteudo" })));
  // O editor passa a uma coluna pela largura que sobra ao lado do menu (até 1180 px), não pela largura da tela.
  const principal = raiz.querySelector(".principal");
  const medir = () => raiz.classList.toggle("estreito", principal.getBoundingClientRect().width <= LARGURA_EDITOR_ESTREITO);
  if (window.ResizeObserver) new ResizeObserver(medir).observe(principal);
  else raiz.classList.add("estreito");
  return { raiz, barra };
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && casca()?.classList.contains("menu-aberto")) {
    fecharMenu();
    casca().querySelector(".abrir-menu")?.focus();
  }
});
// Voltou para a largura de computador com a gaveta aberta: fecha (e destrava a rolagem).
window.matchMedia(LARGURA_CELULAR).addEventListener("change", (e) => { if (!e.matches) fecharMenu(); });
window.matchMedia(LARGURA_COMPACTA).addEventListener("change", (e) => casca()?.classList.toggle("compacto", e.matches));
