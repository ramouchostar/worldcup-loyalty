"use client";

import useSWR from "swr";

type ScoreData = {
  team_id: string;
  member_count: number;
  score: number;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function ScoreCard({
  teamId,
  initial,
}: {
  teamId: string;
  initial: ScoreData;
}) {
  const { data } = useSWR<ScoreData>(`/api/scores/${teamId}`, fetcher, {
    refreshInterval: 30_000,
    fallbackData: initial,
  });

  const score = data?.score ?? 0;
  const members = data?.member_count ?? 0;

  return (
    <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100">
      <Stat
        value={`${score.toLocaleString("fr-BE", { maximumFractionDigits: 0 })} pts`}
        label="Score communautaire"
      />
      <Stat value={members.toLocaleString()} label="Membres" />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-xl font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
