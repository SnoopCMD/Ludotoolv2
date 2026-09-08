import { NextResponse } from "next/server";
import { chercherSteam } from "../../../../lib/steam";

export type { FicheSteam } from "../../../../lib/steam";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const noms = (searchParams.get("noms") ?? "")
    .split("|")
    .map(n => n.trim())
    .filter(Boolean)
    .slice(0, 30);

  if (noms.length === 0) {
    return NextResponse.json({ error: "Paramètre 'noms' requis" }, { status: 400 });
  }

  const fiches = await Promise.all(noms.map(chercherSteam));
  return NextResponse.json({ fiches });
}
