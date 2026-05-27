import { NextResponse } from "next/server";

const DOOFINDER_URL = "https://eu1-search.doofinder.com/5/search";
const DOOFINDER_HASHID = "b220561599a93dfc2d82f89bf6223e54";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ean = searchParams.get("ean");

  if (!ean) return NextResponse.json({ nom: null });

  try {
    const response = await fetch(
      `${DOOFINDER_URL}?hashid=${DOOFINDER_HASHID}&query=${encodeURIComponent(ean)}&rpp=1`,
      {
        headers: {
          "Origin": "https://www.philibertnet.com",
          "User-Agent": "Mozilla/5.0",
        }
      }
    );

    if (!response.ok) return NextResponse.json({ nom: null });

    const data = await response.json() as { results?: Array<{ ean13?: string; title?: string }> };
    const result = data.results?.[0];

    if (!result) return NextResponse.json({ nom: null });

    // Vérifier que l'EAN correspond exactement pour éviter les faux positifs
    if (result.ean13 !== ean) return NextResponse.json({ nom: null });

    return NextResponse.json({ nom: result.title ?? null });
  } catch {
    return NextResponse.json({ nom: null });
  }
}
