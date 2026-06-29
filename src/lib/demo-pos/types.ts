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
}
