import express, { type Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function setupVite(app: express.Application) {
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    // Production mode: serve pre-built static files
    const distPath = path.resolve(__dirname, "..", "dist");
    
    // Serve static assets from dist folder
    app.use(express.static(distPath));
    
    // Catch-all route for client-side routing
    app.use((req: Request, res: Response, next: NextFunction) => {
      // Skip API routes and non-GET requests
      if (req.originalUrl.startsWith("/api/") || req.method !== "GET") {
        return next();
      }
      
      // Serve index.html for all other routes (client-side routing)
      const indexPath = path.join(distPath, "index.html");
      res.sendFile(indexPath);
    });
  } else {
    // Development mode: use Vite dev server
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
      base: "/",
    });

    app.use(vite.middlewares);
    
    app.use(async (req: Request, res: Response, next: NextFunction) => {
      if (req.originalUrl.startsWith("/api/") || req.method !== "GET") {
        return next();
      }

      const url = req.originalUrl;

      try {
        const htmlPath = path.resolve(__dirname, "..", "index.html");
        let template = fs.readFileSync(htmlPath, "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  }
}
