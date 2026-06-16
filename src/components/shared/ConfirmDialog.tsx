"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "destructive" renders the confirm button in the error color. */
  variant?: "default" | "destructive";
  /** May be async — the dialog shows a busy state and closes on success. */
  onConfirm: () => void | Promise<void>;
}

/**
 * Accessible confirmation dialog (Radix-based) — replaces window.confirm().
 * Keyboard/focus handling, escape-to-cancel and overlay-click-to-cancel
 * come from the shared Dialog primitives.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  onConfirm,
}: ConfirmDialogProps) {
  const [isWorking, setIsWorking] = useState(false);

  const handleConfirm = async () => {
    try {
      setIsWorking(true);
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isWorking) return; // don't dismiss mid-action
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="pt-1 leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={isWorking}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            className="h-11 text-white"
            disabled={isWorking}
            onClick={handleConfirm}
            style={{
              background: variant === "destructive" ? "var(--error)" : "var(--ink-900)",
            }}
          >
            {isWorking ? "Procesando…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
