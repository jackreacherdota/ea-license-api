import crypto from "crypto";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function getDb() {
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (!base64) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 is missing");
  }

  const serviceAccountJson =
    Buffer.from(base64, "base64").toString("utf8");

  const serviceAccount =
    JSON.parse(serviceAccountJson);

  let app;

  if (getApps().length > 0) {
    app = getApps()[0];
  } else {
    app = initializeApp({
      credential: cert(serviceAccount)
    });
  }

  return getFirestore(app);
}

function generateLicenseKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  function block(length) {
    let result = "";

    for (let i = 0; i < length; i++) {
      const index =
        crypto.randomInt(0, chars.length);

      result += chars[index];
    }

    return result;
  }

  return `APX-${block(4)}-${block(4)}-${block(4)}`;
}

export default async (request) => {
  try {
    if (request.method !== "POST") {
      return jsonResponse(
        {
          success: false,
          reason: "METHOD_NOT_ALLOWED"
        },
        405
      );
    }

    // Simple admin secret for now.
    const adminSecret =
      request.headers.get("x-admin-secret");

    if (
      !process.env.EA_ADMIN_SECRET ||
      adminSecret !== process.env.EA_ADMIN_SECRET
    ) {
      return jsonResponse(
        {
          success: false,
          reason: "UNAUTHORIZED"
        },
        401
      );
    }

    const body = await request.json();

    const customer =
      String(body.customer || "").trim();

    const server =
      String(body.server || "").trim();

    const account =
      Number(body.account);

    const expiresAt =
      String(body.expiresAt || "").trim();

    const product =
      String(body.product || "ApexIQ").trim();

    if (
      !customer ||
      !server ||
      !account ||
      !expiresAt
    ) {
      return jsonResponse(
        {
          success: false,
          reason: "MISSING_FIELDS"
        },
        400
      );
    }

    const db = getDb();

    let licenseKey = "";
    let exists = true;

    while (exists) {
      licenseKey = generateLicenseKey();

      const existing =
        await db
          .collection("licenses")
          .doc(licenseKey)
          .get();

      exists = existing.exists;
    }

    await db
      .collection("licenses")
      .doc(licenseKey)
      .set({
        product,
        status: "active",
        account,
        server,
        expiresAt,
        customer,
        latestVersion: "2.00",
        createdAt: new Date().toISOString()
      });

    return jsonResponse({
      success: true,
      licenseKey
    });

  } catch (error) {
    console.error(
      "CREATE LICENSE ERROR:",
      error
    );

    return jsonResponse(
      {
        success: false,
        reason: "SERVER_ERROR"
      },
      500
    );
  }
};