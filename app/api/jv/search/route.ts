import { NextRequest, NextResponse } from "next/server";
import { chercherBoutiques } from "../../../../lib/boutiquesJv";

// ── Handler principal ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const platform = req.nextUrl.searchParams.get("platform") ?? "";

  if (!q) return NextResponse.json({ error: "Paramètre q manquant" }, { status: 400 });

  try {
    const results = await chercherBoutiques(q, platform);

    return NextResponse.json(results);
  } catch (err: any) {
    console.error("[jv/search]", err?.message);
    return NextResponse.json({ error: err?.message ?? "Erreur serveur" }, { status: 502 });
  }
}
