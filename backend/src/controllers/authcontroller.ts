import bcrypt from "bcrypt";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../db";
import axios from "axios";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "USER"]).default("USER"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

let notificationId = 1;

async function createSignupNotification(userId: number) {
  await fetch("http://localhost:3001/notification/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: notificationId,
      user: userId,
      template: "signup-success",
      service: "EMAIL" as const,
      priority: 1,
    }),
  });

  // await axios.post("http://localhost:3001/notification/signup", JSON.stringify({
  //     id: notificationId,
  //     user: userId,
  //     template: "signup-success",
  //     service: "EMAIL" as const,
  //     priority: 1,
  //   }))
}

export async function signup(req: Request, res: Response) {
  try {
    notificationId++;
    const body = signupSchema.parse(req.body);
    const existingUser = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (existingUser) {
      res.status(409).json({ message: "Email already exists" });
      return;
    }

    const hashedPassword = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: { email: body.email, password: hashedPassword, role: body.role },
    });

    //TODO: Send notification to user
    createSignupNotification(user.id);

    res.status(201).json({
      message: "Signup successful",
      userId: user.id,
      notification: notificationId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        message: "Validation failed",
        errors: error.flatten().fieldErrors,
      });
      return;
    }

    res.status(500).json({ message: "Signup failed" });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });

    if (!user) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    const isPasswordValid = await bcrypt.compare(body.password, user.password);

    if (!isPasswordValid) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: "1d" },
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        message: "Validation failed",
        errors: error.flatten().fieldErrors,
      });
      return;
    }

    res.status(500).json({ message: "Login failed" });
  }
}
