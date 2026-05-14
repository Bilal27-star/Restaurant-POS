import { useLocation } from "react-router-dom";

/** Route outlet placeholder — replace with feature screens later. */
export function MainPlaceholder() {
  const { pathname } = useLocation();
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-muted-foreground">
      <p className="text-sm font-medium text-foreground">Main content area</p>
      <p className="mt-2 text-xs">
        Current path: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{pathname}</code>
      </p>
    </div>
  );
}
