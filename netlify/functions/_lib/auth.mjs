import crypto from "crypto";

export function isAuthorizedAdmin(request) {
  const expected = process.env.EA_ADMIN_SECRET || "";
  const received = request.headers.get("x-admin-secret") || "";

  if (!expected || !received) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(received);

  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}
