import { NextRequest, NextResponse } from "next/server";

const PLATFORM_IDS: Record<string, number> = {
  PS5:    167,
  Switch: 130,
  PC:     6,
};

const PLATFORM_TO_CONSOLE: Record<number, string> = {
  167: "PS5",
  130: "Switch",
  6:   "PC",
};

const PEGI_VALUES: Record<number, number> = {
  1: 3, 2: 7, 3: 12, 4: 16, 5: 18,
};

let cachedToken: { access_token: string; expires_at: number } | null = null;

async function getTwitchToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expires_at > now + 60_000) {
    return cachedToken.access_token;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET manquants");

  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error("Échec authentification Twitch");
  const data = await res.json();

  cachedToken = {
    access_token: data.access_token,
    expires_at: now + data.expires_in * 1000,
  };
  return cachedToken.access_token;
}

async function igdbFetch(endpoint: string, body: string, token: string): Promise<any[]> {
  const clientId = process.env.TWITCH_CLIENT_ID!;
  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body,
  });
  if (!res.ok) return [];
  return res.json();
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim();
  const platform = req.nextUrl.searchParams.get("platform") ?? "";

  if (!query) return NextResponse.json({ error: "Paramètre q manquant" }, { status: 400 });

  try {
    const token = await getTwitchToken();

    const platformFilter = platform && PLATFORM_IDS[platform]
      ? `& platforms = (${PLATFORM_IDS[platform]})`
      : `& platforms = (${Object.values(PLATFORM_IDS).join(",")})`;

    const gamesRaw = await igdbFetch("games", `
      search "${query}";
      fields id, name, summary, first_release_date, cover, platforms, genres, involved_companies, age_ratings, category, game_modes, multiplayer_modes;
      where ${platformFilter.replace("& ", "")};
      limit 20;
    `, token);
    // category 0 = main game, 8 = remake, 9 = remaster, 10 = expanded, 11 = port
    const games = gamesRaw
      .filter(g => [0, 8, 9, 10, 11].includes(g.category ?? 0))
      .slice(0, 8);

    if (!games.length) return NextResponse.json([]);

    // Covers
    const coverIds = games.map(g => g.cover).filter(Boolean);
    const covers = coverIds.length
      ? await igdbFetch("covers", `fields id, image_id; where id = (${coverIds.join(",")});`, token)
      : [];
    const coverMap: Record<number, string> = {};
    for (const c of covers) {
      if (c.image_id) coverMap[c.id] = `https://images.igdb.com/igdb/image/upload/t_cover_big/${c.image_id}.jpg`;
    }

    // Genres
    const genreIds = [...new Set(games.flatMap(g => g.genres ?? []))];
    const genresData = genreIds.length
      ? await igdbFetch("genres", `fields id, name; where id = (${genreIds.join(",")});`, token)
      : [];
    const genreMap: Record<number, string> = {};
    for (const g of genresData) genreMap[g.id] = g.name;

    // Éditeur
    const icIds = [...new Set(games.flatMap(g => g.involved_companies ?? []))];
    const ics = icIds.length
      ? await igdbFetch("involved_companies", `fields id, company, publisher; where id = (${icIds.join(",")});`, token)
      : [];
    const publisherIds = ics.filter(ic => ic.publisher).map(ic => ic.company);
    const companies = publisherIds.length
      ? await igdbFetch("companies", `fields id, name; where id = (${publisherIds.join(",")});`, token)
      : [];
    const companyMap: Record<number, string> = {};
    for (const c of companies) companyMap[c.id] = c.name;
    const icToPublisher: Record<number, string> = {};
    for (const ic of ics) if (ic.publisher && companyMap[ic.company]) icToPublisher[ic.id] = companyMap[ic.company];

    // Multiplayer modes → nb_joueurs
    const gameIds = games.map(g => g.id);
    const multimodes = gameIds.length
      ? await igdbFetch("multiplayer_modes", `fields game, offlinemax, offlinecoopmax, onlinemax, onlinecoopmax; where game = (${gameIds.join(",")});`, token)
      : [];
    const multiMap: Record<number, any> = {};
    for (const mm of multimodes) multiMap[mm.game] = mm;

    // PEGI — category 2 = PEGI (1=ESRB), rating 1→3, 2→7, 3→12, 4→16, 5→18
    const ageRatingIds = [...new Set(games.flatMap(g => g.age_ratings ?? []))];
    const ageRatings = ageRatingIds.length
      ? await igdbFetch("age_ratings", `fields id, category, rating; where id = (${ageRatingIds.join(",")});`, token)
      : [];
    const pegiById: Record<number, number> = {};
    for (const ar of ageRatings) {
      if (ar.category === 2 && PEGI_VALUES[ar.rating]) pegiById[ar.id] = PEGI_VALUES[ar.rating];
    }

    const results = games.map(g => {
      const console_detected = (g.platforms ?? [])
        .map((pid: number) => PLATFORM_TO_CONSOLE[pid])
        .filter(Boolean)[0] ?? null;

      const editeur = (g.involved_companies ?? [])
        .map((icid: number) => icToPublisher[icid])
        .filter(Boolean)[0] ?? null;

      const annee = g.first_release_date
        ? new Date(g.first_release_date * 1000).getFullYear()
        : null;

      const genres = (g.genres ?? []).map((gid: number) => genreMap[gid]).filter(Boolean);

      // nb_joueurs : local uniquement, plafonné selon les contraintes physiques
      // Switch → max 4 en local | PS5 / PC → max 2 en local
      const localCap = console_detected === "Switch" ? 4 : 2;
      let nb_joueurs: string | null = null;
      const mm = multiMap[g.id];
      if (mm) {
        const localMax = Math.min(
          Math.max(mm.offlinemax ?? 0, mm.offlinecoopmax ?? 0),
          localCap
        );
        nb_joueurs = localMax > 1 ? `1-${localMax}` : "1";
      } else {
        const modes: number[] = g.game_modes ?? [];
        if (modes.length > 0) {
          const isLocalMulti = modes.some(m => [2, 3, 4].includes(m));
          nb_joueurs = isLocalMulti ? `1-${localCap}` : "1";
        }
      }

      return {
        external_id: String(g.id),
        igdb_id: g.id,
        titre: g.name,
        description: g.summary ?? null,
        image_url: g.cover ? coverMap[g.cover] ?? null : null,
        annee,
        editeur,
        genre: genres[0] ?? null,
        pegi: (g.age_ratings ?? []).map((id: number) => pegiById[id]).find((p: number | undefined) => p != null) ?? null,
        nb_joueurs,
        console: console_detected,
      };
    });

    return NextResponse.json(results);
  } catch (err: any) {
    console.error("[IGDB]", err?.message);
    return NextResponse.json({ error: err?.message ?? "Erreur IGDB" }, { status: 502 });
  }
}
