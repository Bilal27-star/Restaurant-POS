/** Public auth DTO shapes (extend as API evolves). */

export type LoginSuccessDto = {
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
