module.exports = async function (req, res) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  // Verify the request is from our Supabase webhook
  if (req.headers["x-webhook-secret"] !== (process.env.WEBHOOK_SECRET || "").trim()) {
    res.status(401).end();
    return;
  }

  const { record } = req.body || {};
  if (!record) {
    res.status(400).json({ error: "No record in payload" });
    return;
  }

  const response = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${(process.env.ONESIGNAL_REST_API_KEY || "").trim()}`
    },
    body: JSON.stringify({
      app_id: (process.env.ONESIGNAL_APP_ID || "").trim(),
      included_segments: ["All"],
      headings: { en: `DarAlert: ${record.type}` },
      contents: { en: `${record.name} — ${record.address}` },
      web_url: "https://daralert.vercel.app/admin.html"
    })
  });

  const data = await response.json();
  res.status(200).json({ ok: true, onesignal: data });
};
