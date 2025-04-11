const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 8880 });

const clients = new Map();

wss.on("connection", (ws) => {
  let userId = null;

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      const { type, payload } = data;

      if (type === "register") {
        userId = payload.userId;
        clients.set(userId, { ws, role: payload.role, muted: false });
        console.log(`User ${userId} registered as ${payload.role}`);
        return;
      }

      if (type === "signal") {
        const target = clients.get(payload.to);
        if (target) {
          target.ws.send(JSON.stringify({ type: "signal", payload }));
        }
        return;
      }

      if (type === "chat") {
        const sender = clients.get(payload.from);
        if (sender && !sender.muted) {
          clients.forEach((client) => {
            client.ws.send(JSON.stringify({ type: "chat", payload }));
          });
        }
        return;
      }

      if (type === "mute") {
        const target = clients.get(payload.userId);
        if (target) {
          target.muted = true; // Fixed: was setting to false
          console.log(`User ${payload.userId} muted`);
        }
        return;
      }

      if (type === "unmute") {
        const target = clients.get(payload.userId);
        if (target) {
          target.muted = false;
          console.log(`User ${payload.userId} unmuted`);
        }
        return;
      }
    } catch (err) {
      console.error("Message handling error:", err);
    }
  });

  ws.on("close", () => {
    if (userId !== null) {
      clients.delete(userId);
      console.log(`User ${userId} disconnected`);
    }
  });

  ws.on("error", (err) => console.error("WebSocket error:", err));
});

console.log("WebSocket server running on ws://192.168.1.89:8880");