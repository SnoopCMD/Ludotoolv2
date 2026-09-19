import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { trouverReglePhilibert, telechargerPdf } from '../../../../lib/philibert';
import { TAILLE_MAX, cleR2, urlRegle } from '../commun';

export const dynamic = 'force-dynamic';

// GET ?ean= : dit seulement si Philibert a une règle pour ce jeu.
export async function GET(request: Request) {
  const ean = new URL(request.url).searchParams.get('ean');
  if (!ean) return NextResponse.json({ error: 'ean manquant' }, { status: 400 });
  const regle = await trouverReglePhilibert(ean);
  return NextResponse.json({ trouve: !!regle, ...regle });
}

// POST { ean, nom? } : cherche, télécharge dans R2 et renseigne catalogue.pdf_url.
// Utilisé par le bouton de la fiche jeu et par scripts/importer_regles_philibert.mjs.
export async function POST(request: Request) {
  try {
    const { ean, nom, ecraser } = await request.json() as { ean?: string; nom?: string; ecraser?: boolean };
    if (!ean) return NextResponse.json({ error: 'ean manquant' }, { status: 400 });
    const { env } = await getCloudflareContext({ async: true });

    if (!ecraser) {
      const existant = await env.DB.prepare('SELECT pdf_url FROM catalogue WHERE ean = ?').bind(ean).first<{ pdf_url: string | null }>();
      if (existant?.pdf_url) return NextResponse.json({ statut: 'deja', pdf_url: existant.pdf_url });
    }

    const regle = await trouverReglePhilibert(ean);
    if (!regle) return NextResponse.json({ statut: 'introuvable' });

    const pdf = await telechargerPdf(regle.url, TAILLE_MAX);
    if (!pdf) return NextResponse.json({ statut: 'telechargement_impossible', source: regle.url, libelle: regle.libelle });

    await env.REGLES.put(cleR2(ean), pdf.body, {
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: { source: regle.url, libelle: regle.libelle },
    });
    const pdf_url = urlRegle(ean);
    await env.DB.prepare(
      `INSERT INTO catalogue (ean, nom, pdf_url) VALUES (?, ?, ?) ON CONFLICT(ean) DO UPDATE SET pdf_url = excluded.pdf_url`
    ).bind(ean, nom || ean, pdf_url).run();

    return NextResponse.json({ statut: 'importe', pdf_url, source: regle.url, libelle: regle.libelle, taille: pdf.taille });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
