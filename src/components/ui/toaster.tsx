"use client";

import { useToast } from "@/hooks/use-toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts
        .filter((t) => t.open !== false)
        .map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-lg px-4 py-3 shadow-lg text-sm flex flex-col gap-0.5 animate-in slide-in-from-bottom-2 ${
              toast.variant === "destructive"
                ? "bg-red-600 text-white"
                : "bg-zinc-900 text-white"
            }`}
          >
            {toast.title && <p className="font-semibold">{toast.title}</p>}
            {toast.description && <p className="opacity-90">{toast.description}</p>}
          </div>
        ))}
    </div>
  );
}
