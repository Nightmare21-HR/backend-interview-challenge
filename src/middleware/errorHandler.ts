import { Request, Response } from 'express';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  // _next: NextFunction // renamed from 'next' to '_next' to avoid warning
) {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
