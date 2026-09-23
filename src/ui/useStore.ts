import { createContext, useContext, useSyncExternalStore } from "react";
import type { Store, StoreState } from "@/store/store";

export const StoreContext = createContext<Store | null>(null);

export function useStoreApi(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error("StoreContext missing");
  return s;
}

export function useAppState(): StoreState {
  const store = useStoreApi();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
