window.__ModuleLoader__.load({ id: "dsh-dashboards", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/DashboardView.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/DashboardView.module.css
var css = "/* dsh-dashboards \u2014 \u770B\u677F tab \u6837\u5F0F\u3002\u53EA\u4F7F\u7528 --dsw-alias-* \u767D\u540D\u5355\u4EE4\u724C\uFF0C\u968F\u6D45/\u6DF1\u4E3B\u9898\u3002 */\n\n._63a9f0ea_root {\n  padding: 4px 2px 24px;\n  /* \u770B\u677F\u7528\u6EE1\u4F1A\u8BDD\u533A\u5BBD\u5EA6\uFF08\u5217\u6570\u7531 column-width \u81EA\u9002\u5E94\uFF0C\u5BBD\u5C4F\u66F4\u591A\u5217\uFF09 */\n  max-width: none;\n}\n\n._099fb995_header {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 8px;\n  margin-bottom: 10px;\n}\n\n._d5d3db17_title {\n  margin: 0;\n  font-size: 14px;\n  font-weight: 700;\n  color: var(--dsw-alias-label-primary);\n}\n\n._d4f5c2c9_btn {\n  padding: 2px 10px;\n  border-radius: 6px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-label-primary);\n  font-size: 12px;\n  cursor: pointer;\n}\n\n._d4f5c2c9_btn:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n._d4f5c2c9_btn:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n/* \u7011\u5E03\u6D41\uFF1ACSS \u591A\u5217\uFF08column-width \u81EA\u52A8\u5217\u6570\uFF09\u3002\u539F\u751F grid masonry \u4EC5 Firefox\n   \u652F\u6301\u3001Chrome/WebKit \u672A\u843D\u5730\uFF082026\uFF09\uFF0C\u591A\u5217\u662F\u552F\u4E00\u5168\u6D4F\u89C8\u5668\u7EAF CSS \u65B9\u6848\uFF0C\n   \u4E14\u5BF9\u5B9E\u65F6\u5237\u65B0\u53CB\u597D\uFF08\u65E0 JS \u91CD\u6392\u3001\u5361\u7247\u9AD8\u5EA6\u53D8\u5316\u4E0D\u6296\u52A8\uFF09\u3002 */\n._ff4a0084_grid {\n  column-width: 320px;\n  column-gap: 10px;\n}\n\n._5dd2199a_card {\n  background: var(--dsw-alias-bg-layer-1);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 10px;\n  padding: 8px 12px 10px;\n  min-width: 0;\n  /* \u5185\u5BB9\uFF08\u5BBD\u8868\u683C\uFF09\u6C38\u4E0D\u6EA2\u51FA\u5230\u76F8\u90BB\u5361\u7247\u2014\u2014\u91CD\u53E0\u6839\u56E0\u4FEE\u590D */\n  overflow: hidden;\n  /* \u7011\u5E03\u6D41\uFF1A\u5361\u7247\u4E0D\u8DE8\u5217\u62C6\u65AD\uFF1B\u5217\u5185\u5782\u76F4\u95F4\u8DDD\u7528 margin \u66FF\u4EE3 gap */\n  break-inside: avoid;\n  margin-bottom: 10px;\n}\n\n._4ce8a2a4_cardHeader {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin-bottom: 6px;\n}\n\n._64756b1d_cardTitle {\n  margin: 0;\n  font-size: 12px;\n  font-weight: 700;\n  color: var(--dsw-alias-label-primary);\n}\n\n._0f0532c9_cardMeta {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n}\n\n._2ed47cf3_cardBody {\n  font-size: 12px;\n  line-height: 1.7;\n  color: var(--dsw-alias-label-primary);\n  /* \u5BBD\u8868\u683C\u5728\u5361\u5185\u6A2A\u5411\u6EDA\u52A8\uFF0C\u4E0D\u6491\u7834\u5361\u7247 */\n  overflow-x: auto;\n}\n\n._0a4e1e62_muted {\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n._cb5e100e_error {\n  font-size: 12px;\n  color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 55%, var(--dsw-alias-label-primary));\n  margin: 4px 0;\n}\n\n._55da759e_pillRow {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin-bottom: 8px;\n}\n\n._2ec840f1_pill {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  padding: 1px 8px;\n  border-radius: 999px;\n  font-size: 11px;\n  font-weight: 600;\n  color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 55%, var(--dsw-alias-label-primary));\n  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, var(--dsw-alias-bg-layer-1));\n  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-success-secondary) 55%, transparent);\n}\n\n._87b495f1_pillDim {\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-bg-layer-2);\n  border-color: var(--dsw-alias-border-l2);\n}\n\n._d5b484f4_pillWarn {\n  color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 55%, var(--dsw-alias-label-primary));\n  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, var(--dsw-alias-bg-layer-1));\n  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-secondary) 55%, transparent);\n}\n\n._aab9e1de_table {\n  width: 100%;\n  border-collapse: collapse;\n  font-size: 12px;\n}\n\n._aab9e1de_table th {\n  text-align: left;\n  font-weight: 600;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n  padding: 3px 6px;\n  border-bottom: 1px solid var(--dsw-alias-border-l2);\n}\n\n._aab9e1de_table td {\n  padding: 3px 6px;\n  color: var(--dsw-alias-label-primary);\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n  white-space: nowrap;\n}\n\n/* \u6587\u672C\u5217\uFF08\u8282\u70B9\u540D+hostLabel \u7B49\uFF09\u5141\u8BB8\u6362\u884C\uFF0C\u907F\u514D nowrap \u6491\u7206\u5361\u7247 */\n._aab9e1de_table td._ccfc59a5_wrap {\n  white-space: normal;\n}\n\n._a7e39120_hostSub {\n  display: block;\n  font-size: 10px;\n  line-height: 1.4;\n}\n\n._aab9e1de_table td._0fc3cfbc_num {\n  font-variant-numeric: tabular-nums;\n  text-align: right;\n}\n\n._654db8a1_mono {\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  font-size: 11px;\n}\n\n._c2a0cd67_rowDot {\n  display: inline-flex;\n  vertical-align: -1px;\n  margin-right: 5px;\n}\n\n._3dc3eba7_okText { color: var(--dsw-alias-state-success-primary); }\n._02264ca6_errText { color: var(--dsw-alias-state-error-primary); }\n._e59c4baf_warnText { color: var(--dsw-alias-state-warn-primary); }\n\n._3d4dcd6f_legend {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 10px;\n  margin-top: 4px;\n  font-size: 11px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n._56def06e_legendItem {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n}\n\n._81280475_legendDot {\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  display: inline-block;\n}\n";
var tagId = "dsh-dashboards/DashboardView.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-dashboards";
  tag.dataset.pluginCss = tagId;
  tag.textContent = css;
  document.head.appendChild(tag);
}
var DashboardView_default = { "cardHeader": "_4ce8a2a4_cardHeader", "legendItem": "_56def06e_legendItem", "cardTitle": "_64756b1d_cardTitle", "legendDot": "_81280475_legendDot", "cardMeta": "_0f0532c9_cardMeta", "cardBody": "_2ed47cf3_cardBody", "pillWarn": "_d5b484f4_pillWarn", "warnText": "_e59c4baf_warnText", "pillRow": "_55da759e_pillRow", "pillDim": "_87b495f1_pillDim", "hostSub": "_a7e39120_hostSub", "errText": "_02264ca6_errText", "header": "_099fb995_header", "rowDot": "_c2a0cd67_rowDot", "okText": "_3dc3eba7_okText", "legend": "_3d4dcd6f_legend", "title": "_d5d3db17_title", "muted": "_0a4e1e62_muted", "error": "_cb5e100e_error", "table": "_aab9e1de_table", "root": "_63a9f0ea_root", "grid": "_ff4a0084_grid", "card": "_5dd2199a_card", "pill": "_2ec840f1_pill", "wrap": "_ccfc59a5_wrap", "mono": "_654db8a1_mono", "btn": "_d4f5c2c9_btn", "num": "_0fc3cfbc_num" };

// src/client/DashboardView.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var fmtUsd = (v) => {
  if (v == null) return "\u2014";
  if (v >= 100) return `$${v.toFixed(0)}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(3)}`;
};
var fmtTokens = (v) => {
  if (v == null) return "\u2014";
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
  return String(v);
};
var fmtDur = (ms) => {
  if (ms == null) return "\u2014";
  if (ms < 1e3) return `${ms.toFixed(0)}ms`;
  const s = ms / 1e3;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, "0")}s`;
};
var pct = (v) => v == null ? "\u2014" : `${v.toFixed(1)}%`;
function useWidgetFetch(endpoint, refreshMs) {
  const [snap, setSnap] = (0, import_react.useState)({});
  const [loading, setLoading] = (0, import_react.useState)(false);
  const timerRef = (0, import_react.useRef)(null);
  const load = (0, import_react.useCallback)(async (force = false) => {
    setLoading(true);
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(1e4) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setSnap(force ? { ...d } : d);
    } catch (e) {
      setSnap((s) => ({ ...s, error: String(e) }));
    } finally {
      setLoading(false);
    }
  }, [endpoint]);
  (0, import_react.useEffect)(() => {
    void load();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      void load();
    }, Math.max(refreshMs, 5e3));
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load, refreshMs]);
  return { snap, loading, reload: () => void load(true) };
}
function StatCard({ data, t }) {
  if (data == null || typeof data !== "object") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u2014" });
  }
  const d = data;
  if (d.totals) {
    const tot = d.totals;
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.pillRow, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
          t("col.cost"),
          " ",
          fmtUsd(tot.estimatedCostUsd)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
          t("col.tokens"),
          " ",
          fmtTokens(tot.totalTokens)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
          t("col.cache"),
          " ",
          tot.cacheHitRate != null ? `${(tot.cacheHitRate * 100).toFixed(1)}%` : "\u2014"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
          t("col.calls"),
          " ",
          tot.modelResponseCount ?? "\u2014"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
          t("col.sessions"),
          " ",
          tot.sessionCount ?? "\u2014"
        ] }),
        tot.cacheSavingsUsd != null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: DashboardView_default.pill, children: [
          "\u7F13\u5B58\u8282\u7701 ",
          fmtUsd(tot.cacheSavingsUsd)
        ] })
      ] }),
      (d.byProviderModel ?? []).length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: DashboardView_default.table, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("col.model") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: DashboardView_default.num, children: t("col.calls") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: DashboardView_default.num, children: t("col.cost") })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: (d.byProviderModel ?? []).slice(0, 6).map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: r.model ?? r.provider ?? "\u2014" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: DashboardView_default.num, children: r.calls ?? "\u2014" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: DashboardView_default.num, children: fmtUsd(r.costUsd) })
        ] }, i)) })
      ] })
    ] });
  }
  if (d.memory) {
    const mem = d.memory;
    const load = d.loadavg;
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.pillRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        "\u5185\u5B58 ",
        pct(mem.usedPct)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        "\u53EF\u7528 ",
        mem.availMb != null ? `${(mem.availMb / 1024).toFixed(1)}G` : "\u2014",
        "/",
        mem.totalMb != null ? `${(mem.totalMb / 1024).toFixed(0)}G` : "\u2014"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        "load ",
        load?.load1 != null ? load.load1.toFixed(2) : "\u2014",
        " / ",
        load?.load5 != null ? load.load5.toFixed(2) : "\u2014"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        "CPU ",
        pct(d.cpu?.usedPct)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        "\u8FDB\u7A0B ",
        d.processCount ?? "\u2014"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        "\u2193",
        d.net?.inBps != null ? `${(d.net.inBps / 1024).toFixed(0)}K` : "\u2014",
        " \u2191",
        d.net?.outBps != null ? `${(d.net.outBps / 1024).toFixed(0)}K` : "\u2014"
      ] })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: t("noData") });
}
function NodeMatrix({ data, t }) {
  const rows = data ?? [];
  if (!rows.length) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: t("noData") });
  const dot = (s) => s === "online" ? "done" : s === "offline" ? "error" : "warning";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: DashboardView_default.table, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("col.node") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("col.status") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: DashboardView_default.num, children: t("col.load") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: DashboardView_default.num, children: t("col.mem") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("col.platform") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: DashboardView_default.num, children: t("col.heartbeat") })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: rows.map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { className: DashboardView_default.wrap, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.mono, children: n.nodeId }),
        n.hostLabel ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `${DashboardView_default.muted} ${DashboardView_default.hostSub}`, children: n.hostLabel }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.rowDot, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: dot(n.status ?? "?"), size: 8 }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: n.status === "online" ? DashboardView_default.okText : n.status === "offline" ? DashboardView_default.errText : DashboardView_default.warnText, children: n.status ?? "?" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: DashboardView_default.num, children: n.capacity?.cpuLoad1m != null ? n.capacity.cpuLoad1m.toFixed(2) : "\u2014" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { className: DashboardView_default.num, children: [
        n.capacity?.memoryAvailableMb != null ? `${(n.capacity.memoryAvailableMb / 1024).toFixed(1)}G` : "\u2014",
        n.capacity?.memoryTotalMb != null ? `/${(n.capacity.memoryTotalMb / 1024).toFixed(0)}G` : ""
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
        n.capacity?.platform ?? "\u2014",
        n.capacity?.arch ? ` ${n.capacity.arch}` : ""
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: DashboardView_default.num, children: n.heartbeatAgeSec != null ? `${n.heartbeatAgeSec}s` : "\u2014" })
    ] }, n.nodeId)) })
  ] });
}
function Sparkline({ series }) {
  const W = 300;
  const H = 56;
  const P = 3;
  const paths = series.map((s) => {
    const nums = s.values.filter((v) => v != null);
    if (!nums.length) return null;
    const max = Math.max(...nums, 1e-6);
    const min = Math.min(...nums, 0);
    const range = max - min || 1;
    const pts = nums.map((v, i) => {
      const x = P + i / Math.max(nums.length - 1, 1) * (W - P * 2);
      const y = H - P - (v - min) / range * (H - P * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return {
      name: s.name,
      color: s.color,
      last: nums[nums.length - 1],
      d: `M${pts.join(" L")}`
    };
  });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H, role: "img", "aria-label": "sparkline", children: paths.filter((p) => p !== null).map((p, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("polyline", { points: p.d.slice(1), fill: "none", stroke: p.color, strokeWidth: "1.6", strokeLinejoin: "round" }, i)) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: DashboardView_default.legend, children: paths.filter((p) => p !== null).map((p, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: DashboardView_default.legendItem, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.legendDot, style: { background: p.color } }),
      p.name,
      " ",
      p.last != null ? p.last >= 1e3 ? `${(p.last / 1e3).toFixed(1)}k` : p.last.toFixed(1) : "\u2014"
    ] }, i)) })
  ] });
}
function TrendChart({ data }) {
  if (data == null || typeof data !== "object") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u2014" });
  }
  const d = data;
  const COLORS = [
    "color-mix(in srgb, var(--dsw-alias-brand-primary) 80%, transparent)",
    "color-mix(in srgb, var(--dsw-alias-state-warn-primary) 80%, transparent)",
    "color-mix(in srgb, var(--dsw-alias-state-success-primary) 80%, transparent)",
    "color-mix(in srgb, var(--dsw-alias-state-error-primary) 70%, transparent)"
  ];
  if (d.series) {
    const series = d.series.filter((s) => (s.points ?? []).length > 1).slice(0, 4).map((s, i) => ({
      name: `${s.model ?? s.provider ?? "?"}`,
      color: COLORS[i % COLORS.length],
      values: (s.points ?? []).map((p) => p.avgDurationMs ?? null)
    }));
    if (!series.length) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u65E0\u8D8B\u52BF\u6570\u636E" });
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkline, { series });
  }
  if (d.points) {
    const pts = d.points;
    if (pts.length < 2) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u7B49\u5F85\u91C7\u6837\u2026" });
    const series = [
      { name: "load1", color: COLORS[0], values: pts.map((p) => p.load1 ?? null) },
      { name: "mem%", color: COLORS[1], values: pts.map((p) => p.memUsedPct ?? null) }
    ];
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkline, { series });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u65E0\u56FE\u8868\u6570\u636E" });
}
function ListCard({ data }) {
  if (data == null || typeof data !== "object") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u2014" });
  }
  const d = data;
  if (d.reason && !d.results && !d.monitors) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: d.reason });
  if (d.monitors) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: DashboardView_default.table, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u670D\u52A1" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u72B6\u6001" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: DashboardView_default.num, children: "\u5EF6\u8FDF" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: DashboardView_default.num, children: "uptime" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tbody", { children: [
        d.monitors.map((m, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: m.name ?? "\u2014" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.rowDot, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: m.status === "up" ? "done" : m.status === "down" ? "error" : "warning", size: 8 }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: m.status === "up" ? DashboardView_default.okText : m.status === "down" ? DashboardView_default.errText : DashboardView_default.warnText, children: m.status ?? "\u2014" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: DashboardView_default.num, children: m.latency != null ? fmtDur(m.latency) : "\u2014" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: DashboardView_default.num, children: m.uptime != null ? `${m.uptime.toFixed(1)}%` : "\u2014" })
        ] }, i)),
        !d.monitors.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { colSpan: 4, className: DashboardView_default.muted, children: "\u65E0 monitor\uFF08Kuma \u4FA7\u672A\u914D\u7F6E\uFF09" }) })
      ] })
    ] });
  }
  const results = d.results ?? [];
  const down = results.filter((r) => !r.ok);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: DashboardView_default.pillRow, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${down.length ? DashboardView_default.pillWarn : DashboardView_default.pill}`, children: [
      d.ok ?? results.length - down.length,
      "/",
      d.total ?? results.length,
      " up"
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: DashboardView_default.table, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u670D\u52A1" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u72B6\u6001" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: DashboardView_default.num, children: "\u5EF6\u8FDF" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u8BE6\u60C5" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: results.map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: r.name ?? "\u2014" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.rowDot, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: r.ok ? "done" : "error", size: 8 }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: r.ok ? DashboardView_default.okText : DashboardView_default.errText, children: r.ok ? "up" : "down" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: DashboardView_default.num, children: r.latencyMs != null ? `${r.latencyMs}ms` : "\u2014" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: DashboardView_default.muted, children: r.detail ?? "\u2014" })
      ] }, i)) })
    ] })
  ] });
}
function WidgetCard({ widget, t }) {
  const { snap, loading, reload } = useWidgetFetch(widget.endpoint, widget.refreshMs);
  const d = snap.data;
  const hasError = !!(snap.error || d?.error);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: DashboardView_default.card, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: DashboardView_default.cardHeader, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.cardTitle, children: widget.title }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: DashboardView_default.cardMeta, children: [
        snap.ts ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: DashboardView_default.muted, children: [
          t("updated"),
          " ",
          new Date(snap.ts).toLocaleTimeString()
        ] }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: DashboardView_default.btn, onClick: reload, disabled: loading, children: loading ? "\u2026" : t("refresh") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: DashboardView_default.cardBody, children: hasError ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: DashboardView_default.error, children: [
      "\u26A0\uFE0F ",
      snap.error || d.error
    ] }) : widget.type === "stat" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, { data: d, t }) : widget.type === "matrix" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NodeMatrix, { data: d, t }) : widget.type === "chart" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TrendChart, { data: d }) : widget.type === "list" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ListCard, { data: d }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: t("noData") }) })
  ] });
}
function DashboardView(props) {
  const { t } = props;
  const localeT = (k) => t ? t(k) : k;
  const [widgets, setWidgets] = (0, import_react.useState)(null);
  const [configError, setConfigError] = (0, import_react.useState)(null);
  const [reloadKey, setReloadKey] = (0, import_react.useState)(0);
  (0, import_react.useEffect)(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/dashboards/widgets", { signal: AbortSignal.timeout(8e3) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        if (alive) {
          setWidgets(d.widgets ?? []);
          setConfigError(null);
        }
      } catch (e) {
        if (alive) setConfigError(String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [reloadKey]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.root, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: DashboardView_default.header, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: DashboardView_default.title, children: [
        "\u{1F4CA} ",
        localeT("view.dashboard")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: DashboardView_default.btn, onClick: () => setReloadKey((k) => k + 1), children: "\u21BB" })
    ] }),
    configError && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: DashboardView_default.error, children: [
      "\u26A0\uFE0F ",
      configError
    ] }),
    !configError && !widgets && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: localeT("pending") }),
    widgets && widgets.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: localeT("widgets.empty") }),
    widgets && widgets.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: DashboardView_default.grid, children: widgets.map((w) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WidgetCard, { widget: w, t: localeT }, w.id)) })
  ] });
}

// src/client/locales.ts
var NS = "dashboard";
var zh = {
  "view.dashboard": "\u770B\u677F",
  "refresh": "\u5237\u65B0",
  "updated": "\u66F4\u65B0\u4E8E",
  "noData": "\u65E0\u6570\u636E",
  "error": "\u52A0\u8F7D\u5931\u8D25",
  "retry": "\u91CD\u8BD5",
  "disabled": "\u672A\u542F\u7528",
  "pending": "\u7B49\u5F85\u4E2D\u2026",
  "widgets.empty": "\u6682\u65E0 widget \u914D\u7F6E\uFF08\u5728\u8BBE\u7F6E\u9875\u6216 /dashboards/widgets \u914D\u7F6E\uFF09",
  "los.usage": "LLM \u7528\u91CF\u4E0E\u6210\u672C",
  "los.nodes": "\u6267\u884C\u8282\u70B9\u77E9\u9635",
  "los.metrics": "los \u4EFB\u52A1\u7EDF\u8BA1",
  "macos.mem": "MBP \u5185\u5B58",
  "macos.cpu": "MBP \u8D1F\u8F7D",
  "probe": "\u5173\u952E\u670D\u52A1\u63A2\u6D3B",
  "kuma": "\u670D\u52A1\u72B6\u6001",
  "col.cost": "\u6210\u672C",
  "col.calls": "\u8C03\u7528",
  "col.tokens": "tokens",
  "col.cache": "\u7F13\u5B58\u547D\u4E2D",
  "col.sessions": "\u4F1A\u8BDD",
  "col.model": "\u6A21\u578B",
  "col.status": "\u72B6\u6001",
  "col.load": "\u8D1F\u8F7D",
  "col.mem": "\u5185\u5B58",
  "col.platform": "\u5E73\u53F0",
  "col.heartbeat": "\u5FC3\u8DF3",
  "col.latency": "\u5EF6\u8FDF",
  "col.node": "\u8282\u70B9",
  "col.detail": "\u8BE6\u60C5"
};
var en = {
  "view.dashboard": "Dashboards",
  "refresh": "Refresh",
  "updated": "Updated",
  "noData": "No data",
  "error": "Load failed",
  "retry": "Retry",
  "disabled": "Disabled",
  "pending": "Loading\u2026",
  "widgets.empty": "No widget configured (edit via settings or /dashboards/widgets)",
  "los.usage": "LLM usage & cost",
  "los.nodes": "Executor nodes",
  "los.metrics": "los task stats",
  "macos.mem": "MBP memory",
  "macos.cpu": "MBP load",
  "probe": "Service probes",
  "kuma": "Service status",
  "col.cost": "Cost",
  "col.calls": "Calls",
  "col.tokens": "Tokens",
  "col.cache": "Cache hit",
  "col.sessions": "Sessions",
  "col.model": "Model",
  "col.status": "Status",
  "col.load": "Load",
  "col.mem": "Memory",
  "col.platform": "Platform",
  "col.heartbeat": "Heartbeat",
  "col.latency": "Latency",
  "col.node": "Node",
  "col.detail": "Detail"
};

// src/client/index.ts
var inject = ["slots", "conversation", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-dashboards: dictionaries");
  const t = ctx.locale.bind(NS);
  ctx.slots.inject("conversation.view", () => ctx.slots.register({
    name: "conversation.view",
    id: "dashboard",
    order: 90,
    locale: NS,
    label: () => t("view.dashboard")
  }, (props) => DashboardView({ ...props })));
}
return module.exports; } });
