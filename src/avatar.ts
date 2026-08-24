const MAX_AVATAR_BYTES = 1_500_000;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const ALLOWED_HOSTS = new Set(['avatars.githubusercontent.com', 'github.com']);

function hasExpectedSignature(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === 'image/png') {
    return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10]
      .every((value, index) => bytes[index] === value);
  }
  if (contentType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  }
  const prefix = Buffer.from(bytes.subarray(0, 12)).toString('ascii');
  if (contentType === 'image/gif') return prefix.startsWith('GIF87a') || prefix.startsWith('GIF89a');
  if (contentType === 'image/webp') return prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP';
  return false;
}

async function readSizeLimitedBody(response: Response): Promise<Uint8Array | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_AVATAR_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  if (!total) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function fetchAvatarDataUri(url: string): Promise<string | null> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }
  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.username ||
    parsedUrl.password ||
    !ALLOWED_HOSTS.has(parsedUrl.hostname.toLowerCase())
  ) return null;

  try {
    const response = await fetch(parsedUrl, {
      headers: { Accept: 'image/png,image/jpeg,image/webp,image/gif' },
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;

    const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
    if (!ALLOWED_TYPES.has(contentType)) return null;

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > MAX_AVATAR_BYTES) return null;

    const bytes = await readSizeLimitedBody(response);
    if (!bytes || !hasExpectedSignature(contentType, bytes)) return null;
    return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch {
    return null;
  }
}
