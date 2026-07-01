"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type NotifEntry = {
  id: string;
  message_body: string;
  trigger_type: string;
  sent_at: string;
};

export function InAppNotificationBanner() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [notif, setNotif] = useState<NotifEntry | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch(`/api/notifications/latest?restaurantId=${restaurantId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: NotifEntry | null) => {
        if (!data) return;
        if (sessionStorage.getItem(`notif_dismissed_${data.id}`)) return;
        setNotif(data);
      })
      .catch(() => {});
  }, [restaurantId]);

  function dismiss() {
    if (notif) sessionStorage.setItem(`notif_dismissed_${notif.id}`, "1");
    setDismissed(true);
  }

  if (!notif || dismissed) return null;

  return (
    <div className="bg-brand-dark/95 backdrop-blur-sm border-b border-white/10 px-4 py-3 flex items-start gap-3">
      <span className="text-xl shrink-0 mt-0.5" aria-hidden="true">🔔</span>
      <p className="text-sm text-white flex-1 min-w-0 leading-relaxed">
        {notif.message_body}
      </p>
      <button
        onClick={dismiss}
        className="shrink-0 text-gray-400 hover:text-white text-xl leading-none transition-colors mt-0.5"
        aria-label="Fermer la notification"
      >
        ×
      </button>
    </div>
  );
}
