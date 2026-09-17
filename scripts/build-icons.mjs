import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));

export async function buildIcons() {
  const source = await readFile(path.join(root, 'assets', 'icon.svg'));
  const destination = path.join(root, 'assets', 'generated');
  await mkdir(destination, { recursive: true });
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
  const renderedIcons = await Promise.all(sizes.map(async size => {
    const buffer = await sharp(source).resize(size, size).png().toBuffer();
    await writeFile(path.join(destination, `icon-${size}.png`), buffer);
    return { size, buffer };
  }));
  await writeFile(path.join(destination, 'icon.ico'), await pngToIco(renderedIcons.map(icon => icon.buffer)));

  // Squirrel retrieves this tracked asset through APP_IDENTITY.installerIconUrl
  // when it creates the Windows Installed apps entry.
  const installerSizes = new Set([16, 32, 48, 64, 128, 256]);
  const installerIcons = renderedIcons
    .filter(icon => installerSizes.has(icon.size))
    .map(icon => icon.buffer);
  await writeFile(path.join(root, 'assets', 'installer-icon.ico'), await pngToIco(installerIcons));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildIcons().then(() => console.log('Generated desktop icons.')).catch(error => { console.error(error); process.exitCode = 1; });
}
