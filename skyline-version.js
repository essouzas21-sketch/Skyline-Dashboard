/**
 * Recarrega a página quando version.json mudar (novo deploy).
 */
const SkylineVersion = {
  _current: null,
  _started: false,

  async check() {
    try {
      const res = await fetch(`version.json?_t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const version = data?.version;
      if (!version) return;

      if (this._current == null) {
        this._current = version;
        return;
      }
      if (this._current !== version) {
        // abre o endereço com a versão nova na URL: o navegador não reaproveita a página antiga do cache
        try {
          const u = new URL(location.href);
          u.searchParams.set("_v", version);
          location.replace(u.toString());
        } catch (_) {
          location.reload();
        }
      }
    } catch (_) {
      /* rede offline — ignora */
    }
  },

  start(intervalMs = 60000) {
    if (this._started) return;
    this._started = true;
    this.check();
    setInterval(() => this.check(), intervalMs);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.check();
    });
    // Força checagem após deploy (payload grande pode demorar no primeiro load)
    setTimeout(() => this.check(), 5000);
  }
};
