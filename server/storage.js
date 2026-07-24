import path from 'node:path';
import { writeFile } from 'node:fs/promises';

export const storageProvider = process.env.STORAGE_PROVIDER === 'cloudinary' ? 'cloudinary' : 'local';

export async function storeFile({ buffer, mime, extension, uploadDir, id }) {
  if (storageProvider === 'cloudinary') {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const preset = process.env.CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName || !preset) throw new Error('Cloud storage is selected but not fully configured.');
    const resourceType = mime.startsWith('video/') ? 'video' : 'image';
    const form = new FormData();
    form.append('upload_preset', preset);
    form.append('folder', 'reigns-atelier');
    form.append('file', new Blob([buffer], { type: mime }), `${id}.${extension}`);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, { method: 'POST', body: form });
    const result = await response.json();
    if (!response.ok || !result.secure_url) throw new Error(result.error?.message || 'Cloud upload failed.');
    return result.secure_url;
  }
  const filename = `${id}.${extension}`;
  await writeFile(path.join(uploadDir, filename), buffer);
  return `/uploads/${filename}`;
}
