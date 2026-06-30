import { PrismaClient, UserRole, BillStatus, SplitMode, PaymentStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

const HASH = (pw: string) => bcrypt.hashSync(pw, 10);
const id = () => randomUUID();

/** Production-safe: Mesita Demo restaurant, owner, demo table + bill for /pay/demo */
async function seedMinimal() {
  console.log("🌱 Seeding minimal (production-safe) data…");

  const restaurant = await prisma.restaurant.upsert({
    where: { name: "Mesita Demo" },
    update: { paymentsEnabled: true, invoiceMode: "DISABLED", status: "ACTIVE" },
    create: {
      id: "rest-mesita-demo",
      name: "Mesita Demo",
      slug: "mesita-demo",
      address: "Quito, Ecuador",
      status: "ACTIVE",
      paymentsEnabled: true,
      invoiceMode: "DISABLED",
    },
  });

  await prisma.user.upsert({
    where: { email: "owner@mesita.demo" },
    update: {},
    create: {
      id: "user-mesita-demo-owner",
      name: "Demo Owner",
      email: "owner@mesita.demo",
      password: HASH("Demo1234!"),
      role: UserRole.OWNER,
      restaurantId: restaurant.id,
    },
  });

  await prisma.table.upsert({
    where: { token: "demo" },
    update: { name: "12", restaurantId: restaurant.id, posExternalId: "12" },
    create: {
      id: "tbl-mesita-demo",
      name: "12",
      token: "demo",
      posExternalId: "12",
      restaurantId: restaurant.id,
    },
  });

  await prisma.payment.deleteMany({ where: { restaurantId: restaurant.id } });
  await prisma.billGuestSession.deleteMany({
    where: { bill: { restaurantId: restaurant.id } },
  });
  await prisma.billItemClaim.deleteMany({
    where: { bill: { restaurantId: restaurant.id } },
  });
  await prisma.billItem.deleteMany({ where: { restaurantId: restaurant.id } });
  await prisma.bill.deleteMany({ where: { restaurantId: restaurant.id } });

  const now = new Date();
  const minsAgo = (n: number) => new Date(now.getTime() - n * 60_000);
  const demoLocroId = "demo-item-locro";
  const demoBillId = "bill-mesita-demo";

  await prisma.bill.create({
    data: {
      id: demoBillId,
      tableId: "tbl-mesita-demo",
      restaurantId: restaurant.id,
      status: BillStatus.PARTIALLY_PAID,
      createdAt: minsAgo(5),
      items: {
        create: [
          {
            id: demoLocroId,
            name: "Locro de papa",
            price: 4.5,
            quantity: 1,
            isPaid: true,
            paidAt: minsAgo(3),
            restaurantId: restaurant.id,
          },
          {
            id: "demo-item-seco",
            name: "Seco de chivo",
            price: 8.9,
            quantity: 1,
            isPaid: false,
            restaurantId: restaurant.id,
          },
        ],
      },
    },
  });

  await prisma.payment.create({
    data: {
      id: id(),
      billId: demoBillId,
      restaurantId: restaurant.id,
      amount: 5.63,
      status: PaymentStatus.COMPLETED,
      providerTransactionId: "DEMO-LOCRO",
      idempotencyKey: id(),
      splitMode: SplitMode.BY_ITEM,
      createdAt: minsAgo(3),
      paymentItems: {
        create: [
          {
            id: id(),
            billItemId: demoLocroId,
            name: "Locro de papa",
            units: 1,
            unitPrice: 4.5,
            amount: 4.5,
          },
        ],
      },
    },
  });

  console.log("\n✅ Minimal seed complete!\n");
  console.log("  Guest demo : http://localhost:3000/pay/demo");
  console.log("  Owner      : owner@mesita.demo / Demo1234!");
  console.log("");
}

async function seedFull() {
  console.log("🌱 Seeding MesitaQR demo data…");

  // ── Restaurant ──────────────────────────────────────────────────────────────
  const restaurant = await prisma.restaurant.upsert({
    where: { name: "La Floresta Bistró" },
    update: {},
    create: {
      id: "rest-demo-0001",
      name: "La Floresta Bistró",
      slug: "la-floresta-bistro",
      address: "Av. Coruña N25-60 y Luis Cordero, La Floresta, Quito",
      status: "ACTIVE",
      ruc: "1792456789001",
      contactEmail: "hola@laflorestabistro.ec",
      phone: "02-254-8721",
    },
  });

  // ── Users ───────────────────────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { email: "owner@lafloresta.ec" },
    update: {},
    create: {
      id: "user-owner-0001",
      name: "Juan Pérez",
      email: "owner@lafloresta.ec",
      password: HASH("Demo1234!"),
      role: UserRole.OWNER,
      restaurantId: restaurant.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "manager@lafloresta.ec" },
    update: {},
    create: {
      id: "user-mgr-0001",
      name: "María García",
      email: "manager@lafloresta.ec",
      password: HASH("Demo1234!"),
      role: UserRole.MANAGER,
      restaurantId: restaurant.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "carlos@lafloresta.ec" },
    update: {},
    create: {
      id: "user-srv-0001",
      name: "Carlos Vega",
      email: "carlos@lafloresta.ec",
      password: HASH("Demo1234!"),
      role: UserRole.SERVER,
      restaurantId: restaurant.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "sofia@lafloresta.ec" },
    update: {},
    create: {
      id: "user-srv-0002",
      name: "Sofía Mora",
      email: "sofia@lafloresta.ec",
      password: HASH("Demo1234!"),
      role: UserRole.SERVER,
      restaurantId: restaurant.id,
    },
  });

  // ── Tables ──────────────────────────────────────────────────────────────────
  const tableData = [
    { id: "tbl-01", name: "Mesa 1", token: "tkn-mesa-01-demo" },
    { id: "tbl-02", name: "Mesa 2", token: "tkn-mesa-02-demo" },
    { id: "tbl-03", name: "Mesa 3", token: "tkn-mesa-03-demo" },
    { id: "tbl-04", name: "Mesa 4", token: "tkn-mesa-04-demo" },
    { id: "tbl-05", name: "Mesa 5", token: "tkn-mesa-05-demo" },
    { id: "tbl-06", name: "Mesa 6", token: "tkn-mesa-06-demo" },
    { id: "tbl-07", name: "Mesa 7", token: "tkn-mesa-07-demo" },
    { id: "tbl-08", name: "Mesa 8", token: "tkn-mesa-08-demo" },
    { id: "tbl-09", name: "Terraza 1", token: "tkn-terraza-01-demo" },
    { id: "tbl-10", name: "Terraza 2", token: "tkn-terraza-02-demo" },
  ];

  for (const t of tableData) {
    await prisma.table.upsert({
      where: { token: t.token },
      update: { posExternalId: t.name },
      create: { ...t, posExternalId: t.name, restaurantId: restaurant.id },
    });
  }

  // ── Menu ────────────────────────────────────────────────────────────────────
  const catEntradas = await prisma.category.upsert({
    where: { id: "cat-entradas" },
    update: {},
    create: { id: "cat-entradas", name: "Entradas", order: 1, restaurantId: restaurant.id },
  });
  const catFuertes = await prisma.category.upsert({
    where: { id: "cat-fuertes" },
    update: {},
    create: { id: "cat-fuertes", name: "Platos fuertes", order: 2, restaurantId: restaurant.id },
  });
  const catBebidas = await prisma.category.upsert({
    where: { id: "cat-bebidas" },
    update: {},
    create: { id: "cat-bebidas", name: "Bebidas", order: 3, restaurantId: restaurant.id },
  });
  const catPostres = await prisma.category.upsert({
    where: { id: "cat-postres" },
    update: {},
    create: { id: "cat-postres", name: "Postres", order: 4, restaurantId: restaurant.id },
  });

  const menuItems = [
    { id: "mi-01", name: "Ceviche de camarón",       price: 9.50,  categoryId: catEntradas.id },
    { id: "mi-02", name: "Patacones con hogao",       price: 5.00,  categoryId: catEntradas.id },
    { id: "mi-03", name: "Empanadas de viento x3",   price: 4.50,  categoryId: catEntradas.id },
    { id: "mi-04", name: "Lomo saltado",              price: 14.00, categoryId: catFuertes.id },
    { id: "mi-05", name: "Seco de pollo",             price: 11.50, categoryId: catFuertes.id },
    { id: "mi-06", name: "Mariscos a la plancha",     price: 18.50, categoryId: catFuertes.id },
    { id: "mi-07", name: "Churrasco 300g",            price: 16.00, categoryId: catFuertes.id },
    { id: "mi-08", name: "Pasta al pesto",            price: 12.00, categoryId: catFuertes.id },
    { id: "mi-09", name: "Jugo de naranja",           price: 3.50,  categoryId: catBebidas.id },
    { id: "mi-10", name: "Limonada de hierbabuena",   price: 3.50,  categoryId: catBebidas.id },
    { id: "mi-11", name: "Cerveza artesanal",         price: 5.00,  categoryId: catBebidas.id },
    { id: "mi-12", name: "Agua con/sin gas",          price: 1.50,  categoryId: catBebidas.id },
    { id: "mi-13", name: "Café americano",            price: 2.50,  categoryId: catBebidas.id },
    { id: "mi-14", name: "Tres leches",               price: 5.50,  categoryId: catPostres.id },
    { id: "mi-15", name: "Flan de caramelo",          price: 4.50,  categoryId: catPostres.id },
  ];

  for (const item of menuItems) {
    await prisma.menuItem.upsert({
      where: { id: item.id },
      update: {},
      create: { ...item, available: true, restaurantId: restaurant.id },
    });
  }

  // ── Bills & Payments ────────────────────────────────────────────────────────
  // Clean slate for bills/payments so we don't duplicate on re-run
  await prisma.payment.deleteMany({ where: { restaurantId: restaurant.id } });
  await prisma.billItem.deleteMany({ where: { restaurantId: restaurant.id } });
  await prisma.bill.deleteMany({ where: { restaurantId: restaurant.id } });

  const now = new Date();
  const minsAgo = (n: number) => new Date(now.getTime() - n * 60_000);

  // ── Bill 1 — Mesa 2: FULLY PAID (completed 45 min ago) ───────────────────
  const bill1Id = id();
  await prisma.bill.create({
    data: {
      id: bill1Id,
      tableId: "tbl-02",
      restaurantId: restaurant.id,
      status: BillStatus.FULLY_PAID,
      closedAt: minsAgo(45),
      createdAt: minsAgo(105),
      items: {
        create: [
          { id: id(), name: "Ceviche de camarón",   price: 9.50,  quantity: 1, isPaid: true, paidAt: minsAgo(45), restaurantId: restaurant.id },
          { id: id(), name: "Lomo saltado",          price: 14.00, quantity: 2, isPaid: true, paidAt: minsAgo(45), restaurantId: restaurant.id },
          { id: id(), name: "Jugo de naranja",       price: 3.50,  quantity: 2, isPaid: true, paidAt: minsAgo(45), restaurantId: restaurant.id },
          { id: id(), name: "Tres leches",           price: 5.50,  quantity: 1, isPaid: true, paidAt: minsAgo(45), restaurantId: restaurant.id },
        ],
      },
    },
  });
  // subtotal = 9.50 + 28 + 7 + 5.50 = 50.00; total = 50 * 1.25 = 62.50
  const pay1Id = id();
  await prisma.payment.create({
    data: {
      id: pay1Id, billId: bill1Id, restaurantId: restaurant.id,
      amount: 62.50, status: PaymentStatus.COMPLETED,
      providerTransactionId: "PP-32805001",
      idempotencyKey: id(), splitMode: SplitMode.FULL,
      createdAt: minsAgo(50),
    },
  });
  // ── Bill 2 — Mesa 5: PARTIALLY PAID (equal split 3 ways, 1 of 3 paid) ───
  const bill2Id = id();
  await prisma.bill.create({
    data: {
      id: bill2Id,
      tableId: "tbl-05",
      restaurantId: restaurant.id,
      status: BillStatus.PARTIALLY_PAID,
      splitMode: SplitMode.EQUAL,
      equalSplitPeople: 3,
      equalSharesPaid: 1,
      createdAt: minsAgo(60),
      items: {
        create: [
          { id: id(), name: "Patacones con hogao",   price: 5.00,  quantity: 2, isPaid: false, restaurantId: restaurant.id },
          { id: id(), name: "Mariscos a la plancha", price: 18.50, quantity: 1, isPaid: false, restaurantId: restaurant.id },
          { id: id(), name: "Seco de pollo",         price: 11.50, quantity: 2, isPaid: false, restaurantId: restaurant.id },
          { id: id(), name: "Cerveza artesanal",     price: 5.00,  quantity: 3, isPaid: false, restaurantId: restaurant.id },
          { id: id(), name: "Agua con/sin gas",      price: 1.50,  quantity: 2, isPaid: false, restaurantId: restaurant.id },
        ],
      },
    },
  });
  // subtotal = 10 + 18.50 + 23 + 15 + 3 = 69.50; total = 69.50 * 1.25 = 86.875 → 86.88; per person = 28.96
  const pay2Id = id();
  await prisma.payment.create({
    data: {
      id: pay2Id, billId: bill2Id, restaurantId: restaurant.id,
      amount: 28.96, status: PaymentStatus.COMPLETED,
      providerTransactionId: "PP-32805002",
      idempotencyKey: id(), splitMode: SplitMode.EQUAL,
      createdAt: minsAgo(25),
    },
  });

  // ── Bill 3 — Mesa 3: OPEN (just ordered, no payment) ─────────────────────
  await prisma.bill.create({
    data: {
      id: id(),
      tableId: "tbl-03",
      restaurantId: restaurant.id,
      status: BillStatus.UNPAID,
      createdAt: minsAgo(20),
      items: {
        create: [
          { id: id(), name: "Empanadas de viento x3", price: 4.50,  quantity: 1, isPaid: false, restaurantId: restaurant.id },
          { id: id(), name: "Churrasco 300g",          price: 16.00, quantity: 2, isPaid: false, restaurantId: restaurant.id },
          { id: id(), name: "Limonada de hierbabuena", price: 3.50,  quantity: 2, isPaid: false, restaurantId: restaurant.id },
        ],
      },
    },
  });

  // ── Bill 4 — Mesa 7: OPEN (drinks only so far) ─────────────────────────
  await prisma.bill.create({
    data: {
      id: id(),
      tableId: "tbl-07",
      restaurantId: restaurant.id,
      status: BillStatus.UNPAID,
      createdAt: minsAgo(10),
      items: {
        create: [
          { id: id(), name: "Cerveza artesanal",   price: 5.00, quantity: 4, isPaid: false, restaurantId: restaurant.id },
          { id: id(), name: "Agua con/sin gas",    price: 1.50, quantity: 2, isPaid: false, restaurantId: restaurant.id },
        ],
      },
    },
  });

  // ── Bill 5 — Mesa 1: FULLY PAID earlier today ───────────────────────────
  const bill5Id = id();
  await prisma.bill.create({
    data: {
      id: bill5Id,
      tableId: "tbl-01",
      restaurantId: restaurant.id,
      status: BillStatus.FULLY_PAID,
      closedAt: minsAgo(140),
      createdAt: minsAgo(210),
      items: {
        create: [
          { id: id(), name: "Ceviche de camarón",   price: 9.50,  quantity: 2, isPaid: true, paidAt: minsAgo(140), restaurantId: restaurant.id },
          { id: id(), name: "Pasta al pesto",       price: 12.00, quantity: 1, isPaid: true, paidAt: minsAgo(140), restaurantId: restaurant.id },
          { id: id(), name: "Flan de caramelo",     price: 4.50,  quantity: 2, isPaid: true, paidAt: minsAgo(140), restaurantId: restaurant.id },
          { id: id(), name: "Café americano",       price: 2.50,  quantity: 2, isPaid: true, paidAt: minsAgo(140), restaurantId: restaurant.id },
        ],
      },
    },
  });
  // subtotal = 19 + 12 + 9 + 5 = 45.00; total = 45 * 1.25 = 56.25
  const pay5Id = id();
  await prisma.payment.create({
    data: {
      id: pay5Id, billId: bill5Id, restaurantId: restaurant.id,
      amount: 56.25, status: PaymentStatus.COMPLETED,
      providerTransactionId: "PP-32804998",
      idempotencyKey: id(), splitMode: SplitMode.FULL,
      createdAt: minsAgo(145),
    },
  });
  // ── Bill 6 — Terraza 1: FULLY PAID (by item split) ──────────────────────
  const bill6Id = id();
  const item6a = id(); const item6b = id(); const item6c = id(); const item6d = id();
  await prisma.bill.create({
    data: {
      id: bill6Id,
      tableId: "tbl-09",
      restaurantId: restaurant.id,
      status: BillStatus.FULLY_PAID,
      splitMode: SplitMode.BY_ITEM,
      closedAt: minsAgo(30),
      createdAt: minsAgo(95),
      items: {
        create: [
          { id: item6a, name: "Ceviche de camarón",  price: 9.50,  quantity: 1, isPaid: true, paidAt: minsAgo(32), restaurantId: restaurant.id },
          { id: item6b, name: "Seco de pollo",        price: 11.50, quantity: 1, isPaid: true, paidAt: minsAgo(32), restaurantId: restaurant.id },
          { id: item6c, name: "Jugo de naranja",      price: 3.50,  quantity: 2, isPaid: true, paidAt: minsAgo(32), restaurantId: restaurant.id },
          { id: item6d, name: "Tres leches",          price: 5.50,  quantity: 2, isPaid: true, paidAt: minsAgo(30), restaurantId: restaurant.id },
        ],
      },
    },
  });

  // ── Mesita Demo — public /pay/demo (Postgres live sync, no POS) ───────────
  const mesitaDemo = await prisma.restaurant.upsert({
    where: { name: "Mesita Demo" },
    update: { paymentsEnabled: true, invoiceMode: "DISABLED" },
    create: {
      id: "rest-mesita-demo",
      name: "Mesita Demo",
      slug: "mesita-demo",
      address: "Quito, Ecuador",
      status: "ACTIVE",
      paymentsEnabled: true,
      invoiceMode: "DISABLED",
    },
  });

  await prisma.table.upsert({
    where: { token: "demo" },
    update: { name: "12", restaurantId: mesitaDemo.id, posExternalId: "12" },
    create: {
      id: "tbl-mesita-demo",
      name: "12",
      token: "demo",
      posExternalId: "12",
      restaurantId: mesitaDemo.id,
    },
  });

  await prisma.payment.deleteMany({ where: { restaurantId: mesitaDemo.id } });
  await prisma.billGuestSession.deleteMany({
    where: { bill: { restaurantId: mesitaDemo.id } },
  });
  await prisma.billItemClaim.deleteMany({
    where: { bill: { restaurantId: mesitaDemo.id } },
  });
  await prisma.billItem.deleteMany({ where: { restaurantId: mesitaDemo.id } });
  await prisma.bill.deleteMany({ where: { restaurantId: mesitaDemo.id } });

  const demoLocroId = "demo-item-locro";
  const demoBillId = "bill-mesita-demo";
  await prisma.bill.create({
    data: {
      id: demoBillId,
      tableId: "tbl-mesita-demo",
      restaurantId: mesitaDemo.id,
      status: BillStatus.PARTIALLY_PAID,
      createdAt: minsAgo(5),
      items: {
        create: [
          {
            id: demoLocroId,
            name: "Locro de papa",
            price: 4.5,
            quantity: 1,
            isPaid: true,
            paidAt: minsAgo(3),
            restaurantId: mesitaDemo.id,
          },
          {
            id: "demo-item-seco",
            name: "Seco de chivo",
            price: 8.9,
            quantity: 1,
            isPaid: false,
            restaurantId: mesitaDemo.id,
          },
          {
            id: "demo-item-encebollado",
            name: "Encebollado",
            price: 6,
            quantity: 1,
            isPaid: false,
            restaurantId: mesitaDemo.id,
          },
          {
            id: "demo-item-ceviche",
            name: "Ceviche de camarón",
            price: 9.5,
            quantity: 1,
            isPaid: false,
            restaurantId: mesitaDemo.id,
          },
          {
            id: "demo-item-jugo",
            name: "Jugo de naranjilla",
            price: 2.5,
            quantity: 2,
            isPaid: false,
            restaurantId: mesitaDemo.id,
          },
          {
            id: "demo-item-club",
            name: "Club Verde",
            price: 2.75,
            quantity: 2,
            isPaid: false,
            restaurantId: mesitaDemo.id,
          },
        ],
      },
    },
  });

  await prisma.payment.create({
    data: {
      id: id(),
      billId: demoBillId,
      restaurantId: mesitaDemo.id,
      amount: 5.63,
      status: PaymentStatus.COMPLETED,
      providerTransactionId: "DEMO-LOCRO",
      idempotencyKey: id(),
      splitMode: SplitMode.BY_ITEM,
      createdAt: minsAgo(3),
      paymentItems: {
        create: [
          {
            id: id(),
            billItemId: demoLocroId,
            name: "Locro de papa",
            units: 1,
            unitPrice: 4.5,
            amount: 4.5,
          },
        ],
      },
    },
  });

  console.log("\n✅ Demo data seeded successfully!\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Restaurant : La Floresta Bistró");
  console.log("  Guest demo : http://localhost:3000/pay/demo");
  console.log("  Login URL  : http://localhost:3000/login");
  console.log("  ─────────────────────────────────────");
  console.log("  OWNER      : owner@lafloresta.ec");
  console.log("  MANAGER    : manager@lafloresta.ec");
  console.log("  SERVER     : carlos@lafloresta.ec");
  console.log("  PASSWORD   : Demo1234! (all users)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

async function main() {
  const mode = (process.env.SEED_MODE ?? "full").toLowerCase();
  if (mode === "minimal") {
    await seedMinimal();
  } else {
    await seedFull();
  }
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
