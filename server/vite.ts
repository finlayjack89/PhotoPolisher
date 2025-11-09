import express, { type Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function setupVite(app: express.Application) {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "custom",
    base: "/",
  });

  app.use(vite.middlewares);
  app.get("/", async (req: Request, res: Response, next: NextFunction) => {
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
