/**
 * Painel gerencial de produção (Android / iPhone) — layout one-page homolog.
 */
const ProducaoGestao = {
  resolvePanel(config) {
    if (config.moduleKey === "iphone") return ProducaoDash.IPHONE_PANEL;
    const idx = config.panelIndex ?? 0;
    return ProducaoDash.ANDROID_PANELS[idx];
  },

  init(config) {
    Chart.register(ChartDataLabels);

    const moduleKey = config.moduleKey || "android";
    const PANEL = this.resolvePanel(config);
    if (!PANEL) return;

    const USER_FILTER = PANEL.users.map((u) => u.match);
    const META_TEMPO_MIN = 45;
    const MAO_OBRA_MIN = 0.35;
    const API_URL = YardexDash.API_REPARO;

    const SKY = { bg: "#694992", strong: "#8b6bb8", accent: "#c4a8e8", green: "#15803d", amber: "#b45309" };

    const KPI_DEFS = [
      { id: "reparados", icon: "📱", label: "Aparelhos reparados", hint: "Com fim de reparo" },
      { id: "pausados", icon: "⏸", label: "Total pausado", hint: "Em pausa no período" },
      { id: "tecnicos", icon: "👷", label: "Técnicos trabalhando", hint: "No período" },
      { id: "tempoMedio", icon: "⏱", label: "Tempo médio em reparo", hint: "Expediente 7h–16h48" },
      { id: "pecas", icon: "🔧", label: "Peças utilizadas", hint: "Linhas c/ peça" }
    ];

    const homologOnly = config.homologOnly ?? !YardexDash.isProductionHost();

    const pageTitleEl = document.getElementById("pageTitle");
    if (pageTitleEl && config.pageTitle) {
      pageTitleEl.textContent = config.pageTitle + " ";
      if (homologOnly) {
        const span = document.createElement("span");
        span.className = "rg-badge-homolog";
        span.textContent = "HOMOLOG";
        pageTitleEl.appendChild(span);
      }
      document.title = `${config.pageTitle}${homologOnly ? " (homolog)" : ""}`;
    }

    const statusEl = document.getElementById("statusMsg");
    const tooltipEl = document.getElementById("richTooltip");
    let allRows = [];
    const charts = {};

    document.getElementById("kpiRow").innerHTML = KPI_DEFS.map((k) => `
      <div class="rg-kpi" id="kpiWrap_${k.id}">
        <div class="kpi-head"><span class="kpi-label">${k.label}</span><span class="kpi-icon">${k.icon}</span></div>
        <div class="kpi-value" id="kpi_${k.id}">—</div>
        <div class="kpi-hint">${k.hint}</div>
      </div>
    `).join("");

    function escapeHtml(s) {
      return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function fmtMin(ms) {
      return ProducaoDash.fmtWorkMin(ms, 2);
    }

    function fmtMoney(v) {
      const n = Number(v);
      if (!Number.isFinite(n)) return "—";
      return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

    function numCost(raw) {
      const v = raw.custo_total ?? raw.custo_pecas;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    }

    function laborCost(workMs) {
      return (workMs / 60000) * MAO_OBRA_MIN;
    }

    function totalCost(row) {
      return numCost(row.raw) ?? laborCost(row.times?.workMs || 0);
    }

    function deviceKey(row) {
      const s = String(row.serial || "").trim();
      if (s && s !== "—") return `s:${s}`;
      const hu = String(row.hu || "").trim();
      if (hu && hu !== "—") return `h:${hu}`;
      return row.id ? `i:${row.id}` : null;
    }

    function hasPeca(row) {
      return row.peca && row.peca !== "—";
    }

    function mapExecRow(raw) {
      const base = ProducaoDash.mapRow(raw);
      const times = ProducaoDash.calcRepairTimes(raw, { shift: true });
      return {
        ...base,
        raw,
        times,
        hu: String(raw.hu || "—").trim() || "—",
        serial: String(raw.serial || "—").trim() || "—",
        triagem: raw["Data Triagem"] || null,
        fim: raw["Fim do Reparo"] || null,
        tecnico: YardexDash.normalizeUserName(raw["Usuario final"] || raw["Usuário reparo"] || base.user || "—"),
        peca: String(raw.peca_requisitada || "—").trim() || "—",
        modelo: String(raw.descricao || "—").trim() || "—",
        fornecedor: String(raw.Nome_solicitante_peca || "—").trim() || "—",
        sankhya: String(raw.STATUS_SANKHYA || "—").trim() || "—",
        custo: totalCost({ raw, times })
      };
    }

    function inPanelUser(tecnico) {
      return ProducaoDash.matchesUserFilter(tecnico, USER_FILTER);
    }

    function applyUiFilters(rows) {
      const get = (id) => document.getElementById(id).value;
      return rows.filter((r) => {
        const fTec = get("fTecnico");
        if (get("fTecnico")) {
          const pu = PANEL.users.find((u) => u.label === fTec);
          const byUser = pu && ProducaoDash.matchesUserFilter(r.user, [pu.match]);
          if (r.tecnico !== fTec && !byUser) return false;
        }
        if (get("fPeca") && r.peca !== get("fPeca")) return false;
        if (get("fModelo") && r.modelo !== get("fModelo")) return false;
        if (get("fSankhya") && r.sankhya !== get("fSankhya")) return false;
        if (get("fHu") && r.hu !== get("fHu")) return false;
        if (get("fSerial") && r.serial !== get("fSerial")) return false;
        return true;
      });
    }

    function populateFilters(rows) {
      const fill = (id, vals) => {
        const el = document.getElementById(id);
        const cur = el.value;
        el.innerHTML = `<option value="">${el.options[0].textContent}</option>`
          + [...vals].sort((a, b) => a.localeCompare(b, "pt-BR")).map((v) => `<option>${escapeHtml(v)}</option>`).join("");
        if (cur && vals.has(cur)) el.value = cur;
      };
      fill("fTecnico", new Set(rows.map((r) => r.tecnico).filter((v) => v && v !== "—")));
      fill("fPeca", new Set(rows.map((r) => r.peca).filter((v) => v && v !== "—")));
      fill("fModelo", new Set(rows.map((r) => r.modelo).filter((v) => v && v !== "—")));
      fill("fSankhya", new Set(rows.map((r) => r.sankhya).filter((v) => v && v !== "—")));
      fill("fHu", new Set(rows.map((r) => r.hu).filter((v) => v && v !== "—")));
      fill("fSerial", new Set(rows.map((r) => r.serial).filter((v) => v && v !== "—")));
    }

    function destroyChart(key) {
      if (charts[key]) { charts[key].destroy(); charts[key] = null; }
    }

    function fmtDt(v) {
      if (!v) return "—";
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return String(v);
      return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    }

    function getStatusRows() {
      const { start, end } = YardexDash.getDateRange();
      const periodRaw = ProducaoDash.filterRows(allRows, start, end, moduleKey, USER_FILTER);
      return applyUiFilters(periodRaw.map((r) => mapExecRow(r._workRaw)));
    }

    function getPeriodRows() {
      const { start, end } = YardexDash.getDateRange();
      const periodRaw = ProducaoDash.filterRows(allRows, start, end, moduleKey, USER_FILTER);
      return applyUiFilters(
        periodRaw.map((r) => mapExecRow(r._workRaw)).filter((r) => inPanelUser(r.tecnico))
      );
    }

    function statusLabel(st) {
      return { finalizado: "Finalizados", andamento: "Em reparo", pausado: "Pausados", all: "Todos" }[st] || st;
    }

    function rowWorkMs(r, start, end) {
      if (!r.raw || !start || !end) return 0;
      return ProducaoDash.calcShiftWorkMsInPeriod(r.raw, start, end);
    }

    function fmtWorkTotal(ms) {
      if (!ms) return "—";
      return YardexDash.formatDuration(ms);
    }

    function aggregateStatusByTecnico(rows, start, end) {
      const stats = PANEL.users.map((u) => ({
        tecnico: u.label,
        match: u.match,
        finalizado: 0,
        andamento: 0,
        pausado: 0,
        total: 0,
        workMs: 0
      }));
      rows.forEach((r) => {
        const idx = PANEL.users.findIndex((u) => ProducaoDash.matchesUserFilter(r.user, [u.match]));
        if (idx < 0) return;
        const s = stats[idx];
        if (s[r.status] != null) s[r.status]++;
        s.total++;
        s.workMs += rowWorkMs(r, start, end);
      });
      return stats;
    }

    function renderStatusBoard() {
      const { start, end } = YardexDash.getDateRange();
      const statusRows = getStatusRows();
      const tbody = document.getElementById("statusByTecBody");

      if (!PANEL.users.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#6b5b7a;padding:1rem">Sem colaboradores definidos neste quadro.</td></tr>`;
        return;
      }

      const list = aggregateStatusByTecnico(statusRows, start, end);
      const totals = list.reduce(
        (acc, s) => {
          acc.finalizado += s.finalizado;
          acc.andamento += s.andamento;
          acc.pausado += s.pausado;
          acc.total += s.total;
          acc.workMs += s.workMs;
          return acc;
        },
        { finalizado: 0, andamento: 0, pausado: 0, total: 0, workMs: 0 }
      );

      tbody.innerHTML = list.map((s) => `
        <tr>
          <td class="tec-name">${escapeHtml(s.tecnico)}</td>
          <td class="v-fin" data-drill data-tech="${escapeHtml(s.tecnico)}" data-status="finalizado">${s.finalizado}</td>
          <td class="v-rep" data-drill data-tech="${escapeHtml(s.tecnico)}" data-status="andamento">${s.andamento}</td>
          <td class="v-pau" data-drill data-tech="${escapeHtml(s.tecnico)}" data-status="pausado">${s.pausado}</td>
          <td class="v-tot" data-drill data-tech="${escapeHtml(s.tecnico)}" data-status="all">${s.total}</td>
          <td class="v-work">${fmtWorkTotal(s.workMs)}</td>
        </tr>
      `).join("") + `
        <tr class="total">
          <td>Total</td>
          <td class="v-fin" data-drill data-tech="" data-status="finalizado">${totals.finalizado}</td>
          <td class="v-rep" data-drill data-tech="" data-status="andamento">${totals.andamento}</td>
          <td class="v-pau" data-drill data-tech="" data-status="pausado">${totals.pausado}</td>
          <td class="v-tot" data-drill data-tech="" data-status="all">${totals.total}</td>
          <td class="v-work">${fmtWorkTotal(totals.workMs)}</td>
        </tr>`;

      tbody.querySelectorAll("[data-drill]").forEach((cell) => {
        cell.addEventListener("click", () => {
          const tech = cell.dataset.tech;
          const st = cell.dataset.status;
          const rows = statusRows.filter((r) => {
            if (st !== "all" && r.status !== st) return false;
            if (!tech) return true;
            const pu = PANEL.users.find((u) => u.label === tech);
            return pu && ProducaoDash.matchesUserFilter(r.user, [pu.match]);
          });
          const title = tech
            ? `${tech} · ${statusLabel(st)}`
            : `${statusLabel(st)} · equipe`;
          openDrill(title, rows);
        });
      });
    }

    function openDrill(title, rows) {
      document.getElementById("drillTitle").textContent = title;
      document.getElementById("drillBody").innerHTML = rows.slice(0, 200).map((r) => `
        <tr>
          <td>${escapeHtml(r.hu)}</td>
          <td>${escapeHtml(r.serial)}</td>
          <td>${escapeHtml(r.tecnico)}</td>
          <td>${escapeHtml(fmtDt(r.triagem))}</td>
          <td>${escapeHtml(fmtDt(r.iniciado_reparo))}</td>
          <td>${escapeHtml(fmtDt(r.fim))}</td>
          <td>${r.times ? fmtMin(r.times.workMs) : "—"}</td>
          <td>${r.times ? fmtMin(r.times.pauseMs) : "—"}</td>
          <td>${r.times ? fmtMin(r.times.totalMs) : "—"}</td>
          <td>${escapeHtml(r.peca)}</td>
          <td>${fmtMoney(r.custo)}</td>
          <td>${escapeHtml(r.sankhya)}</td>
        </tr>
      `).join("");
      document.getElementById("drillModal").classList.add("open");
    }

    function setKpi(id, val, cls) {
      const wrap = document.getElementById(`kpiWrap_${id}`);
      document.getElementById(`kpi_${id}`).textContent = val;
      if (wrap) wrap.className = `rg-kpi${cls ? " " + cls : ""}`;
    }

    function panelUserAvgWork(rows, start, end) {
      const finished = rows.filter((r) => r.times);
      return PANEL.users.map((u) => {
        const list = finished.filter((r) => ProducaoDash.matchesUserFilter(r.user, [u.match]));
        const avgWork = list.length
          ? list.reduce((a, r) => a + ProducaoDash.calcShiftWorkMsInPeriod(r.raw, start, end), 0) / list.length
          : 0;
        return { label: u.label, match: u.match, avgWork, list };
      });
    }

    function panelUserAvgPecas(rows) {
      const finished = rows.filter((r) => r.times);
      return PANEL.users.map((u) => {
        const list = finished.filter((r) => ProducaoDash.matchesUserFilter(r.user, [u.match]));
        const byDevice = new Map();
        list.forEach((r) => {
          const k = deviceKey(r) || `row:${r.id ?? r.hu}-${r.fim}`;
          if (!byDevice.has(k)) byDevice.set(k, { pecas: 0, rows: [] });
          const d = byDevice.get(k);
          d.rows.push(r);
          if (hasPeca(r)) d.pecas++;
        });
        const devices = [...byDevice.values()];
        const totalPecas = devices.reduce((a, d) => a + d.pecas, 0);
        const avg = devices.length ? totalPecas / devices.length : 0;
        return { label: u.label, avg, list, devices: devices.length, totalPecas };
      });
    }

    function buildRepairHeatmap(finished) {
      const hours = [7, 8, 9, 10, 11, 13, 14, 15, 16];
      const matrix = hours.map(() => 0);

      finished.forEach((r) => {
        if (!r.raw || !r.fim) return;
        const endMs = new Date(r.fim).getTime();
        const intervals = ProducaoDash.getWorkIntervals(r.raw, endMs);
        const hit = new Set();

        intervals.forEach(({ start, end }) => {
          let dayStart = ProducaoDash.localDayStartMs(start);
          const lastDay = ProducaoDash.localDayStartMs(end);
          while (dayStart <= lastDay) {
            hours.forEach((hour) => {
              const hStart = ProducaoDash.localTimeOnDayMs(dayStart, hour, 0);
              const hEnd = hour === 16
                ? ProducaoDash.localTimeOnDayMs(dayStart, 16, 48)
                : ProducaoDash.localTimeOnDayMs(dayStart, hour + 1, 0);
              const overlap = ProducaoDash.overlapMs(start, end, hStart, hEnd);
              if (overlap > 0) hit.add(hour);
            });
            dayStart += 86400000;
          }
        });

        hit.forEach((hour) => { matrix[hours.indexOf(hour)]++; });
      });

      return { hours, matrix };
    }

    function renderCharts(rows) {
      const { start, end } = YardexDash.getDateRange();
      const finished = rows.filter((r) => r.times);

      const tickSmall = { font: { size: 8 }, color: "#6b5b7a" };
      const yBar = (n) => ({ offset: true, ticks: { ...tickSmall, autoSkip: false, font: { size: n > 6 ? 8 : 9 } } });

      const buckets = ["0-10", "10-20", "20-30", "30-60", "60+"];
      const bucketIdx = (min) => {
        if (min <= 10) return 0;
        if (min <= 20) return 1;
        if (min <= 30) return 2;
        if (min <= 60) return 3;
        return 4;
      };
      const hist = [0, 0, 0, 0, 0];
      finished.forEach((r) => { hist[bucketIdx(r.times.workMs / 60000)]++; });
      destroyChart("hist");
      charts.hist = new Chart(document.getElementById("chartHist"), {
        type: "bar",
        data: { labels: buckets.map((b) => `${b} min`), datasets: [{ data: hist, backgroundColor: SKY.strong, borderRadius: 4 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, datalabels: { anchor: "end", align: "end", font: { size: 8, weight: "700" } } },
          scales: { y: { beginAtZero: true, ticks: { ...tickSmall, stepSize: 1 } }, x: { ticks: tickSmall } },
          onClick: (_, elems) => {
            if (!elems.length) return;
            const i = elems[0].index;
            const ranges = [[0, 10], [10, 20], [20, 30], [30, 60], [60, Infinity]];
            const [lo, hi] = ranges[i];
            openDrill(`Faixa ${buckets[i]} min`, finished.filter((r) => {
              const m = r.times.workMs / 60000;
              return m > lo && (hi === Infinity ? true : m <= hi);
            }));
          }
        }
      });

      const statusFinished = getStatusRows().filter((r) => r.times);
      const pecasRank = panelUserAvgPecas(statusFinished);
      destroyChart("pecas");
      charts.pecas = new Chart(document.getElementById("chartPecas"), {
        type: "bar",
        data: {
          labels: pecasRank.map((s) => s.label),
          datasets: [{
            data: pecasRank.map((s) => +s.avg.toFixed(2)),
            backgroundColor: SKY.strong,
            borderRadius: 4
          }]
        },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            datalabels: {
              anchor: "end", align: "end",
              formatter: (v) => v > 0 ? v.toFixed(2).replace(".", ",") : "—",
              font: { size: 9, weight: "700" }
            }
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks: tickSmall,
              title: { display: true, text: "peças/aparelho", font: { size: 8 } }
            },
            y: yBar(pecasRank.length)
          },
          onClick: (_, elems) => {
            if (!elems.length) return;
            const item = pecasRank[elems[0].index];
            openDrill(`Peças — ${item.label} (${item.totalPecas} em ${item.devices} aparelho(s))`, item.list.filter(hasPeca));
          }
        }
      });

      const tempoRank = panelUserAvgWork(statusFinished, start, end);
      destroyChart("tempoTec");
      charts.tempoTec = new Chart(document.getElementById("chartTempoTec"), {
        type: "bar",
        data: {
          labels: tempoRank.map((s) => s.label),
          datasets: [{
            data: tempoRank.map((s) => +(s.avgWork / 60000).toFixed(1)),
            backgroundColor: tempoRank.map((s) => s.avgWork / 60000 > META_TEMPO_MIN ? SKY.amber : SKY.strong),
            borderRadius: 4
          }]
        },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            datalabels: {
              anchor: "end", align: "end",
              formatter: (v) => v > 0 ? `${String(v).replace(".", ",")} min` : "—",
              font: { size: 9, weight: "700" }
            }
          },
          scales: {
            x: { beginAtZero: true, ticks: tickSmall, title: { display: true, text: "min", font: { size: 8 } } },
            y: yBar(tempoRank.length)
          },
          onClick: (_, elems) => {
            if (!elems.length) return;
            const item = tempoRank[elems[0].index];
            openDrill(`Tempo em reparo: ${item.label}`, item.list);
          }
        }
      });

      const { hours, matrix } = buildRepairHeatmap(statusFinished);
      let maxH = Math.max(1, ...matrix);
      document.getElementById("heatmapTable").innerHTML = `
        <tr><th>Hora</th>${hours.map((h) => `<th>${String(h).padStart(2, "0")}h</th>`).join("")}</tr>
        <tr><td class="row-label">Reparos</td>${matrix.map((v, i) => {
          const pct = v / maxH;
          const bg = v ? `rgba(105,73,146,${0.15 + pct * 0.7})` : "#faf8fc";
          return `<td class="cell" data-h="${hours[i]}" style="background:${bg}">${v || "—"}</td>`;
        }).join("")}</tr>`;
      document.getElementById("heatmapTable").querySelectorAll("td.cell").forEach((cell) => {
        cell.addEventListener("click", () => {
          const h = Number(cell.dataset.h);
          openDrill(`${String(h).padStart(2, "0")}h — em reparo`, statusFinished.filter((r) => {
            if (!r.raw || !r.fim) return false;
            const endMs = new Date(r.fim).getTime();
            const intervals = ProducaoDash.getWorkIntervals(r.raw, endMs);
            return intervals.some(({ start, end }) => {
              let dayStart = ProducaoDash.localDayStartMs(start);
              const lastDay = ProducaoDash.localDayStartMs(end);
              while (dayStart <= lastDay) {
                const hStart = ProducaoDash.localTimeOnDayMs(dayStart, h, 0);
                const hEnd = h === 16
                  ? ProducaoDash.localTimeOnDayMs(dayStart, 16, 48)
                  : ProducaoDash.localTimeOnDayMs(dayStart, h + 1, 0);
                if (ProducaoDash.overlapMs(start, end, hStart, hEnd) > 0) return true;
                dayStart += 86400000;
              }
              return false;
            });
          }));
        });
      });
    }

    function renderDashboard() {
      const { start, end } = YardexDash.getDateRange();
      if (!start || !end) return;

      const filtered = getPeriodRows();
      const finished = filtered.filter((r) => r.times);

      const avgWork = finished.length
        ? finished.reduce((a, r) => a + ProducaoDash.calcShiftWorkMsInPeriod(r.raw, start, end), 0) / finished.length
        : 0;
      const pecasN = finished.filter((r) => r.peca && r.peca !== "—").length;
      const statusRows = getStatusRows();
      const totalPausado = statusRows.filter((r) => r.status === "pausado").length;

      setKpi("reparados", finished.length);
      setKpi("pausados", totalPausado, totalPausado > 0 ? "pausado" : "");
      setKpi("tecnicos", new Set(finished.map((r) => r.tecnico)).size);
      setKpi("tempoMedio", fmtMin(avgWork), avgWork / 60000 > META_TEMPO_MIN ? "warn" : "ok");
      setKpi("pecas", pecasN);

      renderStatusBoard();
      renderCharts(filtered);

      document.getElementById("periodLabel").textContent =
        `${PANEL.subtitle} · ${YardexDash.formatPeriodBR(start, end)} · reparo 7h–16h48`;
      YardexDash.showStatus(statusEl, `${filtered.length} registro(s) no período`, false);
    }

    async function loadData() {
      YardexDash.showStatus(statusEl, homologOnly ? "Carregando homolog…" : "Carregando dados…", false);
      try {
        const json = await YardexDash.fetchWebhook(API_URL);
        allRows = ProducaoDash.loadRows(json);
        const mapped = allRows.map((r) => mapExecRow(r._workRaw)).filter((r) => inPanelUser(r.tecnico));
        populateFilters(mapped);
        YardexDash.showStatus(statusEl, `${allRows.length} registro(s) carregado(s).`, false);
        renderDashboard();
      } catch (err) {
        YardexDash.showStatus(statusEl, `Erro: ${err.message}`, true);
      }
    }

    document.getElementById("drillClose").addEventListener("click", () => document.getElementById("drillModal").classList.remove("open"));
    document.getElementById("drillModal").addEventListener("click", (e) => {
      if (e.target.id === "drillModal") document.getElementById("drillModal").classList.remove("open");
    });

    ["fTecnico", "fPeca", "fModelo", "fSankhya", "fHu", "fSerial"].forEach((id) => {
      document.getElementById(id).addEventListener("change", renderDashboard);
    });

    YardexDash.bindDateFilters({ onChange: renderDashboard, onReload: loadData });

    if (homologOnly && !location.search.includes("homolog") && !location.search.includes("prod")) {
      location.replace(`${location.pathname}?homolog=1${location.hash}`);
    } else {
      loadData();
    }
  }
};
