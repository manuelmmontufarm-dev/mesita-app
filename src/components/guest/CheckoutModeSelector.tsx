'use client';

type CheckoutMode = 'CONSUMIDOR_FINAL' | 'FACTURA_CON_DATOS';

interface CheckoutModeSelectorProps {
  selected: CheckoutMode;
  onSelect: (mode: CheckoutMode) => void;
  language: 'es' | 'en';
}

export function CheckoutModeSelector({ selected, onSelect, language }: CheckoutModeSelectorProps) {
  const options: { k: CheckoutMode; icon: string; title: string; sub: string }[] = language === 'es'
    ? [
        { k: 'CONSUMIDOR_FINAL', icon: '⚡', title: 'Consumidor Final', sub: 'Sin datos personales · Rápido' },
        { k: 'FACTURA_CON_DATOS', icon: '📄', title: 'Factura con Datos', sub: 'Con mis datos para factura personalizada' },
      ]
    : [
        { k: 'CONSUMIDOR_FINAL', icon: '⚡', title: 'Consumer', sub: 'No personal data · Fast' },
        { k: 'FACTURA_CON_DATOS', icon: '📄', title: 'Invoice with Data', sub: 'With my details for a personalized invoice' },
      ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {options.map(o => (
        <button
          key={o.k}
          className={`checkout-card${selected === o.k ? ' on' : ''}`}
          onClick={() => onSelect(o.k)}
        >
          <div className="ico">
            <span style={{ fontSize: 22 }}>{o.icon}</span>
          </div>
          <div className="txt" style={{ flex: 1, textAlign: 'left' }}>
            <p className="t">{o.title}</p>
            <p className="s">{o.sub}</p>
          </div>
          <div className="chk">
            {selected === o.k && (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
