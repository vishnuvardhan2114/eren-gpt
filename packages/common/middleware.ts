import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization; // Bearer token
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  console.log("Auth Header:", authHeader);
  console.log("Token:", token);
  console.log("Public Key:", process.env.JWT_PUBLIC_KEY);
  try {
    const decoded = jwt.verify(token, process.env.JWT_PUBLIC_KEY!, {
      algorithms: ["RS256"],
    });
    console.log(decoded);
    const userId = (decoded as any).sub;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    req.userId = userId;
    next();
  } catch (err: any) {
    console.error(err.message);
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
}
