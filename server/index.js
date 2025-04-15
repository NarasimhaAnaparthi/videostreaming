const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 8880 });
const clients = new Map();

wss.on("connection", (ws) => {
  let userId = null;
  console.log("New WebSocket connection established");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      const { type, payload } = data;
      console.log("Server received:", JSON.stringify(data, null, 2));

      if (type === "register") {
        userId = payload.userId;
        clients.set(userId, { ws, role: payload.role, muted: false, streamId: payload.streamId });
        console.log(`Registered ${payload.role} with ID: ${userId}, Stream ID: ${payload.streamId}, Total clients: ${clients.size}`);
        return;
      }

      if (type === "signal" || type === "request" || type === "approve" || type === "deny") {
        const target = clients.get(payload.to);
        if (target) {
          target.ws.send(JSON.stringify(data));
          console.log(`Forwarded ${type} to ${payload.to}`);
        } else {
          console.warn(`Target ${payload.to} not found for ${type}`);
        }
        return;
      }

      if (type === "qa_stream") {
        clients.forEach((client, clientId) => {
          if (clientId !== payload.from) {
            client.ws.send(JSON.stringify(data));
          }
        });
        console.log(`Broadcasted qa_stream from ${payload.from}`);
        return;
      }

      if (type === "chat") {
        const sender = clients.get(payload.from);
        if (sender && !sender.muted) {
          clients.forEach((client) => {
            client.ws.send(JSON.stringify({ type: "chat", payload }));
          });
          console.log(`Broadcasted chat from ${payload.from}`);
        }
        return;
      }

      if (type === "mute") {
        const target = clients.get(payload.userId);
        if (target) {
          target.muted = true;
          console.log(`Muted user ${payload.userId}`);
        }
        return;
      }

      if (type === "unmute") {
        const target = clients.get(payload.userId);
        if (target) {
          target.muted = false;
          console.log(`Unmuted user ${payload.userId}`);
        }
        return;
      }
    } catch (err) {
      console.error("Message handling error:", err.message, err.stack);
    }
  });

  ws.on("close", (code, reason) => {
    if (userId !== null) {
      clients.delete(userId);
      console.log(`Client ${userId} disconnected, Code: ${code}, Reason: ${reason}, Total clients: ${clients.size}`);
    }
  });

  ws.on("error", (err) => console.error("WebSocket error:", err.message, err.stack));
});

wss.on("error", (err) => console.error("Server error:", err.message, err.stack));