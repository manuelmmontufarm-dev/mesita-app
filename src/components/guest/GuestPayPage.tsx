"use client";

import { useMemo } from "react";

import { isDemoTableToken } from "@/lib/demo-restaurant";

import { GuestBillFlow } from "@/components/guest/flow/GuestBillFlow";
import { useLiveTableSession } from "@/hooks/useLiveTableSession";
import type { FlowInit, PaidPayload } from "@/hooks/useGuestPaymentFlow";

import "@/app/pay/customer.css";

interface GuestPayPageProps {
  token: string;
}

export function GuestPayPage({ token }: GuestPayPageProps) {
  const live = useLiveTableSession(token);

  const paidIds = useMemo(
    () =>
      live.state?.guests
        .filter((g) => g.status === "PAID")
        .map((g) => g.id) ?? [],
    [live.state?.guests],
  );

  const init: FlowInit = useMemo(
    () => ({
      initialMode: "item",
      initialTip: 15,
      initialPeople: Math.max(1, live.people),
      initialClaims: live.claims,
      initialPaidItemIds: live.paidItemIds,
      initialPaidIds: paidIds,
    }),
    [live.claims, live.paidItemIds, live.people, paidIds],
  );

  const onPaid = async (payload: PaidPayload) => {
    if (!live.billId) return;
    const demoMode = isDemoTableToken(token);
    const paymentToken =
      payload.paymentToken ?? (demoMode ? `demo:${payload.card.last4}` : undefined);
    if (!paymentToken && !demoMode) {
      throw new Error("Pagos en vivo aún no están disponibles para este restaurante.");
    }
    const res = await fetch(`/api/bills/${live.billId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: payload.amount,
        tableToken: token,
        idempotencyKey: crypto.randomUUID(),
        splitMode: payload.splitMode ?? "FULL",
        selectedItemIds: payload.selectedItemIds,
        equalSplitPeople: payload.equalSplitPeople,
        voluntaryTipAmount: payload.voluntaryTipAmount ?? 0,
        guestSessionId: live.guestSessionId ?? undefined,
        ...(paymentToken
          ? { paymentToken, kushkiToken: paymentToken }
          : {}),
        checkoutMode:
          payload.eInvoice == null ? "CONSUMIDOR_FINAL" : "FACTURA_CON_DATOS",
        guestData: payload.eInvoice
          ? {
              identificacion: payload.eInvoice.idNumber,
              nombre: payload.eInvoice.legalName,
              email: payload.eInvoice.email,
            }
          : undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Payment failed: ${res.status}`);
    }
  };

  return (
    <GuestBillFlow
      items={live.items}
      members={live.members}
      config={live.config}
      init={init}
      youId={live.guestSessionId ?? undefined}
      onPaid={onPaid}
      externalLoading={live.loading}
      externalError={live.error}
      liveSession={live.liveSession}
      serverSync={
        live.state
          ? {
              version: live.version,
              claims: live.claims,
              paidItemIds: live.paidItemIds,
              paidIds,
              people: live.people,
            }
          : undefined
      }
    />
  );
}
