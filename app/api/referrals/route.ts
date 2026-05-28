import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurantId } from "@/lib/restaurant";

const FUNCTIONAL_ALIASES = [
  "noreply", "no-reply", "contact", "info", "admin",
  "support", "postmaster", "mailer-daemon", "abuse",
];

function hasFunctionalAlias(email: string): boolean {
  const local = email.split("@")[0].toLowerCase().trim();
  return FUNCTIONAL_ALIASES.includes(local);
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const restaurantId = getRestaurantId();

  const { data: submissions } = await supabase
    .from("referral_submissions")
    .select("id, referral_email, status, submitted_at")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .order("submitted_at", { ascending: false });

  const list = submissions ?? [];
  const validatedCount = list.filter((s) => s.status === "validated").length;

  return NextResponse.json({ submissions: list, validatedCount });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await request.json();
  const { referral_email } = body;

  if (!referral_email || typeof referral_email !== "string") {
    return NextResponse.json({ error: "Email manquant." }, { status: 400 });
  }

  const email = referral_email.trim().toLowerCase();

  // Basic format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Format d'email invalide." }, { status: 400 });
  }

  // Bloc functional aliases
  if (hasFunctionalAlias(email)) {
    return NextResponse.json(
      { error: "Cet email ne peut pas être parrainé (alias fonctionnel)." },
      { status: 400 }
    );
  }

  // Cannot refer yourself
  const { data: ownProfile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .single();

  if (ownProfile?.email?.toLowerCase() === email) {
    return NextResponse.json(
      { error: "Tu ne peux pas te parrainer toi-même." },
      { status: 400 }
    );
  }

  // Reject if email already in profiles (already a member)
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    return NextResponse.json(
      { error: "Cet ami est déjà membre du programme." },
      { status: 409 }
    );
  }

  const restaurantId = getRestaurantId();

  const { error } = await supabase.from("referral_submissions").insert({
    user_id: user.id,
    restaurant_id: restaurantId,
    referral_email: email,
    status: "pending",
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Cet email a déjà été soumis comme parrainage." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
