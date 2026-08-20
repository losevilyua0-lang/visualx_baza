exports.handler = async function (event) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "{\"error\":\"method\"}" };
  try {
    var blobs = require("@netlify/blobs");
    var store = blobs.getStore("vxfiles");
    var qs = event.queryStringParameters || {};
    var name = String(qs.name || "file").slice(0, 180);
    var type = String(qs.type || "application/octet-stream").slice(0, 80);
    var buf = null;
    var rawBody = event.body || "";
    var looksJson = !event.isBase64Encoded && typeof rawBody === "string" && rawBody.trim().charAt(0) === "{";
    if (looksJson) {
      var payload = JSON.parse(rawBody);
      name = String(payload.name || name).slice(0, 180);
      type = String(payload.type || type).slice(0, 80);
      var raw = String(payload.data || "");
      var comma = raw.indexOf(",");
      buf = Buffer.from(comma >= 0 ? raw.slice(comma + 1) : raw, "base64");
    } else {
      buf = Buffer.from(rawBody, event.isBase64Encoded ? "base64" : "utf8");
    }
    if (!buf || !buf.length) return { statusCode: 400, headers, body: "{\"error\":\"empty\"}" };
    if (buf.length > 8000000) return { statusCode: 413, headers, body: "{\"error\":\"too big\"}" };
    var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    await store.set(id, buf, { metadata: { name: name, type: type } });
    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        url: "/.netlify/functions/file?id=" + encodeURIComponent(id),
        id: id
      })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e && e.message || e) }) };
  }
};
