'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Modal({
  open,
  onClose,
  title = '',
  children,
  footer = null,
  maxWidthClass = 'max-w-lg',
  closeOnOverlay = true,
}) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 isolate z-[9999]" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[1px]"
        onClick={closeOnOverlay ? onClose : undefined}
        aria-hidden="true"
      />

      <div className="relative z-10 flex min-h-full items-center justify-center overflow-y-auto p-4">
        <div
          className={`relative w-full rounded-xl border border-gray-200 bg-white shadow-2xl ${maxWidthClass}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-5 py-4">{children}</div>

          {footer ? <div className="border-t border-gray-200 px-5 py-4">{footer}</div> : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
