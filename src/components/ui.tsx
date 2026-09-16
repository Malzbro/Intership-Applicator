import Link from "next/link";
import { ArrowLeftIcon, InfoIcon } from "./icons";

export function PageHeader({
  title,
  description,
  actions,
  back,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  eyebrow?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="page-eyebrow hover:text-fg transition-colors w-fit">
            <ArrowLeftIcon size={14} />
            {back.label}
          </Link>
        )}
        {!back && eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-desc">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center text-center px-6 py-14">
      {icon && (
        <div className="mb-4 grid size-10 place-items-center rounded-xl bg-surface-2 text-muted">
          {icon}
        </div>
      )}
      <h2 className="section-title">{title}</h2>
      {children && <div className="mt-1.5 text-sm text-muted max-w-[46ch]">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Notice({
  tone = "warn",
  children,
}: {
  tone?: "warn" | "danger" | "accent";
  children: React.ReactNode;
}) {
  const color = tone === "danger" ? "text-danger" : tone === "accent" ? "text-accent" : "text-warn";
  return (
    <div className={`notice notice-${tone}`} role={tone === "danger" ? "alert" : undefined}>
      <InfoIcon size={16} className={`mt-0.5 shrink-0 ${color}`} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Status({ busy, error, ok }: { busy?: string | null; error?: string | null; ok?: string | null }) {
  if (error) return <p className="text-sm text-danger" role="alert">{error}</p>;
  if (busy) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
        <span className="size-3.5 rounded-full border-2 border-border-strong border-t-accent animate-spin" />
        {busy}
      </p>
    );
  }
  if (ok) return <p className="text-sm text-accent-strong" aria-live="polite">{ok}</p>;
  return null;
}

export function SkeletonCards({ count = 3, height = "h-28" }: { count?: number; height?: string }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`card card-pad ${height}`}>
          <div className="skeleton h-4 w-2/5" />
          <div className="skeleton mt-3 h-3 w-3/5" />
          <div className="skeleton mt-2 h-3 w-1/4" />
        </div>
      ))}
    </div>
  );
}
