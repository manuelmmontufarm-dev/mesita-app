'use client';

/**
 * Customer payment route — Step 3 scaffold wiring.
 *
 * Previous implementation lives in git history; it is being progressively
 * replaced by `GuestBillFlow` (the new state-machine-driven flow) over Steps
 * 3–7. This step keeps the existing data layer (`useGuestBillPolling`) and the
 * `/api/bills/[id]/pay` backend contract intact, and routes UI through the new
 * scaffold so subsequent steps only need to refine the stage components.
 */

import { use, useMemo } from 'react';

import { GuestBillFlow } from '@/components/guest/flow/GuestBillFlow';
import { useGuestBillPolling } from '@/hooks/useGuestBillPolling';
import { useMultiGuestState } from '@/hooks/useMultiGuestState';
import type { FlowInit, PaidPayload } from '@/hooks/useGuestPaymentFlow';
import type {
  BillItem as GuestBillItem,
  RestaurantConfig,
  TableMember,
} from '@/lib/guest-billing';
import {
  AVATAR_HUE_YOU,
  guestAvatarHue,
  initialsFor,
} from '@/lib/guest-billing/split-math';
import { IVA_RATE, PROPINA_RATE } from '@/lib/constants/ecuador-tax';

import '../customer.css';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function GuestBillPage({ params }: PageProps) {
  const { token } = use(params);

  const {
    bill,
    restaurant,
    table,
    items,
    loading,
    error,
  } = useGuestBillPolling(token, true);

  const { guestUuid, displayName, guestIndex, allGuests } =
    useMultiGuestState(token);

  // Map Prisma bill items → guest-billing domain items.
  const guestItems: GuestBillItem[] = useMemo(
    () =>
      items.map((it) => ({
        id: it.id,
        name: it.name,
        qty: it.quantity,
        unitPrice: Number(it.price),
      })),
    [items],
  );

  // Build a `RestaurantConfig` from the polled restaurant + Ecuadorian
  // tax constants. POS-integrated bills will override totals downstream.
  const config: RestaurantConfig = useMemo(
    () => ({
      name: restaurant?.name ?? 'Mesita',
      table: table?.name ?? '',
      currency: 'USD',
      ivaRate: IVA_RATE,
      serviceRate: PROPINA_RATE,
      serviceEnabled: true,
      tipPresets: [0, 10, 15, 20],
      defaultTip: 15,
    }),
    [restaurant?.name, table?.name],
  );

  // The set of payers visible at the table (live session roster).
  const members: TableMember[] = useMemo(() => {
    if (!allGuests.length) {
      return [
        {
          id: guestUuid || 'you',
          name: displayName || `P${guestIndex || 1}`,
          initials: 'Tú',
          hue: AVATAR_HUE_YOU,
          isYou: true,
        },
      ];
    }
    return allGuests.map((g, idx) => ({
      id: g.guestUuid,
      name: g.displayName || `P${idx + 1}`,
      initials: initialsFor(g.displayName || `P${idx + 1}`),
      hue: g.guestUuid === guestUuid ? AVATAR_HUE_YOU : guestAvatarHue(idx),
      isYou: g.guestUuid === guestUuid,
    }));
  }, [allGuests, guestUuid, displayName, guestIndex]);

  const init: FlowInit = useMemo(
    () => ({
      initialMode: 'item',
      initialTip: 15,
      initialPeople: Math.max(1, allGuests.length || 1),
    }),
    [allGuests.length],
  );

  // Backend payment contract.
  // NOTE: Step 4 will wire the Kushki tokenization step inside the
  // `PaymentStage` component. Until then this stub posts a placeholder
  // token so the call site is exercised end-to-end during development.
  const onPaid = async (payload: PaidPayload) => {
    if (!bill) return;
    const res = await fetch(`/api/bills/${bill.id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: payload.amount,
        tableToken: token,
        idempotencyKey: crypto.randomUUID(),
        splitMode: 'FULL',
        voluntaryTipAmount: undefined,
        checkoutMode:
          payload.eInvoice == null ? 'CONSUMIDOR_FINAL' : 'FACTURA_CON_DATOS',
        guestData: payload.eInvoice
          ? {
              identificacion: payload.eInvoice.idNumber,
              nombre: payload.eInvoice.legalName,
              email: payload.eInvoice.email,
            }
          : undefined,
        // Placeholder — replaced with real Kushki token in Step 4.
        kushkiToken: 'PENDING_STEP_4',
      }),
    });
    if (!res.ok) {
      throw new Error(`Payment failed: ${res.status}`);
    }
  };

  const externalError =
    error === 'TABLE_NOT_FOUND'
      ? 'Este código QR ya no está activo.'
      : error || (!loading && !bill ? 'Sin cuenta abierta.' : null);

  return (
    <GuestBillFlow
      items={guestItems}
      members={members}
      config={config}
      init={init}
      youId={guestUuid || 'you'}
      onPaid={onPaid}
      externalLoading={loading}
      externalError={externalError}
    />
  );
}
