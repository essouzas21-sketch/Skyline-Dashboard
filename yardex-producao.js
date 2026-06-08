/**
 * Dashboard de produção (Diversas Marcas / iPhone).
 * userFilter: null = todos; depois pode ser array de nomes permitidos.
 */
const ProducaoDash = {
  USER_FILTERS: {
    diversas: [
      "claudia paz",
      "fernanda maria",
      "Francisco Chagas",
      "Karoline Alexandre",
      "keytman janaína",
      "Michelle Alves"
    ],
    iphone: [
      "thaís mazoline",
      "noemi firmo",
      "fran dias"
    ]
  },

  init(moduleKey) {
    const API_URL = "https://datalake.yardex.pro:10000/webhook/30e00080-9b5d-4db8-9d2a-e40d71b8cd5d";
    const DATE_FIELD = "iniciado_reparo";
    const statusEl = document.getElementById("statusMsg");
    const userFilter = this.USER_FILTERS[moduleKey] || null;

    let allRows = [];

    const isFilled = (v) => v != null && String(v).trim() !== "" && String(v).toLowerCase() !== "null";

    const parseDt = (v) => {
      if (!isFilled(v)) return null;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const maxFilledPause = (raw) => {
      for (let n = 3; n >= 1; n--) {
        if (isFilled(raw[`${n} Pausa`])) return n;
      }
      return 0;
    };

    const maxFilledRetorno = (raw) => {
      for (let n = 3; n >= 1; n--) {
        if (isFilled(raw[`${n} Retorno`])) return n;
      }
      return 0;
    };

    const classify = (raw) => {
      if (isFilled(raw["Fim do Reparo"])) {
        return { status: "finalizado", user: raw["Usuario final"] || "—" };
      }
      const mp = maxFilledPause(raw);
      if (mp && !isFilled(raw[`${mp} Retorno`])) {
        return { status: "pausado", user: raw[`Usuario ${mp} pausa`] || "—" };
      }
      const mr = maxFilledRetorno(raw);
      if (mr) {
        return { status: "andamento", user: raw[`Usuario ${mr} retorno`] || "—" };
      }
      return { status: "andamento", user: raw["Usuario inicio"] || "—" };
    };

    const calcWorkMs = (raw, nowMs = Date.now()) => {
      const inicio = parseDt(raw["Iniciado_Reparo"]);
      if (!inicio) return 0;

      const fim = parseDt(raw["Fim do Reparo"]);
      const mp = maxFilledPause(raw);

      if (fim && mp === 0) {
        return Math.max(0, fim.getTime() - inicio.getTime());
      }

      if (fim && mp > 0) {
        let total = 0;
        for (let i = 1; i <= mp; i++) {
          const pause = parseDt(raw[`${i} Pausa`]);
          const start = i === 1 ? inicio : parseDt(raw[`${i - 1} Retorno`]);
          if (pause && start) total += Math.max(0, pause.getTime() - start.getTime());
        }
        const lastRet = parseDt(raw[`${mp} Retorno`]);
        if (lastRet) total += Math.max(0, fim.getTime() - lastRet.getTime());
        return total;
      }

      if (mp > 0 && !isFilled(raw[`${mp} Retorno`])) {
        let total = 0;
        for (let i = 1; i <= mp; i++) {
          const pause = parseDt(raw[`${i} Pausa`]);
          const start = i === 1 ? inicio : parseDt(raw[`${i - 1} Retorno`]);
          if (pause && start) total += Math.max(0, pause.getTime() - start.getTime());
        }
        return total;
      }

      const mr = maxFilledRetorno(raw);
      if (mr > 0) {
        let total = 0;
        for (let i = 1; i <= mr; i++) {
          const pause = parseDt(raw[`${i} Pausa`]);
          const start = i === 1 ? inicio : parseDt(raw[`${i - 1} Retorno`]);
          if (pause && start) total += Math.max(0, pause.getTime() - start.getTime());

          const ret = parseDt(raw[`${i} Retorno`]);
          const nextPause = parseDt(raw[`${i + 1} Pausa`]);
          const end = nextPause || new Date(nowMs);
          if (ret) total += Math.max(0, end.getTime() - ret.getTime());
        }
        return total;
      }

      return Math.max(0, nowMs - inicio.getTime());
    };

    const mapRow = (raw) => {
      const { status, user } = classify(raw);
      return {
        id: raw.id ?? null,
        iniciado_reparo: raw["Iniciado_Reparo"] || null,
        descricao: raw.descricao || "—",
        serial: raw.serial || "—",
        status,
        user: user || "—",
        workMs: calcWorkMs(raw)
      };
    };

    const matchesUserFilter = (user) => {
      if (!userFilter || !userFilter.length) return true;
      const norm = String(user).trim().toLowerCase();
      return userFilter.some((u) => norm.includes(String(u).trim().toLowerCase()));
    };

    const renderDashboard = () => {
      const { start, end } = YardexDash.getDateRange();
      if (!start || !end) return;
      if (start > end) {
        YardexDash.showStatus(statusEl, "A data inicial não pode ser maior que a data final.", true);
        return;
      }

      let filtered = YardexDash.filterByDateField(allRows, start, end, DATE_FIELD);
      if (userFilter && userFilter.length) {
        filtered = filtered.filter((row) => matchesUserFilter(row.user));
      }

      const totals = { finalizado: 0, andamento: 0, pausado: 0, total: 0 };
      const byUser = new Map();

      filtered.forEach((row) => {
        totals[row.status]++;
        totals.total++;

        const key = row.user;
        if (!byUser.has(key)) {
          byUser.set(key, { user: key, finalizado: 0, andamento: 0, pausado: 0, total: 0, workMs: 0 });
        }
        const u = byUser.get(key);
        u[row.status]++;
        u.total++;
        u.workMs += row.workMs;
      });

      document.getElementById("kpiFinalizado").textContent = totals.finalizado;
      document.getElementById("kpiAndamento").textContent = totals.andamento;
      document.getElementById("kpiPausado").textContent = totals.pausado;
      document.getElementById("kpiTotal").textContent = totals.total;
      document.getElementById("periodLabel").textContent =
        `Período: ${YardexDash.formatPeriodBR(start, end)} · filtro por Iniciado_Reparo`;

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
        const mapped = YardexDash.normalizeRows(json)
          .map(mapRow)
          .filter((r) => r.iniciado_reparo);
        allRows = YardexDash.distinctById(mapped, "id");
        YardexDash.showStatus(statusEl, `${allRows.length} único(s) · ${mapped.length} bruto(s).`, false);
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
