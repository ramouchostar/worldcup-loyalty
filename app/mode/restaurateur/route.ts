import { NextResponse } from "next/server";
import { VIEW_MODE_COOKIE } from "@/lib/view-mode";

// Retour côté restaurateur : on efface le mode client, /membres et /login
// recommencent à envoyer vers la console. Le middleware renvoie /admin vers
// /login si la session a disparu.
export async function POST(req: Request) {
  const res = NextResponse.redirect(`${new URL(req.url).origin}/admin`, { status: 303 });
  res.cookies.delete(VIEW_MODE_COOKIE);
  return res;
}
