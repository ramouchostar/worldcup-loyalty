"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { sanitizeZones } from "@/lib/zones";

export default function SignupPage() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    birthDate: "",
    zoneHome: "",
    zoneWork: "",
    zoneSchool: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    if (form.password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    // ADR 0018 — au moins la zone où tu vis, pour la découverte d'équipes
    const zones = sanitizeZones([form.zoneHome, form.zoneWork, form.zoneSchool]);
    if (zones.length === 0) {
      setError("Indique au moins ta zone (ville ou quartier où tu vis).");
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();
    const displayName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();

    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: {
          display_name: displayName,
          phone: form.phone.trim() || null,
          birth_date: form.birthDate || null,
          zones, // copiées dans profiles.zones par handle_new_user (m29)
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      // Email confirmation disabled → déjà connecté
      window.location.href = "/register";
    } else {
      // Email confirmation required → attendre la confirmation
      setSent(true);
    }
    setLoading(false);
  }

  async function handleOAuth(provider: "google") {
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
          <span className="font-semibold text-gray-900">{form.email}</span>.
        </p>
        <p className="text-gray-500 text-xs mt-4">
          Clique le lien pour activer ton compte et rejoindre ton restaurant.
        </p>
      </div>
    );
  }

  const maxBirthDate = new Date();
  maxBirthDate.setFullYear(maxBirthDate.getFullYear() - 13);

  return (
    <>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Créer un compte</h2>
      <p className="text-gray-500 text-sm mb-5">
        Rejoins le programme de fidélité de ton restaurant et gagne des cadeaux à chaque commande.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 mb-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
            <input
              name="firstName"
              type="text"
              value={form.firstName}
              onChange={handleChange}
              placeholder="Karim"
              required
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
            <input
              name="lastName"
              type="text"
              value={form.lastName}
              onChange={handleChange}
              placeholder="Benzema"
              required
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            placeholder="toi@exemple.com"
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Téléphone <span className="text-gray-400 font-normal">(facultatif)</span>
          </label>
          <input
            name="phone"
            type="tel"
            value={form.phone}
            onChange={handleChange}
            placeholder="+32 470 00 00 00"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date de naissance</label>
          <input
            name="birthDate"
            type="date"
            value={form.birthDate}
            onChange={handleChange}
            required
            max={maxBirthDate.toISOString().split("T")[0]}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
          />
        </div>

        {/* ADR 0018 — zones du membre : découverte des équipes proches */}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ta zone (ville ou quartier)</label>
            <input
              name="zoneHome"
              type="text"
              value={form.zoneHome}
              onChange={handleChange}
              placeholder="Ex : Molenbeek"
              required
              maxLength={40}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
            />
            <p className="text-xs text-gray-400 mt-1">
              On te proposera les équipes actives dans tes zones.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Zone de travail <span className="text-gray-400 font-normal">(facultatif)</span>
              </label>
              <input
                name="zoneWork"
                type="text"
                value={form.zoneWork}
                onChange={handleChange}
                placeholder="Ex : Anderlecht"
                maxLength={40}
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Zone d&apos;école <span className="text-gray-400 font-normal">(facultatif)</span>
              </label>
              <input
                name="zoneSchool"
                type="text"
                value={form.zoneSchool}
                onChange={handleChange}
                placeholder="Ex : Ixelles"
                maxLength={40}
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
          <input
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            placeholder="••••••••"
            required
            minLength={6}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirmer le mot de passe</label>
          <input
            name="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={handleChange}
            placeholder="••••••••"
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
          />
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
