// Audit UX 2026-08-11 (« Erreurs de formulaire ») — les erreurs Supabase
// arrivent en anglais technique ; on les mappe vers du français simple
// orienté solution. Le défaut ne laisse jamais fuiter le message brut.
export function frenchAuthError(error: { message: string; code?: string }): string {
  const msg = error.message ?? "";
  const code = error.code ?? "";

  if (code === "user_already_exists" || /already (registered|exists)/i.test(msg)) {
    return "Cet email a déjà un compte. Connecte-toi plutôt.";
  }
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg)) {
    return "Email ou mot de passe incorrect.";
  }
  if (code === "weak_password" || /password should be at least/i.test(msg)) {
    return "Choisis un mot de passe d'au moins 8 caractères.";
  }
  if (/rate limit/i.test(code) || /rate limit/i.test(msg)) {
    return "Trop de tentatives. Attends une minute et réessaie.";
  }
  return "Un problème est survenu. Réessaie dans un instant.";
}
