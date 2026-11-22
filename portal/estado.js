// estado.js — cliente do Supabase, sessão e preferências, compartilhados pelas telas.
import { SUPABASE_URL, SUPABASE_CHAVE_PUBLICA } from "./config.js?v=20261122e";

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
export const preferencias = Object.assign({ cor: "EBC" }, lerJson(localStorage.getItem(PREF)));
export function salvarPreferencias() {
  localStorage.setItem(PREF, JSON.stringify(preferencias));
}

function lerJson(t) {
  try { return JSON.parse(t || "{}") ?? {}; } catch { return {}; }
}
