"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { frenchAuthError } from "@/lib/auth-errors";
import { FieldError } from "@/components/FieldError";

// Audit UX 2026-08-11 (C1, sprint 2 §9) — /signup réduit à l'essentiel :
// email + mot de passe. Le profil (prénom, date de naissance, zones,
// consentements) est complété sur /register, comme le flux Google OAuth.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailFormatError(value: string): string | null {
  if (!value.trim()) return "Entre ton adresse email.";
  if (!EMAIL_RE.test(value.trim()))
    return "Cette adresse ne semble pas complète. Vérifie le @ et le point.";
  return null;
}

function passwordLengthError(value: string): string | null {
  if (value.length < 8) return "Choisis un mot de passe d'au moins 8 caractères.";
  return null;
}

const inputBase =
  "w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900";

export default function SignupPage() {
  const [form, setForm] = useState({ email: "", password: "" });
  // Erreurs par champ (audit UX sprint 2 §12) — posées au blur ou au submit,
  // jamais à la frappe ; effacées dès que l'utilisateur retouche le champ.
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [resending, setResending] = useState(false);
  // Anti-spam renvoi d'email : 60 s de délai après chaque envoi
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.name as "email" | "password";
    setForm((prev) => ({ ...prev, [name]: e.target.value }));
    // Re-saisie → on efface l'erreur du champ (jamais de validation à la frappe)
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  }

  function handleEmailBlur() {
    // Au blur, on ne signale que le format ; « champ vide » attend le submit.
    if (!form.email.trim()) return;
    setFieldErrors((prev) => ({ ...prev, email: emailFormatError(form.email) ?? undefined }));
  }

  function handlePasswordBlur() {
    if (!form.password) return;
    setFieldErrors((prev) => ({ ...prev, password: passwordLengthError(form.password) ?? undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const emailErr = emailFormatError(form.email);
    const passwordErr = passwordLengthError(form.password);
    if (emailErr || passwordErr) {
      setFieldErrors({ email: emailErr ?? undefined, password: passwordErr ?? undefined });
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        // display_name volontairement vide : sans métadonnée, handle_new_user
        // (docs/m29b-fix-handle-new-user.sql) dériverait un display_name
        // provisoire depuis l'email (partie avant @) — le routage vers
        // /register (auth/callback/route.ts + lib/post-login.ts) teste
        // `!display_name` et ne se déclencherait alors jamais. La chaîne vide
        // traverse le COALESCE du trigger, satisfait le NOT NULL DEFAULT ''
        // (m2) et reste falsy côté JS → le membre finit bien son profil sur
        // /register (vrai prénom, date de naissance, zones, consentements).
        data: { display_name: "" },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(frenchAuthError(error));
      setLoading(false);
      return;
    }

    if (data.session) {
      // Email confirmation disabled → déjà connecté
      window.location.href = "/register";
    } else {
      // Email confirmation required → attendre la confirmation
      setSent(true);
      setCooldown(60);
    }
    setLoading(false);
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: form.email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(frenchAuthError(error));
    } else {
      setCooldown(60);
    }
    setResending(false);
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

  if (sent) {
    return (
      <div className="text-center">
        <p className="text-4xl mb-4">📧</p>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Vérifie ta boîte mail</h2>
        <p className="text-gray-600 text-sm">
          Un lien de confirmation a été envoyé à{" "}
          <span className="font-semibold text-gray-900">{form.email}</span>.
        </p>
        <p className="text-gray-600 text-sm mt-3">
          Ouvre l&apos;email sur <strong>ce téléphone</strong>, puis clique le lien pour activer
          ton compte et rejoindre ton restaurant.
        </p>
        <p className="text-gray-600 text-sm mt-1">Pense à regarder tes spams.</p>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg mt-4">{error}</p>
        )}

        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          className="mt-6 w-full min-h-[48px] border border-gray-300 rounded-lg px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {cooldown > 0
            ? `Renvoyer (${cooldown} s)`
            : resending
              ? "Envoi..."
              : "Je n'ai rien reçu — renvoyer l'email"}
        </button>
      </div>
    );
  }

  return (
    <>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Créer un compte</h2>
      <p className="text-gray-500 text-sm mb-5">
        Rejoins le programme de fidélité de ton restaurant et gagne des cadeaux à chaque commande.
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
        <div>
          <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            id="signup-email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            onBlur={handleEmailBlur}
            placeholder="toi@exemple.com"
            required
            autoComplete="email"
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? "signup-email-error" : undefined}
            className={`${inputBase} ${fieldErrors.email ? "border-red-500" : "border-gray-300"}`}
          />
          <FieldError id="signup-email-error" message={fieldErrors.email} />
        </div>

        <div>
          <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
          <div className="relative">
            <input
              id="signup-password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={handleChange}
              onBlur={handlePasswordBlur}
              placeholder="8 caractères minimum"
              required
              minLength={8}
              autoComplete="new-password"
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? "signup-password-error" : undefined}
              className={`${inputBase} pr-24 ${fieldErrors.password ? "border-red-500" : "border-gray-300"}`}
            />
            {/* Afficher/Masquer remplace la confirmation de mot de passe
                (audit UX sprint 2 §9) — cible ≥ 44 px */}
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 min-h-[44px] min-w-[44px] px-3 text-sm font-semibold text-gray-600 hover:text-gray-900"
            >
              {showPassword ? "Masquer" : "Afficher"}
            </button>
          </div>
          <FieldError id="signup-password-error" message={fieldErrors.password} />
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-red text-white py-3 px-4 rounded-lg font-semibold hover:bg-brand-red/85 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Création..." : "Créer mon compte"}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        Déjà inscrit ?{" "}
        <Link href="/login" className="text-brand-red font-semibold hover:underline">
          Se connecter
        </Link>
      </p>
    </>
  );
}
