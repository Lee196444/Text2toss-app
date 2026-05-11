import { useEffect, useState } from "react";
import axios from "axios";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const DEFAULT_FEES = { same_day: 75, next_slot: 40, emergency: 100 };

// Module-level cache so multiple components don't re-fetch on every mount.
let cached = null;
let inflight = null;

/**
 * Fetches priority pickup pricing config from the backend. Falls back to
 * sensible defaults if the API is unreachable so the UI never blocks.
 *
 * @returns {{ fees: Record<string, number>, maxPerDay: number, loading: boolean }}
 */
export default function usePriorityConfig() {
  const [state, setState] = useState(
    cached || { fees: DEFAULT_FEES, maxPerDay: 2, loading: true }
  );

  useEffect(() => {
    if (cached) {
      setState({ ...cached, loading: false });
      return;
    }
    if (!inflight) {
      inflight = axios
        .get(`${API}/priority/config`)
        .then((res) => {
          cached = {
            fees: { ...DEFAULT_FEES, ...(res.data?.fees || {}) },
            maxPerDay: res.data?.max_per_day ?? 2,
          };
          return cached;
        })
        .catch(() => {
          // Network error → keep defaults but don't cache, so we retry next mount
          return { fees: DEFAULT_FEES, maxPerDay: 2 };
        })
        .finally(() => {
          // Allow future refetches if cached was never set (error path)
          if (!cached) inflight = null;
        });
    }
    let active = true;
    inflight.then((cfg) => {
      if (active) setState({ ...cfg, loading: false });
    });
    return () => { active = false; };
  }, []);

  return state;
}

export { DEFAULT_FEES };
