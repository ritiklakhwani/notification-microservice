import { createClient } from "redis";

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

type TemplateName =
  | "signup-success"
  | "wallet-onramp-success"
  | "marketing-email";

export interface NotificationPayload {
  user: number | "ALL";
  template: TemplateName;
  service: "EMAIL";
  priority: 0 | 1 | 2;
  data?: Record<string, unknown>;
}

export const enqueueNotification = async (
  p: NotificationPayload,
): Promise<number> => {
  const id = await redis.incr("counter:notification");
  const message = JSON.stringify({ id, ...p });
  try {
    await redis.publish("notification:incoming", message);
  } catch (error) {
    console.error("redis publish failed", error);
  }
  return id;
};
