import { field } from "./ui";

// Le prénom (obligatoire) et le téléphone (facultatif) saisis avant l'envoi.

type Props = {
  firstName: string;
  phone: string;
  phoneOk: boolean;
  retentionDays: number;
  onFirstName: (value: string) => void;
  onPhone: (value: string) => void;
};

export function ContactFields({ firstName, phone, phoneOk, retentionDays, onFirstName, onPhone }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="co-prenom" className="mb-1 block text-[15px] font-semibold text-ink">Ton prénom</label>
        <input id="co-prenom" value={firstName} maxLength={24} autoComplete="given-name" onChange={(e) => onFirstName(e.target.value)} className={field} />
      </div>
      <div>
        <label htmlFor="co-tel" className="mb-1 block text-[15px] font-semibold text-ink">Ton téléphone (facultatif)</label>
        <input id="co-tel" type="tel" inputMode="tel" value={phone} maxLength={20} autoComplete="tel" placeholder="0470 12 34 56" onChange={(e) => onPhone(e.target.value)} className={field} aria-describedby="co-tel-aide" />
        <p id="co-tel-aide" className="mt-1 text-[13px] text-ink-muted">
          {phone.trim() !== "" && !phoneOk ? "Ce numéro n'est pas lisible. Exemple : 0470 12 34 56. Tu peux aussi le laisser vide." : `Pour que le restaurant t'appelle quand c'est prêt. Ton prénom et ton téléphone sont effacés après ${retentionDays} jours.`}
        </p>
      </div>
    </div>
  );
}
