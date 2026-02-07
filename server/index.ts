import express from "express";
import cors from "cors";
import { createServer } from "http";
import { TEAMS_DIR, TASKS_DIR } from "./constants.js";
import { registerRoutes } from "./routes.js";
import { setupWebSocket } from "./websocket.js";

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);

registerRoutes(app);
setupWebSocket(server);

const PORT = process.env.PORT || 3847;
server.listen(PORT, () => {
  console.log(`HiveWatch server running on http://localhost:${PORT}`);
  console.log(`WebSocket available on ws://localhost:${PORT}`);
  console.log(`Watching: ${TEAMS_DIR}, ${TASKS_DIR}`);
});
