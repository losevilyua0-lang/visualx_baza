exports.handler = async function (event) {
  var ext = "https://json.extendsclass.com/bin/baabbfe";
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  function storeSafe() {
    try {
      var blobs = require("@netlify/blobs");
      return blobs.getStore("vxdata");
    } catch (e) {
      return null;
    }
  }
  try {
    var store = storeSafe();
    if (event.httpMethod === "GET") {
      if (store) {
        try {
          var raw = await store.get("jobs", { type: "text" });
          if (raw && String(raw).indexOf("{") !== -1) {
            return { statusCode: 200, headers, body: String(raw) };
          }
        } catch (e) {}
      }
      var g = await fetch(ext + "?t=" + Date.now());
      var gt = await g.text();
      if (g.ok && gt && gt.indexOf("{") !== -1) {
        if (store) {
          try { await store.set("jobs", gt); } catch (e2) {}
        }
        return { statusCode: 200, headers, body: gt };
      }
      return { statusCode: 200, headers, body: "{\"jobs\":[]}" };
    }
    if (event.httpMethod === "PUT") {
      var body = event.body || "{\"jobs\":[]}";
      var saved = false;
      if (store) {
        await store.set("jobs", body);
        saved = true;
      }
      try {
        var p = await fetch(ext, {
          method: "PUT",
          headers: { "Content-Type": "text/plain" },
          body: body
        });
        if (p.ok) saved = true;
      } catch (e3) {}
      if (!saved) return { statusCode: 502, headers, body: "{\"error\":\"save\"}" };
      return { statusCode: 200, headers, body: "{\"ok\":true}" };
    }
    return { statusCode: 405, headers, body: "{\"error\":\"method\"}" };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e && e.message || e) }) };
  }
};
