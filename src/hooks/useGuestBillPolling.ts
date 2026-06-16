'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Bill, BillItem, Restaurant, Table } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

interface BillBreakdown {
  subtotal: Decimal;
  propina: Decimal;
  iva: Decimal;
  total: Decimal;
}

interface UseGuestBillPollingReturn {
  bill: Bill | null;
  restaurant: Restaurant | null;
  table: Table | null;
  items: BillItem[];
  breakdown: BillBreakdown | null;
  /** Server-computed amount still owed on the bill (POS-authoritative when available). */
  remainingBalance: number | null;
  loading: boolean;
  error: string | null;
}

const FINAL_STATUSES = ['FULLY_PAID', 'REFUNDED'];

export function useGuestBillPolling(
  token: string,
  enabled: boolean = true
): UseGuestBillPollingReturn {
  const [bill, setBill] = useState<Bill | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [items, setItems] = useState<BillItem[]>([]);
  const [breakdown, setBreakdown] = useState<BillBreakdown | null>(null);
  const [remainingBalance, setRemainingBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isFinalRef = useRef(false);
  // After a 429, skip polls until this timestamp (simple backoff so we stop
  // hammering a rate-limited endpoint instead of retrying every 4s).
  const backoffUntilRef = useRef(0);

  const fetchBill = useCallback(async () => {
    if (isFinalRef.current) return;

    try {
      const response = await fetch(`/api/guest/bill/${token}`);

      // 429 = rate-limited: a TRANSIENT condition, never a bill state. Keep the
      // last good data (or the loading state on first fetch), back off briefly,
      // and keep polling — never show "Sin cuenta abierta" because of a 429.
      if (response.status === 429) {
        backoffUntilRef.current = Date.now() + 10_000;
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        setBill(prev => {
          if (prev === null) setError(data.error || 'Error fetching bill');
          return prev;
        });
        setLoading(false);
        return;
      }

      if (data.success && data.data) {
        const fetchedBill = data.data.bill;
        setBill(fetchedBill);
        setRestaurant(data.data.restaurant);
        setTable(data.data.table);
        setItems(data.data.items || []);
        setBreakdown(data.data.breakdown);
        setRemainingBalance(
          typeof data.data.remainingBalance === 'number' ? data.data.remainingBalance : null
        );
        setError(null);
        setLoading(false);

        // MED-05: Stop polling once bill reaches a final state
        if (FINAL_STATUSES.includes(fetchedBill?.status)) {
          isFinalRef.current = true;
        }
      } else {
        setBill(prev => {
          if (prev === null) setError(data.error || 'No bill found');
          return prev;
        });
        setLoading(false);
      }
    } catch (err) {
      console.error('Error polling bill:', err);
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!enabled) return;

    isFinalRef.current = false;
    fetchBill();

    const interval = setInterval(() => {
      if (!document.hidden && !isFinalRef.current && Date.now() >= backoffUntilRef.current) {
        fetchBill();
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [token, enabled, fetchBill]);

  return { bill, restaurant, table, items, breakdown, remainingBalance, loading, error };
}
