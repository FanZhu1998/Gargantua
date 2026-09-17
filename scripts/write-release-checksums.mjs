import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RELEASE_SUFFIXES = Object.freeze([
  '.appimage',
  '.deb',
  '.dmg',
  '.exe',
  '.msi',
  '.pkg',
  '.rpm',
  '.tar.gz',
  '.zip',
]);

export function selectReleaseArtifacts(artifactPaths) {
  return [...new Set(artifactPaths.map(item => path.resolve(item)))]
    .filter(filePath => RELEASE_SUFFIXES.some(suffix => filePath.toLowerCase().endsWith(suffix)))
    .sort();
}

async function hashFile(filePath) {
  const digest = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', chunk => digest.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return digest.digest('hex');
}

export async function writeReleaseChecksums(artifactPaths, destination) {
  const files = [];
  for (const artifactPath of [...new Set(artifactPaths.map(item => path.resolve(item)))].sort()) {
    const details = await stat(artifactPath);
    if (details.isFile()) files.push(artifactPath);
  }
  if (files.length === 0) throw new Error('No release files were provided for checksumming.');

  const baseDirectory = path.dirname(destination);
  const releaseNames = files.map(filePath => path.basename(filePath));
  const normalizedNames = releaseNames.map(name => name.toLowerCase());
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    throw new Error('Release file names must be unique before checksums can be generated.');
  }
  const lines = [];
  for (const filePath of files) {
    lines.push(`${await hashFile(filePath)}  ${path.basename(filePath)}`);
  }

  await mkdir(baseDirectory, { recursive: true });
  await writeFile(destination, `${lines.join('\n')}\n`, 'utf8');
  return destination;
}
