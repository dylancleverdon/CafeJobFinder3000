"use client";

import dynamic from "next/dynamic";

// Client-only so it can read this phone's saved filters without a flash.
const CafeBrowser = dynamic(() => import("./CafeBrowser"), {
  ssr: false,
  loading: () => <p className="py-10 text-center text-sm text-muted">Loading cafes…</p>,
});

export default CafeBrowser;
