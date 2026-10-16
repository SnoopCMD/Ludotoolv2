import { NextRequest, NextResponse } from "next/server";
import { chercherIgdb } from "../../../../lib/igdb";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim();
  const platform = req.nextUrl.searchParams.get("platform") ?? "";

  if (!query) return NextResponse.json({ error: "Paramètre q manquant" }, { status: 400 });

  try {
    return NextResponse.json(await chercherIgdb(query, platform));
  } catch (err: any) {
    console.error("[IGDB]", err?.message);
    return NextResponse.json({ error: err?.message ?? "Erreur IGDB" }, { status: 502 });
  }
}
