import { useState, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { usePointerSheen } from "./usePointerSheen";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ Button */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "risk";
type ButtonOwn = { variant?: ButtonVariant; size?: "md" | "lg"; icon?: boolean; block?: boolean };

/** One primary per view. Icon-only buttons need an aria-label. */
export function Button({ variant = "secondary", size = "md", icon, block, className, type = "button", ...rest }: ButtonOwn & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cx("pl-btn", `pl-btn--${variant}`, size === "lg" && "pl-btn--lg", icon && "pl-btn--icon", block && "pl-btn--block", className)} {...rest} />;
}

/** A link styled as a button (navigation, not an action). */
export function ButtonLink({ variant = "secondary", size = "md", block, className, ...rest }: Omit<ButtonOwn, "icon"> & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={cx("pl-btn", `pl-btn--${variant}`, size === "lg" && "pl-btn--lg", block && "pl-btn--block", className)} {...rest} />;
}

export const Arrow = ({ size = 16 }: { size?: number }) => (
  <svg className="pl-arrow" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14" />
    <path d="M13 6l6 6-6 6" />
  </svg>
);

/* -------------------------------------------------------------------- Card */
export function Card({ well, className, ...rest }: { well?: boolean } & HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("pl-card", well && "pl-card--well", className)} {...rest} />;
}

/** A card that is itself a link: rise, edge, shadow 1 → 3, pointer sheen. */
export function LinkCard({ className, onPointerMove, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const sheen = usePointerSheen<HTMLAnchorElement>();
  return (
    <a
      className={cx("pl-card", "pl-card--link", className)}
      onPointerMove={(e) => {
        sheen(e);
        onPointerMove?.(e);
      }}
      {...rest}
    />
  );
}

/* -------------------------------------------------------------- StatusPill */
export type PillTone = "neutral" | "gold" | "sage" | "risk" | "ai";

/** Colour plus a word — never colour alone. `live` adds the pinging dot. */
export function StatusPill({ tone = "neutral", live, children, className }: { tone?: PillTone; live?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cx("pl-pill", `pl-pill--${tone}`, className)}>
      {live && <span className="pl-dot pl-dot--live" aria-hidden="true" />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------- Field */
type FieldBase = { label: string; hint?: string; error?: string; id: string };

export function TextField({ label, hint, error, id, ...rest }: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="pl-field">
      <label className="pl-label" htmlFor={id}>{label}</label>
      <input id={id} className="pl-input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
      {hint && <span id={`${id}-hint`} className="pl-hint">{hint}</span>}
      {error && <span id={`${id}-error`} className="pl-error" role="alert">{error}</span>}
    </div>
  );
}

export function TextAreaField({ label, hint, error, id, ...rest }: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="pl-field">
      <label className="pl-label" htmlFor={id}>{label}</label>
      <textarea id={id} className="pl-input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
      {hint && <span id={`${id}-hint`} className="pl-hint">{hint}</span>}
      {error && <span id={`${id}-error`} className="pl-error" role="alert">{error}</span>}
    </div>
  );
}

/** One answer option in a test or exercise: the whole row is the target. */
export function Choice({ children, type = "radio", ...rest }: { children: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="pl-choice">
      <input type={type} {...rest} />
      <span>{children}</span>
    </label>
  );
}

/* --------------------------------------------------------- Ground & Panel */
/** Once per page, first child of `.pl-app`. Decorative. */
export const Ground = () => (
  <div className="pl-ground" aria-hidden="true">
    <i className="pl-orb pl-orb--gold" />
    <i className="pl-orb pl-orb--sage" />
    <i className="pl-orb pl-orb--ai" />
    <i className="pl-grid" />
  </div>
);

/** The sidebar/hero's own lit ground — visible only in the hybrid theme. */
export const InnerGround = ({ orbs }: { orbs: Array<{ tone: "gold" | "sage" | "ai"; size: number; left: number; top: number }> }) => (
  <div className="pl-ground--inner" aria-hidden="true">
    {orbs.map((o, i) => (
      <i key={i} className={`pl-orb pl-orb--${o.tone}`} style={{ width: o.size, height: o.size, left: o.left, top: o.top }} />
    ))}
    <i className="pl-grid" />
  </div>
);

const BEAT = "M0 60H430L446 60L458 30L474 94L490 18L506 84L518 60H700L714 60L724 42L738 80L750 60H1128";
/** Pulse's heartbeat line, running behind a live panel. Stops under reduced motion. */
export const Beat = () => (
  <svg className="pl-beat" viewBox="0 0 1128 120" preserveAspectRatio="none" aria-hidden="true">
    <path className="pl-beat__base" d={BEAT} />
    <path className="pl-beat__run" pathLength={2000} d={BEAT} />
  </svg>
);

export function Panel({ live, children, className, ...rest }: { live?: boolean } & HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx("pl-panel", className)} {...rest}>
      <InnerGround orbs={[{ tone: "gold", size: 520, left: -160, top: -300 }, { tone: "sage", size: 560, left: 480, top: 60 }, { tone: "ai", size: 480, left: 880, top: -280 }]} />
      {live && <Beat />}
      {children}
    </section>
  );
}

export function Tile({ k, v, unit, meta }: { k: string; v: ReactNode; unit?: string; meta?: string }) {
  return (
    <div className="pl-tile">
      <div className="pl-tile__k">{k}</div>
      <div className="pl-tile__v">
        {v} {unit && <small>{unit}</small>}
      </div>
      {meta && <div className="pl-tile__m">{meta}</div>}
    </div>
  );
}

/* -------------------------------------------------------------- Progress */
export function Progress({ value, marker, label }: { value: number; marker?: number; label: string }) {
  const style: CSSProperties = { width: `${Math.max(0, Math.min(100, value))}%` };
  return (
    <div className="pl-progress" role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <i style={style} />
      {marker !== undefined && <em style={{ left: `${marker}%` }} />}
    </div>
  );
}

/* --------------------------------------------------------------- AppShell */
export type NavItem = { href: string; label: string; icon: ReactNode; current?: boolean; badge?: ReactNode };

/**
 * Sidebar (drawer under 1024px) + sticky top bar + content.
 * The rail is always an on-dark context; the top bar follows the theme.
 */
export function AppShell({
  nav, crumb, title, user, topbarEnd, children,
}: {
  nav: NavItem[];
  crumb?: string;
  title: string;
  user: { initials: string; name: string; context: string };
  topbarEnd?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pl-app">
      <Ground />
      <div className="pl-shell">
        <aside className={cx("pl-rail", open && "is-open")} aria-label="Main navigation">
          <InnerGround orbs={[{ tone: "gold", size: 420, left: -170, top: -190 }, { tone: "ai", size: 460, left: -130, top: 580 }]} />
          <div className="pl-rail-in">
            <a className="pl-brand" href="/">
              <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
                <circle cx="17" cy="17" r="15.5" fill="none" stroke="#c9a227" strokeWidth="2" />
                <path d="M6.5 17h4l2.4-6 4.3 12.5 2.7-6.5h6.6" fill="none" stroke="#c9a227" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span><b>pulse</b><small>Learning, measured</small></span>
            </a>
            <nav className="pl-nav" aria-label="Workspace">
              {nav.map((item) => (
                <a key={item.href} className="pl-nav-item" href={item.href} aria-current={item.current ? "page" : undefined} onClick={() => setOpen(false)}>
                  {item.icon}
                  {item.label}
                  {item.badge}
                </a>
              ))}
            </nav>
            <div className="pl-me">
              <span className="pl-avatar" aria-hidden="true">{user.initials}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 600 }}>{user.name}</span>
                <span style={{ display: "block", fontSize: 12, color: "var(--pl-lt-muted)" }}>{user.context}</span>
              </span>
            </div>
          </div>
        </aside>
        <div className="pl-rail-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
        <div className="pl-main">
          <header className="pl-topbar">
            <button className="pl-btn pl-btn--ghost pl-btn--icon pl-topbar__menu" type="button" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
            <div className="pl-crumb">
              {crumb && <small>{crumb}</small>}
              <b>{title}</b>
            </div>
            {topbarEnd}
          </header>
          <main className="pl-content">{children}</main>
        </div>
      </div>
    </div>
  );
}
