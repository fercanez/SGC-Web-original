import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "sgc-ficha-workspace-size";

type ResizeMode = "e" | "s" | "se";

interface Size {
  width: number;
  height: number;
}

interface Limits {
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
}

function defaultSize(): Size {
  if (typeof window === "undefined") {
    return { width: 1580, height: 880 };
  }
  return {
    width: Math.min(1580, Math.round(window.innerWidth * 0.98)),
    height: Math.min(920, Math.round(window.innerHeight * 0.88)),
  };
}

function loadSize(): Size {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Size>;
      if (parsed.width && parsed.height) {
        return { width: parsed.width, height: parsed.height };
      }
    }
  } catch {
    /* */
  }
  return defaultSize();
}

function limits(): Limits {
  if (typeof window === "undefined") {
    return { minW: 960, minH: 520, maxW: 1920, maxH: 1200 };
  }
  return {
    minW: 960,
    minH: 520,
    maxW: Math.round(window.innerWidth * 0.99),
    maxH: Math.round(window.innerHeight * 0.94),
  };
}

function clampSize(w: number, h: number): Size {
  const lim = limits();
  return {
    width: Math.min(lim.maxW, Math.max(lim.minW, Math.round(w))),
    height: Math.min(lim.maxH, Math.max(lim.minH, Math.round(h))),
  };
}

export function useFichaWorkspaceResize(active: boolean) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>(() => loadSize());
  const [mapResizeNonce, setMapResizeNonce] = useState(0);
  const dragRef = useRef<{
    mode: ResizeMode;
    startX: number;
    startY: number;
    width: number;
    height: number;
  } | null>(null);

  const bumpMaps = useCallback(() => {
    setMapResizeNonce((n) => n + 1);
  }, []);

  const persist = useCallback((next: Size) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* */
    }
  }, []);

  const startResize = useCallback(
    (mode: ResizeMode, clientX: number, clientY: number) => {
      dragRef.current = {
        mode,
        startX: clientX,
        startY: clientY,
        width: size.width,
        height: size.height,
      };
      document.body.classList.add("ficha-workspace-resizing");
    },
    [size.height, size.width]
  );

  useEffect(() => {
    if (!active) return;

    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      let w = drag.width;
      let h = drag.height;
      if (drag.mode === "e" || drag.mode === "se") w = drag.width + dx;
      if (drag.mode === "s" || drag.mode === "se") h = drag.height + dy;
      setSize(clampSize(w, h));
    }

    function onUp() {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.classList.remove("ficha-workspace-resizing");
      setSize((current) => {
        persist(current);
        return current;
      });
      window.setTimeout(bumpMaps, 80);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("ficha-workspace-resizing");
    };
  }, [active, bumpMaps, persist]);

  useEffect(() => {
    if (!active) return;
    const el = workspaceRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timer = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(bumpMaps, 120);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
    };
  }, [active, bumpMaps]);

  useEffect(() => {
    if (!active) return;
    function onWindowResize() {
      setSize((prev) => clampSize(prev.width, prev.height));
      bumpMaps();
    }
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  }, [active, bumpMaps]);

  return {
    workspaceRef,
    size,
    mapResizeNonce,
    startResize,
  };
}
