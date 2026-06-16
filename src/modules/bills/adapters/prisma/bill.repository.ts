import { prisma } from "@/lib/db";
import { toNumberSafe } from "@/lib/money";
import type { BillRepository, BillSnapshot, BillPosInfo } from "../../domain/bill.repository";

export class PrismaBillRepository implements BillRepository {
  async findSnapshot(billId: string): Promise<BillSnapshot | null> {
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: { items: true, payments: { where: { status: "COMPLETED" } } },
    });
    if (!bill) return null;
    return {
      id: bill.id,
      posDocumentId: bill.posDocumentId,
      posTotal: bill.posTotal == null ? null : toNumberSafe(bill.posTotal),
      items: bill.items.map((i) => ({
        id: i.id,
        isPaid: i.isPaid,
        price: toNumberSafe(i.price),
        quantity: i.quantity,
      })),
      payments: bill.payments.map((p) => ({ id: p.id, status: p.status })),
      equalSplitPeople: bill.equalSplitPeople,
      equalSharesPaid: bill.equalSharesPaid,
      invoiceRecipientPaymentId: bill.invoiceRecipientPaymentId,
    };
  }

  async findPosInfo(billId: string): Promise<BillPosInfo | null> {
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      select: { posDocumentId: true, posToken: true },
    });
    if (!bill?.posDocumentId) return null;
    return { posDocumentId: bill.posDocumentId, posToken: bill.posToken ?? null };
  }
}
