// app.js — entrada do portal: login, menu, rotas (#/...) e perfil.
import { el, $, limpar, preencher, avisar, mensagemErro, SENHA_MIN, campoTexto, campoNumero } from "./ui.js?v=20261128e";
import { sb, sessao, preferencias, salvarPreferencias, linkRecebido } from "./estado.js?v=20261128e";
import { telaReceitas, telaEditor, haAlteracoes } from "./receitas.js?v=20261128e";
import { telaCadastros, CADASTROS, esquecerCatalogo, preCarregarCatalogo } from "./cadastros.js?v=20261128e";
import { telaFerramentas } from "./ferramentas.js?v=20261128e";
import { montarCasca, marcarMenu, fecharMenu } from "./menu.js?v=20261128e";
import { icone } from "./icones.js?v=20261128e";

// ---------- estrutura ----------
const raiz = () => $("#app");

// ---------- login ----------
// Cadastro ABERTO e SEM confirmação de e-mail (decisão de 22/11/2026, reforçada em 27/11/2026): a conta nasce já
// entrando. O e-mail não é validado, então "Esqueci a senha" só funciona para quem cadastrou um e-mail real.
const campoEmail = (dados, autocomplete) => el("label", {}, el("span", { class: "rotulo", text: "E-mail" }), el("input", {
  type: "email", autocomplete, inputmode: "email", autocapitalize: "none", spellcheck: "false", required: true, value: dados.email,
  enterkeyhint: "next", on: { input: (e) => { dados.email = e.target.value; } },
}));

/** Campo de texto das telas de acesso (rótulo em versalete em cima do campo). */
const campoAcesso = (rotulo, attrs) => el("label", {}, el("span", { class: "rotulo", text: rotulo }), el("input", attrs));

/** Senha com o botão de mostrar/esconder (28/11/2026): no celular é fácil errar uma letra sem ver o que foi digitado. */
function campoSenha(rotulo, { autocomplete, aoDigitar, enterkeyhint = "go" }) {
  const entrada = el("input", { type: "password", autocomplete, autocapitalize: "none", spellcheck: "false", required: true, enterkeyhint,
    on: { input: (e) => aoDigitar(e.target.value) } });
  const olho = el("button", {
    type: "button", class: "ver-senha", "aria-label": "Mostrar a senha", "aria-pressed": "false",
    on: {
      click: () => {
        const ver = entrada.type === "password";
        entrada.type = ver ? "text" : "password";
        olho.setAttribute("aria-pressed", String(ver));
        olho.setAttribute("aria-label", ver ? "Esconder a senha" : "Mostrar a senha");
        preencher(limpar(olho), icone(ver ? "olho_fechado" : "olho"));
      },
    },
  }, icone("olho"));
  return el("div", { class: "campo-senha" }, el("label", {}, el("span", { class: "rotulo", text: rotulo }), entrada), olho);
}

/** Logo "Gália" das telas de acesso (27/11/2026, pedido do responsável; era o texto "GaliaBrew"). Desde 28/11/2026 fica
 *  na "espuma" do topo, que é clara nos dois modos: sempre a versão de cores da arte. `tag` = h1 no login (a logo é o
 *  título) ou div nas outras telas. */
const logoAcesso = (tag = "div") => el(tag, { class: "login-logo" },
  el("img", { src: "icones/logo-galia.png", alt: "Gália", width: 538, height: 300, decoding: "async" }));

/** Molde das telas de acesso (28/11/2026, pedido do responsável: login "mais moderno e robusto"). A tela é um copo de
 *  cerveja visto de lado: em cima a espuma com a logo; embaixo o corpo da cerveja (Pilsen no modo claro, Stout no escuro)
 *  com bolhas subindo e o formulário. Só CSS para o desenho (bolhas = spans; colarinho = a máscara da espuma do editor). */
function telaAcesso(form, logoTag = "div", compacta = false) {
  const bolhas = el("div", { class: "bolhas", "aria-hidden": "true" }, Array.from({ length: 14 }, () => el("i")));
  preencher(raiz(), el("main", { class: compacta ? "acesso compacta" : "acesso" },
    el("header", { class: "acesso-espuma" }, logoAcesso(logoTag), el("p", { class: "acesso-lema", text: "Receitas de cerveja" })),
    el("div", { class: "acesso-cerveja" }, bolhas, form)));
}

/** Botão principal com estado de espera (texto troca e fica desabilitado enquanto o Supabase responde). */
async function esperando(botao, texto, fn) {
  const antes = botao.textContent;
  botao.disabled = true; botao.setAttribute("aria-busy", "true"); botao.textContent = texto;
  try { return await fn(); } finally { botao.disabled = false; botao.removeAttribute("aria-busy"); botao.textContent = antes; }
}

function telaEntrar(mensagem, email = "") {
  const dados = { email, senha: "" };
  const msg = el("p", { class: "erro-form", role: "alert", text: mensagem || "" });
  const info = el("p", { class: "ok-form", role: "status" });
  const botao = el("button", { type: "submit", class: "acesso-principal", text: "Entrar" });
  const form = el("form", {
    class: "login",
    on: {
      submit: async (e) => {
        e.preventDefault();
        msg.textContent = ""; info.textContent = "";
        const { error } = await esperando(botao, "Entrando…",
          () => sb.auth.signInWithPassword({ email: dados.email.trim(), password: dados.senha }));
        if (error) msg.textContent = mensagemErro(error);
      },
    },
  },
  campoEmail(dados, "username"),
  campoSenha("Senha", { autocomplete: "current-password", aoDigitar: (v) => { dados.senha = v; } }),
  msg,
  info,
  botao,
  el("button", {
    type: "button", class: "link esqueci", text: "Esqueci a senha",
    on: {
      click: async (e) => {
        const esqueci = e.currentTarget;
        msg.textContent = ""; info.textContent = "";
        const email = dados.email.trim();
        if (!email) { msg.textContent = "Digite acima o e-mail da sua conta."; return; }
        esqueci.disabled = true;
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        esqueci.disabled = false;
        if (error) { msg.textContent = mensagemErro(error); return; }
        // Mesma resposta exista ou não a conta (não revela quem tem cadastro).
        info.textContent = "Se este e-mail tiver conta, chegará nele um link para criar a nova senha. "
          + "Só chega se o e-mail cadastrado for real; veja também o spam.";
      },
    },
  }),
  el("div", { class: "login-conta" },
    el("span", { text: "Ainda não tem conta?" }),
    el("button", { type: "button", class: "secundario criar-conta", text: "Criar conta", on: { click: () => telaCriarConta(dados.email) } })));
  telaAcesso(form, "h1");
}

/** Criar conta: nome, e-mail e senha. Sem confirmação de e-mail, a conta já entra (o onAuthStateChange abre o app). */
function telaCriarConta(email = "") {
  const dados = { nome: "", email, senha: "", repetir: "" };
  const msg = el("p", { class: "erro-form", role: "alert" });
  const info = el("p", { class: "ok-form", role: "status" });
  const botao = el("button", { type: "submit", class: "acesso-principal", text: "Criar conta" });
  const form = el("form", {
    class: "login conta",
    on: {
      submit: async (e) => {
        e.preventDefault();
        msg.textContent = ""; info.textContent = "";
        const nome = dados.nome.trim();
        if (!nome) { msg.textContent = "Digite o seu nome."; return; }
        if (dados.senha.length < SENHA_MIN) { msg.textContent = `A senha precisa de pelo menos ${SENHA_MIN} caracteres.`; return; }
        if (dados.senha !== dados.repetir) { msg.textContent = "As duas senhas não conferem."; return; }
        const { data, error } = await esperando(botao, "Criando…", () => sb.auth.signUp({
          email: dados.email.trim(), password: dados.senha,
          options: { data: { nome }, emailRedirectTo: location.origin + location.pathname },
        }));
        if (error) { msg.textContent = mensagemErro(error); return; }
        // Com a confirmação de e-mail ligada no painel (não é o caso hoje), o Supabase não devolve sessão.
        if (!data?.session) info.textContent = "Conta criada. Abra o link que chegou no seu e-mail para ativar e depois entre.";
      },
    },
  },
  el("h1", { class: "acesso-titulo", text: "Criar conta" }),
  campoAcesso("Nome", { type: "text", autocomplete: "name", autocapitalize: "words", maxlength: 80, required: true, enterkeyhint: "next", on: { input: (e) => { dados.nome = e.target.value; } } }),
  campoEmail(dados, "email"),
  el("p", { class: "nota login-aviso", text: "Não enviamos e-mail de confirmação: a conta já entra. Use um e-mail real que você lê: é só por ele que dá para recuperar a senha." }),
  campoSenha(`Senha · mínimo ${SENHA_MIN} caracteres`, { autocomplete: "new-password", enterkeyhint: "next", aoDigitar: (v) => { dados.senha = v; } }),
  campoSenha("Repita a senha", { autocomplete: "new-password", aoDigitar: (v) => { dados.repetir = v; } }),
  msg,
  info,
  botao,
  el("div", { class: "login-conta" },
    el("span", { text: "Já tem conta?" }),
    el("button", { type: "button", class: "secundario voltar-entrar", text: "Entrar", on: { click: () => telaEntrar("", dados.email) } })));
  telaAcesso(form, "div", true);
}

/** Tela para definir a senha (convite ou recuperação). */
function telaDefinirSenha(tipo) {
  const dados = { senha: "", repetir: "" };
  const msg = el("p", { class: "erro-form", role: "alert" });
  const botao = el("button", { type: "submit", class: "acesso-principal", text: "Salvar senha" });
  const form = el("form", {
    class: "login",
    on: {
      submit: async (e) => {
        e.preventDefault();
        msg.textContent = "";
        if (dados.senha.length < SENHA_MIN) { msg.textContent = `Use pelo menos ${SENHA_MIN} caracteres.`; return; }
        if (dados.senha !== dados.repetir) { msg.textContent = "As duas senhas não conferem."; return; }
        const { error } = await esperando(botao, "Salvando…", () => sb.auth.updateUser({ password: dados.senha }));
        if (error) { msg.textContent = mensagemErro(error); return; }
        avisar("Senha definida.");
        linkRecebido.tipo = null;
        montarApp();
        if (location.hash !== "#/receitas") location.hash = "#/receitas";
        else rotear();
      },
    },
  },
  el("h1", { class: "acesso-titulo", text: tipo === "invite" ? "Bem-vindo ao Gália" : "Nova senha" }),
  el("p", { class: "nota login-aviso", text: `Defina a sua senha (mínimo ${SENHA_MIN} caracteres).` }),
  campoSenha("Senha", { autocomplete: "new-password", enterkeyhint: "next", aoDigitar: (v) => { dados.senha = v; } }),
  campoSenha("Repita a senha", { autocomplete: "new-password", aoDigitar: (v) => { dados.repetir = v; } }),
  msg,
  botao);
  telaAcesso(form, "div", true);
}

async function sair() {
  if (haAlteracoes() && !window.confirm("Há alterações não salvas. Sair mesmo assim?")) return;
  fecharMenu();
  await sb.auth.signOut();
}

// ---------- perfil ----------
/** Aparência: um cartão por tema, com a miniatura do app nas cores dele. Troca na hora e fica salvo no aparelho. */
function secaoTemas() {
  const T = window.GaliaTema;
  const escolhido = T.atual();
  // O "Automático" mostra as duas metades (Clássico de dia, Adega à noite).
  const metade = (tema, modo) => el("div", { "data-tema": tema, "data-modo": modo },
    el("div", { class: "tm-menu" }, el("i"), el("i"), el("i")),
    el("div", { class: "tm-pagina" }, el("div", { class: "tm-faixa" }), el("div", { class: "tm-texto" }), el("div", { class: "tm-texto s" }),
      el("div", { class: "tm-pe" }, el("span", { class: "tm-botao" }), el("b"), el("b"), el("b"))));
  return el("section", { class: "cartao" },
    el("h3", { text: "Aparência" }),
    el("fieldset", { class: "temas" },
      el("legend", { class: "nota", text: "Tema de cores. Vale neste aparelho e muda na hora." }),
      T.lista.map((t) => el("label", { class: "tema-opcao", dataset: { opcao: t.id } },
        el("input", {
          type: "radio", name: "tema", value: t.id, checked: t.id === escolhido,
          on: { change: () => { preferencias.tema = t.id; salvarPreferencias(); T.aplicar(t.id); } },
        }),
        el("div", { class: "tema-mini", "aria-hidden": "true" },
          t.modo === "auto" ? [metade("classico", "claro"), metade("adega", "escuro")] : metade(t.id, t.modo)),
        el("span", { class: "tema-nome" }, t.nome, icone("certo")),
        el("span", { class: "tema-desc", text: t.descricao })))),
    // Layout da receita (24/11/2026): Completo (como sempre) ou Clean (ficha enxuta, docs/PLANO-CLEAN.md).
    el("fieldset", { class: "temas layouts" },
      el("legend", { class: "nota", text: "Layout da receita. Vale neste aparelho." }),
      T.layouts.map((l) => el("label", { class: "tema-opcao", dataset: { opcao: l.id } },
        el("input", {
          type: "radio", name: "layout", value: l.id, checked: l.id === T.layout(),
          on: { change: () => { preferencias.layout = l.id; salvarPreferencias(); T.aplicarLayout(l.id); } },
        }),
        el("div", { class: `layout-mini ${l.id}`, "aria-hidden": "true" },
          [0, 1, 2].map(() => el("div", { class: "lm-linha" }, el("i"), el("b"), el("u")))),
        el("span", { class: "tema-nome" }, l.nome, icone("certo")),
        el("span", { class: "tema-desc", text: l.descricao })))));
}

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
    secaoTemas(),
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
            if (senha.nova.length < SENHA_MIN) { msgSenha.textContent = `Use pelo menos ${SENHA_MIN} caracteres.`; return; }
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
  fecharMenu();
  rotaAtual = location.hash;
  conteudo.className = "conteudo";      // o editor acrescenta "com-vital"; as outras telas não
  document.body.classList.remove("no-editor");
  document.body.classList.toggle("na-inicio", rota === "receitas");
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
  const { raiz: casca, barra } = montarCasca({ sair });
  preencher(raiz(), casca);
  marcarMenu();
  // Altura real da barra do topo para o CSS: a barra vital do editor fica fixa logo abaixo dela. No computador a barra
  // some (o menu é lateral) e a altura vira 0.
  const medir = () => document.documentElement.style.setProperty("--topo-h", `${barra.offsetHeight}px`);
  medir();
  if (window.ResizeObserver) new ResizeObserver(medir).observe(barra);
}

// ---------- início ----------
let iniciado = false;
sb.auth.onAuthStateChange((evento, s) => {
  // Adia para fora do callback (o supabase-js não recomenda await dentro dele).
  setTimeout(async () => {
    if (evento === "PASSWORD_RECOVERY") { sessao.usuario = s?.user ?? null; telaDefinirSenha("recovery"); return; }
    if (!s?.user) {
      sessao.usuario = null; sessao.perfil = null; sessao.admin = false; iniciado = false;
      esquecerCatalogo();
      telaEntrar(linkRecebido.erro ? "O link expirou ou já foi usado. Peça um novo." : "");
      linkRecebido.erro = null;
      return;
    }
    const mudouUsuario = sessao.usuario?.id !== s.user.id;
    sessao.usuario = s.user;
    if (evento === "TOKEN_REFRESHED" || (iniciado && !mudouUsuario)) return;
    iniciado = true;
    if (mudouUsuario) esquecerCatalogo();
    await carregarPerfil();
    if (linkRecebido.tipo === "invite" || linkRecebido.tipo === "recovery") { telaDefinirSenha(linkRecebido.tipo); return; }
    montarApp();
    if (!location.hash.startsWith("#/")) location.hash = "#/receitas";
    else rotear();
    // Catálogo do editor em segundo plano, depois da 1ª tela (não disputa a rede com a lista de receitas).
    setTimeout(preCarregarCatalogo, 1200);
  }, 0);
});
