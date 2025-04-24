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

      if (type === "register") {
        userId = payload.userId;
        clients.set(userId, {
          ws,
          role: payload.role,
          muted: false,
          streamId: payload.streamId,
        });

        return;
      }
      if (type === "request") {
        const client = clients.get(payload.from);
        const target = clients.get(payload.to);
        if (client.muted)
          return client.ws.send(
            JSON.stringify({
              type: "deny",
              payload: {
                to: payload.from,
                from: payload.to,
              },
            })
          );
        else {
          return target.ws.send(JSON.stringify(data));
        }
      }
      if (type === "signal" || type === "approve" || type === "deny") {
        const target = clients.get(payload.to);
        if (target) {
          target.ws.send(JSON.stringify(data));
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
        return;
      }

      if (type === "chat" || type === "peersList") {
        const sender = clients.get(payload.from);
        if (sender && !sender.muted) {
          clients.forEach((client) => {
            client.ws.send(JSON.stringify({ type, payload }));
          });
        }
        return;
      }

      if (type === "mute") {
        const target = clients.get(payload.userId);
        if (target) {
          target.muted = true;
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
      console.error("Message handling error:", err.message, err.stack);
    }
  });

  ws.on("close", (code, reason) => {
    if (userId !== null) {
      clients.delete(userId);
    }
  });

  ws.on("error", (err) =>
    console.error("WebSocket error:", err.message, err.stack)
  );
});

wss.on("error", (err) =>
  console.error("Server error:", err.message, err.stack)
);
