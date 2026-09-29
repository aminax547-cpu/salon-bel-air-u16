#!/usr/bin/env node
/**
 * index-media.mjs — Indexe les photos/vidéos du club fournies pour chaque match
 * et génère `data/media.json` (léger, références relatives — PAS de base64).
 *
 * Conventions ultra simples pour le coach :
 *   - Déposer les fichiers ici :  media/<categorie>/<journee>-<adversaire>/…
 *       ex.  media/u16/J4-carnoux/photo1.jpg
 *            media/u16/J4-carnoux/video-but.mp4
 *            media/u19/J1-canton/photo.jpg
 *   - Formats supportés : jpg jpeg png webp gif (photos) · mp4 webm (vidéos)
 *   - Vidéos externes (YouTube/Vimeo/Dailymotion) : mettre un fichier
 *       `links.txt` dans le dossier du match, une URL par ligne.
 *   - Légendes facultatives : un fichier `captions.json` dans le dossier du
 *       match : { "photo1.jpg": "Le but de LISANDRO", "https://youtu.be/…": "…" }
 *
 * Usage : node tools/index-media.mjs
 * Sortie : data/media.json  → [{cat, journee, adversaire, type, src, caption}]
 */
import { readdirSync, writeFileSync, existsSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MEDIA_DIR = join(ROOT, 'media');
const OUT = join(ROOT, 'data', 'media.json');

const PHOTO = /\.(jpe?g|png|webp|gif|svg)$/i;
const VIDEO = /\.(mp4|webm|mov)$/i;

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push({ file: entry, rel: p.replace(/\\/g, '/').replace(base.replace(/\\/g, '/') + '/', '') });
  }
  return out;
}

function main() {
  if (!existsSync(MEDIA_DIR)) {
    writeFileSync(OUT, JSON.stringify({ medias: [], note: 'Aucun média pour l’instant — déposez des fichiers dans media/<cat>/<journee>-<adversaire>/ et relancez node tools/index-media.mjs' }, null, 2) + '\n');
    console.log('ℹ️ dossier media/ absent — data/media.json vide créé.');
    return;
  }

  const medias = [];
  // structure: media/<cat>/<dossier-match>/
  for (const cat of readdirSync(MEDIA_DIR)) {
    const catDir = join(MEDIA_DIR, cat);
    if (!statSync(catDir).isDirectory()) continue;
    for (const matchDir of readdirSync(catDir)) {
      const md = join(catDir, matchDir);
      if (!statSync(md).isDirectory()) continue;
      // parse "J4-carnoux" → journee J4, adversaire "carnoux"
      const [journee, ...advParts] = matchDir.split('-');
      const adversaire = advParts.join('-') || '';

      // légendes optionnelles
      let captions = {};
      const capFile = join(md, 'captions.json');
      if (existsSync(capFile)) {
        try { captions = JSON.parse(readFileSync(capFile, 'utf8')); } catch (_) { /* ignore */ }
      }

      for (const f of walk(md)) {
        if (f.file === 'captions.json' || f.file === 'links.txt') continue;
        const relClient = `./media/${cat}/${matchDir}/${f.rel}`;
        if (PHOTO.test(f.file)) {
          medias.push({ cat, journee, adversaire, type: 'photo', src: relClient, caption: captions[f.file] || null });
        } else if (VIDEO.test(f.file)) {
          medias.push({ cat, journee, adversaire, type: 'video', src: relClient, caption: captions[f.file] || null });
        }
      }

      // liens externes (YouTube etc.)
      const linksFile = join(md, 'links.txt');
      if (existsSync(linksFile)) {
        for (const line of readFileSync(linksFile, 'utf8').split('\n')) {
          const url = line.trim();
          if (!url || url.startsWith('#')) continue;
          medias.push({ cat, journee, adversaire, type: 'lien', src: url, caption: captions[url] || null });
        }
      }
    }
  }

  medias.sort((a, b) => `${a.cat}|${a.journee}`.localeCompare(`${b.cat}|${b.journee}`));
  writeFileSync(
    OUT,
    JSON.stringify(
      { note: 'Photos/vidéos fournies par le club — généré par tools/index-media.mjs (ne pas éditer à la main)', medias },
      null, 2
    ) + '\n'
  );

  console.log(`✅ ${OUT} — ${medias.length} média(s) indexé(s)`);
  for (const m of medias.slice(0, 10)) console.log(`   [${m.cat} ${m.journee}] ${m.type} ${m.src}`);
}

main();