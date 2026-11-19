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

// lib/format.mjs
var MINUTE = 6e4;
var HOUR = 60 * MINUTE;
var DAY = 24 * HOUR;
function splitAge(ms) {
  if (ms === null || ms === void 0 || !Number.isFinite(Number(ms))) {
    return { n: null, unit: null };
  }
  const minutes = Math.max(0, Math.round(Number(ms) / MINUTE));
  if (minutes < 60) return { n: minutes, unit: "\u5206\u949F" };
  const hours = Math.round(minutes / 60);
  if (hours < 48) return { n: hours, unit: "\u5C0F\u65F6" };
  return { n: Math.round(hours / 24), unit: "\u5929" };
}
function ago(atMs, nowMs = Date.now()) {
  if (atMs === null || atMs === void 0) return "\u4ECE\u672A";
  const ms = Number(nowMs) - Number(atMs);
  if (!Number.isFinite(ms)) return "\u4ECE\u672A";
  if (ms < 0) return "\u521A\u521A";
  if (ms < MINUTE) return "\u521A\u521A";
  const { n, unit } = splitAge(ms);
  return `${n} ${unit}\u524D`;
}
var VOCAB = Object.freeze({
  missing: "\u2014",
  never: "\u4ECE\u672A",
  justNow: "\u521A\u521A",
  unknown: "\u672A\u77E5"
});

// lib/groups.mjs
var GROUP_ORDER = ["status", "fleet", "cost", "local", "input"];
var BY_ID = {
  // ① 状态与值班：回答「现在有没有事、要不要我动手」
  "host-restart": "status",
  "svc-probe": "status",
  "kuma-status": "status",
  "health-panel": "status",
  "scheduler-surfaces": "status",
  "superagent": "status",
  // ② 机队与网络：回答「机器/节点/线路现在什么状态」
  "z4pro-health": "fleet",
  "los-nodes": "fleet",
  "los-tasks": "fleet",
  "los-latency": "fleet",
  "surge-ai-rep": "fleet",
  "surge-packy": "fleet",
  "net-summary": "fleet",
  "net-trend": "fleet",
  "gate-reasons": "fleet",
  // ③ 用量与花费：回答「花了多少、配额还剩多少」
  "los-usage": "cost",
  "ai-quota": "cost",
  "dsh-usage": "cost",
  "usage-reconcile": "cost",
  // ④ 本机资源：回答「这台机器自己够不够用」
  "mbp-load": "local",
  "mbp-mem": "local",
  "mbp-disk": "local",
  // ⑤ 跨项目与外部输入：回答「别人/外面给了什么」
  "xproj-sessions": "input",
  "xproj-pain": "input",
  "feed-digests": "input"
};
var BY_TYPE = {
  host: "status",
  list: "status",
  matrix: "fleet",
  tasks: "fleet",
  surge: "fleet",
  packy: "fleet",
  stat: "cost",
  quota: "cost",
  usage: "cost",
  reconcile: "cost",
  disk: "local",
  chart: "local",
  feed: "input"
};
var FALLBACK_GROUP = "status";
function groupOf(widget) {
  const id = widget && typeof widget.id === "string" ? widget.id : "";
  if (BY_ID[id]) return BY_ID[id];
  const type = widget && typeof widget.type === "string" ? widget.type : "";
  if (BY_TYPE[type]) return BY_TYPE[type];
  return FALLBACK_GROUP;
}
function groupWidgets(widgets) {
  const buckets = /* @__PURE__ */ new Map();
  for (const w of Array.isArray(widgets) ? widgets : []) {
    const key = groupOf(w);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(w);
  }
  const out = [];
  for (const key of GROUP_ORDER) {
    const items = buckets.get(key);
    if (items && items.length > 0) out.push({ key, items });
  }
  for (const [key, items] of buckets) {
    if (!GROUP_ORDER.includes(key) && items.length > 0) out.push({ key, items });
  }
  return out;
}

// lib/summary.mjs
var MISSING = "\u2014";
function isObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function fmtUptime(ms) {
  const v = num(ms);
  if (v === null || v < 0) return MISSING;
  const s = Math.floor(v / 1e3);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 === 0 ? `${h}h` : `${h}h${String(m % 60).padStart(2, "0")}m`;
  const d = Math.floor(h / 24);
  return h % 24 === 0 ? `${d}d` : `${d}d${h % 24}h`;
}
function hostFact(d) {
  if (!isObj(d)) return null;
  if (d.available === false) {
    return { value: MISSING, hint: "\u91CD\u542F\u80FD\u529B\u4E0D\u53EF\u7528", state: "idle" };
  }
  const daemon = isObj(d.daemon) ? d.daemon : null;
  const phase = daemon && typeof daemon.phase === "string" ? daemon.phase : "";
  const running = num(d.turns && d.turns.running);
  const pending = num(d.pending && d.pending.count);
  const hint = [];
  if (phase) hint.push(`\u5B88\u62A4 ${phase}`);
  if (running !== null) hint.push(`\u5728\u8DD1 ${running}`);
  if (pending) hint.push(`\u5F85\u91CD\u8F7D ${pending}`);
  if (d.ok !== true) {
    return { value: "\u6CA1\u5C31\u7EEA", hint: hint.join(" \xB7 ") || (typeof d.error === "string" ? d.error : ""), state: "error" };
  }
  const up = d.host ? d.host.uptimeMs : null;
  const degraded = phase !== "" && phase !== "healthy";
  return { value: fmtUptime(up), hint: hint.join(" \xB7 "), state: degraded ? "warning" : "done" };
}
function probeFact(d) {
  if (!isObj(d)) return null;
  if (d.enabled === false) return { value: MISSING, hint: "\u63A2\u6D3B\u672A\u542F\u7528", state: "idle" };
  const total = num(d.total);
  if (total === null) return null;
  const ok = num(d.ok) ?? 0;
  const degraded = num(d.degraded) ?? 0;
  const down = num(d.down) ?? 0;
  const state = down > 0 ? "error" : degraded > 0 ? "warning" : "done";
  const hint = down > 0 || degraded > 0 ? `${down} \u6302 \xB7 ${degraded} \u964D\u7EA7` : "\u5168\u90E8\u6B63\u5E38";
  return { value: `${ok}/${total}`, hint, state };
}
function schedulerFact(d) {
  if (!isObj(d)) return null;
  const rs = Array.isArray(d.results) ? d.results.filter(isObj) : null;
  if (!rs || rs.length === 0) return null;
  const ok = rs.filter((r) => r.ok === true).length;
  const hard = rs.filter((r) => r.ok === false && r.degraded !== true).length;
  const soft = rs.filter((r) => r.ok === false && r.degraded === true).length;
  const state = hard > 0 ? "error" : soft > 0 ? "warning" : "done";
  const hint = hard > 0 || soft > 0 ? `\u574F ${hard} \xB7 \u964D\u7EA7 ${soft}` : "\u90FD\u6B63\u5E38";
  return { value: `${ok}/${rs.length}`, hint, state };
}
function diskFact(d) {
  if (!isObj(d)) return null;
  const disk = isObj(d.disk) ? d.disk : null;
  if (!disk) return null;
  const pct2 = num(disk.effectiveUsedPct) ?? num(disk.hardUsedPct);
  if (pct2 === null) return { value: MISSING, hint: "\u78C1\u76D8\u53E3\u5F84\u672A\u5C31\u7EEA", state: "idle" };
  const level = typeof disk.level === "string" ? disk.level : "";
  const state = level === "critical" ? "error" : level === "warn" || disk.degraded === true ? "warning" : "done";
  const hint = disk.degraded === true ? "\u53E3\u5F84\u964D\u7EA7" : level === "ok" ? "\u5DF2\u7528\uFF08\u542B\u53EF\u6E05\u9664\uFF09" : `\u6C34\u4F4D ${level}`;
  return { value: `${pct2.toFixed(1)}%`, hint, state };
}
function netFact(d) {
  if (!isObj(d)) return null;
  const raw = typeof d.state === "string" ? d.state : "";
  if (!raw) return { value: MISSING, hint: "\u7F51\u7EDC\u89C2\u6D4B\u672A\u5C31\u7EEA", state: "idle" };
  const label = raw === "ok" ? "\u6B63\u5E38" : raw === "degraded" ? "\u964D\u7EA7" : raw === "error" ? "\u5F02\u5E38" : raw;
  const fresh = typeof d.freshness === "string" ? d.freshness : "";
  const stale = fresh !== "" && fresh !== "ok";
  const state = raw === "ok" ? stale ? "warning" : "done" : raw === "degraded" ? "warning" : "error";
  const hint = [`state=${raw}`, fresh ? `\u65B0\u9C9C\u5EA6 ${fresh}` : ""].filter(Boolean).join(" \xB7 ");
  return { value: label, hint, state };
}
var STRIP_FACTS = [
  { key: "host", of: "host-restart", compute: hostFact },
  { key: "probe", of: "svc-probe", compute: probeFact },
  { key: "scheduler", of: "scheduler-surfaces", compute: schedulerFact },
  { key: "disk", of: "mbp-disk", compute: diskFact },
  { key: "net", of: "net-summary", compute: netFact }
];
function buildStrip(dataById) {
  const src = isObj(dataById) ? dataById : {};
  return STRIP_FACTS.map(({ key, of, compute }) => {
    const fact = compute(src[of]);
    if (!fact) {
      return { key, value: MISSING, hint: "\u6570\u636E\u672A\u5C31\u7EEA", state: "idle" };
    }
    return { key, value: fact.value, hint: fact.hint, state: fact.state };
  });
}

// src/client/DashboardView.module.css
var css = '/* dsh-dashboards \u2014 \u770B\u677F tab \u6837\u5F0F\u3002\u53EA\u4F7F\u7528 --dsw-alias-* \u767D\u540D\u5355\u4EE4\u724C\uFF0C\u968F\u6D45/\u6DF1\u4E3B\u9898\u3002 */\n\n._f4e51a2a_root {\n  /* \u770B\u677F\u662F `main` \u5EA7\u4F4D\u91CC\u7684\u9762\u677F\uFF0C\u5FC5\u987B**\u81EA\u5DF1**\u5EFA\u6EDA\u52A8\u5BB9\u5668\uFF1A\u4E2D\u5FC3\u5217 `.centerCol` \u662F\n     \u5B9A\u9AD8\u3001`overflow: hidden` \u7684 flex \u5217\uFF08ui-layout \u7684 AppFrame.module.css\uFF09\uFF0C\u5B83\u53EA\n     \u8D1F\u8D23\u88C1\u5207\u3001\u4E0D\u8D1F\u8D23\u6EDA\u52A8\uFF1B`main` \u5EA7\u4F4D\u7684 occupant \u624D\u662F\u6EDA\u52A8\u8005\u3002\n     2026-11-19 \u5B9E\u6D4B\uFF081440x900\u300125 \u5F20\u5361\uFF09\uFF1A\u5185\u5BB9\u9AD8 2781px\u3001\u53EF\u89C1 900px\uFF0C\u6EDA\u8F6E\u524D\u540E\n     document.scrollingElement._37c64108_scrollTop \u4E0E\u6240\u6709\u540E\u4EE3 scrollTop \u6052\u4E3A 0 \u2014\u2014 \u540E\u4E09\u5206\u4E4B\n     \u4E8C\u7684\u4FE1\u606F\u6EDA\u4E0D\u52A8\u4E5F\u591F\u4E0D\u5230\u3002\u8FD9\u4E0E dsh-workspace-board `._f4e51a2a_root{height:100%;\n     overflow:auto}` \u662F\u540C\u4E00\u5F62\u6001\uFF08\u5B83\u5728 main \u5EA7\u4F4D\u91CC\u80FD\u6EDA\uFF0C\u6B63\u662F\u56E0\u4E3A\u5B83\u81EA\u5DF1\u58F0\u660E\u4E86\u6EDA\u52A8\uFF09\u3002 */\n  height: 100%;\n  min-height: 0;\n  overflow-y: auto;\n  overflow-x: hidden;\n  /* \u5E95\u90E8\u7559\u767D\u8BA9\u5F00 shell \u7684\u56FA\u5B9A\u6D6E\u5C42\uFF08\u684C\u5BA0 336x58 \u9489\u5728\u53F3\u4E0B\u89D2\u3001z-index 41\uFF09\uFF1A\n     24px \u4E0D\u591F\uFF0C\u6700\u540E\u4E00\u5F20\u5361\u7684\u4E0B\u4E24\u884C\u4F1A\u88AB\u6D6E\u5C42\u6C38\u4E45\u76D6\u4F4F\u3002\n     \u9876\u90E8\u4E0D\u7559 padding\uFF1A\u5438\u9876 header \u5FC5\u987B\u8D34\u5728\u6EDA\u52A8\u53E3\u4E0A\u6CBF\uFF0C\u5426\u5219 padding-top \u90A3\u51E0\u50CF\u7D20\n     \u4F1A\u6F0F\u51FA\u4E0A\u4E00\u5F20\u5361\u7684\u6587\u5B57\uFF08\u5B9E\u6D4B 4px \u5C31\u80FD\u770B\u89C1\u300C\u2026lt-its\u300D\u8FD9\u79CD\u6B8B\u884C\uFF09\u3002 */\n  padding: 0 2px 88px;\n  /* \u770B\u677F\u7528\u6EE1\u4F1A\u8BDD\u533A\u5BBD\u5EA6\uFF08\u5217\u6570\u7531 column-width \u81EA\u9002\u5E94\uFF0C\u5BBD\u5C4F\u66F4\u591A\u5217\uFF09 */\n  max-width: none;\n}\n\n._dba031a0_header {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 8px;\n  /* \u6EDA\u5230\u7B2C\u4E8C\u5C4F\u540E\u5237\u65B0/\u7F16\u8F91\u6309\u94AE\u4E0D\u8BE5\u6D88\u5931\uFF1A\u9876\u680F\u5438\u9876\uFF0C\u5E95\u8272\u53D6\u4E2D\u5FC3\u5217\u81EA\u8EAB\u7684\u5730\u8272\n     \uFF08\u4E0E dsh-memory-evolve \u7684 sticky thead \u540C\u4EE4\u724C\u7528\u6CD5\uFF09\u3002 */\n  position: sticky;\n  top: 0;\n  z-index: 2;\n  padding: 4px 0 6px;\n  margin-bottom: 4px;\n  background: var(--dsw-alias-bg-base);\n}\n\n._7c3c945b_title {\n  margin: 0;\n  font-size: 14px;\n  font-weight: 700;\n  color: var(--dsw-alias-label-primary);\n}\n\n._826898bd_btn {\n  padding: 2px 10px;\n  border-radius: 6px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-label-primary);\n  font-size: 12px;\n  cursor: pointer;\n}\n\n._826898bd_btn:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n._826898bd_btn:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n/* \u6BCF\u6BB5\u4E00\u4E2A\u7F51\u683C\u3002\u4E3A\u4EC0\u4E48\u4ECE CSS \u591A\u5217\u6362\u6389\uFF082026-11-19 \u5B9E\u6D4B\uFF09\uFF1A\u591A\u5217\u662F**\u7AD6\u7740\u586B\u6EE1\u518D\n   \u6362\u5217**\uFF0C\u4E8E\u662F\u914D\u7F6E\u91CC\u7B2C 9 \u5F20\u5361\u53EF\u80FD\u51FA\u73B0\u5728\u7B2C 2 \u5F20\u5361\u7684\u5DE6\u8FB9\uFF0C\u4EBA\u6539\u7684\u987A\u5E8F\u548C\u770B\u5230\u7684\u987A\u5E8F\n   \u4E0D\u662F\u4E00\u56DE\u4E8B\uFF1B\u6539\u6210 grid \u540E\u9605\u8BFB\u987A\u5E8F\u662F\u5DE6\u4E0A\u2192\u53F3\u4E0A\u2192\u4E0B\u4E00\u884C\u3002\n   \u884C\u9AD8\u6309\u8BE5\u884C\u6700\u9AD8\u7684\u5361\u5BF9\u9F50\uFF0C\u6240\u4EE5\u5361\u7247\u6B63\u6587\u5FC5\u987B\u6709\u6298\u53E0\uFF08CARD_BODY_MAX=320px\uFF09\uFF0C\n   \u5426\u5219 651/740px \u7684\u9AD8\u5361\u4F1A\u628A\u6574\u884C\u6491\u51FA\u5927\u7247\u7A7A\u767D\u3002 */\n._5f1aa483_grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));\n  gap: 10px;\n  align-items: start;\n  /* \u7ED9\u4E0B\u9762\u7684 @container \u7528\uFF1A\u53EA\u6709"\u8FD9\u4E00\u6BB5"\u591F\u5BBD\u65F6\uFF0C\u5BBD\u8868\u5361\u624D\u8DE8\u4E24\u5217 */\n  container-type: inline-size;\n}\n\n/* \u5BBD\u8868\u5361\uFF08matrix / surge\uFF09\u5360\u4E24\u5217\uFF1A\u5B9E\u6D4B 353px \u7684\u5361\u8981\u88C5 538/411px \u7684\u8868\uFF0C\n   \u539F\u6765\u53EA\u80FD\u6A2A\u5411\u5207\u6389\u53F3\u4FA7\u51E0\u5217\u3002\u5BB9\u5668\u67E5\u8BE2\u4E0D\u652F\u6301\u7684\u8001\u6D4F\u89C8\u5668\u91CC\u8FD9\u6761\u4E0D\u751F\u6548\uFF0C\n   \u9000\u5316\u6210\u5355\u5217\uFF08\u4ECD\u662F\u73B0\u5728\u7684\u6837\u5B50\uFF09\uFF0C\u4E0D\u4F1A\u6EA2\u51FA\u3002 */\n@container (min-width: 700px) {\n  ._31b224e9_span2 {\n    grid-column: span 2;\n  }\n}\n\n/* \u2500\u2500 \u9876\u90E8\u72B6\u6001\u6761\uFF1A5 \u4E2A\u7CFB\u7EDF\u9762\u5404\u4E00\u683C \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n._f6be8c6d_strip {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin: 2px 0 10px;\n}\n\n._827d9677_fact {\n  display: flex;\n  align-items: baseline;\n  gap: 6px;\n  padding: 3px 10px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-1);\n}\n\n._e9656543_factLabel {\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n._baca4d30_factValue {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  font-size: 12px;\n  font-weight: 700;\n  color: var(--dsw-alias-label-primary);\n  font-variant-numeric: tabular-nums;\n}\n\n._2a3b4b36_factHint {\n  font-size: 11px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* \u2500\u2500 \u5206\u6BB5\u6807\u9898\uFF08\u53EF\u70B9\u5F00/\u6536\u8D77\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n._351dd305_group {\n  margin-top: 2px;\n}\n\n._d8606b35_groupHead {\n  display: flex;\n  align-items: baseline;\n  gap: 8px;\n  width: 100%;\n  margin: 0 0 6px;\n  padding: 6px 2px;\n  border: none;\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n  background: none;\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n}\n\n._d8606b35_groupHead:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n._d8606b35_groupHead:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n._d2b5f91a_groupChevron {\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n._19af7be6_groupTitle {\n  font-size: 12px;\n  font-weight: 700;\n}\n\n._9c15f579_groupCount {\n  font-size: 10px;\n  padding: 0 6px;\n  border-radius: 999px;\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-label-secondary);\n  font-variant-numeric: tabular-nums;\n}\n\n._df0c05cf_groupHint {\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n/* \u6298\u53E0\u7684\u5361\u8981\u5728\u5E95\u90E8"\u770B\u5F97\u51FA\u6765\u88AB\u622A\u65AD"\uFF1A\u4E0D\u662F\u628A\u5185\u5BB9\u5220\u4E86\uFF0C\u800C\u662F\u8FD8\u6709\u4E0B\u6587\u3002\n   \u6E10\u53D8\u6302\u5728\u4E0D\u6EDA\u52A8\u7684\u5916\u5C42\uFF08bodyWrap\uFF09\uFF0C\u6240\u4EE5\u5B83\u56FA\u5B9A\u5728\u5361\u7247\u4E0B\u6CBF\uFF0C\u4E0D\u4F1A\u968F\u5185\u5C42\u6EDA\u52A8\u8DD1\u6389\u3002 */\n._f5f6454d_bodyWrap {\n  position: relative;\n}\n\n._5b49bcb6_bodyFaded::after {\n  content: \'\';\n  position: absolute;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  height: 28px;\n  background: linear-gradient(to bottom, transparent, var(--dsw-alias-bg-layer-1));\n  pointer-events: none;\n}\n\n/* \u957F\u5361\u6298\u53E0\uFF1A\u53EA\u88C1\u7EB5\u5411\uFF08\u6A2A\u5411\u6EDA\u52A8\u662F\u5BBD\u8868\u683C\u7684\u65E2\u6709\u80FD\u529B\uFF0C\u522B\u4E00\u8D77\u5173\u6389\uFF09 */\n._74892d1f_cardBodyClamped {\n  max-height: 240px;\n  overflow-y: hidden;\n}\n\n._3e5a0bb4_cardMore {\n  display: flex;\n  justify-content: flex-end;\n  margin-top: 4px;\n}\n\n._2d2a782b_btnSmall {\n  padding: 1px 8px;\n  border-radius: 6px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n  cursor: pointer;\n}\n\n._2d2a782b_btnSmall:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n._2d2a782b_btnSmall:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n._30b37a89_card {\n  background: var(--dsw-alias-bg-layer-1);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 10px;\n  padding: 8px 12px 10px;\n  min-width: 0;\n  /* \u5185\u5BB9\uFF08\u5BBD\u8868\u683C\uFF09\u6C38\u4E0D\u6EA2\u51FA\u5230\u76F8\u90BB\u5361\u7247\u2014\u2014\u91CD\u53E0\u6839\u56E0\u4FEE\u590D */\n  overflow: hidden;\n}\n\n._7e558f24_cardHeader {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin-bottom: 6px;\n}\n\n._42afaeaa_cardTitle {\n  margin: 0;\n  font-size: 12px;\n  font-weight: 700;\n  color: var(--dsw-alias-label-primary);\n}\n\n._fe5af9b9_cardMeta {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n}\n\n._4b6db334_cardBody {\n  font-size: 12px;\n  line-height: 1.7;\n  color: var(--dsw-alias-label-primary);\n  /* \u5BBD\u8868\u683C\u5728\u5361\u5185\u6A2A\u5411\u6EDA\u52A8\uFF0C\u4E0D\u6491\u7834\u5361\u7247 */\n  overflow-x: auto;\n}\n\n._19ab98ed_muted {\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n._ad64cb4a_error {\n  font-size: 12px;\n  color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 55%, var(--dsw-alias-label-primary));\n  margin: 4px 0;\n}\n\n._55d3b6b5_pillRow {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin-bottom: 8px;\n}\n\n._9a297014_pill {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  padding: 1px 8px;\n  border-radius: 999px;\n  font-size: 11px;\n  font-weight: 600;\n  color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 55%, var(--dsw-alias-label-primary));\n  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, var(--dsw-alias-bg-layer-1));\n  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-success-secondary) 55%, transparent);\n}\n\n._2811ee31_pillDim {\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-bg-layer-2);\n  border-color: var(--dsw-alias-border-l2);\n}\n\n._ff551aa2_pillWarn {\n  color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 55%, var(--dsw-alias-label-primary));\n  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, var(--dsw-alias-bg-layer-1));\n  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-secondary) 55%, transparent);\n}\n\n/* AI \u989D\u5EA6\u533A\u5757\uFF08ZenMux + Packy \u53CC\u5217\uFF09 */\n._c25b5a8e_quotaGrid {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 8px;\n}\n\n._19a039f9_quotaBlock {\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 8px;\n  padding: 6px 8px;\n  background: var(--dsw-alias-bg-layer-1);\n}\n\n._19a039f9_quotaBlock ._42afaeaa_cardTitle {\n  margin: 0 0 4px;\n  font-size: 12px;\n}\n\n._e057c58f_quotaWindow {\n  margin-top: 4px;\n}\n\n._f6afa805_barTrack {\n  height: 4px;\n  border-radius: 2px;\n  background: var(--dsw-alias-bg-layer-2);\n  overflow: hidden;\n  margin-top: 2px;\n}\n\n._92e18ed1_barFill {\n  height: 100%;\n  border-radius: 2px;\n  transition: width 0.4s ease;\n}\n\n._3c199396_barOk {\n  background: var(--dsw-alias-state-success-primary);\n}\n\n._68d9f10a_barWarn {\n  background: var(--dsw-alias-state-warn-primary);\n}\n\n._fa51c71f_barDanger {\n  background: var(--dsw-alias-state-error-primary);\n}\n\n._1b2088ec_table {\n  width: 100%;\n  border-collapse: collapse;\n  font-size: 12px;\n}\n\n._1b2088ec_table th {\n  text-align: left;\n  font-weight: 600;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n  padding: 3px 6px;\n  border-bottom: 1px solid var(--dsw-alias-border-l2);\n}\n\n._1b2088ec_table td {\n  padding: 3px 6px;\n  color: var(--dsw-alias-label-primary);\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n  white-space: nowrap;\n}\n\n/* \u6587\u672C\u5217\uFF08\u8282\u70B9\u540D+hostLabel \u7B49\uFF09\u5141\u8BB8\u6362\u884C\uFF0C\u907F\u514D nowrap \u6491\u7206\u5361\u7247\u3002\n   `overflow-wrap: anywhere` \u662F\u5173\u952E\uFF1A\u8BE6\u60C5\u91CC\u5E38\u6709 `2026-11-19T14:49:55.804Z`\u3001\n   `merged_rc=1\uFF08gate=1 routeguard=1\uFF09` \u8FD9\u7C7B\u4E0D\u53EF\u65AD\u957F token\uFF0C\u53EA\u5199 `white-space:\n   normal` \u65F6\u5B83\u4EEC\u7684 **min-content \u5BBD\u5EA6**\u4ECD\u628A\u8868\u683C\u6491\u51FA\u5361\u7247\uFF08\u5B9E\u6D4B 463 > 353\uFF0C\n   \u8BE6\u60C5\u5217\u88AB\u5207\u6389\u53F3\u534A\uFF09\u3002\u5141\u8BB8\u4EFB\u610F\u65AD\u70B9\u540E\u8868\u683C\u624D\u80FD\u7F29\u56DE\u5361\u5BBD\u3002 */\n._1b2088ec_table td._db2f2158_wrap {\n  white-space: normal;\n  overflow-wrap: anywhere;\n}\n\n._0e262682_hostSub {\n  display: block;\n  font-size: 10px;\n  line-height: 1.4;\n}\n\n._1b2088ec_table td._31641685_num {\n  font-variant-numeric: tabular-nums;\n  text-align: right;\n}\n\n._ccc9330e_mono {\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  font-size: 11px;\n}\n\n._ab0deb24_rowDot {\n  display: inline-flex;\n  vertical-align: -1px;\n  margin-right: 5px;\n}\n\n/* \u72B6\u6001\u8272\u4F5C\u7EAF\u6587\u5B57\u5FC5\u987B color-mix \u63D0\u5BF9\u6BD4\u5EA6\uFF082026-10-08\uFF09\uFF1Astate-*-primary \u76F4\u63A5\u5F53\n   color \u53EA\u6709 2.2:1\uFF08success/warn\uFF09\uFF0C\u6D45\u8272\u4E3B\u9898\u51E0\u4E4E\u770B\u4E0D\u6E05\uFF1Blabel-primary \u968F\u4E3B\u9898\n   \u53CD\u8F6C\uFF08\u6D45=\u8FD1\u9ED1/\u6DF1=\u8FD1\u767D\uFF09\uFF0C\u540C\u4E00\u8868\u8FBE\u5F0F\u53CC\u4E3B\u9898\u53EF\u8FBE\u6807\u3002 */\n._77795f2d_okText { color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 55%, var(--dsw-alias-label-primary)); }\n._33153ae1_errText { color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 55%, var(--dsw-alias-label-primary)); }\n._744ac21e_warnText { color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 55%, var(--dsw-alias-label-primary)); }\n\n._1d92c04b_legend {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 10px;\n  margin-top: 4px;\n  font-size: 11px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n._cb49b581_legendItem {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n}\n\n._c4a2b54b_legendDot {\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  display: inline-block;\n}\n\n/* feed \u91C7\u96C6\u6458\u8981\u5361\u7247\uFF1A\u62A5\u544A\u6761\u76EE\u5217\u8868\uFF08\u70B9\u51FB\u5C55\u5F00\u6B63\u6587\uFF09\u3002 */\n._4360df81_feedItem {\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 8px;\n  margin-bottom: 6px;\n  overflow: hidden;\n}\n\n._44396078_feedToggle {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 8px;\n  width: 100%;\n  padding: 6px 10px;\n  background: var(--dsw-alias-bg-layer-2);\n  border: none;\n  cursor: pointer;\n  font: inherit;\n  text-align: left;\n}\n\n._44396078_feedToggle:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n._44396078_feedToggle:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: -1px;\n}\n\n._ce1be636_feedTitle {\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n._04fd4908_feedTime {\n  flex-shrink: 0;\n  font-size: 10px;\n  color: var(--dsw-alias-label-tertiary);\n  font-variant-numeric: tabular-nums;\n}\n\n._7d260a09_feedBody {\n  margin: 0;\n  padding: 8px 10px;\n  font-size: 12px;\n  line-height: 1.6;\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-bg-layer-1);\n  word-break: break-word;\n  max-height: 320px;\n  overflow-y: auto;\n}\n\n/* Feed \u6B63\u6587\u91CC\u7684 Markdown \u5143\u7D20\uFF1A\u7F29\u5C0F\u6807\u9898/\u4EE3\u7801\u5757\uFF0C\u4FDD\u6301\u7D27\u51D1\u770B\u677F\u5361\u7247\u98CE\u683C */\n._7d260a09_feedBody :global(h1),\n._7d260a09_feedBody :global(h2),\n._7d260a09_feedBody :global(h3) {\n  font-size: 13px;\n  margin: 8px 0 4px;\n  color: var(--dsw-alias-label-primary);\n}\n._7d260a09_feedBody :global(h4),\n._7d260a09_feedBody :global(h5),\n._7d260a09_feedBody :global(h6) {\n  font-size: 12px;\n  margin: 6px 0 3px;\n  color: var(--dsw-alias-label-primary);\n}\n._7d260a09_feedBody :global(p) {\n  margin: 4px 0;\n}\n._7d260a09_feedBody :global(ul),\n._7d260a09_feedBody :global(ol) {\n  margin: 4px 0;\n  padding-left: 18px;\n}\n._7d260a09_feedBody :global(pre) {\n  margin: 6px 0;\n  padding: 6px 8px;\n  font-size: 11px;\n  overflow-x: auto;\n}\n._7d260a09_feedBody :global(code) {\n  font-size: 11px;\n}\n._7d260a09_feedBody :global(table) {\n  margin: 6px 0;\n  font-size: 11px;\n}\n\n/* \u2500\u2500 \u7F16\u8F91\u6A21\u5F0F \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n._1a38ce38_btnPrimary {\n  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, var(--dsw-alias-bg-layer-2));\n  border-color: var(--dsw-alias-brand-primary);\n  font-weight: 600;\n}\n\n._1a38ce38_btnPrimary:disabled {\n  opacity: 0.6;\n  cursor: default;\n}\n\n._57c82ab6_editPanel {\n  border: 1px dashed var(--dsw-alias-border-l3);\n  border-radius: 10px;\n  padding: 10px 12px;\n  margin-bottom: 12px;\n  background: var(--dsw-alias-bg-layer-2);\n}\n\n._54178179_editPanelHead {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin-bottom: 8px;\n}\n\n._317022ea_editPanelTitle {\n  font-size: 12px;\n  font-weight: 700;\n  color: var(--dsw-alias-label-primary);\n}\n\n._b5d938ab_targetRow {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 3px 0;\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n}\n\n._54a98147_targetAddr {\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n._ee1914a4_removeBtn {\n  flex-shrink: 0;\n  width: 22px;\n  height: 22px;\n  border-radius: 6px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-bg-layer-3);\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  line-height: 1;\n  cursor: pointer;\n}\n\n._ee1914a4_removeBtn:hover {\n  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, var(--dsw-alias-bg-layer-3));\n  color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 60%, var(--dsw-alias-label-primary));\n}\n\n._ee1914a4_removeBtn:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n._32037663_addForm {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin: 8px 0 6px;\n}\n\n._3d06ceb5_input {\n  box-sizing: border-box;\n  height: 30px;\n  min-width: 0;\n  flex: 1 1 130px;\n  padding: 0 10px;\n  border-radius: 8px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  font-size: 12px;\n  font-family: inherit;\n}\n\n._3d06ceb5_input::placeholder {\n  color: var(--dsw-alias-label-dimmed);\n}\n\n._3d06ceb5_input:focus {\n  outline: none;\n  border-color: var(--dsw-alias-brand-primary);\n  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent);\n}\n\n._9cfadb90_hint {\n  font-size: 12px;\n  color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 60%, var(--dsw-alias-label-primary));\n  margin: 4px 0 8px;\n}\n\n._2bde7efb_cardRemoving {\n  opacity: 0.45;\n  border-style: dashed;\n}\n\n/* Surge \u8282\u70B9\u4FE1\u8A89\uFF1A\u6700\u8FD1\u4E8B\u4EF6\u5217\u8868 */\n._17c7c7b2_eventList {\n  margin-top: 10px;\n  border-top: 1px solid var(--dsw-alias-border-l2);\n  padding-top: 8px;\n}\n\n._17c7c7b2_eventList > p {\n  margin: 0 0 4px;\n  font-size: 12px;\n}\n\n._0ba2ada3_eventRow {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 12px;\n  line-height: 1.6;\n}\n\n._0ba2ada3_eventRow ._ccc9330e_mono {\n  font-size: 11px;\n}\n\n/* \u2500\u2500 DSH \u6D88\u8017\uFF08P5\uFF1Ausage widget\uFF09 \u2500\u2500 */\n._f4602c13_usageTable {\n  width: 100%;\n  margin-top: 8px;\n  border-collapse: collapse;\n  font-size: 11px;\n}\n\n._f4602c13_usageTable th {\n  padding: 4px 6px;\n  border-bottom: 1px solid var(--dsw-alias-border-l2);\n  color: var(--dsw-alias-label-secondary);\n  text-align: left;\n  font-size: 10px;\n  font-weight: 600;\n}\n\n._f4602c13_usageTable td {\n  padding: 3px 6px;\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n  white-space: nowrap;\n}\n\n._f4602c13_usageTable code {\n  font-size: 10px;\n}\n\n._9661b6d0_dayStrip {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin-top: 10px;\n}\n\n._8990f7a2_dayCell {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  padding: 5px 8px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 6px;\n  font-size: 10px;\n}\n\n._8990f7a2_dayCell span:first-child {\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* \u2500\u2500 \u78C1\u76D8\u4E09\u53E3\u5F84\uFF082026-10-22\uFF09\uFF1A\u4E09\u6BB5\u6761 = \u771F\u6B63\u5DF2\u7528 / \u53EF\u6E05\u9664 / \u7A7A\u95F2 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n._87c33dc1_diskHead {\n  display: flex;\n  align-items: baseline;\n  gap: 8px;\n  margin-bottom: 6px;\n}\n\n._adcbd262_diskPct {\n  font-size: 22px;\n  font-weight: 600;\n  line-height: 1.1;\n  color: var(--dsw-alias-label-primary);\n}\n\n._2e0c58f1_diskFresh {\n  margin-left: auto;\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n._89ba3ccc_diskBar {\n  display: flex;\n  height: 10px;\n  border-radius: 5px;\n  overflow: hidden;\n  background: var(--dsw-alias-bg-layer-2);\n  border: 1px solid var(--dsw-alias-border-l1);\n}\n\n._9065f576_diskSeg {\n  transition: width 0.4s ease;\n}\n\n._9c5df3dd_diskSegUsed {\n  background: var(--dsw-alias-brand-primary);\n}\n\n._310e26e2_diskSegPurge {\n  background: var(--dsw-alias-state-warn-secondary);\n}\n\n._0a1ab1f0_diskSegFree {\n  background: var(--dsw-alias-state-success-secondary);\n}\n\n._df98da59_diskLegend {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin: 8px 0 2px;\n}\n\n._58a54bce_diskNote {\n  margin: 4px 0 0;\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n/* \u2500\u2500 \u5BBF\u4E3B\u91CD\u542F\u5361\uFF082026-10-26\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n   \u4E00\u5C4F\u591A\u5361\u91CC\u7684\u4E00\u5F20\u64CD\u4F5C\u5361\uFF1A\u5934\u90E8\u4E00\u884C\u72B6\u6001\u3001\u4E00\u884C\u4E8B\u5B9E\u3001\u5E95\u90E8\u4E00\u4E2A\u6309\u94AE\uFF1B\n   \u786E\u8BA4\u6001\u5728\u5361\u5185\u5C55\u5F00\uFF08\u5361\u5185\u4E24\u6B65\uFF09\uFF0C\u4E0D\u8981\u5F39\u5168\u5C4F\u906E\u7F69\u3002 */\n._511e8f5b_hostCard {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n\n._ebeb937f_hostHead {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 4px 10px;\n  margin: 0;\n  font-size: 12px;\n}\n\n._4a04de79_hostPhase {\n  color: var(--dsw-alias-label-primary);\n  font-size: 12px;\n  font-weight: 600;\n}\n\n._f1d2275a_hostRow {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px 12px;\n  margin: 0;\n  font-size: 11px;\n}\n\n._c43590c5_hostWarn {\n  margin: 0;\n  color: var(--dsw-alias-state-warn-label);\n  font-size: 11px;\n}\n\n._c9781461_hostFiles {\n  overflow: hidden;\n  margin: 0;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n._ee7fe084_hostActions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n}\n\n._eee49b65_hostConfirmActions {\n  flex-direction: column;\n  align-items: stretch;\n}\n\n._0ffd525a_hostConfirm {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  padding: 8px 10px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-1);\n}\n\n/* \u79BB\u7EBF\u8282\u70B9\u6C47\u603B\u884C\uFF082026-10-28\uFF09\uFF1A\u4E00\u884C\u53EF\u70B9\u6587\u672C\uFF0C\u66FF\u4EE3 22 \u884C\u300C\u2014\u300D\u8868\u683C\u884C\u3002\n   \u7528 label-secondary \u800C\u975E muted\uFF1A\u5B83\u53EF\u70B9\uFF0C\u5FC5\u987B\u770B\u8D77\u6765\u50CF\u4E2A\u5165\u53E3\u3002 */\n._224af386_nodeMore {\n  padding: 0;\n  border: 0;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary, #5c6a60);\n  font: inherit;\n  font-size: 11px;\n  text-align: left;\n  cursor: pointer;\n}\n\n._224af386_nodeMore:hover {\n  color: var(--dsw-alias-label-primary, #141a15);\n  text-decoration: underline;\n}\n';
var tagId = "dsh-dashboards/DashboardView.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-dashboards";
  tag.dataset.pluginCss = tagId;
  tag.textContent = css;
  document.head.appendChild(tag);
}
var DashboardView_default = { "hostConfirmActions": "_eee49b65_hostConfirmActions", "cardBodyClamped": "_74892d1f_cardBodyClamped", "editPanelTitle": "_317022ea_editPanelTitle", "editPanelHead": "_54178179_editPanelHead", "groupChevron": "_d2b5f91a_groupChevron", "cardRemoving": "_2bde7efb_cardRemoving", "diskSegPurge": "_310e26e2_diskSegPurge", "quotaWindow": "_e057c58f_quotaWindow", "diskSegUsed": "_9c5df3dd_diskSegUsed", "diskSegFree": "_0a1ab1f0_diskSegFree", "hostActions": "_ee7fe084_hostActions", "hostConfirm": "_0ffd525a_hostConfirm", "groupTitle": "_19af7be6_groupTitle", "groupCount": "_9c15f579_groupCount", "cardHeader": "_7e558f24_cardHeader", "quotaBlock": "_19a039f9_quotaBlock", "legendItem": "_cb49b581_legendItem", "feedToggle": "_44396078_feedToggle", "btnPrimary": "_1a38ce38_btnPrimary", "targetAddr": "_54a98147_targetAddr", "usageTable": "_f4602c13_usageTable", "diskLegend": "_df98da59_diskLegend", "scrollTop": "_37c64108_scrollTop", "factLabel": "_e9656543_factLabel", "factValue": "_baca4d30_factValue", "groupHead": "_d8606b35_groupHead", "groupHint": "_df0c05cf_groupHint", "bodyFaded": "_5b49bcb6_bodyFaded", "cardTitle": "_42afaeaa_cardTitle", "quotaGrid": "_c25b5a8e_quotaGrid", "barDanger": "_fa51c71f_barDanger", "legendDot": "_c4a2b54b_legendDot", "feedTitle": "_ce1be636_feedTitle", "editPanel": "_57c82ab6_editPanel", "targetRow": "_b5d938ab_targetRow", "removeBtn": "_ee1914a4_removeBtn", "eventList": "_17c7c7b2_eventList", "diskFresh": "_2e0c58f1_diskFresh", "hostPhase": "_4a04de79_hostPhase", "hostFiles": "_c9781461_hostFiles", "factHint": "_2a3b4b36_factHint", "bodyWrap": "_f5f6454d_bodyWrap", "cardMore": "_3e5a0bb4_cardMore", "btnSmall": "_2d2a782b_btnSmall", "cardMeta": "_fe5af9b9_cardMeta", "cardBody": "_4b6db334_cardBody", "pillWarn": "_ff551aa2_pillWarn", "barTrack": "_f6afa805_barTrack", "warnText": "_744ac21e_warnText", "feedItem": "_4360df81_feedItem", "feedTime": "_04fd4908_feedTime", "feedBody": "_7d260a09_feedBody", "eventRow": "_0ba2ada3_eventRow", "dayStrip": "_9661b6d0_dayStrip", "diskHead": "_87c33dc1_diskHead", "diskNote": "_58a54bce_diskNote", "hostCard": "_511e8f5b_hostCard", "hostHead": "_ebeb937f_hostHead", "hostWarn": "_c43590c5_hostWarn", "nodeMore": "_224af386_nodeMore", "pillRow": "_55d3b6b5_pillRow", "pillDim": "_2811ee31_pillDim", "barFill": "_92e18ed1_barFill", "barWarn": "_68d9f10a_barWarn", "hostSub": "_0e262682_hostSub", "errText": "_33153ae1_errText", "addForm": "_32037663_addForm", "dayCell": "_8990f7a2_dayCell", "diskPct": "_adcbd262_diskPct", "diskBar": "_89ba3ccc_diskBar", "diskSeg": "_9065f576_diskSeg", "hostRow": "_f1d2275a_hostRow", "header": "_dba031a0_header", "rowDot": "_ab0deb24_rowDot", "okText": "_77795f2d_okText", "legend": "_1d92c04b_legend", "title": "_7c3c945b_title", "span2": "_31b224e9_span2", "strip": "_f6be8c6d_strip", "group": "_351dd305_group", "muted": "_19ab98ed_muted", "error": "_ad64cb4a_error", "barOk": "_3c199396_barOk", "table": "_1b2088ec_table", "input": "_3d06ceb5_input", "root": "_f4e51a2a_root", "grid": "_5f1aa483_grid", "fact": "_827d9677_fact", "card": "_30b37a89_card", "pill": "_9a297014_pill", "wrap": "_db2f2158_wrap", "mono": "_ccc9330e_mono", "hint": "_9cfadb90_hint", "btn": "_826898bd_btn", "num": "_31641685_num" };

// src/client/DashboardView.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var CARD_BODY_MAX = 240;
var OPEN_GROUPS_KEY = "dsh-dashboards:open-groups:v1";
var WIDE_TYPES = /* @__PURE__ */ new Set(["matrix", "surge", "usage"]);
function readOpenGroups() {
  try {
    const raw = window.localStorage.getItem(OPEN_GROUPS_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr.filter((x) => typeof x === "string");
  } catch {
    return null;
  }
}
function writeOpenGroups(keys) {
  try {
    window.localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(keys));
  } catch {
  }
}
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
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "\u2014";
  if (ms < 1e3) return `${ms.toFixed(0)}ms`;
  const s = ms / 1e3;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, "0")}s`;
};
var pct = (v) => v == null ? "\u2014" : `${v.toFixed(1)}%`;
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
var fmtMoney = (v, currency) => {
  if (v == null || !Number.isFinite(v)) return "\u2014";
  const sign = currency === "CNY" ? "\xA5" : "$";
  const a = Math.abs(v);
  const s = currency === "CNY" || a < 1 ? v.toFixed(2) : a >= 100 ? v.toFixed(0) : v.toFixed(2);
  return `${sign}${s}`;
};
var fmtReset = (ts) => {
  if (ts == null) return "";
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = t - Date.now();
  const clock = new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  if (diff <= 0) return `${clock} \u91CD\u7F6E`;
  const min = Math.ceil(diff / 6e4);
  const rel = min >= 60 ? `${Math.floor(min / 60)}h${min % 60 >= 10 ? `${min % 60}m` : ""}` : `${min}m`;
  return `${rel}\u540E \xB7 ${clock}`;
};
function QuotaCard({ data }) {
  if (data == null || typeof data !== "object") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u2014" });
  }
  const d = data;
  const channels = d.channels ?? [];
  const errs = (d.errors ?? []).filter(Boolean);
  const barClass = (pct2) => pct2 == null ? DashboardView_default.barOk : pct2 >= 80 ? DashboardView_default.barDanger : pct2 >= 50 ? DashboardView_default.barWarn : DashboardView_default.barOk;
  const healthText = (h) => h === "auth" ? "\u9700\u767B\u5F55" : h === "stale" ? "\u6570\u636E\u8FC7\u671F" : h === "unavailable" ? "\u4E0D\u53EF\u7528" : null;
  if (!channels.length && !errs.length) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u672A\u914D\u7F6E\u989D\u5EA6\u6E20\u9053" });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.quotaGrid, children: [
    channels.map((ch) => {
      const health = ch.health ?? "live";
      const htxt = healthText(health);
      const lowAmount = ch.amount != null && ch.amount < (ch.currency === "CNY" ? 20 : 1);
      const wins = ch.windows ?? [];
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.quotaBlock, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.cardHeader, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: DashboardView_default.cardTitle, children: [
            ch.label ?? ch.id,
            ch.plan ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: DashboardView_default.muted, children: [
              " \xB7 ",
              ch.plan
            ] }) : null
          ] }),
          htxt ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillWarn}`, children: htxt }) : null
        ] }),
        ch.amount != null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.pillRow, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${lowAmount ? DashboardView_default.pillWarn : ""}`, children: [
            ch.amountLabel ? `${ch.amountLabel} ` : "",
            fmtMoney(ch.amount, ch.currency)
          ] }),
          ch.meta ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: ch.meta }) : null
        ] }),
        wins.map((w) => {
          const pct2 = w.usedPercent ?? (w.max ? Math.round((w.used ?? 0) / w.max * 100) : null);
          const frac = w.used != null && w.max != null ? `${w.used}/${w.max}${w.unit ? ` ${w.unit}` : ""}` : null;
          const reset = fmtReset(w.resetsAt);
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.quotaWindow, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.pillRow, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
                w.label,
                frac ? ` ${frac}` : ""
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
                pct2 != null ? `${pct2}%` : "\u2014",
                reset ? ` \xB7 ${reset}` : ""
              ] })
            ] }),
            pct2 != null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: DashboardView_default.barTrack, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `${DashboardView_default.barFill} ${barClass(pct2)}`, style: { width: `${Math.min(100, pct2)}%` } }) })
          ] }, w.scope ?? w.label ?? "w");
        }),
        ch.note ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: ch.note }) : null
      ] }, ch.id ?? ch.label ?? "?");
    }),
    errs.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: errs.join("\uFF1B") })
  ] });
}
function UsageCard({ data }) {
  if (data == null || typeof data !== "object") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u2014" });
  }
  const d = data;
  const t = d.totals;
  if (!t) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u2014" });
  const fmtTokens2 = (n) => n == null ? "\u2014" : n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n.toLocaleString();
  const usd = (n) => n == null ? "\u2014" : `$${n.toFixed(2)}`;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.pillRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        "\u54CD\u5E94 ",
        t.modelResponseCount ?? 0
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        "tokens ",
        fmtTokens2(t.totalTokens)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        "\u7F13\u5B58\u547D\u4E2D ",
        t.cacheHitRate != null ? `${(t.cacheHitRate * 100).toFixed(1)}%` : "\u2014"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${t.costUnknownCount ? DashboardView_default.pillWarn : ""}`, children: [
        "\u6210\u672C ",
        usd(t.estimatedCostUsd)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        "\u7F13\u5B58\u7701 ",
        usd(t.cacheSavingsUsd)
      ] }),
      t.costUnknownCount ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "span",
        {
          className: `${DashboardView_default.pill} ${DashboardView_default.pillWarn}`,
          title: (d.unpricedModels ?? []).join("\n") || "\u672A\u767B\u8BB0\u6A21\u578B\u540D",
          children: [
            "\u672A\u8BA1\u4EF7 ",
            t.costUnknownCount,
            d.unpricedModels?.length ? `\uFF08${d.unpricedModels.join("\u3001")}\uFF09` : ""
          ]
        }
      ) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: DashboardView_default.usageTable, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u6A21\u578B" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u54CD\u5E94" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u8F93\u5165" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u8F93\u51FA" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u7F13\u5B58\u8BFB" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u6210\u672C" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u7F13\u5B58\u7701" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: (d.byProviderModel ?? []).map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("code", { children: [
          r.provider,
          "/",
          r.model
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: r.modelResponseCount }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: fmtTokens2(r.promptTokens) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: fmtTokens2(r.completionTokens) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: fmtTokens2(r.cacheReadTokens) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: usd(r.estimatedCostUsd) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: usd(r.cacheSavingsUsd) })
      ] }, `${r.provider}/${r.model}`)) })
    ] }),
    (d.byDay ?? []).length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: DashboardView_default.dayStrip, children: (d.byDay ?? []).slice(-7).map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: DashboardView_default.dayCell, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: new Date(r.day * 864e5).toLocaleDateString([], { month: "numeric", day: "numeric" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: fmtTokens2(r.promptTokens + r.completionTokens) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: usd(r.estimatedCostUsd) })
    ] }, r.day)) })
  ] });
}
function ReconcileCard({ data }) {
  if (data == null || typeof data !== "object") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u2014" });
  }
  const d = data;
  const c = d.combined;
  const s = d.sources;
  const fmtTokens2 = (n) => n == null ? "\u2014" : n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n.toLocaleString();
  const usd = (n) => n == null ? "\u2014" : `$${n.toFixed(2)}`;
  const windowLabel = (w) => {
    const f = w?.from;
    const t0 = w?.to;
    if (f == null || t0 == null) return "";
    const a = new Date(typeof f === "number" ? f : String(f)).getTime();
    const b = new Date(typeof t0 === "number" ? t0 : String(t0)).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return "";
    const hours = Math.round((b - a) / 36e5);
    return hours >= 48 ? `\u8FD1${Math.round(hours / 24)}d` : `\u8FD1${hours}h`;
  };
  const block = (label, t, win) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.quotaBlock, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: DashboardView_default.cardTitle, children: [
      label,
      win ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: DashboardView_default.muted, children: [
        " \xB7 ",
        win
      ] }) : null
    ] }),
    t ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.pillRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        "\u54CD\u5E94 ",
        t.modelResponseCount ?? 0
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        "tokens ",
        fmtTokens2(t.totalTokens)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        "\u6210\u672C ",
        usd(t.estimatedCostUsd)
      ] })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u65E0\u6570\u636E" })
  ] });
  const quota = s?.quotas;
  const errs = [...d.errors ?? [], ...quota?.errors ?? []];
  const winDsh = windowLabel(d.windows?.dsh);
  const winLos = windowLabel(d.windows?.los);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    c && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.pillRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillWarn}`, children: [
        "\u7EFC\u5408\u6210\u672C ",
        usd(c.estimatedCostUsd)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        "\u54CD\u5E94 ",
        c.modelResponseCount ?? 0
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        "tokens ",
        fmtTokens2(c.totalTokens)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        "\u7F13\u5B58\u7701 ",
        usd(c.cacheSavingsUsd)
      ] })
    ] }),
    winDsh && winLos && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: DashboardView_default.muted, children: [
      "\u7EFC\u5408\u503C\u4E3A ",
      winDsh,
      " DSH + ",
      winLos,
      " los \u8DE8\u7A97\u53E3\u76F8\u52A0\uFF0C\u8FD1\u4F3C\u53C2\u8003"
    ] }),
    (s?.dshSessions?.totals?.costUnknownCount ?? 0) > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: DashboardView_default.muted, children: [
      "\u26A0 \u7EFC\u5408\u6210\u672C\u4E3A\u4E0B\u9650\uFF1ADSH \u4FA7 ",
      s?.dshSessions?.totals?.costUnknownCount,
      " \u6B21\u8C03\u7528\u672A\u8BA1\u4EF7",
      s?.dshSessions?.unpricedModels?.length ? `\uFF08${s.dshSessions.unpricedModels.join("\u3001")}\uFF09` : "",
      "\uFF0C\u5B9E\u9645\u6210\u672C\u9AD8\u4E8E\u4E0A\u65B9\u6570\u503C"
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.quotaGrid, children: [
      block("DSH sessions", s?.dshSessions?.totals, winDsh),
      block("los runtime", s?.losRuntime?.totals, winLos),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.quotaBlock, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.cardTitle, children: "\u914D\u989D\u4F59\u989D" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.pillRow, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
            "ZenMux ",
            usd(quota?.zenmux?.paygBalanceUsd)
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
            "Packy ",
            usd(quota?.packy?.remainingUsd)
          ] })
        ] })
      ] })
    ] }),
    errs.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: errs.join("\uFF1B") })
  ] });
}
var fmtGiB = (v) => v == null ? "\u2014" : `${(v / 1024 ** 3).toFixed(1)} GiB`;
var freshWord = (iso) => {
  if (!iso) return "\u2014";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "\u2014";
  const sec = Math.max(0, Math.round((Date.now() - t) / 1e3));
  if (sec < 90) return "\u521A\u521A";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} \u5206\u949F\u524D`;
  const h = Math.round(min / 60);
  return `${h} \u5C0F\u65F6\u524D`;
};
function DiskCard({ data, t }) {
  if (data == null || typeof data !== "object") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u2014" });
  const disk = data.disk;
  if (!disk) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: DashboardView_default.muted, children: [
    "\u2014 ",
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.muted, children: t("disk.unavailable") })
  ] });
  const total = disk.totalBytes ?? null;
  const avail = disk.availableBytes ?? null;
  const purge = disk.purgeableBytes ?? null;
  const eff = disk.effectiveBytes ?? null;
  const usedBytes = total != null && eff != null ? Math.max(0, total - eff) : null;
  const frac = (v) => total && total > 0 && v != null ? Math.max(0, Math.min(100, v / total * 100)) : 0;
  const showBar = total != null && usedBytes != null && purge != null && avail != null;
  const dot = disk.level === "critical" ? "error" : disk.level === "warn" ? "warning" : "done";
  const snaps = disk.snapshots;
  const degradedNote = disk.degraded ? [
    disk.reasons?.includes("no-probe") ? t("disk.degradedProbe") : null,
    disk.reasons?.includes("df-mismatch") ? t("disk.degradedMismatch") : null,
    disk.reasons?.includes("important-lt-available") ? t("disk.degradedInverted") : null
  ].filter(Boolean).join("\uFF1B") : "";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.diskHead, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.rowDot, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: dot, size: 8 }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.diskPct, children: pct(disk.effectiveUsedPct) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.muted, children: t("disk.usedOf") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.diskFresh, children: freshWord(disk.asOf) })
    ] }),
    showBar ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.diskBar, role: "img", "aria-label": `${t("disk.usedOf")} ${pct(disk.effectiveUsedPct)}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `${DashboardView_default.diskSeg} ${DashboardView_default.diskSegUsed}`, style: { width: `${frac(usedBytes)}%` } }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `${DashboardView_default.diskSeg} ${DashboardView_default.diskSegPurge}`, style: { width: `${frac(purge)}%` } }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `${DashboardView_default.diskSeg} ${DashboardView_default.diskSegFree}`, style: { width: `${frac(avail)}%` } })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: DashboardView_default.diskBar }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.diskLegend, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        t("disk.used"),
        " ",
        fmtGiB(usedBytes)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        t("disk.purgeable"),
        " ",
        fmtGiB(purge)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        t("disk.free"),
        " ",
        fmtGiB(avail)
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.diskNote, children: avail != null ? `${t("disk.writable")} ${fmtGiB(avail)}` : t("disk.unavailable") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.diskNote, children: purge == null ? t("disk.purgeUnknown") : snaps && snaps.count != null && snaps.count > 0 ? `${t("disk.purgeable")} ${fmtGiB(purge)} \xB7 ${snaps.count} ${t("disk.snapCount")}${snaps.latestAt ? `\uFF08${t("disk.snapLatest")} ${new Date(snaps.latestAt).toLocaleTimeString()}\uFF09` : ""}` : `${t("disk.purgeable")} ${fmtGiB(purge)} \xB7 ${t("disk.snapUnknown")}` }),
    degradedNote ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.hint, children: degradedNote }) : null
  ] });
}
function NodeMatrix({ data, t }) {
  const rows = data ?? [];
  const [showOffline, setShowOffline] = (0, import_react.useState)(false);
  if (!rows.length) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: t("noData") });
  const dot = (s) => s === "online" ? "done" : s === "offline" ? "error" : "warning";
  const online = rows.filter((n) => n.status !== "offline");
  const offline = rows.filter((n) => n.status === "offline");
  const oldest = offline.reduce((m, n) => Math.max(m, Number(n.heartbeatAgeSec) || 0), 0);
  const visible = showOffline ? online.concat(offline) : online;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: DashboardView_default.table, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("col.node") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("col.status") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: DashboardView_default.num, children: t("col.loadCore") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: DashboardView_default.num, children: t("col.mem") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("col.platform") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: DashboardView_default.num, children: t("col.heartbeat") })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tbody", { children: [
      visible.map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { className: DashboardView_default.wrap, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.mono, children: n.nodeId }),
          n.hostLabel ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `${DashboardView_default.muted} ${DashboardView_default.hostSub}`, children: n.hostLabel }) : null
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.rowDot, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: dot(n.status ?? "?"), size: 8 }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: n.status === "online" ? DashboardView_default.okText : n.status === "offline" ? DashboardView_default.errText : DashboardView_default.warnText, children: n.status ?? "?" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: DashboardView_default.num, children: n.capacity?.cpuLoad1m != null ? `${(n.capacity.cpuLoad1m / Math.max(n.capacity?.cpuCores ?? 1, 1)).toFixed(2)}${n.capacity?.cpuCores ? `/${n.capacity.cpuCores}c` : ""}` : "\u2014" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { className: DashboardView_default.num, children: [
          n.capacity?.memoryAvailableMb != null ? `${(n.capacity.memoryAvailableMb / 1024).toFixed(1)}G` : "\u2014",
          n.capacity?.memoryTotalMb != null ? `/${(n.capacity.memoryTotalMb / 1024).toFixed(0)}G` : ""
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
          n.capacity?.platform ?? "\u2014",
          n.capacity?.arch ? ` ${n.capacity.arch}` : ""
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: DashboardView_default.num, children: fmtAgeSec(n.heartbeatAgeSec) })
      ] }, n.nodeId)),
      offline.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { colSpan: 6, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: DashboardView_default.nodeMore, onClick: () => {
        setShowOffline(!showOffline);
      }, children: showOffline ? `\u6536\u8D77 ${offline.length} \u4E2A\u79BB\u7EBF\u8282\u70B9` : `${online.length} \u53F0\u5728\u7EBF \xB7 \u53E6\u6709 ${offline.length} \u4E2A\u79BB\u7EBF\u76EE\u6807\uFF08\u6700\u4E45 ${fmtAgeSec(oldest)}\u672A\u63A2\u6D4B\uFF09\xB7 \u5C55\u5F00` }) }) }) : null
    ] })
  ] });
}
function Sparkline({ series }) {
  const W = 300;
  const H = 56;
  const P = 3;
  const fmt = (v, unit) => unit === "ms" ? fmtDur(v) : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : v.toFixed(1);
  const paths = series.map((s) => {
    const vals = s.values;
    const nums = vals.filter((v) => v != null);
    if (!nums.length) return null;
    const max = Math.max(...nums, 1e-6);
    const min = Math.min(...nums, 0);
    const range = max - min || 1;
    const segments = [];
    let cur = [];
    vals.forEach((v, i) => {
      if (v == null) {
        if (cur.length) {
          segments.push(cur.join(" "));
          cur = [];
        }
        return;
      }
      const x = P + i / Math.max(vals.length - 1, 1) * (W - P * 2);
      const y = H - P - (v - min) / range * (H - P * 2);
      cur.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    });
    if (cur.length) segments.push(cur.join(" "));
    return {
      name: s.name,
      color: s.color,
      unit: s.unit,
      last: nums[nums.length - 1],
      segments
    };
  });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H, role: "img", "aria-label": "sparkline", children: paths.filter((p) => p !== null).map((p, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("g", { children: p.segments.map((pts, j) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("polyline", { points: pts, fill: "none", stroke: p.color, strokeWidth: "1.6", strokeLinejoin: "round" }, j)) }, i)) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: DashboardView_default.legend, children: paths.filter((p) => p !== null).map((p, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: DashboardView_default.legendItem, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.legendDot, style: { background: p.color } }),
      p.name,
      " ",
      p.last != null ? fmt(p.last, p.unit) : "\u2014"
    ] }, i)) })
  ] });
}
var fmtAgeSec = (sec) => {
  if (sec == null || !Number.isFinite(sec)) return "\u2014";
  return ago(Date.now() - Math.max(0, sec) * 1e3);
};
var fmtAgo = (iso) => {
  if (!iso) return "\u2014";
  const at = new Date(iso).getTime();
  return Number.isFinite(at) ? ago(at) : "\u2014";
};
function SurgeNodeTable({ data, t }) {
  if (data == null || typeof data !== "object") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u2014" });
  }
  const d = data;
  const summary = d.summary ?? {};
  const quarantinedCount = summary.quarantined ?? 0;
  const dot = (s) => {
    if (s === "healthy") return "done";
    if (s === "grok_403" || s === "xai_partial") return "warning";
    return "error";
  };
  const textCls = (s) => s === "healthy" ? DashboardView_default.okText : s === "grok_403" || s === "xai_partial" ? DashboardView_default.warnText : DashboardView_default.errText;
  const codeCls = (c) => c === "401" || c === "200" || c === "204" ? DashboardView_default.okText : c === "403" ? DashboardView_default.warnText : c === "000" ? DashboardView_default.errText : DashboardView_default.muted;
  const statusLabel = (s) => t(`surge.st.${s}`) || s;
  const eventCls = (type) => type.includes("recover") ? DashboardView_default.okText : type.startsWith("quarantine") ? DashboardView_default.warnText : DashboardView_default.muted;
  const pill = (label, n, warn) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${warn ? DashboardView_default.pillWarn : DashboardView_default.pill}`, children: [
    label,
    " ",
    n ?? 0
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.pillRow, children: [
      pill(t("surge.st.healthy"), summary.healthy, false),
      pill(t("surge.st.grok_403"), summary.grok_403, true),
      pill(t("surge.st.xai_blocked"), summary.xai_blocked, true),
      pill(t("surge.st.xai_banned"), summary.xai_banned, true),
      pill(t("surge.st.dead"), summary.dead, true),
      pill(t("surge.quarantined"), quarantinedCount, quarantinedCount > 0)
    ] }),
    d.error && !d.nodes.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: d.error }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: DashboardView_default.table, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("col.node") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("col.status") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("surge.col.probe") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: DashboardView_default.num, children: t("col.latency") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("surge.col.q") })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tbody", { children: [
        d.nodes.map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.mono, children: n.name }),
            n.quarantined ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `${DashboardView_default.muted} ${DashboardView_default.hostSub}`, children: t("surge.isolated") }) : null
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.rowDot, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: dot(n.status), size: 8 }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: textCls(n.status), children: statusLabel(n.status) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: DashboardView_default.mono, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: codeCls(n.xai?.code), children: n.xai?.code ?? "\u2014" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.muted, children: "/" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: codeCls(n.grok?.code), children: n.grok?.code ?? "\u2014" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.muted, children: "/" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: codeCls(n.openai?.code), children: n.openai?.code ?? "\u2014" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.muted, children: " c:" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: codeCls(n.ctrl?.code), children: n.ctrl?.code ?? "\u2014" })
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: DashboardView_default.num, children: fmtDur(n.xai?.ms ?? n.ctrl?.ms ?? null) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: n.quarantined ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { title: n.cooldownUntil ?? void 0, children: fmtAgo(n.cooldownUntil) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.muted, children: "\u2014" }) })
        ] }, n.name)),
        !d.nodes.length && !d.error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { colSpan: 5, className: DashboardView_default.muted, children: t("noData") }) })
      ] })
    ] }),
    d.recentEvents && d.recentEvents.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.eventList, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: t("surge.events") }),
      d.recentEvents.map((e, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.eventRow, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.muted, children: fmtAgo(e.ts) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: eventCls(e.type), children: t(`surge.evt.${e.type}`) || e.type }),
        e.node ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.mono, children: e.node }) : null
      ] }, i))
    ] })
  ] });
}
function PackyTable({ data, t }) {
  if (data == null || typeof data !== "object") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u2014" });
  }
  const d = data;
  const results = d.results ?? [];
  const authed = d.probeKind === "authenticated";
  const verdictDot = (v) => {
    if (!authed) return "ongoing";
    if (v === "ok") return "done";
    if (v === "blocked" || v === "flaky") return "warning";
    return "error";
  };
  const verdictCls = (v) => !authed ? DashboardView_default.muted : v === "ok" ? DashboardView_default.okText : v === "blocked" || v === "flaky" ? DashboardView_default.warnText : DashboardView_default.errText;
  const fmtStatuses = (list) => list && list.length ? list.map((s) => s == null ? "000" : String(s)).join("/") : "\u2014";
  const verdictLabel = (v) => t(`packy.verdict.${v}`) || v;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: DashboardView_default.muted, children: [
      t("packy.updated"),
      ": ",
      fmtAgo(d.updatedAt),
      " \xB7 ",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: d.stale ? DashboardView_default.warnText : DashboardView_default.okText, children: d.stale ? t("packy.stale") : t("packy.fresh") }),
      " \xB7 ",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: authed ? DashboardView_default.okText : DashboardView_default.muted, children: t(`packy.probeKind.${d.probeKind ?? "unknown"}`) }),
      d.keySource ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        " \xB7 ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: DashboardView_default.muted, children: [
          t("packy.keySource"),
          ": ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.mono, children: d.keySource })
        ] })
      ] }) : null
    ] }),
    d.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.error, children: d.error }) : null,
    results.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: DashboardView_default.table, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("packy.col.policy") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("packy.col.verdict") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("packy.col.samples") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: DashboardView_default.num, children: t("packy.col.latency") })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: results.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.mono, children: r.policy }),
          (d.standbyCandidates ?? []).includes(r.policy) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `${DashboardView_default.muted} ${DashboardView_default.hostSub}`, children: t("packy.standby") }) : null
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.rowDot, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: verdictDot(r.verdict), size: 8 }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: verdictCls(r.verdict), children: verdictLabel(r.verdict) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.mono, children: fmtStatuses(r.statuses) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: DashboardView_default.num, children: fmtDur(r.median_ms ?? null) })
      ] }, r.policy)) })
    ] }),
    !results.length && !d.error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: t("packy.empty") }),
    d.probeUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: DashboardView_default.muted, children: [
      t("packy.url"),
      ": ",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.mono, children: d.probeUrl })
    ] }) : null
  ] });
}
function TasksCard({ data }) {
  if (data == null || typeof data !== "object") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u2014" });
  }
  const d = data;
  if (!d.totals) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u2014" });
  const t = d.totals;
  const nodes = d.nodes;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.pillRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        "queued ",
        t.queued ?? 0
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${(t.running ?? 0) > 0 ? DashboardView_default.pill : DashboardView_default.pillDim}`, children: [
        "running ",
        t.running ?? 0
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        "ok 24h ",
        t.succeeded24h ?? 0
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${(t.failed24h ?? 0) > 0 ? DashboardView_default.pillWarn : DashboardView_default.pillDim}`, children: [
        "fail 24h ",
        t.failed24h ?? 0
      ] }),
      (t.blocked24h ?? 0) > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillWarn}`, children: [
        "blocked 24h ",
        t.blocked24h
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
        "executors ",
        nodes?.online ?? "\u2014",
        "/",
        nodes?.total ?? "\u2014"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: DashboardView_default.muted, children: [
      "\u6700\u8001 queued\uFF1A",
      fmtAgeSec(d.oldestQueuedSec),
      d.truncated ? ` \xB7 \u4EC5\u6700\u65B0 ${d.sampled ?? 500} \u6761` : ""
    ] }),
    (d.recent ?? []).length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: DashboardView_default.table, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u4EFB\u52A1" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u72B6\u6001" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u8282\u70B9" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: DashboardView_default.num, children: "\u5E74\u9F84" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: (d.recent ?? []).slice(0, 8).map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: DashboardView_default.mono, children: (r.id ?? "").replace(/^task-/, "").slice(0, 8) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: r.status === "failed" ? DashboardView_default.errText : r.status === "blocked" ? DashboardView_default.warnText : DashboardView_default.okText, children: r.status ?? "\u2014" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: r.nodeId ?? "\u2014" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: DashboardView_default.num, children: fmtAgeSec(r.ageSec) })
      ] }, i)) })
    ] })
  ] });
}
function TrendChart({ data, t }) {
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
      unit: "ms",
      // los trends avgDurationMs 单位 ms
      values: (s.points ?? []).map((p) => p.avgDurationMs ?? null)
    }));
    if (!series.length) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u65E0\u8D8B\u52BF\u6570\u636E" });
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkline, { series });
  }
  if (d.points) {
    const pts = d.points;
    const real = pts.filter((p) => p != null);
    if (real.length < 2) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u7B49\u5F85\u91C7\u6837\u2026" });
    const series = [
      { name: "load1", unit: "raw", color: COLORS[0], values: pts.map((p) => p == null ? null : p.load1 ?? null) },
      { name: "mem%", unit: "raw", color: COLORS[1], values: pts.map((p) => p == null ? null : p.memUsedPct ?? null) }
    ];
    const gaps = pts.filter((p) => p == null).length;
    const winMin = d.windowStart && d.windowEnd ? Math.max(1, Math.round((new Date(d.windowEnd).getTime() - new Date(d.windowStart).getTime()) / 6e4)) : null;
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkline, { series }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: DashboardView_default.muted, children: [
        winMin != null ? `${t("chart.window")} ${winMin}min \xB7 ` : "",
        t("chart.points"),
        " ",
        real.length,
        gaps > 0 ? ` \xB7 ${t("chart.gap")} ${gaps}` : ""
      ] })
    ] });
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
  const degraded = results.filter((r) => r.degraded);
  const down = results.filter((r) => !r.ok && !r.degraded);
  const upCount = d.ok ?? results.length - down.length - degraded.length;
  const rowDot = (r) => r.ok ? "done" : r.degraded ? "warning" : "error";
  const rowText = (r) => r.ok ? "up" : r.degraded ? "degraded" : "down";
  const rowCls = (r) => r.ok ? DashboardView_default.okText : r.degraded ? DashboardView_default.warnText : DashboardView_default.errText;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: DashboardView_default.pillRow, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${down.length ? DashboardView_default.pillWarn : degraded.length ? DashboardView_default.pillWarn : DashboardView_default.pill}`, children: [
      upCount,
      "/",
      d.total ?? results.length,
      " up",
      degraded.length ? ` \xB7 ${degraded.length} degraded` : ""
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
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.rowDot, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: rowDot(r), size: 8 }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: rowCls(r), children: rowText(r) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: DashboardView_default.num, children: typeof r.latencyMs === "number" && r.latencyMs >= 0 ? `${r.latencyMs}ms` : "\u2014" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: `${DashboardView_default.muted} ${DashboardView_default.wrap}`, children: r.detail ?? "\u2014" })
      ] }, i)) })
    ] })
  ] });
}
function FeedCard({ data, t }) {
  const [open, setOpen] = (0, import_react.useState)(null);
  if (data == null || typeof data !== "object") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u2014" });
  }
  const d = data;
  if (d.error && !d.digests?.length) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: d.error });
  const digests = d.digests ?? [];
  if (!digests.length) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: t("feed.empty") });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: DashboardView_default.pillRow, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
      t("feed.latest"),
      " ",
      digests.length
    ] }) }),
    digests.map((g) => {
      const key = g.file ?? g.at ?? "";
      const expanded = open === key;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.feedItem, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            type: "button",
            className: DashboardView_default.feedToggle,
            onClick: () => setOpen(expanded ? null : key),
            "aria-expanded": expanded,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.feedTitle, children: g.title ?? g.file ?? "\u2014" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: DashboardView_default.feedTime, children: [
                g.at ? new Date(g.at).toLocaleString() : "\u2014",
                g.lines != null ? ` \xB7 ${g.lines} \u884C` : ""
              ] })
            ]
          }
        ),
        expanded && g.text ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: DashboardView_default.feedBody, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.MarkdownText, { text: g.text }) }) : null
      ] }, key);
    })
  ] });
}
function HostRestartCard({ data, t }) {
  const d = data ?? {};
  const [confirming, setConfirming] = (0, import_react.useState)(false);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [notice, setNotice] = (0, import_react.useState)(null);
  const [rawReason, setRawReason] = (0, import_react.useState)(null);
  const [bad, setBad] = (0, import_react.useState)(false);
  if (d.available === false) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: `${t("host.unavailable")} ${d.reason ?? "\u2014"}` });
  }
  const phase = d.daemon?.phase ?? "unknown";
  const dot = phase === "healthy" ? "done" : phase === "starting" || phase === "child-exited" || phase === "auto-reload" ? "working" : phase === "unknown" ? "idle" : "error";
  const running = d.turns?.running;
  const pending = d.pending?.count ?? 0;
  const send = async (force) => {
    setBusy(true);
    setBad(false);
    setNotice(null);
    try {
      const res = await fetch("/host-restart/request", {
        method: "POST",
        headers: { "content-type": "application/json", "x-dsh-host-restart": "1" },
        body: JSON.stringify({ confirm: true, ...force ? { force: true } : {}, reason: "dashboards card" })
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 202 && body.ok === true) {
        setConfirming(false);
        setNotice(t("host.accepted"));
        return;
      }
      setBad(true);
      setRawReason(body.reason ?? null);
      setNotice(translateCode(body.code, { running, phase, retryAfterMs: body.retryAfterMs }, t) ?? body.reason ?? body.code ?? `HTTP ${res.status}`);
    } catch (error) {
      setBad(true);
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.hostCard, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: DashboardView_default.hostHead, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.rowDot, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: dot, size: 8 }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.hostPhase, title: `phase: ${phase}`, children: phaseLabel(phase) }),
      typeof d.host?.pid === "number" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.muted, children: `pid ${d.host.pid}` }) : null,
      typeof d.host?.uptimeMs === "number" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.muted, children: `\u5DF2\u8FD0\u884C ${fmtDuration(d.host.uptimeMs)}` }) : null,
      typeof d.daemon?.childPid === "number" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.muted, children: `child ${d.daemon.childPid}` }) : null,
      typeof d.daemon?.restarts === "number" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.muted, children: `\u7D2F\u8BA1\u91CD\u542F ${d.daemon.restarts} \u6B21` }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: DashboardView_default.hostRow, children: [
      typeof running === "number" && running > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.hostWarn, children: `\u5728\u8DD1 ${running} \u4E2A\u4F1A\u8BDD` }) : typeof running === "number" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.muted, children: "\u6CA1\u6709\u4F1A\u8BDD\u5728\u8DD1" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.muted, children: "\u8BFB\u4E0D\u5230\u4F1A\u8BDD\u6570" }),
      pending > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.muted, children: `${pending} \u4E2A\u6587\u4EF6\u6BD4\u5BBF\u4E3B\u65B0\uFF08\u91CD\u542F\u540E\u751F\u6548\uFF09` }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.muted, children: "\u6CA1\u6709\u6587\u4EF6\u6BD4\u5BBF\u4E3B\u65B0" })
    ] }),
    pending > 0 && d.pending?.items?.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.hostFiles, children: d.pending.items.slice(0, 3).map((item) => item.path.split("/").slice(-3).join("/")).join(" \xB7 ") }) : null,
    notice !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: bad ? DashboardView_default.error : DashboardView_default.muted, title: rawReason ?? void 0, children: notice }) : null,
    confirming ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.hostConfirm, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.hostWarn, children: typeof running === "number" && running > 0 ? `\u786E\u8BA4\u91CD\u542F\uFF1F\u4F1A\u4E2D\u65AD\u5728\u8DD1\u7684 ${running} \u4E2A\u4F1A\u8BDD\uFF08\u8FD9\u4E00\u7EBF\u6CA1\u6709\u81EA\u52A8\u7EED\u8DD1\uFF09\u3002` : "\u786E\u8BA4\u91CD\u542F\uFF1F\u5F53\u524D\u6CA1\u6709\u4F1A\u8BDD\u5728\u8DD1\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `${DashboardView_default.hostActions} ${DashboardView_default.hostConfirmActions}`, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: DashboardView_default.btn, onClick: () => setConfirming(false), disabled: busy, children: "\u53D6\u6D88" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: `${DashboardView_default.btn} ${DashboardView_default.btnPrimary}`, onClick: () => void send(false), disabled: busy, children: "\u786E\u8BA4\u91CD\u542F" }),
        typeof running === "number" && running > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: DashboardView_default.btn, onClick: () => void send(true), disabled: busy, children: "\u4ECD\u7136\u91CD\u542F" }) : null
      ] })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: DashboardView_default.hostActions, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        className: DashboardView_default.btn,
        onClick: () => {
          setNotice(null);
          setBad(false);
          setConfirming(true);
        },
        disabled: phase === "unhealthy" || phase === "preflight-failed",
        title: phase === "unhealthy" || phase === "preflight-failed" ? "\u5B88\u62A4\u8FDB\u7A0B\u4E0D\u5065\u5EB7\uFF0C\u5148\u4FEE\u5B83\u518D\u91CD\u542F" : "\u91CD\u542F\u8FD9\u4E2A web \u5BBF\u4E3B",
        children: "\u91CD\u542F\u5BBF\u4E3B"
      }
    ) })
  ] });
}
function translateCode(code, context, t) {
  const fill = (key, vars) => {
    let text = t(key);
    for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, value);
    return text;
  };
  switch (code) {
    case "turns-running":
      return fill("host.turnsRunning", { count: String(context.running ?? "?") });
    case "turns-unknown":
      return t("host.turnsUnknown");
    case "debounce":
      return fill("host.debounce", { seconds: String(Math.ceil((context.retryAfterMs ?? 6e4) / 1e3)) });
    case "daemon-unhealthy":
      return fill("host.daemonUnhealthy", { phase: context.phase ?? "?" });
    case "not-loopback":
      return t("host.notLoopback");
    case "missing-marker":
      return t("host.missingMarker");
    default:
      return null;
  }
}
function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "\u2014";
  if (ms < 6e4) return `${Math.round(ms / 1e3)} \u79D2`;
  if (ms < 36e5) return `${Math.round(ms / 6e4)} \u5206\u949F`;
  if (ms < 864e5) return `${(ms / 36e5).toFixed(1)} \u5C0F\u65F6`;
  return `${Math.round(ms / 864e5)} \u5929`;
}
function phaseLabel(phase) {
  switch (phase) {
    case "healthy":
      return "\u8FD0\u884C\u6B63\u5E38";
    case "starting":
      return "\u542F\u52A8\u4E2D";
    case "child-exited":
      return "\u5B50\u8FDB\u7A0B\u5DF2\u9000\u51FA";
    case "auto-reload":
      return "\u70ED\u91CD\u8F7D\u4E2D";
    case "unhealthy":
      return "\u4E0D\u5065\u5EB7";
    case "preflight-failed":
      return "\u9884\u68C0\u5931\u8D25";
    case "unknown":
      return "\u672A\u77E5";
    default:
      return phase;
  }
}
function SummaryStrip({ widgets, t }) {
  const dataById = {};
  for (const w of widgets) dataById[w.id] = w.snap?.data;
  const facts = buildStrip(dataById);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: DashboardView_default.strip, role: "list", "aria-label": t("strip.label"), children: facts.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.fact, role: "listitem", title: f.hint || void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.factLabel, children: t(`strip.${f.key}`) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: DashboardView_default.factValue, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: f.state, size: 8 }),
      f.value
    ] }),
    f.hint ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.factHint, children: f.hint }) : null
  ] }, f.key)) });
}
function WidgetCard({ widget, snap, t, editing, removing, onRemove }) {
  const d = snap?.data;
  const hasError = !!(snap?.error || d?.error);
  const bodyRef = (0, import_react.useRef)(null);
  const [expanded, setExpanded] = (0, import_react.useState)(false);
  const [tall, setTall] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(() => {
    const el = bodyRef.current;
    if (!el || expanded) return;
    setTall(el.scrollHeight > CARD_BODY_MAX + 24);
  }, [snap, widget.type, expanded]);
  const wide = WIDE_TYPES.has(widget.type);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: `${DashboardView_default.card} ${wide ? DashboardView_default.span2 : ""} ${removing ? DashboardView_default.cardRemoving : ""}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: DashboardView_default.cardHeader, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.cardTitle, children: widget.title }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: DashboardView_default.cardMeta, children: [
        snap?.ts ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: DashboardView_default.muted, title: snap.ts, children: [
          t("updated"),
          " ",
          fmtAgo(snap.ts)
        ] }) : null,
        editing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: DashboardView_default.removeBtn,
            onClick: onRemove,
            "aria-label": `\u79FB\u9664 ${widget.title}`,
            title: removing ? "\u53D6\u6D88\u79FB\u9664" : "\u79FB\u9664\u8BE5 widget",
            children: removing ? "\u21A9" : "\u2715"
          }
        ) : null
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `${DashboardView_default.bodyWrap} ${tall && !expanded ? DashboardView_default.bodyFaded : ""}`, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { ref: bodyRef, className: `${DashboardView_default.cardBody} ${tall && !expanded ? DashboardView_default.cardBodyClamped : ""}`, children: hasError ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: DashboardView_default.error, children: [
      "\u26A0\uFE0F ",
      snap?.error || d.error
    ] }) : widget.type === "tasks" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TasksCard, { data: d }) : widget.type === "stat" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, { data: d, t }) : widget.type === "matrix" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NodeMatrix, { data: d, t }) : widget.type === "chart" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TrendChart, { data: d, t }) : widget.type === "list" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ListCard, { data: d }) : widget.type === "surge" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SurgeNodeTable, { data: d, t }) : widget.type === "packy" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PackyTable, { data: d, t }) : widget.type === "feed" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FeedCard, { data: d, t }) : widget.type === "quota" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(QuotaCard, { data: d }) : widget.type === "usage" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UsageCard, { data: d }) : widget.type === "reconcile" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReconcileCard, { data: d }) : widget.type === "disk" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DiskCard, { data: d, t }) : widget.type === "host" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HostRestartCard, { data: d, t }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: t("noData") }) }) }),
    tall ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: DashboardView_default.cardMore, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: DashboardView_default.btnSmall, "aria-expanded": expanded, onClick: () => setExpanded((v) => !v), children: expanded ? t("card.collapse") : t("card.expandAll") }) }) : null
  ] });
}
function DashboardView(props) {
  const { t } = props;
  const localeT = (k) => t ? t(k) : k;
  const [widgets, setWidgets] = (0, import_react.useState)(null);
  const [configError, setConfigError] = (0, import_react.useState)(null);
  const [reloadKey, setReloadKey] = (0, import_react.useState)(0);
  const widgetsRef = (0, import_react.useRef)(null);
  const grouped = (0, import_react.useMemo)(() => groupWidgets(widgets ?? []), [widgets]);
  const [openGroups, setOpenGroups] = (0, import_react.useState)(() => readOpenGroups());
  const openSet = (0, import_react.useMemo)(() => {
    if (openGroups) return new Set(openGroups);
    return new Set(grouped.length > 0 ? [grouped[0].key] : []);
  }, [openGroups, grouped]);
  const toggleGroup = (0, import_react.useCallback)((key) => {
    setOpenGroups((prev) => {
      const base = prev ?? (grouped.length > 0 ? [grouped[0].key] : []);
      const next = base.includes(key) ? base.filter((k) => k !== key) : [...base, key];
      writeOpenGroups(next);
      return next;
    });
  }, [grouped]);
  const setAllGroups = (0, import_react.useCallback)((open) => {
    const next = open ? grouped.map((g) => g.key) : [];
    setOpenGroups(next);
    writeOpenGroups(next);
  }, [grouped]);
  const [editing, setEditing] = (0, import_react.useState)(false);
  const [removedIds, setRemovedIds] = (0, import_react.useState)(/* @__PURE__ */ new Set());
  const [probeTargets, setProbeTargets] = (0, import_react.useState)(null);
  const [probeSource, setProbeSource] = (0, import_react.useState)("default");
  const [probeDirty, setProbeDirty] = (0, import_react.useState)(false);
  const [probeRevision, setProbeRevision] = (0, import_react.useState)(0);
  const [widgetsRevision, setWidgetsRevision] = (0, import_react.useState)(0);
  const [editMsg, setEditMsg] = (0, import_react.useState)(null);
  const [saving, setSaving] = (0, import_react.useState)(false);
  const [addName, setAddName] = (0, import_react.useState)("");
  const [addUrl, setAddUrl] = (0, import_react.useState)("");
  const [addPort, setAddPort] = (0, import_react.useState)("");
  const toggleEdit = async () => {
    if (editing) {
      setEditing(false);
      setRemovedIds(/* @__PURE__ */ new Set());
      setProbeTargets(null);
      setProbeDirty(false);
      setEditMsg(null);
      setAddName("");
      setAddUrl("");
      setAddPort("");
      return;
    }
    setEditing(true);
    setEditMsg(null);
    try {
      const wRes = await fetch("/dashboards/widgets", { signal: AbortSignal.timeout(8e3) });
      if (wRes.ok) {
        const wd = await wRes.json();
        if (typeof wd.revision === "number") setWidgetsRevision(wd.revision);
      }
      const res = await fetch("/dashboards/probe-targets", { signal: AbortSignal.timeout(8e3) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setProbeTargets(d.targets ?? []);
      setProbeSource(d.source ?? "default");
      if (typeof d.revision === "number") setProbeRevision(d.revision);
    } catch (e) {
      setEditMsg(`\u63A2\u9488\u76EE\u6807\u8BFB\u53D6\u5931\u8D25: ${String(e)}`);
    }
  };
  const toggleRemove = (id) => {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const addTarget = () => {
    const name = addName.trim();
    if (!name) {
      setEditMsg("\u540D\u79F0\u5FC5\u586B");
      return;
    }
    const url = addUrl.trim();
    const port = addPort.trim();
    if (!url && !port) {
      setEditMsg("URL \u6216\u7AEF\u53E3\u81F3\u5C11\u586B\u4E00\u9879");
      return;
    }
    const t2 = { name };
    if (url) t2.url = url;
    if (port) t2.port = Number(port);
    setProbeTargets((prev) => [...prev ?? [], t2]);
    setProbeDirty(true);
    setAddName("");
    setAddUrl("");
    setAddPort("");
    setEditMsg(null);
  };
  const removeTarget = (i) => {
    setProbeTargets((prev) => (prev ?? []).filter((_, idx) => idx !== i));
    setProbeDirty(true);
  };
  const resetProbe = async () => {
    setSaving(true);
    try {
      const res = await fetch("/dashboards/probe-targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets: [], revision: probeRevision }),
        signal: AbortSignal.timeout(8e3)
      });
      if (res.status === 409) {
        setEditMsg("\u63A2\u9488\u76EE\u6807\u5DF2\u88AB\u5176\u4ED6\u7A97\u53E3\u4FEE\u6539\uFF0C\u8BF7\u5173\u95ED\u7F16\u8F91\u9762\u677F\u540E\u91CD\u65B0\u6253\u5F00\u518D\u8BD5");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setProbeTargets(d.targets ?? []);
      setProbeSource("default");
      setProbeDirty(false);
      if (typeof d.revision === "number") setProbeRevision(d.revision);
      setEditMsg("\u5DF2\u91CD\u7F6E\u4E3A\u9ED8\u8BA4\u63A2\u9488\u76EE\u6807");
    } catch (e) {
      setEditMsg(`\u91CD\u7F6E\u5931\u8D25: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };
  const saveAll = async () => {
    setSaving(true);
    setEditMsg(null);
    try {
      if (removedIds.size > 0 && widgets) {
        const remaining = widgets.filter((w) => !removedIds.has(w.id));
        const res = await fetch("/dashboards/widgets", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widgets: remaining, revision: widgetsRevision }),
          signal: AbortSignal.timeout(8e3)
        });
        if (res.status === 409) {
          setEditMsg("widget \u914D\u7F6E\u5DF2\u88AB\u5176\u4ED6\u7A97\u53E3\u4FEE\u6539\uFF0C\u8BF7\u5173\u95ED\u7F16\u8F91\u9762\u677F\u540E\u91CD\u65B0\u6253\u5F00\u518D\u8BD5");
          return;
        }
        if (!res.ok) throw new Error(`widgets HTTP ${res.status}`);
        const wd = await res.json();
        if (typeof wd.revision === "number") setWidgetsRevision(wd.revision);
      }
      if (probeDirty && probeTargets) {
        const res = await fetch("/dashboards/probe-targets", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targets: probeTargets, revision: probeRevision }),
          signal: AbortSignal.timeout(8e3)
        });
        if (res.status === 409) {
          setEditMsg("\u63A2\u9488\u76EE\u6807\u5DF2\u88AB\u5176\u4ED6\u7A97\u53E3\u4FEE\u6539\uFF0C\u8BF7\u5173\u95ED\u7F16\u8F91\u9762\u677F\u540E\u91CD\u65B0\u6253\u5F00\u518D\u8BD5");
          return;
        }
        if (!res.ok) throw new Error(`probe-targets HTTP ${res.status}`);
        const pd = await res.json();
        if (typeof pd.revision === "number") setProbeRevision(pd.revision);
      }
      setEditing(false);
      setRemovedIds(/* @__PURE__ */ new Set());
      setProbeTargets(null);
      setProbeDirty(false);
      setAddName("");
      setAddUrl("");
      setAddPort("");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setEditMsg(`\u4FDD\u5B58\u5931\u8D25: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };
  (0, import_react.useEffect)(() => {
    let alive = true;
    let timer = null;
    const load = async () => {
      try {
        const res = await fetch("/dashboards/snapshot", { signal: AbortSignal.timeout(15e3) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        if (alive) {
          widgetsRef.current = d.widgets ?? [];
          setWidgets(widgetsRef.current);
          setConfigError(null);
        }
      } catch (e) {
        if (alive && !widgetsRef.current?.length) setConfigError(String(e));
      }
    };
    const sync = () => {
      if (document.visibilityState === "visible") {
        void load();
        if (!timer) timer = setInterval(() => {
          void load();
        }, 15e3);
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [reloadKey]);
  const allOpen = grouped.length > 0 && grouped.every((g) => openSet.has(g.key));
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.root, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: DashboardView_default.header, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: DashboardView_default.title, children: [
        "\u{1F4CA} ",
        localeT("view.dashboard")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: DashboardView_default.btn, onClick: () => setReloadKey((k) => k + 1), "aria-label": "\u5237\u65B0", children: "\u21BB" }),
      grouped.length > 1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: DashboardView_default.btn, onClick: () => setAllGroups(!allOpen), "aria-label": allOpen ? localeT("group.collapseAll") : localeT("group.expandAll"), children: allOpen ? localeT("group.collapseAll") : localeT("group.expandAll") }) : null,
      editing ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: `${DashboardView_default.btn} ${DashboardView_default.btnPrimary}`, onClick: () => void saveAll(), disabled: saving, children: saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: DashboardView_default.btn, onClick: () => void toggleEdit(), disabled: saving, children: "\u53D6\u6D88" })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: DashboardView_default.btn, onClick: () => void toggleEdit(), children: "\u7F16\u8F91" })
    ] }),
    editing && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: DashboardView_default.editPanel, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.editPanelHead, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.editPanelTitle, children: "\u670D\u52A1\u63A2\u6D3B\u76EE\u6807" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: DashboardView_default.muted, children: [
          "\u6765\u6E90: ",
          probeSource === "store" ? "UI \u7F16\u8F91" : probeSource === "config" ? "\u9759\u6001\u914D\u7F6E" : "\u9ED8\u8BA4"
        ] })
      ] }),
      probeTargets && probeTargets.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: probeTargets.map((tg, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.targetRow, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.mono, children: tg.name }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `${DashboardView_default.muted} ${DashboardView_default.targetAddr}`, children: tg.url ?? `${tg.host ?? "127.0.0.1"}:${tg.port}` }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: DashboardView_default.removeBtn, onClick: () => removeTarget(i), "aria-label": `\u79FB\u9664 ${tg.name}`, children: "\u2715" })
      ] }, `${tg.name}-${i}`)) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u6682\u65E0\u63A2\u9488\u76EE\u6807\uFF08\u4FDD\u5B58\u7A7A\u5217\u8868\u5C06\u91CD\u7F6E\u4E3A\u9ED8\u8BA4\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.addForm, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { className: DashboardView_default.input, placeholder: "\u540D\u79F0", value: addName, onChange: (e) => setAddName(e.target.value) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { className: DashboardView_default.input, placeholder: "URL http://\u2026", value: addUrl, onChange: (e) => setAddUrl(e.target.value) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { className: DashboardView_default.input, placeholder: "\u7AEF\u53E3", type: "number", min: 1, max: 65535, value: addPort, onChange: (e) => setAddPort(e.target.value) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: DashboardView_default.btn, onClick: addTarget, children: "\u6DFB\u52A0" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: DashboardView_default.btn, onClick: () => void resetProbe(), disabled: saving, children: "\u91CD\u7F6E\u4E3A\u9ED8\u8BA4" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u7F16\u8F91\u6A21\u5F0F\u4E0B\u53EF\u70B9\u5361\u7247\u53F3\u4E0A\u89D2 \u2715 \u79FB\u9664 widget\uFF1B\u70B9\u300C\u4FDD\u5B58\u300D\u4E00\u5E76\u751F\u6548\u3002" })
    ] }),
    editMsg && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.hint, children: editMsg }),
    configError && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: DashboardView_default.error, children: [
      "\u26A0\uFE0F ",
      configError
    ] }),
    !configError && !widgets && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: localeT("pending") }),
    widgets && widgets.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: localeT("widgets.empty") }),
    widgets && widgets.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SummaryStrip, { widgets, t: localeT }),
      grouped.map((g) => {
        const open = editing || openSet.has(g.key);
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: DashboardView_default.group, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              type: "button",
              className: DashboardView_default.groupHead,
              "aria-expanded": open,
              onClick: () => toggleGroup(g.key),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.groupChevron, "aria-hidden": "true", children: open ? "\u25BE" : "\u25B8" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.groupTitle, children: localeT(`group.${g.key}`) }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.groupCount, children: g.items.length }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: DashboardView_default.groupHint, children: localeT(`groupHint.${g.key}`) })
              ]
            }
          ),
          open ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: DashboardView_default.grid, children: g.items.map((w) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            WidgetCard,
            {
              widget: w,
              snap: w.snap,
              t: localeT,
              editing,
              removing: removedIds.has(w.id),
              onRemove: () => toggleRemove(w.id)
            },
            w.id
          )) }) : null
        ] }, g.key);
      })
    ] })
  ] });
}

// src/client/DockEntry.tsx
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/DashboardIcon.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function DashboardIcon({ size }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { width: size, height: size, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M2 13.5h12", stroke: "currentColor", strokeWidth: "1.2", strokeLinecap: "round" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("rect", { x: "3", y: "8", width: "2.6", height: "4", rx: "0.8", stroke: "currentColor", strokeWidth: "1.2" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("rect", { x: "6.7", y: "4.5", width: "2.6", height: "7.5", rx: "0.8", stroke: "currentColor", strokeWidth: "1.2" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("rect", { x: "10.4", y: "6.5", width: "2.6", height: "5.5", rx: "0.8", stroke: "currentColor", strokeWidth: "1.2" })
  ] });
}

// src/client/DockEntry.module.css
var css2 = "/* The frame's seat lays out its controls, not this button: on the web the dock\n   stacks them in a 36px column, on macOS desktop they sit in the titleband row.\n   Metrics mirror ui-sidebar's own dock controls (28x28, 8px row rhythm) so the\n   added button does not read as a different control set. */\n._cb61c483_button {\n  flex: none;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 28px;\n  height: 28px;\n  padding: 0;\n  border: none;\n  border-radius: 6px;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  cursor: pointer;\n}\n\n._cb61c483_button:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n._cb61c483_button:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n/* Pressed = \u770B\u677F is the selected main panel. A tinted fill reads as state\n   at 28px where an outline would fight the dock's own 1px border. */\n._cb61c483_button[aria-pressed='true'] {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n";
var tagId2 = "dsh-dashboards/DockEntry.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId2) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-dashboards";
  tag.dataset.pluginCss = tagId2;
  tag.textContent = css2;
  document.head.appendChild(tag);
}
var DockEntry_default = { "button": "_cb61c483_button" };

// src/client/DockEntry.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var DASHBOARD_PANEL_ID = "dashboard";
function DashboardDockEntry({ usePanelInfo, toggleDashboard, t }) {
  const active = usePanelInfo((info) => info.activePanelId === DASHBOARD_PANEL_ID);
  const label = t("seat.openDashboard");
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.Tooltip, { label, delayMs: 500, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    "button",
    {
      type: "button",
      className: DockEntry_default.button,
      "aria-label": label,
      "aria-pressed": active,
      onClick: () => {
        toggleDashboard();
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(DashboardIcon, { size: 16 })
    }
  ) });
}

// src/client/locales.ts
var NS = "dashboard";
var zh = {
  "view.dashboard": "\u770B\u677F",
  "nav.dashboard": "\u770B\u677F",
  "seat.openDashboard": "\u770B\u677F\uFF08\u518D\u70B9\u4E00\u6B21\u56DE\u5230\u4F1A\u8BDD\uFF09",
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
  "macos.mem": "\u672C\u673A\u5185\u5B58",
  "macos.cpu": "\u672C\u673A\u8D1F\u8F7D",
  "macos.disk": "\u672C\u673A\u78C1\u76D8",
  "disk.usedOf": "\u5DF2\u7528\uFF08\u542B\u53EF\u6E05\u9664\uFF09",
  "disk.used": "\u5DF2\u7528",
  "disk.free": "\u786C\u53EF\u7528",
  "disk.purgeable": "\u53EF\u6E05\u9664",
  "disk.writable": "\u4E0D\u56DE\u6536\u4EFB\u4F55\u4E1C\u897F\u65F6\u53EF\u5199",
  "disk.snapCount": "\u4E2A\u672C\u673A TM \u5FEB\u7167",
  "disk.snapLatest": "\u6700\u8FD1",
  "disk.snapUnknown": "\u5FEB\u7167\u6765\u6E90\u672A\u77E5",
  "disk.purgeUnknown": "\u53EF\u6E05\u9664 \u2014\uFF08\u7CFB\u7EDF\u672A\u63D0\u4F9B\u8BE5\u53E3\u5F84\uFF0C\u4E0D\u6309 0 \u8BA1\uFF09",
  "disk.unavailable": "\uFF08\u78C1\u76D8\u91C7\u96C6\u672A\u5C31\u7EEA\uFF09",
  "disk.degradedProbe": "\u53E3\u5F84\u964D\u7EA7\uFF1A\u62FF\u4E0D\u5230\u7CFB\u7EDF\u53E3\u5F84\uFF0C\u4EC5 df \u786C\u53EF\u7528",
  // 宿主重启卡（2026-10-26）：host 返回的 code 有稳定词表，卡片把它翻成中文并把
  // 原文放进 title —— 既让人读懂，又不隐藏服务端到底说了什么。
  "host.turnsRunning": "\u6709 {count} \u4E2A\u4F1A\u8BDD\u5728\u8DD1\uFF1B\u91CD\u542F\u4F1A\u4E2D\u65AD\u5B83\u4EEC\uFF08\u8FD9\u4E00\u7EBF\u6CA1\u6709\u81EA\u52A8\u7EED\u8DD1\uFF09",
  "host.turnsUnknown": "\u8BFB\u4E0D\u5230\u4F1A\u8BDD\u5217\u8868\uFF0C\u65E0\u6CD5\u5224\u65AD\u6709\u6CA1\u6709\u56DE\u5408\u4F1A\u88AB\u4E2D\u65AD",
  "host.debounce": "\u521A\u8BF7\u6C42\u8FC7\u91CD\u542F\uFF1B\u5B88\u62A4\u8FDB\u7A0B\u4F1A\u5408\u5E76\u8BF7\u6C42\uFF0C{seconds} \u79D2\u540E\u53EF\u518D\u8BD5",
  "host.daemonUnhealthy": "\u5B88\u62A4\u8FDB\u7A0B\u5904\u4E8E {phase}\uFF0C\u5148\u5904\u7406\u5B83\u672C\u8EAB\u7684\u95EE\u9898\u518D\u91CD\u542F",
  "host.notLoopback": "\u53EA\u80FD\u4ECE\u672C\u673A\u53D1\u8D77\u91CD\u542F",
  "host.missingMarker": "\u7F3A\u5C11\u8BF7\u6C42\u6807\u8BB0\uFF08\u8DE8\u7AD9\u9875\u9762\u65E0\u6CD5\u4F2A\u9020\uFF09",
  "host.accepted": "\u5DF2\u53D7\u7406\uFF1A\u5B88\u62A4\u8FDB\u7A0B 3 \u79D2\u5185 TERM\uFF0C\u7EA6 20\u201345 \u79D2\u540E\u65B0\u5BBF\u4E3B\u53EF\u7528\uFF1B\u672C\u5361\u4F1A\u81EA\u52A8\u5237\u65B0",
  "host.unavailable": "\u5BBF\u4E3B\u91CD\u542F\u80FD\u529B\u4E0D\u53EF\u7528\uFF1A{reason}",
  "host.dashboardsOnly": "\u53EA\u91CD\u542F\u8FD9\u4E2A web \u5BBF\u4E3B\uFF1B\u684C\u9762\u5BBF\u4E3B\u7531\u5E94\u7528\u81EA\u8EAB\u7BA1\u7406",
  "disk.degradedMismatch": "\u53E3\u5F84\u964D\u7EA7\uFF1A\u7CFB\u7EDF\u4E0E df \u7684\u786C\u53EF\u7528\u5DEE\u5F02\u8FC7\u5927",
  "disk.degradedInverted": "\u53E3\u5F84\u964D\u7EA7\uFF1A\u53EF\u589E\u957F\u91CF\u77AC\u65F6\u4F4E\u4E8E\u786C\u53EF\u7528",
  "probe": "\u5173\u952E\u670D\u52A1\u63A2\u6D3B",
  "kuma": "\u670D\u52A1\u72B6\u6001",
  "feed.latest": "\u6700\u8FD1",
  "feed.empty": "\u6682\u65E0\u6458\u8981\uFF08feed job \u5C1A\u672A\u4EA7\u51FA\u62A5\u544A\uFF09",
  // 顶部状态条 + 分段（2026-11-19 改版）。状态词（绿/黄/红/灰）只由 lib/summary.mjs
  // 产出，这里只回答"它叫什么"，不让展示层再判一次。
  "strip.label": "\u7CFB\u7EDF\u72B6\u6001",
  "strip.host": "\u5BBF\u4E3B",
  "strip.probe": "\u670D\u52A1",
  "strip.scheduler": "\u8C03\u5EA6",
  "strip.disk": "\u78C1\u76D8",
  "strip.net": "\u7F51\u7EDC",
  "group.status": "\u2460 \u73B0\u5728\u6709\u6CA1\u6709\u4E8B",
  "groupHint.status": "\u5BBF\u4E3B / \u670D\u52A1 / \u8C03\u5EA6\u9762 / \u8BCA\u65AD / \u5F85\u4F60\u5904\u7406",
  "group.fleet": "\u2461 \u673A\u961F\u4E0E\u7F51\u7EDC",
  "groupHint.fleet": "\u8282\u70B9 / \u4EFB\u52A1 / \u51FA\u53E3\u7EBF\u8DEF / \u5907\u4EFD\u8BBE\u5907",
  "group.cost": "\u2462 \u7528\u91CF\u4E0E\u82B1\u8D39",
  "groupHint.cost": "24h \u6210\u672C / \u989D\u5EA6 / 7d \u6D88\u8017 / \u5BF9\u8D26",
  "group.local": "\u2463 \u672C\u673A\u8D44\u6E90",
  "groupHint.local": "\u8D1F\u8F7D / \u5185\u5B58 / \u78C1\u76D8",
  "group.input": "\u2464 \u8DE8\u9879\u76EE\u4E0E\u5916\u90E8\u8F93\u5165",
  "groupHint.input": "\u4F1A\u8BDD\u4E09\u6001 / \u91CD\u590D\u75DB\u70B9 / feed \u6458\u8981",
  "group.expandAll": "\u5168\u90E8\u5C55\u5F00",
  "group.collapseAll": "\u5168\u90E8\u6536\u8D77",
  "card.expandAll": "\u5C55\u5F00",
  "card.collapse": "\u6536\u8D77",
  "col.cost": "\u6210\u672C",
  "col.calls": "\u8C03\u7528",
  "col.tokens": "tokens",
  "col.cache": "\u7F13\u5B58\u547D\u4E2D",
  "col.sessions": "\u4F1A\u8BDD",
  "col.model": "\u6A21\u578B",
  "col.status": "\u72B6\u6001",
  "col.load": "\u8D1F\u8F7D",
  "col.loadCore": "\u8D1F\u8F7D/\u6838",
  "col.mem": "\u5185\u5B58",
  "col.platform": "\u5E73\u53F0",
  "col.heartbeat": "\u5FC3\u8DF3",
  "col.latency": "\u5EF6\u8FDF",
  "col.node": "\u8282\u70B9",
  "col.detail": "\u8BE6\u60C5",
  "chart.window": "\u7A97\u53E3",
  "chart.gap": "\u65AD\u6863",
  "chart.points": "\u70B9",
  "surge.col.probe": "\u63A2\u6D4B xai/grok/oai\xB7c",
  "surge.col.q": "\u9694\u79BB",
  "surge.quarantined": "\u9694\u79BB",
  "surge.isolated": "\u9694\u79BB\u4E2D",
  "surge.events": "\u6700\u8FD1\u4E8B\u4EF6",
  "surge.st.healthy": "\u5065\u5EB7",
  "surge.st.grok_403": "Grok\u62E6",
  "surge.st.xai_blocked": "xAI\u62E6",
  "surge.st.xai_banned": "\u88ABban",
  "surge.st.dead": "\u6B7B\u4EA1",
  "surge.st.xai_partial": "\u90E8\u5206",
  "surge.evt.quarantine": "\u9694\u79BB",
  "surge.evt.quarantine_recover": "\u89E3\u9694\u79BB",
  "surge.evt.quarantine_extend": "\u7EED\u9694\u79BB",
  "surge.evt.config_applied": "\u914D\u7F6E\u5DF2\u5E94\u7528",
  // PackyCode 出口可达性（type 'packy'）
  "packy.updated": "\u63A2\u6D4B\u4E8E",
  "packy.fresh": "\u7ED3\u679C\u65B0\u9C9C",
  "packy.stale": "\u7ED3\u679C\u5DF2\u8FC7\u671F",
  "packy.probeKind.unauthenticated": "\u4EC5\u7F51\u7EDC\u53EF\u8FBE\uFF08\u672A\u8BA4\u8BC1\u63A2\u9488\uFF09",
  "packy.probeKind.authenticated": "\u4E1A\u52A1\u7EA7\uFF08\u5DF2\u8BA4\u8BC1\uFF09",
  "packy.probeKind.unknown": "\u63A2\u9488\u5F3A\u5EA6\u672A\u77E5",
  "packy.col.policy": "\u51FA\u53E3",
  "packy.col.verdict": "\u5224\u5B9A",
  "packy.col.samples": "\u6837\u672C(\u72B6\u6001\u7801)",
  "packy.col.latency": "\u4E2D\u4F4D\u5EF6\u8FDF",
  "packy.verdict.ok": "\u53EF\u8FBE",
  "packy.verdict.blocked": "\u88AB\u62E6(403)",
  "packy.verdict.unauthorized": "\u51ED\u636E\u88AB\u62D2(401)",
  "packy.verdict.dead": "\u4E0D\u53EF\u8FBE",
  "packy.verdict.flaky": "\u4E0D\u7A33\u5B9A",
  "packy.standby": "\u5907\u7528",
  "packy.keySource": "\u51ED\u636E\u6765\u6E90",
  "packy.empty": "\u6682\u65E0\u63A2\u6D4B\u7ED3\u679C\uFF08\u5148\u8FD0\u884C surge-auto scripts/packy-probe.py\uFF09",
  "packy.url": "\u63A2\u6D4B\u76EE\u6807"
};
var en = {
  "view.dashboard": "Dashboards",
  "nav.dashboard": "Dashboards",
  "seat.openDashboard": "Dashboard (click again to return to the conversation)",
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
  "macos.mem": "Local memory",
  "macos.cpu": "Local load",
  "macos.disk": "Local disk",
  "disk.usedOf": "used (incl. purgeable)",
  "disk.used": "Used",
  "disk.free": "Hard free",
  "disk.purgeable": "Purgeable",
  "disk.writable": "Writable without reclaiming",
  "disk.snapCount": "local TM snapshots",
  "disk.snapLatest": "latest",
  "disk.snapUnknown": "snapshot source unknown",
  "disk.purgeUnknown": "purgeable \u2014 (not provided by the system; never counted as 0)",
  "disk.unavailable": "(disk probe not ready)",
  "disk.degradedProbe": "Degraded: system figure unavailable, df hard free only",
  "host.turnsRunning": "{count} session(s) running; a restart cuts them (this line has no automatic turn resume)",
  "host.turnsUnknown": "The session list is unreadable, so it cannot be told whether a turn would be cut",
  "host.debounce": "A restart was just requested; the supervisor merges requests, retry in {seconds}s",
  "host.daemonUnhealthy": "The supervisor is in phase {phase}; fix that before restarting",
  "host.notLoopback": "A restart may only be requested from this machine",
  "host.missingMarker": "Missing request marker (a cross-site page cannot forge it)",
  "host.accepted": "Accepted: the supervisor TERMs within 3s and the new host is up in ~20-45s; this card refreshes itself",
  "host.unavailable": "Host restart unavailable: {reason}",
  "host.dashboardsOnly": "Restarts this web host only; the desktop host is managed by the app",
  "disk.degradedMismatch": "Degraded: system vs df hard free disagree",
  "disk.degradedInverted": "Degraded: growable figure momentarily below hard free",
  "probe": "Service probes",
  "kuma": "Service status",
  "feed.latest": "Latest",
  "feed.empty": "No digests yet (feed job has not produced reports)",
  // Status strip + sections (2026-11-19). The state words (green/yellow/red/grey)
  // come from lib/summary.mjs only; this dictionary only names them.
  "strip.label": "System status",
  "strip.host": "Host",
  "strip.probe": "Services",
  "strip.scheduler": "Schedules",
  "strip.disk": "Disk",
  "strip.net": "Network",
  "group.status": "\u2460 Anything wrong?",
  "groupHint.status": "host / services / schedules / diagnostics / needs-you",
  "group.fleet": "\u2461 Fleet & network",
  "groupHint.fleet": "nodes / tasks / egress / backup device",
  "group.cost": "\u2462 Usage & spend",
  "groupHint.cost": "24h cost / quota / 7d usage / reconcile",
  "group.local": "\u2463 This machine",
  "groupHint.local": "load / memory / disk",
  "group.input": "\u2464 Cross-project & input",
  "groupHint.input": "sessions / repeated pain / feed digests",
  "group.expandAll": "Expand all",
  "group.collapseAll": "Collapse all",
  "card.expandAll": "Expand",
  "card.collapse": "Collapse",
  "col.cost": "Cost",
  "col.calls": "Calls",
  "col.tokens": "Tokens",
  "col.cache": "Cache hit",
  "col.sessions": "Sessions",
  "col.model": "Model",
  "col.status": "Status",
  "col.load": "Load",
  "col.loadCore": "Load/core",
  "col.mem": "Memory",
  "col.platform": "Platform",
  "col.heartbeat": "Heartbeat",
  "col.latency": "Latency",
  "col.node": "Node",
  "col.detail": "Detail",
  "chart.window": "window",
  "chart.gap": "gaps",
  "chart.points": "pts",
  "surge.col.probe": "Probe xai/grok/oai\xB7c",
  "surge.col.q": "Quarantine",
  "surge.quarantined": "Quarantine",
  "surge.isolated": "isolated",
  "surge.events": "Recent events",
  "surge.st.healthy": "healthy",
  "surge.st.grok_403": "grok 403",
  "surge.st.xai_blocked": "xAI blocked",
  "surge.st.xai_banned": "banned",
  "surge.st.dead": "dead",
  "surge.st.xai_partial": "partial",
  "surge.evt.quarantine": "quarantine",
  "surge.evt.quarantine_recover": "recovered",
  "surge.evt.quarantine_extend": "extended",
  "surge.evt.config_applied": "config applied",
  // PackyCode egress reachability (type 'packy')
  "packy.updated": "Probed",
  "packy.fresh": "fresh",
  "packy.stale": "stale",
  "packy.probeKind.unauthenticated": "Network reachability only (unauthenticated probe)",
  "packy.probeKind.authenticated": "Business-level (authenticated)",
  "packy.probeKind.unknown": "Probe strength unknown",
  "packy.col.policy": "Egress",
  "packy.col.verdict": "Verdict",
  "packy.col.samples": "Samples (status)",
  "packy.col.latency": "Median",
  "packy.verdict.ok": "reachable",
  "packy.verdict.blocked": "blocked (403)",
  "packy.verdict.unauthorized": "credential refused (401)",
  "packy.verdict.dead": "unreachable",
  "packy.verdict.flaky": "flaky",
  "packy.standby": "standby",
  "packy.keySource": "Credential source",
  "packy.empty": "No probe yet (run surge-auto scripts/packy-probe.py)",
  "packy.url": "Probe target"
};

// src/client/index.ts
var inject = ["slots", "layout", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-dashboards: dictionaries");
  const t = ctx.locale.bind(NS);
  ctx.slots.inject("main", () => ctx.slots.register({
    name: "main",
    key: DASHBOARD_PANEL_ID,
    locale: NS
  }, (props) => DashboardView({ ...props, t })));
  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
    name: "sidebar.panellist",
    id: DASHBOARD_PANEL_ID,
    // 排在画布之后：画布是"工作台"，看板是"看状态"，先工作后看状态。
    order: 5,
    locale: NS,
    label: () => t("nav.dashboard")
  }, DashboardIcon));
  ctx.slots.inject("shell.leading.actions", () => ctx.slots.register({
    name: "shell.leading.actions",
    id: "dashboards",
    order: 240,
    locale: NS,
    inject: () => ({
      toggleDashboard: () => {
        if (!ctx.slots.entries("main").some((entry) => entry.options.key === DASHBOARD_PANEL_ID)) return;
        const active = ctx.layout.panelInfo.getSnapshot().activePanelId;
        ctx.layout.selectPanel(active === DASHBOARD_PANEL_ID ? null : DASHBOARD_PANEL_ID);
      }
    })
  }, DashboardDockEntry));
}
return module.exports; } });
