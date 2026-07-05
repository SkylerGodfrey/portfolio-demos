/* global window, module */
/*
 * Date-driven holiday state engine (HOM-124).
 *
 * Pure: takes a date + holiday list, returns the active state name.
 * First holiday window whose [start, end] MM-DD range contains the date
 * wins. End is inclusive. Returns "default" when nothing matches.
 *
 * Exposed both as a browser global (window.MascotStateEngine) and a
 * Node export so vendor/state-engine.test.js can exercise boundary
 * dates without a browser harness.
 */
(function (root, factory) {
  const engine = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = engine;
  } else {
    root.MascotStateEngine = engine;
  }
})(typeof window !== "undefined" ? window : this, function () {
  function formatMMDD(date) {
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${m}-${d}`;
  }

  function computeState(date, holidays) {
    const mmdd = formatMMDD(date);
    for (const h of holidays || []) {
      if (h && h.start && h.end && mmdd >= h.start && mmdd <= h.end) {
        return h.state;
      }
    }
    return "default";
  }

  return { computeState, formatMMDD };
});
