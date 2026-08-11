"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { frenchAuthError } from "@/lib/auth-errors";
import { FieldError } from "@/components/FieldError";

function passwordLengthError(value: string): string | null {
  if (value.length < 8) return "Le mot de passe doit contenir au moins 8 caractères.";
  return null;
}

const inputCls =
  "w-full px-4 py-3 pr-24 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // Erreurs par champ (audit UX sprint 2 §12) — posées au blur ou au submit,
  // jamais à la frappe ; effacées à la re-saisie.
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function confirmMatchError(pw: string, conf: string): string | null {
    if (!conf) return "Retape ton mot de passe pour vérifier.";
    if (pw !== conf) return "Les mots de passe ne correspondent pas.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const passwordErr = passwordLengthError(password);
    const confirmErr = confirmMatchError(password, confirm);
    if (passwordErr || confirmErr) {
      setFieldErrors({ password: passwordErr ?? undefined, confirm: confirmErr ?? undefined });
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(frenchAuthError(error));
      setLoading(false);
      return;
    }

    router.push("/join");
  }

  return (
    <>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Nouveau mot de passe</h2>
      <p className="text-gray-500 text-sm mb-6">Choisis un mot de passe sécurisé.</p>

      {/* noValidate : les erreurs sont affichées par champ (FieldError), pas
          par les bulles natives du navigateur */}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="reset-password" className="block text-sm font-medium text-gray-700 mb-1">
            Nouveau mot de passe
          </label>
          <div className="relative">
            <input
              id="reset-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors((prev) => (prev.password ? { ...prev, password: undefined } : prev));
              }}
              onBlur={() => {
                // Validation au blur uniquement si une valeur a été saisie
                if (!password) return;
                setFieldErrors((prev) => ({
                  ...prev,
                  password: passwordLengthError(password) ?? undefined,
                }));
              }}
              placeholder="8 caractères minimum"
              required
              minLength={8}
              autoComplete="new-password"
              autoFocus
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? "reset-password-error" : undefined}
              className={`${inputCls} ${fieldErrors.password ? "border-red-500" : "border-gray-300"}`}
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
          <FieldError id="reset-password-error" message={fieldErrors.password} />
        </div>
        <div>
          <label htmlFor="reset-confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
            Confirmer le mot de passe
          </label>
          <div className="relative">
            <input
              id="reset-confirm-password"
              type={showConfirm ? "text" : "password"}
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setFieldErrors((prev) => (prev.confirm ? { ...prev, confirm: undefined } : prev));
              }}
              onBlur={() => {
                if (!confirm) return;
                setFieldErrors((prev) => ({
                  ...prev,
                  confirm: confirmMatchError(password, confirm) ?? undefined,
                }));
              }}
              placeholder="••••••••"
              required
              minLength={8}
              autoComplete="new-password"
              aria-invalid={fieldErrors.confirm ? true : undefined}
              aria-describedby={fieldErrors.confirm ? "reset-confirm-password-error" : undefined}
              className={`${inputCls} ${fieldErrors.confirm ? "border-red-500" : "border-gray-300"}`}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              aria-pressed={showConfirm}
              className="absolute inset-y-0 right-0 min-h-[44px] min-w-[44px] px-3 text-sm font-semibold text-gray-600 hover:text-gray-900"
            >
              {showConfirm ? "Masquer" : "Afficher"}
            </button>
          </div>
          <FieldError id="reset-confirm-password-error" message={fieldErrors.confirm} />
        </div>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-red text-white py-3 px-4 rounded-lg font-semibold hover:bg-brand-red/85 disabled:opacity-50 transition-colors"
        >
          {loading ? "Enregistrement..." : "Définir le mot de passe →"}
        </button>
      </form>

      {/* M2 (audit UX) — sortie in-app : lien de récupération périmé / hésitation */}
      <p className="text-center mt-4">
        <a href="/login" className="text-sm text-gray-600 hover:text-gray-800 underline inline-flex min-h-[44px] items-center">
          ← Retour à la connexion
        </a>
      </p>
    </>
  );
}
