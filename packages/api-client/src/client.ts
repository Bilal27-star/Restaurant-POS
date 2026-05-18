import type { ApiErrorEnvelope, ApiSuccessEnvelope, LoginRequest, LoginResponse } from "./types.js";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export type PosApiClientOptions = {
  /** e.g. "" when using Vite proxy, or "http://localhost:4000" */
  baseUrl: string;
  getAccessToken: () => string | null;
  onUnauthorized?: () => void;
  /** Merged into every request (e.g. desktop client marker for local API bypass). */
  getRequestHeaders?: () => Record<string, string>;
  /** Optional trace hook for diagnostics (URL, status, method). */
  onHttpTrace?: (info: { url: string; method: string; status: number }) => void;
};

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const looksHtml = text.trimStart().startsWith("<");
    const hint = looksHtml ? " (received HTML — wrong API URL or server not running)" : "";
    return { success: false as const, error: `Invalid JSON response${hint}` };
  }
}

export function createPosApiClient(opts: PosApiClientOptions) {
  const apiRoot = joinUrl(opts.baseUrl, "/api/v1");

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);

    let token = opts.getAccessToken();

    // Fallback for desktop/browser refreshes where auth context is not ready yet
    if (!token && typeof window !== "undefined") {
      token =
        localStorage.getItem("accessToken") ||
        sessionStorage.getItem("accessToken") ||
        localStorage.getItem("token") ||
        sessionStorage.getItem("token") ||
        null;
    }

    if (token && token.trim().length > 0) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    const extra = opts.getRequestHeaders?.();
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        if (v) headers.set(k, v);
      }
    }
    if (init?.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const method = init?.method ?? "GET";
    const url = joinUrl(apiRoot, path);
    const res = await fetch(url, {
      ...init,
      headers,
      credentials: "include",
    });
    opts.onHttpTrace?.({ url, method, status: res.status });

    const json = (await readJson(res)) as ApiSuccessEnvelope<T> | ApiErrorEnvelope | null;

    if (res.status === 401 && opts.onUnauthorized) {
      opts.onUnauthorized();
    }

    if (!json || typeof json !== "object" || !("success" in json)) {
      throw new ApiClientError("Malformed API response", res.status);
    }
    if (!json.success) {
      const err = json as ApiErrorEnvelope;
      throw new ApiClientError(err.error || "Request failed", res.status, err.details);
    }
    return (json as ApiSuccessEnvelope<T>).data;
  }

  return {
    request,

    auth: {
      login: (body: LoginRequest) =>
        request<LoginResponse>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
      refresh: (body: Record<string, unknown> = {}) =>
        request<{ accessToken: string; expiresIn: number; refreshToken?: string; tokenType: "Bearer" }>(
          "/auth/refresh",
          { method: "POST", body: JSON.stringify(body) },
        ),
      logout: (body: Record<string, unknown> = {}) => request<{ ok: true }>("/auth/logout", { method: "POST", body: JSON.stringify(body) }),
      me: () => request<{ user: unknown; auth: unknown }>("/auth/me"),
    },

    navigation: {
      getCounts: () =>
        request<{ occupiedTables: number; dineInOpenOrders: number; takeawayOpen: number }>("/navigation/counts"),
    },

    users: {
      meContext: () =>
        request<{ userId: string; restaurantId: string; roles: string[]; permissions: string[] }>("/users/me"),
      list: () => request<unknown[]>("/users/"),
      createUser: (body: Record<string, unknown>) => request<unknown>("/users", { method: "POST", body: JSON.stringify(body) }),
      patchUser: (userId: string, body: Record<string, unknown>) =>
        request<unknown>(`/users/${userId}`, { method: "PATCH", body: JSON.stringify(body) }),
      deleteUser: (userId: string) => request<unknown>(`/users/${userId}`, { method: "DELETE" }),
    },

    tables: {
      getLayout: () => request<unknown>("/tables/layout"),
      list: () => request<unknown>("/tables"),
      get: (tableId: string) => request<unknown>(`/tables/${tableId}`),
      createFloor: (body: { name: string; sortOrder?: number }) =>
        request<unknown>("/tables/floors", { method: "POST", body: JSON.stringify(body) }),
      patchFloor: (floorId: string, body: { name?: string; sortOrder?: number }) =>
        request<unknown>(`/tables/floors/${floorId}`, { method: "PATCH", body: JSON.stringify(body) }),
      deleteFloor: (floorId: string) => request<unknown>(`/tables/floors/${floorId}`, { method: "DELETE" }),
      createTable: (body: { floorId?: string | null; number: string; capacity: number }) =>
        request<unknown>("/tables", { method: "POST", body: JSON.stringify(body) }),
      patchTable: (tableId: string, body: Record<string, unknown>) =>
        request<unknown>(`/tables/${tableId}`, { method: "PATCH", body: JSON.stringify(body) }),
      deleteTable: (tableId: string) => request<unknown>(`/tables/${tableId}`, { method: "DELETE" }),
    },

    menu: {
      listCategories: () => request<unknown>("/menu/categories"),
      listItems: () => request<unknown>("/menu/items"),
      getItem: (itemId: string) => request<unknown>(`/menu/items/${itemId}`),
      getCatalog: () => request<unknown>("/menu/catalog"),
      createCategory: (body: { name: string; sortOrder?: number; colorToken?: string | null; iconKey?: string | null }) =>
        request<unknown>("/menu/categories", { method: "POST", body: JSON.stringify(body) }),
      patchCategory: (
        categoryId: string,
        body: { name?: string; sortOrder?: number; colorToken?: string | null; iconKey?: string | null },
      ) => request<unknown>(`/menu/categories/${categoryId}`, { method: "PATCH", body: JSON.stringify(body) }),
      deleteCategory: (categoryId: string) => request<unknown>(`/menu/categories/${categoryId}`, { method: "DELETE" }),
      createItem: (body: {
        categoryId: string;
        name: string;
        description?: string;
        basePrice: string;
        available?: boolean;
        popular?: boolean;
        sortOrder?: number;
        imageUrl?: string | null;
        ingredients?: { name: string; removable?: boolean }[];
        modifiers?: { name: string; extraPrice: string }[];
      }) => request<unknown>("/menu/items", { method: "POST", body: JSON.stringify(body) }),
      patchItem: (
        itemId: string,
        body: {
          categoryId?: string;
          name?: string;
          description?: string | null;
          basePrice?: string;
          available?: boolean;
          popular?: boolean;
          sortOrder?: number;
          imageUrl?: string | null;
          ingredients?: { name: string; removable?: boolean }[];
          modifiers?: { name: string; extraPrice: string }[];
        },
      ) => request<unknown>(`/menu/items/${itemId}`, { method: "PATCH", body: JSON.stringify(body) }),
      deleteItem: (itemId: string) => request<unknown>(`/menu/items/${itemId}`, { method: "DELETE" }),
      reorderCategories: (orders: { id: string; sortOrder: number }[]) =>
        request<unknown>("/menu/categories/reorder", { method: "POST", body: JSON.stringify({ orders }) }),
      reorderItems: (orders: { id: string; sortOrder: number }[]) =>
        request<unknown>("/menu/items/reorder", { method: "POST", body: JSON.stringify({ orders }) }),
    },
    
    customers: {
      list: () => request<unknown>("/customers"),
      search: (q: string) => request<unknown>(`/customers/search?q=${encodeURIComponent(q)}`),
      upsert: (body: { id?: string; name: string; phone?: string; address?: string; notes?: string }) =>
        request<unknown>("/customers", { method: "POST", body: JSON.stringify(body) }),
    },

    orders: {
      listActive: (query?: Record<string, string>) => {
        const q = query ? `?${new URLSearchParams(query).toString()}` : "";
        return request<unknown>(`/orders${q}`);
      },
      history: (query?: Record<string, string>) => {
        const q = query ? `?${new URLSearchParams(query).toString()}` : "";
        return request<unknown>(`/orders/history${q}`);
      },
      get: (orderId: string) => request<unknown>(`/orders/${orderId}`),
      create: (body: unknown) => request<unknown>("/orders/", { method: "POST", body: JSON.stringify(body) }),
      patch: (orderId: string, body: unknown) =>
        request<unknown>(`/orders/${orderId}`, { method: "PATCH", body: JSON.stringify(body) }),
      addLines: (orderId: string, body: unknown) =>
        request<unknown>(`/orders/${orderId}/lines`, { method: "POST", body: JSON.stringify(body) }),
      patchLine: (orderId: string, lineId: string, body: unknown) =>
        request<unknown>(`/orders/${orderId}/lines/${lineId}`, { method: "PATCH", body: JSON.stringify(body) }),
      deleteLine: (orderId: string, lineId: string, query?: Record<string, string>) => {
        const q = query ? `?${new URLSearchParams(query).toString()}` : "";
        return request<unknown>(`/orders/${orderId}/lines/${lineId}${q}`, { method: "DELETE" });
      },
      pay: (orderId: string, body: unknown) =>
        request<unknown>(`/orders/${orderId}/payments`, { method: "POST", body: JSON.stringify(body) }),
      complete: (orderId: string, body: unknown) =>
        request<unknown>(`/orders/${orderId}/complete`, { method: "POST", body: JSON.stringify(body) }),
      cancel: (orderId: string, body: unknown) =>
        request<unknown>(`/orders/${orderId}/cancel`, { method: "POST", body: JSON.stringify(body) }),
    },

    payments: {
      checkout: (body: {
        orderId: string;
        method: "CASH" | "CARD";
        cashReceived?: string | null;
        orderVersion?: number;
        idempotencyKey?: string | null;
      }) => request<unknown>("/payments/checkout", { method: "POST", body: JSON.stringify(body) }),
      get: (paymentId: string) => request<unknown>(`/payments/${paymentId}`),
      receipt: (paymentId: string) => request<unknown>(`/payments/${paymentId}/print/receipt`),
      capture: (body: unknown) => request<unknown>("/payments/capture", { method: "POST", body: JSON.stringify(body) }),
      refund: (paymentId: string, body: unknown) =>
        request<unknown>(`/payments/${paymentId}/refund`, { method: "POST", body: JSON.stringify(body) }),
      cashPreview: (bill: string, tendered: string) =>
        request<unknown>(`/payments/cash/preview?${new URLSearchParams({ bill, tendered }).toString()}`),
    },

    analytics: {
      overview: (query?: { from?: string; to?: string }) => {
        const params = new URLSearchParams();
        if (query?.from) params.set("from", query.from);
        if (query?.to) params.set("to", query.to);
        const q = params.toString();
        return request<unknown>(`/analytics/overview${q ? `?${q}` : ""}`);
      },
      dashboard: () => request<unknown>("/analytics/dashboard"),
      revenue: (query: { from: string; to: string; granularity?: "hour" | "day" | "week" | "month" }) => {
        const params = new URLSearchParams({ from: query.from, to: query.to });
        if (query.granularity) params.set("granularity", query.granularity);
        return request<unknown>(`/analytics/revenue?${params.toString()}`);
      },
      topItems: (query: { from: string; to: string; limit?: number }) => {
        const params = new URLSearchParams({ from: query.from, to: query.to });
        if (query.limit != null) params.set("limit", String(query.limit));
        return request<unknown>(`/analytics/top-items?${params.toString()}`);
      },
      payments: (query: { from: string; to: string }) => {
        const params = new URLSearchParams({ from: query.from, to: query.to });
        return request<unknown>(`/analytics/payments?${params.toString()}`);
      },
      tables: (query: { from: string; to: string }) => {
        const params = new URLSearchParams({ from: query.from, to: query.to });
        return request<unknown>(`/analytics/tables?${params.toString()}`);
      },
      peakHours: (query: { from: string; to: string }) => {
        const params = new URLSearchParams({ from: query.from, to: query.to });
        return request<unknown>(`/analytics/peak-hours?${params.toString()}`);
      },
    },

    settings: {
      getSystem: () => request<unknown>("/settings/system"),
      patchSystem: (body: unknown) => request<unknown>("/settings/system", { method: "PATCH", body: JSON.stringify(body) }),
    },

    shifts: {
      current: () => request<unknown>("/shifts/current"),
      open: (body: { openingCashFloat: string }) =>
        request<unknown>("/shifts/open", { method: "POST", body: JSON.stringify(body) }),
      close: (shiftId: string, body: { closingCashCount: string; notes?: string | null }) =>
        request<unknown>(`/shifts/${shiftId}/close`, { method: "POST", body: JSON.stringify(body) }),
      refund: (body: { shiftId: string; amount: string; notes?: string | null }) =>
        request<unknown>("/shifts/refunds", { method: "POST", body: JSON.stringify(body) }),
    },

    expenses: {
      categories: () => request<unknown[]>("/expenses/categories"),
      list: (shiftId: string) => request<unknown[]>(`/expenses/?shiftId=${encodeURIComponent(shiftId)}`),
      create: (body: unknown) => request<unknown>("/expenses/", { method: "POST", body: JSON.stringify(body) }),
    },

    print: {
      listPrinters: () => request<unknown[]>("/print/printers"),
      render: (body: unknown) =>
        request<{ escposBase64: string; sha256: string; widthChars: number }>("/print/render", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      enqueue: (body: unknown) =>
        request<unknown>("/print/jobs", { method: "POST", body: JSON.stringify(body) }),
      claim: (body: { workerId: string; printerId?: string | null }) =>
        request<unknown>("/print/worker/claim", { method: "POST", body: JSON.stringify(body) }),
      complete: (jobId: string) =>
        request<unknown>(`/print/jobs/${encodeURIComponent(jobId)}/complete`, { method: "POST" }),
      fail: (jobId: string, body: { error: string; retry?: boolean }) =>
        request<unknown>(`/print/jobs/${encodeURIComponent(jobId)}/fail`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      discoverTemplates: () =>
        request<unknown>("/print/printers/discover", { method: "POST", body: "{}" }),
      createPrinter: (body: unknown) =>
        request<unknown>("/print/printers", { method: "POST", body: JSON.stringify(body) }),
      updatePrinter: (printerId: string, body: unknown) =>
        request<unknown>(`/print/printers/${encodeURIComponent(printerId)}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      deletePrinter: (printerId: string) =>
        request<unknown>(`/print/printers/${encodeURIComponent(printerId)}`, { method: "DELETE" }),
    },
  };
}

export type PosApiClient = ReturnType<typeof createPosApiClient>;
