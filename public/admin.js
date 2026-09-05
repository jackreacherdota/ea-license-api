const state = {
  licenses: [],
};

const $ = (id) => document.getElementById(id);

function getSecret() {
  return $("adminSecret").value.trim();
}

function setStatus(message, type = "") {
  const el = $("statusMessage");
  el.textContent = message;
  el.className = `status-message ${type}`.trim();
}

async function api(endpoint, body = {}) {
  const secret = getSecret();

  if (!secret) {
    throw new Error("Enter your EA_ADMIN_SECRET first.");
  }

  const response = await fetch(`/.netlify/functions/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": secret,
    },
    body: JSON.stringify(body),
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    throw new Error(`Server returned HTTP ${response.status}`);
  }

  if (!response.ok || !data.success) {
    const reason = data.reason || data.message || `HTTP ${response.status}`;
    throw new Error(reason);
  }

  return data;
}

function toLocalInputValue(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (n) => String(n).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(isoString) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function isExpired(license) {
  if (!license.expiresAt) return false;
  const value = Date.parse(license.expiresAt);
  return !Number.isNaN(value) && value < Date.now();
}

function effectiveStatus(license) {
  if (isExpired(license)) return "expired";
  return String(license.status || "unknown").toLowerCase();
}

function updateStats() {
  const total = state.licenses.length;
  const active = state.licenses.filter((x) => effectiveStatus(x) === "active").length;
  const revoked = state.licenses.filter((x) => effectiveStatus(x) === "revoked").length;
  const expired = state.licenses.filter((x) => effectiveStatus(x) === "expired").length;

  $("statTotal").textContent = total;
  $("statActive").textContent = active;
  $("statRevoked").textContent = revoked;
  $("statExpired").textContent = expired;
}

function renderLicenses() {
  const query = $("searchInput").value.trim().toLowerCase();

  const filtered = state.licenses.filter((license) => {
    const haystack = [
      license.licenseKey,
      license.customer,
      license.account,
      license.server,
      license.status,
      license.latestVersion,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });

  const tbody = $("licenseRows");
  tbody.innerHTML = "";

  for (const license of filtered) {
    const tr = document.createElement("tr");
    const status = effectiveStatus(license);

    tr.innerHTML = `
      <td>
        <div class="key-cell">
          <code>${escapeHtml(license.licenseKey)}</code>
          <button class="button small secondary" data-action="copy" data-key="${escapeAttr(license.licenseKey)}">Copy</button>
        </div>
      </td>
      <td>${escapeHtml(license.customer || "—")}</td>
      <td>${escapeHtml(String(license.account ?? "—"))}</td>
      <td>${escapeHtml(license.server || "—")}</td>
      <td>${escapeHtml(formatDate(license.expiresAt))}</td>
      <td><span class="badge ${escapeAttr(status)}">${escapeHtml(status)}</span></td>
      <td>${escapeHtml(license.latestVersion || "—")}</td>
      <td>
        <div class="actions">
          <button class="button small secondary" data-action="edit" data-key="${escapeAttr(license.licenseKey)}">Edit</button>
          <button class="button small secondary" data-action="extend" data-key="${escapeAttr(license.licenseKey)}">+30d</button>
          <button class="button small secondary" data-action="toggle" data-key="${escapeAttr(license.licenseKey)}">
            ${license.status === "active" ? "Revoke" : "Activate"}
          </button>
          <button class="button small danger" data-action="delete" data-key="${escapeAttr(license.licenseKey)}">Delete</button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

async function loadLicenses() {
  setStatus("Loading licenses…");

  try {
    const data = await api("list-licenses");
    state.licenses = data.licenses || [];
    updateStats();
    renderLicenses();
    setStatus(`Loaded ${state.licenses.length} license(s).`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

$("createForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const expiryValue = $("expiresAt").value;
    if (!expiryValue) throw new Error("Select an expiry date.");

    const data = await api("create-license", {
      customer: $("customer").value.trim(),
      account: Number($("account").value),
      server: $("server").value.trim(),
      expiresAt: new Date(expiryValue).toISOString(),
      product: $("product").value.trim() || "ApexIQ",
      latestVersion: $("latestVersion").value.trim() || "2.00",
    });

    const result = $("createResult");
    result.classList.remove("hidden");
    result.innerHTML = `
      <strong>License created</strong><br />
      <code>${escapeHtml(data.licenseKey)}</code>
      <button id="copyNewKeyBtn" class="button small secondary" type="button">Copy</button>
    `;

    $("copyNewKeyBtn").addEventListener("click", () =>
      navigator.clipboard.writeText(data.licenseKey)
    );

    await loadLicenses();
  } catch (error) {
    const result = $("createResult");
    result.classList.remove("hidden");
    result.textContent = `Error: ${error.message}`;
  }
});

$("licenseRows").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const key = button.dataset.key;
  const action = button.dataset.action;
  const license = state.licenses.find((x) => x.licenseKey === key);
  if (!license) return;

  try {
    if (action === "copy") {
      await navigator.clipboard.writeText(key);
      setStatus(`Copied ${key}`, "success");
      return;
    }

    if (action === "edit") {
      openEditDialog(license);
      return;
    }

    if (action === "extend") {
      const current = new Date(license.expiresAt || Date.now());
      if (Number.isNaN(current.getTime())) throw new Error("Invalid current expiry.");

      current.setUTCDate(current.getUTCDate() + 30);

      await api("update-license", {
        licenseKey: key,
        expiresAt: current.toISOString(),
      });

      await loadLicenses();
      return;
    }

    if (action === "toggle") {
      const newStatus = license.status === "active" ? "revoked" : "active";

      await api("update-license", {
        licenseKey: key,
        status: newStatus,
      });

      await loadLicenses();
      return;
    }

    if (action === "delete") {
      const confirmed = window.confirm(
        `Permanently delete ${key}?\n\nThis cannot be undone.`
      );

      if (!confirmed) return;

      await api("delete-license", {
        licenseKey: key,
      });

      await loadLicenses();
    }
  } catch (error) {
    setStatus(error.message, "error");
  }
});

function openEditDialog(license) {
  $("editLicenseKey").value = license.licenseKey;
  $("editLicenseTitle").textContent = license.licenseKey;
  $("editCustomer").value = license.customer || "";
  $("editAccount").value = license.account || "";
  $("editServer").value = license.server || "";
  $("editExpiresAt").value = toLocalInputValue(license.expiresAt);
  $("editVersion").value = license.latestVersion || "2.00";

  $("editDialog").showModal();
}

$("editForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const expiry = $("editExpiresAt").value;

    await api("update-license", {
      licenseKey: $("editLicenseKey").value,
      customer: $("editCustomer").value.trim(),
      account: Number($("editAccount").value),
      server: $("editServer").value.trim(),
      expiresAt: new Date(expiry).toISOString(),
      latestVersion: $("editVersion").value.trim(),
    });

    $("editDialog").close();
    await loadLicenses();
  } catch (error) {
    alert(error.message);
  }
});

$("refreshBtn").addEventListener("click", loadLicenses);
$("searchInput").addEventListener("input", renderLicenses);

$("toggleSecretBtn").addEventListener("click", () => {
  const input = $("adminSecret");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  $("toggleSecretBtn").textContent = show ? "Hide" : "Show";
});

$("closeDialogBtn").addEventListener("click", () => $("editDialog").close());
$("cancelEditBtn").addEventListener("click", () => $("editDialog").close());

(function setDefaultExpiry() {
  const now = new Date();
  now.setUTCFullYear(now.getUTCFullYear() + 1);
  $("expiresAt").value = toLocalInputValue(now);
})();
