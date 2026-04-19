import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Inbox, type LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  primaryAction?: { label: string; href?: string; onClick?: () => void; testId?: string };
  secondaryAction?: { label: string; href?: string; onClick?: () => void; testId?: string };
  className?: string;
};

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  primaryAction,
  secondaryAction,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center ${className}`}
      data-testid="empty-state"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mb-1 text-base font-semibold text-slate-800">{title}</h3>
      {description && (
        <p className="mb-5 max-w-md text-sm text-slate-500">{description}</p>
      )}
      {(primaryAction || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {primaryAction && (
            primaryAction.href ? (
              <Link href={primaryAction.href}>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700" data-testid={primaryAction.testId ?? "empty-primary"}>
                  {primaryAction.label}
                </Button>
              </Link>
            ) : (
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={primaryAction.onClick} data-testid={primaryAction.testId ?? "empty-primary"}>
                {primaryAction.label}
              </Button>
            )
          )}
          {secondaryAction && (
            secondaryAction.href ? (
              <Link href={secondaryAction.href}>
                <Button size="sm" variant="outline" data-testid={secondaryAction.testId ?? "empty-secondary"}>
                  {secondaryAction.label}
                </Button>
              </Link>
            ) : (
              <Button size="sm" variant="outline" onClick={secondaryAction.onClick} data-testid={secondaryAction.testId ?? "empty-secondary"}>
                {secondaryAction.label}
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
}
