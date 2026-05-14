/** Two-letter initials for avatars (same rules as caisse employee chips). */
export function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
  }
  const one = parts[0] ?? "";
  if (one.length >= 2) return one.slice(0, 2).toUpperCase();
  if (one.length === 1) return `${one}${one}`.toUpperCase();
  return "??";
}

const AVATAR_GRADIENTS = [
  "from-violet-500 to-fuchsia-500",
  "from-orange-500 to-amber-500",
  "from-emerald-500 to-teal-500",
  "from-sky-500 to-indigo-500",
  "from-rose-500 to-pink-500",
  "from-cyan-500 to-blue-600",
] as const;

/** Stable gradient class from user id (or any seed string). */
export function gradientClassForSeed(seed: string): (typeof AVATAR_GRADIENTS)[number] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h + seed.charCodeAt(i) * (i + 1)) % 1_000_003;
  }
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length]!;
}
