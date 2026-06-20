"use client";

/**
 * PaymentStage — tarjeta de crédito/débito (demo o proveedor en producción).
 */

import { useState, type InputHTMLAttributes } from "react";

import type { CameraCardData } from "@/components/guest/CameraScanner";
import { CameraScanner } from "@/components/guest/CameraScanner";
import type { useGuestPaymentFlow } from "@/hooks/useGuestPaymentFlow";
import type { EInvoicePayload, PaidPayload } from "@/hooks/useGuestPaymentFlow";
import { fmt, round2 } from "@/lib/guest-billing/split-math";
import type { RestaurantConfig } from "@/lib/guest-billing/types";

import { Ic } from "./_shared";

type Flow = ReturnType<typeof useGuestPaymentFlow>;

const TEST_CARD = {
  num: "4242 4242 4242 4242",
  holder: "JUAN TEST PEREZ",
  exp: "12/29",
  cvv: "123",
};
const TEST_BILL: EInvoicePayload = {
  legalName: "Juan Test Pérez",
  idNumber: "1710034065",
  address: "Av. Amazonas N34-120, Quito",
  email: "juan.test@mesita.ec",
  phone: "0998765432",
};

function Field({
  label,
  hint,
  optional,
  error,
  ...input
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={"field" + (error ? " field-err" : "")}>
      <span className="field-l">
        {label}
        {optional && <span className="field-opt">opcional</span>}
      </span>
      <input className="field-i" {...input} />
      {error ? (
        <span className="field-error">{error}</span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </label>
  );
}

export interface PaymentStageProps {
  flow: Flow;
  config: RestaurantConfig;
}

export function PaymentStage({ flow, config }: PaymentStageProps) {
  const yourTotal = flow.derived.totals.total;
  const isLastPayer = flow.derived.isLastPayer;
  const demoMode = config.demoMode ?? false;

  const [card, setCard] = useState({
    num: "",
    holder: "",
    exp: "",
    cvv: "",
  });
  const [billChoice, setBillChoice] = useState<"later" | "me">(
    isLastPayer ? "me" : "later",
  );
  const [bill, setBill] = useState<EInvoicePayload>({
    legalName: "",
    idNumber: "",
    address: "",
    email: "",
    phone: "",
  });
  const [scanOpen, setScanOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const wantBilling = isLastPayer || billChoice === "me";

  const fmtNum = (v: string) =>
    v
      .replace(/\D/g, "")
      .slice(0, 16)
      .replace(/(.{4})/g, "$1 ")
      .trim();
  const fmtExp = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 4);
    return d.length >= 3 ? d.slice(0, 2) + "/" + d.slice(2) : d;
  };

  const errs: Record<string, string> = {};
  if (card.num.replace(/\s/g, "").length < 14)
    errs.num = "Ingresa los 16 dígitos de tu tarjeta";
  if (card.holder.trim().length <= 2)
    errs.holder = "Escribe el nombre tal como está impreso";
  if (!/^\d{2}\/\d{2}$/.test(card.exp)) errs.exp = "Usa el formato MM/AA";
  if (card.cvv.length < 3) errs.cvv = "3 o 4 dígitos";
  if (wantBilling) {
    if (bill.legalName.trim().length <= 2)
      errs.legalName = "Falta el nombre o razón social";
    if (bill.idNumber.trim().length < 10)
      errs.idNumber = "Cédula (10) o RUC (13) válido";
    if (bill.address.trim().length <= 3) errs.address = "Falta la dirección";
    if (!/\S+@\S+\.\S+/.test(bill.email)) errs.email = "Correo no válido";
  }
  const errKeys = Object.keys(errs);
  const canPay = errKeys.length === 0 && !busy;

  const fillTest = () => {
    setCard({ ...TEST_CARD });
    if (wantBilling) setBill({ ...TEST_BILL });
    setShowErrors(false);
  };

  const applyScannedCard = (data: CameraCardData) => {
    const rawNum = data.number.replace(/\D/g, "").slice(0, 16);
    const formattedNum = rawNum.replace(/(.{4})/g, "$1 ").trim();
    const month = data.expiryMonth.padStart(2, "0");
    const year = data.expiryYear.slice(-2);
    setCard({
      num: formattedNum,
      holder: data.name ?? "",
      exp: `${month}/${year}`,
      cvv: data.cvv ?? "",
    });
  };

  const pay = () => {
    if (!canPay) {
      setShowErrors(true);
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLInputElement>(
          ".field-err .field-i",
        );
        el?.focus({ preventScroll: false });
      });
      return;
    }
    setBusy(true);
    const payload: PaidPayload = {
      method: "card",
      amount: round2(yourTotal),
      card: { last4: card.num.replace(/\s/g, "").slice(-4) },
      eInvoice: wantBilling ? { ...bill } : null,
      paymentToken: demoMode
        ? `demo:${card.num.replace(/\s/g, "").slice(-4)}`
        : undefined,
    };
    setTimeout(() => {
      void flow.submitPayment(payload);
    }, 1100);
  };

  const missingMsg = (): string => {
    const labels: Record<string, string> = {
      num: "número de tarjeta",
      holder: "nombre de la tarjeta",
      exp: "fecha",
      cvv: "CVV",
      legalName: "nombre de factura",
      idNumber: "cédula/RUC",
      address: "dirección",
      email: "email",
    };
    const list = errKeys.map((k) => labels[k]).filter(Boolean);
    if (list.length === 0) return "";
    if (list.length === 1) return `Falta: ${list[0]}.`;
    return `Falta completar: ${list.slice(0, -1).join(", ")} y ${list[list.length - 1]}.`;
  };

  const E = (k: string): string | undefined =>
    showErrors ? errs[k] : undefined;

  const setC = (k: keyof typeof card, v: string) =>
    setCard((c) => ({ ...c, [k]: v }));
  const setB = (k: keyof EInvoicePayload, v: string) =>
    setBill((b) => ({ ...b, [k]: v }));

  return (
    <div
      className="cust-root cust-app"
      data-testid="guest-bill-flow"
      data-stage="payment"
    >
      <div className="flowscreen">
        <div className="flow-scroll pay-scroll">
          <div className="pay-head">
            <button
              className="icon-back"
              onClick={() => flow.goToConfirm()}
              aria-label="Volver"
              data-testid="payment-back"
            >
              <Ic.chevron s={20} />
            </button>
            <div className="pay-head-mid">
              <div className="pay-head-k">Pagar tu parte</div>
              <div className="pay-head-v">{fmt(yourTotal)}</div>
            </div>
            <div className="pay-head-lock">
              <Ic.lock s={16} />
            </div>
          </div>

          <button
            className="test-card"
            onClick={fillTest}
            data-testid="payment-test-card"
          >
            <span className="tc-ic">
              <Ic.card s={16} />
            </span>
            <span className="tc-text">
              <b>Usar tarjeta de prueba</b>
              <small>Autollena los datos para el demo</small>
            </span>
            <Ic.chevron s={16} />
          </button>

          <div className="pay-block surfx">
            <div className="pay-block-head">
              <span className="sec-label" style={{ margin: 0 }}>
                Datos de tu tarjeta
              </span>
              <button className="scan-btn" onClick={() => setScanOpen(true)}>
                <Ic.camera s={16} /> Escanear
              </button>
            </div>
            <Field
              label="Número de tarjeta"
              inputMode="numeric"
              placeholder="0000 0000 0000 0000"
              value={card.num}
              onChange={(e) => setC("num", fmtNum(e.target.value))}
              error={E("num")}
            />
            <Field
              label="Nombre en la tarjeta"
              placeholder="Como aparece impreso"
              value={card.holder}
              onChange={(e) => setC("holder", e.target.value)}
              error={E("holder")}
            />
            <div className="field-row">
              <Field
                label="Vence"
                inputMode="numeric"
                placeholder="MM/AA"
                value={card.exp}
                onChange={(e) => setC("exp", fmtExp(e.target.value))}
                error={E("exp")}
              />
              <Field
                label="CVV"
                inputMode="numeric"
                placeholder="123"
                type="password"
                value={card.cvv}
                onChange={(e) =>
                  setC("cvv", e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                error={E("cvv")}
              />
            </div>
          </div>

          <div className="pay-block surfx">
            <div className="pay-block-head">
              <span className="sec-label" style={{ margin: 0 }}>
                Factura electrónica
              </span>
              {isLastPayer && <span className="req-pill">Obligatoria</span>}
            </div>

            {isLastPayer ? (
              <p className="field-note">
                Eres <b>la última persona</b> en pagar, así que la factura de
                la mesa va con tus datos (norma SRI).
              </p>
            ) : (
              <>
                <p className="field-note">
                  ¿Quién recibe la factura de tu parte?
                </p>
                <div className="bill-choice">
                  <button
                    className={
                      "bc-opt" + (billChoice === "later" ? " on" : "")
                    }
                    onClick={() => setBillChoice("later")}
                  >
                    <span className="bc-tick">
                      {billChoice === "later" && <Ic.check s={13} w={3} />}
                    </span>
                    Alguien más la llena
                  </button>
                  <button
                    className={"bc-opt" + (billChoice === "me" ? " on" : "")}
                    onClick={() => setBillChoice("me")}
                  >
                    <span className="bc-tick">
                      {billChoice === "me" && <Ic.check s={13} w={3} />}
                    </span>
                    Yo quiero recibirla
                  </button>
                </div>
              </>
            )}

            {wantBilling && (
              <div className="bill-fields">
                <Field
                  label="Nombre o razón social"
                  placeholder="Tu nombre / empresa"
                  value={bill.legalName}
                  onChange={(e) => setB("legalName", e.target.value)}
                  error={E("legalName")}
                />
                <Field
                  label="Cédula o RUC"
                  inputMode="numeric"
                  placeholder="0102030405"
                  value={bill.idNumber}
                  onChange={(e) =>
                    setB(
                      "idNumber",
                      e.target.value.replace(/\D/g, "").slice(0, 13),
                    )
                  }
                  error={E("idNumber")}
                />
                <Field
                  label="Dirección"
                  placeholder="Calle y número"
                  value={bill.address}
                  onChange={(e) => setB("address", e.target.value)}
                  error={E("address")}
                />
                <Field
                  label="Email"
                  type="email"
                  inputMode="email"
                  placeholder="tucorreo@mail.com"
                  value={bill.email}
                  onChange={(e) => setB("email", e.target.value)}
                  error={E("email")}
                />
                <Field
                  label="Teléfono"
                  optional
                  inputMode="tel"
                  placeholder="09 9999 9999"
                  value={bill.phone ?? ""}
                  onChange={(e) => setB("phone", e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="pay-secure" style={{ marginTop: 4 }}>
            <Ic.shield s={13} /> Pago cifrado · Mesita no guarda tu tarjeta
          </div>
        </div>

        <div className="flow-foot">
          {showErrors && !canPay && (
            <div className="foot-error">
              <Ic.bell s={14} /> {missingMsg()}
            </div>
          )}
          <button
            className={"c-pay-btn" + (canPay ? "" : " is-soft")}
            onClick={pay}
            aria-disabled={!canPay}
            data-testid="payment-pay-btn"
          >
            {busy ? <span className="btn-spin" /> : <Ic.lock s={18} />}{" "}
            {busy ? "Procesando…" : `Pagar ${fmt(yourTotal)}`}
          </button>
        </div>

        <CameraScanner
          isOpen={scanOpen}
          onCardDetected={(data) => {
            applyScannedCard(data);
            setScanOpen(false);
          }}
          onClose={() => setScanOpen(false)}
          language="es"
          allowManual={false}
        />
      </div>
    </div>
  );
}
