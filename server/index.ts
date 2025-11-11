import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { MemStorage } from "./storage";
import { setupVite } from "./vite";

const app = express();
const storage = new MemStorage();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Register API routes
registerRoutes(app, storage);

// Health check
app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// File retrieval from memory storage
app.get("/api/get-memstorage-file", async (req: Request, res: Response) => {
  try {
    const path = req.query.path as string;
    if (!path) {
      return res.status(400).json({ error: "path parameter required" });
    }

    const file = await storage.getFileFromMemStorage(path);
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    res.setHeader('Content-Type', file.mimeType);
    res.send(file.buffer);
  } catch (error) {
    console.error("Error retrieving file:", error);
    res.status(500).json({ error: "Failed to retrieve file" });
  }
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  await setupVite(app);
  
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(console.error);

export default app;
