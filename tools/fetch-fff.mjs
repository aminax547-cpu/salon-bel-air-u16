#!/usr/bin/env node
/**
 * fetch-fff.mjs — Récupère automatiquement le classement U16 D2 (District Provence)
 * depuis les données publiques de la FFF (epreuves.fff.fr) et génère
 * `data/u16-d2-2026-2027.json`.
 *
 * Stratégie : le site epreuves.fff.fr est une SPA Angular avec SSR.
 * - L'API JSON directe (/api/data/...) est protégée par un WAF (403) qui accepte
 *   seulement les requêtes "navigateur" (headers complets) — et encore, pas toujours.
 * - En revanche, la PAGE HTML rendue côté serveur (SSR) contient TOUT le classement
 *   embarqué dans le JSON `#ng-state` (Angular TransferState).
 * → On fetch la page HTML avec un User-Agent navigateur réaliste, on parse le
 *   `#ng-state`, et on en extrait les données officielles.
 *
 * Usage :  node tools/fetch-fff.mjs            (écrit data/u16-d2-2026-2027.json)
 *          node tools/fetch-fff.mjs --poule B  (choisit une autre poule si dispo)
 * Env :    FFF_CPNO (défaut 457249 = U16 D2 Provence saison 2026/27)
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const CPNO = process.env.FFF_CPNO || '457249'; // U16 D2 District Provence — saison 2026/27
const PHASE = 1;
const GROUP = 1; // POULE A (Salon Bel Air Foot y est). --poule B → 2
const COMPETITION_SLUG = 'u16-departemental-2';
const NOM_COMPETITION = 'U16 Départemental 2 — District Provence — 2026/27';
const CLUB_CIBLE = 'SALON BEL AIR FOOT';
const OUT = join(ROOT, 'data', 'u16-d2-2026-2027.json');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function browsersHeaders(referer) {
  return {
    'User-Agent': UA,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    'Sec-CH-UA': '"Chromium";v="126", "Google Chrome";v="126", "Not.A/Brand";v="24"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    ...(referer ? { Referer: referer } : {}),
  };
}

// ---------------------------------------------------------------------------
// Récupération de la page SSR + extraction du ng-state
// ---------------------------------------------------------------------------
async function fetchPage(url, referer) {
  const res = await fetch(url, { headers: browsersHeaders(referer) });
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
  return await res.text();
}

function extractNgState(html) {
  const m = html.match(/<script[^>]*id="ng-state"[^>]*>\s*(.*?)\s*<\/script>/s);
  if (!m) throw new Error('ng-state introuvable dans la page');
  // décoder les entités HTML puis parser le JSON
  const decoded = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  return JSON.parse(decoded);
}

function stateValue(ngState, urlSuffix) {
  const key = Object.keys(ngState).find((k) => k.includes(urlSuffix));
  if (!key) return null;
  const entry = ngState[key];
  return entry && typeof entry === 'object' && 'body' in entry ? entry.body : entry;
}

// ---------------------------------------------------------------------------
// Parsing classement + matchs
// ---------------------------------------------------------------------------
function num(v) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
}

function parseClassement(body) {
  const member = body?.['hydra:member'] || [];
  if (!member.length) return null;
  // le membre le plus récent = dernière journée (ordre descendant côté API,
  // on prend celui qui a le plus de matchs joués pour être sûr)
  let best = member[0];
  let bestPlayed = -1;
  for (const it of member) {
    const rows = it?.donneesFormatees || [];
    const played = Math.max(...rows.map((r) => num(r.nbMatch)), 0);
    if (played >= bestPlayed) {
      bestPlayed = played;
      best = it;
    }
  }
  return {
    journeeId: best.id,
    rows: (best.donneesFormatees || []).map((r) => ({
      pos: num(r.placeAffichage),
      club: (r.nomEquipe || '').trim(),
      pts: r.points === 'EX' || r.points === 'EXC' ? r.points : num(r.points),
      j: num(r.nbMatch),
      g: num(r.nbMatchGagne),
      n: num(r.nbMatchNul),
      p: num(r.nbMatchPe),
      bp: num(r.nbButPour),
      bc: num(r.nbButContre),
      diff: num(r.diffBut),
      evo: r.evolutionClassement ?? null, // +1/-1/0
      serie: Array.isArray(r.serieEnCours) ? r.serieEnCours : [],
      clCod: r.clCod ?? null,
    })),
  };
}

function parseMatchs(body) {
  const member = body?.['hydra:member'] || [];
  return member
    .map((m) => {
      const df = m?.donneesFormatees || m || {};
      const recevant = df.recevant || {};
      const visiteur = df.visiteur || {};
      const club1 = recevant.club || {};
      const club2 = visiteur.club || {};
      return {
        maNo: df.maNo ?? m.id,
        date: df.date,
        journee: df.journee?.pjNo ?? null,
        statut: df.maStatutLib || (df.joue ? 'joué' : 'programmé'),
        joue: !!df.joue,
        recevant: { club: club1.nom || null, buts: recevant.buts ?? null, logo: club1.logo || null },
        visiteur: { club: club2.nom || null, buts: visiteur.buts ?? null, logo: club2.logo || null },
      };
    })
    .filter((x) => x.recevant.club || x.visiteur.club);
}

// repère le club cible dans un match (nom contient "SALON BEL AIR")
function isBelAirMatch(m) {
  const r = (m.recevant.club || '').toUpperCase();
  const v = (m.visiteur.club || '').toUpperCase();
  return r.includes('SALON BEL AIR') || v.includes('SALON BEL AIR');
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const wantPoule = process.argv.find((a) => a.startsWith('--poule'));
  const gpNo = wantPoule ? parseInt(wantPoule.split('=')[1] || 'B', 10) : GROUP;
  const pouleNom = gpNo === 2 ? 'POULE B' : 'POULE A';

  const baseUrl = `https://epreuves.fff.fr/competition/engagement/${CPNO}-${COMPETITION_SLUG}/phase/${PHASE}/${gpNo}`;

  console.log(`→ Récupération du classement FFF : ${NOM_COMPETITION} (${pouleNom})`);
  console.log(`  URL : ${baseUrl}`);

  // 1. page principale : classement + journées
  const html = await fetchPage(baseUrl);
  const state = extractNgState(html);

  const classBody = stateValue(state, `/classement_journees?cpNo=${CPNO}&phNo=${PHASE}&gpNo=${gpNo}`);
  const compBody = stateValue(state, `/competitions/${CPNO}`);

  if (!classBody) throw new Error('classement introuvable dans le ng-state');

  const classement = parseClassement(classBody);
  if (!classement) throw new Error('classement vide');

  // 2. infos compétition (libellé poule / journées)
  let journees = [];
  let pouleNomOfficiel = pouleNom;
  const compDetail = compBody?.donneesFormatees || compBody;
  if (compDetail?.phases) {
    for (const ph of compDetail.phases) {
      for (const g of ph.groupes || []) {
        if (num(g.gpNo) === gpNo) {
          pouleNomOfficiel = g.nom || pouleNom;
          journees = (g.journees || []).map((j) => ({
            pjNo: num(j.pjNo),
            date: j.date,
          }));
        }
      }
    }
  }

  // 3. les matchs présents dans le snapshot (semaines affichées)
  let matchs = [];
  for (const k of Object.keys(state)) {
    if (k.includes(`/matches?cpNo=${CPNO}`)) {
      matchs = matchs.concat(parseMatchs(stateValue(state, k.split('|').pop())) || []);
    }
  }
  // dédupliquer par maNo
  const seen = new Set();
  matchs = matchs.filter((m) => (seen.has(m.maNo) ? false : (seen.add(m.maNo), true)));

  const belAirMatchs = matchs.filter(isBelAirMatch).sort((a, b) => (a.date < b.date ? 1 : -1));
  const dernier = belAirMatchs.find((m) => m.joue && m.recevant.buts !== null);
  let prochain = belAirMatchs.find((m) => !m.joue);

  // 3bis. Si le prochain match n'est pas encore publié (adversaires à venir),
  // on déduit la prochaine journée du calendrier officiel (date connue).
  if (!prochain) {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
    const upcoming = journees
      .map((j) => ({ ...j, dateObj: new Date(j.date) }))
      .filter((j) => j.dateObj >= tomorrow)
      .sort((a, b) => a.dateObj - b.dateObj);
    if (upcoming.length) {
      prochain = {
        pjNo: upcoming[0].pjNo,
        date: formatDate(upcoming[0].date),
        recevant: { club: 'Salon Bel Air Foot' },
        visiteur: { club: 'Adversaire à venir' },
        aVenirCalendrier: true,
      };
    }
  }

  // 4. build du JSON
  const now = new Date();
  const data = {
    competition: NOM_COMPETITION,
    poule: pouleNomOfficiel,
    source: 'FFF — epreuves.fff.fr (données officielles, SSR)',
    competionId: CPNO,
    phase: PHASE,
    groupe: gpNo,
    updated: now.toISOString(),
    updatedLabel: now
      .toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    classement: classement.rows.map((r) => ({
      ...r,
      isBelAir: r.club.toUpperCase().includes('SALON BEL AIR'),
    })),
    prochainMatch: prochain
      ? {
          journee: prochain.pjNo
            ? `J${prochain.pjNo}`
            : prochain.journee
              ? `J${prochain.journee}`
              : null,
          date: prochain.date,
          domicile: prochain.recevant.club,
          exterieur: prochain.visiteur.club,
          lieu: prochain.aVenirCalendrier
            ? 'Calendrier officiel — adversaire publié prochainement'
            : 'À confirmer — Stade Marcel Roustan',
        }
      : null,
    dernierResultat: dernier
      ? {
          journee: dernier.journee ? `J${dernier.journee}` : null,
          date: formatDate(dernier.date),
          domicile: dernier.recevant.club,
          exterieur: dernier.visiteur.club,
          score: `${dernier.recevant.buts} — ${dernier.visiteur.buts}`,
          victoire:
            (dernier.recevant.club || '').toUpperCase().includes('SALON BEL AIR')
              ? dernier.recevant.buts > dernier.visiteur.buts
              : dernier.visiteur.buts > dernier.recevant.buts,
        }
      : null,
  };

  // Ne pas changer le timestamp si le classement n'a pas bougé (évite les commits inutiles)
  if (existsSync(OUT)) {
    try {
      const prev = JSON.parse(readFileSync(OUT, 'utf-8'));
      const sig = (d) => JSON.stringify(d.classement) + JSON.stringify(d.dernierResultat) + JSON.stringify(d.prochainMatch);
      if (sig(prev) === sig(data)) {
        data.updated = prev.updated;
        data.updatedLabel = prev.updatedLabel;
      }
    } catch (_) { /* ignore */ }
  }

  writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
  console.log(`\n✅ ${OUT}`);
  console.log(`   ${classement.rows.length} équipes · MAJ ${data.updatedLabel}`);
  if (dernier) console.log(`   Dernier résultat : ${dernier.recevant.club} ${dernier.recevant.buts}-${dernier.visiteur.buts} ${dernier.visiteur.club}`);
  if (prochain) console.log(`   Prochain match   : ${prochain.recevant.club} vs ${prochain.visiteur.club} (${formatDate(prochain.date)})`);
}

main().catch((e) => {
  console.error('Échec :', e.message);
  process.exit(1);
});