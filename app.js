const SUPABASE_URL = "https://vqzeylsdjlrrigeknqlu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxemV5bHNkamxycmlnZWtucWx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MzkzNTQsImV4cCI6MjA5MDAxNTM1NH0.No8HXsDYHyu4Vb-NoV-sq3bYOPdGxAeM2dErc-jSDAo";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const statusEl = document.getElementById("status");
const form = document.getElementById("alertForm");
const installBtn = document.getElementById("installBtn");

let deferredPrompt = null;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("OneSignalSDKWorker.js"));
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});

installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = new FormData(form);

  statusEl.textContent = "Sending alert…";

  const { error } = await db.from("alerts").insert({
    type: data.get("emergencyType"),
    name: data.get("fullName"),
    address: data.get("address")
  });

  if (error) {
    statusEl.textContent = "Failed to send. Check your connection.";
    console.error(error);
    return;
  }

  statusEl.textContent = "Alert sent to admins.";
  form.reset();
});
