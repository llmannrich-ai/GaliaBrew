// app.js — entrada do portal: login, menu, rotas (#/...) e perfil.
import { el, $, limpar, preencher, avisar, mensagemErro, campoTexto, campoNumero } from "./ui.js?v=20261122i";
import { sb, sessao, preferencias, salvarPreferencias, linkRecebido } from "./estado.js?v=20261122i";
import { telaReceitas, telaEditor, haAlteracoes } from "./receitas.js?v=20261122i";
import { telaCadastros, CADASTROS } from "./cadastros.js?v=20261122i";
import { telaFerramentas } from "./ferramentas.js?v=20261122i";
import { copo } from "./vital.js?v=20261122i";

/** Copinho da marca (o mesmo desenho do copo da barra vital, na cor âmbar). */
function marcaCopo() {
  const c = copo();
  c.cerveja.setAttribute("fill", "#d08a2a");
  return c;
}

// ---------- estrutura ----------
const raiz = () => $("#app");

function cabecalho() {
  const links = [
    ["#/receitas", "Receitas"],
    ["#/cadastros/fermentaveis", "Cadastros"],
    ["#/ferramentas", "Ferramentas"],
    ["#/perfil", "Perfil"],
  ];
  return el("header", { class: "topo" },
    el("a", { href: "#/receitas", class: "marca" }, marcaCopo(), "GaliaBrew"),
    el("nav", {}, links.map(([h, t]) => el("a", { href: h, text: t, dataset: { rota: h.split("/")[1] } }))),
    el("div", { class: "quem" },
      el("span", { text: sessao.perfil?.nome || sessao.usuario?.email || "" }),
      sessao.admin ? el("span", { class: "selo", text: "admin" }) : null,
      el("button", { type: "button", class: "secundario pequeno", text: "Sair", on: { click: sair } })));
}

function marcarMenu() {
  const rota = location.hash.split("/")[1] || "receitas";
  for (const a of document.querySelectorAll("header nav a")) {
    const r = a.dataset.rota;
    a.classList.toggle("ativo", r === rota || (r === "receitas" && rota === "receita"));
  }
}

// ---------- login ----------
function telaEntrar(mensagem) {
  const dados = { email: "", senha: "" };
  const msg = el("p", { class: "erro-form", role: "alert", text: mensagem || "" });
  const botao = el("button", { type: "submit", text: "Entrar" });
  const form = el("form", {
    class: "cartao login",
    on: {
      submit: async (e) => {
        e.preventDefault();
        botao.disabled = true;
        msg.textContent = "";
        const { error } = await sb.auth.signInWithPassword({ email: dados.email.trim(), password: dados.senha });
        botao.disabled = false;
        if (error) msg.textContent = mensagemErro(error);
      },
    },
  },
  el("h1", { text: "GaliaBrew" }),
  el("p", { class: "sub", text: "Receitas de cerveja" }),
  el("label", {}, "E-mail", el("input", { type: "email", autocomplete: "username", required: true, on: { input: (e) => { dados.email = e.target.value; } } })),
  el("label", {}, "Senha", el("input", { type: "password", autocomplete: "current-password", required: true, on: { input: (e) => { dados.senha = e.target.value; } } })),
  msg,
  botao,
  el("button", {
    type: "button", class: "link", text: "Esqueci a senha",
    on: {
      click: async () => {
        if (!dados.email.trim()) { msg.textContent = "Digite o e-mail acima."; return; }
        const { error } = await sb.auth.resetPasswordForEmail(dados.email.trim(), { redirectTo: location.origin + location.pathname });
        msg.textContent = error ? mensagemErro(error) : "Se o e-mail tiver cadastro, chegará um link para criar a nova senha.";
      },
    },
  }),
  el("p", { class: "nota", text: "Acesso só por convite. Peça ao administrador." }));
  preencher(raiz(), el("main", { class: "centro" }, form));
}

/** Tela para definir a senha (convite ou recuperação). */
function telaDefinirSenha(tipo) {
  const dados = { senha: "", repetir: "" };
  const msg = el("p", { class: "erro-form", role: "alert" });
  const form = el("form", {
    class: "cartao login",
    on: {
      submit: async (e) => {
        e.preventDefault();
        if (dados.senha.length < 10) { msg.textContent = "Use pelo menos 10 caracteres."; return; }
        if (dados.senha !== dados.repetir) { msg.textContent = "As duas senhas não conferem."; return; }
        const { error } = await sb.auth.updateUser({ password: dados.senha });
        if (error) { msg.textContent = mensagemErro(error); return; }
        avisar("Senha definida.");
        linkRecebido.tipo = null;
        montarApp();
        if (location.hash !== "#/receitas") location.hash = "#/receitas";
        else rotear();
      },
    },
  },
  el("h1", { text: tipo === "invite" ? "Bem-vindo ao GaliaBrew" : "Nova senha" }),
  el("p", { class: "sub", text: "Defina a sua senha (mínimo 10 caracteres)." }),
  el("label", {}, "Senha", el("input", { type: "password", autocomplete: "new-password", required: true, on: { input: (e) => { dados.senha = e.target.value; } } })),
  el("label", {}, "Repita a senha", el("input", { type: "password", autocomplete: "new-password", required: true, on: { input: (e) => { dados.repetir = e.target.value; } } })),
  msg,
  el("button", { type: "submit", text: "Salvar senha" }));
  preencher(raiz(), el("main", { class: "centro" }, form));
}

async function sair() {
  if (haAlteracoes() && !window.confirm("Há alterações não salvas. Sair mesmo assim?")) return;
  await sb.auth.signOut();
}

// ---------- perfil ----------
function telaPerfil(conteudo) {
  const p = { nome: sessao.perfil?.nome ?? "" };
  const senha = { nova: "", repetir: "" };
  const msgSenha = el("p", { class: "erro-form", role: "alert" });
  preencher(conteudo, 
    el("h2", { text: "Meu perfil" }),
    el("section", { class: "cartao" },
      el("label", {}, "E-mail", el("input", { type: "email", value: sessao.usuario.email, disabled: true })),
      el("label", {}, "Nome", campoTexto(p, "nome", { max: 80 })),
      el("button", {
        type: "button", text: "Salvar nome",
        on: {
          click: async () => {
            const { error } = await sb.from("perfis").update({ nome: p.nome.trim() }).eq("user_id", sessao.usuario.id);
            if (error) return avisar(mensagemErro(error), "erro");
            sessao.perfil.nome = p.nome.trim();
            avisar("Nome salvo.");
            montarApp();
          },
        },
      })),
    el("section", { class: "cartao" },
      el("h3", { text: "Unidades" }),
      el("label", {}, "Cor",
        el("select", { on: { change: (e) => { preferencias.cor = e.target.value; salvarPreferencias(); avisar("Preferência salva."); } } },
          ["EBC", "SRM"].map((u) => el("option", { value: u, text: u, selected: preferencias.cor === u }))))),
    el("section", { class: "cartao" },
      el("h3", { text: "Ajuste rápido no editor" }),
      el("p", { class: "nota", text: "Quanto os botões − e + (e as setas ↑ ↓) mudam a quantidade. Shift + seta = 10 vezes." }),
      el("div", { class: "grade-form" },
        [["passo_fermentavel_g", "Fermentáveis (g)"], ["passo_lupulo_g", "Lúpulos (g)"]].map(([k, rot]) => el("label", {}, rot,
          campoNumero(preferencias, k, { casas: 0, rotulo: rot, aoMudar: () => { if (preferencias[k] > 0) salvarPreferencias(); } }))))),
    el("section", { class: "cartao" },
      el("h3", { text: "Trocar senha" }),
      el("label", {}, "Nova senha", el("input", { type: "password", autocomplete: "new-password", on: { input: (e) => { senha.nova = e.target.value; } } })),
      el("label", {}, "Repita", el("input", { type: "password", autocomplete: "new-password", on: { input: (e) => { senha.repetir = e.target.value; } } })),
      msgSenha,
      el("button", {
        type: "button", text: "Trocar senha",
        on: {
          click: async () => {
            msgSenha.textContent = "";
            if (senha.nova.length < 10) { msgSenha.textContent = "Use pelo menos 10 caracteres."; return; }
            if (senha.nova !== senha.repetir) { msgSenha.textContent = "As duas senhas não conferem."; return; }
            const { error } = await sb.auth.updateUser({ password: senha.nova });
            if (error) { msgSenha.textContent = mensagemErro(error); return; }
            avisar("Senha trocada.");
          },
        },
      })));
}

// ---------- rotas ----------
let rotaAtual = null;

async function rotear() {
  if (!sessao.usuario) return;
  const [, rota = "receitas", param, origem] = location.hash.split("/");
  const conteudo = $("#conteudo");
  if (!conteudo) return;
  marcarMenu();
  rotaAtual = location.hash;
  conteudo.className = "conteudo";      // o editor acrescenta "com-vital"; as outras telas não
  document.body.classList.remove("no-editor");
  try {
    if (rota === "receitas") await telaReceitas(conteudo);
    else if (rota === "receita") await telaEditor(conteudo, param, origem);
    else if (rota === "cadastros") await telaCadastros(conteudo, CADASTROS[param] ? param : "fermentaveis");
    else if (rota === "perfil") telaPerfil(conteudo);
    else if (rota === "ferramentas") telaFerramentas(conteudo);
    else { location.hash = "#/receitas"; return; }
  } catch (e) {
    console.error(e);
    preencher(conteudo, el("p", { class: "erro-form", text: mensagemErro(e) }));
  }
}

let ultimoHash = location.hash;
window.addEventListener("hashchange", () => {
  if (haAlteracoes() && ultimoHash.startsWith("#/receita/") && !window.confirm("Há alterações não salvas na receita. Sair sem salvar?")) {
    history.replaceState(null, "", ultimoHash);
    return;
  }
  ultimoHash = location.hash;
  rotear();
});
window.addEventListener("beforeunload", (e) => {
  if (haAlteracoes()) { e.preventDefault(); e.returnValue = ""; }
});

async function carregarPerfil() {
  const [{ data: perfil }, { data: admin }] = await Promise.all([
    sb.from("perfis").select("nome, papel").eq("user_id", sessao.usuario.id).maybeSingle(),
    sb.rpc("eh_admin"),
  ]);
  sessao.perfil = perfil ?? { nome: "", papel: "usuario" };
  sessao.admin = admin === true;
}

function montarApp() {
  const topo = cabecalho();
  preencher(raiz(), topo, el("main", { id: "conteudo", class: "conteudo" }));
  marcarMenu();
  // Altura real do topo para o CSS: a barra vital do editor fica fixa logo abaixo dele.
  if (window.ResizeObserver) {
    new ResizeObserver(() => document.documentElement.style.setProperty("--topo-h", `${topo.offsetHeight}px`)).observe(topo);
  }
}

// ---------- início ----------
let iniciado = false;
sb.auth.onAuthStateChange((evento, s) => {
  // Adia para fora do callback (o supabase-js não recomenda await dentro dele).
  setTimeout(async () => {
    if (evento === "PASSWORD_RECOVERY") { sessao.usuario = s?.user ?? null; telaDefinirSenha("recovery"); return; }
    if (!s?.user) {
      sessao.usuario = null; sessao.perfil = null; sessao.admin = false; iniciado = false;
      telaEntrar(linkRecebido.erro ? "O link expirou ou já foi usado. Peça um novo." : "");
      linkRecebido.erro = null;
      return;
    }
    const mudouUsuario = sessao.usuario?.id !== s.user.id;
    sessao.usuario = s.user;
    if (evento === "TOKEN_REFRESHED" || (iniciado && !mudouUsuario)) return;
    iniciado = true;
    await carregarPerfil();
    if (linkRecebido.tipo === "invite" || linkRecebido.tipo === "recovery") { telaDefinirSenha(linkRecebido.tipo); return; }
    montarApp();
    if (!location.hash.startsWith("#/")) location.hash = "#/receitas";
    else rotear();
  }, 0);
});
