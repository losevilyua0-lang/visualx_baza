exports.handler = async function (event) {
  var headers = { "Access-Control-Allow-Origin": "*" };
  try {
    var id = ((event.queryStringParameters || {}).id || "").trim();
    if (!id) return { statusCode: 400, headers, body: "missing" };
    var blobs = require("@netlify/blobs");
    var store = blobs.getStore("vxfiles");
    var entry = await store.getWithMetadata(id, { type: "arrayBuffer" });
    if (!entry || !entry.data) return { statusCode: 404, headers, body: "not found" };
    var type = (entry.metadata && entry.metadata.type) || "application/octet-stream";
    var name = (entry.metadata && entry.metadata.name) || "file";
    return {
      statusCode: 200,
      headers: {
        "Content-Type": type,
        "Content-Disposition": "inline; filename=\"" + String(name).replace(/"/g, "") + "\"",
        "Cache-Control": "public, max-age=31536000",
        "Access-Control-Allow-Origin": "*"
      },
      body: Buffer.from(entry.data).toString("base64"),
      isBase64Encoded: true
    };
  } catch (e) {
    return { statusCode: 500, headers, body: String(e && e.message || e) };
  }
};
