/**
 * Utilitários compartilhados dos dashboards Skyline (menu principal).
 */
const SkylineDash = {
  /** Reparo / triagem / gestão / CQE / produção (campos id, Iniciado_Reparo, decisao…) */
  API_REPARO: "https://automacao.skylinemobile.com.br/webhook/fi",
  /** Recebimento (campos hu_id, data_recebimento, grupo, descricao…) */
  API_RECEBIMENTO: "https://automacao.skylinemobile.com.br/webhook/f16be280-a545-440c-80f4-9481b1dd06f6",
  /** Movimentações de endereço (hu_id, endereco, serial, created_at) — trilha completa + último local */
  API_MOVIMENTACOES: "https://automacao.skylinemobile.com.br/webhook/480761e2-45b0-45d4-a849-82a991ebe7a9",
  /** Peças solicitadas (serial, descricoes, valor_total) */
  API_PECAS: "https://automacao.skylinemobile.com.br/webhook/873620b8-7633-4e79-99fe-39c8b504b9a4",

  HOMOLOG_FIXTURES: {
    "webhook/fi": "data/homolog/reparo.json",
    "8d085005-6279-410a-882c-051ad2a189cf": "data/homolog/reparo.json",
    "8407c7c4-ba6d-49f9-b31f-d6d2ebddfeaf": "data/homolog/reparo.json",
    "f16be280-a545-440c-80f4-9481b1dd06f6": "data/homolog/recebimento.json",
    "661802e8-eef7-4ca5-981b-645706f5afda": "data/homolog/recebimento.json",
    "30e00080-9b5d-4db8-9d2a-e40d71b8cd5d": "data/homolog/reparo.json",
    "78441d8b-4c63-4299-be48-6017e086e474": "data/homolog/recebimento.json",
    "480761e2-45b0-45d4-a849-82a991ebe7a9": "data/homolog/movimentacoes.json",
    "873620b8-7633-4e79-99fe-39c8b504b9a4": "data/homolog/pecas.json"
  },

  /** Intervalo entre slots do ciclo global de refresh (1 dashboard por slot). */
  REFRESH_SLOT_MS: 30000,

  /** Ordem do ciclo — alinhada ao menu; cada página recarrega a cada N × 30s. */
  REFRESH_CYCLE_PAGES: [
    "recebimento.html",
    "triagem.html",
    "gestao-produto.html",
    "producao-diversas-1.html",
    "producao-diversas-2.html",
    "producao-diversas-3.html",
    "producao-diversas-4.html",
    "producao-diversas-5.html",
    "producao-iphone.html",
    "cqe.html",
    "consolidado.html"
  ],

  /** TTL padrão para APIs leves (recebimento). Reparo usa cache estendido. */
  FETCH_CACHE_TTL_MS: 60000,

  /** Cache persistente (IndexedDB) — evita baixar ~14 MB de reparo a cada refresh. */
  FETCH_IDB_TTL_MS: 600000,

  /** Bump força limpeza de IndexedDB/local nas TVs após troca de endpoint. */
  CACHE_VERSION: "62",

  /** Payload acima disso: JSON.parse roda em Web Worker. */
  JSON_WORKER_MIN_CHARS: 400000,

  /** Reparo pode levar >2 min em rede lenta ou com API sob carga. */
  DEFAULT_FETCH_TIMEOUT_MS: 300000,

  isProductionHost() {
    const host = location.hostname.toLowerCase();
    return host.endsWith(".github.io");
  },

  useHomologData() {
    const params = new URLSearchParams(location.search);
    if (params.get("prod") === "1") return false;
    if (params.get("homolog") === "1") return true;
    return !this.isProductionHost();
  },

  homologFixtureFor(url) {
    const u = String(url || "");
    if (!u) return null;
    for (const [id, path] of Object.entries(this.HOMOLOG_FIXTURES)) {
      if (u.includes(id)) return path;
    }
    return null;
  },

  _cacheReady: null,

  ensureCacheVersion() {
    if (this._cacheReady) return this._cacheReady;
    this._cacheReady = (async () => {
      try {
        const key = "skyline-cache-version";
        const prev = localStorage.getItem(key);
        if (prev === this.CACHE_VERSION) return;
        localStorage.setItem(key, this.CACHE_VERSION);
        this._fetchCache = {};
        this._fetchInflight = {};
        this._idbPromise = null;
        if (typeof indexedDB !== "undefined") {
          await new Promise((resolve) => {
            const req = indexedDB.deleteDatabase("skyline-dash-cache");
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
          });
        }
        console.info("[SkylineDash] cache local limpo (v" + this.CACHE_VERSION + ")");
      } catch (_) {
        /* ignore */
      }
    })();
    return this._cacheReady;
  },

  async loadHomologManifest() {
    try {
      const res = await fetch(`data/homolog/manifest.json?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" }
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  initHomologBanner() {
    if (!this.useHomologData()) return;
    if (document.getElementById("homologBanner")) return;

    const banner = document.createElement("div");
    banner.id = "homologBanner";
    banner.className = "homolog-banner";
    banner.innerHTML =
      "<strong>Homologação</strong> — dados locais (sem API de produção). " +
      '<a href="?prod=1">Usar API real</a>';
    document.body.prepend(banner);

    this.loadHomologManifest().then((meta) => {
      if (!meta?.synced_at || !document.getElementById("homologBanner")) return;
      const when = new Date(meta.synced_at).toLocaleString("pt-BR");
      banner.innerHTML =
        `<strong>Homologação</strong> — fixture de ${when}. ` +
        '<a href="?prod=1">Usar API real</a>';
    });
  },

  withHomologQuery(href) {
    if (!this.useHomologData() || !href || href.startsWith("http") || href.startsWith("#")) return href;
    const [path, query = ""] = href.split("?");
    const params = new URLSearchParams(query);
    if (!params.has("homolog") && !params.has("prod")) params.set("homolog", "1");
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  },

  bindHomologLinks(root = document) {
    if (!this.useHomologData()) return;
    root.querySelectorAll("a[href]").forEach((link) => {
      const href = link.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#") || href.includes("prod=1")) return;
      link.setAttribute("href", this.withHomologQuery(href));
    });
  },

  todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },

  toLocalDateStr(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },

  formatDateBR(iso) {
    if (!iso) return "—";
    const [y, m, d] = this.toLocalDateStr(iso).split("-");
    return `${d}/${m}/${y}`;
  },

  formatPeriodBR(start, end) {
    return `${start.split("-").reverse().join("/")} a ${end.split("-").reverse().join("/")}`;
  },

  normalizeRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    const keys = Object.keys(payload);
    // n8n às vezes devolve "data ", "data 1", etc.
    for (const key of keys) {
      const k = String(key).trim().toLowerCase();
      if (k === "data" || k.startsWith("data ")) {
        if (Array.isArray(payload[key])) return payload[key];
      }
    }
    for (const key of keys) {
      if (Array.isArray(payload[key])) return payload[key];
    }
    return [];
  },

  /** Etapas/operações consideradas na triagem e gestão de peças. */
  ETAPAS_OPERACAO: new Set(["reparo", "gestao_pecas"]),
  /** Triagem completa (espelha triagem.html): reparo + gestão peças + limpeza. */
  ETAPAS_TRIAGEM: new Set(["reparo", "gestao_pecas", "limpeza"]),

  resolveOperacao(raw) {
    if (!raw || typeof raw !== "object") return "";
    return String(
      raw.operação ?? raw.operacao ?? raw.etapa_origem ?? raw.ETAPA_ORIGEM ?? ""
    )
      .trim()
      .toLowerCase();
  },

  /** Recebimento: data individual da HU (data_recebimento). */
  resolveRecebimentoDate(raw) {
    if (!raw || typeof raw !== "object") return null;
    const ni = raw.ni;
    if (ni && typeof ni === "object") {
      const nested = ni.data_recebimento ?? ni.dataRecebimento ?? null;
      if (nested) return nested;
    }
    return raw.data_recebimento ?? raw.dataRecebimento ?? null;
  },

  resolveRecebimentoId(raw) {
    if (!raw || typeof raw !== "object") return null;
    return (
      raw.hu_id ??
      raw.nr_item_id ??
      raw.numero ??
      raw.id ??
      raw.hunit ??
      null
    );
  },

  /** Recebimento: dia ignorado nos KPIs e gráficos (YYYY-MM-DD). */
  RECEBIMENTO_DIA_EXCLUIDO: "2026-06-16",

  passesRecebimentoRaw(raw, grupoFiltro = "6151") {
    if (!raw || typeof raw !== "object") return false;
    const grupo = String(raw.grupo ?? raw.Grupo ?? raw.p?.grupo ?? "").trim();
    if (grupo !== String(grupoFiltro)) return false;
    const dataHu = this.resolveRecebimentoDate(raw);
    if (!dataHu) return false;
    if (this.toLocalDateStr(dataHu) === this.RECEBIMENTO_DIA_EXCLUIDO) return false;
    return true;
  },

  /** Gestão: DATA_PEDIDO_SANKHYA (legado) ou Iniciado_Reparo quando Sankhya saiu da API. */
  resolveGestaoDate(raw) {
    if (!raw || typeof raw !== "object") return null;
    return (
      raw.DATA_PEDIDO_SANKHYA ??
      raw.data_pedido_sankhya ??
      raw["Iniciado_Reparo"] ??
      raw.iniciado_reparo ??
      null
    );
  },

  /** Triagem: Data Triagem + operação; Sankhya opcional (triagem.html: requireSankhyaSucesso=false). */
  passesTriagemRaw(raw, etapas = this.ETAPAS_TRIAGEM, opts = {}) {
    if (!raw || typeof raw !== "object") return false;
    const dataTriagem = raw["Data Triagem"] || raw.data_triagem || null;
    if (!dataTriagem) return false;
    if (!etapas.has(this.resolveOperacao(raw))) return false;
    const requireSankhyaSucesso = opts.requireSankhyaSucesso === true;
    if (requireSankhyaSucesso) {
      const sankhya = raw.STATUS_SANKHYA ?? raw.status_sankhya ?? null;
      if (
        sankhya != null &&
        String(sankhya).trim() !== "" &&
        String(sankhya).trim().toLowerCase() !== "sucesso"
      ) {
        return false;
      }
    }
    return true;
  },

  /** Gestão: produto requisitado + data; nova API exige Usuario Solicitação Peça. */
  passesGestaoRaw(raw, etapas = this.ETAPAS_OPERACAO) {
    if (!raw || typeof raw !== "object") return false;
    const produtoId = raw.produto_requisitado_id ?? raw.produto_id_requisitado ?? null;
    if (produtoId == null || String(produtoId).trim() === "") return false;
    if (!this.resolveGestaoDate(raw)) return false;
    if (!etapas.has(this.resolveOperacao(raw))) return false;
    const hasLegacyPedido = !!(raw.DATA_PEDIDO_SANKHYA || raw.data_pedido_sankhya);
    if (!hasLegacyPedido && !raw["Usuario Solicitação Peça"]) return false;
    const sankhya = raw.STATUS_SANKHYA ?? raw.status_sankhya ?? null;
    if (
      sankhya != null &&
      String(sankhya).trim() !== "" &&
      String(sankhya).trim().toLowerCase() !== "sucesso"
    ) {
      return false;
    }
    return true;
  },

  /**
   * Pedido diário real: 1 linha por OS + produto + dia local.
   * Remove duplicatas do webhook Sankhya (mesmo pedido repetido N vezes).
   */
  dedupeGestaoRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return [];
    const seen = new Set();
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const os = row.id != null && String(row.id).trim() !== "" ? String(row.id).trim() : `row:${i}`;
      const produto = String(row.produto_requisitado_id || "").trim();
      const dia = this.toLocalDateStr(row.data_pedido_sankhya) || "";
      if (!produto || !dia) continue;
      const key = `${os}|${produto}|${dia}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
    return out;
  },

  isCqeMotivoTeste(motivo) {
    const norm = String(motivo || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[.,;:!?\s]+$/g, "")
      .trim();
    return norm === "teste";
  },

  /**
   * Catálogo oficial de motivos de reprovação (CQE / CQE Gestão).
   * Homolog: normaliza motivo livre → Categoria · Item.
   */
  CQE_MOTIVOS_REPROVACAO: [
    { categoria: "Alimentação e Energia", item: "Liga/Desliga", keys: ["liga/desliga", "liga desliga", "nao liga", "não liga", "desliga", "power on", "power off"] },
    { categoria: "Alimentação e Energia", item: "Bateria", keys: ["bateria", "battery", "autonomia"] },
    { categoria: "Alimentação e Energia", item: "Carregamento", keys: ["carregamento", "carregador", "carga", "conector carga", "usb-c", "usb c"] },
    { categoria: "Tela", item: "Display", keys: ["display", "tela", "lcd", "oled", "mancha", "image burn", "imagem"] },
    { categoria: "Tela", item: "Touch", keys: ["touch", "toque", "touchscreen", "digitador"] },
    { categoria: "Biometria", item: "Face ID", keys: ["face id", "faceid", "reconhecimento facial", "true depth"] },
    { categoria: "Biometria", item: "Fingerprint", keys: ["fingerprint", "biometria", "digital", "sensor digital", "leitor digital"] },
    { categoria: "Câmeras", item: "Traseira", keys: ["camera traseira", "câmera traseira", "traseira", "camera back", "cam traseira"] },
    { categoria: "Câmeras", item: "Frontal", keys: ["camera frontal", "câmera frontal", "frontal", "selfie"] },
    { categoria: "Câmeras", item: "Lentes", keys: ["lente", "lentes", "vidro camera", "vidro câmera"] },
    { categoria: "Câmeras", item: "Molduras", keys: ["moldura", "molduras", "aro camera", "aro câmera"] },
    { categoria: "Áudio", item: "Speaker", keys: ["speaker", "alto falante", "alto-falante", "altofalante", "som externo"] },
    { categoria: "Áudio", item: "Auricular", keys: ["auricular", "earpiece", "fone interno"] },
    { categoria: "Áudio", item: "Microfone", keys: ["microfone", "mic ", "microfone"] },
    { categoria: "Vibração", item: "Vibracall", keys: ["vibracall", "vibracao", "vibração", "vibra", "taptic"] },
    { categoria: "Botões", item: "Power", keys: ["botao power", "botão power", "power", "botao liga", "botão liga"] },
    { categoria: "Botões", item: "Volume", keys: ["volume", "botao volume", "botão volume"] },
    { categoria: "Botões", item: "Home/Bixby", keys: ["home/bixby", "home", "bixby", "botao home", "botão home"] },
    { categoria: "Conectividade", item: "Rede Móvel", keys: ["rede movel", "rede móvel", "sinal", "chip", "4g", "5g", "gsm", "antenna", "antena"] },
    { categoria: "Conectividade", item: "Wi-Fi", keys: ["wi-fi", "wifi", "wlan"] },
    { categoria: "Conectividade", item: "Bluetooth", keys: ["bluetooth", "bt "] },
    { categoria: "Conectividade", item: "NFC", keys: ["nfc"] },
    { categoria: "Conectividade", item: "GPS", keys: ["gps", "localizacao", "localização"] },
    { categoria: "Gaveta de Chip", item: "Slot", keys: ["gaveta", "slot", "bandeja", "sim tray", "chip tray"] },
    { categoria: "Carcaça", item: "Estrutura", keys: ["carcaca", "carcaça", "estrutura", "chassi", "frame", "lateral"] },
    { categoria: "Tampa", item: "Acabamento", keys: ["tampa", "acabamento", "traseira estetica", "descasca", "pintura"] },
    { categoria: "Software", item: "Sistema", keys: ["software", "sistema", "ios", "android", "firmware", "bootloop", "travando"] },
    { categoria: "Sensores", item: "Hardware", keys: ["sensor", "sensores", "proximidade", "giroscopio", "giroscópio", "acelerometro", "acelerômetro", "hardware"] }
  ],

  normCqeMotivoText(motivo) {
    return String(motivo || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  },

  /** Homolog: mapeia texto livre → catálogo. Produção: retorna null (sem match forçado). */
  matchCqeMotivoCatalog(motivo) {
    const text = this.normCqeMotivoText(motivo);
    if (!text || text === "sem motivo informado" || text === "teste") return null;
    let best = null;
    let bestScore = 0;
    for (const row of this.CQE_MOTIVOS_REPROVACAO) {
      for (const key of row.keys) {
        const k = this.normCqeMotivoText(key);
        if (!k) continue;
        if (text === k || text.includes(k)) {
          const score = k.length;
          if (score > bestScore) {
            bestScore = score;
            best = row;
          }
        }
      }
    }
    return best;
  },

  normalizeCqeMotivoReprovacao(motivo) {
    const raw = String(motivo || "").trim() || "Sem motivo informado";
    if (!this.useHomologData()) {
      return {
        raw,
        categoria: null,
        item: null,
        label: raw,
        matched: false
      };
    }
    const hit = this.matchCqeMotivoCatalog(raw);
    if (!hit) {
      return {
        raw,
        categoria: null,
        item: null,
        label: raw,
        matched: false
      };
    }
    return {
      raw,
      categoria: hit.categoria,
      item: hit.item,
      label: `${hit.categoria} · ${hit.item}`,
      matched: true
    };
  },

  /** Gráfico/funil de motivos CQE — label completo (catálogo em homolog; texto integral em produção). */
  cqeMotivoChartKey(motivo) {
    const label = this.normalizeCqeMotivoReprovacao(motivo).label;
    return String(label || motivo || "").trim() || "Sem motivo informado";
  },

  resolveCqeGravidade(motivo, categoria = null) {
    const cat = this.normCqeMotivoText(categoria || "");
    if (cat) {
      if (["alimentacao e energia", "tela", "software", "sensores"].includes(cat)) return "Alta";
      if (["cameras", "audio", "conectividade", "biometria"].includes(cat)) return "Média";
      if (["tampa", "carcaca", "gaveta de chip", "botoes", "vibracao"].includes(cat)) return "Baixa";
    }
    const m = this.normCqeMotivoText(motivo);
    if (/tela|display|nao liga|curto|sucat|placa|oxid|software|sistema/.test(m)) return "Alta";
    if (/botao|conector|camera|audio|microfone|carreg|wifi|bluetooth|nfc|gps/.test(m)) return "Média";
    if (/arranh|estet|limpeza|capa|adesiv|tampa|acabamento/.test(m)) return "Baixa";
    return "Média";
  },

  normCqeUserKey(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  },

  /** Inspetores de qualidade — reprovações contam como Usuario X nos gráficos de reparo. */
  CQE_USUARIOS_REPROV_X: new Set(["fran romao", "renata emely"]),

  CQE_USUARIOS_EXCLUIDOS_REPROV: new Set([
    "ewerton souza",
    "ewerton souza implantacao log smart",
    "helen",
    "bruno marcos",
    "josefa alves"
  ]),

  bucketCqeUsuarioReprov(nome) {
    const k = this.normCqeUserKey(nome);
    if (this.CQE_USUARIOS_REPROV_X.has(k)) return "Usuario X";
    return String(nome || "—").trim() || "—";
  },

  isCqeUsuarioReprovContavel(nome) {
    const k = this.normCqeUserKey(nome);
    if (!k || k === "—") return false;
    if (this.CQE_USUARIOS_EXCLUIDOS_REPROV.has(k)) return false;
    return true;
  },

  matchesCqeUsuarioReprovBucket(usuarioFinal, bucket) {
    if (bucket === "Usuario X") {
      return this.CQE_USUARIOS_REPROV_X.has(this.normCqeUserKey(usuarioFinal));
    }
    return String(usuarioFinal || "").trim() === bucket;
  },

  aggregateCqeTaxaReprovTecnico(rows) {
    const stats = new Map();
    rows.forEach((r) => {
      if (!this.isCqeUsuarioReprovContavel(r.usuario_final)) return;
      const nome = this.bucketCqeUsuarioReprov(r.usuario_final);
      if (!stats.has(nome)) stats.set(nome, { a: 0, r: 0 });
      const t = stats.get(nome);
      if (r.decisao === "aprovado") t.a++;
      else if (r.decisao === "reprovado") t.r++;
    });
    return [...stats.entries()]
      .map(([nome, t]) => {
        const total = t.a + t.r;
        const pct = total ? (t.r / total) * 100 : 0;
        return { nome, pct, reprov: t.r, total };
      })
      .filter((x) => x.total > 0)
      .sort((a, b) => b.pct - a.pct || b.reprov - a.reprov);
  },

  /** CQE: data da inspeção (campo Data_qualidade). Fallback para datas legadas. */
  resolveCqeQualidadeDate(raw, decisao = null) {
    if (!raw || typeof raw !== "object") return null;
    const qualidade =
      raw.Data_qualidade ??
      raw.data_qualidade ??
      raw.DATA_QUALIDADE ??
      null;
    if (qualidade) return qualidade;
    return this.resolveCqeDate(raw, decisao);
  },

  /** CQE: aprovado → DATA_PEDIDO_SANKHYA; reprovado → Fim do Reparo (data da inspeção). */
  resolveCqeDate(raw, decisao = null) {
    if (!raw || typeof raw !== "object") return null;
    const fim = raw["Fim do Reparo"] || null;
    const sankhya = raw.DATA_PEDIDO_SANKHYA || raw.data_pedido_sankhya || null;
    let dec = String(decisao || "").trim().toLowerCase();
    if (!dec && raw.decisao) {
      const v = String(raw.decisao).trim().toLowerCase();
      if (v.includes("reprov")) dec = "reprovado";
      else if (v.includes("aprov")) dec = "aprovado";
    }
    if (dec === "reprovado") return fim || sankhya || null;
    return sankhya || fim || null;
  },

  /** CQE: ignora reprovação com motivo "teste"; mesmo id no dia conta 1x por decisão (aprovado e reprovado separados). */
  processCqeRows(rows, dateField = "data_qualidade") {
    const seen = new Set();
    const result = [];

    rows.forEach((row) => {
      if (row.decisao === "reprovado" && this.isCqeMotivoTeste(row.motivo)) return;

      const id = row.id != null && String(row.id).trim() !== "" ? String(row.id).trim() : null;
      if (id) {
        const day = this.toLocalDateStr(row[dateField]);
        const key = `${id}|${day}|${row.decisao}`;
        if (seen.has(key)) return;
        seen.add(key);
      }

      result.push(row);
    });

    return result;
  },

  /** Mantém um registro por ID (última ocorrência prevalece). */
  distinctById(rows, idField = "id") {
    const map = new Map();
    const noId = [];
    rows.forEach((row) => {
      const rawId = row?.[idField];
      if (rawId == null || String(rawId).trim() === "") {
        noId.push(row);
        return;
      }
      map.set(String(rawId).trim(), row);
    });
    return [...map.values(), ...noId];
  },

  filterByDateField(rows, start, end, field) {
    return rows.filter((r) => {
      const raw = r[field];
      if (!raw) return false;
      const local = this.toLocalDateStr(raw);
      return local >= start && local <= end;
    });
  },

  filterByAnyDateField(rows, start, end, fields) {
    return rows.filter((r) =>
      fields.some((field) => {
        const raw = r[field];
        if (!raw) return false;
        const local = this.toLocalDateStr(raw);
        return local >= start && local <= end;
      })
    );
  },

  aggregateCount(rows, keyFn) {
    const map = new Map();
    rows.forEach((r) => {
      const key = keyFn(r);
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  },

  /** Hora do timestamp. UTC legado (+1 no rótulo); useLocal=true usa hora real do navegador. */
  hourBucketFromIso(iso, useLocal = false) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const h = useLocal ? d.getHours() : d.getUTCHours();
    return useLocal ? h : h + 1;
  },

  /** Faixas horárias. Com useLocal: 08:00–08:59 → 08h. Sem useLocal (UTC legado): +1 no rótulo. */
  aggregateHourBuckets(rows, dateField, fromHour = 8, toHour = 17, options = {}) {
    const useLocal = !!options.useLocal;
    const skip = new Set(options.skipHours || []);
    const firstBucket = useLocal ? fromHour : fromHour + 1;
    const counts = new Map();
    for (let b = firstBucket; b <= toHour; b++) {
      if (!skip.has(b)) counts.set(b, 0);
    }

    rows.forEach((row) => {
      const raw = row[dateField];
      if (!raw) return;
      const bucket = this.hourBucketFromIso(raw, useLocal);
      if (bucket == null || skip.has(bucket)) return;
      if (bucket >= firstBucket && bucket <= toHour) {
        counts.set(bucket, (counts.get(bucket) || 0) + 1);
      }
    });

    return [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([hour, count]) => [`${String(hour).padStart(2, "0")}h`, count]);
  },

  getCurrentHourBucket(fromHour = 8, toHour = 17, useLocal = false) {
    const h = useLocal ? new Date().getHours() : new Date().getUTCHours();
    const bucket = useLocal ? h : h + 1;
    const firstBucket = useLocal ? fromHour : fromHour + 1;
    if (bucket < firstBucket) return firstBucket - 1;
    if (bucket > toHour) return toHour;
    return bucket;
  },

  /** Oculta linha/rótulo das horas futuras quando o período inclui hoje. */
  maskFutureHourLineValues(byHour, endDate, fromHour = 8, toHour = 17, options = {}) {
    if (endDate !== this.todayISO()) {
      return byHour.map(([, count]) => count);
    }
    const currentBucket = this.getCurrentHourBucket(fromHour, toHour, !!options.useLocal);
    return byHour.map(([label, count]) => {
      const hour = parseInt(label, 10);
      return hour > currentBucket ? null : count;
    });
  },

  normalizeBrandToken(word) {
    return String(word || "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase();
  },

  isGenericBrandPrefix(word) {
    const key = this.normalizeBrandToken(word);
    return key === "APARELHOS" || key === "APARELHO";
  },

  /** Primeira palavra útil da descrição; pula prefixos genéricos (APARELHOS). */
  resolveBrandWord(text) {
    if (!text || text === "—") return null;
    const words = String(text).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    let idx = 0;
    while (idx < words.length - 1 && this.isGenericBrandPrefix(words[idx])) idx++;
    return words[idx] || null;
  },

  extractFirstWord(text) {
    return this.resolveBrandWord(text) || "Outros";
  },

  normalizeBrandName(text) {
    const first = this.resolveBrandWord(text);
    if (!first) return "Outros";
    const key = String(first).toUpperCase();
    const aliases = { XIAMO: "XIAOMI" };
    return aliases[key] || key;
  },

  titleCaseWords(name) {
    if (!name || name === "—") return name ?? "—";
    return String(name)
      .trim()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  },

  shortName(fullName) {
    if (!fullName || fullName === "—") return "—";
    return this.titleCaseWords(String(fullName).trim().split(/\s+/).slice(0, 2).join(" "));
  },

  USER_NAME_ALIASES: [
    { from: "ewerton souza implantação log smart", to: "Helen" },
    { from: "ewerton souza implantacao log smart", to: "Helen" },
    { from: "fran", to: "Fran Romão" },
    { from: "fran romao", to: "Fran Romão" },
    { from: "fran romão", to: "Fran Romão" },
    { from: "sheila", to: "Sheila Ferreira" },
    { from: "sheila ferreira", to: "Sheila Ferreira" }
  ],

  normalizeUserName(name) {
    if (name == null || name === "—") return name ?? "—";
    const trimmed = String(name).trim();
    const norm = trimmed
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    for (const { from, to } of this.USER_NAME_ALIASES) {
      const fromNorm = from
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      if (norm === fromNorm) return to;
    }
    return this.titleCaseWords(trimmed);
  },

  showStatus(el, msg, isError) {
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
    el.classList.toggle("error", !!isError);
  },

  _autoRefreshTimer: null,
  _autoRefreshBusy: false,
  _autoRefreshFn: null,
  _refreshCycleMeta: null,
  _fetchCache: {},
  _fetchInflight: {},
  _idbPromise: null,
  _jsonWorker: null,
  _lastFetchAt: 0,
  _initialLoadTimer: null,
  _slotCountdownTimer: null,
  _dayRolloverState: null,
  _dayWatchTimer: null,

  getRefreshCycleIndex() {
    const page = (location.pathname.split("/").pop() || "").split("?")[0];
    const idx = this.REFRESH_CYCLE_PAGES.indexOf(page);
    return idx >= 0 ? idx : -1;
  },

  getRefreshCycleMeta() {
    const index = this.getRefreshCycleIndex();
    if (index < 0) return null;
    const total = this.REFRESH_CYCLE_PAGES.length;
    return {
      index,
      total,
      slotMs: this.REFRESH_SLOT_MS,
      cycleMs: total * this.REFRESH_SLOT_MS
    };
  },

  msUntilNextRefreshSlot(index) {
    const slotMs = this.REFRESH_SLOT_MS;
    const cycleMs = this.REFRESH_CYCLE_PAGES.length * slotMs;
    const posInCycle = Date.now() % cycleMs;
    const slotStart = index * slotMs;
    const slotEnd = slotStart + slotMs;
    if (posInCycle >= slotStart && posInCycle < slotEnd) return 0;
    if (posInCycle < slotStart) return slotStart - posInCycle;
    return cycleMs - posInCycle + slotStart;
  },

  clearSlotCountdown() {
    if (this._slotCountdownTimer) {
      clearTimeout(this._slotCountdownTimer);
      this._slotCountdownTimer = null;
    }
  },

  showSlotCountdown(delayMs, meta) {
    this._ensureRefreshClock();
    const el = document.getElementById("lastRefresh");
    if (!el) return;
    const endAt = Date.now() + delayMs;
    const update = () => {
      const left = Math.max(0, endAt - Date.now());
      const sec = Math.ceil(left / 1000);
      el.textContent = `Aguardando slot ${meta.index + 1}/${meta.total} · ${sec}s`;
      if (left > 0) this._slotCountdownTimer = setTimeout(update, 1000);
    };
    this.clearSlotCountdown();
    update();
  },

  scheduleInitialLoad(reloadFn) {
    if (!reloadFn) return;
    const cycleMeta = this.getRefreshCycleMeta();
    if (cycleMeta) this._refreshCycleMeta = cycleMeta;
    reloadFn();
  },

  _fetchCacheKey(url) {
    return String(url).split("?")[0];
  },

  isReparoWebhook(url) {
    const u = String(url);
    return (
      u.includes("/webhook/fi") ||
      u.includes("8d085005") ||
      u.includes("8407c7c4") ||
      u.includes("30e00080")
    );
  },

  isRecebimentoWebhook(url) {
    const u = String(url);
    return u.includes("f16be280") || u.includes("661802e8") || u.includes("78441d8b");
  },

  getFetchCacheTtl(url) {
    if (this.isReparoWebhook(url)) return this.FETCH_IDB_TTL_MS;
    if (this.isRecebimentoWebhook(url)) return this.FETCH_IDB_TTL_MS;
    return this.FETCH_CACHE_TTL_MS;
  },

  _getJsonWorker() {
    // Worker one-shot por parse (evita hang com vários fetchWebhook em paralelo)
    try {
      return new Worker("skyline-json-worker.js?v=3");
    } catch {
      return null;
    }
  },

  parseJsonAsync(text) {
    const payload = String(text ?? "");
    if (payload.length < this.JSON_WORKER_MIN_CHARS) {
      return Promise.resolve(JSON.parse(payload));
    }
    const worker = this._getJsonWorker();
    if (!worker) {
      return Promise.resolve(JSON.parse(payload));
    }
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (fn) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          worker.terminate();
        } catch {
          /* ignore */
        }
        fn();
      };
      const fallbackMain = () => {
        try {
          resolve(JSON.parse(payload));
        } catch (err) {
          reject(err);
        }
      };
      // Se o Worker travar/cache antigo sem id, não deixa a página eternamente em loading
      const timer = setTimeout(() => finish(fallbackMain), 20000);
      worker.onmessage = (event) => {
        const data = event.data;
        if (data && data.ok) finish(() => resolve(data.data));
        else finish(() => reject(new Error(data?.error || "Resposta inválida (não é JSON)")));
      };
      worker.onerror = () => finish(fallbackMain);
      try {
        worker.postMessage({ id: 1, text: payload });
      } catch {
        finish(fallbackMain);
      }
    });
  },

  /** Pré-carrega APIs em background (ex.: menu antes de abrir um dashboard). */
  warmCaches() {
    if (this.useHomologData()) return;
    [this.API_REPARO, this.API_RECEBIMENTO, this.API_MOVIMENTACOES, this.API_PECAS].forEach((url) => {
      const key = this._fetchCacheKey(url);
      this._readFetchCache(key, this.getFetchCacheTtl(url)).then((cached) => {
        if (cached || this._fetchInflight[key]) return;
        this.fetchWebhook(url).catch(() => {});
      });
    });
  },

  clearFetchCache() {
    this._fetchCache = {};
    this._clearIdbFetchCache();
  },

  _initIdb() {
    if (this._idbPromise) return this._idbPromise;
    if (typeof indexedDB === "undefined") {
      this._idbPromise = Promise.resolve(null);
      return this._idbPromise;
    }
    this._idbPromise = new Promise((resolve) => {
      const req = indexedDB.open("skyline-dash-cache", 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("fetch", { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    return this._idbPromise;
  },

  async _idbGetFetch(key) {
    try {
      const db = await this._initIdb();
      if (!db) return null;
      return await new Promise((resolve) => {
        const tx = db.transaction("fetch", "readonly");
        const req = tx.objectStore("fetch").get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  },

  async _idbSetFetch(key, data, at) {
    try {
      const db = await this._initIdb();
      if (!db) return;
      await new Promise((resolve) => {
        const tx = db.transaction("fetch", "readwrite");
        tx.objectStore("fetch").put({ key, data, at });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      /* quota / TV sem IDB */
    }
  },

  _clearIdbFetchCache() {
    this._initIdb().then((db) => {
      if (!db) return;
      try {
        db.transaction("fetch", "readwrite").objectStore("fetch").clear();
      } catch {
        /* ignore */
      }
    });
  },

  async _readFetchCache(key, ttlMs) {
    const now = Date.now();
    const mem = this._fetchCache[key];
    if (mem && now - mem.at < ttlMs) return mem;

    const idb = await this._idbGetFetch(key);
    if (idb && now - idb.at < this.FETCH_IDB_TTL_MS) {
      this._fetchCache[key] = { data: idb.data, at: idb.at };
      if (now - idb.at < ttlMs) return this._fetchCache[key];
    }
    return idb && now - idb.at < this.FETCH_IDB_TTL_MS ? idb : null;
  },

  _ensureRefreshClock() {
    if (document.getElementById("lastRefresh")) return;
    const el = document.createElement("span");
    el.id = "lastRefresh";
    el.className = "last-refresh";
    const anchor = document.querySelector(".dash-toolbar") || document.querySelector(".page");
    anchor?.appendChild(el);
  },

  markRefresh() {
    this._ensureRefreshClock();
    const el = document.getElementById("lastRefresh");
    if (!el) return;
    const now = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const meta = this._refreshCycleMeta || this.getRefreshCycleMeta();
    if (meta) {
      const everyMin = meta.cycleMs / 60000;
      el.textContent =
        `Atualizado às ${now} · ciclo 30s (${meta.index + 1}/${meta.total}) · recarga a cada ${everyMin} min`;
    } else {
      el.textContent = `Atualizado às ${now} · auto 30s`;
    }
  },

  stopAutoRefresh() {
    if (this._autoRefreshTimer) {
      clearTimeout(this._autoRefreshTimer);
      this._autoRefreshTimer = null;
    }
  },

  checkDayRollover() {
    const state = this._dayRolloverState;
    if (!state) return false;

    const hoje = this.todayISO();
    if (hoje === state.lastDay) return false;

    state.lastDay = hoje;
    if (state.startEl) state.startEl.value = hoje;
    if (state.endEl) state.endEl.value = hoje;
    return true;
  },

  startDayWatch() {
    if (this._dayWatchTimer) clearInterval(this._dayWatchTimer);

    this._dayWatchTimer = setInterval(() => {
      if (!this.checkDayRollover()) return;
      const { reload, onChange } = this._dayRolloverState || {};
      if (reload) reload();
      else onChange?.();
    }, 60000);
  },

  startAutoRefresh(fn, intervalMs = 30000) {
    this.stopAutoRefresh();
    if (!fn || intervalMs <= 0) return;

    this._ensureRefreshClock();
    const cycleMeta = this.getRefreshCycleMeta();
    this._refreshCycleMeta = cycleMeta;

    const run = async () => {
      if (this._autoRefreshBusy) return;
      this._autoRefreshBusy = true;
      try {
        if (typeof SkylineVersion !== "undefined") await SkylineVersion.check();
        this.checkDayRollover();
        await Promise.resolve(fn());
      } catch (err) {
        console.error("[SkylineDash] auto-refresh:", err);
      } finally {
        this._autoRefreshBusy = false;
      }
    };

    this._autoRefreshFn = run;

    const schedule = (delayMs) => {
      this._autoRefreshTimer = setTimeout(async () => {
        await run();
        schedule(cycleMeta ? cycleMeta.cycleMs : intervalMs);
      }, delayMs);
    };

    schedule(cycleMeta ? this.msUntilNextRefreshSlot(cycleMeta.index) : intervalMs);

    if (!this._visibilityBound) {
      this._visibilityBound = true;
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) return;
        if (typeof SkylineVersion !== "undefined") SkylineVersion.check();
        const dayChanged = this.checkDayRollover();
        const { reload, onChange } = this._dayRolloverState || {};
        if (dayChanged && reload) reload();
        else if (dayChanged && onChange) onChange();
        else if (this._autoRefreshFn) {
          const ttl = Math.max(this.FETCH_CACHE_TTL_MS, this.FETCH_IDB_TTL_MS);
          if (Date.now() - this._lastFetchAt < ttl) return;
          this._autoRefreshFn();
        }
      });
    }
  },

  bindDateFilters({ onChange, onToday, onReload, autoRefreshMs = 30000 }) {
    const startEl = document.getElementById("dateStart");
    const endEl = document.getElementById("dateEnd");
    const today = this.todayISO();
    if (startEl) startEl.value = today;
    if (endEl) endEl.value = today;

    const reload = onReload
      ? async () => {
          await Promise.resolve(onReload());
          this.markRefresh();
        }
      : null;

    this._dayRolloverState = { lastDay: today, startEl, endEl, onChange, reload };
    this.startDayWatch();

    document.getElementById("btnApply")?.addEventListener("click", onChange);
    document.getElementById("btnToday")?.addEventListener("click", () => {
      const hoje = this.todayISO();
      if (startEl) startEl.value = hoje;
      if (endEl) endEl.value = hoje;
      if (this._dayRolloverState) this._dayRolloverState.lastDay = hoje;
      onToday?.() ?? onChange();
    });
    document.getElementById("btnReload")?.addEventListener("click", () => {
      this.clearFetchCache();
      reload?.();
    });
    startEl?.addEventListener("change", onChange);
    endEl?.addEventListener("change", onChange);

    if (reload) {
      this.startAutoRefresh(reload, autoRefreshMs);
      this.scheduleInitialLoad(reload);
    }

    return { startEl, endEl, reload };
  },

  getDateRange() {
    const start = document.getElementById("dateStart")?.value;
    const end = document.getElementById("dateEnd")?.value;
    return { start, end };
  },

  async fetchWebhook(url, timeoutMs = this.DEFAULT_FETCH_TIMEOUT_MS, options = {}) {
    await this.ensureCacheVersion();
    const force = !!options.force;
    if (this.useHomologData()) {
      return this._fetchWebhookRaw(url, timeoutMs, true);
    }

    const key = this._fetchCacheKey(url);
    const ttlMs = this.getFetchCacheTtl(url);

    if (!force) {
      const cached = await this._readFetchCache(key, ttlMs);
      if (cached) return cached.data;
    }

    if (this._fetchInflight[key]) {
      return this._fetchInflight[key];
    }

    const promise = this._fetchWebhookRaw(url, timeoutMs, false)
      .then(async (data) => {
        const at = Date.now();
        this._fetchCache[key] = { data, at };
        this._lastFetchAt = at;
        await this._idbSetFetch(key, data, at);
        return data;
      })
      .catch(async (err) => {
        const stale = await this._readFetchCache(key, this.FETCH_IDB_TTL_MS);
        if (stale) {
          console.warn("[SkylineDash] usando cache após falha:", err.message);
          return stale.data;
        }
        throw err;
      })
      .finally(() => {
        delete this._fetchInflight[key];
      });

    this._fetchInflight[key] = promise;
    return promise;
  },

  async _fetchLiveWebhook(url, timeoutMs) {
    const sep = url.includes("?") ? "&" : "?";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${url}${sep}_t=${Date.now()}`, {
        cache: "no-store",
        mode: "cors",
        signal: controller.signal,
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      try {
        return await this.parseJsonAsync(text);
      } catch {
        throw new Error("Resposta inválida (não é JSON)");
      }
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error(`Timeout ao carregar dados (${Math.round(timeoutMs / 1000)}s)`);
      }
      if (String(err.message || err).includes("Failed to fetch")) {
        throw new Error("Falha de rede ou CORS — verifique conexão e atualize a página");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },

  async _fetchWebhookRaw(url, timeoutMs, homologOnly) {
    if (homologOnly || this.useHomologData()) {
      const fixture = this.homologFixtureFor(url);
      if (fixture) {
        try {
          const res = await fetch(`${fixture}?_t=${Date.now()}`, {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache", Pragma: "no-cache" }
          });
          if (res.ok) {
            const text = await res.text();
            try {
              return await this.parseJsonAsync(text);
            } catch {
              throw new Error(`Fixture inválido (não é JSON): ${fixture}`);
            }
          }
          // Pages não publica data/homolog/*.json (gitignored) — cai na API real.
          console.warn(`[SkylineDash] fixture ${fixture} HTTP ${res.status}; usando API real`);
        } catch (err) {
          if (String(err.message || "").includes("Fixture inválido")) throw err;
          console.warn(`[SkylineDash] fixture ${fixture} falhou; usando API real`, err);
        }
      } else if (homologOnly) {
        // Sem fixture e sem fallback permitido explicitamente
        throw new Error("Sem fixture local para este endpoint.");
      }
      // Homolog com máscaras de UI + dados ao vivo quando fixture não existe
      return this._fetchLiveWebhook(url, timeoutMs);
    }

    return this._fetchLiveWebhook(url, timeoutMs);
  },

  formatDuration(ms) {
    if (!ms || ms < 0) return "0h 00m";
    const mins = Math.floor(ms / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${String(m).padStart(2, "0")}m`;
  },

  createBarChart(canvasId, chartRef, labels, values, color = "#694992") {
    const hasData = values.some((v) => v > 0);
    if (chartRef) chartRef.destroy();

    return new Chart(document.getElementById(canvasId), {
      type: "bar",
      data: {
        labels: labels.length ? labels : ["Nenhum registro"],
        datasets: [{
          label: "Quantidade",
          data: values.length ? values : [0],
          backgroundColor: labels.length ? color : "rgba(105, 73, 146, 0.25)",
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: {
            display: (ctx) => hasData && Number(ctx.dataset.data[ctx.dataIndex]) > 0,
            anchor: "center",
            align: "center",
            color: "#ffffff",
            font: { weight: "700", size: 14 },
            formatter: (value) => value
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1, precision: 0, color: "#6b5b7a" },
            grid: { color: "#e8e0f0" }
          },
          x: {
            ticks: { maxRotation: 45, minRotation: 0, font: { size: 11 }, color: "#2d1f42" },
            grid: { display: false }
          }
        }
      }
    });
  },

  createLineChart(canvasId, chartRef, labels, values, color = "#694992") {
    const hasData = values.some((v) => v != null && v > 0);
    if (chartRef) chartRef.destroy();

    return new Chart(document.getElementById(canvasId), {
      type: "line",
      data: {
        labels: labels.length ? labels : ["Nenhum registro"],
        datasets: [{
          label: "Quantidade",
          data: values.length ? values : [0],
          borderColor: color,
          backgroundColor: color,
          pointBackgroundColor: color,
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
          pointRadius: (ctx) => (ctx.raw == null ? 0 : 5),
          pointHoverRadius: (ctx) => (ctx.raw == null ? 0 : 6),
          borderWidth: 2,
          tension: 0.25,
          spanGaps: false,
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 24 } },
        plugins: {
          legend: { display: false },
          datalabels: {
            display: (ctx) => {
              const value = ctx.dataset.data[ctx.dataIndex];
              return hasData && value != null && Number(value) > 0;
            },
            anchor: "end",
            align: "top",
            offset: 4,
            color,
            font: { weight: "700", size: 12 },
            formatter: (value) => value
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1, precision: 0, color: "#6b5b7a" },
            grid: { color: "#e8e0f0" }
          },
          x: {
            ticks: { maxRotation: 0, minRotation: 0, font: { size: 11 }, color: "#2d1f42" },
            grid: { display: false }
          }
        }
      }
    });
  },

  createPieChart(canvasId, chartRef, labels, values, colors) {
    const hasData = values.some((v) => v > 0);
    if (chartRef) chartRef.destroy();

    return new Chart(document.getElementById(canvasId), {
      type: "pie",
      data: {
        labels: labels.length ? labels : ["Nenhum registro"],
        datasets: [{
          data: values.length ? values : [1],
          backgroundColor: labels.length ? colors : ["#e8e0f0"]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#2d1f42", font: { size: 11 }, boxWidth: 14 }
          },
          datalabels: {
            display: (ctx) => hasData && Number(ctx.dataset.data[ctx.dataIndex]) > 0,
            color: "#ffffff",
            font: { weight: "700", size: 12 },
            formatter: (value, ctx) => {
              const sum = ctx.dataset.data.reduce((a, b) => a + b, 0);
              if (!sum) return "";
              const pct = Math.round((value / sum) * 100);
              return `${value} (${pct}%)`;
            }
          }
        }
      }
    });
  }
};

document.addEventListener("DOMContentLoaded", () => {
  SkylineDash.ensureCacheVersion();
  SkylineDash.initHomologBanner();
  SkylineDash.bindHomologLinks();
  if (typeof SkylineVersion !== "undefined") SkylineVersion.start(SkylineDash.REFRESH_SLOT_MS);
  const page = (location.pathname.split("/").pop() || "").split("?")[0];
  if (page === "menu.html" || page === "" || page === "index.html") {
    SkylineDash.warmCaches();
  }
});

SkylineDash.ensureCacheVersion();
