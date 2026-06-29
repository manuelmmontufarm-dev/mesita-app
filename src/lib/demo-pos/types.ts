export interface DemoPosMenuItem {
  id: string;
  name: string;
  emoji: string;
  price: number;
  categoryId: string;
  available: boolean;
  posSku?: string;
}

export interface DemoPosCategory {
  id: string;
  name: string;
  order: number;
}

export interface DemoPosExtraTable {
  id: string;
  name: string;
  posExternalId: string | null;
  createdAt: string;
}

export interface DemoPosInvoice {
  id: string;
  tableToken: string;
  tableName: string;
  guestName: string;
  amount: number;
  subtotal: number;
  iva: number;
  service: number;
  tip: number;
  method: string;
  ref: string;
  mode: string;
  source: "app" | "pos";
  createdAt: string;
}

export interface DemoPosActivity {
  id: string;
  type: "table_opened" | "guest_joined" | "payment";
  tableName: string;
  tableToken: string;
  guestName?: string;
  guestCount?: number;
  amount?: number;
  createdAt: string;
}

export interface DemoPosReportPayment {
  id: string;
  amount: number;
  guestName: string;
  method: string;
  viaMesita: boolean;
  ref: string;
  createdAt: string;
}

export interface DemoPosReport {
  id: string;
  tableName: string;
  tableToken: string;
  status: "OPEN" | "PARTIAL" | "PAID" | "CLOSED";
  total: number;
  paid: number;
  mesitaPaid: number;
  posOnlyPaid: number;
  paidViaMesita: boolean;
  live: boolean;
  posDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
  payments: DemoPosReportPayment[];
}

export interface DemoPosConfig {
  categories: DemoPosCategory[];
  menuItems: DemoPosMenuItem[];
  extraTables: DemoPosExtraTable[];
  updatedAt: string;
}

export interface DemoPosQrTable {
  slug: string;
  token: string;
  name: string;
  payUrl: string;
  posExternalId: string;
  live: true;
  scenarioDescription: string;
}

export interface DemoPosTableRow {
  id: string;
  name: string;
  token?: string;
  slug?: string;
  payUrl?: string;
  posExternalId: string | null;
  live: boolean;
  kind: "qr" | "demo" | "custom";
  status: "open" | "paying" | "closed";
  guestCount: number;
  total: number;
  billTotal: number;
  paidAmount: number;
}
