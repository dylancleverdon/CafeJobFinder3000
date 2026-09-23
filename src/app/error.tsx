"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const setup = /database/i.test(error.message);
  return (
    <div className="card mt-10 p-5">
      <p className="text-lg font-semibold">{setup ? "Almost there" : "Something went wrong"}</p>
      <p className="mt-2 text-sm text-muted">{setup ? error.message : "Try again — if it keeps happening, tell Claude what you were doing."}</p>
      <button className="btn-primary mt-4 w-full" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
