"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { signIn } from "@/app/(auth)/login/actions";
import { FieldError } from "@/components/FieldError";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailFormatError(value: string): string | null {
  if (!value.trim()) return "Entre ton adresse email.";
  if (!EMAIL_RE.test(value.trim()))
    return "Cette adresse ne semble pas complète. Vérifie le @ et le point.";
  return null;
}

export default function LoginForm() {
  const searchParams = useSearchParams();
  // ADR 0030 §1 — habillage « Espace restaurateur » : même formulaire, même
  // auth ; seul l'habillage et la destination post-login changent.
  const asResto = searchParams.get("as") === "resto";
  // ADR 0030 §8 — refus parlant : arrivé ici depuis une page protégée.
  const loginRequired = searchParams.get("reason") === "login-required";
  const [error, setError] = useState<string | null>(
    searchParams.get("error") ? "Connexion échouée. Réessaie." : null
  );
  // Erreurs par champ (audit UX sprint 2 §12) — posées au blur ou au submit,
  // jamais à la frappe ; effacées à la re-saisie.
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [showPassword, setShowPassword] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get("error")) setError("Connexion échouée. Réessaie.");
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const emailErr = emailFormatError((formData.get("email") as string) ?? "");
    const passwordErr = !((formData.get("password") as string) ?? "")
      ? "Entre ton mot de passe."
      : null;
    if (emailErr || passwordErr) {
      setFieldErrors({ email: emailErr ?? undefined, password: passwordErr ?? undefined });
      return;
    }

    setError(null);
    setLoading(true);

    const result = await signIn(null, formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // si pas d'erreur, signIn appelle redirect() côté serveur → navigation automatique
  }

  async function handleOAuth(provider: "google") {
    setOauthLoading(provider);
    setError(null);
    const supabase = createClient();
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (oauthErr) {
      setError("Connexion Google échouée.");
      setOauthLoading(null);
    }
  }

  return (
    <>
      {asResto && (
        <div className="inline-flex items-center gap-2 bg-brand-dark rounded-full px-3 py-1 mb-3">
          <span className="text-brand-gold text-xs font-bold uppercase tracking-widest">
            Espace restaurateur
          </span>
        </div>
      )}
      {loginRequired && (
        <p className="bg-blue-50 border border-blue-200 text-blue-800 text-sm px-4 py-3 rounded-lg mb-4">
          🔑 Connecte-toi pour accéder à cette page.
        </p>
      )}
      <h2 className="text-xl font-bold text-gray-900 mb-1">Connexion</h2>
      <p className="text-gray-500 text-sm mb-6">
        {asResto
          ? "Connecte-toi pour retrouver ta console d'établissement."
          : "Connecte-toi à ton compte."}
      </p>

      <button
        type="button"
        onClick={() => handleOAuth("google")}
        disabled={oauthLoading !== null}
        className="w-full min-h-[48px] flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors text-sm font-medium text-gray-700"
      >
        {oauthLoading === "google" ? (
          <span className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin shrink-0" />
        ) : (
          <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        )}
        {oauthLoading === "google" ? "Redirection..." : "Continuer avec Google"}
      </button>

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-xs text-gray-400">ou avec ton email</span>
        </div>
      </div>

      {/* noValidate : les erreurs sont affichées par champ (FieldError), pas
          par les bulles natives du navigateur */}
      <form onSubmit={handleSubmit} noValidate className="space-y-4 mb-4">
        {asResto && <input type="hidden" name="as" value="resto" />}
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            id="login-email"
            name="email"
            type="email"
            placeholder="toi@exemple.com"
            required
            autoComplete="email"
            onChange={() =>
              setFieldErrors((prev) => (prev.email ? { ...prev, email: undefined } : prev))
            }
            onBlur={(e) => {
              // Validation au blur uniquement si une valeur a été saisie
              if (!e.target.value.trim()) return;
              setFieldErrors((prev) => ({
                ...prev,
                email: emailFormatError(e.target.value) ?? undefined,
              }));
            }}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
            className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900 ${fieldErrors.email ? "border-red-500" : "border-gray-300"}`}
          />
          <FieldError id="login-email-error" message={fieldErrors.email} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="login-password" className="block text-sm font-medium text-gray-700">Mot de passe</label>
            <Link
              href="/forgot-password"
              className="text-sm text-brand-red hover:underline inline-flex min-h-[44px] items-center"
            >
              Mot de passe oublié ?
            </Link>
          </div>
          <div className="relative">
            <input
              id="login-password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              onChange={() =>
                setFieldErrors((prev) => (prev.password ? { ...prev, password: undefined } : prev))
              }
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
              className={`w-full px-4 py-3 pr-24 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900 ${fieldErrors.password ? "border-red-500" : "border-gray-300"}`}
            />
            {/* Afficher/Masquer le mot de passe (audit UX sprint 2 §9) — cible ≥ 44 px */}
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 min-h-[44px] min-w-[44px] px-3 text-sm font-semibold text-gray-600 hover:text-gray-900"
            >
              {showPassword ? "Masquer" : "Afficher"}
            </button>
          </div>
          <FieldError id="login-password-error" message={fieldErrors.password} />
        </div>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-red text-white py-3 px-4 rounded-lg font-semibold hover:bg-brand-red/85 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        {asResto ? (
          <>
            Pas encore partenaire ?{" "}
            <Link href="/become-a-partner" className="text-brand-red font-semibold hover:underline">
              Inscrire mon restaurant
            </Link>
          </>
        ) : (
          <>
            Pas encore inscrit ?{" "}
            <Link href="/signup" className="text-brand-red font-semibold hover:underline">
              Créer un compte
            </Link>
          </>
        )}
      </p>
    </>
  );
}
