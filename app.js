/* =====================================================================
 * Salon Bel Air Foot — U16 D2 2026/27 — app.js
 * Classement + calendrier, sans dépendance 3D.
 * ===================================================================== */

const CONF = {
  dataUrl: './data/u16-d2-2026-2027.json',
  equipeUrl: './equipe.html',
};

function el(id) { return document.getElementById(id); }
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function dateLongue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function dateCourte(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

/* ---------- Classement ---------- */
function buildTable(d) {
  const rows = (d.classement || []).slice().sort((a, b) => a.pos - b.pos);
  if (!rows.length) return '<div class="status">Aucun classement disponible pour le moment.</div>';

  let html = `<table><thead><tr>
    <th>#</th><th>Équipe</th><th>Pts</th><th>J</th><th>G</th><th>N</th><th>P</th>
    <th>BP</th><th>BC</th><th>Diff</th><th>Série</th><th>Évo</th>
  </tr></thead><tbody>`;

  for (const t of rows) {
    const diff = t.diff ?? t.bp - t.bc;
    const diffCls = diff > 0 ? 'pos' : diff < 0 ? 'neg' : '';
    const serie = (t.serie || []).map((s) => `<i class="${s}">${s}</i>`).join('');
    let evo = t.evo === 1 ? '<td class="evo up">▲</td>'
      : t.evo === -1 ? '<td class="evo down">▼</td>'
      : t.evo === 0 ? '<td class="evo">—</td>' : '<td class="evo">·</td>';

    const teamCell = t.isBelAir
      ? `<a class="team-link" href="${CONF.equipeUrl}" title="Voir la fiche équipe">
           <span class="team-dot"></span><span>${esc(t.club)} ⭐</span></a>`
      : `<div class="team-inline"><span class="team-dot"></span><span>${esc(t.club)}</span></div>`;

    html += `<tr class="${t.isBelAir ? 'is-belair' : ''}">
      <td class="pos">${t.pos}</td>
      <td class="team"><div class="team-inline">${teamCell}</div></td>
      <td class="pts">${esc(t.pts)}</td>
      <td>${t.j ?? 0}</td><td>${t.g ?? 0}</td><td>${t.n ?? 0}</td><td>${t.p ?? 0}</td>
      <td>${t.bp ?? 0}</td><td>${t.bc ?? 0}</td>
      <td class="diff ${diffCls}">${diff > 0 ? '+' : ''}${diff}</td>
      <td><span class="serie">${serie || '—'}</span></td>
      ${evo}
    </tr>`;
  }
  return html + '</tbody></table>';
}

/* ---------- Bandeaux matchs ---------- */
function buildBand(d) {
  const next = d.prochainMatch;
  const last = d.dernierResultat;
  let html = '';
  if (last) {
    html += `<div class="mini">
      <h4>⚽ Dernier résultat — ${esc(last.journee || '')}</h4>
      <div class="scoreline">${esc(last.domicile)} <b>${esc(last.score)}</b> ${esc(last.exterieur)}</div>
      <div class="sub">📅 ${esc(dateLongue(last.date))} · ${
        last.victoire === true ? '<span style="color:var(--ok)">Victoire 🎉</span>'
        : last.victoire === false ? '<span style="color:var(--ko)">Défaite</span>'
        : 'Match nul'}</div>
    </div>`;
  }
  if (next) {
    html += `<div class="mini next">
      <h4>📅 Prochain match — ${esc(next.journee || '')}</h4>
      <div class="scoreline"><b>${esc(next.domicile)}</b> <span style="color:var(--gold)">vs</span> ${esc(next.exterieur)}</div>
      <div class="sub">🗓️ ${esc(dateLongue(next.date))} · ${esc(next.lieu || '')}</div>
    </div>`;
  }
  return html;
}

/* ---------- Chargement ---------- */
async function load() {
  const wrap = el('tableWrap');
  try {
    const res = await fetch(CONF.dataUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();

    el('updated').textContent = d.updatedLabel || d.updated || '—';
    el('pouleLabel').textContent = '— ' + (d.poule || 'District Provence');

    wrap.innerHTML = buildTable(d);
    const band = el('band');
    band.innerHTML = buildBand(d) || '<div class="status">Pas encore de match.</div>';

    const s = document.createElement('span');
    s.className = 'auto';
    s.textContent = '🔄 auto FFF';
    el('sourceHint') && el('sourceHint').append(s);
  } catch (e) {
    console.error('Classement :', e);
    el('updated').textContent = '—';
    wrap.innerHTML = `
      <div class="status">
        <div class="err">⚠️ Impossible de charger le classement (${esc(e.message)}).</div>
        <div style="margin-top:14px"><button class="btn btn-ghost" onclick="location.reload()">Réessayer</button></div>
      </div>`;
  }
}
load();