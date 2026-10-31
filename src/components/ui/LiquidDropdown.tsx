"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type {
  HTMLAttributes,
  ReactElement,
  ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export interface DropdownItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

interface LiquidDropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: "start" | "end";
  className?: string;
  label?: string;
}

export function LiquidDropdown({
  trigger,
  items,
  align = "end",
  className,
  label,
}: LiquidDropdownProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 210;
    const menuHeight = Math.min(items.length * 40 + 16, 340);
    let left = align === "end" ? rect.right - menuWidth : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
    let top = rect.bottom + 6;
    if (top + menuHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuHeight - 6);
    }
    setPosition({ top, left });
  }, [open, align, items.length]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      menuRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const focusTrigger = () => {
      triggerRef.current
        ?.querySelector<HTMLElement>("button, a")
        ?.focus();
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      focusTrigger();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    const handleScroll = (event: Event) => {
      const target = event.target as EventTarget | null;
      if (target && menuRef.current?.contains(target as Node)) return;
      if (
        target === document ||
        target === document.body ||
        target === document.documentElement ||
        target === window
      ) {
        setOpen(false);
      }
    };
    const handleResize = () => setOpen(false);
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  const triggerNode = isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<HTMLAttributes<HTMLElement>>, {
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": menuId,
      })
    : trigger;

  return (
    <>
      <div
        ref={triggerRef}
        className={cn("inline-flex", className)}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {triggerNode}
      </div>
      {mounted &&
        open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            style={{ top: position.top, left: position.left }}
            onKeyDown={(event) => {
              const itemsInMenu = Array.from(
                menuRef.current?.querySelectorAll<HTMLButtonElement>(
                  '[role="menuitem"]:not([disabled])',
                ) ?? [],
              );
              if (itemsInMenu.length === 0) return;
              const currentIndex = itemsInMenu.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const direction = event.key === "ArrowDown" ? 1 : -1;
                const next =
                  (currentIndex + direction + itemsInMenu.length) %
                  itemsInMenu.length;
                itemsInMenu[next]?.focus();
              } else if (event.key === "Home") {
                event.preventDefault();
                itemsInMenu[0]?.focus();
              } else if (event.key === "End") {
                event.preventDefault();
                itemsInMenu[itemsInMenu.length - 1]?.focus();
              } else if (event.key === "Tab") {
                event.preventDefault();
                setOpen(false);
                triggerRef.current
                  ?.querySelector<HTMLElement>("button, a")
                  ?.focus();
              }
            }}
            className="liquid-raised rim fixed z-[80] w-[210px] overflow-hidden rounded-2xl p-1.5 shadow-2xl animate-scale-in"
          >
            {items.map((item, index) => (
              <div key={`${item.label}-${index}`}>
                {item.separatorBefore && (
                  <div className="my-1.5 h-px bg-white/[0.07]" />
                )}
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpen(false);
                    triggerRef.current
                      ?.querySelector<HTMLElement>("button, a")
                      ?.focus();
                    item.onSelect();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[12.5px] transition hover:bg-white/[0.08] disabled:pointer-events-none disabled:opacity-40",
                    item.danger
                      ? "text-[var(--danger)]"
                      : "text-[var(--text-dim)] hover:text-white",
                  )}
                >
                  {item.icon && (
                    <span className="grid h-4 w-4 place-items-center opacity-80">
                      {item.icon}
                    </span>
                  )}
                  {item.label}
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
