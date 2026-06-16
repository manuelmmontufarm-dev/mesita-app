'use client';

/**
 * Demo route — renders the new `GuestBillFlow` scaffold with mock data so the
 * state machine can be exercised end-to-end without a backend.
 *
 * Note: `DemoPayExperience` is intentionally kept (and still importable) until
 * the new flow reaches parity in later steps.
 */

import { GuestBillFlow } from '@/components/guest/flow/GuestBillFlow';
import type {
  BillItem,
  RestaurantConfig,
  TableMember,
} from '@/lib/guest-billing';
import type { FlowInit, PaidPayload } from '@/hooks/useGuestPaymentFlow';

import '../customer.css';

const DEMO_ITEMS: BillItem[] = [
  { id: 'locro', name: 'Locro de papa', emoji: '🥣', qty: 1, unitPrice: 4.5 },
  { id: 'seco', name: 'Seco de chivo', emoji: '🍖', qty: 1, unitPrice: 8.9 },
  { id: 'encebollado', name: 'Encebollado', emoji: '🐟', qty: 1, unitPrice: 6 },
  { id: 'ceviche', name: 'Ceviche de camarón', emoji: '🦐', qty: 1, unitPrice: 9.5 },
  { id: 'jugo-1', name: 'Jugo de naranjilla', emoji: '🧃', qty: 2, unitPrice: 2.5 },
  { id: 'club', name: 'Club Verde', emoji: '🍺', qty: 2, unitPrice: 2.75 },
];

const DEMO_MEMBERS: TableMember[] = [
  { id: 'you', name: 'Tú', initials: 'Tú', hue: 160, isYou: true },
  { id: 'p2', name: 'P2', initials: 'P2', hue: 22 },
  { id: 'p3', name: 'P3', initials: 'P3', hue: 280 },
];

const DEMO_CONFIG: RestaurantConfig = {
  name: 'Mesita Demo',
  tagline: 'Comida ecuatoriana',
  table: '12',
  city: 'Quito',
  currency: 'USD',
  ivaRate: 0.15,
  serviceRate: 0.1,
  serviceEnabled: true,
  tipPresets: [0, 10, 15, 20],
  defaultTip: 0,
};

const DEMO_INIT: FlowInit = {
  initialMode: 'item',
  initialTip: 0,
  initialPeople: 3,
};

export default function DemoPayPage() {
  const onPaid = async (payload: PaidPayload) => {
    // Demo only — no backend side effects, just log so devs can verify the
    // state machine handed off the expected payload.
    if (typeof window !== 'undefined') {
      console.info('[demo] onPaid', payload);
    }
  };

  return (
    <GuestBillFlow
      items={DEMO_ITEMS}
      members={DEMO_MEMBERS}
      config={DEMO_CONFIG}
      init={DEMO_INIT}
      youId="you"
      onPaid={onPaid}
      externalLoading={false}
      externalError={null}
    />
  );
}
