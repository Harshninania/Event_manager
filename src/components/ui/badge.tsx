import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.2em]",
        variant === "default" && "bg-neutral-900 text-white",
        variant === "secondary" && "bg-neutral-100 text-neutral-700",
        className,
      )}
      {...props}
    />
  );
}
