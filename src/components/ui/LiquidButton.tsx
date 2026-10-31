"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  AuroraGlowButton,
  type AuroraPalette,
  type AuroraVariant,
} from "./AuroraGlowButton";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface LiquidButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  trailing?: ReactNode;
  palette?: AuroraPalette;
  lit?: boolean;
}

const variantMap: Record<Variant, AuroraVariant> = {
  primary: "primary",
  secondary: "quiet",
  ghost: "ghost",
  danger: "primary",
};

export const LiquidButton = forwardRef<HTMLButtonElement, LiquidButtonProps>(
  function LiquidButton(
    {
      className,
      variant = "secondary",
      size = "md",
      palette = "boreal",
      lit,
      icon,
      trailing,
      children,
      disabled,
      type = "button",
      onClick,
      ...props
    },
    ref,
  ) {
    const auroraVariant = variantMap[variant] || "quiet";

    return (
      <AuroraGlowButton
        ref={ref}
        type={type}
        variant={auroraVariant}
        size={size}
        palette={palette}
        lit={lit}
        disabled={disabled}
        className={className}
        onClick={onClick ? (event) => onClick(event as React.MouseEvent<HTMLButtonElement>) : undefined}
        {...props}
      >
        {icon}
        {children}
        {trailing}
      </AuroraGlowButton>
    );
  },
);

LiquidButton.displayName = "LiquidButton";
