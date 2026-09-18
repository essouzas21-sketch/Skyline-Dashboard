/**
 * Relatório consolidado — KPIs de todos os módulos.
 *
 * Ao alterar regra/campo/filtro em um dashboard individual, espelhar aqui:
 *   recebimento.html     → mapRecebimento / loadRecebimentoRows / kpiRecebimento
 *   triagem.html         → mapTriagem / passesTriagem / kpiTriagem
 *   gestao-produto.html  → mapGestao / passesGestao / kpiGestao
 *   producao-*.html      → ProducaoDash (skyline-producao.js)
 *     consolidado Android/iPhone: equipes Produção 1–6 + descrição com "Apple"
 *     TVs por técnico: USER_FILTERS / painéis
 *   cqe.html             → mapCqe / loadCqeRows / kpiCqe (+ processCqeRows em skyline-dash.js)
 *   consolidado.html     → labels/hints das seções
 */
const ConsolidadoDash = {
  GRUPO_FILTRO: "6151",
  /** Espelha triagem.html (reparo + gestão peças + limpeza). */
  ETAPAS_TRIAGEM: SkylineDash.ETAPAS_TRIAGEM,
  ETAPAS_GESTAO: SkylineDash.ETAPAS_OPERACAO,

  mapRecebimento(raw) {
    const grupo = String(raw.grupo ?? raw.Grupo ?? raw.p?.grupo ?? "").trim();
    return {
      id: SkylineDash.resolveRecebimentoId(raw),
      data_recebimento: SkylineDash.resolveRecebimentoDate(raw),
      grupo
    };
  },

  loadRecebimentoRows(json) {
    const mapped = SkylineDash.normalizeRows(json)
      .filter((raw) => SkylineDash.passesRecebimentoRaw(raw, this.GRUPO_FILTRO))
      .map((raw) => this.mapRecebimento(raw));
    return SkylineDash.distinctById(mapped, "id");
  },

  kpiRecebimento(rows, start, end) {
    const filtered = SkylineDash.filterByDateField(rows, start, end, "data_recebimento");
    return { total: filtered.length };
  },

  mapTriagem(raw) {
    return {
      id: raw.id ?? null,
      data_triagem: raw["Data Triagem"] || raw.data_triagem || null,
      operacao: SkylineDash.resolveOperacao(raw)
    };
  },

  passesTriagem(row) {
    return !!row.data_triagem && this.ETAPAS_TRIAGEM.has(row.operacao);
  },

  loadTriagemRows(json) {
    return SkylineDash.normalizeRows(json)
      .filter((raw) => SkylineDash.passesTriagemRaw(raw, this.ETAPAS_TRIAGEM, {
        requireSankhyaSucesso: false
      }))
      .map((raw) => this.mapTriagem(raw));
  },

  kpiTriagem(rows, start, end) {
    const filtered = SkylineDash.filterByDateField(rows, start, end, "data_triagem");
    return { total: SkylineDash.distinctById(filtered, "id").length };
  },

  mapGestao(raw) {
    const produtoId = raw.produto_requisitado_id ?? raw.produto_id_requisitado ?? null;
    return {
      id: raw.id ?? null,
      data_pedido_sankhya: SkylineDash.resolveGestaoDate(raw),
      produto_requisitado_id: produtoId != null ? String(produtoId).trim() : null
    };
  },

  passesGestao(row) {
    return !!row.data_pedido_sankhya && !!row.produto_requisitado_id;
  },

  loadGestaoRows(json) {
    const mapped = SkylineDash.normalizeRows(json)
      .filter((raw) => SkylineDash.passesGestaoRaw(raw, this.ETAPAS_GESTAO))
      .map((raw) => this.mapGestao(raw))
      .filter((r) => this.passesGestao(r));
    return SkylineDash.dedupeGestaoRows(mapped);
  },

  kpiGestao(rows, start, end) {
    const filtered = SkylineDash.filterByDateField(rows, start, end, "data_pedido_sankhya");
    return {
      total: filtered.length,
      distintos: SkylineDash.distinctById(filtered, "id").length
    };
  },

  getMonthRange(refISO) {
    const [y, m] = refISO.split("-");
    const lastDay = new Date(Number(y), Number(m), 0).getDate();
    return {
      start: `${y}-${m}-01`,
      end: `${y}-${m}-${String(lastDay).padStart(2, "0")}`
    };
  },

  monthLabel(refISO) {
    const [y, m] = refISO.split("-");
    const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    return `${names[Number(m) - 1]}/${y}`;
  },

  mapCqe(raw) {
    const v = String(raw.decisao || "").trim().toLowerCase();
    let decisao = null;
    if (v.includes("reprov")) decisao = "reprovado";
    else if (v.includes("aprov")) decisao = "aprovado";
    if (!decisao) return null;
    return {
      id: raw.id ?? null,
      data_qualidade: SkylineDash.resolveCqeQualidadeDate(raw, decisao),
      decisao,
      motivo: String(raw.motivo_reprovacao || "").trim() || "Sem motivo informado"
    };
  },

  loadCqeRows(json) {
    return SkylineDash.normalizeRows(json)
      .map((raw) => this.mapCqe(raw))
      .filter(Boolean)
      .filter((r) => r.data_qualidade);
  },

  kpiCqe(rows, start, end) {
    const inPeriod = SkylineDash.filterByDateField(rows, start, end, "data_qualidade");
    const filtered = SkylineDash.processCqeRows(inPeriod);
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
    const filtered = ProducaoDash.filterRowsByProduto(rows, start, end, "android");
    return ProducaoDash.computeTotals(filtered);
  },

  kpiProducaoIphone(rows, start, end) {
    const filtered = ProducaoDash.filterRowsByProduto(rows, start, end, "iphone");
    return ProducaoDash.computeTotals(filtered);
  },

  renderKpis(data) {
    this.setKpi("kpiRecTotal", data.recebimento.total);
    this.setKpi("kpiTriagemTotal", data.triagem.total);
    this.setKpi("kpiGestaoTotal", data.gestao.total);
    this.setKpi("kpiGestaoAparelhos", data.gestao.distintos);
    this.setKpi("kpiGestaoTotalMes", data.gestaoMes.total);
    this.setKpi("kpiGestaoAparelhosMes", data.gestaoMes.distintos);
    const gestaoMonthLabel = document.getElementById("kpiGestaoMonthLabel");
    if (gestaoMonthLabel && data.gestaoMonthLabel) {
      gestaoMonthLabel.textContent = data.gestaoMonthLabel;
    }
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
    const { start, end } = SkylineDash.getDateRange();
    if (!start || !end) return;

    SkylineDash.showStatus(statusEl, "Carregando todos os módulos…", false);

    try {
      const [recJson, repJson] = await Promise.all([
        SkylineDash.fetchWebhook(SkylineDash.API_RECEBIMENTO),
        SkylineDash.fetchWebhook(SkylineDash.API_REPARO)
      ]);

      const recRows = this.loadRecebimentoRows(recJson);
      const triRows = this.loadTriagemRows(repJson);
      const gestaoRows = this.loadGestaoRows(repJson);
      const prodRows = ProducaoDash.loadRows(repJson);
      const cqeRows = this.loadCqeRows(repJson);

      const month = this.getMonthRange(end);

      const data = {
        recebimento: this.kpiRecebimento(recRows, start, end),
        triagem: this.kpiTriagem(triRows, start, end),
        gestao: this.kpiGestao(gestaoRows, start, end),
        gestaoMes: this.kpiGestao(gestaoRows, month.start, month.end),
        gestaoMonthLabel: `Acumulado do mês — ${this.monthLabel(end)}`,
        producaoAndroid: this.kpiProducaoAndroid(prodRows, start, end),
        producaoIphone: this.kpiProducaoIphone(prodRows, start, end),
        cqe: this.kpiCqe(cqeRows, start, end)
      };

      this.renderKpis(data);
      const periodLabel = document.getElementById("periodLabel");
      if (periodLabel) {
        periodLabel.textContent = `Período: ${SkylineDash.formatPeriodBR(start, end)} · visão consolidada`;
      }

      SkylineDash.showStatus(statusEl, "Consolidado atualizado.", false);
      SkylineDash.markRefresh();
    } catch (err) {
      SkylineDash.showStatus(statusEl, `Erro: ${err.message}`, true);
      this.renderKpis({
        recebimento: { total: 0 },
        triagem: { total: 0 },
        gestao: { total: 0, distintos: 0 },
        gestaoMes: { total: 0, distintos: 0 },
        gestaoMonthLabel: "Acumulado do mês",
        producaoAndroid: { finalizado: 0, andamento: 0, pausado: 0, total: 0 },
        producaoIphone: { finalizado: 0, andamento: 0, pausado: 0, total: 0 },
        cqe: { aprovado: 0, reprovado: 0, total: 0 }
      });
    }
  },

  init() {
    const { reload } = SkylineDash.bindDateFilters({
      onChange: () => this.loadAndRender(),
      onReload: () => this.loadAndRender()
    });
  }
};
