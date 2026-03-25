const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL      = "https://vqzeylsdjlrrigeknqlu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxemV5bHNkamxycmlnZWtucWx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MzkzNTQsImV4cCI6MjA5MDAxNTM1NH0.No8HXsDYHyu4Vb-NoV-sq3bYOPdGxAeM2dErc-jSDAo";

module.exports = async function (req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // Verify the caller is a signed-in admin
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token" });

  const anonDb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error: authError } = await anonDb.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Invalid token" });
  if (user.user_metadata?.role !== "admin") return res.status(403).json({ error: "Not an admin" });

  const { requestId, userId, username } = req.body || {};
  if (!requestId || !userId) return res.status(400).json({ error: "Missing fields" });

  // Use service role key to grant admin role
  const serviceDb = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { error: updateError } = await serviceDb.auth.admin.updateUserById(userId, {
    user_metadata: { role: "admin", username }
  });
  if (updateError) return res.status(500).json({ error: updateError.message });

  await serviceDb.from("admin_requests").delete().eq("id", requestId);

  res.status(200).json({ ok: true });
};
