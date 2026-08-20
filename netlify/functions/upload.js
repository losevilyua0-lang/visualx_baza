var cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8"
};

function json(code, obj) {
  return { statusCode: code, headers: cors, body: JSON.stringify(obj) };
}

function parseCtx(raw) {
  if (!raw) return null;
  try {
    var txt = String(raw);
    try { txt = Buffer.from(String(raw), "base64").toString("utf8"); } catch (e) {}
    var obj = JSON.parse(txt);
    if (obj && (obj.token || obj.deployID) && (obj.siteID || obj.url || obj.edgeURL)) return obj;
  } catch (e) {}
  return null;
}

function openStore(event) {
  var blobs;
  try { blobs = require("@netlify/blobs"); } catch (e) {
    throw new Error("package");
  }
  try { if (blobs.connectLambda) blobs.connectLambda(event); } catch (e) {}
  try { return blobs.getStore("vxfiles"); } catch (e) {}
  var c = parseCtx(event && event.blobs) || parseCtx(process.env.NETLIFY_BLOBS_CONTEXT);
  if (c && blobs.getStore) {
    try {
      return blobs.getStore({
        name: "vxfiles",
        siteID: c.siteID,
        token: c.token,
        edgeURL: c.edgeURL || c.url
      });
    } catch (e2) {}
  }
  throw new Error("no blobs context");
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  if (event.httpMethod === "GET") {
    try {
      openStore(event);
      return json(200, { ok: true });
    } catch (e) {
      return json(500, { ok: false, error: String(e && e.message || e) });
    }
  }
  if (event.httpMethod !== "POST") return json(405, { error: "method" });
  try {
    var store = openStore(event);
    var qs = event.queryStringParameters || {};
    var name = String(qs.name || "file").slice(0, 180);
    var type = String(qs.type || "application/octet-stream").slice(0, 80);
    var buf;
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
    if (!buf || !buf.length) return json(400, { error: "empty" });
    if (buf.length > 8000000) return json(413, { error: "too big" });
    var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    await store.set(id, buf, { metadata: { name: name, type: type } });
    return json(200, { url: "/.netlify/functions/file?id=" + encodeURIComponent(id), id: id });
  } catch (e) {
    return json(500, { error: String(e && e.message || e) });
  }
};
