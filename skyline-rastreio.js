/**
 * Skyline — leitor compartilhado da api-rastreio-imei (WMS novo).
 *
 * Usado como fonte quando as APIs antigas estão fora (consulta-recebimentos e
 * api-movimentacao-enderecos respondem 503 "API_DESATIVADA") ou pararam de atualizar
 * (webhooks n8n). Só LEITURA (GET). Chave: window.SKYLINE_MOVIMENTACAO_API_KEY (skyline-chaves.js).
 *
 * Os dados ficam em memória e no IndexedDB por CACHE_MS, compartilhados entre as telas.
 */
const SkylineRastreio = {
  API: "https://skywms-api-265182881354.southamerica-east1.run.app/functions/v1/api-rastreio-imei",
  PAGE: 500,
  PARALELO: 1,
  TIMEOUT_MS: 60000,
  CACHE_MS: 30 * 60 * 1000, // rastreio completo é pesado para o WMS: no máximo 1 carga a cada 30 min por tela
  _mem: {},
  _inflight: {},

  async chave() {
    if (window.SKYLINE_MOVIMENTACAO_API_KEY) return window.SKYLINE_MOVIMENTACAO_API_KEY;
    try {
      if (typeof SkylineDash !== "undefined") await SkylineDash.getRecebimentoApiKey(); // carrega skyline-chaves.js
    } catch (_) { /* sem chaves */ }
    return window.SKYLINE_MOVIMENTACAO_API_KEY || null;
  },

  async _pagina(key, params) {
    let ultimo = null;
    for (let t = 1; t <= 3; t++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.TIMEOUT_MS);
      try {
        const res = await fetch(`${this.API}?${new URLSearchParams(params)}`, {
          cache: "no-store",
          headers: { "x-api-key": key },
          signal: ctrl.signal
        });
        if (!res.ok) throw new Error(`api-rastreio-imei HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        ultimo = err && err.name === "AbortError" ? new Error("api-rastreio-imei sem resposta") : err;
        if (t < 3) await new Promise((r) => setTimeout(r, 1500 * t));
      } finally {
        clearTimeout(timer);
      }
    }
    throw ultimo;
  },

  _idb() {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open("skyline_rastreio", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("cache");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  },

  async _idbGet(k) {
    const db = await this._idb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const r = db.transaction("cache", "readonly").objectStore("cache").get(k);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  },

  async _idbSet(k, v) {
    const db = await this._idb();
    if (!db) return;
    try { db.transaction("cache", "readwrite").objectStore("cache").put(v, k); } catch (_) { /* sem espaço */ }
  },

  /**
   * Todos os aparelhos da api-rastreio-imei.
   * eventos=true traz o histórico (recebimento, endereços, triagem, peças, reparo, CQE).
   * extra = filtros da API (de, ate — por recebido_em —, status, imei).
   */
  async todos({ eventos = true, extra = {}, force = false } = {}) {
    const k = `${eventos ? "ev" : "sem"}|${JSON.stringify(extra)}`;
    const agora = Date.now();
    if (!force) {
      const m = this._mem[k];
      if (m && agora - m.at < this.CACHE_MS) return m.itens;
      const db = await this._idbGet(k);
      if (db && agora - db.at < this.CACHE_MS && Array.isArray(db.itens)) {
        this._mem[k] = db;
        return db.itens;
      }
    }
    if (this._inflight[k]) return this._inflight[k];
    this._inflight[k] = (async () => {
      const key = await this.chave();
      if (!key) throw new Error("chave da api-rastreio-imei ausente (skyline-chaves.js)");
      const base = { limite: String(this.PAGE), ...extra };
      if (!eventos) base.eventos = "false";
      const primeira = await this._pagina(key, { ...base, offset: "0" });
      const total = Number(primeira.total) || (primeira.itens || []).length;
      const itens = [...(primeira.itens || [])];
      const offs = [];
      for (let o = this.PAGE; o < total; o += this.PAGE) offs.push(o);
      for (let i = 0; i < offs.length; i += this.PARALELO) {
        const lote = await Promise.all(offs.slice(i, i + this.PARALELO).map((o) => this._pagina(key, { ...base, offset: String(o) })));
        lote.forEach((j) => itens.push(...(j.itens || [])));
      }
      const vistos = new Map();
      itens.forEach((x) => vistos.set(String(x.imei || x.os), x));
      const out = [...vistos.values()];
      const reg = { at: Date.now(), itens: out };
      this._mem[k] = reg;
      this._idbSet(k, reg);
      return out;
    })();
    try {
      return await this._inflight[k];
    } finally {
      delete this._inflight[k];
    }
  },

  _eventos(x) {
    return (x.eventos || []).filter((e) => e && e.data).sort((a, b) => String(a.data).localeCompare(String(b.data)));
  },

  _endereco(destino) {
    return String(destino || "").split("/").pop().trim();
  },

  /**
   * Recebidos = aparelhos bipados no endereço RECEBIMENTO (mesma regra do dash Recebimento):
   * entrada direto em outro endereço (ex.: TRIAGEM 1) não conta como recebimento.
   * → [{ id, imei, os, nf, data_recebimento, usuario, marca, produto, sku, fornecedor }]
   */
  recebidos(itens) {
    const out = [];
    (itens || []).forEach((x) => {
      const ev = this._eventos(x);
      const entrada = ev.find((e) => e.etapa === "ESTOQUE" && e.evento === "ENTRADA");
      if (entrada) {
        const dest = this._endereco(entrada.detalhe?.destino).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
        if (dest && dest !== "RECEBIMENTO") return;
      }
      const evRec = ev.find((e) => e.etapa === "RECEBIMENTO");
      const data = x.recebido_em || evRec?.data || null;
      if (!data) return;
      out.push({
        id: String(x.imei || x.os),
        imei: x.imei || null,
        os: x.os || null,
        nf: x.nf != null ? String(x.nf) : null,
        data_recebimento: data,
        usuario: evRec?.usuario || null,
        marca: x.marca || null,
        produto: x.produto || null,
        sku: x.sku || null,
        fornecedor: x.fornecedor || null
      });
    });
    return out;
  },

  /**
   * Pedidos de peça = cada peça solicitada na Gestão de Peças (evento GESTAO_PECAS/SOLICITAR),
   * com a data/hora de cada pedido — inclusive as peças pedidas de novo no retorno do técnico.
   * Uma peça cancelada e pedida de novo conta 2 vezes (são 2 pedidos); a mesma solicitação
   * repetida (mesmo os_peca_id) conta 1.
   * → [{ id(OS), serial, nr, data, sku, peca, solicitante, origem, aparelho, marca }]
   */
  pedidosDePeca(itens) {
    const out = [];
    (itens || []).forEach((x) => {
      const vistos = new Set();
      this._eventos(x).forEach((e) => {
        if (e.etapa !== "GESTAO_PECAS" || e.evento !== "SOLICITAR") return;
        const d = e.detalhe || {};
        const chave = d.os_peca_id != null ? `id:${d.os_peca_id}` : `${d.sku_peca || d.peca}|${e.data}`;
        if (vistos.has(chave)) return;
        vistos.add(chave);
        out.push({
          id: x.os || String(x.imei),
          serial: x.imei || null,
          nr: x.nf != null ? String(x.nf) : null,
          data: e.data,
          sku: d.sku_peca || null,
          peca: d.peca || d.sku_peca || "—",
          solicitante: e.usuario || "—",
          origem: d.origem || null,
          aparelho: x.produto || [x.marca, x.modelo].filter(Boolean).join(" ") || "",
          marca: x.marca || null
        });
      });
    });
    return out;
  }
};
