import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ServerResponse } from "node:http";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "public");

const contentTypeByExtension: Record<string, string> = {
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

export async function tryServeStaticAsset(
  pathname: string,
  response: ServerResponse,
): Promise<boolean> {
  if (
    !pathname.startsWith("/icons/") &&
    !pathname.startsWith("/images/") &&
    pathname !== "/favicon.ico"
  ) {
    return false;
  }

  const contentType = contentTypeByExtension[path.extname(pathname)];
  if (!contentType) return false;

  const filePath = path.join(publicDir, pathname);
  if (!filePath.startsWith(publicDir + path.sep)) return false;

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return false;

    response.writeHead(200, {
      "content-type": contentType,
      "content-length": fileStat.size,
      "cache-control": "public, max-age=86400",
    });
    createReadStream(filePath).pipe(response);
    return true;
  } catch {
    return false;
  }
}
