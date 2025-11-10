import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import crypto from "crypto";

const baseUploadsDir = path.resolve(process.cwd(), process.env.UPLOADS_DIR || "uploads");

function sanitizeFileName(name) {
  const base = path.basename(name || "document").replace(/\s+/g, "-");
  return base.replace(/[^a-zA-Z0-9._-]/g, "");
}

async function ensureDir(targetDir) {
  if (!existsSync(targetDir)) {
    await fs.mkdir(targetDir, { recursive: true });
  }
}

export async function getUploadsDir() {
  await ensureDir(baseUploadsDir);
  return baseUploadsDir;
}

export async function saveBufferFile(file, { subfolder = "" } = {}) {
  if (!file?.buffer?.length) throw new Error("Archivo vacío");
  const uploadsDir = await getUploadsDir();
  const targetDir = subfolder ? path.join(uploadsDir, subfolder) : uploadsDir;
  await ensureDir(targetDir);

  const ext = path.extname(file.originalname || "").toLowerCase();
  const safeExt = ext && ext.length <= 8 ? ext : "";
  const randomId = crypto.randomBytes(8).toString("hex");
  const baseName = sanitizeFileName(path.parse(file.originalname || "document").name);
  const fileName = `${baseName || "evidence"}-${Date.now()}-${randomId}${safeExt}`;
  const absolutePath = path.join(targetDir, fileName);

  await fs.writeFile(absolutePath, file.buffer);

  const relativePathParts = ["uploads"];
  if (subfolder) {
    const fragments = subfolder.split(path.sep).filter(Boolean);
    relativePathParts.push(...fragments);
  }
  relativePathParts.push(fileName);
  const relativePath = `/${relativePathParts.join("/")}`;
  return { absolutePath, relativePath };
}

export async function removeStoredFile(relativePath) {
  if (!relativePath) return;
  const uploadsDir = await getUploadsDir();
  const sanitized = relativePath.replace(/^\/+/, "");
  const absolutePath = path.join(uploadsDir, sanitized.replace(/^uploads[\/]/, ""));
  try {
    await fs.unlink(absolutePath);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn("No se pudo eliminar archivo", absolutePath, err.message || err);
    }
  }
}
