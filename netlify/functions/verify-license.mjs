import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function getFirebaseApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase environment variables.");
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey
    })
  });
}

const app = getFirebaseApp();
const db = getFirestore(app);

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

export default async (request) => {
  try {
    if (request.method !== "POST") {
      return jsonResponse(
        {
          authorized: false,
          reason: "METHOD_NOT_ALLOWED"
        },
        405
      );
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        {
          authorized: false,
          reason: "INVALID_JSON"
        },
        400
      );
    }

    const license = String(body.license || "").trim();
    const product = String(body.product || "").trim();
    const server = String(body.server || "").trim();
    const version = String(body.version || "").trim();
    const account = Number(body.account);

    if (!license || !product || !server || !account) {
      return jsonResponse(
        {
          authorized: false,
          reason: "MISSING_FIELDS"
        },
        400
      );
    }

    const licenseRef = db.collection("licenses").doc(license);
    const licenseSnapshot = await licenseRef.get();

    if (!licenseSnapshot.exists) {
      return jsonResponse({
        authorized: false,
        reason: "LICENSE_NOT_FOUND"
      });
    }

    const licenseData = licenseSnapshot.data();

    if (licenseData.status !== "active") {
      return jsonResponse({
        authorized: false,
        reason: "LICENSE_DISABLED"
      });
    }

    if (licenseData.product !== product) {
      return jsonResponse({
        authorized: false,
        reason: "WRONG_PRODUCT"
      });
    }

    if (Number(licenseData.account) !== account) {
      return jsonResponse({
        authorized: false,
        reason: "ACCOUNT_MISMATCH"
      });
    }

    if (
      licenseData.server &&
      String(licenseData.server).trim() !== server
    ) {
      return jsonResponse({
        authorized: false,
        reason: "SERVER_MISMATCH"
      });
    }

    if (licenseData.expiresAt) {
      const expiryTime = new Date(licenseData.expiresAt).getTime();

      if (Number.isNaN(expiryTime)) {
        return jsonResponse({
          authorized: false,
          reason: "INVALID_EXPIRY"
        });
      }

      if (Date.now() > expiryTime) {
        return jsonResponse({
          authorized: false,
          reason: "LICENSE_EXPIRED"
        });
      }
    }

    try {
      await licenseRef.update({
        lastSeen: FieldValue.serverTimestamp(),
        lastAccount: account,
        lastServer: server,
        lastVersion: version
      });
    } catch (updateError) {
      console.error("Could not update lastSeen:", updateError);
    }

    return jsonResponse({
      authorized: true,
      reason: "OK",
      product: licenseData.product,
      expiresAt: licenseData.expiresAt || null,
      latestVersion: licenseData.latestVersion || null,
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    console.error("License verification error:", error);

    return jsonResponse(
      {
        authorized: false,
        reason: "SERVER_ERROR"
      },
      500
    );
  }
};