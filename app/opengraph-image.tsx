import { ImageResponse } from "next/og";

// Image de partage (WhatsApp, réseaux sociaux) — remplace l'ancienne
// icône SVG 512px utilisée jusqu'ici comme og:image (illisible en aperçu de
// lien, donnait l'impression d'un projet sans identité). Générée au format
// standard 1200x630, pas de fichier statique à maintenir.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0A0A0A",
        }}
      >
        <div style={{ display: "flex", fontSize: 96, fontWeight: 700, color: "#fff" }}>
          BOOST
          <span style={{ color: "#A2C523" }}>EATS</span>
        </div>
        <div style={{ display: "flex", marginTop: 24, fontSize: 32, color: "#B8B8B0" }}>
          Fidélité communautaire pour restaurants indépendants
        </div>
      </div>
    ),
    { ...size }
  );
}
