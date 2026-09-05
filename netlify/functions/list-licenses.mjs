import { getDb } from "./_lib/firebase.mjs";
import { isAuthorizedAdmin } from "./_lib/auth.mjs";
import { jsonResponse } from "./_lib/http.mjs";

function serializeValue(value) {
  if (value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return value;
}

export default async (request) => {
  try {
    if (request.method !== "POST") {
      return jsonResponse({ success: false, reason: "METHOD_NOT_ALLOWED" }, 405);
    }

    if (!isAuthorizedAdmin(request)) {
      return jsonResponse({ success: false, reason: "UNAUTHORIZED" }, 401);
    }

    const db = getDb();
    const snapshot = await db.collection("licenses").get();

    const licenses = snapshot.docs.map((doc) => {
      const data = doc.data();
      const normalized = {};

      for (const [key, value] of Object.entries(data)) {
        normalized[key] = serializeValue(value);
      }

      return {
        licenseKey: doc.id,
        ...normalized,
      };
    });

    licenses.sort((a, b) =>
      String(a.customer || "").localeCompare(String(b.customer || ""))
    );

    return jsonResponse({
      success: true,
      licenses,
    });
  } catch (error) {
    console.error("LIST LICENSES ERROR:", error);
    return jsonResponse(
      { success: false, reason: "SERVER_ERROR", message: error.message },
      500
    );
  }
};
