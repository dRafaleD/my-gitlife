import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveSafeOutputPath, writeSvgOutput } from '../src/output.js';

const card = `<?xml version="1.0"?><svg data-style="story"><title id="card-title">My GitLife card for @test</title></svg>`;
let directory = '';

describe('safe SVG output handling', () => {
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'my-gitlife-output-'));
  });

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('rejects traversal, absolute paths, and non-SVG targets', () => {
    expect(() => resolveSafeOutputPath(directory, '../outside.svg')).toThrow('relative path');
    expect(() => resolveSafeOutputPath(directory, join(directory, 'absolute.svg'))).toThrow('relative path');
    expect(() => resolveSafeOutputPath(directory, 'README.md')).toThrow('.svg extension');
  });

  it('writes nested cards inside the working directory and can refresh its own output', async () => {
    const outputPath = await writeSvgOutput(directory, 'cards/profile.svg', card);
    expect(await readFile(outputPath, 'utf8')).toBe(card);

    const refreshed = card.replace('story', 'compact');
    await expect(writeSvgOutput(directory, 'cards/profile.svg', refreshed)).resolves.toBe(outputPath);
    expect(await readFile(outputPath, 'utf8')).toBe(refreshed);
  });

  it('does not overwrite an unrelated existing SVG file', async () => {
    const outputPath = join(directory, 'important.svg');
    const existing = '<svg><title>Important user artwork</title></svg>';
    await writeFile(outputPath, existing, 'utf8');

    await expect(writeSvgOutput(directory, 'important.svg', card)).rejects.toThrow(
      'not a My GitLife card',
    );
    expect(await readFile(outputPath, 'utf8')).toBe(existing);
  });

  it('rejects output directories that resolve through a link outside the working directory', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'my-gitlife-outside-'));
    const linkedDirectory = join(directory, 'linked');
    try {
      await symlink(outside, linkedDirectory, 'junction');
      await expect(writeSvgOutput(directory, 'linked/profile.svg', card)).rejects.toThrow(
        'resolves outside the current working directory',
      );
      await expect(readFile(join(outside, 'profile.svg'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
