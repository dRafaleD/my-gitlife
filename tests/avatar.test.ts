import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAvatarDataUri } from '../src/avatar.js';

describe('avatar embedding', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('embeds a supported image response as a data URI', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(bytes, {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': String(bytes.byteLength) },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAvatarDataUri('https://avatars.githubusercontent.com/u/1'))
      .resolves.toBe(`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
  });

  it('rejects non-HTTPS and unsafe SVG image sources', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<svg/>', {
      status: 200,
      headers: { 'content-type': 'image/svg+xml' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAvatarDataUri('http://example.com/avatar.png')).resolves.toBeNull();
    await expect(fetchAvatarDataUri('https://avatars.githubusercontent.com/u/1.svg')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back when the avatar request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failure')));
    await expect(fetchAvatarDataUri('https://avatars.githubusercontent.com/u/1.png')).resolves.toBeNull();
  });

  it('rejects a response whose declared image type does not match its bytes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      new TextEncoder().encode('<html>not an image</html>'),
      { status: 200, headers: { 'content-type': 'image/png' } },
    )));

    await expect(fetchAvatarDataUri('https://avatars.githubusercontent.com/u/not-image')).resolves.toBeNull();
  });

  it('rejects oversized avatars with and without a content-length header', async () => {
    const oversized = new Uint8Array(1_500_001);
    oversized.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': '1500001' },
      }))
      .mockResolvedValueOnce(new Response(oversized, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAvatarDataUri('https://avatars.githubusercontent.com/u/declared-large')).resolves.toBeNull();
    await expect(fetchAvatarDataUri('https://avatars.githubusercontent.com/u/streamed-large')).resolves.toBeNull();
  });

  it('does not request arbitrary HTTPS hosts or credential-bearing URLs', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAvatarDataUri('https://example.com/avatar.png')).resolves.toBeNull();
    await expect(fetchAvatarDataUri('https://user:password@avatars.githubusercontent.com/u/1')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
