import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { selectReleaseArtifacts, writeReleaseChecksums } from '../../scripts/write-release-checksums.mjs';

test('release checksums describe the flat, user-downloadable asset set', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gargantua-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const nested = path.join(root, 'nested');
  await mkdir(nested);
  const setup = path.join(nested, 'Gargantua-Setup.exe');
  const portable = path.join(nested, 'Gargantua-win32-x64-1.0.0.zip');
  const internalPackage = path.join(nested, 'gargantua_black_hole-1.0.0-full.nupkg');
  await writeFile(setup, 'setup');
  await writeFile(portable, 'portable');
  await writeFile(internalPackage, 'internal');

  const releaseArtifacts = selectReleaseArtifacts([internalPackage, portable, setup, setup]);
  assert.deepEqual(releaseArtifacts, [portable, setup].sort());

  const destination = path.join(root, 'SHA256SUMS.txt');
  await writeReleaseChecksums(releaseArtifacts, destination);
  const manifest = await readFile(destination, 'utf8');
  const expected = [portable, setup].sort().map(filePath => {
    const contents = path.basename(filePath).startsWith('Gargantua-Setup') ? 'setup' : 'portable';
    return `${createHash('sha256').update(contents).digest('hex')}  ${path.basename(filePath)}`;
  }).join('\n');
  assert.equal(manifest, `${expected}\n`);
  assert.doesNotMatch(manifest, /nested|nupkg/);
});

test('release checksum names must remain unique after GitHub flattens them', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gargantua-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const firstDirectory = path.join(root, 'first');
  const secondDirectory = path.join(root, 'second');
  await Promise.all([mkdir(firstDirectory), mkdir(secondDirectory)]);
  const first = path.join(firstDirectory, 'Gargantua.zip');
  const second = path.join(secondDirectory, 'gargantua.ZIP');
  await Promise.all([writeFile(first, 'one'), writeFile(second, 'two')]);
  await assert.rejects(
    writeReleaseChecksums([first, second], path.join(root, 'SHA256SUMS.txt')),
    /must be unique/,
  );
});
