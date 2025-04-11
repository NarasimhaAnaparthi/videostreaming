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
        }
        return;
      }

      if (type === "unmute") {
        const target = clients.get(payload.userId);
        if (target) {
          target.muted = false;
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
    }
  });

  ws.on("error", (err) => console.error("WebSocket error:", err));
});
