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

async function blobText(event, key, method, body) {
  var c = ctx(event);
  if (!c) return null;
  var r = await fetch(urlFor(c, "vxdata", key), {
    method: method,
    headers: { Authorization: "Bearer " + c.token },
    body: body
  });
  if (method === "GET") {
    if (!r.ok) return null;
    return await r.text();
  }
  return r.ok;
}

exports.handler = async function (event) {
  var ext = "https://json.extendsclass.com/bin/baabbfe";
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  try {
    if (event.httpMethod === "GET") {
      var fromBlob = await blobText(event, "jobs", "GET");
      if (fromBlob && fromBlob.indexOf("{") !== -1 && fromBlob.indexOf("\"ping\"") === -1) {
        return { statusCode: 200, headers, body: fromBlob };
      }
      var g = await fetch(ext + "?t=" + Date.now());
      var gt = await g.text();
      if (g.ok && gt && gt.indexOf("{") !== -1 && gt.indexOf("\"ping\"") === -1) {
        try { await blobText(event, "jobs", "PUT", gt); } catch (e) {}
        return { statusCode: 200, headers, body: gt };
      }
      if (fromBlob && fromBlob.indexOf("{") !== -1) return { statusCode: 200, headers, body: fromBlob };
      return { statusCode: 200, headers, body: "{\"jobs\":[]}" };
    }
    if (event.httpMethod === "PUT") {
      var body = event.body || "{\"jobs\":[]}";
      if (body.indexOf("\"ping\"") !== -1 && body.length < 80) {
        return { statusCode: 400, headers, body: "{\"error\":\"ignored test\"}" };
      }
      var saved = false;
      try {
        if (await blobText(event, "jobs", "PUT", body)) saved = true;
      } catch (e) {}
      try {
        var p = await fetch(ext, { method: "PUT", headers: { "Content-Type": "text/plain" }, body: body });
        if (p.ok) saved = true;
      } catch (e2) {}
      if (!saved) return { statusCode: 502, headers, body: "{\"error\":\"save\"}" };
      return { statusCode: 200, headers, body: "{\"ok\":true}" };
    }
    return { statusCode: 405, headers, body: "{\"error\":\"method\"}" };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e && e.message || e) }) };
  }
};
