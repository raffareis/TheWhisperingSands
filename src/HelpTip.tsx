import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { CircleHelp } from "lucide-react";
import "./help-tip.css";

/** Secondary explanation behind a labelled button: tap, click or keyboard; Escape closes. */
export function HelpTip({ label, text }: { label: string; text: string[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = panel.current;
    if (!open || !el) return;
    // Reposition again on resize/scroll, including phone rotation while open.
    const position = () => {
      el.style.translate = "";
      el.classList.remove("above");
      const box = el.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      let shift = 0;
      if (box.right > width - 8) shift = width - 8 - box.right;
      if (box.left + shift < 8) shift = 8 - box.left;
      el.style.translate = `${shift}px 0`;
      const anchor = button.current!.getBoundingClientRect();
      if (box.bottom > innerHeight - 8 && anchor.top > box.height + 16)
        el.classList.add("above");
    };
    position();
    window.addEventListener("resize", position);
    document.addEventListener("scroll", position, true);
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("resize", position);
      document.removeEventListener("scroll", position, true);
    };
  }, [open]);
  function key(event: KeyboardEvent) {
    if (event.key !== "Escape" || !open) return;
    // Close only the tip, not an enclosing dialog.
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    button.current?.focus();
  }
  return (
    <div
      className="help-tip"
      ref={root}
      onKeyDown={key}
      onBlur={(event) => {
        // Tabbing elsewhere closes; window blur (no related target) does not.
        const next = event.relatedTarget as Node | null;
        if (next && !root.current?.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className="help-tip-button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        <CircleHelp size={16} aria-hidden="true" />
      </button>
      <div
        ref={panel}
        id={id}
        className="help-tip-panel"
        role="note"
        tabIndex={-1}
        hidden={!open}
      >
        {text.map((line) => (
          <span className="help-tip-line" key={line}>
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}
