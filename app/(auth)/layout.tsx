export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-dark via-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-4xl mb-2">🚀</p>
          <h1 className="text-2xl font-bold text-white">Boosteats</h1>
          <p className="text-gray-400 text-sm mt-1">Ta fidélité, en équipe</p>
        </div>
        <div className="bg-white rounded-2xl shadow-xl p-8">{children}</div>
      </div>
    </div>
  );
}
