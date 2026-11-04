/**
 * Point d'entrée du Worker : celui d'OpenNext (toute l'application Next),
 * plus le direct de la messagerie.
 *
 * Les WebSockets ne passent pas par Next : `GET /api/chat/ws` est pris ici,
 * le compte est vérifié sur le cookie de session (même table que
 * `lib/auth.ts`), puis la connexion est confiée au Durable Object.
 */
// `.open-next/worker.js` est généré au build (opennextjs-cloudflare build) : absent
// avant, présent après, d'où @ts-ignore plutôt que @ts-expect-error.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { default as handler } from "./.open-next/worker.js";
import { MessagerieDO } from "./worker/MessagerieDO";

const COOKIE_SESSION = "ludotool_session";
const CHEMIN_WS = "/api/chat/ws";

function lireCookie(request: Request, nom: string): string | null {
  const brut = request.headers.get("Cookie") ?? "";
  for (const morceau of brut.split(";")) {
    const [cle, ...reste] = morceau.trim().split("=");
    if (cle === nom) return decodeURIComponent(reste.join("="));
  }
  return null;
}

async function ouvrirDirect(request: Request, env: CloudflareEnv): Promise<Response> {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("WebSocket attendu", { status: 426 });
  }
  // Une page d'un autre site ne doit pas pouvoir ouvrir le direct avec nos cookies.
  const origine = request.headers.get("Origin");
  if (origine && new URL(origine).host !== new URL(request.url).host) {
    return new Response("Origine refusée", { status: 403 });
  }
  const token = lireCookie(request, COOKIE_SESSION);
  if (!token) return new Response("Non connecté", { status: 401 });
  const session = await env.DB.prepare(
    "SELECT utilisateur_id FROM utilisateur_sessions WHERE token = ? AND expire_le > datetime('now')"
  ).bind(token).first<{ utilisateur_id: string }>();
  if (!session) return new Response("Session expirée", { status: 401 });

  const entetes = new Headers(request.headers);
  entetes.set("X-Utilisateur-Id", session.utilisateur_id);
  const stub = env.CHAT.get(env.CHAT.idFromName("equipe"));
  return stub.fetch(new Request(request.url, { headers: entetes }));
}

export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === CHEMIN_WS) return ouvrirDirect(request, env);
    return handler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<CloudflareEnv>;

export { MessagerieDO };
