import type { Response } from "express";
import { z } from "zod";
import type { AuthRequest } from "../middleware/auth";

const marketingEmailSchema = z.object({
  subject: z.string().min(1),
  message: z.string().min(1),
});

let notificationId = 1;

async function createMarketingNotification() {
  await fetch("http://localhost:3001/notification/marketing", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: notificationId,
      user: "ALL" as const,
      template: "marketing-email",
      service: "EMAIL" as const,
      priority: 2,
    }),
  });
}

export async function marketingEmail(req: AuthRequest, res: Response) {
  try {
    notificationId++;
    const body = marketingEmailSchema.parse(req.body);

    //TODO: Send notification to all users
    createMarketingNotification();

    res.status(201).json({
      message: "Marketing email notification created",
      subject: body.subject,
      notification: notificationId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res
        .status(400)
        .json({
          message: "Validation failed",
          errors: error.flatten().fieldErrors,
        });
      return;
    }

    res.status(500).json({ message: "Marketing email failed" });
  }
}
