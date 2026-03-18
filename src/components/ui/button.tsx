"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "secondary" | "ghost" | "outline" | "destructive";

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-stone-950 text-white hover:bg-stone-800",
  secondary: "bg-stone-100 text-stone-900 hover:bg-stone-200",
  ghost: "bg-transparent text-stone-700 hover:bg-stone-100",
  outline: "border border-stone-300 bg-white text-stone-900 hover:bg-stone-50",
  destructive: "bg-rose-600 text-white hover:bg-rose-700",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
});
