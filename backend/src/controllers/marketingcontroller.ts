import type { Response } from "express";
import { z } from "zod";
import type { AuthRequest } from "../middleware/auth";
import { enqueueNotification } from "../notify";

const marketingEmailSchema = z.object({
  subject: z.string().min(1),
  message: z.string().min(1),
});

export async function marketingEmail(req: AuthRequest, res: Response) {
  try {
    const body = marketingEmailSchema.parse(req.body);

    //TODO: Send notification to all users
    const notifId = await enqueueNotification({
      user: "ALL",
      template: "marketing-email",
      service: "EMAIL",
      priority: 2,
      data: { subject: body.subject, message: body.message },
    });

    res.status(201).json({
      message: "Marketing email notification created",
      subject: body.subject,
      notification: notifId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        message: "Validation failed",
        errors: error.flatten().fieldErrors,
      });
      return;
    }

    res.status(500).json({ message: "Marketing email failed" });
  }
}
