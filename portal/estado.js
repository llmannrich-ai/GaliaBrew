// estado.js — cliente do Supabase, sessão e preferências, compartilhados pelas telas.
import { SUPABASE_URL, SUPABASE_CHAVE_PUBLICA } from "./config.js?v=20261124d";

// O link de convite/recuperação chega com #access_token=...&type=invite|recovery; o cliente apaga o hash ao ler,
// então o tipo é guardado ANTES de criar o cliente.
const hashInicial = new URLSearchParams(location.hash.replace(/^#/, ""));
export const linkRecebido = {
  tipo: hashInicial.get("type"),
  erro: hashInicial.get("error_description"),
};

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICA, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const sessao = { usuario: null, perfil: null, admin: false };

const PREF = "galiabrew.preferencias";
// passo_*: quanto os botões ± e as setas mudam a quantidade no editor (gramas).
export const preferencias = Object.assign({ cor: "EBC", passo_fermentavel_g: 250, passo_lupulo_g: 5 }, lerJson(localStorage.getItem(PREF)));
// O padrão antigo dos fermentáveis era 50 g (gravado junto ao salvar qualquer preferência): passa para o novo, 250 g.
if (Number(preferencias.passo_fermentavel_g) === 50) preferencias.passo_fermentavel_g = 250;
export function salvarPreferencias() {
  localStorage.setItem(PREF, JSON.stringify(preferencias));
}

function lerJson(t) {
  try { return JSON.parse(t || "{}") ?? {}; } catch { return {}; }
}
