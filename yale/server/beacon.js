const http = require("http");
const PORT = process.env.BEACON_PORT || 3001;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok" }));
});

server.listen(PORT, () => {});
server.on("error", () => process.exit(1));
