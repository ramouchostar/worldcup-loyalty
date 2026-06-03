import { type NextRequest, NextResponse } from "next/server";

// Capture le code de parrainage dans un cookie httpOnly
// puis redirige vers /signup pour que l'attribution se fasse à l'inscription
export function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get("ref");
  const response = NextResponse.redirect(new URL("/signup", request.url));

  if (ref && /^[A-Z0-9]{6}$/.test(ref)) {
    response.cookies.set("belchicken_ref", ref, {
      httpOnly: true,
      maxAge: 60 * 60 * 24, // 24h — expire si l'ami ne s'inscrit pas
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  return response;
}
