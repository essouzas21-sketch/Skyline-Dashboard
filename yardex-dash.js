/**
 * Utilitários compartilhados dos dashboards Yardex (menu principal).
 */
const YardexDash = {
  /** Reparo / triagem / gestão / CQE / produção (campos id, Iniciado_Reparo, decisao…) */
  API_REPARO: "https://automation.gruposkytech.com.br/webhook/8407c7c4-ba6d-49f9-b31f-d6d2ebddfeaf",
  /** Recebimento (campos hunit, data_add, grupo, descricao…) */
  API_RECEBIMENTO: "https://automation.gruposkytech.com.br/webhook/661802e8-eef7-4ca5-981b-645706f5afda",

  HOMOLOG_FIXTURES: {
    "8407c7c4-ba6d-49f9-b31f-d6d2ebddfeaf": "data/homolog/reparo.json",
    "661802e8-eef7-4ca5-981b-645706f5afda": "data/homolog/recebimento.json",
    "30e00080-9b5d-4db8-9d2a-e40d71b8cd5d": "data/homolog/reparo.json",
    "78441d8b-4c63-4299-be48-6017e086e474": "data/homolog/recebimento.json"
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
    "producao-iphone.html",
    "cqe.html",
    "consolidado.html"
  ],

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
    for (const [id, path] of Object.entries(this.HOMOLOG_FIXTURES)) {
      if (url.includes(id)) return path;
    }
    return null;
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
    for (const key of Object.keys(payload)) {
      if (Array.isArray(payload[key])) return payload[key];
    }
    return [];
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

  /** CQE: ignora reprovação com motivo "teste"; mesmo id no dia conta 1x por decisão. */
  processCqeRows(rows, dateField = "data_pedido_sankhya") {
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

  /** Hora do timestamp em UTC (DATA_PEDIDO_SANKHYA vem como …Z). 08:15Z → rótulo 09h. */
  hourBucketFromIso(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.getUTCHours() + 1;
  },

  /** Faixas 07h–17h UTC: 07:00–07:59Z conta em 08h, 08:00–08:59Z em 09h, etc. */
  aggregateHourBuckets(rows, dateField, fromHour = 7, toHour = 17) {
    const firstBucket = fromHour + 1;
    const counts = new Map();
    for (let b = firstBucket; b <= toHour; b++) counts.set(b, 0);

    rows.forEach((row) => {
      const raw = row[dateField];
      if (!raw) return;
      const bucket = this.hourBucketFromIso(raw);
      if (bucket == null) return;
      if (bucket >= firstBucket && bucket <= toHour) {
        counts.set(bucket, counts.get(bucket) + 1);
      }
    });

    return [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([hour, count]) => [`${String(hour).padStart(2, "0")}h`, count]);
  },

  getCurrentHourBucket(fromHour = 7, toHour = 17) {
    const bucket = new Date().getUTCHours() + 1;
    const firstBucket = fromHour + 1;
    if (bucket < firstBucket) return firstBucket - 1;
    if (bucket > toHour) return toHour;
    return bucket;
  },

  /** Oculta linha/rótulo das horas futuras quando o período inclui hoje. */
  maskFutureHourLineValues(byHour, endDate, fromHour = 7, toHour = 17) {
    if (endDate !== this.todayISO()) {
      return byHour.map(([, count]) => count);
    }
    const currentBucket = this.getCurrentHourBucket(fromHour, toHour);
    return byHour.map(([label, count]) => {
      const hour = parseInt(label, 10);
      return hour > currentBucket ? null : count;
    });
  },

  extractFirstWord(text) {
    if (!text || text === "—") return "Outros";
    const first = String(text).trim().split(/\s+/)[0];
    return first || "Outros";
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
    { from: "ewerton souza implantacao log smart", to: "Helen" }
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
    if (posInCycle < slotStart) return slotStart - posInCycle;
    return cycleMs - posInCycle + slotStart;
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
        if (typeof YardexVersion !== "undefined") await YardexVersion.check();
        this.checkDayRollover();
        await Promise.resolve(fn());
      } catch (err) {
        console.error("[YardexDash] auto-refresh:", err);
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
        if (typeof YardexVersion !== "undefined") YardexVersion.check();
        const dayChanged = this.checkDayRollover();
        const { reload, onChange } = this._dayRolloverState || {};
        if (dayChanged && reload) reload();
        else if (dayChanged && onChange) onChange();
        else if (this._autoRefreshFn) this._autoRefreshFn();
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
    document.getElementById("btnReload")?.addEventListener("click", () => reload?.());
    startEl?.addEventListener("change", onChange);
    endEl?.addEventListener("change", onChange);

    if (reload) this.startAutoRefresh(reload, autoRefreshMs);

    return { startEl, endEl, reload };
  },

  getDateRange() {
    const start = document.getElementById("dateStart")?.value;
    const end = document.getElementById("dateEnd")?.value;
    return { start, end };
  },

  async fetchWebhook(url, timeoutMs = 120000) {
    if (this.useHomologData()) {
      const fixture = this.homologFixtureFor(url);
      if (!fixture) throw new Error("Sem fixture local para este endpoint.");
      const res = await fetch(`${fixture}?_t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Fixture local HTTP ${res.status} (${fixture})`);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Fixture inválido (não é JSON): ${fixture}`);
      }
    }

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
        return JSON.parse(text);
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
  YardexDash.initHomologBanner();
  YardexDash.bindHomologLinks();
  if (typeof YardexVersion !== "undefined") YardexVersion.start(YardexDash.REFRESH_SLOT_MS);
});
