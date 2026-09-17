import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { buildIcons } from './build-icons.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.join(root, 'dist');
const renderer = path.join(dist, 'renderer');
const library = path.join(dist, 'library');

async function copyModuleTree(destination) {
  await Promise.all([
    cp(path.join(root, 'src', 'simulation'), path.join(destination, 'simulation'), { recursive: true }),
    cp(path.join(root, 'src', 'rendering'), path.join(destination, 'rendering'), { recursive: true }),
    cp(path.join(root, 'src', 'ui'), path.join(destination, 'ui'), { recursive: true }),
  ]);
  const rendererPath = path.join(destination, 'rendering', 'webgl-renderer.js');
  const rendererSource = await readFile(rendererPath, 'utf8');
  await writeFile(rendererPath, rendererSource.replaceAll('.frag\'', '.js\'').replaceAll('.vert\'', '.js\''));
  const shaders = [['black-hole.frag', 'black-hole.js'], ['bloom.frag', 'bloom.js'], ['composite.frag', 'composite.js'], ['fullscreen.vert', 'fullscreen.js']];
  for (const [sourceName, moduleName] of shaders) {
    const shaderDirectory = path.join(destination, 'rendering', 'shaders');
    const source = await readFile(path.join(shaderDirectory, sourceName), 'utf8');
    await writeFile(path.join(shaderDirectory, moduleName), `/* Generated from ${sourceName}. */\nexport default ${JSON.stringify(source)};\n`);
    await rm(path.join(shaderDirectory, sourceName));
  }
}

export async function buildAll() {
  const resolvedDist = path.resolve(dist);
  if (!resolvedDist.startsWith(path.resolve(root) + path.sep)) throw new Error('Refusing to clean an unexpected build path.');
  await rm(resolvedDist, { recursive: true, force: true });
  await Promise.all([mkdir(renderer, { recursive: true }), mkdir(library, { recursive: true }), mkdir(path.join(dist, 'electron'), { recursive: true }), buildIcons()]);
  await Promise.all([
    copyModuleTree(renderer),
    copyModuleTree(library),
    cp(path.join(root, 'src', 'electron'), path.join(dist, 'electron'), { recursive: true }),
    cp(path.join(root, 'src', 'main.js'), path.join(renderer, 'main.js')),
    cp(path.join(root, 'src', 'platform-api.js'), path.join(renderer, 'platform-api.js')),
    cp(path.join(root, 'src', 'styles.css'), path.join(renderer, 'styles.css')),
    cp(path.join(root, 'src', 'index.html'), path.join(renderer, 'index.html')),
    cp(path.join(root, 'src', 'index.js'), path.join(library, 'index.js')),
    cp(path.join(root, 'src', 'styles.css'), path.join(library, 'gargantua.css')),
    cp(path.join(root, 'LICENSE'), path.join(dist, 'LICENSE')),
  ]);
  await writeFile(path.join(library, 'package.json'), `${JSON.stringify({ type: 'module', exports: { '.': './index.js', './styles.css': './gargantua.css' } }, null, 2)}\n`);
  console.log('Built the desktop renderer and reusable browser modules.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildAll().catch(error => { console.error(error); process.exitCode = 1; });
}
