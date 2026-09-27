import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { MapPin } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const newToken = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);

// Google Places suggestions fetched through the backend (key stays server-side).
// Wraps any input: shows a dropdown under it and calls onPick(fullAddress).
export default function AddressSuggestions({ value, onPick, children }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const tokenRef = useRef(newToken());
  const pickedRef = useRef("");
  const boxRef = useRef(null);

  useEffect(() => {
    const q = (value || "").trim();
    if (q.length < 4 || q === pickedRef.current) { setItems([]); setOpen(false); return undefined; }
    const t = setTimeout(async () => {
      try {
        const res = await axios.get(`${API}/places/suggest`, { params: { q, session: tokenRef.current } });
        const list = res.data?.suggestions || [];
        setItems(list); setOpen(list.length > 0); setActive(-1);
      } catch (e) {
        setItems([]); setOpen(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (s) => {
    pickedRef.current = s.description;
    tokenRef.current = newToken();
    setOpen(false); setItems([]);
    onPick(s.description);
  };

  const onKeyDown = (e) => {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(items[active]); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative" onKeyDown={onKeyDown}>
      {children}
      {open && (
        <ul data-testid="address-suggestions" role="listbox" className="absolute z-30 left-0 right-0 mt-1 bg-white border-2 border-cyan-300 rounded-xl shadow-xl overflow-hidden">
          {items.map((s, i) => (
            <li key={s.place_id || s.description}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                data-testid={`address-suggestion-${i}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className={`w-full text-left px-3 py-2 flex items-start gap-2 text-sm ${i === active ? "bg-cyan-50" : "hover:bg-cyan-50"}`}
              >
                <MapPin className="w-4 h-4 text-cyan-600 flex-shrink-0 mt-0.5" />
                <span className="min-w-0">
                  <span className="font-semibold text-gray-900 block truncate">{s.main || s.description}</span>
                  {s.secondary && <span className="text-xs text-gray-500 block truncate">{s.secondary}</span>}
                </span>
              </button>
            </li>
          ))}
          <li className="px-3 py-1 text-[10px] text-gray-400 border-t bg-gray-50">Suggestions by Google</li>
        </ul>
      )}
    </div>
  );
}
