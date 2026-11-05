import type { AssistantId } from "@/lib/agents/types";
import { assistant } from "./brigade";

// Portrait d'un assistant de la brigade : un personnage créé pour Boosteats
// (public/marketing/brigade/<id>.jpg, 256 px), jamais une vraie personne.
export function Portrait({
  id,
  size = 40,
  className = "",
}: {
  id: AssistantId;
  size?: number;
  className?: string;
}) {
  const a = assistant(id);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={a.photo}
      alt={a.name}
      width={size}
      height={size}
      loading="lazy"
      className={`rounded-full object-cover shrink-0 bg-boost-cream ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
