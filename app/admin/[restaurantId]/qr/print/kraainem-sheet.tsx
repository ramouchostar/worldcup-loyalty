import type { CSSProperties } from "react";

// Template QR dédié à Belchicken Kraainem (maquette Claude Design, projet
// "Redesign dashboard restaurateurs" — Templates QR Belchicken.dc.html).
// Conversion px → mm à l'échelle constante de la maquette (4px = 1mm,
// vérifiée cohérente sur les 3 formats) pour un rendu fidèle à l'impression.
// Signature Boosteats toujours dans le vert de marque fixe (indépendant de
// la couleur accent du restaurant, qui elle vient du brand kit).
const BOOSTEATS_GREEN = "#7A8F3F";
const INK = "#0A0A0A";

export type KraainemFormat = "sticker" | "flyer" | "affiche";

const mono: CSSProperties = { fontFamily: "var(--font-jetbrains-mono)" };
const display: CSSProperties = { fontFamily: "var(--font-archivo-black)" };
const body: CSSProperties = { fontFamily: "var(--font-archivo)" };

export function KraainemPrintSheet({
  fmt,
  restaurantName,
  accent,
  logo,
  qrSvg,
  urlLabel,
}: {
  fmt: KraainemFormat;
  restaurantName: string;
  accent: string;
  logo: string | null;
  qrSvg: string;
  urlLabel: string;
}) {
  if (fmt === "sticker") return <StickerSheet accent={accent} logo={logo} restaurantName={restaurantName} qrSvg={qrSvg} />;
  if (fmt === "affiche") return <AfficheSheet accent={accent} logo={logo} restaurantName={restaurantName} qrSvg={qrSvg} />;
  return <FlyerSheet accent={accent} logo={logo} restaurantName={restaurantName} qrSvg={qrSvg} urlLabel={urlLabel} />;
}

function Logo({ logo, restaurantName, height }: { logo: string | null; restaurantName: string; height: string }) {
  if (!logo) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={logo} alt={restaurantName} style={{ height, width: "auto", display: "block" }} />;
}

function Qr({ qrSvg, size }: { qrSvg: string; size: string }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="[&>svg]:w-full [&>svg]:h-full [&>svg]:block"
      dangerouslySetInnerHTML={{ __html: qrSvg }}
    />
  );
}

function FlyerSheet({
  accent,
  logo,
  restaurantName,
  qrSvg,
  urlLabel,
}: {
  accent: string;
  logo: string | null;
  restaurantName: string;
  qrSvg: string;
  urlLabel: string;
}) {
  const steps = ["Scanne le code", "Crée ton compte en 20 s", "Cumule, puis récupère"];
  return (
    <div
      className="print-sheet"
      style={{ width: "148mm", height: "210mm", background: "#fff", display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      <div style={{ height: "3.5mm", background: accent, flex: "0 0 auto" }} />

      <div style={{ padding: "10mm 11mm 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Logo logo={logo} restaurantName={restaurantName} height="24mm" />
        <p style={{ ...mono, fontSize: "2.5mm", letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8A82", margin: 0 }}>KRAAINEM</p>
      </div>

      <div style={{ padding: "9mm 11mm 0" }}>
        <h2 style={{ ...display, fontSize: "13mm", lineHeight: 0.98, letterSpacing: "-0.04em", color: INK, margin: 0 }}>
          Scanne<br />et gagne<br /><span style={{ color: accent }}>des cadeaux</span>
        </h2>
        <p style={{ ...body, fontSize: "4.25mm", lineHeight: 1.5, color: "#5C5C56", margin: "5mm 0 0", maxWidth: "100mm" }}>
          Gagne des points à chaque commande. Ton burger offert arrive plus vite que tu ne crois.
        </p>
      </div>

      <div style={{ marginTop: "auto", background: "#FAFAF7", borderTop: "0.25mm solid #E4E4DC", padding: "9mm 11mm 7.5mm", display: "flex", flexDirection: "column", gap: "6mm" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7mm" }}>
          <div style={{ width: "47.5mm", height: "47.5mm", background: "#fff", border: `0.75mm solid ${INK}`, padding: "3mm", boxSizing: "border-box", flex: "0 0 auto" }}>
            <Qr qrSvg={qrSvg} size="100%" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "3.5mm" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2.25mm" }}>
              {steps.map((s, i) => (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: "2.5mm" }}>
                  <span style={{ ...mono, fontSize: "3mm", color: accent, fontWeight: 700 }}>{String(i + 1).padStart(2, "0")}</span>
                  <span style={{ fontSize: "3.75mm", color: INK, fontWeight: 600 }}>{s}</span>
                </div>
              ))}
            </div>
            <p style={{ ...body, fontSize: "3.25mm", lineHeight: 1.45, color: "#5C5C56", margin: 0, borderTop: "0.25mm solid #E4E4DC", paddingTop: "3mm" }}>
              Scan en win cadeaus.<br />Spaar punten bij elke bestelling.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "0.25mm solid #E4E4DC", paddingTop: "3.5mm" }}>
          <span style={{ ...mono, fontSize: "2.5mm", letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8A82" }}>{urlLabel}</span>
          <span style={{ ...mono, fontSize: "1.75mm", letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8A82" }}>
            Propulsé par <span style={{ color: BOOSTEATS_GREEN }}>BOOSTEATS.TECH</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function StickerSheet({
  accent,
  logo,
  restaurantName,
  qrSvg,
}: {
  accent: string;
  logo: string | null;
  restaurantName: string;
  qrSvg: string;
}) {
  return (
    <div
      className="print-sheet"
      style={{
        width: "80mm", height: "80mm", background: "#fff", padding: "4.5mm", boxSizing: "border-box",
        display: "flex", flexDirection: "column", gap: "3mm", border: `1.5mm solid ${accent}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ background: "#fff", padding: "1.25mm 1.75mm", display: "flex", alignItems: "center" }}>
          <Logo logo={logo} restaurantName={restaurantName} height="11mm" />
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "3.5mm", flex: 1 }}>
        <div style={{ width: "33mm", height: "33mm", background: "#fff", padding: "2.25mm", boxSizing: "border-box", flex: "0 0 auto" }}>
          <Qr qrSvg={qrSvg} size="100%" />
        </div>
        <div>
          <p style={{ ...display, fontSize: "5.75mm", lineHeight: 0.98, letterSpacing: "-0.03em", color: INK, margin: 0 }}>
            Scanne<br />et gagne<br /><span style={{ color: accent }}>des cadeaux</span>
          </p>
          <p style={{ ...mono, fontSize: "2.25mm", letterSpacing: "0.06em", color: "#8A8A82", margin: "2.25mm 0 0", lineHeight: 1.4 }}>
            Scan en win<br />cadeaus
          </p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "0.25mm solid #2A2A2A", paddingTop: "2.25mm" }}>
        <span style={{ ...mono, fontSize: "2.125mm", letterSpacing: "0.12em", textTransform: "uppercase", color: "#6E6E68" }}>
          DES POINTS À CHAQUE COMMANDE
        </span>
        <span style={{ ...mono, fontSize: "1.25mm", letterSpacing: "0.12em", textTransform: "uppercase", color: BOOSTEATS_GREEN }}>
          BOOSTEATS.TECH
        </span>
      </div>
    </div>
  );
}

function AfficheSheet({
  accent,
  logo,
  restaurantName,
  qrSvg,
}: {
  accent: string;
  logo: string | null;
  restaurantName: string;
  qrSvg: string;
}) {
  const steps = ["Scanne le code", "Crée ton compte en 20 s", "Cumule, puis récupère"];
  return (
    <div className="print-sheet" style={{ width: "297mm", height: "420mm", background: "#fff", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <div style={{ padding: "22mm 22mm 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7mm" }}>
          <div style={{ background: "#fff", padding: "5mm 6mm", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Logo logo={logo} restaurantName={restaurantName} height="38mm" />
          </div>
          <p style={{ ...mono, fontSize: "4.75mm", letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8A82", margin: 0 }}>KRAAINEM</p>
        </div>
      </div>

      <div style={{ padding: "27.5mm 22mm 0" }}>
        <h2 style={{ ...display, fontSize: "33mm", lineHeight: 0.94, letterSpacing: "-0.045em", color: INK, margin: 0 }}>
          Scanne<br />et gagne<br /><span style={{ color: accent }}>des cadeaux</span>
        </h2>
        <p style={{ ...body, fontSize: "9mm", lineHeight: 1.45, color: "#B8B8B0", margin: "11mm 0 0", maxWidth: "190mm" }}>
          Gagne des points à chaque commande.<br /><span style={{ color: "#6E6E68" }}>Scan en win cadeaus. Spaar punten bij elke bestelling.</span>
        </p>
      </div>

      <div style={{ marginTop: "auto", background: "#000", padding: "18mm 22mm 15mm", display: "flex", alignItems: "center", gap: "16mm" }}>
        <div style={{ width: "105mm", height: "105mm", background: "#fff", border: `1.5mm solid ${INK}`, padding: "6.5mm", boxSizing: "border-box", flex: "0 0 auto" }}>
          <Qr qrSvg={qrSvg} size="100%" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6.5mm" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4.5mm" }}>
            {steps.map((s, i) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: "5mm" }}>
                <span style={{ ...mono, fontSize: "6.5mm", color: accent, fontWeight: 700 }}>{String(i + 1).padStart(2, "0")}</span>
                <span style={{ fontSize: "8.5mm", color: "#fff", fontWeight: 600 }}>{s}</span>
              </div>
            ))}
          </div>
          <p style={{ ...mono, fontSize: "4mm", letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8A82", margin: 0, borderTop: "0.5mm solid #3D3D3D", paddingTop: "5.5mm" }}>
            Propulsé par <span style={{ color: BOOSTEATS_GREEN }}>BOOSTEATS.TECH</span>
          </p>
        </div>
      </div>
    </div>
  );
}
