import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

// Adapted from shadcn/ui (MIT); only the variants used by Aster are retained.
export const buttonVariants = cva(
  "inline-flex min-h-11 items-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-border bg-background text-foreground hover:bg-card",
      },
      align: { center: "justify-center", between: "justify-between" },
    },
    defaultVariants: { variant: "default", align: "center" },
  },
);

export function Button({
  className,
  variant,
  align,
  type = "button",
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      data-slot="button"
      type={type}
      className={buttonVariants({ variant, align, className })}
      {...props}
    />
  );
}
