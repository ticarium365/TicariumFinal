import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  gradient?: boolean;
}

/**
 * Tüm sayfa başlıkları için tutarlı, marka aksanlı header.
 * Sol kenarda dikey yeşil-mavi gradient çubuğu, başlık opsiyonel
 * gradient metin, sağda aksiyon butonları.
 */
export function PageHeader({ title, description, actions, gradient = true }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div className="t365-heading-accent flex-1 min-w-0">
        <h1
          className={`text-2xl font-bold tracking-tight ${gradient ? "t365-gradient-text" : ""}`}
          style={{ fontFamily: "var(--font-display)" }}
          data-testid="page-title"
        >
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
