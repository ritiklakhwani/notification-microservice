import { redis } from "./redis";
import { prisma } from "../../backend/db";
import { renderTemplate, type TemplateName } from "./template";

type Payload = {
  id: number;
  user: number | "ALL";
  template: TemplateName;
  service: "EMAIL";
  priority: 0 | 1 | 2;
  data?: Record<string, any>;
};

type EmailJob = {
  jobId: string;
  notificationId: number;
  userId: number;
  to: string;
  subject: string;
  html: string;
  priority: 0 | 1 | 2;
};

export const iterator = async (payload: Payload) => {
  const users =
    payload.user === "ALL"
      ? await prisma.user.findMany({
          select: {
            id: true,
            email: true,
            wallet: { select: { balance: true } },
          },
        })
      : await prisma.user.findMany({
          where: { id: payload.user },
          select: { id: true, email: true, wallet: { select: { balance: true } }, },
        });

  await Promise.allSettled(
    users.map(async (user) => {
      let username = user.email.split("@")[0];

      let subject = "";
      let variables: Record<string, any> = {};

      if (payload.template === "signup-success") {
        subject = "Welcome!";
        variables = { username };
      }
      if (payload.template === "wallet-onramp-success") {
        subject = "Wallet credited";
        variables = { username, amount: payload.data?.amount ?? 0 };
      }
      if (payload.template === "marketing-email") {
        subject = String(payload.data?.subject ?? "Update");
        variables = {
          username,
          title: payload.data?.subject ?? "",
          message: payload.data?.message ?? "",
        };
      }

      const html = await renderTemplate({
        template: payload.template,
        variables,
      });

      const job: EmailJob = {
        jobId: `${payload.id}:${user.id}`,
        notificationId: payload.id,
        userId: user.id,
        to: user.email,
        subject,
        html,
        priority: payload.priority,
      };

      const fresh = await redis.set(`status:${job.jobId}`, "1", {
        NX: true,
        EX: 86400,
      });
      if (fresh === null) return; // already queued

      await redis.lPush(`queue:p${payload.priority}`, JSON.stringify(job));
    }),
  );
};
