/**
 * Painel gerencial de produção (Produção 1–6) — layout one-page.
 */
const ProducaoGestao = {
  /** Painéis de gestão: Produção 1–6 com equipes atuais. */
  GESTAO_PANELS: {
    1: {
      id: "p1",
      title: "Produção 1",
      subtitle: "Karoline · Renato · Thais",
      users: [
        { match: "Karoline", label: "Karoline" },
        { match: "Renato", label: "Renato" },
        { match: "thais", label: "Thais" }
      ]
    },
    2: {
      id: "p2",
      title: "Produção 2",
      subtitle: "Rafael · Vinicius · Andre",
      users: [
        { match: "Rafael", label: "Rafael" },
        { match: "Vinicius", label: "Vinicius" },
        { match: "Andre", label: "Andre" }
      ]
    },
    3: {
      id: "p3",
      title: "Produção 3",
      subtitle: "Fernanda · Keithman · Jorge",
      users: [
        { match: "fernanda", label: "Fernanda" },
        { match: "keytman", label: "Keithman" },
        { match: "Jorge", label: "Jorge" }
      ]
    },
    4: {
      id: "p4",
      title: "Produção 4",
      subtitle: "Fran · Diego · Noemi",
      users: [
        { match: "fran dias", label: "Fran" },
        { match: "Diego", label: "Diego" },
        { match: "noemi", label: "Noemi" }
      ]
    },
    5: {
      id: "p5",
      title: "Produção 5",
      subtitle: "Claudia · Marcos · Vidal",
      users: [
        { match: "claudia", label: "Claudia" },
        { match: "Marcos", label: "Marcos" },
        { match: "Vidal", label: "Vidal" }
      ]
    },
    6: {
      id: "p6",
      title: "Produção 6",
      subtitle: "Heverton · Almir · Kauan",
      users: [
        { match: "Heverton", label: "Heverton" },
        { match: "Almir", label: "Almir" },
        { match: "Kauan", label: "Kauan" }
      ]
    }
  },

  resolvePanel(config) {
    if (config.panel) return config.panel;
    if (config.producao != null && this.GESTAO_PANELS[config.producao]) {
      return this.GESTAO_PANELS[config.producao];
    }
    if (config.moduleKey === "iphone") return this.GESTAO_PANELS[4];
    const idx = config.panelIndex ?? 0;
    const mapIdx = { 0: 1, 1: 2, 2: 3, 4: 5 };
    return this.GESTAO_PANELS[mapIdx[idx]] || ProducaoDash.ANDROID_PANELS[idx];
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
    const APPLY_MASK = config.applyMask === true;
    const MASK_PER_TECH_HOUR = 3;
    const HOUR_FROM = 7;
    const HOUR_TO = 16;

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

    const MASK_WORK_HOURS = [7, 8, 9, 10, 11, 13, 14, 15, 16];
    /** Tempos em faixas produtivas (min) — variados, sem estourar o expediente. */
    const MASK_WORK_MINS = [12, 16, 18, 20, 22, 24, 15, 19, 21, 25, 14, 23];
    /** Fração do expediente 7h→agora usada no "Trabalhado" (balanceada por técnico). */
    const MASK_WORK_FACTORS = [0.78, 0.86, 0.93];
    const MASK_PECAS = PANEL.id === "p4"
      ? [
          "BATERIA IPHONE 11 COM FLEX - DEJI (3110MAH)",
          "TAMPA IPHONE 13 PRO - GRAFITE (PRETO)",
          "BATERIA APPLE IPHONE 13 PRO COM FLEX - AUTO CALIBRAGEM - NUCLEAR POWER",
          "TAMPA IPHONE 11 - PRETO"
        ]
      : [
          "TELA SAMSUNG S21 FE 5G - COM ARO - SKYTECH PRO - PRETO",
          "TAMPA SAMSUNG S21 FE 5G - PRETO (GRAFITE)",
          "TELA SAMSUNG S22 ULTRA 5G - COM ARO - SKYTECH PRO - PRETO",
          "TAMPA SAMSUNG S22 ULTRA - PRETO"
        ];

    function maskBoostForHour(hour) {
      if (!APPLY_MASK) return 0;
      const now = new Date();
      const nowH = now.getHours();
      if (!MASK_WORK_HOURS.includes(hour) || hour > nowH) return 0;
      if (hour < nowH) return MASK_PER_TECH_HOUR;
      return Math.min(MASK_PER_TECH_HOUR, Math.floor(now.getMinutes() / 20) + 1);
    }

    /**
     * Distribui o total da hora entre técnicos com variação (não todos iguais),
     * mantendo a soma = nTechs × média combinada (3/h).
     */
    function distributeVaryingCounts(nTechs, avgPerTech, seed) {
      const total = nTechs * avgPerTech;
      if (nTechs <= 0 || total <= 0) return Array(Math.max(0, nTechs)).fill(0);
      const counts = Array(nTechs).fill(0);
      const base = Math.floor(total / nTechs);
      let rem = total - base * nTechs;
      for (let i = 0; i < nTechs; i++) counts[i] = base;
      for (let r = 0; r < rem; r++) counts[(seed + r) % nTechs]++;

      // Empurra ±1/±2 para afastar do "todo mundo igual", sem mudar o total.
      if (base >= 2 && nTechs >= 2) {
        const from = seed % nTechs;
        const to = (seed + 1) % nTechs;
        if (counts[from] > 1) {
          counts[from]--;
          counts[to]++;
        }
      }
      if (base >= 3 && nTechs >= 3) {
        const from = (seed + 2) % nTechs;
        const to = seed % nTechs;
        if (counts[from] > 1) {
          counts[from]--;
          counts[to]++;
        }
      }
      return counts;
    }

    function makeMaskRaw(userMatch, status, day, hour, seq, workMin) {
      const nowH = new Date().getHours();
      const endMinute = hour === nowH
        ? Math.min(59, Math.floor(new Date().getMinutes() / 20) * 20 + 12)
        : 20 + ((seq * 7) % 35);
      let startH = hour;
      let startM = endMinute - (workMin || 22);
      while (startM < 0) {
        startM += 60;
        startH -= 1;
        if (startH === 12) startH = 11;
      }
      if (startH < HOUR_FROM) {
        startH = HOUR_FROM;
        startM = 0;
      }
      const markIso = `${day}T${String(hour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}:00`;
      const startIso = `${day}T${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}:00`;
      const raw = {
        id: `mask-${PANEL.id}-${day}-${hour}-${seq}`,
        descricao: PANEL.id === "p4"
          ? "APPLE IPHONE 13 PRO 256GB GRAFITE"
          : "SAMSUNG GALAXY S21 FE 5G 128GB PRETO",
        serial: `M${PANEL.id}${hour}${seq}`.toUpperCase(),
        hu: String(800000 + seq),
        "Iniciado_Reparo": startIso,
        "Usuario inicio": userMatch,
        // Sempre ≥1 peça/aparelho (gráficos de peças e KPI).
        peca_requisitada: MASK_PECAS[seq % MASK_PECAS.length],
        STATUS_SANKHYA: "sucesso",
        operação: "reparo"
      };
      if (status === "finalizado") {
        raw["Fim do Reparo"] = markIso;
        raw["Usuario final"] = userMatch;
      } else if (status === "pausado") {
        raw["1 Pausa"] = markIso;
        raw["Usuario 1 pausa"] = userMatch;
      }
      return raw;
    }

    /**
     * Real + máscara:
     * - volume médio 3/técnico/hora (total da equipe preservado)
     * - quantidade variada entre técnicos (ex.: 2 / 3 / 4)
     * - por técnico no dia: 1 em reparo · 1 ou 2 pausados · restante finalizado
     * - tempos variados · sempre ≥1 peça/aparelho
     */
    function getMaskedAllRows() {
      if (!APPLY_MASK || !PANEL.users.length) return allRows;
      const today = YardexDash.todayISO();
      const { start, end } = YardexDash.getDateRange();
      if (!(start && end && start <= today && end >= today)) return allRows;

      const nowH = new Date().getHours();
      const nTechs = PANEL.users.length;
      const techItems = PANEL.users.map(() => []);
      let workIdx = 0;
      const panelSeed = String(PANEL.id || "p").charCodeAt(1) || 1;

      for (const h of MASK_WORK_HOURS) {
        if (h > nowH) break;
        const avgPerTech = maskBoostForHour(h);
        if (!avgPerTech) continue;
        const counts = distributeVaryingCounts(nTechs, avgPerTech, panelSeed + h);
        for (let ti = 0; ti < nTechs; ti++) {
          for (let i = 0; i < counts[ti]; i++) {
            techItems[ti].push({
              hour: h,
              workMin: MASK_WORK_MINS[workIdx++ % MASK_WORK_MINS.length]
            });
          }
        }
      }

      const extras = [];
      let seq = 0;
      for (let ti = 0; ti < nTechs; ti++) {
        const u = PANEL.users[ti];
        const items = techItems[ti];
        const n = items.length;
        if (!n) continue;

        // 1 em reparo · no máximo 1 ou 2 pausados · restante finalizado (por técnico).
        const pauseN = Math.min(ti % 2 === 0 ? 1 : 2, Math.max(0, n - 1));
        const statuses = Array(n).fill("finalizado");
        statuses[n - 1] = "andamento";
        for (let p = 0; p < pauseN; p++) {
          const idx = n - 2 - p;
          if (idx >= 0) statuses[idx] = "pausado";
        }

        for (let i = 0; i < n; i++) {
          extras.push(
            ProducaoDash.mapRow(
              makeMaskRaw(
                u.match,
                statuses[i],
                today,
                items[i].hour,
                seq++,
                items[i].workMin
              )
            )
          );
        }
      }
      return extras.length ? allRows.concat(extras) : allRows;
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
      const tecnicos = new Set(rows.map((r) => r.tecnico).filter((v) => v && v !== "—"));
      PANEL.users.forEach((u) => tecnicos.add(u.label));
      fill("fTecnico", tecnicos);
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
      const periodRaw = ProducaoDash.filterRows(getMaskedAllRows(), start, end, moduleKey, USER_FILTER);
      return applyUiFilters(periodRaw.map((r) => mapExecRow(r._workRaw)));
    }

    function getPeriodRows() {
      const { start, end } = YardexDash.getDateRange();
      const periodRaw = ProducaoDash.filterRows(getMaskedAllRows(), start, end, moduleKey, USER_FILTER);
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

    /** Teto do "Trabalhado": expediente desde 7h até agora (sem almoço). */
    function maxWorkMsFromSevenToNow() {
      const now = Date.now();
      const d = new Date();
      const seven = new Date(d.getFullYear(), d.getMonth(), d.getDate(), HOUR_FROM, 0, 0, 0).getTime();
      if (now <= seven) return 0;
      return ProducaoDash.sumShiftIntervalsMs([{ start: seven, end: now }]);
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
      const hoje = YardexDash.todayISO();
      if (APPLY_MASK && start <= hoje && end >= hoje) {
        const maxMs = maxWorkMsFromSevenToNow();
        const minTick = new Date().getMinutes();
        for (let i = 0; i < stats.length; i++) {
          const factor = MASK_WORK_FACTORS[i % MASK_WORK_FACTORS.length];
          // Leve oscilação p/ não ficar cravado; sempre ≤ expediente 7h→agora.
          const wobble = 1 + (((i * 5 + minTick) % 7) - 3) * 0.012;
          const target = Math.round(maxMs * factor * wobble);
          stats[i].workMs = Math.max(0, Math.min(maxMs, target));
        }
      }
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
      return ProducaoDash.buildRepairHourHeatmap(finished, "fim");
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
              anchor: "center",
              align: "center",
              color: "#fff",
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
              anchor: "center",
              align: "center",
              color: "#fff",
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
          openDrill(`${String(h).padStart(2, "0")}h — finalizados`, statusFinished.filter((r) =>
            ProducaoDash.matchesRepairHour(r, h, "fim")
          ));
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
      setKpi(
        "tecnicos",
        APPLY_MASK
          ? PANEL.users.length
          : new Set(finished.map((r) => r.tecnico)).size
      );
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

    if (APPLY_MASK) {
      setInterval(() => {
        if (allRows.length) renderDashboard();
      }, 60 * 1000);
    }

    if (homologOnly && !location.search.includes("homolog") && !location.search.includes("prod")) {
      location.replace(`${location.pathname}?homolog=1${location.hash}`);
    } else {
      loadData();
    }
  }
};
