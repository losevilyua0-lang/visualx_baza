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
  var headers = { "Access-Control-Allow-Origin": "*" };
  try {
    var id = ((event.queryStringParameters || {}).id || "").trim();
    if (!id) return { statusCode: 400, headers, body: "missing" };
    var c = ctx(event);
    if (!c) return { statusCode: 500, headers, body: "no blobs context" };
    var r = await fetch(urlFor(c, "vxfiles", id), {
      method: "GET",
      headers: { Authorization: "Bearer " + c.token }
    });
    if (r.status === 404) return { statusCode: 404, headers, body: "not found" };
    if (!r.ok) return { statusCode: 500, headers, body: "blob " + r.status };
    var buf = Buffer.from(await r.arrayBuffer());
    var meta = {};
    var rawMeta = r.headers.get("netlify-blobs-metadata");
    if (rawMeta) {
      try { meta = JSON.parse(Buffer.from(rawMeta, "base64").toString("utf8")); } catch (e) {}
    }
    var type = meta.type || "application/octet-stream";
    var name = String(meta.name || "file").replace(/"/g, "");
    return {
      statusCode: 200,
      headers: {
        "Content-Type": type,
        "Content-Disposition": "inline; filename=\"" + name + "\"",
        "Cache-Control": "public, max-age=31536000",
        "Access-Control-Allow-Origin": "*"
      },
      body: buf.toString("base64"),
      isBase64Encoded: true
    };
  } catch (e) {
    return { statusCode: 500, headers, body: String(e && e.message || e) };
  }
};
