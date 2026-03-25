const SUPABASE_URL      = "https://vqzeylsdjlrrigeknqlu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxemV5bHNkamxycmlnZWtucWx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MzkzNTQsImV4cCI6MjA5MDAxNTM1NH0.No8HXsDYHyu4Vb-NoV-sq3bYOPdGxAeM2dErc-jSDAo";
const ONESIGNAL_APP_ID  = "6ab98437-83b7-4cdb-8dfe-704a76ca3da6";

function toEmail(username) {
  return username.toLowerCase().trim() + "@daralert.app";
}
function toUsername(user) {
  return user.user_metadata?.username || user.email.replace("@daralert.app", "");
}

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM
const authPanel       = document.getElementById("authPanel");
const pendingPanel    = document.getElementById("pendingPanel");
const adminPanel      = document.getElementById("adminPanel");
const pageTitle       = document.getElementById("pageTitle");
const pageSubtitle    = document.getElementById("pageSubtitle");
const usernameInput   = document.getElementById("usernameInput");
const passwordInput   = document.getElementById("passwordInput");
const signInBtn       = document.getElementById("signInBtn");
const signUpBtn       = document.getElementById("signUpBtn");
const authStatus      = document.getElementById("authStatus");
const pendingStatus   = document.getElementById("pendingStatus");
const requestAdminBtn = document.getElementById("requestAdminBtn");
const signOutBtn1     = document.getElementById("signOutBtn1");
const adminWelcome    = document.getElementById("adminWelcome");
const enablePushBtn   = document.getElementById("enablePushBtn");
const signOutBtn2     = document.getElementById("signOutBtn2");
const pushStatus      = document.getElementById("pushStatus");
const requestsList    = document.getElementById("requestsList");
const alertsList      = document.getElementById("alertsList");

let alertsChannel   = null;
let requestsChannel = null;
let currentUser     = null;

// Service worker + OneSignal
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
}
window.OneSignalDeferred = window.OneSignalDeferred || [];
OneSignalDeferred.push(function(OneSignal) {
  OneSignal.init({
    appId: ONESIGNAL_APP_ID,
    notifyButton: { enable: false },
    serviceWorkerPath: "sw.js",
    serviceWorkerParam: { scope: "/" }
  });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

signInBtn.addEventListener("click", async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) { authStatus.textContent = "Enter username and password."; return; }
  authStatus.textContent = "Signing in…";
  const { error } = await db.auth.signInWithPassword({ email: toEmail(username), password });
  if (error) authStatus.textContent = friendlyError(error.message);
});

signUpBtn.addEventListener("click", async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) { authStatus.textContent = "Enter username and password."; return; }
  if (password.length < 6) { authStatus.textContent = "Password must be at least 6 characters."; return; }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) { authStatus.textContent = "Letters, numbers and underscores only."; return; }
  authStatus.textContent = "Creating account…";
  const { error } = await db.auth.signUp({
    email: toEmail(username),
    password,
    options: { data: { username } }
  });
  if (error) authStatus.textContent = friendlyError(error.message);
  else authStatus.textContent = "Account created! Sign in now.";
});

[signOutBtn1, signOutBtn2].forEach(btn => btn.addEventListener("click", async () => {
  stopListeners();
  await db.auth.signOut();
}));

requestAdminBtn.addEventListener("click", async () => {
  if (!currentUser) return;
  const username = toUsername(currentUser);
  const { error } = await db.from("admin_requests").insert({
    user_id: currentUser.id,
    username
  });
  if (error) { pendingStatus.textContent = "Request failed. You may have already requested."; return; }
  pendingStatus.textContent = "Request sent! An admin will approve you soon.";
  requestAdminBtn.disabled = true;
});


enablePushBtn.addEventListener("click", () => {
  OneSignalDeferred.push(async function(OneSignal) {
    const granted = await OneSignal.Notifications.requestPermission();
    if (!granted) { pushStatus.textContent = "Permission denied."; return; }
    await OneSignal.User.addTag("role", "admin");
    pushStatus.textContent = "Push enabled for this device.";
  });
});

// ── Auth state ────────────────────────────────────────────────────────────────

db.auth.onAuthStateChange(async (_event, session) => {
  if (!session) {
    currentUser = null;
    stopListeners();
    showAuth();
    return;
  }
  currentUser = session.user;
  const isAdmin = session.user.user_metadata?.role === "admin";
  if (isAdmin) {
    showAdminPanel(session.user);
  } else {
    showPendingPanel(session.user);
  }
});

// ── UI state ──────────────────────────────────────────────────────────────────

function showAuth() {
  authPanel.hidden   = false;
  pendingPanel.hidden = true;
  adminPanel.hidden  = true;
  pageTitle.textContent    = "Sign In";
  pageSubtitle.textContent = "Enter your username and password.";
  authStatus.textContent   = "";
}

function showPendingPanel(user) {
  authPanel.hidden    = true;
  pendingPanel.hidden = false;
  adminPanel.hidden   = true;
  authStatus.textContent = "";
  const username = toUsername(user);
  pageTitle.textContent     = `Hi, ${username}`;
  pageSubtitle.textContent  = "You are signed in but not yet an admin.";
  pendingStatus.textContent = "Request access below, or wait if you already did.";
}

function showAdminPanel(user) {
  authPanel.hidden    = true;
  pendingPanel.hidden = true;
  adminPanel.hidden   = false;
  authStatus.textContent = "";
  const username = toUsername(user);
  pageTitle.textContent    = "Admin Dashboard";
  pageSubtitle.textContent = `Welcome, ${username}.`;
  adminWelcome.textContent = `Signed in as ${username}.`;
  startListeners();
}

// ── Realtime ──────────────────────────────────────────────────────────────────

async function startListeners() {
  // Load alerts
  const { data: alerts } = await db
    .from("alerts").select("*").order("created_at", { ascending: false }).limit(20);
  alertsList.innerHTML = "";
  if (alerts?.length) alerts.forEach(a => renderAlert(a));
  else alertsList.innerHTML = "<p class=\"note\">No alerts yet.</p>";

  // Load requests
  const { data: reqs } = await db
    .from("admin_requests").select("*").order("created_at", { ascending: false });
  requestsList.innerHTML = "";
  if (reqs?.length) reqs.forEach(r => renderRequest(r));
  else requestsList.innerHTML = "<p class=\"note\">No pending requests.</p>";

  // Subscribe to new alerts
  if (!alertsChannel) {
    alertsChannel = db.channel("alerts-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" },
        p => renderAlert(p.new, true))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "alerts" },
        p => {
          document.getElementById(`alert-${p.old.id}`)?.remove();
          if (!alertsList.querySelector(".alert-item"))
            alertsList.innerHTML = "<p class=\"note\">No alerts yet.</p>";
        })
      .subscribe();
  }

  // Subscribe to new requests
  if (!requestsChannel) {
    requestsChannel = db.channel("requests-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_requests" },
        p => renderRequest(p.new, true))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "admin_requests" },
        p => document.getElementById(`req-${p.old.id}`)?.remove())
      .subscribe();
  }
}

function stopListeners() {
  if (alertsChannel)   { db.removeChannel(alertsChannel);   alertsChannel   = null; }
  if (requestsChannel) { db.removeChannel(requestsChannel); requestsChannel = null; }
}

// ── Render ────────────────────────────────────────────────────────────────────

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

  const btn = document.createElement("button");
  btn.className = "ghost";
  btn.textContent = "Dismiss";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    await db.from("alerts").delete().eq("id", data.id);
  });

  item.append(h4, addrP, timeP, btn);
  prepend ? alertsList.prepend(item) : alertsList.append(item);
}

function renderRequest(data, prepend = false) {
  requestsList.querySelector("p.note")?.remove();
  const item = document.createElement("div");
  item.className = "alert-item";
  item.id = `req-${data.id}`;

  const h4 = document.createElement("h4");
  h4.textContent = data.username;

  const actions = document.createElement("div");
  actions.className = "hero-actions";

  const approveBtn = document.createElement("button");
  approveBtn.className = "ghost";
  approveBtn.textContent = "Approve";
  approveBtn.addEventListener("click", async () => {
    approveBtn.disabled = true;
    approveBtn.textContent = "Approving…";
    const { data: { session } } = await db.auth.getSession();
    const res = await fetch("/api/approve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ requestId: data.id, userId: data.user_id, username: data.username })
    });
    if (!res.ok) {
      approveBtn.disabled = false;
      approveBtn.textContent = "Approve";
      alert("Approval failed. Try again.");
    }
  });

  const denyBtn = document.createElement("button");
  denyBtn.className = "ghost";
  denyBtn.textContent = "Deny";
  denyBtn.addEventListener("click", async () => {
    await db.from("admin_requests").delete().eq("id", data.id);
  });

  actions.append(approveBtn, denyBtn);
  item.append(h4, actions);
  prepend ? requestsList.prepend(item) : requestsList.append(item);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function friendlyError(msg) {
  if (msg.includes("Invalid login credentials")) return "Wrong username or password.";
  if (msg.includes("already registered"))        return "Username taken. Try another.";
  return msg;
}
