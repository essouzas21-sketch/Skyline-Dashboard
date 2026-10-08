/**
 * Fluxo por técnico — Iniciados x Finalizados x Acumulado.
 *
 * Regras (definidas com a gestão):
 *   Iniciado   = data "Iniciado_Reparo" (reparo começou no dia)
 *   Finalizado = data "Fim do Reparo"
 *   Acumulado anterior = aparelhos com reparo iniciado ANTES do período e ainda não
 *                        finalizados no início do período (qualquer data de entrada).
 *   Acumulado atual    = Acumulado anterior + Iniciados no período − Finalizados no período
 *   Retrabalho = aparelho já finalizado que voltou ao técnico (reprovado no CQE) e está de novo
 *                em reparo/pausado. Conta só em Retrabalho — nunca de novo no Acumulado/Iniciados.
 *   Acumulado atual (pendentes) = Acumulado anterior + Iniciados − Finalizados + Retrabalho
 *   % Finalização (dia) = finalizados no mesmo dia em que foram iniciados ÷ iniciados × 100
 *                        (sempre entre 0% e 100%).
 *
 * Cada aparelho pertence a UM técnico: o responsável atual (quem está com ele agora) ou,
 * se já foi finalizado, quem finalizou. Assim a conta fecha também por técnico.
 *
 * Funções puras (sem DOM) — usadas por cqe-gestao.html e testáveis em Node.
 */
const SkylineFluxoTecnico = {
  /**
   * Técnicos designados por posição de produção (planilha "Operação Skyline").
   * Só eles entram na aba Fluxo técnicos. Para mudar alguém, edite esta lista.
   * match = início do nome como aparece no sistema (sem acento, maiúsc./minúsc. tanto faz).
   * PROD13 está sem técnico definido.
   */
  EQUIPE: [
    { prod: "PROD1", match: "victor" },
    { prod: "PROD2", match: "noemi" },
    { prod: "PROD3", match: "andre" },
    { prod: "PROD4", match: "fernanda" },
    { prod: "PROD5", match: "fran dias" },
    { prod: "PROD6", match: "jorge" },
    { prod: "PROD7", match: "karol" },
    { prod: "PROD8", match: "felipe|fellipe" },
    { prod: "PROD9", match: "diego" },
    { prod: "PROD10", match: "joao" },
    { prod: "PROD11", match: "moises" },
    { prod: "PROD12", match: "claudia" },
    { prod: "PROD14", match: "rafael pereira|rafael.pereira" },
    { prod: "PROD15", match: "vinicius rodrigues|vinicius.rodrigues" },
    { prod: "PROD16", match: "almir" },
    { prod: "PROD17", match: "thais mazoline|thais.mazoline|tais mazoline" },
    { prod: "PROD18", match: "kaua" }
  ],

  fold(s) {
    return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  },

  /** Posição de produção do técnico (ex.: "PROD7") ou null se não for da equipe. */
  equipeDe(nome) {
    const n = this.fold(nome);
    if (!n || n === "—") return null;
    // Início de palavra; "a|b" = grafias alternativas
    const hit = this.EQUIPE.find((e) => String(e.match).split("|").some((t) => ` ${n}`.includes(` ${this.fold(t)}`)));
    return hit ? hit.prod : null;
  },

  isFilled(v) {
    return v != null && String(v).trim() !== "" && String(v).trim().toLowerCase() !== "null";
  },

  parseTs(v) {
    if (!this.isFilled(v)) return null;
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : t;
  },

  pick(raw, keys) {
    for (const k of keys) {
      if (this.isFilled(raw[k])) return String(raw[k]).trim();
    }
    return null;
  },

  localDay(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },

  /**
   * Técnico responsável pelo aparelho (mesma lógica das telas de Produção):
   * finalizado → "Usuario final"; pausado → usuário da última pausa;
   * em andamento → usuário do último retorno ou "Usuario inicio".
   */
  responsavel(raw, finalizado) {
    if (finalizado) return this.pick(raw, ["Usuario final", "Usuario inicio", "Usuário reparo"]);
    let maxPausa = 0;
    let maxRetorno = 0;
    for (let n = 3; n >= 1; n--) {
      if (!maxPausa && this.isFilled(raw[`${n} Pausa`])) maxPausa = n;
      if (!maxRetorno && this.isFilled(raw[`${n} Retorno`])) maxRetorno = n;
    }
    if (maxPausa && !this.isFilled(raw[`${maxPausa} Retorno`])) {
      const u = this.pick(raw, [`Usuario ${maxPausa} pausa`]);
      if (u) return u;
    }
    if (maxRetorno) {
      const u = this.pick(raw, [`Usuario ${maxRetorno} retorno`]);
      if (u) return u;
    }
    return this.pick(raw, ["Usuario inicio", "Usuário reparo", "Usuario final"]);
  },

  /**
   * Converte o payload bruto de reparo em 1 linha por aparelho/ciclo de reparo.
   * @param {object[]} rawRows   linhas da API de reparo
   * @param {object}   helpers   { normUser(name), describe(raw) -> {modelo, marca, linha, tipo} }
   */
  buildRows(rawRows, helpers = {}) {
    const normUser = helpers.normUser || ((n) => n);
    const describe = helpers.describe || (() => ({}));
    const byKey = new Map();

    (rawRows || []).forEach((raw) => {
      if (!raw || typeof raw !== "object") return;
      const iniTs = this.parseTs(raw["Iniciado_Reparo"] ?? raw.iniciado_reparo);
      const fimTs = this.parseTs(raw["Fim do Reparo"]);
      if (iniTs == null && fimTs == null) return;

      const id = this.isFilled(raw.id) ? String(raw.id).trim() : null;
      const serial = this.isFilled(raw.serial) ? String(raw.serial).trim() : null;
      const key = id ? `i:${id}` : serial ? `s:${serial}|${iniTs ?? fimTs}` : null;
      if (!key) return;

      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, { key, raw, iniTs, fimTs, rawIni: raw });
        return;
      }
      // Mesmo id repetido (ex.: várias peças): início = mais cedo, fim = mais tarde.
      if (iniTs != null && (prev.iniTs == null || iniTs < prev.iniTs)) {
        prev.iniTs = iniTs;
        prev.rawIni = raw;
      }
      if (fimTs != null && (prev.fimTs == null || fimTs > prev.fimTs)) {
        prev.fimTs = fimTs;
        prev.raw = raw;
      }
    });

    const out = [];
    byKey.forEach((r) => {
      // Sem início registrado: considera iniciado no próprio fim (efeito neutro no acumulado).
      const iniciadoTs = r.iniTs != null ? r.iniTs : r.fimTs;
      let finalizadoTs = r.fimTs;
      if (finalizadoTs != null && finalizadoTs < iniciadoTs) finalizadoTs = iniciadoTs;
      const finalizado = finalizadoTs != null;
      const raw = r.raw;
      const info = describe(raw) || {};
      const resp = this.responsavel(raw, finalizado) || this.responsavel(r.rawIni, finalizado) || "—";
      // Retrabalho: tem "Fim do Reparo" mas o sistema diz que voltou a estar em reparo/pausado
      let reabertoTs = null;
      const st = String(raw.status || "").toLowerCase();
      if (finalizado && (st === "pausado" || st === "em_execucao")) {
        const depois = [];
        for (let n = 1; n <= 3; n++) {
          [this.parseTs(raw[`${n} Pausa`]), this.parseTs(raw[`${n} Retorno`])]
            .forEach((t) => { if (t != null && t > finalizadoTs) depois.push(t); });
        }
        const q = this.parseTs(raw["Data_qualidade"]);
        reabertoTs = depois.length ? Math.min(...depois) : (q != null && q > finalizadoTs ? q : finalizadoTs);
      }
      out.push({
        key: r.key,
        id: raw.id ?? null,
        serial: String(raw.serial || "—").trim() || "—",
        nr: String(raw.NR || "—").trim() || "—",
        hu: String(raw.hu || "—").trim() || "—",
        modelo: info.modelo || String(raw.descricao || "—").trim() || "—",
        marca: info.marca || "—",
        linha: info.linha || "—",
        tipo: info.tipo || "—",
        iniciadoTs,
        finalizadoTs,
        iniciadoDia: this.localDay(iniciadoTs),
        finalizadoDia: finalizado ? this.localDay(finalizadoTs) : null,
        reabertoTs,
        reabertoDia: reabertoTs != null ? this.localDay(reabertoTs) : null,
        tecnico: normUser(resp),
        raw,
        tecnicoInicio: normUser(this.pick(r.rawIni, ["Usuario inicio", "Usuário reparo"]) || resp)
      });
    });
    return out;
  },

  /**
   * Situação de um aparelho em aberto num instante (fim do período):
   * "pausado" se a última pausa até esse instante não tem retorno; senão "reparo".
   */
  situacaoEm(raw, ateTs) {
    let ultPausa = null;
    let ultRetorno = null;
    for (let n = 1; n <= 3; n++) {
      const p = this.parseTs(raw?.[`${n} Pausa`]);
      const r = this.parseTs(raw?.[`${n} Retorno`]);
      if (p != null && p <= ateTs && (ultPausa == null || p > ultPausa)) ultPausa = p;
      if (r != null && r <= ateTs && (ultRetorno == null || r > ultRetorno)) ultRetorno = r;
    }
    return ultPausa != null && (ultRetorno == null || ultRetorno < ultPausa) ? "pausado" : "reparo";
  },

  /** Lista de dias YYYY-MM-DD entre start e end (inclusive). */
  daysBetween(start, end) {
    const days = [];
    const d = new Date(`${start}T12:00:00`);
    const last = new Date(`${end}T12:00:00`);
    while (d <= last && days.length < 400) {
      days.push(this.localDay(d.getTime()));
      d.setDate(d.getDate() + 1);
    }
    return days;
  },

  /**
   * Calcula os indicadores do período.
   * @param {object[]} rows   saída de buildRows (já com filtros de modelo/marca etc.)
   * @param {string}   start  YYYY-MM-DD
   * @param {string}   end    YYYY-MM-DD
   * @param {object}   opts   { tecnico: nome exato ou "", inTeam(nome) -> bool, hourFrom, hourTo }
   */
  compute(rows, start, end, opts = {}) {
    const tecnico = opts.tecnico || "";
    const inTeam = typeof opts.inTeam === "function" ? opts.inTeam : () => true;
    const hourFrom = opts.hourFrom ?? 7;
    const hourTo = opts.hourTo ?? 18;
    const singleDay = start === end;

    const byTec = new Map();
    const tec = (nome) => {
      if (!byTec.has(nome)) {
        byTec.set(nome, { nome, comAgora: 0, anterior: 0, iniciados: 0, finalizados: 0, finalizadosMesmoDia: 0, retrabalho: 0, retrabalhoInicio: 0 });
      }
      return byTec.get(nome);
    };

    // Série: hora a hora quando o período é 1 dia; dia a dia nos demais
    const buckets = singleDay
      ? Array.from({ length: hourTo - hourFrom + 1 }, (_, i) => ({
          key: hourFrom + i,
          label: `${String(hourFrom + i).padStart(2, "0")}h`,
          iniciados: 0,
          finalizados: 0
        }))
      : this.daysBetween(start, end).map((day) => ({
          key: day,
          label: day.slice(8, 10) + "/" + day.slice(5, 7),
          iniciados: 0,
          finalizados: 0
        }));
    const bucketIdx = new Map(buckets.map((b, i) => [b.key, i]));
    const bucketFor = (ts, day) => {
      if (!singleDay) return bucketIdx.get(day);
      const h = new Date(ts).getHours();
      return bucketIdx.get(Math.min(hourTo, Math.max(hourFrom, h)));
    };

    const iniciadosNoPeriodo = [];
    const finalizadosNoPeriodo = [];
    const anteriorRows = [];
    const pendentesFim = [];
    const comAgoraRows = [];
    const retrabalhoRows = [];
    let retrabalhoInicio = 0;

    rows.forEach((r) => {
      const t = r.tecnico;
      if (!inTeam(t) || (tecnico && t !== tecnico)) return;
      const ini = r.iniciadoDia;
      const fim = r.finalizadoDia;
      const o = tec(t);

      // Retrabalho: voltou ao técnico depois de finalizado (reaberto até o fim do período).
      // Entra só aqui (não no Acumulado anterior nem nos Iniciados) e vira pendente.
      if (r.reabertoDia != null && r.reabertoDia <= end && fim != null && fim <= end) {
        // Conta SÓ como retrabalho: não entra no Acumulado anterior, Iniciados nem Finalizados.
        o.retrabalho += 1;
        o.comAgora += 1;
        retrabalhoRows.push(r);
        pendentesFim.push(r);
        if (r.reabertoDia < start) {
          o.retrabalhoInicio += 1;
          retrabalhoInicio += 1;
        } else {
          const bi = bucketFor(r.reabertoTs, r.reabertoDia);
          if (bi != null) buckets[bi].retrabalho = (buckets[bi].retrabalho || 0) + 1;
        }
        return;
      }


      // Com o técnico agora: reparo iniciado e ainda não finalizado (independe do período)
      if (fim == null) {
        o.comAgora += 1;
        comAgoraRows.push(r);
      }
      // Acumulado anterior: iniciado antes do período e não finalizado antes dele
      if (ini < start && (fim == null || fim >= start)) {
        o.anterior += 1;
        anteriorRows.push(r);
      }
      // Iniciados no período
      if (ini >= start && ini <= end) {
        o.iniciados += 1;
        iniciadosNoPeriodo.push(r);
        if (fim === ini) o.finalizadosMesmoDia += 1;
        const bi = bucketFor(r.iniciadoTs, ini);
        if (bi != null) buckets[bi].iniciados += 1;
      }
      // Finalizados no período (qualquer data de início)
      if (fim != null && fim >= start && fim <= end) {
        o.finalizados += 1;
        finalizadosNoPeriodo.push(r);
        const bi = bucketFor(r.finalizadoTs, fim);
        if (bi != null) buckets[bi].finalizados += 1;
      }
      // Pendente ao fim do período
      if (ini <= end && (fim == null || fim > end)) pendentesFim.push(r);
    });

    const finish = (o) => {
      const acumulado = o.anterior + o.iniciados - o.finalizados + (o.retrabalho || 0);
      return {
        ...o,
        acumulado,
        variacao: acumulado - o.anterior,
        pctDia: o.iniciados ? (o.finalizadosMesmoDia / o.iniciados) * 100 : null
      };
    };

    const porTecnico = [...byTec.values()]
      .map(finish)
      .filter((x) => x.comAgora || x.anterior || x.iniciados || x.finalizados || x.retrabalho)
      .sort((a, b) => b.acumulado - a.acumulado || b.iniciados - a.iniciados || a.nome.localeCompare(b.nome, "pt-BR"));

    const total = finish(
      porTecnico.reduce(
        (acc, x) => {
          acc.comAgora += x.comAgora;
          acc.anterior += x.anterior;
          acc.iniciados += x.iniciados;
          acc.finalizados += x.finalizados;
          acc.finalizadosMesmoDia += x.finalizadosMesmoDia;
          acc.retrabalho += x.retrabalho;
          acc.retrabalhoInicio += x.retrabalhoInicio;
          return acc;
        },
        { nome: "Total", comAgora: 0, anterior: 0, iniciados: 0, finalizados: 0, finalizadosMesmoDia: 0, retrabalho: 0, retrabalhoInicio: 0 }
      )
    );

    let run = total.anterior + retrabalhoInicio;
    buckets.forEach((b) => {
      run += b.iniciados - b.finalizados + (b.retrabalho || 0);
      b.acumulado = run;
    });

    return {
      singleDay,
      total,
      porTecnico,
      serie: buckets,
      iniciadosNoPeriodo,
      finalizadosNoPeriodo,
      anteriorRows,
      pendentesFim,
      retrabalhoRows,
      retrabalhoInicio,
      comAgoraRows
    };
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = SkylineFluxoTecnico;
}
