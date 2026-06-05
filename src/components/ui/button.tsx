import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "icon";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-150",
          variant === "default" && "border-transparent bg-neutral-950 text-white hover:bg-neutral-800",
          variant === "ghost" && "border-transparent bg-transparent text-neutral-950 hover:bg-neutral-100",
          variant === "outline" && "border-neutral-200 bg-white text-neutral-950 hover:bg-neutral-50",
          size === "icon" && "h-10 w-10 px-0",
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
