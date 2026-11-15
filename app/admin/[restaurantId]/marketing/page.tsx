import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAdminAccess } from "@/lib/admin-guard";
import { getRestaurant } from "@/lib/restaurant";
import { todayInBrussels } from "@/lib/qr-funnel";
import { marketplaceEnabled } from "@/lib/missions";
import { ASSISTANTS } from "@/lib/agents/types";
import { formatEur } from "@/lib/ads/money";
import { FUNNEL_FLAG_TEXT, funnelFlags } from "@/lib/ads/vouchers";
import { announcementResults, dayFr, monthSummary, recommend, type Recommendation } from "@/lib/marketing-space";
import {
  loadAnnouncementsAndTickets,
  loadAudience,
  loadMarketingIdeas,
  loadPub,
  loadRevenueDays,
  loadScheduled,
  type Audience,
  type Block,
  type PubBlock,
} from "@/lib/marketing-space-data";
import { Card, CardRow, PageHeader, ProgressBar, StatusBadge } from "@/components/admin/ui";
import { ArrowRight } from "@/components/icons";
import { MarketingGallery, type GalleryTile } from "./MarketingGallery";

export const metadata = { title: "Marketing" };
export const dynamic = "force-dynamic";

// L'espace Marketing (ADR 0104 §1) — l'onglet « Marketing » de la vue simple (ex-« Annonces »).
// Maquette validée par Mehdi le 2026-11-15 : https://claude.ai/artifact/MWBkdi6Ffqrn1tY63m4qFC
// Cinq questions, de haut en bas : quoi faire cette semaine, ce qui tourne, lancer une action,
// qui on peut toucher, ce que les actions ont donné. Chaque bloc se lit à part
// (lib/marketing-space-data.ts) : une panne n'ôte que son bloc et le dit.

const fr = (n: number) => n.toLocaleString("fr-BE");

export default async function MarketingPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const access = await getAdminAccess(user.id, restaurantId);
  const base = `/admin/${restaurantId}`;
  const today = todayInBrussels();
  const monthStart = `${today.slice(0, 8)}01`;

  const [restaurant, ideas, revenue, audience, history, scheduled, pub] = await Promise.all([
    getRestaurant(restaurantId),
    loadMarketingIdeas(restaurantId),
    loadRevenueDays(restaurantId, today),
    loadAudience(restaurantId),
    loadAnnouncementsAndTickets(restaurantId, today),
    loadScheduled(restaurantId),
    loadPub(restaurantId, access.isSuperAdmin),
  ]);

  const announcements = history.ok ? announcementResults(history.data.announcements, history.data.ticketDays, today) : [];
  const requests = pub.ok ? pub.data.requests : [];
  const live = requests.filter((r) => r.status === "en_diffusion" || r.status === "en_pause");
  const ended = requests.filter((r) => r.status === "terminee");

  const reco = recommend({
    base,
    restaurantName: restaurant?.name ?? "ton resto",
    today,
    ideas: ideas.ok ? ideas.data : [],
    revenue: revenue.ok ? revenue.data : null,
    promoReachable: audience.ok ? audience.data.promoReachable : null,
    pubOpen: pub.ok && pub.data.open,
    pubEver: requests.length > 0,
    lastAnnouncement: announcements[0]?.day ?? null,
  });
  const otherIdeas = ideas.ok ? Math.max(0, ideas.data.length - (reco?.kind === "idee" ? 1 : 0)) : 0;

  const summary = monthSummary({
    actions:
      announcements.filter((a) => a.day >= monthStart).length +
      requests.filter((r) => r.createdAt.slice(0, 10) >= monthStart).length,
    reached: live.reduce((n, r) => n + r.reach, 0) || null,
    vouchersRedeemed: requests.reduce((n, r) => n + r.vouchers.redeemed, 0),
  });

  const lastThumb = requests.find((r) => r.creative?.thumbnail)?.creative?.thumbnail ?? null;
  const tiles = galleryTiles({
    base,
    pubOpen: pub.ok && pub.data.open,
    marketplace: marketplaceEnabled(access.isSuperAdmin),
    promoReachable: audience.ok ? audience.data.promoReachable : null,
    pubThumb: lastThumb,
  });

  return (
    <div className="space-y-8 max-w-2xl">
      <PageHeader title="Marketing" subtitle={summary ?? "Ce qui fait venir et revenir tes clients, au même endroit."} />

      <section className="space-y-3" aria-labelledby="mk-reco">
        <h2 id="mk-reco" className="text-[17px] font-semibold tracking-[-0.02em] text-ink">À faire cette semaine</h2>
        {reco ? <RecoCard reco={reco} /> : <p className="text-[15px] text-ink-muted">Rien d&apos;urgent cette semaine. Choisis une action plus bas quand tu veux.</p>}
        {otherIdeas > 0 && (
          <Link href={`${base}/idees`} className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-paper-border bg-white px-4 py-3 text-[15px] text-ink hover:border-boost-olive focus-visible:outline focus-visible:outline-2 focus-visible:outline-boost-olive">
            <span>{otherIdeas === 1 ? "Une autre idée marketing t'attend" : `${otherIdeas} autres idées marketing t'attendent`} dans Idées</span>
            <ArrowRight size={18} aria-hidden="true" className="shrink-0 text-ink-muted" />
          </Link>
        )}
      </section>

      <NowSection base={base} pub={pub} live={live} scheduled={scheduled} today={today} />

      <section className="space-y-3" aria-labelledby="mk-launch">
        <h2 id="mk-launch" className="text-[17px] font-semibold tracking-[-0.02em] text-ink">Lancer une action</h2>
        <MarketingGallery tiles={tiles} />
      </section>

      <AudienceSection audience={audience} />

      <ResultsSection base={base} announcementsOk={history.ok} announcements={announcements.slice(0, 5)} ended={ended.slice(0, 5)} />
    </div>
  );
}

// ── 1. La recommandation ─────────────────────────────────────

function RecoCard({ reco }: { reco: Recommendation }) {
  const a = reco.assistant ? ASSISTANTS[reco.assistant] : null;
  return (
    <article className="space-y-4 rounded-lg bg-white p-4 shadow-[0_8px_24px_rgba(12,21,9,0.10)]">
      {a && (
        <div className="flex items-center gap-2.5 text-[13px] text-ink-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.photo} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
          <span>
            <strong className="font-semibold text-ink">{a.name}</strong>, {reco.basis}
          </span>
        </div>
      )}
      <h3 className="text-[20px] font-semibold leading-snug tracking-[-0.02em] text-ink text-balance">{reco.title}</h3>
      <div className="grid grid-cols-3 gap-2">
        {reco.facts.map((f) => (
          <div key={f.label} className="min-w-0 rounded-lg bg-boost-cream p-2.5">
            <strong className="block break-words text-[15px] font-semibold leading-tight tabular-nums text-ink">{f.value}</strong>
            <span className="block text-[13px] leading-tight text-boost-olive-dark">{f.label}</span>
          </div>
        ))}
      </div>
      <Link
        href={reco.cta.href}
        className="flex min-h-[44px] w-full items-center justify-center rounded-lg bg-boost-olive px-4 text-[15px] font-semibold text-white hover:bg-boost-olive-dark active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-boost-olive"
      >
        {reco.cta.label}
      </Link>
    </article>
  );
}

// ── 2. Ce qui tourne ─────────────────────────────────────────

type LiveRequest = PubBlock["requests"][number];

function NowSection({
  base,
  pub,
  live,
  scheduled,
  today,
}: {
  base: string;
  pub: Block<PubBlock>;
  live: LiveRequest[];
  scheduled: Block<{ id: string; message: string; sendOn: string }[]>;
  today: string;
}) {
  const sched = scheduled.ok ? scheduled.data.filter((s) => s.sendOn >= today) : [];
  const nothing = live.length === 0 && sched.length === 0;
  return (
    <section className="space-y-3" aria-labelledby="mk-now">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="mk-now" className="text-[17px] font-semibold tracking-[-0.02em] text-ink">En ce moment</h2>
        {pub.ok && pub.data.open && (
          <Link href={`${base}/pub`} className="inline-flex min-h-[44px] items-center text-[13px] font-semibold text-boost-olive-dark hover:text-ink">
            Toutes tes pubs
          </Link>
        )}
      </div>
      {!pub.ok && <p className="text-[13px] text-ink-muted">Tes pubs n&apos;ont pas pu être lues pour l&apos;instant.</p>}
      {nothing && pub.ok && <p className="text-[15px] text-ink-muted">Rien ne tourne en ce moment.</p>}
      {live.map((r) => (
        <LivePubCard key={r.id} base={base} r={r} />
      ))}
      {sched.length > 0 && (
        <Card padding="p-0">
          {sched.map((s, i) => (
            <CardRow key={s.id} first={i === 0} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-ink">Annonce programmée le {dayFr(s.sendOn)}</p>
                <p className="truncate text-[13px] text-ink-muted">{s.message}</p>
              </div>
              <Link href={`${base}/broadcast`} className="inline-flex min-h-[44px] shrink-0 items-center text-[13px] font-semibold text-boost-olive-dark hover:text-ink">
                Modifier
              </Link>
            </CardRow>
          ))}
        </Card>
      )}
      {!scheduled.ok && <p className="text-[13px] text-ink-muted">Les annonces programmées n&apos;ont pas pu être lues.</p>}
    </section>
  );
}

function LivePubCard({ base, r }: { base: string; r: LiveRequest }) {
  const flags = r.hasVoucher ? funnelFlags(r.clicks, r.vouchers) : [];
  return (
    <Card className="space-y-3.5">
      <div className="flex items-center gap-3">
        <div className="h-[70px] w-14 shrink-0 overflow-hidden rounded-lg border border-paper-border bg-paper-subtle">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {r.creative?.thumbnail && <img src={r.creative.thumbnail} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink">{r.objectiveLabel}</p>
          <p className="text-[13px] text-ink-muted">
            {[r.radiusKm ? `${r.radiusKm} km autour` : null, r.endsOn ? `jusqu'au ${dayFr(r.endsOn)}` : null].filter(Boolean).join(", ")}
          </p>
        </div>
        <StatusBadge tone={r.status === "en_diffusion" ? "good" : "neutral"} solid={r.status === "en_diffusion"} className="shrink-0">
          {r.status === "en_diffusion" ? "En diffusion" : "En pause"}
        </StatusBadge>
      </div>
      {r.hasVoucher ? (
        <div className="grid grid-cols-3 gap-2">
          <Figure value={fr(r.clicks)} label="clics sur la pub" />
          <Figure value={fr(r.vouchers.issued)} label="bons obtenus" />
          <Figure value={fr(r.vouchers.redeemed)} label="bons utilisés en caisse" strong />
        </div>
      ) : (
        <div className="rounded-lg bg-boost-cream px-3.5 py-3">
          <strong className="block text-[32px] font-semibold leading-tight tracking-[-0.03em] tabular-nums text-ink">{fr(r.results)}</strong>
          <span className="text-[13px] text-boost-olive-dark">{r.resultLabel}</span>
        </div>
      )}
      <div className="space-y-1.5">
        <div className="flex justify-between gap-2 text-[13px] text-ink">
          <span>
            Dépensé <strong>{formatEur(r.spentCents)}</strong> sur {formatEur(r.paidCents)}
          </span>
          {r.hasVoucher && r.vouchers.redeemed > 0 && <span className="text-ink-muted">{formatEur(Math.round(r.spentCents / r.vouchers.redeemed))} par bon utilisé</span>}
        </div>
        <ProgressBar value={r.spentCents} max={Math.max(1, r.paidCents)} tone="boost" label="Budget de la pub dépensé" />
      </div>
      {r.hasVoucher && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-ink-muted">Offre : {r.offerText}</p>
          <Link href={`${base}/bon`} className="inline-flex min-h-[44px] items-center gap-1 text-[13px] font-semibold text-boost-olive-dark hover:text-ink">
            Valider un bon <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      )}
      {flags.map((f) => (
        <p key={f} className="rounded-lg bg-warn/12 px-3 py-2 text-[13px] text-warn">
          {FUNNEL_FLAG_TEXT[f]}
        </p>
      ))}
    </Card>
  );
}

function Figure({ value, label, strong = false }: { value: string; label: string; strong?: boolean }) {
  return (
    <div className={`min-w-0 rounded-lg p-2.5 ${strong ? "bg-boost-cream" : "bg-paper-subtle"}`}>
      <strong className="block text-[20px] font-semibold leading-tight tabular-nums text-ink">{value}</strong>
      <span className={`block text-[13px] leading-tight ${strong ? "text-boost-olive-dark" : "text-ink-muted"}`}>{label}</span>
    </div>
  );
}

// ── 3. La galerie ────────────────────────────────────────────

function galleryTiles(p: { base: string; pubOpen: boolean; marketplace: boolean; promoReachable: number | null; pubThumb: string | null }): GalleryTile[] {
  const tiles: GalleryTile[] = [
    {
      id: "pub",
      category: "venir",
      wide: true,
      image: p.pubThumb ?? "/marketing/landing/salle.webp",
      badge: p.pubOpen ? "Conseillé" : "Bientôt",
      title: "Pub autour du resto",
      text: "Facebook et Instagram, dans un rayon de 1 à 10 km. Avec une offre, chaque client venu par la pub se compte en caisse.",
      facts: ["dès 100 €", "10 à 15 € par jour conseillés"],
      href: p.pubOpen ? `${p.base}/pub/nouvelle` : null,
      closedNote: "La Pub s'ouvre établissement par établissement.",
    },
    {
      id: "annonce",
      category: "revenir",
      image: "/marketing/landing/burger.webp",
      badge: "Gratuit",
      title: "Annonce à tes clients",
      text: "Une notification sur leur téléphone",
      facts: p.promoReachable !== null ? [`${fr(p.promoReachable)} clients`] : [],
      href: `${p.base}/broadcast`,
    },
    {
      id: "parrainage",
      category: "venir",
      image: "/marketing/landing/poulet.webp",
      badge: "Gratuit",
      title: "Tes clients en amènent d'autres",
      text: "Leur lien de parrainage, sur WhatsApp",
      facts: [],
      href: `${p.base}/referrals`,
    },
    {
      id: "avis",
      category: "google",
      // Image fournie par Mehdi le 2026-11-15 (logo Google + étoiles), montrée entière sur fond blanc.
      image: "/marketing/console/avis-google.png",
      fit: "contain",
      title: "Plus d'avis Google",
      text: "Tes clients laissent un avis contre des points",
      facts: [],
      href: `${p.base}/micro-rewards`,
    },
    {
      id: "qr",
      category: "revenir",
      image: null,
      icon: "phone",
      title: "Affiches et QR en salle",
      text: "Pour que chaque client rejoigne ton programme",
      facts: [],
      href: `${p.base}/qr`,
    },
    {
      id: "video",
      category: "contenu",
      image: "/marketing/landing/cuisine.webp",
      badge: p.marketplace ? undefined : "Bientôt",
      title: "Tournage vidéo",
      text: "Un vidéaste vient au resto, pour tes pubs et Instagram",
      facts: ["devis ferme"],
      href: p.marketplace ? `${p.base}/prestataires` : null,
      closedNote: "Les prestataires arrivent bientôt dans ta console.",
    },
    {
      id: "photos",
      category: "contenu",
      image: null,
      icon: "camera",
      badge: p.marketplace ? undefined : "Bientôt",
      title: "Photos des plats",
      text: "Un photographe pour ta carte et tes pubs",
      facts: ["devis ferme"],
      href: p.marketplace ? `${p.base}/prestataires` : null,
      closedNote: "Les prestataires arrivent bientôt dans ta console.",
    },
  ];
  return tiles;
}

// ── 4. Qui tu peux toucher ───────────────────────────────────

function AudienceSection({ audience }: { audience: Block<Audience> }) {
  return (
    <section className="space-y-3" aria-labelledby="mk-audience">
      <h2 id="mk-audience" className="text-[17px] font-semibold tracking-[-0.02em] text-ink">Qui tu peux toucher</h2>
      {!audience.ok ? (
        <p className="text-[13px] text-ink-muted">Tes publics n&apos;ont pas pu être lus pour l&apos;instant.</p>
      ) : (
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-paper-border bg-paper-border sm:grid-cols-3">
          <Channel value={audience.data.members} label="clients du programme" />
          <Channel value={audience.data.promoReachable} label="d'accord pour recevoir tes promos" />
          <Channel value={audience.data.pushSubscribers} label="reçoivent tes notifications" />
        </div>
      )}
    </section>
  );
}

function Channel({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-white p-3.5">
      <strong className="block text-[20px] font-semibold tracking-[-0.02em] tabular-nums text-ink">{fr(value)}</strong>
      <span className="text-[13px] text-ink-muted">{label}</span>
    </div>
  );
}

// ── 5. Ce que tes actions ont donné ──────────────────────────

function ResultsSection({
  base,
  announcementsOk,
  announcements,
  ended,
}: {
  base: string;
  announcementsOk: boolean;
  announcements: ReturnType<typeof announcementResults>;
  ended: LiveRequest[];
}) {
  const rows = announcements.length + ended.length;
  return (
    <section className="space-y-3" aria-labelledby="mk-results">
      <h2 id="mk-results" className="text-[17px] font-semibold tracking-[-0.02em] text-ink">Ce que tes actions ont donné</h2>
      {!announcementsOk && <p className="text-[13px] text-ink-muted">Tes annonces n&apos;ont pas pu être lues pour l&apos;instant.</p>}
      {rows === 0 && announcementsOk && <p className="text-[15px] text-ink-muted">Tes premières actions apparaîtront ici, avec ce qu&apos;elles ont donné.</p>}
      {rows > 0 && (
        <Card padding="p-0">
          {announcements.map((a, i) => (
            <CardRow key={`${a.day}-${a.message}`} first={i === 0} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-ink">Annonce « {a.message} »</p>
                <p className="text-[13px] text-ink-muted">
                  {dayFr(a.day)}, {fr(a.recipients)} client{a.recipients > 1 ? "s" : ""}
                </p>
              </div>
              <div className="text-right">
                <strong className={`block text-[17px] font-semibold tabular-nums ${!a.partial && a.after > a.before ? "text-good" : "text-ink"}`}>
                  {fr(a.after)} ticket{a.after > 1 ? "s" : ""}
                </strong>
                <span className="text-[13px] text-ink-muted">{a.partial ? "en cours" : `${fr(a.before)} la semaine d'avant`}</span>
              </div>
            </CardRow>
          ))}
          {ended.map((r, i) => (
            <CardRow key={r.id} first={announcements.length === 0 && i === 0} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-ink">Pub {r.objectiveLabel.toLowerCase()}</p>
                <p className="text-[13px] text-ink-muted">
                  {r.startsOn ? `du ${dayFr(r.startsOn)}` : ""}
                  {r.endsOn ? ` au ${dayFr(r.endsOn)}` : ""}, {formatEur(r.spentCents)}
                </p>
              </div>
              <div className="text-right">
                <strong className="block text-[17px] font-semibold tabular-nums text-ink">
                  {r.hasVoucher ? `${fr(r.vouchers.redeemed)} bon${r.vouchers.redeemed > 1 ? "s" : ""}` : fr(r.results)}
                </strong>
                <span className="text-[13px] text-ink-muted">{r.hasVoucher ? "utilisés en caisse" : r.resultLabel}</span>
              </div>
            </CardRow>
          ))}
        </Card>
      )}
      <p className="text-[13px] text-ink-faint">
        Annonces : tickets du programme le jour même et les deux suivants, face aux mêmes jours de la semaine d&apos;avant.{" "}
        <Link href={`${base}/broadcast`} className="font-semibold text-boost-olive-dark hover:text-ink">
          Toutes tes annonces
        </Link>
      </p>
    </section>
  );
}
