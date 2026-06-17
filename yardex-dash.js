/**
 * Utilitários compartilhados dos dashboards Yardex (menu principal).
 */
const YardexDash = {
  /** Reparo / triagem / gestão / CQE / produção (campos id, Iniciado_Reparo, decisao…) */
  API_REPARO: "https://automation.gruposkytech.com.br/webhook/8407c7c4-ba6d-49f9-b31f-d6d2ebddfeaf",
  /** Recebimento (campos hunit, data_add, grupo, descricao…) */
  API_RECEBIMENTO: "https://automation.gruposkytech.com.br/webhook/661802e8-eef7-4ca5-981b-645706f5afda",

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
    return String(motivo || "").trim().toLowerCase() === "teste";
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
  _dayRolloverState: null,
  _dayWatchTimer: null,

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
    el.textContent = `Atualizado às ${now} · auto 1 min`;
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

  startAutoRefresh(fn, intervalMs = 60000) {
    this.stopAutoRefresh();
    if (!fn || intervalMs <= 0) return;

    this._ensureRefreshClock();

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

    const schedule = () => {
      this._autoRefreshTimer = setTimeout(async () => {
        await run();
        schedule();
      }, intervalMs);
    };

    schedule();

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

  bindDateFilters({ onChange, onToday, onReload, autoRefreshMs = 60000 }) {
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
  if (typeof YardexVersion !== "undefined") YardexVersion.start(60000);
});
