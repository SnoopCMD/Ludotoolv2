import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ean = searchParams.get("ean");

  if (!ean) return NextResponse.json({ nom: null });

  try {
    const reponse = await fetch(`https://www.philibertnet.com/fr/recherche?search_query=${ean}`, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    
    if (!reponse.ok) return NextResponse.json({ nom: null });
    
    const html = await reponse.text();
    const $ = cheerio.load(html);
    
    const titrePage = $("h1.h1").text().trim();
    if (titrePage) return NextResponse.json({ nom: titrePage });
    
    const titreListe = $("p.s_title_block a").first().text().trim();
    if (titreListe) return NextResponse.json({ nom: titreListe });
    
    return NextResponse.json({ nom: null });
  } catch (error) {
    return NextResponse.json({ nom: null });
  }
}