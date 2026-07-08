import { createClient } from "redis";
import { z } from "zod";
import { iterator } from "./iterator";

/**
 * Entry point for the notification service. It listens on the Redis pub/sub
 * channel that the main backend publishes to, validates each message, and
 * hands it to the iterator. A dedicated subscriber connection is used because
 * a client in subscribe mode cannot run normal commands.
 */

const CHANNEL = "notification:incoming";

const payloadSchema = z.object({
  id: z.number(),
  user: z.union([z.number(), z.literal("ALL")]),
  template: z.enum([
    "signup-success",
    "wallet-onramp-success",
    "marketing-email",
  ]),
  service: z.literal("EMAIL"),
  priority: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  data: z.record(z.string(), z.any()).optional(),
});

const subscriber = createClient({ url: process.env.REDIS_URL });

async function start() {
  await subscriber.connect();

  await subscriber.subscribe(CHANNEL, async (message) => {
    try {
      const payload = payloadSchema.parse(JSON.parse(message));
      await iterator(payload);
    } catch (error) {
      // A bad message should be logged and dropped, not crash the listener.
      console.error("failed to process notification", error);
    }
  });

  console.log(`Listening on ${CHANNEL}`);
}

start();
