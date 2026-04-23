"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Accretes a rolling window of real observed values. Each call with a new
 * `value` appends it (if changed); older samples slide off once the window
 * is full. Initial state is the value repeated `length` times so the
 * sparkline has something stable to render immediately.
 *
 * This is the honest substitute for Hexmesh's `useLiveSeries` random walk:
 * we only ever plot values we actually observed from the backend.
 */
export function useRollingSeries(value: number | null | undefined, length = 40) {
  const [series, setSeries] = useState<number[]>(() =>
    value == null || Number.isNaN(value) ? [] : Array(length).fill(value),
  );
  const lastRef = useRef<number | null>(
    value == null || Number.isNaN(value) ? null : value,
  );

  useEffect(() => {
    if (value == null || Number.isNaN(value)) return;
    if (lastRef.current === value) return;
    lastRef.current = value;
    setSeries((prev) => {
      if (prev.length === 0) return Array(length).fill(value);
      return [...prev.slice(1), value];
    });
  }, [value, length]);

  return series;
}
