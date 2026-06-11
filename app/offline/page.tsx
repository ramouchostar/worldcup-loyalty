export const metadata = { title: "Hors ligne — WorldCup Loyalty" };

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center text-white p-6 text-center">
      <div className="max-w-sm">
        <div className="text-6xl mb-4">📶</div>
        <h1 className="text-2xl font-black mb-2">Pas de connexion</h1>
        <p className="text-gray-400 text-sm leading-relaxed mb-6">
          Tu es hors ligne. Reconnecte-toi pour accéder à WorldCup&nbsp;Loyalty Belchicken.
        </p>
        <a
          href="/"
          className="inline-block bg-brand-red text-white font-bold px-6 py-3 rounded-xl"
        >
          Réessayer
        </a>
      </div>
    </div>
  );
}
