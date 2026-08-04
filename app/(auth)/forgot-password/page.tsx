"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <>
        <div className="text-center">
          <p className="text-4xl mb-4">📧</p>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Email envoyé !</h2>
          <p className="text-gray-500 text-sm mb-6">
            Vérifie ta boîte mail pour{" "}
            <span className="font-medium text-gray-900">{email}</span>.
            Clique le lien pour définir ton nouveau mot de passe.
          </p>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="toi@exemple.com"
            required
            autoFocus
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
