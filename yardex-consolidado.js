/**
 * Relatório consolidado — KPIs de todos os módulos.
 */
const ConsolidadoDash = {
  AUTH_KEY: "skyline_consolidado_auth",
  PASSWORD: "75395123",

  API_RECEBIMENTO: "https://datalake.yardex.pro:10000/webhook/78441d8b-4c63-4299-be48-6017e086e474",
  API_REPARO: "https://datalake.yardex.pro:10000/webhook/30e00080-9b5d-4db8-9d2a-e40d71b8cd5d",
  GRUPO_FILTRO: "6151",
  ETAPAS_TRIAGEM: new Set(["reparo", "gestao_pecas"]),

  isAuthed() {
    try {
      return sessionStorage.getItem(this.AUTH_KEY) === "1";
    } catch (_) {
      return false;
    }
  },

  setAuthed() {
    try {
      sessionStorage.setItem(this.AUTH_KEY, "1");
    } catch (_) {}
  },

  checkPassword(value) {
    return String(value || "").trim() === this.PASSWORD;
  },

  showGate() {
    const gate = document.getElementById("authGate");
    const app = document.getElementById("app");
    if (gate) gate.style.display = "flex";
    if (app) app.style.display = "none";
  },

  showApp() {
    const gate = document.getElementById("authGate");
    const app = document.getElementById("app");
    if (gate) gate.style.display = "none";
    if (app) app.style.display = "flex";
  },

  tryLogin() {
    const input = document.getElementById("authPass");
    const error = document.getElementById("authError");
    if (!input) return false;

    if (this.checkPassword(input.value)) {
      this.setAuthed();
      if (error) error.style.display = "none";
      this.showApp();
      this.startDashboard();
      return true;
    }

    if (error) error.style.display = "block";
    input.value = "";
    input.focus();
    return false;
  },

  setupAuth() {
    const btn = document.getElementById("btnEntrar");
    const input = document.getElementById("authPass");

    if (this.isAuthed()) {
      this.showApp();
      this.startDashboard();
      return;
    }

    this.showGate();

    if (btn) {
      btn.onclick = () => this.tryLogin();
    }

    if (input) {
      input.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.tryLogin();
        }
      };
    }
  },

  mapRecebimento(raw) {
    const grupo = String(raw.grupo ?? raw.Grupo ?? raw.p?.grupo ?? "").trim();
    return {
      id: raw.id ?? raw.hunit ?? null,
      data_add: raw.data_add,
      grupo
    };
  },

  loadRecebimentoRows(json) {
    const mapped = YardexDash.normalizeRows(json)
      .map((raw) => this.mapRecebimento(raw))
      .filter((r) => r.grupo === this.GRUPO_FILTRO && r.data_add);
    return YardexDash.distinctById(mapped, "id");
  },

  kpiRecebimento(rows, start, end) {
    const filtered = YardexDash.filterByDateField(rows, start, end, "data_add");
    return { total: filtered.length };
  },

  mapTriagem(raw) {
    return {
      id: raw.id ?? null,
      data_pedido_sankhya: raw.DATA_PEDIDO_SANKHYA || null,
      status_sankhya: raw.STATUS_SANKHYA || null,
      etapa_origem: raw.etapa_origem || raw.ETAPA_ORIGEM || null
    };
  },

  passesTriagem(row) {
    const status = String(row.status_sankhya || "").trim().toLowerCase();
    const etapa = String(row.etapa_origem || "").trim().toLowerCase();
    return status === "sucesso" && this.ETAPAS_TRIAGEM.has(etapa) && !!row.data_pedido_sankhya;
  },

  loadTriagemRows(json) {
    const mapped = YardexDash.normalizeRows(json).map((raw) => this.mapTriagem(raw)).filter((r) => this.passesTriagem(r));
    return YardexDash.distinctById(mapped, "id");
  },

  kpiTriagem(rows, start, end) {
    const filtered = YardexDash.filterByDateField(rows, start, end, "data_pedido_sankhya");
    return { total: filtered.length };
  },

  mapCqe(raw) {
    const v = String(raw.decisao || "").trim().toLowerCase();
    let decisao = null;
    if (v.includes("reprov")) decisao = "reprovado";
    else if (v.includes("aprov")) decisao = "aprovado";
    if (!decisao) return null;
    return {
      id: raw.id ?? null,
      fim_reparo: raw["Fim do Reparo"] || null,
      decisao
    };
  },

  loadCqeRows(json) {
    const mapped = YardexDash.normalizeRows(json)
      .map((raw) => this.mapCqe(raw))
      .filter(Boolean)
      .filter((r) => r.fim_reparo);
    return YardexDash.distinctById(mapped, "id");
  },

  kpiCqe(rows, start, end) {
    const filtered = YardexDash.filterByDateField(rows, start, end, "fim_reparo");
    const totals = { aprovado: 0, reprovado: 0, total: 0 };
    filtered.forEach((r) => {
      totals[r.decisao]++;
      totals.total++;
    });
    return totals;
  },

  setKpi(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  },

  renderKpis(data) {
    this.setKpi("kpiRecTotal", data.recebimento.total);
    this.setKpi("kpiTriagemTotal", data.triagem.total);
    this.setKpi("kpiDivFinalizado", data.producaoDiversas.finalizado);
    this.setKpi("kpiDivAndamento", data.producaoDiversas.andamento);
    this.setKpi("kpiDivPausado", data.producaoDiversas.pausado);
    this.setKpi("kpiDivTotal", data.producaoDiversas.total);
    this.setKpi("kpiIphFinalizado", data.producaoIphone.finalizado);
    this.setKpi("kpiIphAndamento", data.producaoIphone.andamento);
    this.setKpi("kpiIphPausado", data.producaoIphone.pausado);
    this.setKpi("kpiIphTotal", data.producaoIphone.total);
    this.setKpi("kpiCqeAprovado", data.cqe.aprovado);
    this.setKpi("kpiCqeReprovado", data.cqe.reprovado);
    this.setKpi("kpiCqeTotal", data.cqe.total);
  },

  async loadAndRender() {
    const statusEl = document.getElementById("statusMsg");
    const { start, end } = YardexDash.getDateRange();
    if (!start || !end) return;

    YardexDash.showStatus(statusEl, "Carregando todos os módulos…", false);

    try {
      const [recJson, repJson] = await Promise.all([
        YardexDash.fetchWebhook(this.API_RECEBIMENTO),
        YardexDash.fetchWebhook(this.API_REPARO)
      ]);

      const recRows = this.loadRecebimentoRows(recJson);
      const triRows = this.loadTriagemRows(repJson);
      const prodRows = ProducaoDash.loadRows(repJson);
      const cqeRows = this.loadCqeRows(repJson);

      const data = {
        recebimento: this.kpiRecebimento(recRows, start, end),
        triagem: this.kpiTriagem(triRows, start, end),
        producaoDiversas: ProducaoDash.computeTotals(
          ProducaoDash.filterRows(prodRows, start, end, "diversas")
        ),
        producaoIphone: ProducaoDash.computeTotals(
          ProducaoDash.filterRows(prodRows, start, end, "iphone")
        ),
        cqe: this.kpiCqe(cqeRows, start, end)
      };

      this.renderKpis(data);
      const periodLabel = document.getElementById("periodLabel");
      if (periodLabel) {
        periodLabel.textContent = `Período: ${YardexDash.formatPeriodBR(start, end)} · visão consolidada`;
      }

      YardexDash.showStatus(statusEl, "Consolidado atualizado.", false);
      YardexDash.markRefresh();
    } catch (err) {
      YardexDash.showStatus(statusEl, `Erro: ${err.message}`, true);
      this.renderKpis({
        recebimento: { total: 0 },
        triagem: { total: 0 },
        producaoDiversas: { finalizado: 0, andamento: 0, pausado: 0, total: 0 },
        producaoIphone: { finalizado: 0, andamento: 0, pausado: 0, total: 0 },
        cqe: { aprovado: 0, reprovado: 0, total: 0 }
      });
    }
  },

  startDashboard() {
    if (this._started) {
      this.loadAndRender();
      return;
    }
    this._started = true;

    const { reload } = YardexDash.bindDateFilters({
      onChange: () => this.loadAndRender(),
      onReload: () => this.loadAndRender()
    });
    reload();
  },

  init() {
    if (typeof YardexDash === "undefined" || typeof ProducaoDash === "undefined") {
      const error = document.getElementById("authError");
      if (error) {
        error.textContent = "Scripts não carregaram. Verifique a conexão.";
        error.style.display = "block";
      }
      return;
    }
    this.setupAuth();
  }
};
