export type LoginRequest = {
  restaurantSlug: string;
  username: string;
  password?: string;
  pin?: string;
};

export type LoginResponse = {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
  tokenType: "Bearer";
  user: {
    id: string;
    restaurantId: string;
    username: string;
    fullName: string;
    status: string;
    roles: string[];
    permissions: string[];
  };
};

export type ApiSuccessEnvelope<T> = { success: true; data: T; message?: string };
export type ApiErrorEnvelope = { success: false; error: string; details?: unknown };
