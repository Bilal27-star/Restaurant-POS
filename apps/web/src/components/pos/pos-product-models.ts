/** POS product card / grid view model (API-backed or legacy). */

export type PosProductCardModel = {
  id: string;
  name: string;
  priceLabel: string;
  variant: "popular" | "default";
  showPopularBadge?: boolean;
  /** When false, card can show disabled state */
  available?: boolean;
};
