// record_necropoli/necropoli/schede_compute.js

export function indexContextsBySite(contestiFeatures) {
  const m = new Map();
  for (const c of (contestiFeatures || [])) {
    const pid = Number(c?.properties?.parent_id);
    if (!Number.isFinite(pid)) continue;
    if (!m.has(pid)) m.set(pid, []);
    m.get(pid).push(c);
  }
  return m;
}

export function computeSiteCards({ sitiFeatures, contextsBySite, siteFilter, contextFilter, requireAtLeastOneContext = true }) {
  const out = [];
  for (const s of (sitiFeatures || [])) {
    if (siteFilter && !siteFilter(s)) continue;

    const fid = Number(s?.properties?.fid);
    const ctxAll = (Number.isFinite(fid) ? (contextsBySite.get(fid) || []) : []);
    const ctxOk = contextFilter ? ctxAll.filter(contextFilter) : ctxAll;

    if (requireAtLeastOneContext && ctxOk.length === 0) continue;

    out.push({
      site: s,
      contexts: ctxOk,
      contextsCount: ctxOk.length
    });
  }
  return out;
}
