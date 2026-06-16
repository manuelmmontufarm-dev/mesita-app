"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DemoFoodItem,
  DemoGuest,
  DemoGuestStatus,
  DemoPayment,
  DemoSplitMode,
  DemoTableState,
} from "@/lib/demo-table-store";
import styles from "./DemoPayExperience.module.css";

type Tab = "cuenta" | "mesa";
type Step = "table" | "confirm" | "payment" | "waiting";

interface DemoPayExperienceProps {
  token: string;
}

interface Totals {
  subtotal: number;
  iva: number;
  service: number;
  tip: number;
  total: number;
}

interface ReceiptData extends DemoPayment {
  restaurantName: string;
  restaurantTagline: string;
  tableName: string;
  items: DemoFoodItem[];
}

const STORAGE_PREFIX = "mesita-demo-guest";
const TIP_PRESETS = [0, 10, 15];

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(money(value));
}

function lineTotal(item: DemoFoodItem): number {
  return item.qty * item.unitPrice;
}

function initials(name: string): string {
  const clean = name.trim();
  if (!clean) return "P";
  if (/^P\d+$/i.test(clean)) return clean.toUpperCase();
  return clean
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function statusLabel(status: DemoGuestStatus): string {
  if (status === "paid") return "Pagó";
  if (status === "in_payment") return "En pago";
  if (status === "reviewing") return "Revisando";
  return "Eligiendo";
}

function computeTotals(
  subtotal: number,
  state: DemoTableState | null,
  tipPct: number
): Totals {
  const ivaRate = state?.restaurant.ivaRate ?? 0.15;
  const serviceRate = state?.restaurant.serviceRate ?? 0.1;
  const serviceEnabled = state?.restaurant.serviceEnabled ?? true;
  const iva = money(subtotal * ivaRate);
  const service = serviceEnabled ? money(subtotal * serviceRate) : 0;
  const tip = money(subtotal * (tipPct / 100));
  return {
    subtotal: money(subtotal),
    iva,
    service,
    tip,
    total: money(subtotal + iva + service + tip),
  };
}

async function postAction<T>(
  token: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`/api/demo/table/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(payload.error ?? "Demo action failed");
  }
  return payload.data as T;
}

export function DemoPayExperience({ token }: DemoPayExperienceProps) {
  const [state, setState] = useState<DemoTableState | null>(null);
  const [guest, setGuest] = useState<DemoGuest | null>(null);
  const [name, setName] = useState("");
  const [tab, setTab] = useState<Tab>("cuenta");
  const [mode, setMode] = useState<DemoSplitMode>("item");
  const [equalPeople, setEqualPeople] = useState(4);
  const [tipPct, setTipPct] = useState(0);
  const [step, setStep] = useState<Step>("table");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const storageKey = `${STORAGE_PREFIX}:${token}`;

  const selectedItemIds = useMemo(() => {
    if (!state || !guest) return [];
    return Object.entries(state.claims)
      .filter(([, ownerId]) => ownerId === guest.id)
      .map(([itemId]) => itemId)
      .filter((itemId) => !state.paidItemIds.includes(itemId));
  }, [guest, state]);

  const selectedItems = useMemo(() => {
    if (!state) return [];
    const ids = new Set(selectedItemIds);
    return state.items.filter((item) => ids.has(item.id));
  }, [selectedItemIds, state]);

  const subtotal = useMemo(() => {
    if (!state) return 0;
    const paidSub = state.payments.reduce((sum, payment) => sum + payment.subtotal, 0);
    const remainingSub = Math.max(
      0,
      state.items.reduce((sum, item) => sum + lineTotal(item), 0) - paidSub
    );
    if (mode === "todo") return remainingSub;
    if (mode === "equal") return remainingSub / Math.max(1, equalPeople);
    return selectedItems.reduce((sum, item) => sum + lineTotal(item), 0);
  }, [equalPeople, mode, selectedItems, state]);

  const totals = useMemo(
    () => computeTotals(subtotal, state, tipPct),
    [state, subtotal, tipPct]
  );

  const billSubtotal = useMemo(
    () => state?.items.reduce((sum, item) => sum + lineTotal(item), 0) ?? 0,
    [state]
  );
  const paidSubtotal = useMemo(() => {
    if (!state) return 0;
    return Math.min(
      billSubtotal,
      state.payments.reduce((sum, payment) => sum + payment.subtotal, 0)
    );
  }, [billSubtotal, state]);
  const progressPct = billSubtotal > 0 ? Math.min(100, Math.round((paidSubtotal / billSubtotal) * 100)) : 0;
  const activeGuest = state?.guests.find((candidate) => candidate.id === guest?.id) ?? guest;

  const updateStatus = useCallback(
    async (status: DemoGuestStatus) => {
      if (!guest) return;
      try {
        const updated = await postAction<DemoTableState>(token, {
          action: "status",
          guestId: guest.id,
          status,
        });
        setState(updated);
      } catch (error) {
        console.error(error);
      }
    },
    [guest, token]
  );

  useEffect(() => {
    let cancelled = false;
    const savedGuestId = window.localStorage.getItem(storageKey) ?? undefined;
    postAction<{ state: DemoTableState; guest: DemoGuest }>(token, {
      action: "join",
      guestId: savedGuestId,
    })
      .then((joined) => {
        if (cancelled) return;
        window.localStorage.setItem(storageKey, joined.guest.id);
        setState(joined.state);
        setGuest(joined.guest);
        setName(joined.guest.name);
      })
      .catch((error) => console.error(error));

    return () => {
      cancelled = true;
    };
  }, [storageKey, token]);

  useEffect(() => {
    const events = new EventSource(`/api/demo/table/${token}/events`);
    events.addEventListener("state", (event) => {
      const next = JSON.parse((event as MessageEvent).data) as DemoTableState;
      setState(next);
      setGuest((current) => {
        if (!current) return current;
        return next.guests.find((candidate) => candidate.id === current.id) ?? current;
      });
    });
    events.onerror = () => {
      console.warn("Demo live stream reconnecting...");
    };
    return () => events.close();
  }, [token]);

  useEffect(() => {
    if (!guest) return;
    if (name === guest.name) return;
    if (renameTimer.current) clearTimeout(renameTimer.current);
    renameTimer.current = setTimeout(() => {
      postAction<DemoTableState>(token, {
        action: "rename",
        guestId: guest.id,
        name,
      })
        .then(setState)
        .catch((error) => console.error(error));
    }, 420);
    return () => {
      if (renameTimer.current) clearTimeout(renameTimer.current);
    };
  }, [guest, name, token]);

  const claimItem = async (itemId: string) => {
    if (!guest) return;
    try {
      const updated = await postAction<DemoTableState>(token, {
        action: "claim",
        guestId: guest.id,
        itemId,
      });
      setState(updated);
    } catch (error) {
      console.error(error);
    }
  };

  const startConfirm = async () => {
    if (!guest || totals.total <= 0) return;
    await updateStatus("reviewing");
    setStep("confirm");
  };

  const goToPayment = async () => {
    await updateStatus("in_payment");
    setStep("payment");
  };

  const submitDemoPayment = async (method: string) => {
    if (!guest || !state || totals.total <= 0) return;
    setIsPaying(true);
    const guestName = name.trim() || activeGuest?.label || "Invitado";
    const itemIds =
      mode === "todo"
        ? state.items.filter((item) => !state.paidItemIds.includes(item.id)).map((item) => item.id)
        : mode === "item"
          ? selectedItemIds
          : [];
    try {
      const updated = await postAction<DemoTableState>(token, {
        action: "pay",
        guestId: guest.id,
        guestName,
        mode,
        amount: totals.total,
        subtotal: totals.subtotal,
        iva: totals.iva,
        service: totals.service,
        tip: totals.tip,
        itemIds,
        equalPeople: mode === "equal" ? equalPeople : undefined,
        method,
      });
      const payment = updated.payments.find((candidate) => candidate.guestId === guest.id);
      if (payment) {
        setReceipt({
          ...payment,
          restaurantName: updated.restaurant.name,
          restaurantTagline: updated.restaurant.tagline,
          tableName: updated.table.name,
          items: updated.items.filter((item) => payment.itemIds.includes(item.id)),
        });
      }
      setState(updated);
      setStep("waiting");
    } catch (error) {
      console.error(error);
    } finally {
      setIsPaying(false);
    }
  };

  const resetDemo = async () => {
    const updated = await postAction<DemoTableState>(token, { action: "reset" });
    window.localStorage.removeItem(storageKey);
    setState(updated);
    setGuest(null);
    setReceipt(null);
    setStep("table");
    window.location.reload();
  };

  if (!state || !guest) {
    return (
      <main className={styles.stage}>
        <div className={styles.loading}>
          <span className={styles.spinner} />
          <h1>Trayendo tu cuenta...</h1>
          <p>Preparando la mesa en vivo.</p>
        </div>
      </main>
    );
  }

  if (step === "confirm") {
    return (
      <ConfirmScreen
        state={state}
        mode={mode}
        equalPeople={equalPeople}
        selectedItems={selectedItems}
        totals={totals}
        name={name}
        progressPct={progressPct}
        onBack={() => setStep("table")}
        onConfirm={goToPayment}
      />
    );
  }

  if (step === "payment") {
    return (
      <PaymentScreen
        total={totals.total}
        isPaying={isPaying}
        onBack={() => setStep("confirm")}
        onPaid={submitDemoPayment}
      />
    );
  }

  if (step === "waiting") {
    return (
      <WaitingScreen
        state={state}
        guest={activeGuest ?? guest}
        progressPct={progressPct}
        receipt={receipt}
        onBackToTable={() => {
          setStep("table");
          setTab("mesa");
        }}
      />
    );
  }

  return (
    <main className={styles.stage}>
      <section className={styles.phone}>
        <Header state={state} tab={tab} setTab={setTab} />

        <div className={styles.scroll}>
          {tab === "cuenta" ? (
            <CuentaScreen
              state={state}
              guest={activeGuest ?? guest}
              name={name}
              setName={setName}
              mode={mode}
              setMode={setMode}
              equalPeople={equalPeople}
              setEqualPeople={setEqualPeople}
              tipPct={tipPct}
              setTipPct={setTipPct}
              selectedItemIds={selectedItemIds}
              selectedItems={selectedItems}
              totals={totals}
              onClaim={claimItem}
            />
          ) : (
            <MesaScreen
              state={state}
              currentGuestId={guest.id}
              progressPct={progressPct}
              equalPeople={equalPeople}
              mode={mode}
            />
          )}
        </div>

        {tab === "cuenta" && (
          <PaymentDock
            mode={mode}
            totals={totals}
            selectedCount={selectedItemIds.length}
            equalPeople={equalPeople}
            disabled={totals.total <= 0}
            onPay={startConfirm}
          />
        )}

        <button className={styles.resetButton} onClick={resetDemo} type="button">
          Reiniciar demo
        </button>
      </section>
    </main>
  );
}

function Header({
  state,
  tab,
  setTab,
}: {
  state: DemoTableState;
  tab: Tab;
  setTab: (tab: Tab) => void;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerTop}>
        <div className={styles.brandBlock}>
          <LogoMark />
          <div>
            <p>{state.restaurant.name} · {state.restaurant.tagline}</p>
            <h1>{state.table.name}</h1>
          </div>
        </div>
        <div className={styles.livePill}>
          <span />
          Cuenta abierta
        </div>
      </div>
      <nav className={styles.tabs} aria-label="Vistas de cuenta">
        <button
          className={tab === "cuenta" ? styles.activeTab : ""}
          onClick={() => setTab("cuenta")}
          type="button"
        >
          Cuenta
        </button>
        <button
          className={tab === "mesa" ? styles.activeTab : ""}
          onClick={() => setTab("mesa")}
          type="button"
        >
          Mesa
        </button>
      </nav>
    </header>
  );
}

function CuentaScreen({
  state,
  guest,
  name,
  setName,
  mode,
  setMode,
  equalPeople,
  setEqualPeople,
  tipPct,
  setTipPct,
  selectedItemIds,
  selectedItems,
  totals,
  onClaim,
}: {
  state: DemoTableState;
  guest: DemoGuest;
  name: string;
  setName: (value: string) => void;
  mode: DemoSplitMode;
  setMode: (mode: DemoSplitMode) => void;
  equalPeople: number;
  setEqualPeople: (value: number) => void;
  tipPct: number;
  setTipPct: (value: number) => void;
  selectedItemIds: string[];
  selectedItems: DemoFoodItem[];
  totals: Totals;
  onClaim: (itemId: string) => void;
}) {
  const selectedSet = new Set(selectedItemIds);
  const paidSet = new Set(state.paidItemIds);
  const claimant = (itemId: string) => state.guests.find((candidate) => candidate.id === state.claims[itemId]);

  return (
    <>
      <section className={styles.glassCard}>
        <Label text="¿Quién paga?" />
        <label className={styles.nameField}>
          <span>{initials(name || guest.label)}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={guest.label}
            autoComplete="given-name"
          />
        </label>
      </section>

      <section>
        <Label text="¿Cómo dividimos?" />
        <div className={styles.modeSegment}>
          <button
            className={mode === "equal" ? styles.activeMode : ""}
            onClick={() => setMode("equal")}
            type="button"
          >
            <span>👥</span>
            En partes iguales
          </button>
          <button
            className={mode === "todo" ? styles.activeMode : ""}
            onClick={() => setMode("todo")}
            type="button"
          >
            <span>💳</span>
            Por monto
          </button>
          <button
            className={mode === "item" ? styles.activeMode : ""}
            onClick={() => setMode("item")}
            type="button"
          >
            <span>🍽️</span>
            Por item
          </button>
        </div>
        <p className={styles.helper}>
          {mode === "item"
            ? "Escoge tus platos y Mesita calcula tu parte."
            : mode === "equal"
              ? "Lo que falta se reparte en partes iguales."
              : "Cubre todo lo pendiente de la mesa."}
        </p>
      </section>

      {mode === "equal" && (
        <section className={styles.surface}>
          <div className={styles.stepperRow}>
            <div>
              <strong>¿Entre cuántos?</strong>
              <small>{formatMoney(totals.total)} por persona con impuestos</small>
            </div>
            <div className={styles.stepper}>
              <button onClick={() => setEqualPeople(Math.max(2, equalPeople - 1))} type="button">−</button>
              <span>{equalPeople}</span>
              <button onClick={() => setEqualPeople(Math.min(20, equalPeople + 1))} type="button">+</button>
            </div>
          </div>
        </section>
      )}

      {mode === "todo" && (
        <section className={`${styles.surface} ${styles.todoCard}`}>
          <span>🧾</span>
          <strong>Pagas lo que falta</strong>
          <b>{formatMoney(totals.total)}</b>
          <p>La mesa queda cubierta en demo cuando confirmes este pago.</p>
        </section>
      )}

      <section>
        <div className={styles.sectionHeader}>
          <Label text={mode === "item" ? "Escoge tus platos" : "Cuenta de la mesa"} />
          <span>{state.items.length} platos · {formatMoney(state.items.reduce((sum, item) => sum + lineTotal(item), 0))}</span>
        </div>
        <div className={styles.itemList}>
          {state.items.map((item) => {
            const isMine = selectedSet.has(item.id);
            const isPaid = paidSet.has(item.id);
            const owner = claimant(item.id);
            return (
              <button
                key={item.id}
                className={`${styles.itemRow} ${isMine ? styles.mine : ""} ${isPaid ? styles.paid : ""}`}
                onClick={() => mode === "item" && onClaim(item.id)}
                disabled={mode !== "item" || isPaid}
                type="button"
              >
                <span className={styles.check}>{isPaid ? "✓" : isMine ? "✓" : ""}</span>
                <span className={styles.itemEmoji}>{item.emoji}</span>
                <span className={styles.itemMain}>
                  <strong>{item.name}</strong>
                  <small>
                    {isPaid
                      ? "Pagado"
                      : owner && owner.id !== guest.id
                        ? `${owner.name} lo escogió`
                        : item.note}
                  </small>
                </span>
                <span className={styles.itemPrice}>{formatMoney(lineTotal(item))}</span>
              </button>
            );
          })}
        </div>
      </section>

      {mode === "item" && selectedItems.length > 0 && (
        <section className={styles.surface}>
          <Label text="Tu selección" />
          <div className={styles.miniRows}>
            {selectedItems.map((item) => (
              <div key={item.id}>
                <span>{item.emoji} {item.name}</span>
                <strong>{formatMoney(lineTotal(item))}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={styles.surface}>
        <div className={styles.tipHead}>
          <div>
            <strong>Propina</strong>
            <small>Opcional · sobre tu parte</small>
          </div>
          <div className={styles.tipChips}>
            {TIP_PRESETS.map((tip) => (
              <button
                key={tip}
                className={tipPct === tip ? styles.activeChip : ""}
                onClick={() => setTipPct(tip)}
                type="button"
              >
                {tip === 0 ? "No" : `${tip}%`}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.summary}>
        <Label text="Tu parte" />
        <SummaryRow label="Subtotal" value={totals.subtotal} />
        <SummaryRow label="IVA 15%" value={totals.iva} />
        <SummaryRow label="Servicio 10%" value={totals.service} />
        {totals.tip > 0 && <SummaryRow label={`Propina ${tipPct}%`} value={totals.tip} />}
        <div className={styles.totalRow}>
          <span>Total a pagar</span>
          <strong>{formatMoney(totals.total)}</strong>
        </div>
      </section>
    </>
  );
}

function MesaScreen({
  state,
  currentGuestId,
  progressPct,
  equalPeople,
  mode,
}: {
  state: DemoTableState;
  currentGuestId: string;
  progressPct: number;
  equalPeople: number;
  mode: DemoSplitMode;
}) {
  const total = state.items.reduce((sum, item) => sum + lineTotal(item), 0);
  const paid = Math.min(
    total,
    state.payments.reduce((sum, payment) => sum + payment.subtotal, 0)
  );

  return (
    <>
      <section className={styles.mesaHero}>
        <div>
          <strong>{state.guests.length}</strong>
          <span>en la mesa</span>
        </div>
        <div>
          <strong>{formatMoney(total)}</strong>
          <span>total</span>
        </div>
        <div>
          <strong>{progressPct}%</strong>
          <span>pagado</span>
        </div>
      </section>

      <section className={styles.surface}>
        <div className={styles.progressRing} style={{ "--pct": `${progressPct}%` } as React.CSSProperties}>
          <span>{progressPct}%</span>
        </div>
        <div className={styles.progressCopy}>
          <strong>Mesa en vivo</strong>
          <p>{formatMoney(paid)} pagado · {formatMoney(Math.max(0, total - paid))} falta</p>
          {mode === "equal" && <small>La vista actual divide entre {equalPeople} personas.</small>}
        </div>
      </section>

      <section>
        <Label text="Personas" />
        <div className={styles.peopleList}>
          {state.guests.map((person) => (
            <div key={person.id} className={styles.personRow}>
              <Avatar guest={person} isCurrent={person.id === currentGuestId} />
              <div>
                <strong>{person.name}</strong>
                <small>{person.id === currentGuestId ? "Este teléfono" : person.label}</small>
              </div>
              <span className={`${styles.status} ${styles[person.status]}`}>
                {statusLabel(person.status)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <Label text="Platos pagados" />
        <div className={styles.coverageList}>
          {state.items.map((item) => {
            const paidItem = state.paidItemIds.includes(item.id);
            return (
              <div key={item.id} className={paidItem ? styles.covered : ""}>
                <span>{item.emoji}</span>
                <strong>{item.name}</strong>
                <em>{paidItem ? "Pagado" : "Falta"}</em>
                <b>{formatMoney(lineTotal(item))}</b>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <Label text="Pagos recientes" />
        <div className={styles.paymentList}>
          {state.payments.map((payment) => (
            <div key={payment.id}>
              <span>{payment.guestName}</span>
              <small>{payment.mode === "item" ? "Por item" : payment.mode === "equal" ? "Por igual" : "Todo"}</small>
              <strong>{formatMoney(payment.amount)}</strong>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function ConfirmScreen({
  state,
  mode,
  equalPeople,
  selectedItems,
  totals,
  name,
  progressPct,
  onBack,
  onConfirm,
}: {
  state: DemoTableState;
  mode: DemoSplitMode;
  equalPeople: number;
  selectedItems: DemoFoodItem[];
  totals: Totals;
  name: string;
  progressPct: number;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <main className={styles.flowStage}>
      <section className={styles.flowPhone}>
        <button className={styles.backButton} onClick={onBack} type="button">Volver</button>
        <div className={styles.flowBrand}><LogoMark /> {state.restaurant.name} · {state.table.name}</div>
        <h1>
          {mode === "item"
            ? "Revisa y paga lo tuyo"
            : mode === "equal"
              ? "Paga tu parte igual"
              : "Pagas lo pendiente"}
        </h1>
        <p className={styles.flowLead}>
          {mode === "item"
            ? "Confirmamos tus platos antes de pasar al pago demo."
            : mode === "equal"
              ? `La cuenta restante se divide entre ${equalPeople}.`
              : "Con este pago la mesa queda cubierta en el demo."}
        </p>

        <section className={styles.confirmCard}>
          <div className={styles.bigRing} style={{ "--pct": `${progressPct}%` } as React.CSSProperties}>
            <strong>{progressPct}%</strong>
            <span>pagado</span>
          </div>
          <div className={styles.confirmFacts}>
            {mode === "item" && selectedItems.map((item) => (
              <div key={item.id}><span>{item.name}</span><b>{formatMoney(lineTotal(item))}</b></div>
            ))}
            {mode === "equal" && <div><span>División igual</span><b>{equalPeople} personas</b></div>}
            {mode === "todo" && <div><span>Pago</span><b>Todo lo pendiente</b></div>}
            <div><span>Invitado</span><b>{name || "Invitado"}</b></div>
          </div>
        </section>

        <section className={styles.confirmTotal}>
          <span>Tu parte</span>
          <strong>{formatMoney(totals.total)}</strong>
        </section>

        <div className={styles.flowFoot}>
          <button className={styles.primaryButton} onClick={onConfirm} type="button">
            Pagar {formatMoney(totals.total)}
          </button>
        </div>
      </section>
    </main>
  );
}

function PaymentScreen({
  total,
  isPaying,
  onBack,
  onPaid,
}: {
  total: number;
  isPaying: boolean;
  onBack: () => void;
  onPaid: (method: string) => void;
}) {
  const [method, setMethod] = useState("Kushki demo");
  const [scanOpen, setScanOpen] = useState(false);

  return (
    <main className={styles.flowStage}>
      <section className={styles.flowPhone}>
        <button className={styles.backButton} onClick={onBack} type="button">Volver</button>
        <div className={styles.payHeader}>
          <span>🔒</span>
          <div>
            <small>Total demo</small>
            <strong>{formatMoney(total)}</strong>
          </div>
        </div>

        <button className={styles.scanEntry} onClick={() => setScanOpen(true)} type="button">
          <span>📷</span>
          <div>
            <strong>Escanear tarjeta</strong>
            <small>Abre la cámara del teléfono</small>
          </div>
        </button>

        <section>
          <Label text="Método de pago" />
          <div className={styles.methodGrid}>
            {["Kushki demo", "Datafast demo", "Diners demo"].map((label) => (
              <button
                key={label}
                className={method === label ? styles.methodActive : ""}
                onClick={() => setMethod(label)}
                type="button"
              >
                <span>💳</span>
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.cardForm}>
          <Label text="Tarjeta demo" />
          <input placeholder="4242 4242 4242 4242" inputMode="numeric" />
          <input placeholder="Nombre en la tarjeta" />
          <div>
            <input placeholder="MM/AA" inputMode="numeric" />
            <input placeholder="CVV" inputMode="numeric" />
          </div>
        </section>

        <div className={styles.flowFoot}>
          <button className={styles.primaryButton} disabled={isPaying} onClick={() => onPaid(method)} type="button">
            {isPaying ? "Procesando..." : `Pagar ${formatMoney(total)}`}
          </button>
          <p>Demo seguro · no se realiza ningún cargo</p>
        </div>
      </section>

      {scanOpen && <CameraScanner onClose={() => setScanOpen(false)} />}
    </main>
  );
}

function CameraScanner({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let mounted = true;

    async function openCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("Tu navegador no expone la cámara aquí. Puedes escribir la tarjeta manualmente.");
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!mounted) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        if (mounted) setError("No pudimos abrir la cámara. Puedes continuar escribiendo los datos.");
      }
    }

    void openCamera();
    return () => {
      mounted = false;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className={styles.scannerScrim} role="dialog" aria-modal="true" aria-label="Escanear tarjeta">
      <div className={styles.scanner}>
        <div className={styles.cameraFrame}>
          <video ref={videoRef} playsInline muted />
          <span className={styles.scanLine} />
          <i className={styles.cornerOne} />
          <i className={styles.cornerTwo} />
          <i className={styles.cornerThree} />
          <i className={styles.cornerFour} />
        </div>
        <h2>Centra tu tarjeta</h2>
        <p>{error || "Apunta la cámara al frente de la tarjeta. Esto es demo: no guardamos datos."}</p>
        <button className={styles.primaryButton} onClick={onClose} type="button">
          Escribir manualmente
        </button>
      </div>
    </div>
  );
}

function WaitingScreen({
  state,
  guest,
  progressPct,
  receipt,
  onBackToTable,
}: {
  state: DemoTableState;
  guest: DemoGuest;
  progressPct: number;
  receipt: ReceiptData | null;
  onBackToTable: () => void;
}) {
  return (
    <main className={styles.flowStage}>
      <section className={styles.flowPhone}>
        <div className={styles.waitCenter}>
          <h1>¡Gracias, {guest.name}!</h1>
          <p>Tu pago demo ya se vio en la mesa.</p>
          <div className={styles.bigRing} style={{ "--pct": `${progressPct}%` } as React.CSSProperties}>
            <strong>{progressPct}%</strong>
            <span>pagado</span>
          </div>
        </div>
        <section>
          <div className={styles.sectionHeader}>
            <Label text="La mesa en vivo" />
            <span>{state.guests.filter((person) => person.status === "paid").length}/{state.guests.length} pagaron</span>
          </div>
          <div className={styles.peopleList}>
            {state.guests.map((person) => (
              <div key={person.id} className={styles.personRow}>
                <Avatar guest={person} isCurrent={person.id === guest.id} />
                <div>
                  <strong>{person.name}</strong>
                  <small>{person.id === guest.id ? "tú" : person.label}</small>
                </div>
                <span className={`${styles.status} ${styles[person.status]}`}>
                  {statusLabel(person.status)}
                </span>
              </div>
            ))}
          </div>
        </section>
        <button className={styles.secondaryButton} onClick={onBackToTable} type="button">
          Ver mesa
        </button>
        {receipt && <ReceiptDrawer receipt={receipt} />}
      </section>
    </main>
  );
}

function ReceiptDrawer({ receipt }: { receipt: ReceiptData }) {
  const [expanded, setExpanded] = useState(false);
  const startY = useRef<number | null>(null);

  const description =
    receipt.mode === "item"
      ? "Pagaste platos específicos"
      : receipt.mode === "equal"
        ? `Dividiste por igual entre ${receipt.equalPeople ?? 1} personas`
        : "Pagaste todo lo pendiente";

  return (
    <aside
      className={`${styles.receiptDrawer} ${expanded ? styles.receiptOpen : ""}`}
      onPointerDown={(event) => {
        startY.current = event.clientY;
      }}
      onPointerUp={(event) => {
        if (startY.current == null) return;
        const delta = event.clientY - startY.current;
        if (delta < -24) setExpanded(true);
        if (delta > 24) setExpanded(false);
        startY.current = null;
      }}
    >
      <button className={styles.receiptHandle} onClick={() => setExpanded((value) => !value)} type="button">
        <span />
        <b>Tu factura</b>
        <strong>{formatMoney(receipt.amount)}</strong>
      </button>
      <div className={styles.paper}>
        <div className={styles.printHead}>
          <LogoMark />
          <h2>{receipt.restaurantName}</h2>
          <p>{receipt.restaurantTagline}</p>
        </div>
        <div className={styles.receiptStatus}>Pago aprobado · Demo</div>
        <div className={styles.receiptAmount}>{formatMoney(receipt.amount)}</div>
        <p className={styles.receiptMode}>{description}</p>

        {receipt.mode === "item" && receipt.items.length > 0 && (
          <div className={styles.receiptRows}>
            {receipt.items.map((item) => (
              <div key={item.id}>
                <span>{item.name}</span>
                <b>{formatMoney(lineTotal(item))}</b>
              </div>
            ))}
          </div>
        )}

        <div className={styles.receiptRows}>
          <div><span>Subtotal</span><b>{formatMoney(receipt.subtotal)}</b></div>
          <div><span>Servicio</span><b>{formatMoney(receipt.service)}</b></div>
          <div><span>IVA</span><b>{formatMoney(receipt.iva)}</b></div>
          {receipt.tip > 0 && <div><span>Propina</span><b>{formatMoney(receipt.tip)}</b></div>}
          <div className={styles.receiptTotal}><span>Total</span><b>{formatMoney(receipt.amount)}</b></div>
        </div>

        <div className={styles.receiptMeta}>
          <div><span>Mesa</span><b>{receipt.tableName}</b></div>
          <div><span>Pagó</span><b>{receipt.guestName}</b></div>
          <div><span>Método</span><b>{receipt.method}</b></div>
          <div><span>Referencia</span><b>{receipt.ref}</b></div>
        </div>
      </div>
    </aside>
  );
}

function PaymentDock({
  mode,
  totals,
  selectedCount,
  equalPeople,
  disabled,
  onPay,
}: {
  mode: DemoSplitMode;
  totals: Totals;
  selectedCount: number;
  equalPeople: number;
  disabled: boolean;
  onPay: () => void;
}) {
  return (
    <div className={styles.dock}>
      <div>
        <span>Total a pagar</span>
        <small>
          {mode === "item"
            ? `${selectedCount} item${selectedCount === 1 ? "" : "s"}`
            : mode === "equal"
              ? `1 de ${equalPeople} personas`
              : "Lo pendiente"}
        </small>
      </div>
      <strong>{formatMoney(totals.total)}</strong>
      <button onClick={onPay} disabled={disabled} type="button">
        🔒 Pagar ahora
      </button>
      <p>Pago cifrado · factura demo automática</p>
    </div>
  );
}

function Avatar({ guest, isCurrent }: { guest: DemoGuest; isCurrent: boolean }) {
  return (
    <span
      className={`${styles.avatar} ${isCurrent ? styles.currentAvatar : ""}`}
      style={{ "--hue": guest.hue } as React.CSSProperties}
    >
      {initials(guest.name)}
    </span>
  );
}

function Label({ text }: { text: string }) {
  return <p className={styles.label}>{text}</p>;
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.summaryRow}>
      <span>{label}</span>
      <strong>{formatMoney(value)}</strong>
    </div>
  );
}

function LogoMark() {
  return (
    <span className={styles.logo} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
