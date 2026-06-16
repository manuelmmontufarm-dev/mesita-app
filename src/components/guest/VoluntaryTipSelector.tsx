'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';

interface VoluntaryTipSelectorProps {
  tipAmount: number | null;
  onTipChange: (amount: number | null) => void;
  onPresetChange: (pct: 5 | 10 | null) => void;
  subtotal: number; // items subtotal only — propina/IVA excluded
  language?: 'es' | 'en';
}

const translations = {
  es: {
    label: 'Propina adicional (opcional)',
    helper: 'Es aparte de la propina del 10% que ya está incluida en tu cuenta.',
    buttonCustom: 'Personalizado',
    buttonNone: 'Ninguna',
    customLabel: 'Ingresa monto ($)',
  },
  en: {
    label: 'Extra tip (optional)',
    helper: 'This is separate from the 10% tip already included in your bill.',
    buttonCustom: 'Custom',
    buttonNone: 'None',
    customLabel: 'Enter amount ($)',
  },
};

export function VoluntaryTipSelector({
  tipAmount,
  onTipChange,
  onPresetChange,
  subtotal,
  language = 'es',
}: VoluntaryTipSelectorProps) {
  const [customAmount, setCustomAmount] = useState<string>(
    tipAmount && tipAmount > 0 ? tipAmount.toString() : ''
  );
  const [showCustom, setShowCustom] = useState(false);
  const t = translations[language];

  const tip5  = parseFloat((subtotal * 0.05).toFixed(2));
  const tip10 = parseFloat((subtotal * 0.10).toFixed(2));

  const handlePreset = (percentage: 5 | 10 | null) => {
    setShowCustom(false);
    onPresetChange(percentage);
    if (percentage === null) {
      onTipChange(null);
      setCustomAmount('');
    } else {
      const amount = parseFloat((subtotal * (percentage / 100)).toFixed(2));
      onTipChange(amount);
      setCustomAmount('');
    }
  };

  const handleCustomChange = (value: string) => {
    setCustomAmount(value);
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0) onTipChange(parseFloat(num.toFixed(2)));
    else if (value === '' || value === '0') onTipChange(null);
  };

  const is5  = tipAmount !== null && Math.abs(tipAmount - tip5)  < 0.01;
  const is10 = tipAmount !== null && Math.abs(tipAmount - tip10) < 0.01;
  const isNone   = !showCustom && (!tipAmount || tipAmount === 0);
  const isCustom = showCustom || (tipAmount !== null && tipAmount > 0 && !is5 && !is10);

  const btnBase    = 'flex flex-col items-center justify-center min-h-[64px] rounded-xl transition-colors cursor-pointer select-none';
  const btnActive  = 'bg-zinc-900 text-white';
  const btnInactive = 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50';

  return (
    <div className="bg-zinc-50 rounded-2xl p-4 space-y-3 border border-zinc-200">
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-zinc-600">{t.label}</p>
        <p className="text-xs text-zinc-400 leading-snug">{t.helper}</p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {/* 5% */}
        <button onClick={() => handlePreset(5 as 5)} className={`${btnBase} ${is5 ? btnActive : btnInactive}`}>
          <span className="text-sm font-bold">5%</span>
          <span className={`text-xs mt-0.5 ${is5 ? 'text-zinc-300' : 'text-zinc-400'}`}>
            ${tip5.toFixed(2)}
          </span>
        </button>

        {/* 10% */}
        <button onClick={() => handlePreset(10 as 10)} className={`${btnBase} ${is10 ? btnActive : btnInactive}`}>
          <span className="text-sm font-bold">10%</span>
          <span className={`text-xs mt-0.5 ${is10 ? 'text-zinc-300' : 'text-zinc-400'}`}>
            ${tip10.toFixed(2)}
          </span>
        </button>

        {/* Custom */}
        <button
          onClick={() => { setShowCustom(true); onTipChange(null); onPresetChange(null); setCustomAmount(''); }}
          className={`${btnBase} ${isCustom ? btnActive : btnInactive}`}
        >
          <span className="text-xs font-semibold leading-tight text-center px-1">
            {t.buttonCustom}
          </span>
          {isCustom && tipAmount != null && tipAmount > 0 && (
            <span className="text-xs mt-0.5 text-zinc-300">${tipAmount.toFixed(2)}</span>
          )}
        </button>

        {/* None */}
        <button onClick={() => handlePreset(null)} className={`${btnBase} ${isNone ? btnActive : btnInactive}`}>
          <span className="text-xs font-semibold">{t.buttonNone}</span>
        </button>
      </div>

      {isCustom && (
        <Input
          type="number"
          placeholder="0.00"
          value={customAmount}
          onChange={(e) => handleCustomChange(e.target.value)}
          className="min-h-[52px] text-base bg-white border border-zinc-300 rounded-xl"
          min="0"
          step="0.01"
          autoFocus
        />
      )}
    </div>
  );
}
