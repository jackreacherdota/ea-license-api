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

    const db = getDb();
    const ref = db.collection("licenses").doc(licenseKey);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      return jsonResponse({ success: false, reason: "LICENSE_NOT_FOUND" }, 404);
    }

    await ref.delete();

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("DELETE LICENSE ERROR:", error);
    return jsonResponse(
      { success: false, reason: "SERVER_ERROR", message: error.message },
      500
    );
  }
};
