import fs from 'fs';
import _chunk from 'lodash/chunk';
import { ensureBucketExists, ensureDistribution, tmpBuildPath, uploadFile, aws, createFileList, logPromiseProgress, injectVersion, distributionUrl, ensureOriginAccessIdentity } from './utils';

const DELETE_CHUNK_SIZE = 500;

export async function setup(api) {
  if (!api.getConfig().cloudFront) {
    console.log('No setting in config for CloudFront');
  }
  console.log('=> Setting Up CloudFront');
  console.log('  Making sure bucket exists');

  // check if bucket exists
  const bucketName = await ensureBucketExists(api, api.getConfig().cloudFront.bucketName);

  console.log('  Making sure distribution exists', bucketName);
  const canonicalUserId = await ensureOriginAccessIdentity(api, bucketName);
  await ensureDistribution(api, bucketName, canonicalUserId);
}

export async function upload(api) {
  console.log('=> Uploading public files for CloudFront');

  const {
    cloudFront,
    app,
  } = api.getConfig();
  const {
    s3,
  } = aws(api);
  const version = Date.now();
  const prefix = `${app.name}/${version}`;
  const bucketName = await ensureBucketExists(api, cloudFront.bucketName);
  const buildPath = tmpBuildPath(api);
  const programsPath = api.resolvePath(buildPath, 'bundle/programs');
  const archFiles = fs.readdirSync(programsPath)
    .filter(arch => arch.startsWith('web.browser'))
    .map(arch => ({
      arch,
      // eslint-disable-next-line
      manifest: require(api.resolvePath(programsPath, arch, 'program.json')).manifest,
    }));
  const filesToUpload = createFileList(archFiles);
  const promises = filesToUpload.map(fileConfig =>
    uploadFile({
      fileConfig, prefix, programsPath, bucketName,
    }, api, s3));

  await logPromiseProgress(promises);

  injectVersion(buildPath, version, api);
  return api.runCommand('cloud-front.env');
}

export async function clean(api) {
  const {
    cloudFront,
    app,
  } = api.getConfig();
  const {
    s3,
  } = aws(api);
  const maxVersions = cloudFront.oldVersions || app.oldVersions || 3;

  console.log('=> Removing old files from CloudFront');

  const bucketName = await ensureBucketExists(api, cloudFront.bucketName);
  const {
    CommonPrefixes: prefixes,
  } = await s3.listObjectsV2({
    Bucket: bucketName,
    Delimiter: '/',
    Prefix: `${app.name}/`,
  }).promise();

  const oldVersions = prefixes
    // Each prefix is formatted as "app-name/<deploy time>/"
    .map(prefix => parseInt(prefix.Prefix.split('/')[1], 10))
    .sort((a, b) => b - a)
    .slice(maxVersions);

  if (oldVersions.length === 0) {
    if (api.commandHistory.length === 1) {
      console.log(' No old files to remove');
    }

    return;
  }

  console.log(`  Finding files from ${oldVersions.length} old version${oldVersions.length === 1 ? '' : 's'}`);

  const toRemove = [];

  async function checkPrefix(prefix) {
    const {
      Contents,
      CommonPrefixes,
    } = await s3.listObjectsV2({
      Bucket: bucketName,
      Delimiter: '/',
      Prefix: prefix,
    }).promise();

    Contents.forEach((content) => {
      toRemove.push(content.Key);
    });

    for (let i = 0; i < CommonPrefixes.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await checkPrefix(CommonPrefixes[i].Prefix);
    }
  }

  for (let i = 0; i < oldVersions.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    await checkPrefix(`${app.name}/${oldVersions[i]}/`);
  }

  if (toRemove.length > 0) {
    console.log(`  Deleting ${toRemove.length} files`);
    const chunks = _chunk(toRemove, DELETE_CHUNK_SIZE);
    // eslint-disable-next-line no-restricted-syntax
    for (const chunk of chunks) {
      // eslint-disable-next-line no-await-in-loop
      await s3.deleteObjects({
        Bucket: bucketName,
        Delete: {
          Objects: chunk.map(key => ({ Key: key })),
        },
      }).promise();
      console.log(` Removed ${chunk.length} files`);
    }
  }
}

export async function env(api) {
  const {
    cloudFront,
    app,
  } = api.getConfig();

  const bucketName = await ensureBucketExists(api, cloudFront.bucketName);
  const cloudfrontUrl = await distributionUrl(api, bucketName);

  app.env.CDN_URL = `https://${cloudfrontUrl}`;
}
