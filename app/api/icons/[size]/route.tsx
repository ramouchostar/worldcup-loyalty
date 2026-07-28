import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ size: string }> }
) {
  const { size: sizeParam } = await params;
  const size = sizeParam === "512" ? 512 : 192;
  const radius = Math.round(size * 0.16);
  const fontSize = Math.round(size * 0.5);
  const labelSize = Math.round(size * 0.11);

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
          backgroundColor: "#0C1509",
          borderRadius: radius,
        }}
      >
        <div
          style={{
            fontSize,
            lineHeight: 1,
            color: "#6B7C3F",
            fontFamily: "serif",
            fontWeight: 900,
          }}
        >
          B
        </div>
        <div
          style={{
            marginTop: Math.round(size * 0.04),
            fontSize: labelSize,
            fontWeight: 900,
            color: "#EFF1E4",
            fontFamily: "sans-serif",
            letterSpacing: Math.round(size * 0.008),
          }}
        >
          BOOSTEATS
        </div>
      </div>
    ),
    { width: size, height: size }
  );
}
