/**
 * Relatório consolidado — KPIs de todos os módulos.
 *
 * Ao alterar regra/campo/filtro em um dashboard individual, espelhar aqui:
 *   recebimento.html     → mapRecebimento / loadRecebimentoRows / kpiRecebimento
 *   triagem.html         → mapTriagem / passesTriagem / kpiTriagem
 *   gestao-produto.html  → mapGestao / passesGestao / kpiGestao
 *   producao-*.html      → ProducaoDash (yardex-producao.js)
 *   cqe.html             → mapCqe / loadCqeRows / kpiCqe (+ processCqeRows em yardex-dash.js)
 *   consolidado.html     → labels/hints das seções
 */
const ConsolidadoDash = {
  API_RECEBIMENTO: "https://datalake.yardex.pro:10000/webhook/78441d8b-4c63-4299-be48-6017e086e474",
  API_REPARO: "https://datalake.yardex.pro:10000/webhook/30e00080-9b5d-4db8-9d2a-e40d71b8cd5d",
  GRUPO_FILTRO: "6151",
  ETAPAS_TRIAGEM: new Set(["reparo", "gestao_pecas"]),
  ETAPAS_GESTAO: new Set(["reparo", "gestao_pecas"]),

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
    return YardexDash.normalizeRows(json)
      .map((raw) => this.mapTriagem(raw))
      .filter((r) => this.passesTriagem(r));
  },

  kpiTriagem(rows, start, end) {
    const filtered = YardexDash.filterByDateField(rows, start, end, "data_pedido_sankhya");
    return { total: YardexDash.distinctById(filtered, "id").length };
  },

  mapGestao(raw) {
    const produtoId = raw.produto_requisitado_id ?? raw.produto_id_requisitado ?? null;
    return {
      id: raw.id ?? null,
      data_pedido_sankhya: raw.DATA_PEDIDO_SANKHYA || null,
      status_sankhya: raw.STATUS_SANKHYA || null,
      etapa_origem: raw.etapa_origem || raw.ETAPA_ORIGEM || null,
      produto_requisitado_id: produtoId != null ? String(produtoId).trim() : null
    };
  },

  passesGestao(row) {
    const status = String(row.status_sankhya || "").trim().toLowerCase();
    const etapa = String(row.etapa_origem || "").trim().toLowerCase();
    return (
      status === "sucesso" &&
      this.ETAPAS_GESTAO.has(etapa) &&
      !!row.data_pedido_sankhya &&
      !!row.produto_requisitado_id
    );
  },

  loadGestaoRows(json) {
    return YardexDash.normalizeRows(json).map((raw) => this.mapGestao(raw)).filter((r) => this.passesGestao(r));
  },

  kpiGestao(rows, start, end) {
    const filtered = YardexDash.filterByDateField(rows, start, end, "data_pedido_sankhya");
    return {
      total: filtered.length,
      distintos: YardexDash.distinctById(filtered, "id").length
    };
  },

  mapCqe(raw) {
    const v = String(raw.decisao || "").trim().toLowerCase();
    let decisao = null;
    if (v.includes("reprov")) decisao = "reprovado";
    else if (v.includes("aprov")) decisao = "aprovado";
    if (!decisao) return null;
    return {
      id: raw.id ?? null,
      data_pedido_sankhya: YardexDash.resolveCqeDate(raw, decisao),
      decisao,
      motivo: String(raw.motivo_reprovacao || "").trim() || "Sem motivo informado"
    };
  },

  loadCqeRows(json) {
    return YardexDash.normalizeRows(json)
      .map((raw) => this.mapCqe(raw))
      .filter(Boolean)
      .filter((r) => r.data_pedido_sankhya);
  },

  kpiCqe(rows, start, end) {
    const inPeriod = YardexDash.filterByDateField(rows, start, end, "data_pedido_sankhya");
    const filtered = YardexDash.processCqeRows(inPeriod);
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

  kpiProducaoAndroid(rows, start, end) {
    const filtered = ProducaoDash.filterRows(rows, start, end, "android");
    return ProducaoDash.computeTotals(filtered);
  },

  renderKpis(data) {
    this.setKpi("kpiRecTotal", data.recebimento.total);
    this.setKpi("kpiTriagemTotal", data.triagem.total);
    this.setKpi("kpiGestaoTotal", data.gestao.total);
    this.setKpi("kpiGestaoAparelhos", data.gestao.distintos);
    this.setKpi("kpiAndroidFinalizado", data.producaoAndroid.finalizado);
    this.setKpi("kpiAndroidAndamento", data.producaoAndroid.andamento);
    this.setKpi("kpiAndroidPausado", data.producaoAndroid.pausado);
    this.setKpi("kpiAndroidTotal", data.producaoAndroid.total);
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
      const gestaoRows = this.loadGestaoRows(repJson);
      const prodRows = ProducaoDash.loadRows(repJson);
      const cqeRows = this.loadCqeRows(repJson);

      const data = {
        recebimento: this.kpiRecebimento(recRows, start, end),
        triagem: this.kpiTriagem(triRows, start, end),
        gestao: this.kpiGestao(gestaoRows, start, end),
        producaoAndroid: this.kpiProducaoAndroid(prodRows, start, end),
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
        gestao: { total: 0, distintos: 0 },
        producaoAndroid: { finalizado: 0, andamento: 0, pausado: 0, total: 0 },
        producaoIphone: { finalizado: 0, andamento: 0, pausado: 0, total: 0 },
        cqe: { aprovado: 0, reprovado: 0, total: 0 }
      });
    }
  },

  init() {
    const { reload } = YardexDash.bindDateFilters({
      onChange: () => this.loadAndRender(),
      onReload: () => this.loadAndRender()
    });
    reload();
  }
};
