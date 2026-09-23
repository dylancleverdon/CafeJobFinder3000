"use client";

import dynamic from "next/dynamic";

// Client-only so an in-progress route saved on this phone restores instantly.
const RoutePlanner = dynamic(() => import("./RoutePlanner"), {
  ssr: false,
  loading: () => <p className="py-10 text-center text-sm text-muted">Loading route planner…</p>,
});

export default RoutePlanner;
