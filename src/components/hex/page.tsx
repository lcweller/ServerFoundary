import { cn } from "@/lib/utils";

export function PageContainer({
  children,
  className,
  maxWidth = 1280,
}: {
  children: React.ReactNode;
  className?: string;
  maxWidth?: number;
}) {
  return (
    <div
      className={cn("mx-auto w-full", className)}
      style={{ padding: "var(--hx-page-pad)", maxWidth }}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  meta,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className="mb-[var(--hx-gap-lg)] flex items-start justify-between gap-5"
    >
      <div className="min-w-0">
        <h1
          className="m-0 text-[22px] font-semibold"
          style={{ letterSpacing: "-0.02em" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="m-0 mt-1 max-w-[600px] text-[13.5px] text-[var(--hx-muted-fg)]">
            {subtitle}
          </p>
        )}
        {meta && <div className="mt-2.5">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({
  title,
  action,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="text-sm font-medium">{title}</div>
      {action}
    </div>
  );
}
