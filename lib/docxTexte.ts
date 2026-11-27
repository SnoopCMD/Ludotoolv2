/**
 * Texte d'un document Word (.docx), lu dans le navigateur, sans dépendance :
 * un .docx est une archive zip dont `word/document.xml` porte le contenu.
 *
 * La structure utile à l'analyse est gardée en texte : les titres (styles
 * « Titre 1 », « Heading 2 »…) deviennent des lignes « # … », les listes des
 * lignes « - … », les tableaux des lignes « cellule | cellule ».
 */

/** Contenu décompressé d'un fichier de l'archive zip, ou null s'il n'y est pas. */
async function lireDansZip(zip: ArrayBuffer, chemin: string): Promise<Uint8Array | null> {
  const v = new DataView(zip);
  // Fin du répertoire central : signature 0x06054b50, cherchée depuis la fin (commentaire éventuel).
  let fin = -1;
  for (let i = zip.byteLength - 22; i >= Math.max(0, zip.byteLength - 66000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error("Ce fichier n'est pas un document Word valide.");
  const nb = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const decodeur = new TextDecoder();
  for (let k = 0; k < nb; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const methode = v.getUint16(p + 10, true);
    const tailleComp = v.getUint32(p + 20, true);
    const lgNom = v.getUint16(p + 28, true), lgExtra = v.getUint16(p + 30, true), lgComm = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nom = decodeur.decode(new Uint8Array(zip, p + 46, lgNom));
    p += 46 + lgNom + lgExtra + lgComm;
    if (nom !== chemin) continue;
    const debut = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const donnees = new Uint8Array(zip, debut, tailleComp);
    if (methode === 0) return donnees;
    if (methode !== 8) throw new Error("Compression du document non prise en charge.");
    const flux = new Blob([donnees]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(flux).arrayBuffer());
  }
  return null;
}

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** Texte d'un paragraphe Word : ses morceaux de texte, tabulations et sauts de ligne. */
function texteParagraphe(p: Element) {
  let t = "";
  p.querySelectorAll("*").forEach(n => {
    if (n.namespaceURI !== W) return;
    if (n.localName === "t") t += n.textContent ?? "";
    else if (n.localName === "tab") t += " ";
    else if (n.localName === "br" || n.localName === "cr") t += "\n";
  });
  return t.replace(/[  ]+/g, " ").trim();
}

export async function texteDocx(fichier: File): Promise<string> {
  const xml = await lireDansZip(await fichier.arrayBuffer(), "word/document.xml");
  if (!xml) throw new Error("Ce fichier n'est pas un document Word valide.");
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(xml), "application/xml");
  const corps = doc.getElementsByTagNameNS(W, "body")[0];
  if (!corps) return "";
  const lignes: string[] = [];
  for (const bloc of Array.from(corps.children)) {
    if (bloc.localName === "p") {
      const texte = texteParagraphe(bloc);
      if (!texte) { lignes.push(""); continue; }
      const style = bloc.getElementsByTagNameNS(W, "pStyle")[0]?.getAttributeNS(W, "val") ?? "";
      const niveauTitre = style.match(/(?:heading|titre)\s*(\d)/i);
      if (niveauTitre) lignes.push(`${"#".repeat(Math.min(3, +niveauTitre[1]))} ${texte}`);
      else if (/^title$/i.test(style)) lignes.push(`# ${texte}`);
      // Liste : numérotation posée sur le paragraphe, ou portée par son style (« List Bullet », « Paragraphe de liste »…).
      else if (bloc.getElementsByTagNameNS(W, "numPr").length || /list|liste|puce|bullet/i.test(style)) {
        const niveau = +(bloc.getElementsByTagNameNS(W, "ilvl")[0]?.getAttributeNS(W, "val") ?? 0);
        lignes.push(`${"  ".repeat(niveau)}- ${texte}`);
      } else lignes.push(texte);
    } else if (bloc.localName === "tbl") {
      for (const ligne of Array.from(bloc.getElementsByTagNameNS(W, "tr"))) {
        const cellules = Array.from(ligne.getElementsByTagNameNS(W, "tc"))
          .map(c => Array.from(c.getElementsByTagNameNS(W, "p")).map(texteParagraphe).filter(Boolean).join(" / "));
        if (cellules.some(Boolean)) lignes.push(cellules.join(" | "));
      }
      lignes.push("");
    }
  }
  return lignes.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
