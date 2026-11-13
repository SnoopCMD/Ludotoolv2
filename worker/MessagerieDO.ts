import { DurableObject } from "cloudflare:workers";
import { CONVERSATION_GENERALE, VOLANTES_FENETRE_MS, VOLANTES_MAX, emojiValide, mediaGifValide, mediaStickerValide, type EnvoiDirect, type VolanteChat } from "../lib/chat";

/** Un GIF ou un sticker volant pèse plus lourd qu'une émote dans le garde-fou anti-rafale. */
const POIDS_GIF = 3;

/**
 * Le direct de la messagerie : un seul Durable Object pour toute l'équipe
 * (`idFromName("equipe")`), qui tient les WebSockets ouverts et leur relaie
 * les événements.
 *
 * Il ne stocke rien : D1 reste la source de vérité. Les routes API écrivent
 * en base, puis appellent `diffuser()` ; un poste qui a raté quelque chose
 * (coupure, veille) rattrape par HTTP grâce au curseur des messages.
 *
 * API d'hibernation : les sockets restent ouverts sans que l'objet tourne
 * (pas de facturation au temps d'attente), et le « ping » de maintien en vie
 * reçoit son « pong » sans même le réveiller.
 *
 * Chaque socket porte en étiquette l'id du compte : `getWebSockets(id)`
 * retrouve tous les onglets ouverts d'une personne.
 */
export class MessagerieDO extends DurableObject<CloudflareEnv> {
  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  /** Ouverture d'un socket. Le compte a été vérifié par `worker.ts`. */
  async fetch(request: Request): Promise<Response> {
    const utilisateur = request.headers.get("X-Utilisateur-Id");
    if (!utilisateur) return new Response("Non connecté", { status: 401 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket attendu", { status: 426 });
    }
    const paire = new WebSocketPair();
    const [client, serveur] = Object.values(paire);
    this.ctx.acceptWebSocket(serveur, [utilisateur]);
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Envoie un événement aux comptes listés (tous leurs onglets), ou à tout le
   * monde avec `null`. Appelé en RPC par les routes API.
   */
  async diffuser(evenement: unknown, destinataires: string[] | null): Promise<number> {
    const donnees = JSON.stringify(evenement);
    const sockets = destinataires
      ? [...new Set(destinataires)].flatMap(id => this.ctx.getWebSockets(id))
      : this.ctx.getWebSockets();
    let envoyes = 0;
    for (const ws of sockets) {
      try { ws.send(donnees); envoyes++; } catch { /* socket en train de fermer */ }
    }
    return envoyes;
  }

  /** Horodatages des dernières volantes par compte (garde-fou anti-rafale). */
  private rafales = new Map<string, number[]>();

  /**
   * Messages venus des postes (hors « ping », traité sans réveil). Seules les
   * réactions volantes passent par ici : éphémères, elles ne touchent pas la
   * base. L'auteur est l'étiquette du socket, jamais ce que dit le message.
   */
  async webSocketMessage(ws: WebSocket, donnees: string | ArrayBuffer): Promise<void> {
    if (typeof donnees !== "string" || donnees.length > 2000) return;
    let envoi: EnvoiDirect;
    try { envoi = JSON.parse(donnees); } catch { return; }
    if (envoi?.type !== "volante" || typeof envoi.cle !== "string" || envoi.cle.length > 64) return;
    // Une émote, un GIF hébergé par GIPHY ou un sticker de l'équipe : un seul.
    const gif = envoi.gif != null ? mediaGifValide(envoi.gif) : null;
    const sticker = envoi.sticker != null ? mediaStickerValide(envoi.sticker) : null;
    const emoji = envoi.emoji != null && emojiValide(envoi.emoji) ? envoi.emoji : null;
    if ([gif, sticker, emoji].filter(Boolean).length !== 1) return;
    const auteur = this.ctx.getTags(ws)[0];
    if (!auteur) return;

    // Réservées à la conversation générale (toute l'équipe) : pas de volantes
    // dans les fils privés.
    if (envoi.conversation_id !== CONVERSATION_GENERALE) return;

    // Au plus VOLANTES_MAX par fenêtre : au-delà, on ignore sans rien dire.
    const maintenant = Date.now();
    const recentes = (this.rafales.get(auteur) ?? []).filter(t => maintenant - t < VOLANTES_FENETRE_MS);
    const poids = gif || sticker ? POIDS_GIF : 1;
    if (recentes.length + poids > VOLANTES_MAX) return;
    for (let i = 0; i < poids; i++) recentes.push(maintenant);
    this.rafales.set(auteur, recentes);

    const evenement: VolanteChat = {
      type: "volante", conversation_id: envoi.conversation_id, auteur_id: auteur, cle: envoi.cle,
      ...(gif ? { gif } : sticker ? { sticker } : { emoji: emoji! }),
    };
    await this.diffuser(evenement, null);
  }

  async webSocketClose(ws: WebSocket, code: number, raison: string): Promise<void> {
    // 1005/1006 ne peuvent pas être renvoyés tels quels.
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, raison); } catch { /* déjà fermé */ }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try { ws.close(1011, "erreur"); } catch { /* déjà fermé */ }
  }
}
