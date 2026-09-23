import { useStoreApi } from "../../useStore";

export default function InterestStars({ cafeId, value }: { cafeId: string; value: number }) {
  const store = useStoreApi();
  return (
    <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
      <span>How much do you want to work here?</span>
      <div className="flex" role="radiogroup" aria-label="Interest">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} stars`}
            onClick={() => store.updateCafe(cafeId, { interest: n === value ? 0 : n })}
            className={`px-0.5 text-2xl leading-none ${n <= value ? "text-amber-500" : "text-line"}`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}
