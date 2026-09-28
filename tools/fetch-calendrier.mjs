#!/usr/bin/env node
/**
 * fetch-calendrier.mjs — Calendrier COMPLET via l'API officielle du District
 * (api-dofa.fff.fr), la même que celle utilisée par provence.fff.fr/competitions.
 *
 * Source : https://provence.fff.fr/competitions?tab=calendar&id=457249&phase=1&poule=1&type=ch
 * L'API renvoie les 132 matchs d'une poule (6 clubs × 22 journées) avec pour
 * chaque match : adversaires, date, HEURE, STADE + adresse/ville, statut et
 * score → on peut remplir le calendrier sur les 22 journées, jouées ET à venir.
 *
 * Le WAF FFF bloque la requête simple ; il faut les cookies du site provence
 * + des en-têtes navigateur complets (warm-up sur la page du District).
 *
 * Usage : node tools/fetch-calendrier.mjs --cat u16
 *         node tools/fetch-calendrier.mjs --cat u19
 * Sortie : fusionne `calendrier` (22 journées complètes) dans data/<cat>.json
 *          et enrichit feuilles_<cat>.json (score/lieu/adversaires des joués).
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const CATS = {
  u16: { libelle: 'U16', cpNo: '457249', phase: 1, poule: 1 },
  u19: { libelle: 'U19', cpNo: '457242', phase: 1, poule: 1 },
};

const argIdx = process.argv.indexOf('--cat');
const CAT_KEY = argIdx !== -1 ? process.argv[argIdx + 1] || 'u16' : 'u16';
const CAT = CATS[CAT_KEY];
if (!CAT) { console.error(`Catégorie inconnue : ${CAT_KEY}`); process.exit(1); }

const OUT = join(ROOT, 'data', `${CAT_KEY}.json`);
const OUT_FEUILLES = join(ROOT, 'data', `feuilles_${CAT_KEY}.json`);
const CLUB = 'SALON BEL AIR FOOT';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const PAGE = `https://provence.fff.fr/competitions/?tab=calendar&id=${CAT.cpNo}&phase=${CAT.phase}&poule=${CAT.poule}&type=ch`;
const API = `https://api-dofa.fff.fr/api/compets/${CAT.cpNo}/phases/${CAT.phase}/poules/${CAT.poule}/matchs`;
const attente = (ms) => new Promise((r) => setTimeout(r, ms));

function hdrs(referer, accept) {
  return {
    'User-Agent': UA,
    Accept: accept || 'application/json, text/plain, */*',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    Referer: referer || PAGE,
    'Sec-Fetch-Dest': referer ? 'document' : 'empty',
    'Sec-Fetch-Mode': referer ? 'navigate' : 'cors',
    'Sec-Fetch-Site': referer ? 'same-origin' : 'same-site',
    'X-Requested-With': referenceXMLInjected(referer),
  };
}
function referenceXMLInjected(referer) {
  return referer ? undefined : 'XMLHttpRequest';
}

async function fetchPage(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

/** Warm-up : récupérer les cookies du site du District puis interroger l'API. */
async function getMatchs() {
  // 1) warm-up sur la page (avec Redirect) pour obtenir les cookies WAF
  let cookies = '';
  const warm = await fetch(PAGE, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'none', 'Sec-Fetch-User': '?1',
    },
    redirect: 'manual',
  });
  const setCookies = warm.headers.getSetCookie ? warm.headers.getSetCookie() : [];
  cookies = setCookies.map((c) => c.split(';')[0]).join('; ');
  if (warm.status >= 300 && warm.status < 400) {
    const loc = warm.headers.get('location');
    if (loc) {
      const r2 = await fetch(new URL(loc, PAGE).toString(), {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9',
          Cookie: cookies,
          'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'same-origin',
        },
      });
      const c2 = r2.headers.getSetCookie ? r2.headers.getSetCookie() : [];
      cookies = [...new Set([...setCookies, ...c2].map((c) => c.split(';')[0]))].join('; ');
      await r2.text();
    }
  }
  await attente(300);

  // 2) récupérer TOUTES les pages de matchs
  let tous = [];
  let page = 1;
  while (true) {
    const url = `${API}?page=${page}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        Referer: PAGE,
        Cookie: cookies,
        'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-site',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    if (!res.ok) throw new Error('API HTTP ' + res.status);
    const body = await res.json();
    const mem = body['hydra:member'] || [];
    tous = tous.concat(mem);
    if (!body['hydra:view'] || !body['hydra:view']['hydra:next']) break;
    page++;
    await attente(250);
  }
  return tous;
}

/** Normalise un match DOFA → objet calendrier (brief §3A). */
function normaliser(m, idx) {
  const home = m.home?.short_name || '?';
  const away = m.away?.short_name || '?';
  const pj = m.poule_journee?.number ?? null;
  const terrain = m.terrain || {};
  const adresse = [terrain.address, terrain.zip_code, terrain.city].filter(Boolean).join(', ') || null;
  const jour = new Date(m.date + 'Z');
  const estJoue = m.status === 'A' && m.home_resu; // A = arrêté/joué, home_resu GA/NU/PE
  // score : champs fiables home_score / away_score (ex. J2 Venelloise 0-9 SBA)
  let score = null;
  if (m.home_score != null && m.away_score != null) score = `${m.home_score} — ${m.away_score}`;
  const sbaHome = home.toUpperCase().includes(CLUB.toUpperCase());
  const sbaAway = away.toUpperCase().includes(CLUB.toUpperCase());
  return {
    id: `match_${m.ma_no}`,
    maNo: m.ma_no,
    journee: pj ? `J${pj}` : null,
    date: m.date || null,
    heure: m.time ? m.time.replace('H', ':').replace(/^(\d+):/, (_, h) => h.padStart(2, '0')) : null,
    statut: estJoue ? 'joue' : 'a_venir',
    joue: !!estJoue,
    passe: false, // recalculé plus bas
    domicile: sbaHome,
    exterieur: sbaHome ? away : home,
    adversaire: sbaHome ? away : home,
    score,
    lieu: terrain.name || adresse,
    adresse: adresse,
    gps: null,
    matchFeuille: m.match_feuille || null,
    clubAdverse: sbaHome ? away : home,
  };
}

async function main() {
  console.log(`→ Calendrier complet via API District (${CAT.libelle}, cpNo ${CAT.cpNo})…`);
  const matchs = await getMatchs();
  console.log(`  ${matchs.length} matchs récupérés`);

  const sba = matchs
    .filter((m) => (m.home?.short_name + ' ' + m.away?.short_name).toUpperCase().includes(CLUB.toUpperCase()))
    .map(normaliser)
    .sort((a, b) => (a.journee?.replace('J', '') || 0) - (b.journee?.replace('J', '') || 0));

  // journées jouées (passées et/ou jouées) vs futures
  const now = new Date();
  for (const m of sba) {
    if (m.date) m.passe = new Date(m.date) < new Date(now.getTime() - 12 * 3600 * 1000);
    if (m.passe && !m.joue) m.statut = 'passe';
  }

  console.log(`  ${sba.filter((x) => x.joue).length} joués · ${sba.filter((x) => !x.joue).length} à venir`);

  // Fusionner dans data/<cat>.json (calendrier officiel longueur 22)
  const cur = JSON.parse(readFileSync(OUT, 'utf-8'));
  const ancien = cur.calendrier || [];
  const parJournee = new Map(sba.map((m) => [m.journee, m]));

  const calendrier = (ancien.length ? ancien : []).map((c) => {
    const j = c.journee;
    const m = parJournee.get(j);
    if (!m) return c;
    return {
      ...c,
      // ne pas écraser un score déjà connu (fusion)
      joue: m.joue || c.joue,
      statut: m.joue ? 'joue' : (m.passe ? 'passe' : 'a_venir'),
      exterieur: m.exterieur || c.exterieur,
      adversaire: m.adversaire || c.adversaire,
      domicile: m.domicile ?? c.domicile,
      heure: m.heure || c.heure,
      lieu: m.lieu || c.lieu,
      adresse: m.adresse || c.adresse,
      // le score DOFA est la référence officielle → écrase toujours (même "0-0")
      score: m.joue && m.score != null ? m.score : (c.score || m.score),
      gps: c.gps || m.gps,
      maNo: m.maNo || c.maNo,
    };
  });

  // si le calendrier précédent était plus court (première exécution), on étend
  // aux 22 journées présentes dans l'API
  for (const m of sba) {
    if (!calendrier.some((c) => c.journee === m.journee)) {
      calendrier.push(m);
    }
  }
  calendrier.sort((a, b) => (a.journee?.replace('J', '') || 0) - (b.journee?.replace('J', '') || 0));

  // prochainMatch = première journée à venir avec adversaire
  const prochain = sba.find((m) => !m.joue && m.date);
  cur.calendrier = calendrier;
  if (prochain) {
    cur.prochainMatch = {
      journee: prochain.journee,
      date: prochain.date,
      heure: prochain.heure,
      domicile: prochain.domicile ? 'Salon Bel Air Foot' : prochain.exterieur,
      exterieur: prochain.domicile ? prochain.exterieur : 'Salon Bel Air Foot',
      lieu: prochain.lieu || 'À confirmer',
      gps: prochain.gps,
      adresse: prochain.adresse,
      maNo: prochain.maNo,
    };
  }
  writeFileSync(OUT, JSON.stringify(cur, null, 2) + '\n');

  // enrichir les feuilles des matchs joués (score/lieu/adversaires) pour la compo
  if (existsSync(OUT_FEUILLES)) {
    try {
      const feuilles = JSON.parse(readFileSync(OUT_FEUILLES, 'utf-8'));
      const parMa = new Map(sba.filter((m) => m.maNo).map((m) => [m.maNo, m]));
      let maj = 0;
      for (const f of feuilles) {
        const info = parMa.get(f.maNo);
        if (info && (f.score !== info.score || f.lieu !== info.lieu)) {
          f.score = f.score || info.score;
          f.lieu = f.lieu || info.lieu;
          f.heure = f.heure || info.heure;
          f.stade = f.stade || info.lieu;
          f.adversaire = info.adversaire;
          f.domicile = info.domicile;
          f.statut = info.joue ? 'joue' : (info.passe ? 'passe' : 'a_venir');
          maj++;
        }
      }
      if (maj) { writeFileSync(OUT_FEUILLES, JSON.stringify(feuilles, null, 2) + '\n'); console.log(`  feuilles enrichies (${maj})`); }
    } catch (_) { /* ignore */ }
  }

  // console récap
  console.log(`\n✅ ${OUT} — calendrier ${calendrier.length} journées`);
  for (const c of calendrier.slice(0, 6)) {
    console.log(`  ${c.journee} ${String(c.date || '').slice(0, 10)} ${c.heure || ''} | ${c.domicile ? 'SBA' : c.exterieur} vs ${c.domicile ? c.exterieur : 'SBA'} | ${c.score || '—'} | ${c.lieu || ''}`);
  }
  if (prochain) console.log(`\nProchain match : ${prochain.journee} — ${prochain.domicile ? 'SBA' : prochain.exterieur} vs ${prochain.domicile ? prochain.exterieur : 'SBA'} (${String(prochain.date).slice(0, 10)} ${prochain.heure}) @ ${prochain.lieu}`);
}

main().catch((e) => { console.error('Erreur :', e.message); process.exit(1); });