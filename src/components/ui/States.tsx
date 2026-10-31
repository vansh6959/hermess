import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function LoadingSkeleton({
  className,
  rounded = "rounded-2xl",
}: {
  className?: string;
  rounded?: string;
}) {
  return <div className={cn("skeleton", rounded, className)} aria-hidden />;
}

export function CardSkeleton() {
  return (
    <div className="space-y-3">
      <LoadingSkeleton className="aspect-square w-full" />
      <LoadingSkeleton className="h-3.5 w-3/4" rounded="rounded-full" />
      <LoadingSkeleton className="h-3 w-1/2" rounded="rounded-full" />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "liquid rim flex flex-col items-center justify-center rounded-3xl px-6 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-[var(--acid)]">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-white">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-[var(--text-mute)]">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went quiet",
  description = "This part of the app could not load. Try again in a moment.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <EmptyState
      icon={<span className="text-xl">!</span>}
      title={title}
      description={description}
      action={action}
    />
  );
}
