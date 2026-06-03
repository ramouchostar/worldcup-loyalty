import dynamic from "next/dynamic";

const LoginForm = dynamic(() => import("@/components/auth/LoginForm"), {
  ssr: false,
  loading: () => (
    <div className="space-y-4">
      <div className="h-6 bg-gray-100 rounded w-32 animate-pulse" />
      <div className="h-4 bg-gray-100 rounded w-48 animate-pulse" />
      <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
      <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
      <div className="h-12 bg-brand-red rounded-lg animate-pulse opacity-50" />
    </div>
  ),
});

export default function LoginPage() {
  return <LoginForm />;
}
