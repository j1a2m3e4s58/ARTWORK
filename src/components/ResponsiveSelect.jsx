import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';

const VIEWPORT_GAP = 10;
const MAX_MENU_HEIGHT = 320;
const MIN_MENU_HEIGHT = 144;

export default function ResponsiveSelect({
  value,
  onChange,
  options,
  label = 'Choose an option',
  disabled = false,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const listboxId = useId();
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const normalized = options.map(option => (
    typeof option === 'string' ? { value: option, label: option } : option
  ));
  const selected = normalized.find(option => option.value === value);

  const placeMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const availableBelow = viewportHeight - rect.bottom - VIEWPORT_GAP;
    const availableAbove = rect.top - VIEWPORT_GAP;
    const openAbove = availableBelow < MIN_MENU_HEIGHT && availableAbove > availableBelow;
    const width = Math.min(rect.width, viewportWidth - VIEWPORT_GAP * 2);
    const left = Math.min(
      Math.max(VIEWPORT_GAP, rect.left),
      Math.max(VIEWPORT_GAP, viewportWidth - width - VIEWPORT_GAP),
    );
    const availableHeight = openAbove ? availableAbove : availableBelow;

    setPosition({
      left,
      width,
      top: openAbove ? undefined : rect.bottom + 4,
      bottom: openAbove ? viewportHeight - rect.top + 4 : undefined,
      maxHeight: Math.max(MIN_MENU_HEIGHT, Math.min(MAX_MENU_HEIGHT, availableHeight)),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    placeMenu();
    const reposition = () => placeMenu();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, placeMenu]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePress = event => {
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
        className={`flex min-h-11 w-full min-w-0 items-center justify-between gap-3 border border-brass/15 bg-obsidian px-3 py-2 text-left text-sm text-ivory transition-colors hover:border-brass/35 disabled:opacity-40 ${className}`}
        aria-label={label}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
      >
        <span className="truncate capitalize">{selected?.label || label}</span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-brass/65 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && position && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          aria-label={label}
          style={position}
          className="fixed z-[12000] overflow-y-auto overscroll-contain border border-brass/25 bg-[#111116] p-1 shadow-[0_18px_50px_rgba(0,0,0,.55)]"
        >
          {normalized.map(option => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                triggerRef.current?.focus();
              }}
              className={`flex min-h-11 w-full items-center justify-between gap-3 border-b border-ivory/5 px-3 py-2.5 text-left text-sm capitalize transition-colors last:border-b-0 ${
                option.value === value
                  ? 'bg-brass/15 text-brass'
                  : 'text-ivory/70 hover:bg-ivory/5 hover:text-ivory'
              }`}
            >
              <span className="min-w-0 break-words">{option.label}</span>
              {option.value === value && <Check size={16} className="shrink-0" />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
