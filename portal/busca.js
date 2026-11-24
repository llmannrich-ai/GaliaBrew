// busca.js — janela de busca de ingrediente (no lugar do <select> com centenas de itens).
// Filtra enquanto digita (nome, produtor, origem, tipo; sem diferença de acento ou maiúscula), "Recentes" e "Meus"
// no topo. SEM filtros em botões (23/11/2026, pedido do responsável: no celular ocupavam a tela toda).
// Teclado: ↑/↓ escolhe, Enter adiciona, Esc fecha.
// Estilos (23/11/2026): mesma janela, busca por código (21A), nome, categoria e termos em português (trigo, defumada,
// azeda, belga...); "Mais perto da receita" pelos números do editor.
import { el, preencher, numeroBR } from "./ui.js?v=20261124q";
import { corHexDeSrm, corHexDeMalte, encaixeEstilo } from "./calculos.js?v=20261124q";
import * as O from "./opcoes.js?v=20261124q";
import { fonteDados, seloFonte } from "./fontes.js?v=20261124q";

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

// ---------- o que cada tipo mostra ----------
const r = (lista, v) => (v ? O.rotulo(lista, v) : null);
const faixa = (a, b, casas, suf = "") => (a != null && b != null ? `${numeroBR(a, casas)}–${numeroBR(b, casas)}${suf}` : a != null ? `${numeroBR(a, casas)}${suf}` : b != null ? `${numeroBR(b, casas)}${suf}` : null);
// ---------- estilos ----------
// Termos em português para achar estilo pelo jeito que se fala aqui (o catálogo BJCP está em inglês).
// [expressão, termos acrescentados à busca, só no nome?].
// "Ale" e "lupulada" olham só o nome: as categorias "Pale/Amber Bitter European Beer" têm lagers (German Pils).
// Na busca de estilo cada termo casa com o COMEÇO de uma palavra ("ale" não acha "Pale Lager").
const TERMOS_ESTILO = [
  [/lager|pils|bock|helles|marzen|festbier|schwarz|dunkel|keller|vienna|rauch|leicht|czech|baltic|cream ale|kolsch|california common/, "lager baixa fermentacao"],
  [/\bale\b|ipa|stout|porter|bitter|saison|altbier|kolsch|weiss|weizen|wit|barleywine|wee heavy|dubbel|tripel|quad|mild|biere de garde/, "ale alta fermentacao", true],
  [/wheat|weizen|weiss|wit|gose|berliner|lambic|gueuze/, "trigo"],
  [/sour|wild|lambic|gueuze|gose|berliner|flanders|oud bruin|brett|catharina/, "azeda acida selvagem sour"],
  [/smoked|rauch|grodzisk|piwo/, "defumada fumaca"],
  [/fruit|grape|catharina|cherry|kriek|framboise/, "fruta frutas"],
  [/spice|herb|winter|pumpkin|autumn/, "especiarias temperada"],
  [/stout|porter|schwarz|dunkel|dark|black|brown|bruin/, "escura preta"],
  [/pale|helles|pils|blonde|light|kolsch|cream|wit/, "clara"],
  [/strong|imperial|double|bock|barleywine|wee heavy|tripel|quad|eisbock|wheatwine|old ale/, "forte alcoolica"],
  [/ipa|hop|pale ale|bitter/, "lupulada amarga", true],
  [/belgian|monastic|saison|tripel|dubbel|biere|wit|flanders|lambic|gueuze/, "belga"],
  [/british|english|scottish|irish|wee heavy|mild|old ale/, "britanica inglesa"],
  [/german|kolsch|\balt|marzen|festbier|munich|weizen|weiss|helles|bock|rauch|dortmund|gose|berliner|keller|schwarz/, "alema"],
  [/american|california|cream ale|kentucky|steam/, "americana"],
  [/czech|bohemian/, "tcheca"],
  [/brazil|catharina/, "brasileira"], [/argentin/, "argentina"], [/italian/, "italiana"], [/new zealand/, "neozelandesa"],
  [/specialty|mixed|experimental|alternative|historical/, "especial"],
  // Nomes como se fala aqui.
  [/pils/, "pilsen pilsener pilsner"], [/vienna/, "viena"], [/munich/, "munique"], [/marzen|festbier/, "oktoberfest"],
  [/brown|bruin/, "marrom"], [/\bred\b/, "vermelha"], [/amber/, "ambar"], [/golden|blond|dorada|helles/, "dourada loira"],
  [/light|leicht/, "leve"], [/oatmeal/, "aveia"], [/sweet stout/, "doce milk stout leite lactose"], [/hazy/, "neipa turva new england"],
  [/double ipa/, "dipa imperial"], [/wheatwine/, "trigo"], [/catharina/, "catarina"], [/weissbier/, "hefeweizen"], [/bock/, "bock"],
];
const indiceTermos = new WeakMap();
function termosEstilo(x) {
  let t = indiceTermos.get(x);
  if (t === undefined) {
    const nome = semAcento(x.nome);
    const base = `${nome} ${semAcento(x.categoria)}`;
    t = TERMOS_ESTILO.filter(([re, , soNome]) => re.test(soNome ? nome : base)).map(([, termos]) => termos).join(" ");
    indiceTermos.set(x, t);
  }
  return t;
}
const media = (a, b) => (a != null && b != null ? (Number(a) + Number(b)) / 2 : a ?? b);
const corTela = (srm) => (srm == null ? null : O.corParaTela(Number(srm)));
/** "1A" < "1B" < "2A" < "10A"; códigos fora do padrão (X1, de usuário) depois. */
export function ordemCodigo(a, b) {
  const p = (c) => { const m = /^(\d+)([A-Z]*)$/i.exec(String(c ?? "").trim()); return m ? [0, Number(m[1]), m[2].toUpperCase()] : [1, 0, String(c ?? "")]; };
  const [x, y] = [p(a.codigo), p(b.codigo)];
  return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]) || String(a.nome).localeCompare(String(b.nome));
}
/** Ordena do mais parecido com a receita ao menos parecido. */
export function maisPertoDaReceita(itens, res) {
  return itens.map((x) => [encaixeEstilo(x, res), x]).filter(([e]) => e.total >= 3)
    .sort(([a], [b]) => (b.dentro / b.total) - (a.dentro / a.total) || a.distancia - b.distancia).map(([, x]) => x);
}
const receitaTemNumeros = (res) => res?.og > 1.001;

export const TIPOS_BUSCA = {
  fermentaveis: {
    titulo: "Adicionar fermentável",
    nome: (x) => x.nome,
    texto: (x) => [x.nome, x.produtor, x.origem, r(O.TIPO_FERMENTAVEL, x.tipo), r(O.GRUPO_FERMENTAVEL, x.grupo)],
    resumo: (x) => [r(O.TIPO_FERMENTAVEL, x.tipo), r(O.GRUPO_FERMENTAVEL, x.grupo),
      x.cor_srm != null ? `${numeroBR(O.corParaTela(Number(x.cor_srm)), 0)} ${O.unidadeCor()}` : null,
      x.rendimento_pct != null ? `rend. ${numeroBR(x.rendimento_pct, 0)}%` : null, x.produtor],
    cor: (x) => x.cor_srm,
    corDe: corHexDeMalte,   // amostra = cor do grão (o estilo usa a da cerveja)
  },
  lupulos: {
    titulo: "Adicionar lúpulo",
    nome: (x) => x.nome,
    texto: (x) => [x.nome, x.produtor, x.origem, r(O.FORMA_LUPULO, x.forma), r(O.USO_LUPULO, x.uso)],
    resumo: (x) => [x.alfa_pct != null ? `alfa ${numeroBR(x.alfa_pct, 1)}%` : null, r(O.FORMA_LUPULO, x.forma), r(O.USO_LUPULO, x.uso), x.origem],
  },
  leveduras: {
    titulo: "Adicionar levedura",
    nome: (x) => [x.produtor, x.nome].filter(Boolean).join(" "),
    texto: (x) => [x.nome, x.produtor, x.codigo_produto, r(O.TIPO_LEVEDURA, x.tipo), r(O.FORMA_LEVEDURA, x.forma)],
    resumo: (x) => [r(O.TIPO_LEVEDURA, x.tipo), r(O.FORMA_LEVEDURA, x.forma),
      faixa(x.atenuacao_min_pct, x.atenuacao_max_pct, 0, "%") ? `atenuação ${faixa(x.atenuacao_min_pct, x.atenuacao_max_pct, 0, "%")}` : null,
      faixa(x.temp_min_c, x.temp_max_c, 0, " °C"), x.codigo_produto],
  },
  outros: {
    titulo: "Adicionar outro ingrediente",
    nome: (x) => x.nome,
    texto: (x) => [x.nome, x.uso_para, r(O.TIPO_OUTRO, x.tipo)],
    resumo: (x) => [r(O.TIPO_OUTRO, x.tipo), x.uso_para],
  },
  estilos: {
    titulo: "Escolher estilo",
    placeholder: "Código ou nome (21A, pils, trigo)",
    acao: "escolhe",
    prefixo: true,
    livre: "Sem estilo",
    ordenar: (itens) => [...itens].sort(ordemCodigo),
    nome: (x) => `${x.codigo ? x.codigo + " " : ""}${x.nome}`,
    texto: (x) => [x.codigo, x.nome, x.categoria, x.guia, termosEstilo(x), r(O.TIPO_ESTILO, x.tipo)],
    resumo: (x, res) => {
      const e = receitaTemNumeros(res) ? encaixeEstilo(x, res) : null;
      return [x.categoria,
        faixa(x.og_min, x.og_max, 3) ? `OG ${faixa(x.og_min, x.og_max, 3)}` : null,
        faixa(x.ibu_min, x.ibu_max, 0) ? `IBU ${faixa(x.ibu_min, x.ibu_max, 0)}` : null,
        faixa(corTela(x.cor_srm_min), corTela(x.cor_srm_max), 0) ? `${O.unidadeCor()} ${faixa(corTela(x.cor_srm_min), corTela(x.cor_srm_max), 0)}` : null,
        faixa(x.abv_min_pct, x.abv_max_pct, 1, "%") ? `ABV ${faixa(x.abv_min_pct, x.abv_max_pct, 1, "%")}` : null,
        e?.total ? `receita em ${e.dentro} de ${e.total} faixas` : null];
    },
    cor: (x) => media(x.cor_srm_min, x.cor_srm_max),
  },
};

const indice = new WeakMap();        // item → texto normalizado (calculado uma vez)

/** Ordena e filtra: todos os termos precisam aparecer; nome que começa com o 1º termo vem antes. */
export function buscarItens(itens, tipo, consulta) {
  const def = TIPOS_BUSCA[tipo];
  const termos = semAcento(consulta).split(/\s+/).filter(Boolean);
  const saida = [];
  for (const x of itens) {
    if (!termos.length) { saida.push([0, x]); continue; }
    let txt = indice.get(x);
    if (txt === undefined) {
      txt = semAcento(def.texto(x).filter(Boolean).join(" "));
      if (def.prefixo) txt = ` ${txt.replace(/[^a-z0-9]+/g, " ")} `;
      indice.set(x, txt);
    }
    if (!termos.every((t) => txt.includes(def.prefixo ? ` ${t}` : t))) continue;
    const nome = semAcento(def.nome(x));
    const t0 = termos[0];
    const nota = x.codigo && semAcento(x.codigo) === t0 ? -1 : nome.startsWith(t0) ? 0 :
      def.prefixo && txt.includes(` ${t0} `) ? 1 : nome.split(/[\s\-/(]+/).some((p) => p.startsWith(t0)) ? 1 : nome.includes(t0) ? 2 : 3;
    saida.push([nota, x]);
  }
  if (termos.length) saida.sort((a, b) => a[0] - b[0]);
  return saida.map(([, x]) => x);
}

/**
 * Abre a janela. aoEscolher(item) com o item do cadastro; aoLivre() para "Item livre" (estilo: "Sem estilo").
 * Chamados DEPOIS de fechar a janela (o foco pode ir para o campo novo).
 * contexto: resultado de calcularReceita (estilos: "Mais perto da receita"); atualId: item já escolhido (vai no topo).
 */
export function abrirBusca({ tipo, itens: recebidos, aoEscolher, aoLivre, contexto = null, atualId = null, texto = "", titulo = null }) {
  const def = TIPOS_BUSCA[tipo];
  const itens = def.ordenar ? def.ordenar(recebidos) : recebidos;
  let consulta = texto;
  let mostrados = [];
  let ativo = -1;
  const idLista = `busca-lista-${Date.now()}`;

  const campo = el("input", {
    type: "search", class: "busca-campo", value: texto, placeholder: def.placeholder ?? "Nome, produtor, origem…", "aria-label": "Buscar",
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

  const janela = el("dialog", { class: "busca", "aria-label": titulo ?? def.titulo },
    el("div", { class: "busca-topo" },
      el("h3", { text: titulo ?? def.titulo }),
      el("button", { type: "button", class: "icone fechar", "aria-label": "Fechar", text: "×", on: { click: () => janela.close() } })),
    campo, info, lista,
    el("div", { class: "busca-rodape" },
      el("span", { class: "nota", text: def.acao ? `↑ ↓ navega · Enter ${def.acao} · Esc fecha` : "↑ ↓ escolhe · Enter adiciona · Esc fecha" }),
      aoLivre ? el("button", { type: "button", class: "secundario pequeno", text: def.livre ?? "Item livre (digitar os dados)", on: { click: () => fecharE(aoLivre) } }) : null));
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
    const resumo = def.resumo(x, contexto).filter(Boolean).join(" · ");
    let amostra = null;
    if (def.cor) {
      amostra = el("span", { class: "amostra", "aria-hidden": "true" });
      amostra.style.background = (def.corDe ?? corHexDeSrm)(def.cor(x));
    }
    return el("li", {
      role: "option", id: `${idLista}-${i}`, class: "busca-opcao", "aria-selected": "false",
      on: { click: () => escolher(x), mousemove: () => { if (ativo !== i) marcar(i); } },
    },
    amostra,
    el("div", { class: "busca-opcao-texto" },
      el("span", { class: "busca-opcao-nome" }, def.nome(x),
        tipo === "estilos" && x.dono ? el("span", { class: "selo meu", text: "meu" }) : null,
        x.id === atualId ? el("span", { class: "selo", text: "atual" }) : null),
      // Ingrediente: selo da fonte dos dados; estilo não tem (é do guia).
      el("span", { class: "busca-opcao-resumo" }, tipo === "estilos" ? null : seloFonte(fonteDados(x)), resumo ? ` ${resumo}` : null)));
  }

  function desenhar() {
    const grupos = [];
    if (!consulta.trim()) {
      // Sem busca: recentes e meus primeiro, depois o catálogo.
      // Estilos: o atual e os mais parecidos com a receita antes.
      const porId = new Map(itens.map((x) => [x.id, x]));
      const atual = atualId && porId.get(atualId) ? [porId.get(atualId)] : [];
      const perto = tipo === "estilos" && receitaTemNumeros(contexto)
        ? maisPertoDaReceita(itens, contexto).filter((x) => !atual.includes(x)).slice(0, 5) : [];
      const usados = [...atual, ...perto];
      const recentes = (lerRecentes()[tipo] ?? []).map((id) => porId.get(id)).filter((x) => x && !usados.includes(x));
      const meus = itens.filter((x) => x.dono && !recentes.includes(x) && !usados.includes(x));
      const resto = itens.filter((x) => !x.dono && !recentes.includes(x) && !usados.includes(x));
      if (atual.length) grupos.push(["Atual", atual]);
      if (perto.length) grupos.push(["Mais perto da receita", perto]);
      if (recentes.length) grupos.push(["Recentes", recentes]);
      if (meus.length) grupos.push(["Meus", meus]);
      grupos.push([grupos.length ? "Catálogo" : null, resto]);
    } else {
      grupos.push([null, buscarItens(itens, tipo, consulta)]);
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
