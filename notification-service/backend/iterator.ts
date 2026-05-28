import { createClient } from "redis";
import { prisma } from "../../backend/db";
import type { UnderlyingSink } from "bun";

export const redis = createClient({
  url: process.env.REDIS_URL,
});

await redis.connect();

type USER = {
    role: string;
    id: number;
    email: string;
    password: string;
    createdAt: Date;
} 


export const iterator = async (payload: any) => {
  const user: USER | null = await prisma.user.findUnique({
    where: {
      id: payload.id,
    },
  });

  if(user == null) {
    return 0;
  }

  const template = 

  const cachedData = {
    notificationId: payload.id,
    email: user.email,
    template: template,
    userId: user.id,
  };

  await redis.set(`${payload.id}`, "processing");

  if (payload.priority === 0) {
    await redis.lPush("queue:0", JSON.stringify(cachedData));
  }

  if (payload.priority === 1) {
    await redis.lPush("queue:1", JSON.stringify(cachedData));
  }

  if (payload.priority === 2) {
    await redis.lPush("queue:2", JSON.stringify(cachedData));
  }
}
