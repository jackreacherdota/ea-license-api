import { getDb } from "./_lib/firebase.mjs";
import { isAuthorizedAdmin } from "./_lib/auth.mjs";
import { jsonResponse } from "./_lib/http.mjs";

export default async (request) => {
  try {
    if (request.method !== "POST") {
      return jsonResponse({ success: false, reason: "METHOD_NOT_ALLOWED" }, 405);
    }

    if (!isAuthorizedAdmin(request)) {
      return jsonResponse({ success: false, reason: "UNAUTHORIZED" }, 401);
    }

    const body = await request.json();
    const licenseKey = String(body.licenseKey || "").trim();

    if (!licenseKey) {
      return jsonResponse({ success: false, reason: "LICENSE_KEY_REQUIRED" }, 400);
    }

    const allowedFields = [
      "customer",
      "account",
      "server",
      "expiresAt",
      "status",
      "latestVersion",
      "product",
    ];

    const update = {};

    for (const field of allowedFields) {
      if (!(field in body)) continue;

      if (field === "account") {
        const account = Number(body.account);
        if (!Number.isSafeInteger(account) || account <= 0) {
          return jsonResponse({ success: false, reason: "INVALID_ACCOUNT" }, 400);
        }
        update.account = account;
        continue;
      }

      if (field === "expiresAt") {
        const expiryMs = Date.parse(String(body.expiresAt || ""));
        if (Number.isNaN(expiryMs)) {
          return jsonResponse({ success: false, reason: "INVALID_EXPIRY" }, 400);
        }
        update.expiresAt = new Date(expiryMs).toISOString();
        continue;
      }

      update[field] = String(body[field] ?? "").trim();
    }

    if (Object.keys(update).length === 0) {
      return jsonResponse({ success: false, reason: "NO_CHANGES" }, 400);
    }

    update.updatedAt = new Date().toISOString();

    const db = getDb();
    const ref = db.collection("licenses").doc(licenseKey);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      return jsonResponse({ success: false, reason: "LICENSE_NOT_FOUND" }, 404);
    }

    await ref.update(update);

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("UPDATE LICENSE ERROR:", error);
    return jsonResponse(
      { success: false, reason: "SERVER_ERROR", message: error.message },
      500
    );
  }
};
