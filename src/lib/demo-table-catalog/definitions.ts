import type { DemoFoodItem } from "@/lib/demo-table-store";

export interface DemoTableDefinition {
  slug: string;
  token: string;
  restaurant: {
    name: string;
    tagline: string;
    city: string;
    ivaRate: number;
    serviceRate: number;
    serviceEnabled: boolean;
  };
  table: { name: string };
  /** POS mesa id (e.g. mesa-01, mesa-12). */
  posMesaId: string;
  items: DemoFoodItem[];
  seed?: {
    paidItemIds?: string[];
    claims?: Record<string, string>;
    itemPaidUnits?: Record<string, number>;
  };
  scenarioDescription: string;
  operatorNotes: string[];
}

const DONA_PEPA = {
  name: "La Doña Pepa",
  tagline: "Comida casera ecuatoriana",
  city: "Quito",
  ivaRate: 0.15,
  serviceRate: 0.1,
  serviceEnabled: true,
} as const;

/** Identical to current `/pay/demo` hardcoded state. Do not change. */
const DEFAULT_ITEMS: DemoFoodItem[] = [
  { id: "locro", name: "Locro de papa", note: "", emoji: "🥣", qty: 1, unitPrice: 4.5 },
  { id: "seco", name: "Seco de chivo", note: "", emoji: "🍖", qty: 1, unitPrice: 8.9 },
  { id: "encebollado", name: "Encebollado", note: "", emoji: "🐟", qty: 1, unitPrice: 6 },
  { id: "ceviche", name: "Ceviche de camarón", note: "", emoji: "🦐", qty: 1, unitPrice: 9.5 },
  { id: "jugo-1", name: "Jugo de naranjilla", note: "", emoji: "🧃", qty: 1, unitPrice: 2.5 },
  { id: "jugo-2", name: "Jugo de naranjilla", note: "", emoji: "🧃", qty: 1, unitPrice: 2.5 },
  { id: "club-1", name: "Club Verde", note: "", emoji: "🍺", qty: 1, unitPrice: 2.75 },
  { id: "club-2", name: "Club Verde", note: "", emoji: "🍺", qty: 1, unitPrice: 2.75 },
];

const MESA_1_ITEMS: DemoFoodItem[] = [
  { id: "bolon", name: "Bolón de verde", note: "", emoji: "🥟", qty: 1, unitPrice: 4.25 },
  { id: "churrasco", name: "Churrasco", note: "", emoji: "🥩", qty: 1, unitPrice: 9.5 },
  { id: "llapingachos", name: "Llapingachos", note: "", emoji: "🥔", qty: 1, unitPrice: 6.75 },
  { id: "jugo-mora", name: "Jugo de mora", note: "", emoji: "🧃", qty: 1, unitPrice: 2.5 },
  { id: "agua", name: "Agua sin gas", note: "", emoji: "💧", qty: 1, unitPrice: 1.25 },
  { id: "cerveza", name: "Cerveza Pilsener", note: "", emoji: "🍺", qty: 1, unitPrice: 2.75 },
];

const MESA_2_ITEMS: DemoFoodItem[] = [
  { id: "fritada", name: "Fritada", note: "", emoji: "🍖", qty: 1, unitPrice: 8.5 },
  { id: "tigrillo", name: "Tigrillo", note: "", emoji: "🍳", qty: 1, unitPrice: 5.5 },
  { id: "empanada", name: "Empanada de viento", note: "", emoji: "🥟", qty: 2, unitPrice: 2.25 },
  { id: "cola", name: "Cola nacional", note: "", emoji: "🥤", qty: 1, unitPrice: 1.75 },
  { id: "cafe", name: "Café pasado", note: "", emoji: "☕", qty: 1, unitPrice: 2.0 },
  { id: "humita", name: "Humita", note: "", emoji: "🌽", qty: 1, unitPrice: 3.25 },
];

const MESA_3_ITEMS: DemoFoodItem[] = [
  { id: "ceviche-mixto", name: "Ceviche mixto", note: "", emoji: "🦐", qty: 2, unitPrice: 10.5 },
  { id: "encocado", name: "Encocado de pescado", note: "", emoji: "🐟", qty: 1, unitPrice: 9.75 },
  { id: "seco-pollo", name: "Seco de pollo", note: "", emoji: "🍗", qty: 1, unitPrice: 7.5 },
  { id: "arroz-marinero", name: "Arroz marinero", note: "", emoji: "🍚", qty: 1, unitPrice: 11.0 },
  { id: "patacones", name: "Patacones", note: "", emoji: "🥔", qty: 2, unitPrice: 3.0 },
  { id: "cerveza-club", name: "Cerveza Club Verde", note: "", emoji: "🍺", qty: 3, unitPrice: 2.75 },
  { id: "jugo-maracuya", name: "Jugo de maracuyá", note: "", emoji: "🧃", qty: 2, unitPrice: 2.5 },
  { id: "agua-con-gas", name: "Agua con gas", note: "", emoji: "💧", qty: 1, unitPrice: 1.5 },
  { id: "tres-leches", name: "Tres leches", note: "", emoji: "🍰", qty: 2, unitPrice: 4.0 },
];

const MESA_4_ITEMS: DemoFoodItem[] = [
  { id: "parrillada", name: "Parrillada para dos", note: "", emoji: "🍖", qty: 1, unitPrice: 22.5 },
  { id: "langostinos", name: "Langostinos al ajillo", note: "", emoji: "🦐", qty: 1, unitPrice: 14.5 },
  { id: "arroz-verde", name: "Arroz verde", note: "", emoji: "🍚", qty: 1, unitPrice: 3.5 },
  { id: "ensalada", name: "Ensalada de la casa", note: "", emoji: "🥗", qty: 1, unitPrice: 4.75 },
  { id: "vino", name: "Copa de vino tinto", note: "", emoji: "🍷", qty: 2, unitPrice: 5.5 },
  { id: "postre-choco", name: "Volcán de chocolate", note: "", emoji: "🍫", qty: 1, unitPrice: 5.25 },
];

export const DEMO_TABLE_DEFINITIONS: DemoTableDefinition[] = [
  {
    slug: "default",
    token: "demo",
    restaurant: { ...DONA_PEPA },
    table: { name: "12" },
    posMesaId: "mesa-12",
    items: DEFAULT_ITEMS,
    scenarioDescription: "Baseline — escenario actual de `/pay/demo`.",
    operatorNotes: [
      "Misma mesa que ha estado en producción.",
      "Útil como control: confirma que cambios nuevos no rompen el flujo conocido.",
    ],
  },
  {
    slug: "mesa-1",
    token: "demo-mesa-1",
    restaurant: { ...DONA_PEPA },
    table: { name: "1" },
    posMesaId: "mesa-01",
    items: MESA_1_ITEMS,
    scenarioDescription:
      "Mesa limpia — prueba join + split by item + pay desde cero.",
    operatorNotes: [
      "Almuerzo clásico sin pagos previos.",
      "Ideal para mostrar el flujo end-to-end básico.",
    ],
  },
  {
    slug: "mesa-2",
    token: "demo-mesa-2",
    restaurant: { ...DONA_PEPA },
    table: { name: "2" },
    posMesaId: "mesa-02",
    items: MESA_2_ITEMS,
    scenarioDescription:
      "Pagos parciales — prueba % progreso y gracias parcial sin cerrar mesa.",
    operatorNotes: [
      "Fritada ya pagada, una empanada de las dos ya pagada.",
      "Demostración de pagos a medias: UI debe mostrar progreso parcial.",
    ],
    seed: {
      paidItemIds: ["fritada"],
      itemPaidUnits: { empanada: 1 },
    },
  },
  {
    slug: "mesa-3",
    token: "demo-mesa-3",
    restaurant: { ...DONA_PEPA },
    table: { name: "3" },
    posMesaId: "mesa-03",
    items: MESA_3_ITEMS,
    scenarioDescription:
      "Cuenta larga — prueba scroll bill, dock, recibo, performance sync.",
    operatorNotes: [
      "9 ítems con cantidades >1 (3 cervezas, 2 ceviches, 2 jugos, 2 patacones, 2 postres).",
      "Sirve para ver scroll de la cuenta y desempeño del sync en multi-dispositivo.",
    ],
  },
  {
    slug: "mesa-4",
    token: "demo-mesa-4",
    restaurant: { ...DONA_PEPA },
    table: { name: "4" },
    posMesaId: "mesa-04",
    items: MESA_4_ITEMS,
    scenarioDescription:
      "Modo Todo — cuenta ≥$50, factura obligatoria, cierre mesa.",
    operatorNotes: [
      "Total ≥ $50 ⇒ activa el flujo de factura.",
      "Usar para demo del modal de facturación + cierre total de mesa.",
    ],
  },
];
