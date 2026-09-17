import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const nugetVersion = '7.9.0';
const nugetUrl = `https://dist.nuget.org/win-x86-commandline/v${nugetVersion}/nuget.exe`;
const expectedSha256 = '992d70cac5b06c38efec91806caba64cdcc07e6d963a0959dbbbaf264d33b800';
const cachePath = path.join(projectRoot, '.cache', 'nuget', 'nuget.exe');
const vendorPath = path.join(projectRoot, 'node_modules', 'electron-winstaller', 'vendor', 'nuget.exe');

function hash(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function matchesExpected(filePath) {
  try {
    return hash(await readFile(filePath)) === expectedSha256;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function downloadNuget() {
  const response = await fetch(nugetUrl, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Could not download NuGet ${nugetVersion}: HTTP ${response.status}`);
  }

  const binary = Buffer.from(await response.arrayBuffer());
  const actualHash = hash(binary);
  if (actualHash !== expectedSha256) {
    throw new Error(`NuGet ${nugetVersion} checksum mismatch: ${actualHash}`);
  }

  await mkdir(path.dirname(cachePath), { recursive: true });
  const temporaryPath = `${cachePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, binary, { flag: 'wx' });
  await rm(cachePath, { force: true });
  await rename(temporaryPath, cachePath);
}

export async function prepareSquirrelTooling() {
  if (process.platform !== 'win32') return;
  if (await matchesExpected(vendorPath)) return;

  if (!(await matchesExpected(cachePath))) await downloadNuget();
  await copyFile(cachePath, vendorPath);

  if (!(await matchesExpected(vendorPath))) {
    throw new Error('Could not prepare the checksum-verified NuGet executable for Squirrel.');
  }

  console.log(`Prepared NuGet ${nugetVersion} for the Windows installer.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) await prepareSquirrelTooling();
