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

export interface DemoPosReportConsumption {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  documentId: string;
  documentType: string;
  fecha: string;
}

export interface DemoPosReportDocument {
  id: string;
  tipo: string;
  estado: string;
  descripcion: string | null;
  fecha: string;
  total: number;
  consumptions: DemoPosReportConsumption[];
  payments: DemoPosReportPayment[];
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
  consumptions: DemoPosReportConsumption[];
  documents: DemoPosReportDocument[];
}

export interface DemoPosReportsPayload {
  date: string;
  posConnected: boolean;
  posError: string | null;
  reports: DemoPosReport[];
}

export interface DemoPosConfig {
  categories: DemoPosCategory[];
  menuItems: DemoPosMenuItem[];
  extraTables: DemoPosExtraTable[];
  settings: DemoPosSettings;
  updatedAt: string;
}

export interface DemoPosSettings {
  restaurant: {
    name: string;
    nombreComercial: string;
    city: string;
    ruc: string;
    direccion: string;
    email: string;
    phone: string;
  };
  posMesita: {
    enabled: boolean;
    environment: "SANDBOX" | "PRODUCTION";
    syncMenu: boolean;
    syncTables: boolean;
    syncBilling: boolean;
  };
  payments: {
    enabled: boolean;
    environment: "SANDBOX" | "PRODUCTION";
  };
  fiscal: {
    establecimientoCodigo: string;
    puntoEmisionCodigo: string;
    regimen: string;
    obligadoContabilidad: boolean;
  };
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
