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
  var headers = { "Access-Control-Allow-Origin": "*" };
  try {
    var id = ((event.queryStringParameters || {}).id || "").trim();
    if (!id) return { statusCode: 400, headers: headers, body: "missing" };
    var store = openStore(event);
    var entry = await store.getWithMetadata(id, { type: "arrayBuffer" });
    if (!entry || entry.data == null) return { statusCode: 404, headers: headers, body: "not found" };
    var meta = entry.metadata || {};
    var type = meta.type || "application/octet-stream";
    var name = String(meta.name || "file").replace(/"/g, "");
    var buf = Buffer.from(entry.data);
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
    return { statusCode: 500, headers: headers, body: String(e && e.message || e) };
  }
};
