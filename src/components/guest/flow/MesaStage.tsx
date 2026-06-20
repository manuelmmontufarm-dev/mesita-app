"use client";

/**
 * MesaStage — pixel-faithful port of the "Mesa" tab from
 * `design_handoff_customer/customer/mesa.jsx`. Two variants:
 *
 *  • `mode === "item"`   — hero stats, claim progress bar, unclaimed card,
 *                          per-person cards listing each claimant's items.
 *  • `mode !== "item"`   — split-note card, coverage list of paid dishes,
 *                          contribution list of who has paid.
 *
 * State lives in `useGuestPaymentFlow`; this component is presentational and
 * dispatches via the `flow` API. Returns the scrollable inner content of the
 * Mesa tab only — chrome (sticky header + tabs + dock) is owned by the
 * `GuestBillFlow` shell.
 */

import type { useGuestPaymentFlow } from "@/hooks/useGuestPaymentFlow";
import {
  avatarColor,
  billSubtotal,
  claimantsOf,
  computeTotals,
  fmt,
  freeUnits,
  itemOwed,
  lineTotal,
  memberSubtotal,
  paidSubtotal,
  unclaimedItems,
  unitsOf,
} from "@/lib/guest-billing/split-math";
import type {
  BillItem,
  RestaurantConfig,
  TableMember,
} from "@/lib/guest-billing/types";

import { Ic, NamePill } from "./_shared";

type Flow = ReturnType<typeof useGuestPaymentFlow>;

const COPY_UNCLAIMED = "Aún falta reclamar";

/* ── per-item line inside a PersonCard ───────────────────────── */

function PersonItemLine({
  item,
  flow,
  members,
  memberId,
  paid,
}: {
  item: BillItem;
  flow: Flow;
  members: readonly TableMember[];
  memberId: string;
  paid: boolean;
}) {
  const u = unitsOf(flow.state.claims, item.id, memberId);
  const shared = claimantsOf(flow.state.claims, item.id, members).length > 1;
  const pct = Math.round((u / item.qty) * 100);
  return (
    <div className={"pi" + (paid ? " pi-paid" : "")}>
      <span className="e">{item.emoji}</span>
      <span className="pn">
        <b>{item.name}</b>
      </span>
      {paid && (
        <span className="pi-paidtag">
          <Ic.check s={10} w={3} /> Pagado
        </span>
      )}
      {!paid && shared ? (
        <span className="portion">{pct}%</span>
      ) : !paid && item.qty > 1 ? (
        <span className="portion">×{u}</span>
      ) : null}
      <span className="amt">
        {fmt(itemOwed(item, flow.state.claims, memberId))}
      </span>
    </div>
  );
}

/* ── one card per person ─────────────────────────────────────── */

function PersonCard({
  member,
  flow,
  items,
  members,
  config,
  paid,
}: {
  member: TableMember;
  flow: Flow;
  items: readonly BillItem[];
  members: readonly TableMember[];
  config: RestaurantConfig;
  paid: boolean;
}) {
  const { state } = flow;
  const ownedItems = items.filter(
    (it) => unitsOf(state.claims, it.id, member.id) > 0,
  );
  const sub = memberSubtotal(items, state.claims, member.id);
  const owed = computeTotals(sub, config, 0).total;
  return (
    <div className="person surfx">
      <div className="person-head">
        <NamePill
          member={member}
          name={member.isYou ? state.name : undefined}
          size={52}
        />
        <div className="nm">
          <div className="s">
            {ownedItems.length
              ? `${ownedItems.length} ítem${ownedItems.length > 1 ? "s" : ""}`
              : "Aún no escoge nada"}
          </div>
        </div>
        <div className={"owed" + (member.isYou ? " you-amt" : "")}>
          {paid ? (
            <span className="tag-paid">
              <Ic.check s={11} w={3} /> Pagado
            </span>
          ) : (
            <>
              <div className="a">{fmt(owed)}</div>
              <div className="l">con imp.</div>
            </>
          )}
        </div>
      </div>
      {ownedItems.length > 0 && (
        <div className="person-items">
          {ownedItems.map((it) => (
            <PersonItemLine
              key={it.id}
              item={it}
              flow={flow}
              members={members}
              memberId={member.id}
              paid={state.paidItemIds.includes(it.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── MesaStage (Mesa tab content) ────────────────────────────── */

export interface MesaStageProps {
  flow: Flow;
  items: readonly BillItem[];
  members: readonly TableMember[];
  config: RestaurantConfig;
}

export function MesaStage({ flow, items, members, config }: MesaStageProps) {
  const { state } = flow;
  const { mode, people, paidIds, paidItemIds, claims } = state;

  const fullSub = billSubtotal(items);
  const mesaTotal = computeTotals(fullSub, config, 0).total;
  const paidSub = paidSubtotal(items, paidItemIds);

  /* ── "por igual" / "todo" — coverage view ──────────────────── */
  if (mode !== "item") {
    const equal = mode === "equal";
    const remainingSub = Math.max(0, fullSub - paidSub);
    const perPerson = computeTotals(
      remainingSub / Math.max(1, people),
      config,
      0,
    ).total;

    const memberAmt = (id: string): number => {
      if (mode === "equal") return perPerson;
      return computeTotals(memberSubtotal(items, claims, id), config, 0).total;
    };
    const pctPaid =
      fullSub > 0 ? Math.min(100, Math.round((paidSub / fullSub) * 100)) : 0;

    let rem = 0; // extra coverage beyond paid dishes (none in the seed)
    const fills = items.map((it) => {
      if (paidItemIds.includes(it.id)) return 1;
      const lt = lineTotal(it);
      const f = Math.max(0, Math.min(1, rem / lt));
      rem -= lt;
      return f;
    });

    return (
      <>
        <div className="mesa-hero glassx">
          <div className="stat">
            {equal ? (
              <div className="stat-step">
                <button
                  className="ss-btn"
                  onClick={() => flow.setPeople(Math.max(1, people - 1))}
                  aria-label="Menos personas"
                >
                  <Ic.minus s={15} />
                </button>
                <div className="n">{people}</div>
                <button
                  className="ss-btn"
                  onClick={() => flow.setPeople(Math.min(20, people + 1))}
                  aria-label="Más personas"
                >
                  <Ic.plus s={15} />
                </button>
              </div>
            ) : (
              <div className="n">{people}</div>
            )}
            <div className="l">{equal ? "personas" : "en la mesa"}</div>
          </div>
          <div className="vline" />
          <div className="stat">
            <div className="n">{fmt(mesaTotal)}</div>
            <div className="l">total de la mesa</div>
          </div>
          <div className="vline" />
          <div className="stat">
            <div className="n">{pctPaid}%</div>
            <div className="l">pagado</div>
          </div>
        </div>

        <div className="split-note surfx" style={{ paddingBottom: 18 }}>
          <div className="ico">
            {equal ? <Ic.users s={26} /> : <Ic.receipt s={26} />}
          </div>
          <div className="t">
            {equal
              ? "Lo que falta se divide igual"
              : "Alguien paga toda la cuenta"}
          </div>
          {equal && <div className="big">{fmt(perPerson)}</div>}
          <div className="s">
            {equal
              ? `Lo que falta (${fmt(remainingSub)}) se reparte entre ${people} ${
                  people === 1 ? "persona" : "personas"
                }. No importa quién pidió qué.`
              : "Una persona cubre todo lo que falta de la cuenta de un solo."}
          </div>
        </div>

        {/* coverage — which dishes are paid */}
        <div>
          <div className="sec-label" style={{ marginBottom: 8 }}>
            Platos pagados
            <span className="sec-count">
              {fmt(paidSub)} de {fmt(fullSub)}
            </span>
          </div>
          <div className="cov-list surfx">
            {items.map((it, idx) => {
              const f = fills[idx];
              const covered = f >= 0.999;
              return (
                <div
                  key={it.id}
                  className={
                    "cov-row" +
                    (covered ? " is-covered" : f > 0 ? " is-partial" : "")
                  }
                >
                  <span
                    className="cov-fill"
                    style={{ width: f * 100 + "%" }}
                  />
                  <span className="cov-emoji">{it.emoji}</span>
                  <span className="cov-name">{it.name}</span>
                  {covered ? (
                    <span className="cov-check">
                      <Ic.check s={13} w={3} />
                    </span>
                  ) : (
                    <span className="cov-pending">Falta</span>
                  )}
                  <span className="cov-price">{fmt(lineTotal(it))}</span>
                </div>
              );
            })}
          </div>
          <p className="c-helper" style={{ marginTop: 10 }}>
            Los platos se marcan como pagados cuando alguien los cubre — así
            sabes qué falta.
          </p>
        </div>

        {/* who has paid */}
        <div className="sec-label" style={{ marginTop: 2 }}>
          Quién ya pagó
        </div>
        <div className="contrib-list surfx">
          {members.map((m) => {
            const amt = memberAmt(m.id);
            const paid = paidIds.includes(m.id);
            const share =
              mesaTotal > 0 ? Math.min(100, (amt / mesaTotal) * 100) : 0;
            return (
              <div key={m.id} className="contrib-row">
                <NamePill
                  member={m}
                  name={m.isYou ? state.name : undefined}
                  size={38}
                />
                <div className="contrib-main">
                  <div className="contrib-top">
                    {paid ? (
                      <span className="tag-paid">
                        <Ic.check s={11} w={3} /> Pagó
                      </span>
                    ) : (
                      <span className="contrib-amt">pendiente</span>
                    )}
                  </div>
                  <div className="contrib-bar">
                    <i
                      style={{
                        width: (paid ? Math.max(share, 8) : 0) + "%",
                        background: avatarColor(m.hue),
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  /* ── "item" mode — claim view ──────────────────────────────── */

  const claimedVal = members.reduce(
    (s, m) => s + memberSubtotal(items, claims, m.id),
    0,
  );
  const coveredVal = Math.max(claimedVal, paidSub);
  const pctClaimed = fullSub > 0 ? Math.round((coveredVal / fullSub) * 100) : 0;
  const free = unclaimedItems(items, claims).filter(
    (it) => !paidItemIds.includes(it.id),
  );

  const segs = members
    .map((m) => ({
      m,
      w: (memberSubtotal(items, claims, m.id) / Math.max(0.01, fullSub)) * 100,
    }))
    .filter((x) => x.w > 0.1);

  return (
    <>
      {/* hero stats */}
      <div className="mesa-hero glassx">
        <div className="stat">
          <div className="stat-step">
            <button
              className="ss-btn"
              onClick={() => flow.setPeople(Math.max(1, people - 1))}
              aria-label="Menos personas"
            >
              <Ic.minus s={15} />
            </button>
            <div className="n">{people}</div>
            <button
              className="ss-btn"
              onClick={() => flow.setPeople(Math.min(20, people + 1))}
              aria-label="Más personas"
            >
              <Ic.plus s={15} />
            </button>
          </div>
          <div className="l">en la mesa</div>
        </div>
        <div className="vline" />
        <div className="stat">
          <div className="n">{fmt(mesaTotal)}</div>
          <div className="l">total de la mesa</div>
        </div>
        <div className="vline" />
        <div className="stat">
          <div className="n">{pctClaimed}%</div>
          <div className="l">cubierto</div>
        </div>
      </div>

      {/* claim progress bar */}
      <div style={{ margin: "0 4px" }}>
        <div className="claimbar">
          {segs.map(({ m, w }) => (
            <i
              key={m.id}
              style={{ width: w + "%", background: avatarColor(m.hue) }}
            />
          ))}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 10,
            fontSize: 14,
            color: "var(--c-ink-2)",
          }}
        >
          <span>{fmt(coveredVal)} cubierto</span>
          {free.length > 0 ? (
            <span style={{ color: "#a06a05", fontWeight: 600 }}>
              {fmt(fullSub - coveredVal)} falta
            </span>
          ) : (
            <span style={{ color: "var(--ok)", fontWeight: 600 }}>
              Todo cubierto ✓
            </span>
          )}
        </div>
      </div>

      {/* unclaimed */}
      {free.length > 0 && (
        <div className="unclaimed-card">
          <div className="uc-h">
            <Ic.bell s={16} /> {COPY_UNCLAIMED}
          </div>
          <div className="uc-list">
            {free.map((it) => {
              const fu = freeUnits(it, claims);
              return (
                <div key={it.id} className="uc-item">
                  <span className="e">{it.emoji}</span>
                  <span className="nm">
                    {it.name}
                    {fu < it.qty ? ` · queda ${fu} de ${it.qty}` : ""}
                  </span>
                  <span className="amt">{fmt(fu * it.unitPrice)}</span>
                  <button
                    className="uc-claim"
                    onClick={() => flow.claimFromMesa(it)}
                    data-testid={`mesa-claim-${it.id}`}
                  >
                    Reclamar
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* people */}
      <div className="sec-label" style={{ marginTop: 2 }}>
        Personas en la mesa
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {members.map((m) => (
          <PersonCard
            key={m.id}
            member={m}
            flow={flow}
            items={items}
            members={members}
            config={config}
            paid={paidIds.includes(m.id)}
          />
        ))}
      </div>
    </>
  );
}
