"use client";
import { useEffect, useRef } from "react";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    return () => dialogRef.current?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onCancel={onCancel}
      className="rounded-2xl shadow-xl border border-gray-200 p-0 backdrop:bg-black/30 w-full max-w-sm"
    >
      <div className="p-6 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
      </div>
      <div className="flex justify-end gap-2 px-6 pb-5">
        <button
          onClick={onCancel}
          className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          className={`text-sm px-4 py-2 rounded-lg font-medium text-white transition ${
            danger
              ? "bg-red-500 hover:bg-red-600"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
