module.exports = async function (req, res) {
  const appId = (process.env.ONESIGNAL_APP_ID || "").trim();
  const restKey = (process.env.ONESIGNAL_REST_API_KEY || "").trim();

  // Test OneSignal API directly
  const response = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${restKey}`
    },
    body: JSON.stringify({
      app_id: appId,
      included_segments: ["All"],
      headings: { en: "Debug Test" },
      contents: { en: "Debug notification" },
      web_url: "https://daralert.vercel.app/admin.html"
    })
  });

  const data = await response.json();
  res.status(200).json({
    app_id_used: appId,
    key_prefix: restKey.slice(0, 20) + "...",
    onesignal_status: response.status,
    onesignal_response: data
  });
};
