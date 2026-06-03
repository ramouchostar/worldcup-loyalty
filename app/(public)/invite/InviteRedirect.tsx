"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function InviteRedirect({ joinPath }: { joinPath: string }) {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => router.replace(joinPath), 1500);
    return () => clearTimeout(t);
  }, [joinPath, router]);

  return null;
}
