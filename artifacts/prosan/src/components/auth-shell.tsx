import { cn } from "@/lib/utils";

/**
 * Standalone auth layout: full viewport, no app sidebar/topbar.
 */
export function AuthShell({
  children,
  className,
  maxWidthClassName = "max-w-[400px]",
}: {
  children: React.ReactNode;
  className?: string;
  /** Card/content width (Tailwind classes). */
  maxWidthClassName?: string;
}) {
  return (
    <div
      className={cn(
        "min-h-screen w-full flex flex-col items-center justify-center px-4 py-10",
        "bg-[linear-gradient(180deg,var(--color-auth-wash-1)_0%,var(--color-auth-wash-2)_55%,var(--color-auth-wash-3)_100%)]",
        className
      )}
      style={{ color: "var(--color-neutral-900)" }}
    >
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10" aria-hidden>
        <div
          className="absolute top-0 right-0 w-[28rem] h-[28rem] rounded-full opacity-90"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in srgb, var(--color-accent-teal) 10%, transparent), transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-[28rem] h-[28rem] rounded-full opacity-90"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in srgb, var(--color-accent-violet) 10%, transparent), transparent 70%)",
          }}
        />
      </div>
      <div className={cn("w-full relative z-10", maxWidthClassName)}>{children}</div>
    </div>
  );
}
