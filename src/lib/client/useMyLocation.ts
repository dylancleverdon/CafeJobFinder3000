"use client";

import { useCallback, useState } from "react";
import type { LatLng } from "@/lib/route/geo";

/** Phone GPS via the browser — no API involved. */
export function useMyLocation() {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<"idle" | "locating" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const locate = useCallback((): Promise<LatLng | null> => {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError("This browser can't share location");
      return Promise.resolve(null);
    }
    setStatus("locating");
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setLocation(here);
          setStatus("ok");
          setError(null);
          resolve(here);
        },
        (err) => {
          setStatus("error");
          setError(err.code === err.PERMISSION_DENIED ? "Location permission is off for this site" : "Couldn't get your location");
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
      );
    });
  }, []);

  return { location, status, error, locate };
}
