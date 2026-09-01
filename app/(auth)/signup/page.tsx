"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { queueEvent } from "@/lib/analytics-pending";

// ADR 0047 (étape 05 du backlog onboarding) — l'inscription tient en trois
// éléments : e-mail, mot de passe, consentement. Prénom, zones et date de
// naissance sont demandés PLUS TARD, là où ils servent (/compte « Mon
// profil », découverte d'équipes) — plus jamais neuf champs debout au
// comptoir. Le consentement coché part dans les métadonnées du compte et
// est acté côté serveur au premier retour authentifié (auth/callback).
export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptPolicy, setAcceptPolicy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (!acceptPolicy) {
      setError("Coche la case de consentement pour créer ton compte.");
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Acté côté serveur (journal consents, ADR 0022) au premier passage
        // authentifié — voir app/auth/callback/route.ts.
        data: { accept_policy: true, accept_policy_at: new Date().toISOString() },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Compte créé : l'événement part en file et ne sera émis qu'une fois la
    // session prouvée côté app (cf. lib/analytics-pending.ts).
    queueEvent("sign_up", { method: "email", funnel: "membre" });

    if (data.session) {
      // Email confirmation disabled → déjà connecté
      window.location.href = "/auth/callback";
    } else {
      // Email confirmation required → attendre la confirmation
      setSent(true);
    }
    setLoading(false);
  }

  async function handleOAuth(provider: "google") {
    queueEvent("sign_up", { method: provider, funnel: "membre" });
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  if (sent) {
    return (
      <div className="text-center">
        <p className="text-4xl mb-4">📧</p>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Vérifie ta boîte mail</h2>
        <p className="text-gray-600 text-sm">
          Un lien de confirmation a été envoyé à{" "}
          <span className="font-semibold text-gray-900">{email}</span>.
        </p>
        <p className="text-gray-500 text-xs mt-4">
          Clique le lien pour activer ton compte et rejoindre ton restaurant.
        </p>
      </div>
    );
  }

  return (
    <>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Créer un compte</h2>
      <p className="text-gray-500 text-sm mb-5">
        10 secondes suffisent — tu compléteras ton profil plus tard, si tu veux.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="toi@exemple.com"
            required
            autoComplete="email"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
          <input
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
          />
          <p className="text-xs text-gray-400 mt-1">6 caractères minimum.</p>
        </div>

        {/* ADR 0022 — acceptation obligatoire ; les opt-ins facultatifs
            (offres, statistiques) se gèrent dans Mon compte. */}
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={acceptPolicy}
            onChange={(e) => setAcceptPolicy(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            J&apos;accepte la{" "}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-red underline">politique de confidentialité</a>{" "}
            et les{" "}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-brand-red underline">conditions d&apos;utilisation</a>,
            et je confirme avoir au moins 13 ans (ou l&apos;accord d&apos;un parent).
          </span>
        </label>

        {error && <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">{error}</p>}

        <button
          type="submit"
          disabled={loading || !acceptPolicy}
          className="w-full bg-brand-red text-white py-3 px-4 rounded-lg font-semibold hover:bg-brand-red/85 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Création..." : "Créer mon compte"}
        </button>
      </form>

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-xs text-gray-400">ou continuer avec</span>
        </div>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => handleOAuth("google")}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google
        </button>
      </div>

      <p className="text-center text-sm text-gray-500 mt-6">
        Déjà inscrit ?{" "}
        <Link href="/login" className="text-brand-red font-semibold hover:underline">
          Se connecter
        </Link>
      </p>
    </>
  );
}
