'use client';

import { Button } from '@/components/ui/button';

interface SplitModeSelectorProps {
  splitMode: string;
  onModeChange: (mode: string) => void;
}

export function SplitModeSelector({
  splitMode,
  onModeChange,
}: SplitModeSelectorProps) {
  const modes = [
    { id: 'FULL', label: 'Pagar todo' },
    { id: 'EQUAL', label: 'Dividir en partes iguales' },
    { id: 'BY_ITEM', label: 'Dividir por ítem' },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {modes.map((mode) => (
          <Button
            key={mode.id}
            onClick={() => onModeChange(mode.id)}
            variant={splitMode === mode.id ? 'default' : 'outline'}
            className={`min-h-[48px] text-sm font-medium ${
              splitMode === mode.id
                ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                : 'bg-zinc-100 text-zinc-700 border-none hover:bg-zinc-200'
            }`}
          >
            {mode.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
