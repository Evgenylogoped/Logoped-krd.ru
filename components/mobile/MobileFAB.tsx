"use client";
import React from "react";

export default function MobileFAB({
  onClick,
  icon = "+",
  label,
  disabled,
}: {
  onClick?: () => void;
  icon?: React.ReactNode;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="fixed bottom-16 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-blue-600 text-white shadow-lg px-4 py-3 active:scale-[0.98] disabled:opacity-50"
      aria-label={typeof label === "string" ? label : "Действие"}
    >
      <span className="text-lg leading-none">{icon}</span>
      {label ? <span className="text-sm font-medium">{label}</span> : null}
    </button>
  );
}
