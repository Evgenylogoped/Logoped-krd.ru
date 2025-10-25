"use client";
import React from "react";

export default function MobileToast({ message, onClose }: { message: string; onClose?: () => void }) {
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const t = setTimeout(() => { setVisible(false); onClose?.(); }, 2500);
    return () => clearTimeout(t);
  }, [onClose]);
  if (!visible) return null;
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
      <div className="rounded-full bg-black/80 text-white px-4 py-2 text-sm shadow-lg">
        {message}
      </div>
    </div>
  );
}
