const SUPABASE_URL = "https://vqzeylsdjlrrigeknqlu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxemV5bHNkamxycmlnZWtucWx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MzkzNTQsImV4cCI6MjA5MDAxNTM1NH0.No8HXsDYHyu4Vb-NoV-sq3bYOPdGxAeM2dErc-jSDAo";
const ONESIGNAL_APP_ID = "6ab98437-83b7-4cdb-8dfe-704a76ca3da6";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM refs
const emailInput       = document.getElementById("emailInput");
const passwordInput    = document.getElementById("passwordInput");
const signInBtn        = document.getElementById("signInBtn");
const signUpBtn        = document.getElementById("signUpBtn");
const adminStatus      = document.getElementById("adminStatus");
const adminUid         = document.getElementById("adminUid");
const adminControls    = document.getElementById("adminControls");
const newAdminUid      = document.getElementById("newAdminUid");
const addAdminBtn      = document.getElementById("addAdminBtn");
const alertsList       = document.getElementById("alertsList");
const requestsList     = document.getElementById("requestsList");
const requestAdminBtn  = document.getElementById("requestAdminBtn");
const copyUidBtn       = document.getElementById("copyUidBtn");
const recheckAdminBtn  = document.getElementById("recheckAdminBtn");
const signOutBtn       = document.getElementById("signOutBtn");
const enablePushBtn    = document.getElementById("enablePushBtn");
const pushStatus       = document.getElementById("pushStatus");

let alertsChannel  = null;
let requestsChannel = null;
let isAdmin        = false;
let currentUser    = null;

// Service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
}

// OneSignal init (deferred so SDK has time to load)
window.OneSignalDeferred = window.OneSignalDeferred || [];
OneSignalDeferred.push(function (OneSignal) {
  OneSignal.init({ appId: ONESIGNAL_APP_ID, notifyButton: { enable: false } });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

signInBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) { adminStatus.textContent = "Enter email and password."; return; }
  adminStatus.textContent = "Signing in…";
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) adminStatus.textContent = friendlyError(error.message);
});

signUpBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) { adminStatus.textContent = "Enter email and password."; return; }
  if (password.length < 6) { adminStatus.textContent = "Password must be at least 6 characters."; return; }
  adminStatus.textContent = "Creating account…";
  const { error } = await db.auth.signUp({ email, password });
  if (error) adminStatus.textContent = friendlyError(error.message);
  else adminStatus.textContent = "Account created! Sign in now (or confirm email first if required).";
});

copyUidBtn.addEventListener("click", async () => {
  if (!currentUser) return;
  await navigator.clipboard.writeText(currentUser.id);
  adminStatus.textContent = "UID copied.";
});

recheckAdminBtn.addEventListener("click", async () => {
  if (!currentUser) { adminStatus.textContent = "Sign in first."; return; }
  adminStatus.textContent = "Rechecking…";
  await checkAdmin(currentUser.id);
});

signOutBtn.addEventListener("click", async () => {
  await db.auth.signOut();
  adminStatus.textContent = "Signed out.";
});

// ── Admin management ──────────────────────────────────────────────────────────

addAdminBtn.addEventListener("click", async () => {
  if (!isAdmin) { adminStatus.textContent = "Only admins can add admins."; return; }
  const uid = newAdminUid.value.trim();
  if (!uid) return;
  const { error } = await db.from("admins").insert({ id: uid });
  if (error) { adminStatus.textContent = "Failed to add admin."; console.error(error); return; }
  adminStatus.textContent = "Admin added.";
  newAdminUid.value = "";
});

requestAdminBtn.addEventListener("click", async () => {
  if (!currentUser) { adminStatus.textContent = "Sign in first."; return; }
  const { error } = await db.from("admin_requests").insert({
    user_id: currentUser.id,
    email: currentUser.email
  });
  if (error) { adminStatus.textContent = "Request failed."; console.error(error); return; }
  adminStatus.textContent = "Request sent. An admin will review it.";
});

enablePushBtn.addEventListener("click", () => {
  if (!currentUser) { pushStatus.textContent = "Sign in first."; return; }
  if (!isAdmin) { pushStatus.textContent = "Admin access required."; return; }
  OneSignalDeferred.push(async function (OneSignal) {
    const granted = await OneSignal.Notifications.requestPermission();
    if (!granted) { pushStatus.textContent = "Permission denied."; return; }
    await OneSignal.User.addTag("role", "admin");
    pushStatus.textContent = "Push notifications enabled for this device.";
  });
});

// ── Auth state ────────────────────────────────────────────────────────────────

db.auth.onAuthStateChange(async (_event, session) => {
  if (!session) {
    currentUser = null;
    isAdmin = false;
    adminUid.textContent = "—";
    adminControls.hidden = true;
    stopListeners();
    alertsList.innerHTML   = "<p class=\"note\">Sign in as admin to view alerts.</p>";
    requestsList.innerHTML = "<p class=\"note\">Sign in to request or review admins.</p>";
    return;
  }
  currentUser = session.user;
  adminUid.textContent = session.user.id;
  await checkAdmin(session.user.id);
});

async function checkAdmin(uid) {
  const { data } = await db.from("admins").select("id").eq("id", uid).maybeSingle();
  isAdmin = !!data;
  if (isAdmin) {
    adminStatus.textContent = "Admin verified.";
    adminControls.hidden = false;
    startListeners();
  } else {
    adminStatus.textContent = "Signed in, but not an admin yet. Request access below.";
    adminControls.hidden = true;
    stopListeners();
    alertsList.innerHTML   = "<p class=\"note\">Sign in as admin to view alerts.</p>";
    requestsList.innerHTML = "<p class=\"note\">Sign in to request or review admins.</p>";
  }
}

// ── Realtime listeners ────────────────────────────────────────────────────────

async function startListeners() {
  // Initial load
  const { data: alerts } = await db
    .from("alerts").select("*").order("created_at", { ascending: false }).limit(20);
  alertsList.innerHTML = "";
  if (alerts && alerts.length) alerts.forEach((a) => renderAlert(a));
  else alertsList.innerHTML = "<p class=\"note\">No alerts yet.</p>";

  const { data: requests } = await db
    .from("admin_requests").select("*").order("created_at", { ascending: false });
  requestsList.innerHTML = "";
  if (requests && requests.length) requests.forEach((r) => renderRequest(r));
  else requestsList.innerHTML = "<p class=\"note\">No pending requests.</p>";

  // Subscribe to new alerts
  if (!alertsChannel) {
    alertsChannel = db.channel("alerts-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" },
        (p) => renderAlert(p.new, true))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "alerts" },
        (p) => {
          document.getElementById(`alert-${p.old.id}`)?.remove();
          if (!alertsList.querySelector(".alert-item")) {
            alertsList.innerHTML = "<p class=\"note\">No alerts yet.</p>";
          }
        })
      .subscribe();
  }

  // Subscribe to new admin requests
  if (!requestsChannel) {
    requestsChannel = db.channel("requests-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_requests" },
        (p) => renderRequest(p.new, true))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "admin_requests" },
        (p) => document.getElementById(`req-${p.old.id}`)?.remove())
      .subscribe();
  }
}

function stopListeners() {
  if (alertsChannel)   { db.removeChannel(alertsChannel);   alertsChannel   = null; }
  if (requestsChannel) { db.removeChannel(requestsChannel); requestsChannel = null; }
}

// ── Render helpers ────────────────────────────────────────────────────────────

function renderAlert(data, prepend = false) {
  alertsList.querySelector("p.note")?.remove();

  const item = document.createElement("div");
  item.className = "alert-item";
  item.id = `alert-${data.id}`;

  const h4 = document.createElement("h4");
  h4.textContent = `${data.type} — ${data.name}`;

  const addrP = document.createElement("p");
  addrP.className = "note";
  addrP.textContent = data.address;

  const timeP = document.createElement("p");
  timeP.className = "note";
  timeP.textContent = new Date(data.created_at).toLocaleString();

  const dismissBtn = document.createElement("button");
  dismissBtn.className = "ghost";
  dismissBtn.textContent = "Dismiss";
  dismissBtn.addEventListener("click", async () => {
    dismissBtn.disabled = true;
    await db.from("alerts").delete().eq("id", data.id);
  });

  item.append(h4, addrP, timeP, dismissBtn);
  prepend ? alertsList.prepend(item) : alertsList.append(item);
}

function renderRequest(data, prepend = false) {
  requestsList.querySelector("p.note")?.remove();

  const item = document.createElement("div");
  item.className = "alert-item";
  item.id = `req-${data.id}`;

  const h4 = document.createElement("h4");
  h4.textContent = data.email || data.user_id;

  const uidP = document.createElement("p");
  uidP.className = "note";
  uidP.textContent = `UID: ${data.user_id}`;

  const actions = document.createElement("div");
  actions.className = "hero-actions";

  const approveBtn = document.createElement("button");
  approveBtn.className = "ghost";
  approveBtn.textContent = "Approve";
  approveBtn.addEventListener("click", async () => {
    const { error } = await db.from("admins").insert({ id: data.user_id, email: data.email });
    if (error) { adminStatus.textContent = "Approve failed."; console.error(error); return; }
    await db.from("admin_requests").delete().eq("id", data.id);
    adminStatus.textContent = "Admin approved.";
  });

  const denyBtn = document.createElement("button");
  denyBtn.className = "ghost";
  denyBtn.textContent = "Deny";
  denyBtn.addEventListener("click", async () => {
    await db.from("admin_requests").delete().eq("id", data.id);
  });

  actions.append(approveBtn, denyBtn);
  item.append(h4, uidP, actions);
  prepend ? requestsList.prepend(item) : requestsList.append(item);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function friendlyError(msg) {
  if (msg.includes("Invalid login credentials")) return "Invalid email or password.";
  if (msg.includes("already registered"))        return "Account exists. Sign in instead.";
  if (msg.includes("Email not confirmed"))        return "Confirm your email first, then sign in.";
  return msg;
}
