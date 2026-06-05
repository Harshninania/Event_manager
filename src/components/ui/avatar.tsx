import { cn } from "@/lib/utils";

export function Avatar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative inline-flex h-10 w-10 overflow-hidden rounded-full bg-neutral-100",
        className,
      )}
      {...props}
    />
  );
}

export function AvatarImage({ className, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  return <img className={cn("h-full w-full object-cover", className)} {...props} />;
}

export function AvatarFallback({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "flex h-full w-full items-center justify-center bg-neutral-900 text-sm font-semibold text-white",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
