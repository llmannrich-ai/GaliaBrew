// ui.js — utilidades de tela. Texto do usuário entra SEMPRE como texto (textContent), nunca como HTML.
import { abrirRoleta } from "./roleta.js?v=20261124g";
import { FAIXAS } from "./faixas.js?v=20261124g";

/** Cria um elemento. attrs: class, text, on: {evento: fn}, dataset, e demais atributos. Filhos: nós ou textos. */
export function el(tag, attrs = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
    else if (k === "dataset") Object.assign(n.dataset, v);
    else if (k === "value") n.value = v;
    else if (k === "checked" || k === "disabled" || k === "selected" || k === "required" || k === "readOnly") n[k] = Boolean(v);
    else n.setAttribute(k, v === true ? "" : String(v));
  }
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    n.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return n;
}

const SVG_NS = "http://www.w3.org/2000/svg";
/** Igual ao el(), para SVG (createElementNS). Atributos de apresentação (fill, stroke) são permitidos pela CSP. */
export function svg(tag, attrs = {}, ...filhos) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.setAttribute("class", v);
    else if (k === "text") n.textContent = v;
    else n.setAttribute(k, v === true ? "" : String(v));
  }
  for (const f of filhos.flat(Infinity)) if (f instanceof Node) n.append(f);
  return n;
}

export const $ = (sel, raiz = document) => raiz.querySelector(sel);

export function limpar(n) {
  while (n.firstChild) n.removeChild(n.firstChild);
  return n;
}

/** Limpa e preenche, ignorando null/undefined/false (o append nativo escreveria "null"). */
export function preencher(n, ...filhos) {
  limpar(n);
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    n.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return n;
}

/**
 * Ícone ⓘ que abre/fecha uma explicação logo abaixo (toque no celular, clique no computador; title no passar do mouse).
 * Fica dentro do rótulo do campo; o clique não passa para o campo.
 */
export function info(texto) {
  if (!texto) return null;
  const balao = el("span", { class: "info-balao", text: texto, hidden: true });
  const botao = el("button", {
    type: "button", class: "info", text: "i", title: texto, "aria-label": "O que é este campo", "aria-expanded": "false",
    on: {
      click: (e) => {
        e.preventDefault();
        e.stopPropagation();
        const abrir = balao.hidden;
        fecharInfos();
        balao.hidden = !abrir;
        botao.setAttribute("aria-expanded", String(abrir));
      },
    },
  });
  return el("span", { class: "info-wrap" }, botao, balao);
}

function fecharInfos() {
  for (const b of document.querySelectorAll(".info-balao:not([hidden])")) {
    b.hidden = true;
    b.previousElementSibling?.setAttribute("aria-expanded", "false");
  }
}
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => { if (!e.target.closest?.(".info-wrap")) fecharInfos(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharInfos(); });
}

// ---------- números no padrão brasileiro ----------
/** Lê "1,05" ou "1.05" → 1.05; vazio → null. Rejeita lixo (NaN → null). */
export function lerNumero(texto) {
  if (texto === null || texto === undefined) return null;
  const s = String(texto).trim().replace(/\s/g, "");
  if (s === "") return null;
  const normal = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const v = Number(normal);
  return Number.isFinite(v) ? v : null;
}

/** Formata com vírgula e `casas` decimais (sem separador de milhar nos campos). */
export function numeroBR(v, casas = 2, { milhar = false } = {}) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas, useGrouping: milhar });
}

/**
 * Campo numérico com vírgula: guarda o número em obj[chave] (com conversão opcional para a tela).
 * Celular (tela de toque): tocar no campo abre a ROLETA (roleta.js) em vez do teclado, com a faixa do campo
 * (faixas.js: pela chave, ou `roleta` = faixa própria / { inicial } para trocar só o valor de partida; false = sem roleta).
 * Valor de partida com o campo vazio: roleta.inicial > número do placeholder (a sugestão) > inicial da faixa.
 */
export function campoNumero(obj, chave, { casas = 2, aoMudar, de = (x) => x, para = (x) => x, desabilitado = false, classe = "num", rotulo, placeholder, roleta, unidade = "" } = {}) {
  const valorTela = obj[chave] === null || obj[chave] === undefined ? "" : numeroBR(de(Number(obj[chave])), casas);
  const input = el("input", {
    type: "text", inputmode: "decimal", class: classe, value: valorTela, disabled: desabilitado,
    "aria-label": rotulo, placeholder,
    on: {
      input: () => {
        const v = lerNumero(input.value);
        input.classList.toggle("invalido", input.value.trim() !== "" && v === null);
        obj[chave] = v === null ? null : para(v);
        aoMudar?.();
      },
      blur: () => {
        // Mostra o valor guardado (já convertido: ex. densidade digitada 1048 → 1,048).
        if (lerNumero(input.value) !== null && obj[chave] !== null && obj[chave] !== undefined) input.value = numeroBR(de(Number(obj[chave])), casas);
      },
    },
  });
  const faixa = roleta === false ? null : roleta?.min !== undefined ? roleta : FAIXAS[chave] ? { ...FAIXAS[chave], ...(roleta ?? {}) } : null;
  if (faixa && !desabilitado && telaDeToque()) ligarRoleta(input, { obj, chave, faixa, casas, de, para, aoMudar, unidade, inicialProprio: roleta?.inicial });
  return input;
}

const telaDeToque = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches);

/** Campo vira "botão" da roleta: somente leitura (o teclado não abre); "Digitar o número" libera o teclado até sair. */
function ligarRoleta(input, { obj, chave, faixa, casas, de, para, aoMudar, unidade, inicialProprio }) {
  input.readOnly = true;
  input.dataset.roleta = "1";
  input.setAttribute("aria-haspopup", "dialog");
  const lerAtual = () => (obj[chave] === null || obj[chave] === undefined || obj[chave] === "" ? null : de(Number(obj[chave])));
  const definir = (v) => {
    obj[chave] = v === null ? null : para(v);
    input.value = v === null ? "" : numeroBR(v, casas);
    input.classList.remove("invalido");
    aoMudar?.();
  };
  const doPlaceholder = () => { const m = /^-?\d[\d.,]*/.exec(input.placeholder ?? ""); return m ? lerNumero(m[0]) : null; };
  const digitar = () => {
    input.readOnly = false;
    input.focus();
    input.setSelectionRange?.(0, input.value.length);
  };
  input.abrirRoleta = () => abrirRoleta({
    campo: input, casas, unidade, rotulo: input.getAttribute("aria-label") ?? "", valor: lerAtual(),
    faixa: { ...faixa, inicial: () => {
      const ini = typeof inicialProprio === "function" ? inicialProprio() : inicialProprio;
      if (Number.isFinite(ini)) return ini;
      const ph = doPlaceholder();
      if (Number.isFinite(ph)) return ph;
      return typeof faixa.inicial === "function" ? faixa.inicial() : faixa.inicial;
    } },
    aoEscolher: definir, aoDigitar: digitar,
  });
  input.addEventListener("mousedown", (e) => { if (input.readOnly) e.preventDefault(); });      // sem foco = sem teclado
  input.addEventListener("click", (e) => { if (!input.readOnly || input.disabled) return; e.preventDefault(); input.abrirRoleta(); });
  input.addEventListener("keydown", (e) => { if (input.readOnly && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); input.abrirRoleta(); } });
  input.addEventListener("blur", () => { input.readOnly = true; });
}

/** Leva a pessoa a editar o campo: no celular abre a roleta; no computador põe o foco (o teclado já está à mão). */
export function editarCampo(input) {
  if (!input) return;
  if (input.abrirRoleta && input.readOnly) input.abrirRoleta();
  else input.focus();
}

/**
 * Quantidade com ajuste rápido: botões − e +, setas ↑/↓ no teclado (1 passo) e Shift+seta (10 passos).
 * passo na unidade guardada (ex.: 0,05 kg). Os botões não roubam o foco (no celular não abrem o teclado).
 * aoMudar(input) recebe o campo, para a barra vital saber de onde veio a mudança.
 */
export function campoQuantidade(obj, chave, { casas = 2, passo = 1, passoTxt = String(passo), unidade = "", aoMudar, desabilitado = false, rotulo, roleta } = {}) {
  const input = campoNumero(obj, chave, { casas, desabilitado, rotulo, aoMudar: () => aoMudar?.(input), classe: "num qtd", unidade, roleta });
  input.setAttribute("role", "spinbutton");
  // Toque: ao entrar no campo, o número fica selecionado; digitar já troca o valor (sem apagar "0,000" na mão).
  // No iOS a seleção feita no próprio "focus" se perde: vai no quadro seguinte.
  let recemFocado = false;
  let valorNoFoco = "";
  // Só se nada foi digitado desde o toque (senão a seleção atrasada engoliria o que a pessoa já escreveu).
  const selecionarTudo = () => { if (document.activeElement === input && input.value === valorNoFoco) input.setSelectionRange(0, input.value.length); };
  input.addEventListener("focus", () => {
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;
    recemFocado = true;
    valorNoFoco = input.value;
    setTimeout(selecionarTudo, 0);
    setTimeout(() => { recemFocado = false; }, 600);
  });
  // O "mouseup" do mesmo toque (vem depois do focus no iOS) desfaria a seleção e poria o cursor no ponto tocado.
  input.addEventListener("mouseup", (e) => { if (recemFocado) { e.preventDefault(); recemFocado = false; selecionarTudo(); } });
  const ajustar = (vezes) => {
    const atual = Number.isFinite(obj[chave]) ? obj[chave] : 0;
    const novo = Math.max(0, Number((atual + vezes * passo).toFixed(casas)));
    obj[chave] = novo;
    input.value = numeroBR(novo, casas);
    input.classList.remove("invalido");
    input.setAttribute("aria-valuenow", String(novo));
    aoMudar?.(input);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    ajustar((e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1));
  });
  // Toque/clique = 1 passo (no soltar: arrastar o dedo para rolar a tela não conta). Segurar = repete, cada vez
  // mais rápido. Teclado e leitor de tela chegam pelo "click" sem ponteiro.
  const botao = (sinal, vezes) => {
    let espera = null;
    let repete = null;
    let repetiu = false;
    let fimPonteiro = 0;          // o "click" que vem logo depois de um toque/clique já foi contado
    const parar = () => { clearTimeout(espera); clearInterval(repete); espera = null; repete = null; fimPonteiro = Date.now(); };
    return el("button", {
      type: "button", class: "passo", tabindex: -1, disabled: desabilitado, text: sinal,
      title: `${vezes > 0 ? "Mais" : "Menos"} ${passoTxt} (segure para repetir; seta ${vezes > 0 ? "↑" : "↓"}, Shift = ×10)`,
      "aria-label": `${vezes > 0 ? "Mais" : "Menos"} ${passoTxt}`,
      on: {
        mousedown: (e) => e.preventDefault(),          // não tira o foco do campo
        contextmenu: (e) => e.preventDefault(),        // toque longo não abre menu
        pointerdown: (e) => {
          if (e.button !== 0) return;
          parar();
          repetiu = false;
          espera = setTimeout(() => {
            repetiu = true;
            ajustar(vezes);
            let n = 0;
            repete = setInterval(() => ajustar(vezes * (++n > 15 ? 4 : 1)), 90);
          }, 400);
        },
        pointerup: () => { const toque = espera !== null && !repetiu; parar(); if (toque) ajustar(vezes); },
        pointerleave: () => { if (espera !== null || repete !== null) parar(); },
        pointercancel: parar,
        click: () => { if (Date.now() - fimPonteiro < 700) return; ajustar(vezes); },
      },
    });
  };
  return el("div", { class: "campo-qtd" }, botao("−", -1), input, el("span", { class: "unidade", text: unidade, "aria-hidden": "true" }), botao("+", 1));
}

export function campoTexto(obj, chave, { aoMudar, desabilitado = false, classe = "", placeholder, rotulo, max = 200 } = {}) {
  return el("input", {
    type: "text", class: classe, value: obj[chave] ?? "", disabled: desabilitado, placeholder, maxlength: max,
    "aria-label": rotulo,
    on: { input: (e) => { obj[chave] = e.target.value; aoMudar?.(); } },
  });
}

export function campoSelect(obj, chave, opcoes, { aoMudar, desabilitado = false, vazio, rotulo, classe = "" } = {}) {
  const s = el("select", {
    disabled: desabilitado, "aria-label": rotulo, class: classe,
    on: { change: (e) => { obj[chave] = e.target.value === "" ? null : e.target.value; aoMudar?.(); } },
  },
  vazio !== undefined ? el("option", { value: "", text: vazio }) : null,
  opcoes.map(([v, t]) => el("option", { value: v, text: t, selected: String(obj[chave] ?? "") === String(v) })));
  return s;
}

// ---------- avisos ----------
export function avisar(msg, tipo = "ok") {
  const caixa = $("#avisos");
  const n = el("div", { class: `aviso ${tipo}`, role: tipo === "erro" ? "alert" : "status", text: msg });
  caixa.append(n);
  setTimeout(() => n.remove(), tipo === "erro" ? 8000 : 3500);
}

/** Traduz erros comuns do Supabase/Postgres. */
export function mensagemErro(e) {
  const m = String(e?.message ?? e ?? "Erro desconhecido");
  if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(m)) return "E-mail ainda não confirmado. Veja a mensagem enviada para você.";
  if (/Password should be at least/i.test(m)) return "Senha curta demais.";
  if (/rate limit|too many/i.test(m)) return "Muitas tentativas. Espere alguns minutos.";
  if (/JWT expired|invalid JWT|session/i.test(m)) return "Sua sessão expirou. Entre de novo.";
  if (/row-level security|permission denied/i.test(m)) return "Sem permissão para esta ação.";
  if (/violates check constraint/i.test(m)) return "Algum valor está fora do permitido (ex.: quantidade zero ou negativa).";
  if (/violates not-null constraint/i.test(m)) return "Falta preencher um campo obrigatório.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão com o servidor.";
  return m;
}

/** Caixa de confirmação (dialog nativo). */
export function confirmar(texto, { ok = "Confirmar", perigo = false } = {}) {
  return new Promise((resolver) => {
    const d = el("dialog", { class: "confirmar" },
      el("p", { text: texto }),
      el("div", { class: "acoes" },
        el("button", { type: "button", class: "secundario", text: "Cancelar", on: { click: () => { d.close(); resolver(false); } } }),
        el("button", { type: "button", class: perigo ? "perigo" : "", text: ok, on: { click: () => { d.close(); resolver(true); } } })));
    d.addEventListener("close", () => d.remove());
    document.body.append(d);
    d.showModal();
  });
}

export const dataBR = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");
