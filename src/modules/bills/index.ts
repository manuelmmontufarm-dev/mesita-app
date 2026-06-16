// POS-sourced bills (D-07): when Bill.posTotal is non-null it is authoritative —
// calculateRemainingBalance uses it directly; TAX_MULTIPLIER math is fallback only.
export {
  calculateBillBreakdown,
  calculateRemainingBalance,
  determineBillStatus,
  sumNetPayments,
} from "./application/bill.service";
