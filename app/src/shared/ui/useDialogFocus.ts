import { useEffect, type RefObject } from 'react';
/** Keep keyboard focus in a modal, including at the browser-chrome Tab boundary. */
export function useDialogFocus(ref: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog.open) return;
      const targets = [
        ...dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter(
        (el) =>
          el.getClientRects().length > 0 &&
          getComputedStyle(el).visibility !== 'hidden' &&
          !el.closest('[inert]'),
      );
      const first = targets[0],
        last = targets.at(-1);
      if (!first) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', onKey);
    return () => dialog.removeEventListener('keydown', onKey);
  }, [ref]);
}
