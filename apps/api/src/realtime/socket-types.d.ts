declare module "socket.io" {
  interface SocketData {
    realtime?: {
      userId: string;
      restaurantId: string;
      permissions: string[];
    };
  }
}

export {};
