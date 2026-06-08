/**
 * Utilitários compartilhados dos dashboards Yardex (menu principal).
 */
const YardexDash = {
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

  aggregateCount(rows, keyFn) {
    const map = new Map();
    rows.forEach((r) => {
      const key = keyFn(r);
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  },

  extractFirstWord(text) {
    if (!text || text === "—") return "Outros";
    const first = String(text).trim().split(/\s+/)[0];
    return first || "Outros";
  },

  shortName(fullName) {
    if (!fullName || fullName === "—") return "—";
    return String(fullName).trim().split(/\s+/).slice(0, 2).join(" ");
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

  startAutoRefresh(fn, intervalMs = 60000) {
    this.stopAutoRefresh();
    if (!fn || intervalMs <= 0) return;

    this._ensureRefreshClock();

    const run = async () => {
      if (this._autoRefreshBusy) return;
      this._autoRefreshBusy = true;
      try {
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
        if (!document.hidden && this._autoRefreshFn) this._autoRefreshFn();
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

    document.getElementById("btnApply")?.addEventListener("click", onChange);
    document.getElementById("btnToday")?.addEventListener("click", () => {
      const hoje = this.todayISO();
      if (startEl) startEl.value = hoje;
      if (endEl) endEl.value = hoje;
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

  async fetchWebhook(url) {
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${sep}_t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
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
