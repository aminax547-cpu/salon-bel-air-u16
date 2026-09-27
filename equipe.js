/* =====================================================================
 * Salon Bel Air Foot — U16 D2 — equipe.js (page fiche équipe)
 * Résumé saison + effectif/buteurs + calendrier complet.
 * ===================================================================== */

const DATA = './data/u16-d2-2026-2027.json';
const JOUEURS = './data/u16-joueurs.json';

function el(id) { return document.getElementById(id); }
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function dateLongue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function dateCourte(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

/* ---------- Résumé saison (position, forme, dernier/prochain match) ---------- */
function buildResume(d) {
  const sba = (d.classement || []).find((r) => r.isBelAir);
  if (!sba) return '<div class="status">Équipe introuvable dans le classement.</div>';

  const diff = sba.diff ?? sba.bp - sba.bc;
  const serie = (sba.serie || []).map((s) => `<i class="${s}">${s}</i>`).join('');
  const next = d.prochainMatch;
  const last = d.dernierResultat;

  return `
    <div class="card-head">
      <h3>📊 Résumé saison <span>${esc(d.poule || 'Poule A')}</span></h3>
      <div class="meta">MAJ <strong id="upd2">${esc(d.updatedLabel || d.updated || '—')}</strong></div>
    </div>
    <div style="padding:18px 20px 20px">
      <div style="display:flex;gap:22px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
        <div>
          <div style="font-family:Outfit;font-size:2.4rem;font-weight:800;color:var(--gold)">${sba.pos}<span style="font-size:1rem;color:var(--muted)">/ ${d.classement.length}ᵉ</span></div>
          <div style="color:var(--muted);font-size:.78rem">position actuelle</div>
        </div>
        <div style="display:flex;gap:14px;flex-wrap:wrap">
          <div style="text-align:center"><div style="font-size:1.5rem;font-weight:800;color:#fff">${sba.pts}</div><div style="color:var(--muted);font-size:.72rem">pts</div></div>
          <div style="text-align:center"><div style="font-size:1.5rem;font-weight:800;color:#fff">${sba.bp}<span style="color:var(--muted);font-size:.8rem"> – ${sba.bc}</span></div><div style="color:var(--muted);font-size:.72rem">buts</div></div>
          <div style="text-align:center"><div style="font-size:1.5rem;font-weight:800;color:${diff >= 0 ? 'var(--ok)' : 'var(--ko)'}">${diff > 0 ? '+' : ''}${diff}</div><div style="color:var(--muted);font-size:.72rem">diff</div></div>
          <div style="text-align:center"><div style="font-size:1.1rem;font-weight:800;color:#fff">${sba.g}V ${sba.n}N ${sba.p}D</div><div style="color:var(--muted);font-size:.72rem">${sba.j || 0} matchs</div></div>
          <div style="text-align:center"><div style="font-size:1rem;font-weight:800"><span class="serie">${serie}</span></div><div style="color:var(--muted);font-size:.72rem">forme</div></div>
        </div>
      </div>
      <div class="band">
        ${last ? `<div class="mini">
          <h4>⚽ Dernier résultat — ${esc(last.journee || '')}</h4>
          <div class="scoreline">${esc(last.domicile)} <b>${esc(last.score)}</b> ${esc(last.exterieur)}</div>
          <div class="sub">📅 ${esc(dateLongue(last.date))} · ${
            last.victoire === true ? '<span style="color:var(--ok)">Victoire 🎉</span>'
            : last.victoire === false ? '<span style="color:var(--ko)">Défaite</span>' : 'Nul'}</div>
        </div>` : ''}
        ${next ? `<div class="mini next">
          <h4>📅 Prochain match — ${esc(next.journee || '')}</h4>
          <div class="scoreline"><b>${esc(next.domicile)}</b> <span style="color:var(--gold)">vs</span> ${esc(next.exterieur)}</div>
          <div class="sub">🗓️ ${esc(dateLongue(next.date))} · ${esc(next.lieu || '')}</div>
        </div>` : ''}
      </div>
    </div>`;
}

/* ---------- Effectif + buteurs ---------- */
function buildSquad(data) {
  const list = data.joueurs || [];
  if (!list.length) {
    return `<div class="squad-note">L'effectif sera bientôt publié par le staff du club (fichier <code>data/u16-joueurs.json</code>).</div>`;
  }
  const triButs = list.slice().sort((a, b) => (b.buts || 0) - (a.buts || 0));
  const topButs = triButs[0]?.buts || 0;
  const triPasses = list.slice().sort((a, b) => (b.passes || 0) - (a.passes || 0));
  const topPasses = triPasses[0]?.passes || 0;

  let html = `<div class="squad-note">📋 Effectif extrait automatiquement des <b>feuilles de match officielles FFF</b> (mise à jour après chaque journée). La FFF ne publie pas les buts individuels pour les jeunes : les colonnes buts/passes sont à compléter par le staff (fichier <code>data/u16-joueurs.json</code>, puis <code>git push</code>).</div><div class="player-grid">`;
  for (const p of list) {
    const top = p.buts === topButs && p.buts > 0;
    const j = p.matchsJoues ?? 0;
    html += `<div class="player${top ? ' top' : ''}">
      <div class="num">${esc(p.numero ?? '—')}</div>
      <div class="pname">${esc(p.nom)}<div class="ppost">${esc(p.poste || 'Joueur')} · ${j} match${j > 1 ? 's' : ''} joué${j > 1 ? 's' : ''}</div></div>
      <div class="pstats">
        <b>${p.buts || 0}</b><span>buts</span>
      </div>
      <div class="pstats">
        <b>${p.passes || 0}</b><span>passes</span>
      </div>
    </div>`;
  }
  html += '</div>';
  // podium buteurs
  if (topButs > 0) {
    html += `<div style="margin-top:16px">
      <h4 style="font-size:.7rem;letter-spacing:.11em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">🥇 Meilleurs buteurs</h4>
      <div style="display:flex;gap:8px;flex-wrap:wrap">`;
    for (const p of triButs.filter((x) => x.buts > 0).slice(0, 3)) {
      html += `<span style="background:rgba(200,169,106,.14);border:1px solid var(--border-gold);border-radius:999px;padding:5px 12px;font-size:.8rem;font-weight:700;color:var(--gold2)">${esc(p.nom)} · ${p.buts} ⚽</span>`;
    }
    html += '</div></div>';
  }
  return html;
}

/* ---------- Calendrier ---------- */
function buildCal(d) {
  const rows = d.calendrier || [];
  if (!rows.length) return '<div class="status">Calendrier indisponible.</div>';

  const now = new Date();
  let html = '';
  for (const j of rows) {
    const dateJ = new Date(j.date);
    const estProche = !j.passe && dateJ - now < 12 * 24 * 3600 * 1000;
    let tag;
    if (j.joue) tag = '<span class="cal-tag done">Joué</span>';
    else if (j.passe) tag = '<span class="cal-tag done">Passé</span>';
    else if (estProche) tag = '<span class="cal-tag soon">À venir</span>';
    else tag = '<span class="cal-tag up">À venir</span>';

    let matchCell;
    if (j.joue && j.score) {
      const dLabel = j.domicile ? `${esc(d.nomEquipe || 'SBA')} ${esc(j.score)} ${esc(j.adversaire)}` : `${esc(j.adversaire)} ${esc(j.score)} ${esc(d.nomEquipe || 'SBA')}`;
      matchCell = `<div class="cal-match">${j.domicile ? '<b>Salon Bel Air</b>' : esc(j.adversaire) || '—'} <span class="vs">vs</span> ${j.domicile ? esc(j.adversaire) || '—' : '<b>Salon Bel Air</b>'}</div><span class="cal-score">${esc(j.score)}</span>`;
    } else {
      matchCell = `<div class="cal-match"><b>Salon Bel Air</b> <span class="vs">vs</span> ${esc(j.adversaire) || '<span style="color:var(--muted)">adversaire à venir</span>'}</div>`;
    }

    html += `<div class="cal-row">
      <div><div class="cal-j">${esc(j.journee)}</div><div class="cal-date">${esc(dateCourte(j.date))}</div></div>
      ${matchCell}
      ${tag}
    </div>`;
  }
  return html;
}

/* ---------- Load ---------- */
async function load() {
  let d;
  try {
    const [r1, r2] = await Promise.all([
      fetch(DATA, { cache: 'no-store' }),
      fetch(JOUEURS, { cache: 'no-store' }),
    ]);
    d = await r1.json();
    const joueurs = await r2.json();
    el('resume').innerHTML = buildResume(d);
    el('squadWrap').innerHTML = buildSquad(joueurs);
    el('calWrap').innerHTML = buildCal(d);
    el('calTitle').textContent = '— ' + (d.poule || 'Poule A');
    const upd = d.updatedLabel || d.updated || '—';
    el('heroSub').textContent = `Championnat U16 Départemental 2 — District Provence · ${esc(d.poule || 'Poule A')} · MAJ ${upd}`;
  } catch (e) {
    console.error(e);
    el('resume').innerHTML = `<div class="status"><div class="err">⚠️ Impossible de charger les données (${esc(e.message)}).</div></div>`;
  }
}
load();