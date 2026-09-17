const path = require('node:path');
const { MakerSquirrel } = require('@electron-forge/maker-squirrel');
const { MakerZIP } = require('@electron-forge/maker-zip');
const { MakerDeb } = require('@electron-forge/maker-deb');
const { MakerRpm } = require('@electron-forge/maker-rpm');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseVersion, FuseV1Options } = require('@electron/fuses');
const { APP_IDENTITY } = require('./src/electron/app-identity.cjs');

const certificateFile = process.env.WINDOWS_CERTIFICATE_FILE;
const windowsSign = certificateFile ? {
  certificateFile: path.resolve(certificateFile),
  certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
  timestampServer: 'http://timestamp.digicert.com',
} : null;

module.exports = {
  packagerConfig: {
    name: APP_IDENTITY.productName,
    executableName: APP_IDENTITY.executableName,
    appBundleId: APP_IDENTITY.bundleId,
    appCategoryType: 'public.app-category.education',
    appCopyright: APP_IDENTITY.copyright,
    win32metadata: {
      CompanyName: APP_IDENTITY.companyName,
      FileDescription: APP_IDENTITY.description,
      ProductName: APP_IDENTITY.productName,
      InternalName: APP_IDENTITY.executableName,
      OriginalFilename: `${APP_IDENTITY.executableName}.exe`,
      'requested-execution-level': 'asInvoker',
    },
    ...(windowsSign ? { windowsSign } : {}),
    icon: path.join(__dirname, 'assets', 'generated', 'icon'),
    download: {
      cacheRoot: path.join(__dirname, '.cache', 'electron'),
    },
    asar: true,
    prune: true,
    ignore: [
      /^\/\.cache(?:\/|$)/,
      /^\/\.git(?:\/|$)/,
      /^\/\.pnpm-store(?:\/|$)/,
      /^\/\.gitignore$/,
      /^\/(?:CONTRIBUTING|README)\.md$/,
      /^\/docs(?:\/|$)/,
      /^\/forge\.config\.cjs$/,
      /^\/playwright\.config\.js$/,
      /^\/pnpm-(?:lock|workspace)\.yaml$/,
      /^\/src(?:\/|$)/,
      /^\/test(?:\/|$)/,
      /^\/scripts(?:\/|$)/,
      /^\/assets\/icon\.svg$/,
      /^\/\.github(?:\/|$)/,
      /^\/playwright-report(?:\/|$)/,
      /^\/test-results(?:\/|$)/,
      /^\/out(?:\/|$)/,
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: APP_IDENTITY.squirrelName,
      title: APP_IDENTITY.productName,
      authors: APP_IDENTITY.companyName,
      description: APP_IDENTITY.description,
      copyright: APP_IDENTITY.copyright,
      exe: `${APP_IDENTITY.executableName}.exe`,
      setupExe: APP_IDENTITY.setupExe,
      setupIcon: path.join(__dirname, 'assets', 'generated', 'icon.ico'),
      iconUrl: APP_IDENTITY.installerIconUrl,
      ...(windowsSign ? { windowsSign } : {}),
    }),
    new MakerZIP({}, ['win32', 'darwin', 'linux']),
    new MakerDeb({ options: { name: 'gargantua-black-hole', productName: 'Gargantua', genericName: 'Black Hole Simulator', categories: ['Education', 'Science'], icon: path.join(__dirname, 'assets', 'generated', 'icon-512.png') } }),
    new MakerRpm({ options: { name: 'gargantua-black-hole', productName: 'Gargantua', genericName: 'Black Hole Simulator', categories: ['Education', 'Science'], icon: path.join(__dirname, 'assets', 'generated', 'icon-512.png') } }),
  ],
  hooks: {
    generateAssets: async () => {
      const { buildAll } = await import('./scripts/build.mjs');
      await buildAll();
    },
    preMake: async () => {
      const { prepareSquirrelTooling } = await import('./scripts/prepare-squirrel-tooling.mjs');
      await prepareSquirrelTooling();
    },
    postMake: async (_forgeConfig, makeResults) => {
      const { selectReleaseArtifacts, writeReleaseChecksums } = await import('./scripts/write-release-checksums.mjs');
      const artifacts = makeResults.flatMap(result => result.artifacts);
      const releaseArtifacts = selectReleaseArtifacts(artifacts);
      const checksumPath = await writeReleaseChecksums(releaseArtifacts, path.join(__dirname, 'out', 'make', 'SHA256SUMS.txt'));
      return makeResults.map((result, index) => index === 0
        ? { ...result, artifacts: [...result.artifacts, checksumPath] }
        : result);
    },
  },
  plugins: [
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    }),
  ],
};
