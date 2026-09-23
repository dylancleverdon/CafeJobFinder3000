"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";

export default function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="card space-y-3 p-4">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="label">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className="input" autoFocus />
      </label>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Opening…" : "Open"}
      </button>
    </form>
  );
}
