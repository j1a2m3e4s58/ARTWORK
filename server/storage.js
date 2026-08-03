import path from 'node:path';
import { rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const storageProvider = process.env.STORAGE_PROVIDER === 'cloudinary' ? 'cloudinary' : 'local';
const signedCloudinary = Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
const unsignedCloudinary = Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_UPLOAD_PRESET);
export const storageConfigured = storageProvider === 'local' || signedCloudinary || unsignedCloudinary;

export function checkStorage() {
  if (!storageConfigured) return { ok: false, provider: storageProvider, reason: 'storage_not_configured' };
  if (process.env.NODE_ENV === 'production' && storageProvider === 'local') {
    return { ok: false, provider: storageProvider, reason: 'local_storage_is_not_durable' };
  }
  if (process.env.NODE_ENV === 'production' && storageProvider === 'cloudinary' && !signedCloudinary) {
    return { ok: false, provider: storageProvider, reason: 'signed_cloud_storage_credentials_required' };
  }
  return { ok: true, provider: storageProvider };
}

export async function storeFile({ buffer, mime, extension, uploadDir, id }) {
  if (storageProvider === 'cloudinary') {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    if (!cloudName || (!signedCloudinary && !unsignedCloudinary)) throw new Error('Cloud storage is selected but not fully configured.');
    const resourceType = mime.startsWith('video/') || mime.startsWith('audio/')
      ? 'video'
      : mime.startsWith('image/')
        ? 'image'
        : 'raw';
    const form = new FormData();
    form.append('folder', 'reigns-atelier');
    if (signedCloudinary) {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createHash('sha1')
        .update(`folder=reigns-atelier&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`)
        .digest('hex');
      form.append('timestamp', String(timestamp));
      form.append('api_key', process.env.CLOUDINARY_API_KEY);
      form.append('signature', signature);
    } else {
      form.append('upload_preset', process.env.CLOUDINARY_UPLOAD_PRESET);
    }
    form.append('file', new Blob([buffer], { type: mime }), `${id}.${extension}`);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(resourceType === 'video' ? 180000 : 60000),
    });
    const result = await response.json();
    if (!response.ok || !result.secure_url) throw new Error(result.error?.message || 'Cloud upload failed.');
    return { url: result.secure_url, publicId: result.public_id, resourceType };
  }
  const filename = `${id}.${extension}`;
  await writeFile(path.join(uploadDir, filename), buffer);
  return {
    url: `/uploads/${filename}`,
    publicId: filename,
    resourceType: mime.startsWith('video/') || mime.startsWith('audio/') ? 'video' : mime.startsWith('image/') ? 'image' : 'raw',
  };
}

export async function deleteStoredFile({ publicId, resourceType = 'image', uploadDir }) {
  if (!publicId) return false;
  if (storageProvider === 'cloudinary') {
    if (!signedCloudinary) throw new Error('Signed cloud storage credentials are required to delete media.');
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHash('sha1')
      .update(`public_id=${publicId}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`)
      .digest('hex');
    const form = new FormData();
    form.append('public_id', publicId);
    form.append('timestamp', String(timestamp));
    form.append('api_key', process.env.CLOUDINARY_API_KEY);
    form.append('signature', signature);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/destroy`, { method: 'POST', body: form });
    const result = await response.json();
    if (!response.ok || !['ok', 'not found'].includes(result.result)) throw new Error(result.error?.message || 'Cloud media deletion failed.');
    return true;
  }
  const candidate = path.resolve(uploadDir, path.basename(publicId));
  if (!candidate.startsWith(`${path.resolve(uploadDir)}${path.sep}`)) throw new Error('Invalid local media path.');
  await rm(candidate, { force: true });
  return true;
}
