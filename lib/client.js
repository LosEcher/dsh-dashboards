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
var css = "/* dsh-dashboards \u2014 \u770B\u677F tab \u6837\u5F0F\u3002\u53EA\u4F7F\u7528 --dsw-alias-* \u767D\u540D\u5355\u4EE4\u724C\uFF0C\u968F\u6D45/\u6DF1\u4E3B\u9898\u3002 */\n\n._f4e51a2a_root {\n  padding: 4px 2px 24px;\n  /* \u770B\u677F\u7528\u6EE1\u4F1A\u8BDD\u533A\u5BBD\u5EA6\uFF08\u5217\u6570\u7531 column-width \u81EA\u9002\u5E94\uFF0C\u5BBD\u5C4F\u66F4\u591A\u5217\uFF09 */\n  max-width: none;\n}\n\n._dba031a0_header {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 8px;\n  margin-bottom: 10px;\n}\n\n._7c3c945b_title {\n  margin: 0;\n  font-size: 14px;\n  font-weight: 700;\n  color: var(--dsw-alias-label-primary);\n}\n\n._826898bd_btn {\n  padding: 2px 10px;\n  border-radius: 6px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-label-primary);\n  font-size: 12px;\n  cursor: pointer;\n}\n\n._826898bd_btn:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n._826898bd_btn:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n/* \u7011\u5E03\u6D41\uFF1ACSS \u591A\u5217\uFF08column-width \u81EA\u52A8\u5217\u6570\uFF09\u3002\u539F\u751F grid masonry \u4EC5 Firefox\n   \u652F\u6301\u3001Chrome/WebKit \u672A\u843D\u5730\uFF082026\uFF09\uFF0C\u591A\u5217\u662F\u552F\u4E00\u5168\u6D4F\u89C8\u5668\u7EAF CSS \u65B9\u6848\uFF0C\n   \u4E14\u5BF9\u5B9E\u65F6\u5237\u65B0\u53CB\u597D\uFF08\u65E0 JS \u91CD\u6392\u3001\u5361\u7247\u9AD8\u5EA6\u53D8\u5316\u4E0D\u6296\u52A8\uFF09\u3002 */\n._5f1aa483_grid {\n  column-width: 320px;\n  column-gap: 10px;\n}\n\n._30b37a89_card {\n  background: var(--dsw-alias-bg-layer-1);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 10px;\n  padding: 8px 12px 10px;\n  min-width: 0;\n  /* \u5185\u5BB9\uFF08\u5BBD\u8868\u683C\uFF09\u6C38\u4E0D\u6EA2\u51FA\u5230\u76F8\u90BB\u5361\u7247\u2014\u2014\u91CD\u53E0\u6839\u56E0\u4FEE\u590D */\n  overflow: hidden;\n  /* \u7011\u5E03\u6D41\uFF1A\u5361\u7247\u4E0D\u8DE8\u5217\u62C6\u65AD\uFF1B\u5217\u5185\u5782\u76F4\u95F4\u8DDD\u7528 margin \u66FF\u4EE3 gap */\n  break-inside: avoid;\n  margin-bottom: 10px;\n}\n\n._7e558f24_cardHeader {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin-bottom: 6px;\n}\n\n._42afaeaa_cardTitle {\n  margin: 0;\n  font-size: 12px;\n  font-weight: 700;\n  color: var(--dsw-alias-label-primary);\n}\n\n._fe5af9b9_cardMeta {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n}\n\n._4b6db334_cardBody {\n  font-size: 12px;\n  line-height: 1.7;\n  color: var(--dsw-alias-label-primary);\n  /* \u5BBD\u8868\u683C\u5728\u5361\u5185\u6A2A\u5411\u6EDA\u52A8\uFF0C\u4E0D\u6491\u7834\u5361\u7247 */\n  overflow-x: auto;\n}\n\n._19ab98ed_muted {\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n._ad64cb4a_error {\n  font-size: 12px;\n  color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 55%, var(--dsw-alias-label-primary));\n  margin: 4px 0;\n}\n\n._55d3b6b5_pillRow {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin-bottom: 8px;\n}\n\n._9a297014_pill {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  padding: 1px 8px;\n  border-radius: 999px;\n  font-size: 11px;\n  font-weight: 600;\n  color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 55%, var(--dsw-alias-label-primary));\n  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, var(--dsw-alias-bg-layer-1));\n  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-success-secondary) 55%, transparent);\n}\n\n._2811ee31_pillDim {\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-bg-layer-2);\n  border-color: var(--dsw-alias-border-l2);\n}\n\n._ff551aa2_pillWarn {\n  color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 55%, var(--dsw-alias-label-primary));\n  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, var(--dsw-alias-bg-layer-1));\n  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-secondary) 55%, transparent);\n}\n\n/* AI \u989D\u5EA6\u533A\u5757\uFF08ZenMux + Packy \u53CC\u5217\uFF09 */\n._c25b5a8e_quotaGrid {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 8px;\n}\n\n._19a039f9_quotaBlock {\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 8px;\n  padding: 6px 8px;\n  background: var(--dsw-alias-bg-layer-1);\n}\n\n._19a039f9_quotaBlock ._42afaeaa_cardTitle {\n  margin: 0 0 4px;\n  font-size: 12px;\n}\n\n._e057c58f_quotaWindow {\n  margin-top: 4px;\n}\n\n._f6afa805_barTrack {\n  height: 4px;\n  border-radius: 2px;\n  background: var(--dsw-alias-bg-layer-2);\n  overflow: hidden;\n  margin-top: 2px;\n}\n\n._92e18ed1_barFill {\n  height: 100%;\n  border-radius: 2px;\n  transition: width 0.4s ease;\n}\n\n._3c199396_barOk {\n  background: var(--dsw-alias-state-success-primary);\n}\n\n._68d9f10a_barWarn {\n  background: var(--dsw-alias-state-warn-primary);\n}\n\n._fa51c71f_barDanger {\n  background: var(--dsw-alias-state-danger-primary);\n}\n\n._1b2088ec_table {\n  width: 100%;\n  border-collapse: collapse;\n  font-size: 12px;\n}\n\n._1b2088ec_table th {\n  text-align: left;\n  font-weight: 600;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n  padding: 3px 6px;\n  border-bottom: 1px solid var(--dsw-alias-border-l2);\n}\n\n._1b2088ec_table td {\n  padding: 3px 6px;\n  color: var(--dsw-alias-label-primary);\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n  white-space: nowrap;\n}\n\n/* \u6587\u672C\u5217\uFF08\u8282\u70B9\u540D+hostLabel \u7B49\uFF09\u5141\u8BB8\u6362\u884C\uFF0C\u907F\u514D nowrap \u6491\u7206\u5361\u7247 */\n._1b2088ec_table td._db2f2158_wrap {\n  white-space: normal;\n}\n\n._0e262682_hostSub {\n  display: block;\n  font-size: 10px;\n  line-height: 1.4;\n}\n\n._1b2088ec_table td._31641685_num {\n  font-variant-numeric: tabular-nums;\n  text-align: right;\n}\n\n._ccc9330e_mono {\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  font-size: 11px;\n}\n\n._ab0deb24_rowDot {\n  display: inline-flex;\n  vertical-align: -1px;\n  margin-right: 5px;\n}\n\n._77795f2d_okText { color: var(--dsw-alias-state-success-primary); }\n._33153ae1_errText { color: var(--dsw-alias-state-error-primary); }\n._744ac21e_warnText { color: var(--dsw-alias-state-warn-primary); }\n\n._1d92c04b_legend {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 10px;\n  margin-top: 4px;\n  font-size: 11px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n._cb49b581_legendItem {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n}\n\n._c4a2b54b_legendDot {\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  display: inline-block;\n}\n\n/* feed \u91C7\u96C6\u6458\u8981\u5361\u7247\uFF1A\u62A5\u544A\u6761\u76EE\u5217\u8868\uFF08\u70B9\u51FB\u5C55\u5F00\u6B63\u6587\uFF09\u3002 */\n._4360df81_feedItem {\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 8px;\n  margin-bottom: 6px;\n  overflow: hidden;\n}\n\n._44396078_feedToggle {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 8px;\n  width: 100%;\n  padding: 6px 10px;\n  background: var(--dsw-alias-bg-layer-2);\n  border: none;\n  cursor: pointer;\n  font: inherit;\n  text-align: left;\n}\n\n._44396078_feedToggle:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n._44396078_feedToggle:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: -1px;\n}\n\n._ce1be636_feedTitle {\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n._04fd4908_feedTime {\n  flex-shrink: 0;\n  font-size: 10px;\n  color: var(--dsw-alias-label-tertiary);\n  font-variant-numeric: tabular-nums;\n}\n\n._7d260a09_feedBody {\n  margin: 0;\n  padding: 8px 10px;\n  font-size: 12px;\n  line-height: 1.6;\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-bg-layer-1);\n  word-break: break-word;\n  max-height: 320px;\n  overflow-y: auto;\n}\n\n/* Feed \u6B63\u6587\u91CC\u7684 Markdown \u5143\u7D20\uFF1A\u7F29\u5C0F\u6807\u9898/\u4EE3\u7801\u5757\uFF0C\u4FDD\u6301\u7D27\u51D1\u770B\u677F\u5361\u7247\u98CE\u683C */\n._7d260a09_feedBody :global(h1),\n._7d260a09_feedBody :global(h2),\n._7d260a09_feedBody :global(h3) {\n  font-size: 13px;\n  margin: 8px 0 4px;\n  color: var(--dsw-alias-label-primary);\n}\n._7d260a09_feedBody :global(h4),\n._7d260a09_feedBody :global(h5),\n._7d260a09_feedBody :global(h6) {\n  font-size: 12px;\n  margin: 6px 0 3px;\n  color: var(--dsw-alias-label-primary);\n}\n._7d260a09_feedBody :global(p) {\n  margin: 4px 0;\n}\n._7d260a09_feedBody :global(ul),\n._7d260a09_feedBody :global(ol) {\n  margin: 4px 0;\n  padding-left: 18px;\n}\n._7d260a09_feedBody :global(pre) {\n  margin: 6px 0;\n  padding: 6px 8px;\n  font-size: 11px;\n  overflow-x: auto;\n}\n._7d260a09_feedBody :global(code) {\n  font-size: 11px;\n}\n._7d260a09_feedBody :global(table) {\n  margin: 6px 0;\n  font-size: 11px;\n}\n\n/* \u2500\u2500 \u7F16\u8F91\u6A21\u5F0F \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n._1a38ce38_btnPrimary {\n  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, var(--dsw-alias-bg-layer-2));\n  border-color: var(--dsw-alias-brand-primary);\n  font-weight: 600;\n}\n\n._1a38ce38_btnPrimary:disabled {\n  opacity: 0.6;\n  cursor: default;\n}\n\n._57c82ab6_editPanel {\n  border: 1px dashed var(--dsw-alias-border-l3);\n  border-radius: 10px;\n  padding: 10px 12px;\n  margin-bottom: 12px;\n  background: var(--dsw-alias-bg-layer-2);\n}\n\n._54178179_editPanelHead {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin-bottom: 8px;\n}\n\n._317022ea_editPanelTitle {\n  font-size: 12px;\n  font-weight: 700;\n  color: var(--dsw-alias-label-primary);\n}\n\n._b5d938ab_targetRow {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 3px 0;\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n}\n\n._54a98147_targetAddr {\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n._ee1914a4_removeBtn {\n  flex-shrink: 0;\n  width: 22px;\n  height: 22px;\n  border-radius: 6px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-bg-layer-3);\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  line-height: 1;\n  cursor: pointer;\n}\n\n._ee1914a4_removeBtn:hover {\n  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, var(--dsw-alias-bg-layer-3));\n  color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 60%, var(--dsw-alias-label-primary));\n}\n\n._ee1914a4_removeBtn:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n._32037663_addForm {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin: 8px 0 6px;\n}\n\n._3d06ceb5_input {\n  box-sizing: border-box;\n  height: 30px;\n  min-width: 0;\n  flex: 1 1 130px;\n  padding: 0 10px;\n  border-radius: 8px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  font-size: 12px;\n  font-family: inherit;\n}\n\n._3d06ceb5_input::placeholder {\n  color: var(--dsw-alias-label-dimmed);\n}\n\n._3d06ceb5_input:focus {\n  outline: none;\n  border-color: var(--dsw-alias-brand-primary);\n  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent);\n}\n\n._9cfadb90_hint {\n  font-size: 12px;\n  color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 60%, var(--dsw-alias-label-primary));\n  margin: 4px 0 8px;\n}\n\n._2bde7efb_cardRemoving {\n  opacity: 0.45;\n  border-style: dashed;\n}\n\n/* Surge \u8282\u70B9\u4FE1\u8A89\uFF1A\u6700\u8FD1\u4E8B\u4EF6\u5217\u8868 */\n._17c7c7b2_eventList {\n  margin-top: 10px;\n  border-top: 1px solid var(--dsw-alias-border-l2);\n  padding-top: 8px;\n}\n\n._17c7c7b2_eventList > p {\n  margin: 0 0 4px;\n  font-size: 12px;\n}\n\n._0ba2ada3_eventRow {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 12px;\n  line-height: 1.6;\n}\n\n._0ba2ada3_eventRow ._ccc9330e_mono {\n  font-size: 11px;\n}\n\n/* \u2500\u2500 DSH \u6D88\u8017\uFF08P5\uFF1Ausage widget\uFF09 \u2500\u2500 */\n._f4602c13_usageTable {\n  width: 100%;\n  margin-top: 8px;\n  border-collapse: collapse;\n  font-size: 11px;\n}\n\n._f4602c13_usageTable th {\n  padding: 4px 6px;\n  border-bottom: 1px solid var(--dsw-alias-border-l2);\n  color: var(--dsw-alias-text-secondary);\n  text-align: left;\n  font-size: 10px;\n  font-weight: 600;\n}\n\n._f4602c13_usageTable td {\n  padding: 3px 6px;\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n  white-space: nowrap;\n}\n\n._f4602c13_usageTable code {\n  font-size: 10px;\n}\n\n._9661b6d0_dayStrip {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin-top: 10px;\n}\n\n._8990f7a2_dayCell {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  padding: 5px 8px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 6px;\n  font-size: 10px;\n}\n\n._8990f7a2_dayCell span:first-child {\n  color: var(--dsw-alias-text-secondary);\n}\n";
var tagId = "dsh-dashboards/DashboardView.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-dashboards";
  tag.dataset.pluginCss = tagId;
  tag.textContent = css;
  document.head.appendChild(tag);
}
var DashboardView_default = { "editPanelTitle": "_317022ea_editPanelTitle", "editPanelHead": "_54178179_editPanelHead", "cardRemoving": "_2bde7efb_cardRemoving", "quotaWindow": "_e057c58f_quotaWindow", "cardHeader": "_7e558f24_cardHeader", "quotaBlock": "_19a039f9_quotaBlock", "legendItem": "_cb49b581_legendItem", "feedToggle": "_44396078_feedToggle", "btnPrimary": "_1a38ce38_btnPrimary", "targetAddr": "_54a98147_targetAddr", "usageTable": "_f4602c13_usageTable", "cardTitle": "_42afaeaa_cardTitle", "quotaGrid": "_c25b5a8e_quotaGrid", "barDanger": "_fa51c71f_barDanger", "legendDot": "_c4a2b54b_legendDot", "feedTitle": "_ce1be636_feedTitle", "editPanel": "_57c82ab6_editPanel", "targetRow": "_b5d938ab_targetRow", "removeBtn": "_ee1914a4_removeBtn", "eventList": "_17c7c7b2_eventList", "cardMeta": "_fe5af9b9_cardMeta", "cardBody": "_4b6db334_cardBody", "pillWarn": "_ff551aa2_pillWarn", "barTrack": "_f6afa805_barTrack", "warnText": "_744ac21e_warnText", "feedItem": "_4360df81_feedItem", "feedTime": "_04fd4908_feedTime", "feedBody": "_7d260a09_feedBody", "eventRow": "_0ba2ada3_eventRow", "dayStrip": "_9661b6d0_dayStrip", "pillRow": "_55d3b6b5_pillRow", "pillDim": "_2811ee31_pillDim", "barFill": "_92e18ed1_barFill", "barWarn": "_68d9f10a_barWarn", "hostSub": "_0e262682_hostSub", "errText": "_33153ae1_errText", "addForm": "_32037663_addForm", "dayCell": "_8990f7a2_dayCell", "header": "_dba031a0_header", "rowDot": "_ab0deb24_rowDot", "okText": "_77795f2d_okText", "legend": "_1d92c04b_legend", "title": "_7c3c945b_title", "muted": "_19ab98ed_muted", "error": "_ad64cb4a_error", "barOk": "_3c199396_barOk", "table": "_1b2088ec_table", "input": "_3d06ceb5_input", "root": "_f4e51a2a_root", "grid": "_5f1aa483_grid", "card": "_30b37a89_card", "pill": "_9a297014_pill", "wrap": "_db2f2158_wrap", "mono": "_ccc9330e_mono", "hint": "_9cfadb90_hint", "btn": "_826898bd_btn", "num": "_31641685_num" };

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
function QuotaCard({ data }) {
  if (data == null || typeof data !== "object") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u2014" });
  }
  const d = data;
  const z = d.zenmux;
  const p = d.packy;
  const errs = (d.errors ?? []).filter(Boolean);
  const lowZen = z?.paygBalanceUsd != null && z.paygBalanceUsd < 1;
  const lowPacky = p?.remainingUsd != null && p.remainingUsd < 1;
  const barClass = (pct2) => pct2 == null ? DashboardView_default.barOk : pct2 >= 80 ? DashboardView_default.barDanger : pct2 >= 50 ? DashboardView_default.barWarn : DashboardView_default.barOk;
  const windowChip = (label, q) => {
    if (!q) return null;
    const pct2 = q.usedPercent ?? (q.max ? Math.round((q.used ?? 0) / q.max * 100) : 0);
    const reset = q.resetsAt ? ` \xB7 ${new Date(q.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}\u91CD\u7F6E` : "";
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.quotaWindow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.pillRow, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
          label,
          " ",
          q.used ?? 0,
          "/",
          q.max ?? 0
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
          pct2,
          "%",
          reset
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: DashboardView_default.barTrack, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `${DashboardView_default.barFill} ${barClass(pct2)}`, style: { width: `${Math.min(100, pct2)}%` } }) })
    ] });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.quotaGrid, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.quotaBlock, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.cardTitle, children: "ZenMux" }),
      z ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.pillRow, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${lowZen ? DashboardView_default.pillWarn : ""}`, children: [
            "PAYG ",
            fmtUsd(z.paygBalanceUsd)
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
            "\u8BA2\u9605 ",
            z.plan ?? "\u2014",
            z.accountStatus === "healthy" ? "" : ` (${z.accountStatus ?? "?"})`
          ] })
        ] }),
        windowChip("5h", z.quotas?.h5),
        windowChip("7d", z.quotas?.d7),
        windowChip("\u6708", z.quotas?.month)
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u672A\u914D\u7F6E" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.quotaBlock, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.cardTitle, children: "Packy" }),
      p ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.pillRow, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${lowPacky ? DashboardView_default.pillWarn : ""}`, children: [
            "\u5269\u4F59 ",
            fmtUsd(p.remainingUsd)
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
            "\u5DF2\u7528 ",
            fmtUsd(p.usedUsd)
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
            "\u5206\u7EC4 ",
            p.group ?? "\u2014"
          ] })
        ] }),
        p.requestCount != null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: DashboardView_default.pillRow, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillDim}`, children: [
          "\u7D2F\u8BA1\u8BF7\u6C42 ",
          p.requestCount.toLocaleString()
        ] }) })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: "\u672A\u914D\u7F6E" })
    ] }),
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
      t.costUnknownCount ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: `${DashboardView_default.pill} ${DashboardView_default.pillWarn}`, children: [
        "\u672A\u8BA1\u4EF7 ",
        t.costUnknownCount
      ] }) : null
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
function NodeMatrix({ data, t }) {
  const rows = data ?? [];
  if (!rows.length) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: t("noData") });
  const dot = (s) => s === "online" ? "done" : s === "offline" ? "error" : "warning";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: DashboardView_default.table, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("col.node") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("col.status") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: DashboardView_default.num, children: t("col.loadCore") }),
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
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: DashboardView_default.num, children: n.capacity?.cpuLoad1m != null ? `${(n.capacity.cpuLoad1m / Math.max(n.capacity?.cpuCores ?? 1, 1)).toFixed(2)}${n.capacity?.cpuCores ? `/${n.capacity.cpuCores}c` : ""}` : "\u2014" }),
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
var fmtAgo = (iso) => {
  if (!iso) return "\u2014";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "\u2014";
  const s = Math.floor(diff / 1e3);
  if (s < 60) return `${s}s \u524D`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
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
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: DashboardView_default.num, children: r.latencyMs != null ? `${r.latencyMs}ms` : "\u2014" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: DashboardView_default.muted, children: r.detail ?? "\u2014" })
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
function WidgetCard({ widget, snap, t, editing, removing, onRemove }) {
  const d = snap?.data;
  const hasError = !!(snap?.error || d?.error);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: `${DashboardView_default.card} ${removing ? DashboardView_default.cardRemoving : ""}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: DashboardView_default.cardHeader, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.cardTitle, children: widget.title }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: DashboardView_default.cardMeta, children: [
        snap?.ts ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: DashboardView_default.muted, children: [
          t("updated"),
          " ",
          new Date(snap.ts).toLocaleTimeString()
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
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: DashboardView_default.cardBody, children: hasError ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: DashboardView_default.error, children: [
      "\u26A0\uFE0F ",
      snap?.error || d.error
    ] }) : widget.type === "stat" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, { data: d, t }) : widget.type === "matrix" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NodeMatrix, { data: d, t }) : widget.type === "chart" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TrendChart, { data: d, t }) : widget.type === "list" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ListCard, { data: d }) : widget.type === "surge" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SurgeNodeTable, { data: d, t }) : widget.type === "feed" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FeedCard, { data: d, t }) : widget.type === "quota" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(QuotaCard, { data: d }) : widget.type === "usage" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UsageCard, { data: d }) : widget.type === "reconcile" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReconcileCard, { data: d }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: DashboardView_default.muted, children: t("noData") }) })
  ] });
}
function DashboardView(props) {
  const { t } = props;
  const localeT = (k) => t ? t(k) : k;
  const [widgets, setWidgets] = (0, import_react.useState)(null);
  const [configError, setConfigError] = (0, import_react.useState)(null);
  const [reloadKey, setReloadKey] = (0, import_react.useState)(0);
  const [editing, setEditing] = (0, import_react.useState)(false);
  const [removedIds, setRemovedIds] = (0, import_react.useState)(/* @__PURE__ */ new Set());
  const [probeTargets, setProbeTargets] = (0, import_react.useState)(null);
  const [probeSource, setProbeSource] = (0, import_react.useState)("default");
  const [probeDirty, setProbeDirty] = (0, import_react.useState)(false);
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
      const res = await fetch("/dashboards/probe-targets", { signal: AbortSignal.timeout(8e3) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setProbeTargets(d.targets ?? []);
      setProbeSource(d.source ?? "default");
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
        body: JSON.stringify({ targets: [] }),
        signal: AbortSignal.timeout(8e3)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setProbeTargets(d.targets ?? []);
      setProbeSource("default");
      setProbeDirty(false);
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
          body: JSON.stringify({ widgets: remaining }),
          signal: AbortSignal.timeout(8e3)
        });
        if (!res.ok) throw new Error(`widgets HTTP ${res.status}`);
      }
      if (probeDirty && probeTargets) {
        const res = await fetch("/dashboards/probe-targets", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targets: probeTargets }),
          signal: AbortSignal.timeout(8e3)
        });
        if (!res.ok) throw new Error(`probe-targets HTTP ${res.status}`);
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
        const res = await fetch("/dashboards/snapshot", { signal: AbortSignal.timeout(1e4) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        if (alive) {
          setWidgets(d.widgets ?? []);
          setConfigError(null);
        }
      } catch (e) {
        if (alive) setConfigError(String(e));
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: DashboardView_default.root, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: DashboardView_default.header, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: DashboardView_default.title, children: [
        "\u{1F4CA} ",
        localeT("view.dashboard")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: DashboardView_default.btn, onClick: () => setReloadKey((k) => k + 1), "aria-label": "\u5237\u65B0", children: "\u21BB" }),
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
    widgets && widgets.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: DashboardView_default.grid, children: widgets.map((w) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
    )) })
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
  "macos.mem": "\u672C\u673A\u5185\u5B58",
  "macos.cpu": "\u672C\u673A\u8D1F\u8F7D",
  "probe": "\u5173\u952E\u670D\u52A1\u63A2\u6D3B",
  "kuma": "\u670D\u52A1\u72B6\u6001",
  "feed.latest": "\u6700\u8FD1",
  "feed.empty": "\u6682\u65E0\u6458\u8981\uFF08feed job \u5C1A\u672A\u4EA7\u51FA\u62A5\u544A\uFF09",
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
  "surge.evt.config_applied": "\u914D\u7F6E\u5DF2\u5E94\u7528"
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
  "macos.mem": "Local memory",
  "macos.cpu": "Local load",
  "probe": "Service probes",
  "kuma": "Service status",
  "feed.latest": "Latest",
  "feed.empty": "No digests yet (feed job has not produced reports)",
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
  "surge.evt.config_applied": "config applied"
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
