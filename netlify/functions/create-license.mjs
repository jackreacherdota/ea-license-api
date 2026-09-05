import crypto from "crypto";
import { getDb } from "./_lib/firebase.mjs";
import { isAuthorizedAdmin } from "./_lib/auth.mjs";
import { jsonResponse } from "./_lib/http.mjs";

function randomBlock(length = 4) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "";

  for (let i = 0; i < length; i++) {
    value += chars[crypto.randomInt(0, chars.length)];
  }

  return value;
}

function generateLicenseKey() {
  return `APX-${randomBlock()}-${randomBlock()}-${randomBlock()}`;
}

export default async (request) => {
  try {
    if (request.method !== "POST") {
      return jsonResponse({ success: false, reason: "METHOD_NOT_ALLOWED" }, 405);
    }

    if (!isAuthorizedAdmin(request)) {
      return jsonResponse({ success: false, reason: "UNAUTHORIZED" }, 401);
    }

    const body = await request.json();

    const customer = String(body.customer || "").trim();
    const server = String(body.server || "").trim();
    const product = String(body.product || "ApexIQ").trim();
    const latestVersion = String(body.latestVersion || "2.00").trim();
    const status = String(body.status || "active").trim();
    const expiresAt = String(body.expiresAt || "").trim();
    const account = Number(body.account);

    if (!customer || !server || !expiresAt || !Number.isSafeInteger(account) || account <= 0) {
      return jsonResponse({ success: false, reason: "INVALID_FIELDS" }, 400);
    }

    const expiryMs = Date.parse(expiresAt);
    if (Number.isNaN(expiryMs)) {
      return jsonResponse({ success: false, reason: "INVALID_EXPIRY" }, 400);
    }

    const db = getDb();

    let licenseKey = "";
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateLicenseKey();
      const snapshot = await db.collection("licenses").doc(candidate).get();

      if (!snapshot.exists) {
        licenseKey = candidate;
        break;
      }
    }

    if (!licenseKey) {
      throw new Error("Could not generate a unique license key");
    }

    const now = new Date().toISOString();

    await db.collection("licenses").doc(licenseKey).set({
      product,
      status,
      account,
      server,
      expiresAt: new Date(expiryMs).toISOString(),
      customer,
      latestVersion,
      createdAt: now,
      updatedAt: now,
    });

    return jsonResponse({
      success: true,
      licenseKey,
    });
  } catch (error) {
    console.error("CREATE LICENSE ERROR:", error);
    return jsonResponse(
      { success: false, reason: "SERVER_ERROR", message: error.message },
      500
    );
  }
};
