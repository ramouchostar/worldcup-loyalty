import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { buildDuplicateKey, validateOrderDate, validateAmount } from "@/lib/orders";
import { getRestaurantId } from "@/lib/restaurant";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = await request.json();
  const { order_date, order_time, amount } = body;

  // Validations côté serveur
  if (!order_date || !order_time || amount === undefined) {
    return NextResponse.json({ error: "Champs manquants." }, { status: 400 });
  }

  const dateError = validateOrderDate(order_date);
  if (dateError) return NextResponse.json({ error: dateError }, { status: 400 });

  const amountError = validateAmount(amount);
  if (amountError) return NextResponse.json({ error: amountError }, { status: 400 });

  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timeRegex.test(order_time.substring(0, 5))) {
    return NextResponse.json({ error: "Format d'heure invalide (HH:MM)." }, { status: 400 });
  }

  // Vérifier que l'utilisateur a une équipe
  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", user.id)
    .single();

  if (!profile?.team_id) {
    return NextResponse.json({ error: "Tu dois choisir une équipe avant de soumettre une commande." }, { status: 400 });
  }

  // Construire le duplicate_key côté serveur uniquement
  const parsedAmount = parseFloat(Number(amount).toFixed(2));
  const duplicate_key = buildDuplicateKey(order_date, order_time, parsedAmount);

  const { error } = await supabase.from("orders").insert({
    user_id: user.id,
    team_id: profile.team_id,
    amount: parsedAmount,
    order_date,
    order_time: order_time.substring(0, 5),
    duplicate_key,
    status: "pending",
    restaurant_id: getRestaurantId(),
  });

  if (error) {
    // Code 23505 = violation contrainte UNIQUE (doublon)
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Cette commande a déjà été soumise (même date, heure et montant)." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Erreur serveur. Réessaie." }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", user.id)
    .order("submitted_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  return NextResponse.json(data);
}
