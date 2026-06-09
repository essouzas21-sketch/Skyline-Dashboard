/**
 * Lançamentos manuais do consolidado (temporário — revertível via git).
 * Base em consolidado-manual.json + ajustes do dia em localStorage (por TV/navegador).
 */
const ConsolidadoManual = {
  STORAGE_KEY: "skyline-consolidado-manual-delta",
  JSON_URL: "consolidado-manual.json",

  defaultDelta() {
    return { saldoAtual: 0, produtosDesmontados: 0, pll: 0 };
  },

  loadDelta() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return this.defaultDelta();
      const parsed = JSON.parse(raw);
      return { ...this.defaultDelta(), ...parsed };
    } catch {
      return this.defaultDelta();
    }
  },

  saveDelta(delta) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify({ ...this.defaultDelta(), ...delta }));
  },

  async loadBase() {
    try {
      const res = await fetch(`${this.JSON_URL}?_t=${Date.now()}`);
      if (!res.ok) throw new Error("json");
      const data = await res.json();
      return {
        saldoAtual: Number(data?.triagem?.saldoAtual) || 0,
        produtosDesmontados: Number(data?.triagem?.produtosDesmontados) || 0,
        pll: Number(data?.iphone?.pll) || 0
      };
    } catch {
      return { saldoAtual: 0, produtosDesmontados: 0, pll: 0 };
    }
  },

  async getValues() {
    const base = await this.loadBase();
    const delta = this.loadDelta();
    return {
      saldoAtual: base.saldoAtual + delta.saldoAtual,
      produtosDesmontados: base.produtosDesmontados + delta.produtosDesmontados,
      pll: base.pll + delta.pll,
      base,
      delta
    };
  },

  addLaunch(field, amount) {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (!n) return this.loadDelta();
    const delta = this.loadDelta();
    delta[field] = (delta[field] || 0) + n;
    this.saveDelta(delta);
    return delta;
  },

  resetDelta() {
    localStorage.removeItem(this.STORAGE_KEY);
  }
};
