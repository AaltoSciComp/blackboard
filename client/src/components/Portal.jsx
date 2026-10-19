// Simple DOM portal for rendering React content (context menus) outside the
// Konva stage. This used to manage a nested createRoot manually, but
// react-konva 19.3+ propagates React's StrictMode into its own reconciler,
// whose dev-only mount/unmount replay made that approach crash with "Cannot
// update an unmounted root". React's built-in createPortal is StrictMode-safe.

import { createPortal } from "react-dom";

export default function Portal({ children }) {
  return createPortal(children, document.body);
}
