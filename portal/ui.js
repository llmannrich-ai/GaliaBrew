// ui.js — utilidades de tela. Texto do usuário entra SEMPRE como texto (textContent), nunca como HTML.

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

/** Campo numérico com vírgula: guarda o número em obj[chave] (com conversão opcional para a tela). */
export function campoNumero(obj, chave, { casas = 2, aoMudar, de = (x) => x, para = (x) => x, desabilitado = false, classe = "num", rotulo } = {}) {
  const valorTela = obj[chave] === null || obj[chave] === undefined ? "" : numeroBR(de(Number(obj[chave])), casas);
  const input = el("input", {
    type: "text", inputmode: "decimal", class: classe, value: valorTela, disabled: desabilitado,
    "aria-label": rotulo,
    on: {
      input: () => {
        const v = lerNumero(input.value);
        input.classList.toggle("invalido", input.value.trim() !== "" && v === null);
        obj[chave] = v === null ? null : para(v);
        aoMudar?.();
      },
      blur: () => {
        const v = lerNumero(input.value);
        if (v !== null) input.value = numeroBR(v, casas);
      },
    },
  });
  return input;
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
