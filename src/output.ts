import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';

const MAX_EXISTING_CARD_BYTES = 2_000_000;
const GITLIFE_MARKERS = ['data-style="', '<title id="card-title">My GitLife card for @'];

function isInside(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot));
}

export function resolveSafeOutputPath(cwd: string, requestedPath: string): string {
  if (!requestedPath || isAbsolute(requestedPath) || requestedPath.split(/[\\/]+/).includes('..')) {
    throw new Error('Output path must be a relative path inside the current working directory.');
  }
  const root = resolve(cwd);
  const outputPath = resolve(root, requestedPath);
  if (!isInside(root, outputPath)) {
    throw new Error('Output path must stay inside the current working directory.');
  }
  if (extname(outputPath).toLowerCase() !== '.svg') {
    throw new Error('Output file must use the .svg extension.');
  }
  return outputPath;
}

async function verifyExistingTarget(outputPath: string): Promise<void> {
  try {
    const target = await lstat(outputPath);
    if (target.isSymbolicLink() || !target.isFile()) {
      throw new Error('Output target must be a regular file, not a link or directory.');
    }
    if (target.size > MAX_EXISTING_CARD_BYTES) {
      throw new Error('Refusing to overwrite an existing file that is not a My GitLife card.');
    }
    const existing = await readFile(outputPath, 'utf8');
    if (!GITLIFE_MARKERS.every((marker) => existing.includes(marker))) {
      throw new Error('Refusing to overwrite an existing file that is not a My GitLife card.');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function writeSvgOutput(cwd: string, requestedPath: string, svg: string): Promise<string> {
  const outputPath = resolveSafeOutputPath(cwd, requestedPath);
  const root = await realpath(resolve(cwd));
  const parent = dirname(outputPath);
  await mkdir(parent, { recursive: true });
  const resolvedParent = await realpath(parent);
  if (!isInside(root, resolvedParent)) {
    throw new Error('Output directory resolves outside the current working directory.');
  }
  await verifyExistingTarget(outputPath);

  const handle = await open(
    outputPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(svg, 'utf8');
  } finally {
    await handle.close();
  }
  return outputPath;
}
