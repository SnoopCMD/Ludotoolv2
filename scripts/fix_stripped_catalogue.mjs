/**
 * Restaure les champs effacés par le bug INSERT OR REPLACE sur la table catalogue de D1.
 * Cible : jeux qui ont une couleur mais ont perdu mecanique + autres champs (données Supabase = source de vérité).
 *
 * Usage :
 *   node scripts/fix_stripped_catalogue.mjs
 *   CLOUDFLARE_API_TOKEN=xxx npx wrangler d1 execute ludotool-db --file=scripts/fix_stripped_catalogue.sql --remote
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://tpaofmsnlkhqruohsnvk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_PruZG4nS0LjVZf7mhW0Gqg_KJq29-_B';
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT = '1ffbfd0e64658684688252c4bed28044';
const DB_ID = 'e7f95196-5ea8-4453-8852-090bb661f30c';

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

async function queryD1(sql) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/d1/database/${DB_ID}/query`,
    { method: 'POST', headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql }) }
  );
  const json = await res.json();
  return json.result?.[0]?.results ?? [];
}

async function main() {
  if (!CF_TOKEN) { console.error('Manque CLOUDFLARE_API_TOKEN'); process.exit(1); }

  // 1. Récupérer les EANs dans D1 avec couleur mais sans mecanique (victimes du bug)
  console.log('Récupération des EANs affectés depuis D1...');
  const stripped = await queryD1(`
    SELECT ean FROM catalogue
    WHERE (mecanique IS NULL OR mecanique = '') AND couleur IS NOT NULL AND couleur != ''
    ORDER BY ean
  `);
  const eans = stripped.map(r => r.ean);
  console.log(`  ${eans.length} EANs affectés en D1`);

  // 2. Récupérer les données complètes depuis Supabase par batch
  const FIELDS = 'ean,nom,couleur,mecanique,nb_de_joueurs,temps_de_jeu,etoiles,coop_versus,image_url,auteurs,editeur,boite_format,auteurs_json,resume,description,contenu';
  const allRows = [];
  const batchSize = 50;
  for (let i = 0; i < eans.length; i += batchSize) {
    const batch = eans.slice(i, i + batchSize);
    const inClause = batch.map(e => `"${e}"`).join(',');
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/catalogue?select=${FIELDS}&ean=in.(${inClause})`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': SUPABASE_ANON_KEY } }
    );
    const data = await res.json();
    if (Array.isArray(data)) allRows.push(...data);
    console.log(`  Supabase : ${allRows.length} lignes récupérées...`);
  }

  // 3. Générer les UPDATE — uniquement les champs non-vides de Supabase
  const RESTORE_FIELDS = ['couleur','mecanique','nb_de_joueurs','temps_de_jeu','etoiles','coop_versus','image_url','auteurs','editeur','boite_format','auteurs_json','resume','description','contenu'];
  const sqlLines = [];

  for (const row of allRows) {
    const sets = RESTORE_FIELDS
      .filter(f => row[f] !== null && row[f] !== undefined && row[f] !== '')
      .map(f => `${f} = ${esc(row[f])}`);
    if (sets.length === 0) continue;
    sqlLines.push(`UPDATE catalogue SET ${sets.join(', ')} WHERE ean = ${esc(row.ean)};`);
  }

  const outputPath = join(__dirname, 'fix_stripped_catalogue.sql');
  writeFileSync(outputPath, sqlLines.join('\n') + '\n', 'utf8');

  console.log(`\n${sqlLines.length} UPDATE générés → ${outputPath}`);
  console.log(`\nPour appliquer :`);
  console.log(`  CLOUDFLARE_API_TOKEN=xxx npx wrangler d1 execute ludotool-db --file=scripts/fix_stripped_catalogue.sql --remote`);
}

main().catch(err => { console.error(err); process.exit(1); });
