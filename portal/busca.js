// busca.js — janela de busca de ingrediente (no lugar do <select> com centenas de itens).
// Filtra enquanto digita (nome, produtor, origem, tipo; sem diferença de acento ou maiúscula), filtros rápidos por
// tipo de ingrediente, "Recentes" e "Meus" no topo. Teclado: ↑/↓ escolhe, Enter adiciona, Esc fecha.
import { el, preencher, numeroBR } from "./ui.js?v=20261122j";
import { corHexDeSrm } from "./calculos.js?v=20261122j";
import * as O from "./opcoes.js?v=20261122j";

const LIMITE = 60;                       // resultados desenhados por vez (o resto: refinar a busca)
const MAX_RECENTES = 8;
const CHAVE_RECENTES = "galiabrew.recentes";

export const semAcento = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ---------- recentes (por tipo, no navegador) ----------
function lerRecentes() {
  try { return JSON.parse(localStorage.getItem(CHAVE_RECENTES) || "{}") ?? {}; } catch { return {}; }
}
function guardarRecente(tipo, id) {
  if (!id) return;
  const todos = lerRecentes();
  todos[tipo] = [id, ...(todos[tipo] ?? []).filter((x) => x !== id)].slice(0, MAX_RECENTES);
  localStorage.setItem(CHAVE_RECENTES, JSON.stringify(todos));
}

// ---------- o que cada tipo mostra e filtra ----------
const r = (lista, v) => (v ? O.rotulo(lista, v) : null);
const faixa = (a, b, casas, suf = "") => (a != null && b != null ? `${numeroBR(a, casas)}–${numeroBR(b, casas)}${suf}` : a != null ? `${numeroBR(a, casas)}${suf}` : b != null ? `${numeroBR(b, casas)}${suf}` : null);
const mediaAtenuacao = (y) => {
  const a = y.atenuacao_min_pct != null ? Number(y.atenuacao_min_pct) : null;
  const b = y.atenuacao_max_pct != null ? Number(y.atenuacao_max_pct) : null;
  return a != null && b != null ? (a + b) / 2 : a ?? b;
};
const entre = (v, a, b) => v != null && Number(v) >= a && Number(v) < b;

function faixasDeCor() {
  // Limites em SRM; o rótulo na unidade do perfil.
  const lim = (srm) => numeroBR(O.corParaTela(srm), 0);
  const u = O.unidadeCor();
  return [
    { rot: `Claro (até ${lim(5)} ${u})`, teste: (x) => entre(x.cor_srm, 0, 5) },
    { rot: `Âmbar (${lim(5)}–${lim(20)})`, teste: (x) => entre(x.cor_srm, 5, 20) },
    { rot: `Escuro (${lim(20)}–${lim(100)})`, teste: (x) => entre(x.cor_srm, 20, 100) },
    { rot: `Torrado (${lim(100)}+)`, teste: (x) => entre(x.cor_srm, 100, Infinity) },
  ];
}

export const TIPOS_BUSCA = {
  fermentaveis: {
    titulo: "Adicionar fermentável",
    nome: (x) => x.nome,
    texto: (x) => [x.nome, x.produtor, x.origem, r(O.TIPO_FERMENTAVEL, x.tipo), r(O.GRUPO_FERMENTAVEL, x.grupo)],
    resumo: (x) => [r(O.TIPO_FERMENTAVEL, x.tipo), r(O.GRUPO_FERMENTAVEL, x.grupo),
      x.cor_srm != null ? `${numeroBR(O.corParaTela(Number(x.cor_srm)), 0)} ${O.unidadeCor()}` : null,
      x.rendimento_pct != null ? `rend. ${numeroBR(x.rendimento_pct, 0)}%` : null, x.produtor],
    cor: (x) => x.cor_srm,
    filtros: () => [
      { nome: "Grupo", opcoes: O.GRUPO_FERMENTAVEL.map(([v, t]) => ({ rot: t, teste: (x) => x.grupo === v })) },
      { nome: "Cor", opcoes: faixasDeCor() },
    ],
  },
  lupulos: {
    titulo: "Adicionar lúpulo",
    nome: (x) => x.nome,
    texto: (x) => [x.nome, x.produtor, x.origem, r(O.FORMA_LUPULO, x.forma), r(O.USO_LUPULO, x.uso)],
    resumo: (x) => [x.alfa_pct != null ? `alfa ${numeroBR(x.alfa_pct, 1)}%` : null, r(O.FORMA_LUPULO, x.forma), r(O.USO_LUPULO, x.uso), x.origem],
    filtros: () => [
      { nome: "Uso", opcoes: O.USO_LUPULO.map(([v, t]) => ({ rot: t, teste: (x) => x.uso === v })) },
      { nome: "Alfa", opcoes: [
        { rot: "até 5%", teste: (x) => entre(x.alfa_pct, 0, 5) },
        { rot: "5–10%", teste: (x) => entre(x.alfa_pct, 5, 10) },
        { rot: "10%+", teste: (x) => entre(x.alfa_pct, 10, Infinity) },
      ] },
    ],
  },
  leveduras: {
    titulo: "Adicionar levedura",
    nome: (x) => [x.produtor, x.nome].filter(Boolean).join(" "),
    texto: (x) => [x.nome, x.produtor, x.codigo_produto, r(O.TIPO_LEVEDURA, x.tipo), r(O.FORMA_LEVEDURA, x.forma)],
    resumo: (x) => [r(O.TIPO_LEVEDURA, x.tipo), r(O.FORMA_LEVEDURA, x.forma),
      faixa(x.atenuacao_min_pct, x.atenuacao_max_pct, 0, "%") ? `atenuação ${faixa(x.atenuacao_min_pct, x.atenuacao_max_pct, 0, "%")}` : null,
      faixa(x.temp_min_c, x.temp_max_c, 0, " °C"), x.codigo_produto],
    filtros: (itens) => [
      { nome: "Tipo", opcoes: O.TIPO_LEVEDURA.filter(([v]) => itens.some((x) => x.tipo === v)).map(([v, t]) => ({ rot: t, teste: (x) => x.tipo === v })) },
      { nome: "Atenuação", opcoes: [
        { rot: "até 72%", teste: (x) => entre(mediaAtenuacao(x), 0, 72) },
        { rot: "72–78%", teste: (x) => entre(mediaAtenuacao(x), 72, 78) },
        { rot: "78%+", teste: (x) => entre(mediaAtenuacao(x), 78, Infinity) },
      ] },
    ],
  },
  outros: {
    titulo: "Adicionar outro ingrediente",
    nome: (x) => x.nome,
    texto: (x) => [x.nome, x.uso_para, r(O.TIPO_OUTRO, x.tipo)],
    resumo: (x) => [r(O.TIPO_OUTRO, x.tipo), x.uso_para],
    filtros: (itens) => [
      { nome: "Tipo", opcoes: O.TIPO_OUTRO.filter(([v]) => itens.some((x) => x.tipo === v)).map(([v, t]) => ({ rot: t, teste: (x) => x.tipo === v })) },
    ],
  },
};

const indice = new WeakMap();        // item → texto normalizado (calculado uma vez)

/** Ordena e filtra: todos os termos precisam aparecer; nome que começa com o 1º termo vem antes. */
export function buscarItens(itens, tipo, consulta, testes = []) {
  const def = TIPOS_BUSCA[tipo];
  const termos = semAcento(consulta).split(/\s+/).filter(Boolean);
  const saida = [];
  for (const x of itens) {
    if (!testes.every((t) => t(x))) continue;
    if (!termos.length) { saida.push([0, x]); continue; }
    let txt = indice.get(x);
    if (txt === undefined) { txt = semAcento(def.texto(x).filter(Boolean).join(" ")); indice.set(x, txt); }
    if (!termos.every((t) => txt.includes(t))) continue;
    const nome = semAcento(def.nome(x));
    const t0 = termos[0];
    const nota = nome.startsWith(t0) ? 0 : nome.split(/[\s\-/(]+/).some((p) => p.startsWith(t0)) ? 1 : nome.includes(t0) ? 2 : 3;
    saida.push([nota, x]);
  }
  if (termos.length) saida.sort((a, b) => a[0] - b[0]);
  return saida.map(([, x]) => x);
}

/**
 * Abre a janela. aoEscolher(item) com o item do cadastro; aoLivre() para "Item livre".
 * Chamados DEPOIS de fechar a janela (o foco pode ir para o campo novo).
 */
export function abrirBusca({ tipo, itens, aoEscolher, aoLivre }) {
  const def = TIPOS_BUSCA[tipo];
  const filtros = def.filtros(itens);
  const ativos = new Map();                // grupo → índice da opção ligada
  let consulta = "";
  let mostrados = [];
  let ativo = -1;
  const idLista = `busca-lista-${Date.now()}`;

  const campo = el("input", {
    type: "search", class: "busca-campo", placeholder: "Nome, produtor, origem…", "aria-label": "Buscar",
    role: "combobox", "aria-expanded": "true", "aria-controls": idLista, "aria-autocomplete": "list", autocomplete: "off",
    on: {
      input: (e) => { consulta = e.target.value; desenhar(); },
      keydown: (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          if (!mostrados.length) return;
          marcar(e.key === "ArrowDown" ? Math.min(mostrados.length - 1, ativo + 1) : Math.max(0, ativo - 1));
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (mostrados.length) escolher(mostrados[Math.max(0, ativo)]);
        }
      },
    },
  });
  const lista = el("ul", { class: "busca-lista", id: idLista, role: "listbox", "aria-label": "Resultados" });
  const info = el("p", { class: "busca-info", "aria-live": "polite" });
  const chips = el("div", { class: "busca-filtros" },
    filtros.filter((g) => g.opcoes.length).map((g) => el("div", { class: "busca-grupo-filtro", role: "group", "aria-label": g.nome },
      el("span", { class: "busca-filtro-rot", text: g.nome }),
      g.opcoes.map((o, i) => el("button", {
        type: "button", class: "chip", "aria-pressed": "false", text: o.rot,
        on: { click: (e) => {
          const ligar = ativos.get(g) !== i;
          if (ligar) ativos.set(g, i); else ativos.delete(g);
          for (const b of e.currentTarget.parentNode.querySelectorAll(".chip")) b.setAttribute("aria-pressed", "false");
          e.currentTarget.setAttribute("aria-pressed", String(ligar));
          desenhar();
          campo.focus();
        } },
      })))));

  const janela = el("dialog", { class: "busca", "aria-label": def.titulo },
    el("div", { class: "busca-topo" },
      el("h3", { text: def.titulo }),
      el("button", { type: "button", class: "icone fechar", "aria-label": "Fechar", text: "×", on: { click: () => janela.close() } })),
    campo, chips, info, lista,
    el("div", { class: "busca-rodape" },
      el("span", { class: "nota", text: "↑ ↓ escolhe · Enter adiciona · Esc fecha" }),
      el("button", { type: "button", class: "secundario pequeno", text: "Item livre (digitar os dados)", on: { click: () => fecharE(aoLivre) } })));
  janela.addEventListener("close", () => janela.remove());
  janela.addEventListener("click", (e) => { if (e.target === janela) janela.close(); });   // clique fora

  function fecharE(fn, ...args) {
    janela.close();
    fn?.(...args);
  }
  function escolher(item) {
    guardarRecente(tipo, item.id);
    fecharE(aoEscolher, item);
  }
  function marcar(i) {
    const opcoes = lista.querySelectorAll('[role="option"]');
    opcoes[ativo]?.setAttribute("aria-selected", "false");
    ativo = i;
    const o = opcoes[i];
    if (!o) { campo.removeAttribute("aria-activedescendant"); return; }
    o.setAttribute("aria-selected", "true");
    campo.setAttribute("aria-activedescendant", o.id);
    o.scrollIntoView({ block: "nearest" });
  }

  function opcao(x, i) {
    const resumo = def.resumo(x).filter(Boolean).join(" · ");
    let amostra = null;
    if (def.cor) {
      amostra = el("span", { class: "amostra", "aria-hidden": "true" });
      amostra.style.background = corHexDeSrm(def.cor(x));
    }
    return el("li", {
      role: "option", id: `${idLista}-${i}`, class: "busca-opcao", "aria-selected": "false",
      on: { click: () => escolher(x), mousemove: () => { if (ativo !== i) marcar(i); } },
    },
    amostra,
    el("div", { class: "busca-opcao-texto" },
      el("span", { class: "busca-opcao-nome" }, def.nome(x), x.dono ? el("span", { class: "selo meu", text: "meu" }) : null),
      resumo ? el("span", { class: "busca-opcao-resumo", text: resumo }) : null));
  }

  function desenhar() {
    const testes = [...ativos].map(([g, i]) => g.opcoes[i].teste);
    const filtrado = consulta.trim() || testes.length;
    const grupos = [];
    if (!filtrado) {
      // Sem busca: recentes e meus primeiro, depois o catálogo.
      const porId = new Map(itens.map((x) => [x.id, x]));
      const recentes = (lerRecentes()[tipo] ?? []).map((id) => porId.get(id)).filter(Boolean);
      const meus = itens.filter((x) => x.dono && !recentes.includes(x));
      const resto = itens.filter((x) => !x.dono && !recentes.includes(x));
      if (recentes.length) grupos.push(["Recentes", recentes]);
      if (meus.length) grupos.push(["Meus", meus]);
      grupos.push([recentes.length || meus.length ? "Catálogo" : null, resto]);
    } else {
      grupos.push([null, buscarItens(itens, tipo, consulta, testes)]);
    }
    const total = grupos.reduce((s, [, l]) => s + l.length, 0);
    mostrados = [];
    const nos = [];
    for (const [titulo, l] of grupos) {
      const parte = l.slice(0, Math.max(0, LIMITE - mostrados.length));
      if (!parte.length) continue;
      if (titulo) nos.push(el("li", { class: "busca-grupo", role: "presentation", text: titulo }));
      for (const x of parte) { nos.push(opcao(x, mostrados.length)); mostrados.push(x); }
    }
    preencher(lista, nos.length ? nos : el("li", { class: "busca-vazia", role: "presentation", text: itens.length ? "Nada encontrado. Use “Item livre” para digitar os dados." : "Cadastro vazio. Use “Item livre”." }));
    info.textContent = total > mostrados.length
      ? `${numeroBR(total, 0, { milhar: true })} itens · mostrando ${mostrados.length}; digite para refinar`
      : `${numeroBR(total, 0, { milhar: true })} ${total === 1 ? "item" : "itens"}`;
    ativo = -1;
    if (mostrados.length) marcar(0);
  }

  document.body.append(janela);
  desenhar();
  janela.showModal();
  campo.focus();
}
