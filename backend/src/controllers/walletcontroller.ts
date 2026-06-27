import type { Response } from "express";
import { templateLiteral, z } from "zod";
import { prisma } from "../../db";
import type { AuthRequest } from "../middleware/auth";
import { enqueueNotification } from "../notify";

const walletOnrampSchema = z.object({
  amount: z.coerce.number().positive(),
});

//fetch
// let notificationId = 1;

// async function createWalletNotification(userId: number) {
//   await fetch("http://localhost:3001/notification/wallet", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify({
//       id: notificationId,
//       user: userId,
//       template: "wallet-onramp-success",
//       service: "EMAIL" as const,
//       priority: 0,
//     }),
//   });
// }

export async function walletOnramp(req: AuthRequest, res: Response) {
  try {
    const body = walletOnrampSchema.parse(req.body);

    if (!req.user) {
      res.status(401).json({ message: "Login required" });
      return;
    }

    const wallet = await prisma.wallet.upsert({
      where: { userId: req.user.id },
      update: {
        balance: {
          increment: body.amount,
        },
      },
      create: {
        userId: req.user.id,
        balance: body.amount,
      },
    });

    //TODO: Send notification to user
    const notifId = await enqueueNotification({
      user: req.user.id,
      template: "wallet-onramp-success",
      service: "EMAIL",
      priority: 0,
      data: { amount: body.amount }
    })
    res.status(201).json({
      message: "Wallet onramp successful",
      amount: body.amount,
      notification: notifId,
      balance: wallet.balance,
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

    res.status(500).json({ message: "Wallet onramp failed" });
  }
}
