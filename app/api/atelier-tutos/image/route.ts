import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { compteCourant } from '../../../../lib/auth';
import { PREFIXE_IMAGE_TUTO, TAILLE_MAX_IMAGE, peutModifierTutos } from '../../../../lib/tutosAtelier';

export const dynamic = 'force-dynamic';

const EXTENSIONS: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** Envoi d'une illustration de tuto dans R2. Réservé aux éditeurs des tutos. */
export async function POST(request: Request) {
  try {
    if (!peutModifierTutos(await compteCourant())) return NextResponse.json({ error: 'Réservé à l\'édition des tutos.' }, { status: 403 });
    const form = await request.formData();
    const fichier = form.get('fichier');
    if (!(fichier instanceof File)) return NextResponse.json({ error: 'Fichier manquant.' }, { status: 400 });
    const ext = EXTENSIONS[fichier.type];
    if (!ext) return NextResponse.json({ error: 'Formats acceptés : WebP, JPEG, PNG.' }, { status: 400 });
    if (fichier.size > TAILLE_MAX_IMAGE) return NextResponse.json({ error: 'Image trop lourde (3 Mo maximum).' }, { status: 413 });

    const cle = `${crypto.randomUUID()}.${ext}`;
    const { env } = await getCloudflareContext({ async: true });
    await env.REGLES.put(`tutos/${cle}`, await fichier.arrayBuffer(), { httpMetadata: { contentType: fichier.type } });
    return NextResponse.json({ url: `${PREFIXE_IMAGE_TUTO}${cle}` });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
