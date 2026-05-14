/** POS / takeaway customer — frontend-only; maps cleanly to a future DB row. */

export interface TakeawayCustomer {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
}
