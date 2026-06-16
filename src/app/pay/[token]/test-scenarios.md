# Guest Bill Page (02-04) - Manual Test Scenarios

## Test Plan for `/pay/[token]` Implementation

### Test Scenarios (9 total)

#### 1. **Open Bill (UNPAID status)**
- [ ] Navigate to `/pay/[token]` with valid table token
- [ ] Verify: Restaurant name displays at top
- [ ] Verify: Table number (Mesa X) displays
- [ ] Verify: Item list displays with quantities and prices
- [ ] Verify: Bill breakdown shows subtotal, propina, IVA, total
- [ ] Verify: Split mode selector visible (3 buttons)
- [ ] Verify: Voluntary tip selector visible (4 buttons)
- [ ] Verify: Pay button is enabled and visible
- [ ] Verify: No "Pago parcial" badge visible

#### 2. **Partial Payment (PARTIALLY_PAID status)**
- [ ] Create a bill with partial payment recorded
- [ ] Navigate to `/pay/[token]`
- [ ] Verify: "Pago parcial" badge displays
- [ ] Verify: Paid items are grayed out (zinc-400 text)
- [ ] Verify: Paid items show "Pagado" badge
- [ ] Verify: Unpaid items are normal color
- [ ] Verify: Split by item checkboxes are disabled for paid items
- [ ] Verify: Remaining balance is calculated correctly

#### 3. **Closed Bill (FULLY_PAID status)**
- [ ] Mark bill as fully paid
- [ ] Navigate to `/pay/[token]`
- [ ] Verify: "Cuenta cerrada — ¡gracias!" heading displays
- [ ] Verify: Restaurant name shows: "Restaurante: [name]"
- [ ] Verify: Confirmation message displays
- [ ] Verify: No payment button
- [ ] Verify: No item list or breakdown visible

#### 4. **No Active Bill (token valid, no bill)**
- [ ] With valid token but no open bill
- [ ] Navigate to `/pay/[token]`
- [ ] Verify: "No hay cuenta abierta para esta mesa" heading
- [ ] Verify: "Contacta a un mesero..." helper message
- [ ] Verify: No payment button
- [ ] Verify: No item list or breakdown visible

#### 5. **Invalid Token**
- [ ] Try `/pay/invalid-token-abc123`
- [ ] Verify: Error state or empty bill message displays
- [ ] Verify: Page doesn't crash
- [ ] Verify: Graceful error handling

#### 6. **Split Mode Interactions**
- [ ] **"Pagar todo" mode:**
  - [ ] Select mode, verify "Tu parte: [total]" displays
  - [ ] Verify amount matches total from breakdown
- [ ] **"Dividir en partes iguales" mode:**
  - [ ] Select mode, verify number input appears
  - [ ] Enter "3" people, verify "Tu parte: $X.XX" calculation
  - [ ] Change to "2" people, verify calculation updates
  - [ ] Try "0" people, verify "Tu parte: —" (dash)
- [ ] **"Dividir por ítem" mode:**
  - [ ] Select mode, verify checkboxes appear next to items
  - [ ] Select 2 items, verify "Tu parte: $X.XX" with sum
  - [ ] Deselect an item, verify total updates
  - [ ] Verify pay button disabled if no items selected

#### 7. **Voluntary Tip Interactions (GUEST-06)**
- [ ] **Default state:**
  - [ ] Verify 4 preset buttons visible: 5%, 10%, Personalizado, Ninguna
  - [ ] Verify "Total incluida propina:" displays base total (no extra tip)
- [ ] **Select "5%":**
  - [ ] Verify button becomes active (zinc-900 bg)
  - [ ] Verify total updates to base + 5% tip
  - [ ] Example: If base is $100, total should be $105
- [ ] **Select "10%":**
  - [ ] Verify button becomes active
  - [ ] Verify total updates to base + 10% tip
  - [ ] Example: If base is $100, total should be $110
- [ ] **Select "Personalizado":**
  - [ ] Verify currency input appears (48px height)
  - [ ] Enter "$2.50", verify total updates to base + $2.50
  - [ ] Enter "$0", verify total returns to base
- [ ] **Select "Ninguna":**
  - [ ] Verify button becomes active
  - [ ] Verify total reverts to base (no extra tip)
  - [ ] Verify custom input disappears
- [ ] **Tip amount in payment payload:**
  - [ ] Click Pay button with "5%" tip selected
  - [ ] Check browser DevTools Network tab
  - [ ] Verify POST payload includes: `"voluntaryTipAmount": 5.00` (or percentage value)

#### 8. **Silent Polling (4-second interval)**
- [ ] Open page, observe Network tab (or use browser logging)
- [ ] Verify: GET `/api/bills/[token]` request every 4 seconds
- [ ] Verify: No visible loading spinner while polling
- [ ] Change bill status externally (e.g., server closes bill)
- [ ] Verify: Page updates within 4-8 seconds
- [ ] Verify: No jarring UI flicker or reload
- [ ] Verify: Items list updates if new items added externally
- [ ] Close page, verify: polling stops (interval cleared)

#### 9. **Language Toggle**
- [ ] Click "ES" button (start in Spanish)
- [ ] Verify all UI strings are in Spanish:
  - [ ] "Mesa X", "Subtotal", "Propina 10% (mandatorio)", "IVA 15%", "Total a pagar"
  - [ ] "Pagar todo", "Dividir en partes iguales", "Dividir por ítem"
  - [ ] "Tu parte:", "Número de personas", "Pagar"
- [ ] Click "EN" button
- [ ] Verify all UI strings are in English:
  - [ ] "Table X", "Subtotal", "Tip 10% (mandatory)", "Tax 12%", "Total due"
  - [ ] "Pay full bill", "Split equally", "Split by item"
  - [ ] "Your share:", "Number of people", "Pay"
- [ ] Refresh page
- [ ] Verify: Language preference persists (from localStorage)
- [ ] Toggle multiple times, verify persistence

### Manual Testing Steps

1. **Setup:**
   - Ensure Phase 2-02 API endpoints are running (GET /api/bills/[token], POST /api/bills/[billId]/pay)
   - Create test restaurant, table, menu items via dashboard
   - Generate table QR code with token

2. **Scenario Execution:**
   - For each scenario, create/fetch a test bill with appropriate state
   - Open QR link or navigate directly to `/pay/[token]`
   - Test all interactions per checklist
   - Record pass/fail for each point

3. **Device Testing:**
   - Desktop browser (1024px+): Verify layout integrity
   - Tablet (768px): Verify responsive margins
   - Mobile (320px): Verify full-width, readable fonts, 48px touch targets

4. **Network Testing:**
   - Open DevTools Network tab
   - Verify polling requests: GET /api/bills/[token] every ~4 seconds
   - Verify pay request: POST /api/bills/[billId]/pay with correct payload

### Success Criteria

- [ ] All 9 test scenarios pass
- [ ] No console errors
- [ ] Responsive layout works at 320px, 768px, 1024px
- [ ] Polling works silently (no spinner, 4-second interval)
- [ ] Language toggle applies to all strings and persists
- [ ] Tip selector calculations correct (5%, 10%, custom)
- [ ] Pay button disabled states work (no items, no people, already paid)
- [ ] All strings from UI-SPEC copywriting contract match

### Notes

- Phase 2 stub: Pay button calls POST /api/bills/[billId]/pay (records payment only)
- Phase 3: Payment handler replaced with real Kushki integration
- All tests assume Phase 2-02 API endpoints are working
- Manual test log: create a separate file or use this markdown as checklist
