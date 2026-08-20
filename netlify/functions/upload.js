function ctx(event) {
  function parse(raw) {
    if (!raw) return null;
    try {
      var txt = String(raw);
      try { txt = Buffer.from(String(raw), "base64").toString("utf8"); } catch (e) {}
      var obj = JSON.parse(txt);
      if (obj && obj.token && obj.siteID) return obj;
    } catch (e) {}
    return null;
  }
  return parse(event && event.blobs) || parse(process.env.NETLIFY_BLOBS_CONTEXT);
}

function urlFor(c, store, key) {
  var enc = encodeURIComponent(key);
  if (c.edgeURL) return String(c.edgeURL).replace(/\/$/, "") + "/" + c.siteID + "/" + store + "/" + enc;
  var api = String(c.apiURL || "https://api.netlify.com").replace(/\/$/, "");
  if (api.indexOf("/blobs") !== -1) return api + "/" + c.siteID + "/" + store + "/" + enc;
  return api + "/api/v1/blobs/" + c.siteID + "/" + store + "/" + enc;
}

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
    var c = ctx(event);
    if (!c) return { statusCode: 500, headers, body: "{\"error\":\"no blobs context\"}" };
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
    var r = await fetch(urlFor(c, "vxfiles", id), {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + c.token,
        "Netlify-Blobs-Metadata": Buffer.from(JSON.stringify({ name: name, type: type })).toString("base64")
      },
      body: buf
    });
    if (!r.ok) {
      var t = await r.text();
      return { statusCode: 500, headers, body: JSON.stringify({ error: "blob " + r.status + " " + String(t).slice(0, 200) }) };
    }
    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ url: "/.netlify/functions/file?id=" + encodeURIComponent(id), id: id })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e && e.message || e) }) };
  }
};
