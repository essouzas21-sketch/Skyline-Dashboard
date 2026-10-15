/**
 * Dashboard de produção (Android / iPhone).
 */
const ProducaoDash = {
  /**
   * Posições da Operação Skyline (PROD 1–18) → técnico.
   * match = início do nome no sistema (sem acento); use "|" para grafias alternativas.
   * Para trocar alguém de posição, altere só esta lista.
   */
  POSICOES: [
    { prod: 1, nome: "Victor", match: "victor guilherme|victor.guilherme" }, // só "victor" pegava também o "Joao Victor" (PROD10)
    { prod: 2, nome: "Noemi", match: "noemi" },
    { prod: 3, nome: "André", match: "andre" },
    { prod: 4, nome: "Fernanda", match: "fernanda" },
    { prod: 5, nome: "Fran", match: "fran dias" },
    { prod: 6, nome: "Jorge", match: "jorge" },
    { prod: 7, nome: "Karol", match: "karol" },
    { prod: 8, nome: "Fellipe Couto", match: "fellipe couto|fellipe.couto|felipe couto" },
    { prod: 9, nome: "Diego", match: "diego" },
    { prod: 10, nome: "João", match: "joao" },
    { prod: 11, nome: "Moisés", match: "moises" },
    { prod: 12, nome: "Claudia", match: "claudia" },
    { prod: 13, nome: null, match: null },
    { prod: 14, nome: "Rafael", match: "rafael pereira|rafael.pereira" },
    { prod: 15, nome: "Vinícius", match: "vinicius rodrigues|vinicius.rodrigues" },
    { prod: 16, nome: "Almir", match: "almir" },
    { prod: 17, nome: "Thaís Mazoline", match: "thais mazoline|thais.mazoline|tais mazoline" },
    { prod: 18, nome: "Kauan", match: "kaua" }
  ],

  /** "PROD 7 — Karol" (ou "PROD 13 — Sem técnico definido"). */
  rotuloPosicao(p) {
    return `PROD ${p.prod} — ${p.nome || "Sem técnico definido"}`;
  },

  /**
   * Telas de TV (producao-diversas-1…5 e producao-iphone): mesmas equipes das telas de
   * Gestão — Produção 1 = PROD 1–3 … Produção 6 = PROD 16–18. Tudo vem de POSICOES.
   */
  _grupoPosicoes(n) {
    const posicoes = this.POSICOES.filter((p) => p.prod > (n - 1) * 3 && p.prod <= n * 3);
    return {
      id: `p${n}`,
      title: `Produção ${n}`,
      subtitle: posicoes.map((p) => this.rotuloPosicao(p)).join(" · "),
      users: posicoes.map((p) => ({ match: p.match, label: this.rotuloPosicao(p), prod: p.prod }))
    };
  },

  get ANDROID_PANELS() {
    return [1, 2, 3, 4, 5].map((n) => this._grupoPosicoes(n));
  },

  get IPHONE_PANEL() {
    return this._grupoPosicoes(6);
  },

  /** Filtro de técnicos por módulo (só os designados em POSICOES). */
  get USER_FILTERS() {
    const matches = (grupos) => grupos.flatMap((n) => this._grupoPosicoes(n).users.map((u) => u.match)).filter(Boolean);
    return { android: matches([1, 2, 3, 4, 5]), iphone: matches([6]) };
  },

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

  /** Expediente produção Android: 07:00–16:48, almoço 12:00–13:00. */
  SHIFT_REPAIR: {
    dayStart: { h: 7, m: 0 },
    dayEnd: { h: 16, m: 48 },
    lunchStart: { h: 12, m: 0 },
    lunchEnd: { h: 13, m: 0 }
  },

  /** Colunas do heatmap gerencial (horário local, sem almoço). */
  REPAIR_HEATMAP_HOURS: [7, 8, 9, 10, 11, 13, 14, 15, 16],

  /** Reparos finalizados por hora local (Fim do Reparo). */
  buildRepairHourHeatmap(rows, dateField = "fim") {
    const hours = this.REPAIR_HEATMAP_HOURS;
    const byHour = SkylineDash.aggregateHourBuckets(rows, dateField, hours[0], hours[hours.length - 1], {
      useLocal: true,
      skipHours: [12]
    });
    const countMap = new Map(byHour.map(([label, count]) => [parseInt(label, 10), count]));
    return {
      hours,
      matrix: hours.map((h) => countMap.get(h) || 0)
    };
  },

  matchesRepairHour(row, hour, dateField = "fim") {
    const raw = row?.[dateField];
    if (!raw) return false;
    return SkylineDash.hourBucketFromIso(raw, true) === hour;
  },

  overlapMs(aStart, aEnd, bStart, bEnd) {
    const start = Math.max(aStart, bStart);
    const end = Math.min(aEnd, bEnd);
    return Math.max(0, end - start);
  },

  localDayStartMs(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  },

  localTimeOnDayMs(dayStartMs, h, m) {
    return dayStartMs + (h * 60 + m) * 60 * 1000;
  },

  getDayShiftWindows(dayStartMs, cfg = this.SHIFT_REPAIR) {
    const t = (h, m) => this.localTimeOnDayMs(dayStartMs, h, m);
    return [
      { start: t(cfg.dayStart.h, cfg.dayStart.m), end: t(cfg.lunchStart.h, cfg.lunchStart.m) },
      { start: t(cfg.lunchEnd.h, cfg.lunchEnd.m), end: t(cfg.dayEnd.h, cfg.dayEnd.m) }
    ];
  },

  /** Soma intervalos apenas dentro do expediente (manhã + tarde, sem almoço). */
  sumShiftIntervalsMs(intervals, cfg = this.SHIFT_REPAIR) {
    if (!intervals?.length) return 0;
    let total = 0;
    for (const { start, end } of intervals) {
      if (!start || !end || end <= start) continue;
      let dayStart = this.localDayStartMs(start);
      const lastDay = this.localDayStartMs(end);
      while (dayStart <= lastDay) {
        for (const w of this.getDayShiftWindows(dayStart, cfg)) {
          total += this.overlapMs(start, end, w.start, w.end);
        }
        dayStart += 86400000;
      }
    }
    return total;
  },

  /** Tempo em reparo no expediente, recortado ao período (evita aparelho aberto somar dias futuros). */
  calcShiftWorkMsInPeriod(raw, periodStart, periodEnd, nowMs = Date.now()) {
    if (!periodStart || !periodEnd) return 0;
    const bounds = this.periodBoundsMs(periodStart, periodEnd);
    const capEnd = Math.min(nowMs, bounds.end);
    const intervals = this.getWorkIntervals(raw, capEnd);
    let total = 0;
    for (const { start, end } of intervals) {
      const a = Math.max(start, bounds.start);
      const b = Math.min(end, bounds.end);
      if (b > a) total += this.sumShiftIntervalsMs([{ start: a, end: b }]);
    }
    return total;
  },

  calcWorkMs(raw, nowMs = Date.now(), periodStart = null, periodEnd = null) {
    const intervals = this.getWorkIntervals(raw, nowMs);
    return this.sumWorkIntervalsMs(intervals, periodStart, periodEnd);
  },

  /**
   * Tempo em reparo (Início → Fim, descontando pausas explícitas).
   * Com { shift: true }, conta só dentro do expediente 07:00–16:48 (exc. almoço 12–13h).
   */
  calcRepairTimes(raw, options = {}) {
    const inicio = this.parseDt(raw["Iniciado_Reparo"]);
    const fim = this.parseDt(raw["Fim do Reparo"]);
    if (!inicio || !fim) return null;

    const pauseIntervals = [];
    let pauseCount = 0;
    for (let i = 1; i <= 3; i++) {
      const p = this.parseDt(raw[`${i} Pausa`]);
      const r = this.parseDt(raw[`${i} Retorno`]);
      if (p && r) {
        const d = r.getTime() - p.getTime();
        if (d > 0) {
          pauseIntervals.push({ start: p.getTime(), end: r.getTime() });
          pauseCount++;
        }
      }
    }

    const workIntervals = this.getWorkIntervals(raw, fim.getTime());
    const cfg = options.shiftCfg || this.SHIFT_REPAIR;

    if (options.shift) {
      const workMs = this.sumShiftIntervalsMs(workIntervals, cfg);
      const pauseMs = this.sumShiftIntervalsMs(pauseIntervals, cfg);
      return { totalMs: workMs + pauseMs, pauseMs, workMs, pauseCount, shift: true };
    }

    const totalMs = Math.max(0, fim.getTime() - inicio.getTime());
    const pauseMs = pauseIntervals.reduce((acc, iv) => acc + (iv.end - iv.start), 0);
    return {
      totalMs,
      pauseMs,
      workMs: Math.max(0, totalMs - pauseMs),
      pauseCount
    };
  },

  fmtWorkMin(ms, digits = 2) {
    if (ms == null || Number.isNaN(ms)) return "—";
    return `${(ms / 60000).toFixed(digits).replace(".", ",")} min`;
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
      user: SkylineDash.normalizeUserName(user || "—"),
      _workRaw: raw
    };
  },

  /**
   * Telas de Produção: só reparos com alguma ação (início, pausa, retorno ou fim) a partir do MARCO_ZERO.
   * Antes disso tudo aparece zerado (Fin., tempo trabalhado, KPIs e gráficos). CQE/Consolidado não usam.
   */
  aPartirDoMarco(rows) {
    const desde = this.MARCO_ZERO;
    if (!desde) return rows;
    const campos = ["Iniciado_Reparo", "1 Pausa", "1 Retorno", "2 Pausa", "2 Retorno", "3 Pausa", "3 Retorno", "Fim do Reparo"];
    return (rows || []).filter((r) => campos.some((c) => {
      const d = this.parseDt(r?._workRaw?.[c]);
      return !!d && SkylineDash.toLocalDateStr(d.toISOString()) >= desde;
    }));
  },

  loadRows(json) {
    const rawList = SkylineDash.normalizeRows(json);
    this._ultimoRawReparo = rawList;
    const mapped = rawList
      .map((raw) => this.mapRow(raw))
      .filter((r) => this.DATE_FIELDS.some((f) => r[f]));
    return SkylineDash.distinctById(mapped, "id");
  },

  /**
   * O técnico bate com algum item do filtro? Compara pelo INÍCIO de cada palavra do nome
   * (ex.: "andre" bate com "André Guilherme", mas não com "Karoline Alexandre").
   * Um item pode ter alternativas separadas por "|" (ex.: "thais|tais").
   */
  matchesUserFilter(user, userFilter) {
    if (!userFilter || !userFilter.length) return true;
    const fold = (s) => String(s ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
    const norm = ` ${fold(user)}`;
    const tokens = userFilter
      .filter(Boolean)
      .flatMap((u) => String(u).split("|"))
      .map((t) => fold(t))
      .filter(Boolean);
    if (!tokens.length) return false;
    return tokens.some((t) => norm.includes(` ${t}`));
  },

  /** Consolidado: iPhone = descrição contém "Apple"; restante = Android.
   *  Só técnicos das Produções 1–6 (mesmas equipes das telas de gestão). */
  isAppleIphoneDescricao(descricao) {
    const fold = String(descricao || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return fold.includes("apple");
  },

  gestaoEquipeMatches() {
    if (typeof ProducaoGestao === "undefined" || !ProducaoGestao.GESTAO_PANELS) {
      return [];
    }
    return Object.values(ProducaoGestao.GESTAO_PANELS).flatMap((p) =>
      (p.users || []).map((u) => u.match).filter(Boolean)
    );
  },

  filterRowsByProduto(allRows, start, end, linha) {
    let filtered = SkylineDash.filterByAnyDateField(allRows, start, end, this.DATE_FIELDS);
    const team = this.gestaoEquipeMatches();
    if (team.length) {
      filtered = filtered.filter((row) => this.matchesUserFilter(row.user, team));
    }
    if (linha === "iphone") {
      filtered = filtered.filter((row) => this.isAppleIphoneDescricao(row.descricao));
    } else if (linha === "android") {
      filtered = filtered.filter((row) => !this.isAppleIphoneDescricao(row.descricao));
    }
    return filtered;
  },

  filterRows(allRows, start, end, moduleKey, userFilterOverride = undefined) {
    const userFilter =
      userFilterOverride !== undefined
        ? userFilterOverride
        : this.USER_FILTERS[moduleKey] || null;
    let filtered = SkylineDash.filterByAnyDateField(allRows, start, end, this.DATE_FIELDS);
    if (userFilter?.length) {
      filtered = filtered.filter((row) => this.matchesUserFilter(row.user, userFilter));
    }
    return filtered;
  },

  aggregatePanelUsers(filtered, panelUsers, start, end, recebidos = [], prontos = null) {
    const rows = panelUsers.map((u) => ({
      user: u.label,
      recebido: 0,
      finalizado: 0,
      pronto: 0,
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
      if (!prontos && row.status === "finalizado" && this.ehPronto(row._workRaw)) target.pronto++;
      target.total++;
      target.workMs += this.calcShiftWorkMsInPeriod(row._workRaw, start, end);
    });
    recebidos.forEach((row) => {
      // Alocação por endereço (PROD n) conta pela posição; início de reparo conta pelo técnico
      const idx =
        row.prod != null
          ? panelUsers.findIndex((u) => u.prod === row.prod)
          : panelUsers.findIndex((u) => this.matchesUserFilter(row.user, [u.match]));
      if (idx >= 0) rows[idx].recebido++;
    });
    (prontos || []).forEach((row) => {
      const idx = panelUsers.findIndex((u) => this.matchesUserFilter(row.user, [u.match]));
      if (idx >= 0) rows[idx].pronto++;
    });

    return rows;
  },

  /**
   * Mesma regra das telas de Gestão (Produção 1–6):
   * entra quem foi iniciado/retomado no período OU finalizado no período ("Fim do Reparo");
   * "Finalizados" = só o que teve fim dentro do período.
   */
  filterRowsPeriodo(allRows, start, end, userFilter) {
    const noPeriodo = (v) => {
      if (!v) return false;
      const d = SkylineDash.toLocalDateStr(v);
      return d >= start && d <= end;
    };
    let out = allRows.filter((r) =>
      this.DATE_FIELDS.some((f) => noPeriodo(r[f])) || noPeriodo(r._workRaw?.["Fim do Reparo"])
    );
    if (userFilter?.length) out = out.filter((r) => this.matchesUserFilter(r.user, userFilter));
    return out.map((r) => {
      const fim = r._workRaw?.["Fim do Reparo"];
      if (r.status !== "finalizado" || !fim) return r;
      const fimDia = SkylineDash.toLocalDateStr(fim);
      if (fimDia > end) return { ...r, status: "andamento" };
      if (fimDia < start) {
        const st = String(r._workRaw?.status || "").toLowerCase();
        return { ...r, status: st === "pausado" ? "pausado" : "andamento" };
      }
      return r;
    });
  },

  /**
   * PRONTO = reparo finalizado que foi para a qualidade (caixa "PRONTO" do técnico) e ainda
   * não passou pelo CQE depois dessa finalização. Sai da conta quando o CQE inspeciona.
   */
  /**
   * RECEBIDOS = aparelhos que saíram do processo anterior (triagem / gestão de peças) e foram
   * pegos pelo técnico para reparo no período: data "Iniciado_Reparo", técnico "Usuario inicio".
   */
  recebidosNoPeriodo(allRows, start, end, userFilter) {
    let out = allRows.filter((r) => {
      const ini = r._workRaw?.["Iniciado_Reparo"];
      if (!ini) return false;
      const d = SkylineDash.toLocalDateStr(ini);
      return d >= start && d <= end;
    }).map((r) => ({ ...r, user: SkylineDash.normalizeUserName(r._workRaw["Usuario inicio"] || r.user || "—") }));
    if (userFilter?.length) out = out.filter((r) => this.matchesUserFilter(r.user, userFilter));
    return out;
  },

  /**
   * RECEB. DIA por ENDEREÇO: tudo que foi alocado no endereço "PROD1" … "PROD18" no dia.
   * Fonte: API de movimentações de endereço (Supabase api-movimentacao-enderecos, GET
   * ?de&ate&limite&offset, header x-api-key = window.SKYLINE_MOVIMENTACAO_API_KEY em
   * skyline-chaves.js). Só LEITURA (GET) — o POST dessa API grava movimentações.
   * Só o endereço exato conta — "PROD12 PRONTO" é a caixa de pronto, não recebimento.
   * Sem chave, erro ou nenhuma alocação PROD no período → regra anterior (Iniciado_Reparo).
   */
  API_MOV_ENDERECOS: "https://lsinwtsolmmnnnuoziuv.supabase.co/functions/v1/api-movimentacao-enderecos",
  MOV_LIMITE: 1000,
  MOV_MAX_PAGINAS: 120,
  MOV_MAX_DIAS: 93,
  MOV_CACHE_MS: 300000,
  _movCache: {},

  prodDoEndereco(endereco) {
    const m = /^\s*PROD\s*[-_ ]?\s*0*(\d{1,2})\s*$/i.exec(String(endereco ?? ""));
    if (!m) return null;
    const n = Number(m[1]);
    return this.POSICOES.some((p) => p.prod === n) ? n : null;
  },

  _campo(raw, nomes) {
    for (const n of nomes) {
      const v = raw?.[n];
      if (v != null && String(v).trim() !== "" && String(v).toLowerCase() !== "null") return v;
    }
    return null;
  },

  /** Linhas cruas da API → [{ prod, serial, hu, endereco, created_at, raw }] (só PROD n exato). */
  loadMovimentosEndereco(payload, todos = false) {
    const lista = Array.isArray(payload) ? payload : SkylineDash.normalizeRows(payload);
    return lista
      .map((raw) => {
        // API nova: { imei, os, data, tipo, origem:{endereco}, destino:{endereco} } → vale o DESTINO
        const destinoObj = raw?.destino && typeof raw.destino === "object" ? raw.destino : null;
        const endereco = destinoObj
          ? (destinoObj.endereco != null ? String(destinoObj.endereco) : "")
          : this._campo(raw, ["endereco", "Endereco", "endereço", "endereco_destino", "destino"]);
        const prod = this.prodDoEndereco(endereco);
        if (prod == null && !todos) return null;
        if (endereco == null) return null;
        const created_at = this._campo(raw, ["created_at", "data_hora", "data_movimentacao", "criado_em", "data", "Data"]);
        if (!created_at || Number.isNaN(new Date(created_at).getTime())) return null;
        const serial = this._campo(raw, ["imei", "IMEI", "serial", "Serial"]);
        const hu = this._campo(raw, ["os", "OS", "hu_id", "hu", "HU"]);
        return { prod, serial: serial != null ? String(serial).trim() : null, hu: hu != null ? String(hu).trim() : null, endereco: String(endereco).trim(), created_at, raw };
      })
      .filter(Boolean);
  },

  /**
   * Alocações em PROD n no período. Um aparelho conta 1 vez por PROD e por dia
   * (bipado duas vezes no mesmo endereço no mesmo dia não duplica).
   */
  alocacoesEnderecoNoPeriodo(movs, start, end, prods = null) {
    const vistos = new Set();
    const out = [];
    (movs || []).forEach((m) => {
      if (prods && !prods.includes(m.prod)) return;
      const dia = SkylineDash.toLocalDateStr(m.created_at);
      if (dia < start || dia > end) return;
      const id = m.serial || m.hu;
      const chave = id ? `${m.prod}|${dia}|${id}` : null;
      if (chave) {
        if (vistos.has(chave)) return;
        vistos.add(chave);
      }
      out.push({ ...m, dia, user: `PROD ${m.prod}` });
    });
    return out;
  },

  async _movApiKey() {
    if (window.SKYLINE_MOVIMENTACAO_API_KEY) return window.SKYLINE_MOVIMENTACAO_API_KEY;
    try {
      await SkylineDash.getRecebimentoApiKey(); // carrega skyline-chaves.js se ainda não carregou
    } catch (_) { /* sem chaves */ }
    return window.SKYLINE_MOVIMENTACAO_API_KEY || null;
  },

  /** Busca (GET, paginado por limite/offset) as movimentações de start a end. null = indisponível. */
  async fetchMovimentosEndereco(start, end, todos = false) {
    if (SkylineDash.useHomologData && SkylineDash.useHomologData()) return null;
    const key = await this._movApiKey();
    if (!key || !start || !end) return null;
    let de = start;
    const maxIni = SkylineDash._isoAddDays ? SkylineDash._isoAddDays(end, -(this.MOV_MAX_DIAS - 1)) : start;
    if (de < maxIni) de = maxIni;
    const linhas = [];
    try {
      for (let pag = 0; pag < this.MOV_MAX_PAGINAS; pag++) {
        const qs = new URLSearchParams({ de, ate: end, limite: String(this.MOV_LIMITE), offset: String(pag * this.MOV_LIMITE) });
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 30000);
        let res;
        try {
          res = await fetch(`${this.API_MOV_ENDERECOS}?${qs}`, {
            method: "GET",
            cache: "no-store",
            headers: { "x-api-key": key },
            signal: ctrl.signal
          });
        } finally {
          clearTimeout(timer);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const page = Array.isArray(json) ? json : SkylineDash.normalizeRows(json);
        linhas.push(...page);
        if (page.length < this.MOV_LIMITE) break;
      }
      return this.loadMovimentosEndereco(linhas, todos);
    } catch (err) {
      console.warn("[Produção] movimentações de endereço indisponíveis, usando api-rastreio-imei:", err?.message || err);
      // Reserva: endereço ATUAL de cada aparelho pela api-rastreio-imei (todas as telas só precisam do último endereço)
      if (!todos) return null;
      try {
        const atuais = await this.enderecoAtualViaRastreio(key);
        return atuais ? this.loadMovimentosEndereco(atuais, todos) : null;
      } catch (err2) {
        console.warn("[Produção] api-rastreio-imei indisponível:", err2?.message || err2);
        return null;
      }
    }
  },

  /**
   * Reserva quando a api-movimentacao-enderecos está fora (503): api-rastreio-imei com eventos.
   * Para cada aparelho devolve 1 "movimentação" = endereço atual (estoque.endereco) com a data/hora
   * em que ele entrou nesse endereço (último evento de ESTOQUE para lá) — mesmo formato da API de
   * movimentações ({ imei, os, data, destino:{endereco} }).
   * Resultado compacto fica em localStorage por MOV_CACHE_MS e é compartilhado entre as telas de produção.
   */
  API_RASTREIO: "https://lsinwtsolmmnnnuoziuv.supabase.co/functions/v1/api-rastreio-imei",
  RASTREIO_CACHE_KEY: "skyline_prod_endereco_atual_v3",
  _rastreioPromise: null,

  async _rastreioPagina(key, offset) {
    let ultimo = null;
    for (let t = 1; t <= 3; t++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60000);
      try {
        const qs = new URLSearchParams({ limite: "200", offset: String(offset) });
        const res = await fetch(`${this.API_RASTREIO}?${qs}`, { cache: "no-store", headers: { "x-api-key": key }, signal: ctrl.signal });
        if (!res.ok) throw new Error(`api-rastreio-imei HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        ultimo = err && err.name === "AbortError" ? new Error("api-rastreio-imei sem resposta") : err;
        if (t < 3) await new Promise((r) => setTimeout(r, 1500 * t));
      } finally {
        clearTimeout(timer);
      }
    }
    throw ultimo;
  },

  async enderecoAtualViaRastreio(key) {
    try {
      const c = JSON.parse(localStorage.getItem(this.RASTREIO_CACHE_KEY) || "null");
      if (c && Array.isArray(c.linhas) && Date.now() - c.at < this.MOV_CACHE_MS) return c.linhas;
    } catch (_) { /* sem localStorage */ }
    if (this._rastreioPromise) return this._rastreioPromise;
    this._rastreioPromise = (async () => {
      const primeira = await this._rastreioPagina(key, 0);
      const total = Number(primeira.total) || (primeira.itens || []).length;
      const itens = [...(primeira.itens || [])];
      const offs = [];
      for (let o = 200; o < total; o += 200) offs.push(o);
      for (let i = 0; i < offs.length; i += 3) {
        const lote = await Promise.all(offs.slice(i, i + 3).map((o) => this._rastreioPagina(key, o)));
        lote.forEach((j) => itens.push(...(j.itens || [])));
      }
      const fim = (txt) => String(txt || "").split("/").pop().trim();
      const linhas = [];
      itens.forEach((x) => {
        const atual = String(x.estoque?.endereco || "").trim();
        if (!atual) return; // fora do estoque (vendido/expedido)
        const movs = (x.eventos || [])
          .filter((e) => e && e.etapa === "ESTOQUE" && e.detalhe?.destino && e.data)
          .sort((a, b) => String(a.data).localeCompare(String(b.data)));
        let quando = null;
        for (let i = movs.length - 1; i >= 0; i--) {
          if (fim(movs[i].detalhe.destino).toUpperCase() === atual.toUpperCase()) { quando = movs[i].data; break; }
        }
        // Entradas no endereço PROD n (transferências para a bancada), para o "Receb. Dia"
        const entradasProd = [];
        movs.forEach((e) => {
          const n = this.prodDoEndereco(fim(e.detalhe.destino));
          if (n != null) entradasProd.push({ prod: n, data: e.data });
        });
        linhas.push({ imei: x.imei, os: x.os, data: quando || x.estoque?.entrada_em || null, destino: { endereco: atual }, status_wms: x.status || null, entradasProd });
      });
      try {
        localStorage.setItem(this.RASTREIO_CACHE_KEY, JSON.stringify({ at: Date.now(), linhas }));
      } catch (_) { /* cota cheia: segue sem cache */ }
      return linhas;
    })();
    try {
      return await this._rastreioPromise;
    } finally {
      this._rastreioPromise = null;
    }
  },

  /**
   * Movimentações do período em cache (2 min). Devolve o que já tem (ou null) e, se precisar,
   * busca em segundo plano e chama onReady() quando chegar — a tela só re-renderiza.
   */
  movimentosEnderecoPeriodo(start, end, onReady, todos = false) {
    const k = `${start}|${end}|${todos ? "todos" : "prod"}`;
    const c = this._movCache[k];
    const fresco = c && Date.now() - c.at < this.MOV_CACHE_MS;
    if (!fresco && !(c && c.loading)) {
      this._movCache[k] = { at: c?.at || 0, data: c?.data ?? null, loading: true };
      this.fetchMovimentosEndereco(start, end, todos).then((data) => {
        this._movCache[k] = { at: Date.now(), data, loading: false };
        if (data?.length && typeof onReady === "function") onReady();
      });
    }
    return this._movCache[k]?.data ?? null;
  },

  /**
   * PRONTO acumulado (pós-finalização): todo aparelho com reparo finalizado — em qualquer dia —
   * que está na caixa PRONTO do técnico esperando o CQE (ainda não inspecionado depois da
   * finalização). Não depende do período filtrado: é o que está parado no PRONTO agora.
   * Técnico = quem finalizou ("Usuario final").
   */
  prontosAcumulados(allRows, userFilter) {
    let out = allRows
      .filter((r) => {
        const raw = r._workRaw || {};
        return String(raw.status || "").toLowerCase() === "finalizado" && this.ehPronto(raw);
      })
      .map((r) => ({ ...r, user: SkylineDash.normalizeUserName(r._workRaw["Usuario final"] || r.user || "—") }));
    if (userFilter?.length) out = out.filter((r) => this.matchesUserFilter(r.user, userFilter));
    return out;
  },

  /**
   * RECEB. DIA acumulado: aparelhos que ESTÃO AGORA no endereço PROD n (último endereço
   * registrado do aparelho = "PROD1" … "PROD18"), não importa em que dia foram colocados lá.
   * Usa as movimentações dos últimos MOV_JANELA_DIAS dias. null = sem dados de endereço.
   */
  MOV_JANELA_DIAS: 93,

  /**
   * MARCO ZERO da produção: a foto (Receb. Dia, Acumulado, Reparo, Pausa, Pronto) só considera o que
   * aconteceu a partir desta data — aparelho transferido para a PROD, reparo iniciado/retomado/pausado.
   * Tudo de antes fica de fora (sistema "zerado"). Para mudar o início, altere só esta data (AAAA-MM-DD).
   */
  MARCO_ZERO: "2026-10-16",
  noEnderecoProdAgora(onReady) {
    const hoje = SkylineDash.todayISO();
    const de = SkylineDash._isoAddDays(hoje, -(this.MOV_JANELA_DIAS - 1));
    const movs = this.movimentosEnderecoPeriodo(de, hoje, onReady, true);
    if (!movs?.length) return null;
    const ultimo = new Map();
    movs.forEach((m) => {
      const id = m.serial || m.hu;
      if (!id) return;
      const t = new Date(m.created_at).getTime();
      const atual = ultimo.get(id);
      if (!atual || t >= atual.t) ultimo.set(id, { t, m });
    });
    const out = [];
    ultimo.forEach(({ m }) => {
      if (m.prod != null) out.push({ ...m, dia: SkylineDash.toLocalDateStr(m.created_at), user: `PROD ${m.prod}` });
    });
    return out;
  },

  /** "PROD12 PRONTO" → 12 (caixa de prontos do técnico). */
  prodProntoDoEndereco(endereco) {
    const m = /^\s*PROD\s*[-_ ]?\s*0*(\d{1,2})\s*[-_ ]?\s*PRONTO\s*$/i.exec(String(endereco ?? ""));
    if (!m) return null;
    const n = Number(m[1]);
    return this.POSICOES.some((p) => p.prod === n) ? n : null;
  },

  /** Último endereço de cada aparelho (movimentações dos últimos MOV_JANELA_DIAS). null = sem dados. */
  ultimoEnderecoPorAparelho(onReady) {
    const hoje = SkylineDash.todayISO();
    const de = SkylineDash._isoAddDays(hoje, -(this.MOV_JANELA_DIAS - 1));
    const movs = this.movimentosEnderecoPeriodo(de, hoje, onReady, true);
    if (!movs?.length) return null;
    const ultimo = new Map();
    movs.forEach((m) => {
      const id = m.serial || m.hu;
      if (!id) return;
      const t = new Date(m.created_at).getTime();
      const atual = ultimo.get(id);
      if (!atual || t >= atual.t) ultimo.set(id, { t, m });
    });
    return [...ultimo.values()].map((x) => x.m);
  },

  /**
   * FOTO DA PRODUÇÃO (vale quando o período inclui hoje). Colunas:
   *  - Receb. Dia: aparelhos TRANSFERIDOS para o endereço PROD n no período (ex.: hoje 10 foram para a PROD 3).
   *  - Acumulado:  o que está AGORA na bancada (endereço PROD n), o técnico ainda não iniciou e ENTROU EM DIAS
   *                ANTERIORES ao período (o que entrou hoje e não iniciou está no Receb. Dia — recebidosNovos).
   *  - Reparo:     em reparo AGORA (status em execução), pelo técnico.
   *  - Pausa:      todos os pausados que estão parados na bancada do técnico (PROD n / PROD n PRONTO), de qualquer dia.
   *  - Fin.:       finalizados no período (fora daqui: filterRowsPeriodo / Fim do Reparo).
   *  - Pronto:     TODOS os prontos que ainda não foram para o CQE — reparo finalizado e o aparelho ainda no
   *                PROD n ou PROD n PRONTO (de qualquer dia). Já passou no CQE (aprovado / aguardando NF) não entra.
   * recebidos = acumulado; recebidosDia = Receb. Dia. null = sem dados de endereço (a tela usa a regra antiga).
   */
  fotoAgora(allRows, onReady) {
    const st = (r) => String(r?._workRaw?.status || "").toLowerCase();
    let reparo = allRows
      .filter((r) => st(r) === "em_execucao" || st(r) === "pausado")
      .map((r) => ({
        ...r,
        status: st(r) === "em_execucao" ? "andamento" : "pausado",
        user: SkylineDash.normalizeUserName(r._workRaw["Usuário reparo"] || r.user || "—")
      }));
    const ult = this.ultimoEnderecoPorAparelho(onReady);
    if (!ult) return { reparo, recebidos: null, recebidosDia: null, prontos: null, outraOperacao: [] };
    const porSerial = new Map();
    allRows.forEach((r) => {
      const s = String(r._workRaw?.serial ?? "").trim();
      if (s) porSerial.set(s, r);
    });
    const enderecoPorSerial = new Map();
    ult.forEach((m) => { if (m.serial) enderecoPorSerial.set(String(m.serial).trim(), m.endereco); });
    const periodo = (typeof SkylineDash.getDateRange === "function" && SkylineDash.getDateRange()) || {};
    const ini = periodo.start || SkylineDash.todayISO();
    const fimP = periodo.end || SkylineDash.todayISO();
    const noPeriodo = (iso) => !!iso && iso >= ini && iso <= fimP;
    const DESDE = this.MARCO_ZERO || "0000-00-00";
    const desdeMarco = (data) => !!data && SkylineDash.toLocalDateStr(data) >= DESDE;
    // última ação do reparo (início, retornos e pausas): precisa ser a partir do marco zero
    const acaoDesdeMarco = (raw) => ["Iniciado_Reparo", "1 Pausa", "1 Retorno", "2 Pausa", "2 Retorno", "3 Pausa", "3 Retorno"]
      .some((c) => { const d = this.parseDt(raw?.[c]); return !!d && desdeMarco(d.toISOString()); });
    reparo = reparo.filter((r) => acaoDesdeMarco(r._workRaw));

    /** Aparelhos fora da bancada do técnico (outra operação). */
    const outraOperacao = [];

    // PAUSA: só conta se o aparelho ainda está na bancada do técnico (PROD n / PROD n PRONTO).
    reparo = reparo.filter((r) => {
      if (r.status !== "pausado") return true; // em reparo agora: o técnico está com ele
      const serial = String(r._workRaw?.serial ?? "").trim();
      const end = serial ? enderecoPorSerial.get(serial) : null;
      if (!end) return true; // sem endereço conhecido: mantém
      const n = this.prodDoEndereco(end) ?? this.prodProntoDoEndereco(end);
      const pos = n != null ? this.POSICOES.find((p) => p.prod === n) : null;
      if (pos?.match && this.matchesUserFilter(r.user, [pos.match])) return true;
      outraOperacao.push({ ...r, endereco: end, motivo: `Pausado e já está em ${end}` });
      return false;
    });

    const hojeISO = SkylineDash.todayISO();
    const FINALIZADO_WMS = ["AGUARDANDO_CQE"]; // pronto e ainda não foi para o CQE
    const recebidos = [];
    const recebidosDia = [];
    const recebidosNovos = [];
    const prontos = [];
    ult.forEach((m) => {
      const row = (m.serial && porSerial.get(m.serial)) || null;
      const status = st(row);
      const wms = String(m.raw?.status_wms || "").toUpperCase();

      // RECEB. DIA: transferências para PROD n no período (1 por aparelho e PROD), esteja onde estiver agora
      const entradas = Array.isArray(m.raw?.entradasProd)
        ? m.raw.entradasProd
        : (m.prod != null ? [{ prod: m.prod, data: m.created_at }] : []);
      const jaContou = new Set();
      entradas.forEach((e) => {
        if (jaContou.has(e.prod) || !desdeMarco(e.data) || !noPeriodo(SkylineDash.toLocalDateStr(e.data))) return;
        jaContou.add(e.prod);
        recebidosDia.push({ ...m, prod: e.prod, created_at: e.data, _row: row, user: `PROD ${e.prod}` });
      });

      const nProd = this.prodDoEndereco(m.endereco);
      const nPronto = nProd == null ? this.prodProntoDoEndereco(m.endereco) : null;
      const n = nProd ?? nPronto;
      if (n == null) return;
      // Marco zero: só o que entrou na bancada (PROD n) a partir da data de início
      const entrouDesdeMarco = desdeMarco(m.created_at) || entradas.some((e) => e.prod === n && desdeMarco(e.data));
      if (!entrouDesdeMarco) return;
      if (status === "em_execucao" || status === "pausado") return; // conta em Reparo/Pausa
      if (!row && wms === "REPARO_PAUSADO") return;
      // Já passou pelo CQE (aprovado / aguardando NF): não é mais "pronto aguardando CQE"
      if (wms === "FINALIZADA" || wms === "APROVACAO_PENDENTE_NF") return;
      if (!wms && String(row?._workRaw?.decisao || "").toLowerCase() === "aprovado") return;
      const retrabalho = wms === "EM_REPARO" || status === "aguardando_inicio";
      const finalizado = !retrabalho && (status === "finalizado" || FINALIZADO_WMS.includes(wms));
      if (finalizado || (nPronto != null && !retrabalho && !status && !wms)) {
        prontos.push({ ...m, prod: n, _row: row, user: `PROD ${n}`, diaPronto: hojeISO });
        return;
      }
      // Na bancada e ainda não iniciado (qualquer etapa) / reprovado aguardando retrabalho:
      // entrou no endereço no período (hoje) → já está no Receb. Dia; entrou em dias anteriores → ACUMULADO
      const item = { ...m, prod: n, _row: row, user: `PROD ${n}` };
      if (noPeriodo(SkylineDash.toLocalDateStr(m.created_at))) recebidosNovos.push(item);
      else recebidos.push(item);
    });
    return { reparo, recebidos, recebidosNovos, recebidosDia, prontos, outraOperacao };
  },

  ehPronto(raw) {
    if (!raw || !raw["Fim do Reparo"]) return false;
    const fim = new Date(raw["Fim do Reparo"]).getTime();
    const q = raw.Data_qualidade ? new Date(raw.Data_qualidade).getTime() : null;
    return q == null || Number.isNaN(q) || q < fim;
  },

  initAndroidPage(panelIndex) {
    // 0–4 = Produção 1–5; 5 = Produção 6 (tela producao-iphone.html)
    const panel = panelIndex === 5 ? this.IPHONE_PANEL : this.ANDROID_PANELS[panelIndex];
    if (!panel) return;

    const API_URL = SkylineDash.API_REPARO;
    const statusEl = document.getElementById("statusMsg");
    const userFilter = panel.users.map((u) => u.match);
    const panelProds = panel.users.map((u) => u.prod);
    let allRows = [];
    /** Receb. Dia: alocações no endereço PROD n; sem dados de endereço no período → início do reparo. */
    const recebidosDoPainel = (start, end) => {
      const naProd = this.noEnderecoProdAgora(() => renderDashboard());
      if (naProd?.length) {
        return { fonte: "endereco", rows: naProd.filter((r) => panelProds.includes(r.prod)) };
      }
      return { fonte: "inicio", rows: this.recebidosNoPeriodo(allRows, start, end, userFilter) };
    };

    const renderTable = (filtered, start, end, recebidos = []) => {
      const tbody = document.getElementById("tableBody");
      const empty = document.getElementById("tableEmpty");
      if (!tbody || !empty) return;

      if (!panel.users.length) {
        tbody.innerHTML = "";
        empty.hidden = false;
        empty.textContent = "Sem colaboradores definidos.";
        return;
      }

      const list = this.aggregatePanelUsers(filtered, panel.users, start, end, recebidos);
      list.forEach((u) => { u.acumulado = null; });
      const hoje = SkylineDash.todayISO();
      if (end >= hoje) {
        const foto = this.fotoAgora(allRows, () => renderDashboard());
        list.forEach((u, i) => {
          const pu = panel.users[i];
          const doTec = (r) => !!pu.match && this.matchesUserFilter(r.user, [pu.match]);
          if (foto.recebidosDia) u.recebido = foto.recebidosDia.filter((r) => r.prod === pu.prod).length;
          if (foto.recebidos) u.acumulado = foto.recebidos.filter((r) => r.prod === pu.prod).length;
          const novosBancada = (foto.recebidosNovos || []).filter((r) => r.prod === pu.prod).length;
          u.andamento = foto.reparo.filter((r) => r.status === "andamento" && doTec(r)).length;
          u.pausado = foto.reparo.filter((r) => r.status === "pausado" && doTec(r)).length;
          if (foto.prontos) u.pronto = foto.prontos.filter((r) => r.prod === pu.prod).length;
          u.total = (u.acumulado != null ? u.acumulado + novosBancada : u.recebido) + u.andamento + u.pausado + u.pronto;
        });
        const soma = (k) => list.reduce((a, u) => a + u[k], 0);
        const setKpi = (id, v) => {
          const el = document.getElementById(id);
          if (el) el.textContent = v;
        };
        setKpi("kpiAndamento", soma("andamento"));
        setKpi("kpiPausado", soma("pausado"));
        setKpi("kpiTotal", soma("total"));
      }
      empty.hidden = true;
      tbody.innerHTML = list
        .map(
          (u) => `
        <tr>
          <td>${u.user}</td>
          <td style="color:#694992;font-weight:700">${u.recebido}</td>
          <td style="color:#694992;font-weight:700">${u.acumulado ?? "—"}</td>
          <td>${u.andamento}</td>
          <td>${u.pausado}</td>
          <td>${u.finalizado}</td>
          <td style="color:#0f766e;font-weight:700">${u.pronto}</td>
          <td style="font-weight:700">${u.total}</td>
          <td style="font-weight:700;color:var(--bg)">${SkylineDash.formatDuration(u.workMs)}</td>
        </tr>
      `
        )
        .join("");
    };

    const renderDashboard = () => {
      const { start, end } = SkylineDash.getDateRange();
      if (!start || !end) return;
      if (start > end) {
        SkylineDash.showStatus(statusEl, "A data inicial não pode ser maior que a data final.", true);
        return;
      }

      const filtered = this.filterRowsPeriodo(allRows, start, end, userFilter);
      const totals = this.computeTotals(filtered);

      document.getElementById("kpiFinalizado").textContent = totals.finalizado;
      document.getElementById("kpiAndamento").textContent = totals.andamento;
      document.getElementById("kpiPausado").textContent = totals.pausado;
      document.getElementById("kpiTotal").textContent = totals.total;
      document.getElementById("periodLabel").textContent =
        `Período: ${SkylineDash.formatPeriodBR(start, end)} · ${panel.subtitle} · tempo só no período filtrado`;

      const rec = recebidosDoPainel(start, end);
      renderTable(filtered, start, end, rec.rows);
      const thRec = Array.from(document.querySelectorAll("th")).find((th) => /receb/i.test(th.textContent));
      if (thRec) {
        thRec.title =
          rec.fonte === "endereco"
            ? "Aparelhos que estão no endereço PROD do técnico (acumulado, de qualquer dia)"
            : "Aparelhos pegos para reparo no dia (início do reparo) — trilha de endereços PROD sem dados no período";
      }

      SkylineDash.showStatus(
        statusEl,
        `Exibindo ${filtered.length} aparelho(s) no período · ${allRows.length} carregado(s).`,
        false
      );
    };

    const loadData = async () => {
      SkylineDash.showStatus(statusEl, "Carregando dados do endpoint…", false);
      try {
        const json = await SkylineDash.fetchWebhook(API_URL);
        allRows = this.aPartirDoMarco(this.loadRows(json));
        SkylineDash.showStatus(statusEl, `${allRows.length} único(s) carregado(s).`, false);
        renderDashboard();
      } catch (err) {
        SkylineDash.showStatus(statusEl, `Erro ao carregar: ${err.message}. Use http://localhost (CORS).`, true);
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

    const { reload } = SkylineDash.bindDateFilters({ onChange: renderDashboard, onReload: loadData });
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
    const API_URL = SkylineDash.API_REPARO;
    const statusEl = document.getElementById("statusMsg");
    let allRows = [];

    const renderDashboard = () => {
      const { start, end } = SkylineDash.getDateRange();
      if (!start || !end) return;
      if (start > end) {
        SkylineDash.showStatus(statusEl, "A data inicial não pode ser maior que a data final.", true);
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
        `Período: ${SkylineDash.formatPeriodBR(start, end)} · aparelhos no período · tempo só no período filtrado`;

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
            <td style="font-weight:700;color:var(--bg)">${SkylineDash.formatDuration(u.workMs)}</td>
          </tr>
        `).join("");
      }

      SkylineDash.showStatus(
        statusEl,
        `Exibindo ${filtered.length} aparelho(s) no período · ${allRows.length} carregado(s).`,
        false
      );
    };

    const loadData = async () => {
      SkylineDash.showStatus(statusEl, "Carregando dados do endpoint…", false);
      try {
        const json = await SkylineDash.fetchWebhook(API_URL);
        allRows = this.aPartirDoMarco(this.loadRows(json));
        SkylineDash.showStatus(statusEl, `${allRows.length} único(s) carregado(s).`, false);
        renderDashboard();
      } catch (err) {
        SkylineDash.showStatus(statusEl, `Erro ao carregar: ${err.message}. Use http://localhost (CORS).`, true);
        ["kpiFinalizado", "kpiAndamento", "kpiPausado", "kpiTotal"].forEach((id) => {
          document.getElementById(id).textContent = "0";
        });
        document.getElementById("tableBody").innerHTML = "";
        document.getElementById("tableEmpty").hidden = false;
      }
    };

    const { reload } = SkylineDash.bindDateFilters({ onChange: renderDashboard, onReload: loadData });
  }
};
