"use client";

export function UserNav({ email }: { email: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 max-w-[120px] truncate hidden sm:block">
        {email}
      </span>
      <form action="/api/auth/logout" method="POST">
        <button
          type="submit"
          className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
        >
          Déco
        </button>
      </form>
    </div>
  );
}
