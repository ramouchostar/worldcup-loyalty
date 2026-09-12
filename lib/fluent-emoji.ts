// Illustrations Fluent Emoji 3D (Microsoft) servies directement par jsDelivr
// depuis le paquet publié — juste des .webp statiques, version figée pour un
// rendu stable. Volontairement pas de dépendance npm : @lobehub/fluent-emoji
// embarque tout Ant Design (antd-style) pour ce qui n'est ici qu'une image.
// CSP : cdn.jsdelivr.net doit rester autorisé en img-src (next.config.mjs).
export const FLUENT_EMOJI_3D = "https://cdn.jsdelivr.net/npm/@lobehub/fluent-emoji-3d@1.1.0/assets";
export const COIN_EMOJI = `${FLUENT_EMOJI_3D}/1fa99.webp`;
export const RECEIPT_EMOJI = `${FLUENT_EMOJI_3D}/1f9fe.webp`;
export const TICKET_EMOJI = `${FLUENT_EMOJI_3D}/1f3ab.webp`;
// Illustrations d'état vide et de moments forts de l'app membre (2026-09-12).
// Elles remplacent les emoji système posés en `text-4xl` : le rendu ne dépend
// plus de la police d'emoji de l'appareil (un 🎁 Android, un 🎁 iOS et un 🎁
// Windows ne se ressemblent pas). Les emoji qui restent du texte — podium
// 🥇🥈🥉, type d'équipe (lib/team-suggestions.ts) — ne passent PAS par ici :
// ce sont des données, pas des illustrations.
export const GIFT_EMOJI = `${FLUENT_EMOJI_3D}/1f381.webp`;
export const PARTY_EMOJI = `${FLUENT_EMOJI_3D}/1f389.webp`;
export const TROPHY_EMOJI = `${FLUENT_EMOJI_3D}/1f3c6.webp`;
export const PEOPLE_EMOJI = `${FLUENT_EMOJI_3D}/1f465.webp`;
export const CLOCK_EMOJI = `${FLUENT_EMOJI_3D}/1f550.webp`;
export const FINISH_FLAG_EMOJI = `${FLUENT_EMOJI_3D}/1f3c1.webp`;
export const CAMERA_EMOJI = `${FLUENT_EMOJI_3D}/1f4f8.webp`;
