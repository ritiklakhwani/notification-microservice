import { createClient } from "redis";
import { prisma } from "../../db";

export const redis = createClient({
  url: process.env.REDIS_URL,
});

await redis.connect();



export const iterator = async (payload: any) => {
  const user = await prisma.user.findUnique({
    where: {
      id: payload.user,
    },
  });

  const cacheData = {
    notificationId: payload.id,
    email: user.email,
    template: payload.template,
    userId: user.id,
  };

  await redis.set(`notification:${payload.id}`, "PROCESSING");

  if (payload.priority === 0) {
    await redis.lPush("queue:0", JSON.stringify(cacheData));
  }

  if (payload.priority === 1) {
    await redis.lPush("queue:1", JSON.stringify(cacheData));
  }

  if (payload.priority === 2) {
    await redis.lPush("queue:2", JSON.stringify(cacheData));
  }
}
