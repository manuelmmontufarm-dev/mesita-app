"use client";

import { useMemo } from "react";

import { GuestBillFlow } from "@/components/guest/flow/GuestBillFlow";
import { useDemoTableSession } from "@/hooks/useDemoTableSession";
import { useLiveTableSession } from "@/hooks/useLiveTableSession";
import type { FlowInit, PaidPayload } from "@/hooks/useGuestPaymentFlow";
import { mapSplitModeToDemo } from "@/lib/demo-live-adapter";
import { isDemoTableToken } from "@/lib/demo-restaurant";

import "@/app/pay/customer.css";

interface GuestPayPageProps {
  token: string;
}

function GuestPayShell({
  token,
  live,
  isDemo,
}: {
  token: string;
  live: ReturnType<typeof useLiveTableSession> | ReturnType<typeof useDemoTableSession>;
  isDemo: boolean;
}) {
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
    if (isDemo) {
      if (!live.guestSessionId) return;
      const subtotal = payload.amount / 1.25;
      const res = await fetch(`/api/demo/table/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "pay",
          guestId: live.guestSessionId,
          guestName: payload.eInvoice?.legalName ?? "Invitado",
          mode: mapSplitModeToDemo(payload.splitMode),
          amount: payload.amount,
          subtotal,
          iva: subtotal * 0.15,
          service: subtotal * 0.1,
          tip: payload.voluntaryTipAmount ?? 0,
          itemIds: payload.selectedItemIds ?? [],
          equalPeople: payload.equalSplitPeople,
          method: "Tarjeta demo",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Payment failed: ${res.status}`);
      }
      return;
    }

    if (!live.billId) return;
    const paymentToken =
      payload.paymentToken ?? (isDemoTableToken(token) ? `demo:${payload.card.last4}` : undefined);
    if (!paymentToken) {
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
        paymentToken,
        kushkiToken: paymentToken,
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
              resetSeq: "resetSeq" in live ? live.resetSeq : undefined,
              claims: live.claims,
              paidItemIds: live.paidItemIds,
              paidIds,
              people: live.people,
            }
          : undefined
      }
      onResetDemo={isDemo && "resetDemo" in live ? live.resetDemo : undefined}
    />
  );
}

export function GuestPayPage({ token }: GuestPayPageProps) {
  if (isDemoTableToken(token)) {
    return <GuestDemoPayPage token={token} />;
  }
  return <GuestLivePayPage token={token} />;
}

function GuestDemoPayPage({ token }: { token: string }) {
  const live = useDemoTableSession(token);
  return <GuestPayShell token={token} live={live} isDemo />;
}

function GuestLivePayPage({ token }: { token: string }) {
  const live = useLiveTableSession(token);
  return <GuestPayShell token={token} live={live} isDemo={false} />;
}
