/**
 * Restaure les image_url effacées par le bug INSERT OR REPLACE sur catalogue D1.
 * Source : Supabase. Cible : tous les enregistrements D1 sans image_url.
 *
 * Usage :
 *   CLOUDFLARE_API_TOKEN=xxx node scripts/fix_images_d1.mjs
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

  // 1. EANs dans D1 sans image
  console.log('Récupération des EANs sans image depuis D1...');
  const rows = await queryD1(`SELECT ean FROM catalogue WHERE image_url IS NULL OR image_url = '' ORDER BY ean`);
  const eans = rows.map(r => r.ean);
  console.log(`  ${eans.length} EANs sans image en D1`);

  // 2. Récupérer image_url depuis Supabase par batch de 100
  const allRows = [];
  const batchSize = 100;
  for (let i = 0; i < eans.length; i += batchSize) {
    const batch = eans.slice(i, i + batchSize);
    const inClause = batch.map(e => `"${e}"`).join(',');
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/catalogue?select=ean,image_url&ean=in.(${inClause})&image_url=not.is.null&image_url=neq.`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': SUPABASE_ANON_KEY } }
    );
    const data = await res.json();
    if (Array.isArray(data)) allRows.push(...data.filter(r => r.image_url));
    if ((i / batchSize) % 5 === 0) console.log(`  ${allRows.length} images trouvées dans Supabase...`);
  }
  console.log(`  Total : ${allRows.length} images à restaurer`);

  // 3. Générer les UPDATE
  const sqlLines = allRows.map(row =>
    `UPDATE catalogue SET image_url = ${esc(row.image_url)} WHERE ean = ${esc(row.ean)};`
  );

  const outputPath = join(__dirname, 'fix_images_d1.sql');
  writeFileSync(outputPath, sqlLines.join('\n') + '\n', 'utf8');
  console.log(`\nFichier SQL → ${outputPath}`);
  console.log(`\nPour appliquer :`);
  console.log(`  CLOUDFLARE_API_TOKEN=xxx npx wrangler d1 execute ludotool-db --file=scripts/fix_images_d1.sql --remote`);
}

main().catch(err => { console.error(err); process.exit(1); });
