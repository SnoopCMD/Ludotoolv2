import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDB } from '../../../../../lib/db';
import { compteCourant } from '../../../../../lib/auth';
import { refusAnonyme } from '../../../../../lib/reunion';

/**
 * Analyse d'un compte rendu importé (texte d'un .docx, ou PDF) par Claude, qui
 * le remet au format du Bureau : une réunion, ses points (titre, intervenant,
 * notes), ses missions. Rien n'est enregistré ici : le résultat revient dans
 * l'aperçu de la page, à vérifier avant l'import.
 *
 * Clé : secret Cloudflare `ANTHROPIC_API_KEY` (`npx wrangler secret put
 * ANTHROPIC_API_KEY`), ou `.dev.vars` en local.
 */

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['titre', 'date', 'participants', 'points', 'missions', 'notes_libres', 'remarques'],
  properties: {
    titre: { type: 'string', description: 'Titre de la réunion, sans la date si elle est déjà dans le champ date.' },
    date: { type: 'string', description: 'Date de la réunion au format AAAA-MM-JJ, ou chaîne vide si introuvable.' },
    participants: { type: 'array', items: { type: 'string' }, description: 'Personnes présentes, telles que nommées.' },
    points: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titre', 'intervenant', 'notes'],
        properties: {
          titre: { type: 'string', description: 'Sujet du point, sans « par … ».' },
          intervenant: { type: 'string', description: 'Qui présente le point, ou chaîne vide.' },
          notes: { type: 'string', description: 'Tout le contenu du point, mis en forme selon les conventions.' },
        },
      },
    },
    missions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titre', 'description', 'personnes', 'echeance'],
        properties: {
          titre: { type: 'string', description: 'La tâche, courte, à l’infinitif ou au nominal.' },
          description: { type: 'string', description: 'Précisions utiles, ou chaîne vide.' },
          personnes: { type: 'array', items: { type: 'string' }, description: 'Qui s’en charge, tels que nommés.' },
          echeance: { type: 'string', description: 'Échéance au format AAAA-MM-JJ, ou chaîne vide.' },
        },
      },
    },
    notes_libres: { type: 'string', description: 'Ce qui ne relève d’aucun point (vide le plus souvent).' },
    remarques: { type: 'string', description: 'Pour la personne qui importe : ce que tu as réécrit, deviné ou laissé de côté. Court.' },
  },
} as const;

function consignes(equipe: string[], aujourdhui: string) {
  return `Tu remets en forme des comptes rendus de réunion d'une ludothèque (équipe de bibliothèque / médiathèque), pour les importer dans leur outil interne, le « Bureau ».

Format du Bureau, à respecter :
- Une réunion a un titre, une date et des présents.
- Elle est faite de points (l'ordre du jour). Chaque point a un titre (le sujet seul : « RH », pas « RH par Ariane »), un intervenant (qui présente le sujet : membre de l'équipe ou personne extérieure ; vide si on ne sait pas) et des notes.
- Les notes sont du texte brut avec ces conventions, que l'outil affiche en listes et sous-titres :
  « - » en début de ligne pour une puce (deux espaces avant pour une sous-puce) ; « 1. » pour une liste numérotée ;
  une ligne courte terminée par « : » pour un sous-titre (« Usagers : ») ; « => » pour une conclusion ou une décision mise en avant ;
  une ligne vide entre deux blocs.
- Les missions sont des tâches à faire décidées pendant la réunion, avec qui et pour quand. N'en crée que pour des tâches explicites ; laisse-les aussi dans les notes du point où elles apparaissent.

Règles :
- Garde toute l'information : chaque fait, chiffre, date, nom, décision. N'invente rien, ne résume pas.
- Réécris seulement pour structurer et clarifier : découpe en points selon les titres ou les changements de sujet, transforme les énumérations en puces, corrige les fautes évidentes. Garde le vocabulaire et le ton de l'équipe.
- Écris les dates au format AAAA-MM-JJ dans les champs date et échéance ; dans les notes, laisse-les comme écrites. Une date sans année se rapporte à l'année de la réunion.
- Membres de l'équipe (écris leurs noms exactement ainsi quand ils sont désignés, même par un surnom ou une variante) : ${equipe.join(', ')}.
- Les autres personnes (direction, partenaires, autres services) gardent leur nom tel qu'écrit.
- Aujourd'hui : ${aujourdhui}. Si le document ne donne aucune date de réunion, laisse la date vide.`;
}

export async function POST(request: Request) {
  try {
    if (!(await compteCourant())) return refusAnonyme();
    const { env } = await getCloudflareContext({ async: true });
    const apiKey = (env as unknown as Record<string, string | undefined>).ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "L'import par IA n'est pas configuré : il manque le secret ANTHROPIC_API_KEY." }, { status: 503 });
    }

    const body = await request.json() as { texte?: string; pdf?: string; nom?: string };
    if (!body.texte?.trim() && !body.pdf) return NextResponse.json({ error: 'Document vide.' }, { status: 400 });

    const db = await getDB();
    const { results } = await db.prepare('SELECT nom FROM equipe ORDER BY nom').all<{ nom: string }>();
    const equipe = results.map(r => r.nom);

    const contenu: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (body.pdf) {
      contenu.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: body.pdf } });
    }
    contenu.push({
      type: 'text',
      text: body.pdf
        ? `Voici un compte rendu de réunion en PDF${body.nom ? ` (« ${body.nom} »)` : ''}. Remets-le au format du Bureau.`
        : `Voici le texte d'un compte rendu de réunion${body.nom ? ` (« ${body.nom} »)` : ''}, extrait d'un document Word (« # » marque un titre, « - » une liste). Remets-le au format du Bureau.\n\n<document>\n${body.texte}\n</document>`,
    });

    const client = new Anthropic({ apiKey });
    // Flux : un long compte rendu produit une longue réponse ; finalMessage() rassemble le tout.
    const reponse = await client.beta.messages.stream({
      model: 'claude-opus-5-5',
      max_tokens: 32000,
      system: consignes(equipe, new Date().toISOString().slice(0, 10)),
      messages: [{ role: 'user', content: contenu }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      // En cas de refus du modèle, l'API relance d'elle-même sur un modèle de repli.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    }).finalMessage();

    if (reponse.stop_reason === 'refusal') {
      return NextResponse.json({ error: "L'analyse a été refusée pour ce document." }, { status: 422 });
    }
    if (reponse.stop_reason === 'max_tokens') {
      return NextResponse.json({ error: 'Document trop long pour une seule analyse : découpe-le en plusieurs comptes rendus.' }, { status: 422 });
    }
    const texte = reponse.content.flatMap(b => b.type === 'text' ? [b.text] : []).join('');
    return NextResponse.json(JSON.parse(texte));
  } catch (e: unknown) {
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: 'Clé API Anthropic refusée.' }, { status: 502 });
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: 'Trop de demandes : réessaie dans une minute.' }, { status: 429 });
    if (e instanceof Anthropic.BadRequestError) return NextResponse.json({ error: `Document refusé par l'analyse : ${e.message}` }, { status: 400 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `Service d'analyse indisponible (${e.status ?? 'réseau'}).` }, { status: 502 });
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 });
  }
}
