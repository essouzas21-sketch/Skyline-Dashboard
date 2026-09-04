/**
 * Autenticação Skyline via Supabase Auth + perfis (skyline_profiles).
 * Sessão espelhada em sessionStorage para leitura síncrona nas páginas.
 */
const SkylineAuth = (() => {
  const SESSION_KEY = "skyline_auth_session_v2";
  const LOGIN_PAGE = "login.html";
  const PUBLIC_PAGES = new Set(["login.html"]);
  const SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  /** Config pública (anon). Preferir skyline-supabase.js se existir. */
  const DEFAULT_SUPABASE = {
    url: "https://yyrqusptzsphpbooepan.supabase.co",
    anonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cnF1c3B0enNwaHBib29lcGFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NDQ3NTIsImV4cCI6MjEwMzEyMDc1Mn0.zIV084Iy2YQe5WR6Dex1RbX_MjTMIQPY-p1l0xFHDW8",
    profilesTable: "skyline_profiles"
  };

  let _client = null;
  let _session = null;
  let _readyPromise = null;

  function pageName() {
    const path = location.pathname || "";
    const base = path.split("/").pop() || "";
    return base.toLowerCase() || "index.html";
  }

  function isPublicPage() {
    return PUBLIC_PAGES.has(pageName());
  }

  function normEmail(email) {
    return String(email || "")
      .trim()
      .toLowerCase();
  }

  function cfg() {
    const external = typeof SkylineSupabase !== "undefined" ? SkylineSupabase : null;
    const merged = {
      ...DEFAULT_SUPABASE,
      ...(external && typeof external === "object" ? external : {})
    };
    if (!merged.url || !merged.anonKey) {
      throw new Error("Supabase URL/anon key não configurados.");
    }
    return merged;
  }

  function profilesTable() {
    return cfg().profilesTable || "skyline_profiles";
  }

  function readMirror() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.email) return null;
      return {
        email: normEmail(s.email),
        name: String(s.name || "").trim() || normEmail(s.email),
        role: s.role === "admin" ? "admin" : "user",
        active: s.active !== false,
        at: s.at || Date.now()
      };
    } catch {
      return null;
    }
  }

  function writeMirror(session) {
    if (!session) {
      sessionStorage.removeItem(SESSION_KEY);
      _session = null;
      return;
    }
    const next = {
      email: normEmail(session.email),
      name: String(session.name || "").trim() || normEmail(session.email),
      role: session.role === "admin" ? "admin" : "user",
      active: session.active !== false,
      at: Date.now()
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    _session = next;
  }

  function loadSdk() {
    return new Promise((resolve, reject) => {
      if (window.supabase?.createClient) {
        resolve();
        return;
      }
      const existing = document.querySelector(`script[data-skyline-supabase-sdk="1"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Falha ao carregar Supabase SDK.")));
        return;
      }
      const s = document.createElement("script");
      s.src = SDK_URL;
      s.async = true;
      s.dataset.skylineSupabaseSdk = "1";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Falha ao carregar Supabase SDK."));
      document.head.appendChild(s);
    });
  }

  async function getClient() {
    if (_client) return _client;
    await loadSdk();
    const { url, anonKey } = cfg();
    _client = window.supabase.createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return _client;
  }

  async function fetchProfile(email) {
    const client = await getClient();
    const key = normEmail(email);
    const { data, error } = await client
      .from(profilesTable())
      .select("email,name,role,active,created_at,updated_at")
      .eq("email", key)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function ensureProfileForLogin(authUser) {
    const email = normEmail(authUser?.email);
    if (!email) return null;

    let profile = null;
    try {
      profile = await fetchProfile(email);
    } catch (err) {
      console.warn("[SkylineAuth] perfil indisponível:", err?.message || err);
    }

    if (profile) {
      return {
        email,
        name: String(profile.name || "").trim() || email,
        role: profile.role === "admin" ? "admin" : "user",
        active: profile.active !== false
      };
    }

    // Sem linha na tabela: libera acesso básico (user) até o SQL/perfis serem criados.
    const metaName =
      authUser?.user_metadata?.name ||
      authUser?.user_metadata?.full_name ||
      email.split("@")[0];
    const metaRole = authUser?.user_metadata?.role === "admin" ? "admin" : "user";
    return {
      email,
      name: String(metaName || email).trim(),
      role: metaRole,
      active: true
    };
  }

  async function refreshSession() {
    const client = await getClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const authSession = data?.session;
    if (!authSession?.user) {
      writeMirror(null);
      return null;
    }
    const profile = await ensureProfileForLogin(authSession.user);
    if (profile && profile.active === false) {
      await client.auth.signOut();
      writeMirror(null);
      return null;
    }
    writeMirror(profile);
    return _session;
  }

  function getSession() {
    return _session || readMirror();
  }

  function ready() {
    if (!_readyPromise) _readyPromise = boot();
    return _readyPromise;
  }

  async function login(email, password) {
    const client = await getClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: normEmail(email),
      password: String(password || "")
    });
    if (error) {
      const msg = String(error.message || "").toLowerCase();
      if (msg.includes("invalid login") || msg.includes("invalid credentials")) {
        return { ok: false, error: "E-mail ou senha inválidos." };
      }
      if (msg.includes("email not confirmed")) {
        return { ok: false, error: "E-mail ainda não confirmado no Supabase." };
      }
      return { ok: false, error: error.message || "Falha no login." };
    }
    const profile = await ensureProfileForLogin(data.user);
    if (!profile || profile.active === false) {
      await client.auth.signOut();
      return { ok: false, error: "Usuário inativo. Fale com o administrador." };
    }
    writeMirror(profile);
    return { ok: true, user: _session };
  }

  async function logout(redirectTo) {
    try {
      const client = await getClient();
      await client.auth.signOut();
    } catch (_) {
      /* ignore */
    }
    writeMirror(null);
    location.href = redirectTo || LOGIN_PAGE;
  }

  async function listUsers() {
    const client = await getClient();
    const { data, error } = await client
      .from(profilesTable())
      .select("email,name,role,active,created_at,updated_at")
      .order("email", { ascending: true });
    if (error) throw error;
    return (data || []).map((u) => ({
      email: normEmail(u.email),
      name: String(u.name || "").trim() || normEmail(u.email),
      role: u.role === "admin" ? "admin" : "user",
      active: u.active !== false,
      createdAt: u.created_at || null,
      updatedAt: u.updated_at || null
    }));
  }

  async function upsertUser({ email, name, password, role, active }) {
    const session = getSession();
    if (!session || session.role !== "admin") {
      return { ok: false, error: "Apenas administradores podem gerenciar usuários." };
    }
    const key = normEmail(email);
    if (!key || !key.includes("@")) {
      return { ok: false, error: "Informe um e-mail válido." };
    }
    if (password && String(password).length) {
      return {
        ok: false,
        error:
          "Senha é gerenciada no Supabase (Authentication → Users). Crie/altere a senha lá e salve só o perfil aqui."
      };
    }

    const nextRole = role === "admin" ? "admin" : "user";
    const nextActive = active !== false;
    if (key === normEmail(session.email) && nextRole !== "admin") {
      return { ok: false, error: "Você não pode remover o próprio perfil de admin." };
    }
    if (key === normEmail(session.email) && !nextActive) {
      return { ok: false, error: "Você não pode desativar a própria conta." };
    }

    const client = await getClient();
    const now = new Date().toISOString();
    const { data: existing, error: findErr } = await client
      .from(profilesTable())
      .select("email")
      .eq("email", key)
      .maybeSingle();
    if (findErr) return { ok: false, error: findErr.message };

    if (!existing) {
      const { error } = await client.from(profilesTable()).insert({
        email: key,
        name: String(name || "").trim() || key,
        role: nextRole,
        active: nextActive,
        created_at: now,
        updated_at: now
      });
      if (error) return { ok: false, error: error.message };
      return {
        ok: true,
        warning:
          "Perfil criado. Crie o login em Supabase → Authentication → Users (mesmo e-mail e senha)."
      };
    }

    const { error } = await client
      .from(profilesTable())
      .update({
        name: String(name || "").trim() || key,
        role: nextRole,
        active: nextActive,
        updated_at: now
      })
      .eq("email", key);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function removeUser(email) {
    const session = getSession();
    if (!session || session.role !== "admin") {
      return { ok: false, error: "Apenas administradores podem gerenciar usuários." };
    }
    const key = normEmail(email);
    if (key === normEmail(session.email)) {
      return { ok: false, error: "Você não pode excluir a própria conta." };
    }
    if (key === "ewerton.santos@gruposkytech.com.br") {
      return { ok: false, error: "A conta admin principal não pode ser excluída." };
    }
    const client = await getClient();
    const { error } = await client.from(profilesTable()).delete().eq("email", key);
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      warning: "Perfil removido. Se quiser, apague também o usuário em Authentication → Users."
    };
  }

  function requireAdmin() {
    const session = requireAuth();
    if (!session) return null;
    if (session.role !== "admin") {
      location.replace("menu.html");
      return null;
    }
    return session;
  }

  function requireAuth() {
    if (isPublicPage()) return getSession();
    const session = getSession();
    if (session) return session;
    const next = encodeURIComponent(
      location.pathname.split("/").pop() + location.search + location.hash
    );
    location.replace(`${LOGIN_PAGE}?next=${next}`);
    return null;
  }

  function injectWaitStyle() {
    if (document.getElementById("skyline-auth-wait-style")) return;
    const style = document.createElement("style");
    style.id = "skyline-auth-wait-style";
    style.textContent =
      "html.skyline-auth-wait body{visibility:hidden!important;}html.skyline-auth-ready body{visibility:visible;}";
    document.head.appendChild(style);
  }

  async function boot() {
    injectWaitStyle();
    if (!isPublicPage()) document.documentElement.classList.add("skyline-auth-wait");
    try {
      _session = readMirror();
      await refreshSession();
      if (!isPublicPage() && !getSession()) {
        const next = encodeURIComponent(
          location.pathname.split("/").pop() + location.search + location.hash
        );
        location.replace(`${LOGIN_PAGE}?next=${next}`);
        return null;
      }
      return getSession();
    } catch (err) {
      console.error("[SkylineAuth]", err);
      if (!isPublicPage()) {
        const next = encodeURIComponent(
          location.pathname.split("/").pop() + location.search + location.hash
        );
        location.replace(`${LOGIN_PAGE}?next=${next}`);
      }
      return null;
    } finally {
      document.documentElement.classList.remove("skyline-auth-wait");
      document.documentElement.classList.add("skyline-auth-ready");
    }
  }

  _readyPromise = boot();

  return {
    ready,
    listUsers,
    login,
    logout,
    getSession,
    requireAuth,
    requireAdmin,
    upsertUser,
    removeUser,
    normEmail,
    isPublicPage
  };
})();
