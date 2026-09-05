import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

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
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID is missing");
  }

  if (!clientEmail) {
    throw new Error("FIREBASE_CLIENT_EMAIL is missing");
  }

  if (!privateKeyRaw) {
    throw new Error("FIREBASE_PRIVATE_KEY is missing");
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  let app;

  if (getApps().length > 0) {
    app = getApps()[0];
  } else {
    app = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey
      })
    });
  }

  return getFirestore(app);
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

    const db = getDb();

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

    await licenseRef.update({
      lastSeen: FieldValue.serverTimestamp(),
      lastAccount: account,
      lastServer: server,
      lastVersion: version
    });

    return jsonResponse({
      authorized: true,
      reason: "OK",
      product: licenseData.product,
      expiresAt: licenseData.expiresAt || null,
      latestVersion: licenseData.latestVersion || null,
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    console.error("VERIFY LICENSE ERROR:", error);

    return jsonResponse(
      {
        authorized: false,
        reason: "SERVER_ERROR",
        message: error.message
      },
      500
    );
  }
};