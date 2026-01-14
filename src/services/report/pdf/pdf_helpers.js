function pct(part, total) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function asNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function normalizeDayKey(v) {
  if (!v) return null;

  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
        d.getDate()
      )}`;
    }
    return null;
  }

  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateParam(v, { endOfDay = false } = {}) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;

  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);

  return d;
}

function buildLastNDaysSeries(byDay, { days = 30, to } = {}) {
  const end = parseDateParam(to, { endOfDay: true }) ?? new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const map = new Map();
  for (const x of Array.isArray(byDay) ? byDay : []) {
    const k = normalizeDayKey(x?.day);
    if (!k) continue;
    map.set(k, asNum(map.get(k), 0) + asNum(x?.count, 0));
  }

  const out = [];
  const cur = new Date(start);
  while (cur <= end) {
    const k = normalizeDayKey(cur);
    out.push({ day: k, count: asNum(map.get(k), 0) });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

module.exports = {
  pct,
  asNum,
  pad2,
  normalizeDayKey,
  parseDateParam,
  buildLastNDaysSeries,
};
