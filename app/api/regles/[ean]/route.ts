import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { TAILLE_MAX, cleR2, urlRegle } from '../commun';

export const dynamic = 'force-dynamic';

async function getEnv() {
  const ctx = await getCloudflareContext({ async: true });
  return ctx.env;
}

export async function GET(_: Request, { params }: { params: Promise<{ ean: string }> }) {
  try {
    const { ean } = await params;
    const env = await getEnv();
    const objet = await env.REGLES.get(cleR2(ean));
    if (!objet) return NextResponse.json({ error: 'Aucune règle pour ce jeu' }, { status: 404 });
    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `inline; filename="regles-${ean}.pdf"`);
    headers.set('Content-Length', String(objet.size));
    headers.set('ETag', objet.httpEtag);
    headers.set('Cache-Control', 'private, max-age=0, must-revalidate');
    return new Response(objet.body, { headers });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ ean: string }> }) {
  try {
    const { ean } = await params;
    const env = await getEnv();
    const form = await request.formData();
    const fichier = form.get('fichier');
    if (!(fichier instanceof File)) return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 });
    const estPdf = fichier.type === 'application/pdf' || fichier.name.toLowerCase().endsWith('.pdf');
    if (!estPdf) return NextResponse.json({ error: 'Seul le format PDF est accepté' }, { status: 400 });
    if (fichier.size > TAILLE_MAX) return NextResponse.json({ error: 'PDF trop lourd (80 Mo maximum)' }, { status: 413 });

    // R2 refuse un flux de longueur inconnue : on passe le contenu entier (taille connue).
    await env.REGLES.put(cleR2(ean), await fichier.arrayBuffer(), {
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: { nom_origine: fichier.name },
    });

    const pdf_url = urlRegle(ean);
    await env.DB.prepare(
      `INSERT INTO catalogue (ean, nom, pdf_url) VALUES (?, ?, ?) ON CONFLICT(ean) DO UPDATE SET pdf_url = excluded.pdf_url`
    ).bind(ean, String(form.get('nom') || ean), pdf_url).run();

    return NextResponse.json({ success: true, pdf_url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ ean: string }> }) {
  try {
    const { ean } = await params;
    const env = await getEnv();
    await env.REGLES.delete(cleR2(ean));
    await env.DB.prepare('UPDATE catalogue SET pdf_url = NULL WHERE ean = ?').bind(ean).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
