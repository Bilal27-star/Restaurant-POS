/**
 * Dark app canvas — subtle depth (Linear / Vercel-style void).
 */
export function ShellBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-background" aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-b from-background via-[#0c0c0f] to-[#050506]" />
    </div>
  );
}

export const SHELL_BASE_BG = "#09090b";
