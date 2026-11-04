import { DurableObject } from "cloudflare:workers";

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

  /**
   * Messages venus des postes. Rien pour l'instant hors « ping » (traité sans
   * réveil). C'est ici que passeront les événements éphémères (réactions qui
   * défilent, « est en train d'écrire ») : l'étiquette du socket donne
   * l'auteur, à vérifier contre les membres de la conversation avant relais.
   */
  async webSocketMessage(): Promise<void> {}

  async webSocketClose(ws: WebSocket, code: number, raison: string): Promise<void> {
    // 1005/1006 ne peuvent pas être renvoyés tels quels.
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, raison); } catch { /* déjà fermé */ }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try { ws.close(1011, "erreur"); } catch { /* déjà fermé */ }
  }
}
