'use client';

import { Input } from '@/components/ui/input';

interface EqualSplitInputProps {
  value: number;
  onChange: (num: number) => void;
  totalAmount: number;
  showShare: boolean;
}

export function EqualSplitInput({
  value,
  onChange,
  totalAmount,
  showShare,
}: EqualSplitInputProps) {
  const shareAmount = value > 0 ? totalAmount / value : 0;

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-2">
          Número de personas
        </label>
        <Input
          type="number"
          min="1"
          max="99"
          value={value || ''}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          placeholder="3"
          className="min-h-[48px] text-base bg-zinc-100 border border-zinc-900"
        />
      </div>
      {showShare && (
        <div className="text-lg font-bold text-zinc-900">
          Tu parte: {value > 0 ? `$${shareAmount.toFixed(2)}` : '—'}
        </div>
      )}
    </div>
  );
}
