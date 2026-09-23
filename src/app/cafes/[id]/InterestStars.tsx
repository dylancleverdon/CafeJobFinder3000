"use client";

import { useOptimistic, useTransition } from "react";
import { updateCafe } from "@/app/actions";

export default function InterestStars({ cafeId, value }: { cafeId: number; value: number }) {
  const [optimistic, setOptimistic] = useOptimistic(value);
  const [, start] = useTransition();
  const set = (n: number) =>
    start(async () => {
      const next = n === optimistic ? 0 : n;
      setOptimistic(next);
      await updateCafe(cafeId, { interest: next });
    });
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <span>How much do you want to work here?</span>
      <div className="flex" role="radiogroup" aria-label="Interest">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={optimistic === n} aria-label={`${n} stars`} onClick={() => set(n)} className={`px-0.5 text-xl leading-none ${n <= optimistic ? "text-amber-500" : "text-line"}`}>
            ★
          </button>
        ))}
      </div>
    </div>
  );
}
