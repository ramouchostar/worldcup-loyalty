"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { frenchAuthError } from "@/lib/auth-errors";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  // Anti-spam renvoi d'email : 60 s de délai après chaque envoi
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendResetEmail(): Promise<boolean> {
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });
    if (error) {
      setError(frenchAuthError(error));
      return false;
    }
    setCooldown(60);
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const ok = await sendResetEmail();
    if (ok) setSent(true);
    setLoading(false);
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    await sendResetEmail();
    setResending(false);
  }

  if (sent) {
    return (
      <>
        <div className="text-center">
          <p className="text-4xl mb-4">📧</p>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Email envoyé !</h2>
          <p className="text-gray-500 text-sm">
            Vérifie ta boîte mail pour{" "}
            <span className="font-medium text-gray-900">{email}</span>.
            Clique le lien pour définir ton nouveau mot de passe.
          </p>
          <p className="text-gray-600 text-sm mt-3">
            Ouvre l&apos;email sur <strong>ce téléphone</strong>.
          </p>
          <p className="text-gray-600 text-sm mt-1">Pense à regarder tes spams.</p>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg mt-4">{error}</p>
          )}

          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || resending}
            className="mt-6 mb-4 w-full min-h-[48px] border border-gray-300 rounded-lg px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {cooldown > 0
              ? `Renvoyer (${cooldown} s)`
              : resending
                ? "Envoi..."
                : "Je n'ai rien reçu — renvoyer l'email"}
          </button>

          <Link href="/login" className="text-brand-red font-semibold text-sm hover:underline">
            ← Retour à la connexion
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Mot de passe oublié</h2>
      <p className="text-gray-500 text-sm mb-6">
        Entre ton email pour recevoir un lien de réinitialisation.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            id="forgot-email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="toi@exemple.com"
            required
            autoFocus
            autoComplete="email"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
          />
        </div>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-red text-white py-3 px-4 rounded-lg font-semibold hover:bg-brand-red/85 disabled:opacity-50 transition-colors"
        >
          {loading ? "Envoi..." : "Envoyer le lien →"}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        <Link href="/login" className="text-brand-red font-semibold hover:underline">
          ← Retour à la connexion
        </Link>
      </p>
    </>
  );
}
