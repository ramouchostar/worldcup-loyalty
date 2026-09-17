import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ size: string }> }
) {
  const { size: sizeParam } = await params;
  const size = sizeParam === "512" ? 512 : 192;
  const radius = Math.round(size * 0.16);

  const artRes = await fetch(new URL("/icons/icon-art.png", request.url));
  const artBuffer = await artRes.arrayBuffer();
  const artDataUri = `data:image/png;base64,${Buffer.from(artBuffer).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          overflow: "hidden",
          borderRadius: radius,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artDataUri} width={size} height={size} alt="" />
      </div>
    ),
    { width: size, height: size }
  );
}
