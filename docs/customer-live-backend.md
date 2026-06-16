# Customer Live Backend Contract

This backend contract exists to support the Claude Design customer flow in
`/Users/manue/Downloads/MesiraQR-handoff (2).zip`.

## Frontend State Required by the Claude Flow

The customer UI needs more than a bill:

- active restaurant/table/bill context
- POS-owned bill items and totals
- a live roster of guests at the table, labelled `P1`, `P2`, `P3`, etc.
- editable guest names that propagate to other phones
- guest status: selecting, reviewing, in payment, paid, left
- live item claims, including fractional units for shared dishes
- paid item/payment state
- receipt/factura data that explains how the guest paid:
  - by selected items, including item names and amounts
  - by equal split, including people count
  - by full remaining bill

## Persistence Added

- `BillGuestSession`: one browser/device participant in an active bill session.
- `BillItemClaim`: live "who claimed what" state per bill item and guest.
- `PaymentBillItem`: immutable item snapshot for receipts/facturas.
- `Payment.guestSessionId`: connects a payment to the guest who made it.
- `Payment.equalSplitPeople`: keeps equal split count for receipt copy.

The POS still owns order lines and authoritative totals. These models only store
collaboration state and payment/receipt metadata around the POS bill.

## Public Guest API

`GET /api/guest/table-session/[token]`

Returns the full live table state for the active bill behind a table QR token:
restaurant, table, bill, items, guests, claims, payments, and a numeric `version`.

`POST /api/guest/table-session/[token]`

Actions:

- `join`: assign or resume a guest session.
- `rename`: update guest display name.
- `status`: update guest status.
- `claim-item`: claim units of a bill item.
- `release-item`: release this guest's claim on a bill item.

`GET /api/guest/table-session/[token]/events`

Server-sent event stream that emits the same table state whenever `version`
changes. This is enough for local phone review and early product testing. For a
scaled hosted deployment, replace the polling loop with Redis pub/sub, database
notifications, or a managed realtime provider.

## Payment Integration

`POST /api/bills/[billId]/pay` now accepts optional `guestSessionId`.

When provided:

- the payment is linked to that guest session
- the guest is marked `PAID`
- selected/full item payments snapshot item names, units, prices, and amounts in
  `PaymentBillItem`
- selected item claims by that guest are marked `PAID`
- equal split payments store `equalSplitPeople`

This gives the receipt drawer enough structured data to show the exact payment
mode and details without parsing free-form text.
