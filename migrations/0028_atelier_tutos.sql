-- Atelier : tutos des étapes de préparation, modifiables depuis l'atelier.
--
-- Une ligne par étape (identifiant de lib/etapesAtelier.ts). `gestes` est un
-- tableau JSON de { titre, texte, image } dans l'ordre où l'on fait les gestes.
-- Les images ajoutées depuis l'atelier sont dans R2 (bucket REGLES, préfixe
-- tutos/) ; voir lib/tutosAtelier.ts.

CREATE TABLE IF NOT EXISTS atelier_tutos (
  etape_id    TEXT PRIMARY KEY,
  gestes      TEXT NOT NULL DEFAULT '[]',
  modifie_le  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  modifie_par TEXT
);

-- Le tuto de l'étape 1, jusqu'ici écrit dans le code (illustrations dans public/tutos).
INSERT OR IGNORE INTO atelier_tutos (etape_id, gestes) VALUES ('etape_plastifier', json('[
  {"titre": "Plastifier le haut de la boîte", "texte": "Recouvrir le couvercle de film plastique.", "image": "/tutos/etape1-1-plastifier.webp"},
  {"titre": "Coller le code-barre", "texte": "En haut de la tranche gauche de la boîte.", "image": "/tutos/etape1-2-code-barre.webp"},
  {"titre": "Coller la puce RFID", "texte": "Au fond de la boîte, à l''intérieur.", "image": "/tutos/etape1-3-puce-rfid.webp"}
]'));
