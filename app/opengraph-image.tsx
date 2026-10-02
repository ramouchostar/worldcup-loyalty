import { ImageResponse } from "next/og";
import { LOGO_HORIZONTAL_LIGHT_SVG, LOGO_HORIZONTAL_RATIO } from "@/lib/brand/logo-svg";

// Image de partage (WhatsApp, réseaux sociaux) — remplace l'ancienne
// icône SVG 512px utilisée jusqu'ici comme og:image (illisible en aperçu de
// lien, donnait l'impression d'un projet sans identité). Générée au format
// standard 1200x630, pas de fichier statique à maintenir.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LOGO_HEIGHT = 150;
const LOGO_SRC = `data:image/svg+xml;base64,${Buffer.from(LOGO_HORIZONTAL_LIGHT_SVG).toString("base64")}`;

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
          background: "#0C1509",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={LOGO_SRC}
          width={Math.round(LOGO_HEIGHT * LOGO_HORIZONTAL_RATIO)}
          height={LOGO_HEIGHT}
          alt="Boosteats"
        />
        <div style={{ display: "flex", marginTop: 40, fontSize: 32, color: "#A6AE95" }}>
          Fidélité communautaire pour restaurants indépendants
        </div>
      </div>
    ),
    { ...size }
  );
}
