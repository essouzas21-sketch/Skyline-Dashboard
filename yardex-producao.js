/**
 * Dashboard de produção (Diversas Marcas / iPhone).
 */
const ProducaoDash = {
  USER_FILTERS: {
    diversas: [
      "claudia paz",
      "fernanda maria",
      "Francisco Chagas",
      "Karoline Alexandre",
      "keytman janaína",
      "Michelle Alves",
      "Viviane Ferreira"
    ],
    iphone: [
      "thaís mazoline",
      "noemi firmo",
      "fran dias"
    ]
  },

  /** Quadros da TV Diversas Marcas — consolidado usa USER_FILTERS.diversas (união). */
  DIVERSAS_PANELS: [
    {
      id: "q1",
      title: "Quadro 1",
      subtitle: "Claudia · Karoline · Francisco",
      users: [
        { match: "claudia paz", label: "Claudia" },
        { match: "Karoline Alexandre", label: "Karoline" },
        { match: "Francisco Chagas", label: "Francisco" }
      ]
    },
    {
      id: "q2",
      title: "Quadro 2",
      subtitle: "Viviane · Michele",
      users: [
        { match: "Viviane Ferreira", label: "Viviane" },
        { match: "Michelle Alves", label: "Michele" }
      ]
    },
    {
      id: "q3",
      title: "Quadro 3",
      subtitle: "Keithman · Fernanda",
      users: [
        { match: "keytman janaína", label: "Keithman" },
        { match: "fernanda maria", label: "Fernanda" }
      ]
    },
    {
      id: "q4",
      title: "Quadro 4",
      subtitle: "Reservado",
      users: []
    }
  ],

  DATE_FIELDS: ["iniciado_reparo", "retorno_1", "retorno_2", "retorno_3"],

  isFilled(v) {
    return v != null && String(v).trim() !== "" && String(v).toLowerCase() !== "null";
  },

  parseDt(v) {
    if (!this.isFilled(v)) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  },

  maxFilledPause(raw) {
    for (let n = 3; n >= 1; n--) {
      if (this.isFilled(raw[`${n} Pausa`])) return n;
    }
    return 0;
  },

  maxFilledRetorno(raw) {
    for (let n = 3; n >= 1; n--) {
      if (this.isFilled(raw[`${n} Retorno`])) return n;
    }
    return 0;
  },

  classify(raw) {
    if (this.isFilled(raw["Fim do Reparo"])) {
      return { status: "finalizado", user: raw["Usuario final"] || "—" };
    }
    const mp = this.maxFilledPause(raw);
    if (mp && !this.isFilled(raw[`${mp} Retorno`])) {
      return { status: "pausado", user: raw[`Usuario ${mp} pausa`] || "—" };
    }
    const mr = this.maxFilledRetorno(raw);
    if (mr) {
      return { status: "andamento", user: raw[`Usuario ${mr} retorno`] || "—" };
    }
    return { status: "andamento", user: raw["Usuario inicio"] || "—" };
  },

  pushWorkInterval(intervals, start, end) {
    if (!start || !end) return;
    const a = start.getTime();
    const b = end.getTime();
    if (b > a) intervals.push({ start: a, end: b });
  },

  getWorkIntervals(raw, nowMs = Date.now()) {
    const inicio = this.parseDt(raw["Iniciado_Reparo"]);
    if (!inicio) return [];

    const fim = this.parseDt(raw["Fim do Reparo"]);
    const mp = this.maxFilledPause(raw);
    const intervals = [];

    if (fim && mp === 0) {
      this.pushWorkInterval(intervals, inicio, fim);
      return intervals;
    }

    if (fim && mp > 0) {
      for (let i = 1; i <= mp; i++) {
        const pause = this.parseDt(raw[`${i} Pausa`]);
        const start = i === 1 ? inicio : this.parseDt(raw[`${i - 1} Retorno`]);
        this.pushWorkInterval(intervals, start, pause);
      }
      this.pushWorkInterval(intervals, this.parseDt(raw[`${mp} Retorno`]), fim);
      return intervals;
    }

    if (mp > 0 && !this.isFilled(raw[`${mp} Retorno`])) {
      for (let i = 1; i <= mp; i++) {
        const pause = this.parseDt(raw[`${i} Pausa`]);
        const start = i === 1 ? inicio : this.parseDt(raw[`${i - 1} Retorno`]);
        this.pushWorkInterval(intervals, start, pause);
      }
      return intervals;
    }

    const mr = this.maxFilledRetorno(raw);
    if (mr > 0) {
      for (let i = 1; i <= mr; i++) {
        const pause = this.parseDt(raw[`${i} Pausa`]);
        const start = i === 1 ? inicio : this.parseDt(raw[`${i - 1} Retorno`]);
        this.pushWorkInterval(intervals, start, pause);

        const ret = this.parseDt(raw[`${i} Retorno`]);
        const nextPause = this.parseDt(raw[`${i + 1} Pausa`]);
        const end = nextPause || new Date(nowMs);
        this.pushWorkInterval(intervals, ret, end);
      }
      return intervals;
    }

    this.pushWorkInterval(intervals, inicio, new Date(nowMs));
    return intervals;
  },

  periodBoundsMs(start, end) {
    return {
      start: new Date(`${start}T00:00:00`).getTime(),
      end: new Date(`${end}T23:59:59.999`).getTime()
    };
  },

  sumWorkIntervalsMs(intervals, periodStart = null, periodEnd = null) {
    let bounds = null;
    if (periodStart && periodEnd) {
      bounds = this.periodBoundsMs(periodStart, periodEnd);
    }
    return intervals.reduce((total, { start, end }) => {
      let a = start;
      let b = end;
      if (bounds) {
        a = Math.max(a, bounds.start);
        b = Math.min(b, bounds.end);
      }
      return total + Math.max(0, b - a);
    }, 0);
  },

  calcWorkMs(raw, nowMs = Date.now(), periodStart = null, periodEnd = null) {
    const intervals = this.getWorkIntervals(raw, nowMs);
    return this.sumWorkIntervalsMs(intervals, periodStart, periodEnd);
  },

  mapRow(raw) {
    const { status, user } = this.classify(raw);
    return {
      id: raw.id ?? null,
      iniciado_reparo: raw["Iniciado_Reparo"] || null,
      retorno_1: raw["1 Retorno"] || null,
      retorno_2: raw["2 Retorno"] || null,
      retorno_3: raw["3 Retorno"] || null,
      descricao: raw.descricao || "—",
      serial: raw.serial || "—",
      status,
      user: YardexDash.normalizeUserName(user || "—"),
      _workRaw: raw
    };
  },

  loadRows(json) {
    const mapped = YardexDash.normalizeRows(json)
      .map((raw) => this.mapRow(raw))
      .filter((r) => this.DATE_FIELDS.some((f) => r[f]));
    return YardexDash.distinctById(mapped, "id");
  },

  matchesUserFilter(user, userFilter) {
    if (!userFilter || !userFilter.length) return true;
    const norm = String(user).trim().toLowerCase();
    return userFilter.some((u) => norm.includes(String(u).trim().toLowerCase()));
  },

  filterRows(allRows, start, end, moduleKey, userFilterOverride = undefined) {
    const userFilter =
      userFilterOverride !== undefined
        ? userFilterOverride
        : this.USER_FILTERS[moduleKey] || null;
    let filtered = YardexDash.filterByAnyDateField(allRows, start, end, this.DATE_FIELDS);
    if (userFilter?.length) {
      filtered = filtered.filter((row) => this.matchesUserFilter(row.user, userFilter));
    }
    return filtered;
  },

  aggregatePanelUsers(filtered, panelUsers, start, end) {
    const rows = panelUsers.map((u) => ({
      user: u.label,
      finalizado: 0,
      andamento: 0,
      pausado: 0,
      total: 0,
      workMs: 0
    }));

    filtered.forEach((row) => {
      const idx = panelUsers.findIndex((u) => this.matchesUserFilter(row.user, [u.match]));
      if (idx < 0) return;
      const target = rows[idx];
      target[row.status]++;
      target.total++;
      target.workMs += this.calcWorkMs(row._workRaw, Date.now(), start, end);
    });

    return rows;
  },

  aggregatePanelUsers(filtered, panelUsers, start, end) {
    const rows = panelUsers.map((u) => ({
      user: u.label,
      finalizado: 0,
      andamento: 0,
      pausado: 0,
      total: 0,
      workMs: 0
    }));

    filtered.forEach((row) => {
      const idx = panelUsers.findIndex((u) => this.matchesUserFilter(row.user, [u.match]));
      if (idx < 0) return;
      const target = rows[idx];
      target[row.status]++;
      target.total++;
      target.workMs += this.calcWorkMs(row._workRaw, Date.now(), start, end);
    });

    return rows;
  },

  initDiversasPage(panelIndex) {
    const panel = this.DIVERSAS_PANELS[panelIndex];
    if (!panel) return;

    const API_URL = "https://datalake.yardex.pro:10000/webhook/30e00080-9b5d-4db8-9d2a-e40d71b8cd5d";
    const statusEl = document.getElementById("statusMsg");
    const userFilter = panel.users.map((u) => u.match);
    let allRows = [];

    const renderTable = (filtered, start, end) => {
      const tbody = document.getElementById("tableBody");
      const empty = document.getElementById("tableEmpty");
      if (!tbody || !empty) return;

      if (!panel.users.length) {
        tbody.innerHTML = "";
        empty.hidden = false;
        empty.textContent = "Sem colaboradores definidos.";
        return;
      }

      const list = this.aggregatePanelUsers(filtered, panel.users, start, end);
      empty.hidden = true;
      tbody.innerHTML = list
        .map(
          (u) => `
        <tr>
          <td>${u.user}</td>
          <td>${u.finalizado}</td>
          <td>${u.andamento}</td>
          <td>${u.pausado}</td>
          <td style="font-weight:700">${u.total}</td>
          <td style="font-weight:700;color:var(--bg)">${YardexDash.formatDuration(u.workMs)}</td>
        </tr>
      `
        )
        .join("");
    };

    const renderDashboard = () => {
      const { start, end } = YardexDash.getDateRange();
      if (!start || !end) return;
      if (start > end) {
        YardexDash.showStatus(statusEl, "A data inicial não pode ser maior que a data final.", true);
        return;
      }

      const filtered = this.filterRows(allRows, start, end, "diversas", userFilter);
      const totals = this.computeTotals(filtered);

      document.getElementById("kpiFinalizado").textContent = totals.finalizado;
      document.getElementById("kpiAndamento").textContent = totals.andamento;
      document.getElementById("kpiPausado").textContent = totals.pausado;
      document.getElementById("kpiTotal").textContent = totals.total;
      document.getElementById("periodLabel").textContent =
        `Período: ${YardexDash.formatPeriodBR(start, end)} · ${panel.subtitle} · tempo só no período filtrado`;

      renderTable(filtered, start, end);

      YardexDash.showStatus(
        statusEl,
        `Exibindo ${filtered.length} aparelho(s) no período · ${allRows.length} carregado(s).`,
        false
      );
    };

    const loadData = async () => {
      YardexDash.showStatus(statusEl, "Carregando dados do endpoint…", false);
      try {
        const json = await YardexDash.fetchWebhook(API_URL);
        allRows = this.loadRows(json);
        YardexDash.showStatus(statusEl, `${allRows.length} único(s) carregado(s).`, false);
        renderDashboard();
      } catch (err) {
        YardexDash.showStatus(statusEl, `Erro ao carregar: ${err.message}. Use http://localhost (CORS).`, true);
        ["kpiFinalizado", "kpiAndamento", "kpiPausado", "kpiTotal"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.textContent = "0";
        });
        const tbody = document.getElementById("tableBody");
        const empty = document.getElementById("tableEmpty");
        if (tbody) tbody.innerHTML = "";
        if (empty) empty.hidden = false;
      }
    };

    const { reload } = YardexDash.bindDateFilters({ onChange: renderDashboard, onReload: loadData });
    reload();
  },

  computeTotals(filtered) {
    const totals = { finalizado: 0, andamento: 0, pausado: 0, total: 0 };
    filtered.forEach((row) => {
      totals[row.status]++;
      totals.total++;
    });
    return totals;
  },

  init(moduleKey) {
    const API_URL = "https://datalake.yardex.pro:10000/webhook/30e00080-9b5d-4db8-9d2a-e40d71b8cd5d";
    const statusEl = document.getElementById("statusMsg");
    let allRows = [];

    const renderDashboard = () => {
      const { start, end } = YardexDash.getDateRange();
      if (!start || !end) return;
      if (start > end) {
        YardexDash.showStatus(statusEl, "A data inicial não pode ser maior que a data final.", true);
        return;
      }

      const filtered = this.filterRows(allRows, start, end, moduleKey);
      const totals = this.computeTotals(filtered);
      const byUser = new Map();

      filtered.forEach((row) => {
        const key = row.user;
        if (!byUser.has(key)) {
          byUser.set(key, { user: key, finalizado: 0, andamento: 0, pausado: 0, total: 0, workMs: 0 });
        }
        const u = byUser.get(key);
        u[row.status]++;
        u.total++;
        u.workMs += this.calcWorkMs(row._workRaw, Date.now(), start, end);
      });

      document.getElementById("kpiFinalizado").textContent = totals.finalizado;
      document.getElementById("kpiAndamento").textContent = totals.andamento;
      document.getElementById("kpiPausado").textContent = totals.pausado;
      document.getElementById("kpiTotal").textContent = totals.total;
      document.getElementById("periodLabel").textContent =
        `Período: ${YardexDash.formatPeriodBR(start, end)} · aparelhos no período · tempo só no período filtrado`;

      const tbody = document.getElementById("tableBody");
      const empty = document.getElementById("tableEmpty");
      const list = [...byUser.values()].sort((a, b) => b.total - a.total);

      if (!list.length) {
        tbody.innerHTML = "";
        empty.hidden = false;
      } else {
        empty.hidden = true;
        tbody.innerHTML = list.map((u) => `
          <tr>
            <td>${u.user}</td>
            <td>${u.finalizado}</td>
            <td>${u.andamento}</td>
            <td>${u.pausado}</td>
            <td style="font-weight:700">${u.total}</td>
            <td style="font-weight:700;color:var(--bg)">${YardexDash.formatDuration(u.workMs)}</td>
          </tr>
        `).join("");
      }

      YardexDash.showStatus(
        statusEl,
        `Exibindo ${filtered.length} aparelho(s) no período · ${allRows.length} carregado(s).`,
        false
      );
    };

    const loadData = async () => {
      YardexDash.showStatus(statusEl, "Carregando dados do endpoint…", false);
      try {
        const json = await YardexDash.fetchWebhook(API_URL);
        allRows = this.loadRows(json);
        YardexDash.showStatus(statusEl, `${allRows.length} único(s) carregado(s).`, false);
        renderDashboard();
      } catch (err) {
        YardexDash.showStatus(statusEl, `Erro ao carregar: ${err.message}. Use http://localhost (CORS).`, true);
        ["kpiFinalizado", "kpiAndamento", "kpiPausado", "kpiTotal"].forEach((id) => {
          document.getElementById(id).textContent = "0";
        });
        document.getElementById("tableBody").innerHTML = "";
        document.getElementById("tableEmpty").hidden = false;
      }
    };

    const { reload } = YardexDash.bindDateFilters({ onChange: renderDashboard, onReload: loadData });
    reload();
  }
};
