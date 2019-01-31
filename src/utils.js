import AWS from 'aws-sdk';
import random from 'random-seed';
import uuid from 'uuid';
import os from 'os';
import fs from 'fs';
import mime from 'mime-types';

export function aws(api) {
  const {
    app,
    cloudFront,
  } = api.getConfig();
  const auth = app.auth || cloudFront.auth;

  AWS.config.update({
    accessKeyId: auth.id,
    secretAccessKey: auth.secret,
    region: cloudFront.region || app.region,
  });

  return {
    s3: new AWS.S3({ apiVersion: '2006-03-01' }),
    cloudFront: new AWS.CloudFront({ apiVersion: '2018-06-18' }),
  };
}

export function names(api) {
  const config = api.getConfig();

  return {
    bucketPrefix: config.cloudFront.bucketName,
  };
}

export function tmpBuildPath(api) {
  const {
    app,
  } = api.getConfig();

  if (app.buildOptions.buildLocation) {
    return app.buildOptions.buildLocation;
  }

  const appPath = api.resolvePath(api.base, app.path);
  const rand = random.create(appPath);
  const uuidNumbers = [];

  for (let i = 0; i < 16; i++) {
    uuidNumbers.push(rand(255));
  }

  return api.resolvePath(
    os.tmpdir(),
    `mup-meteor-${uuid.v4({ random: uuidNumbers })}`,
  );
}

export function uniqueName(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export async function ensureBucketExists(api, bucketName, region) {
  const {
    s3,
  } = aws(api);
  const {
    bucketPrefix,
  } = names(api);

  const {
    Buckets: buckets,
  } = await s3.listBuckets().promise();
  const existing = buckets.find(bucket => bucket.Name.indexOf(bucketPrefix) === 0);

  if (existing) {
    return existing.Name;
  }

  const name = uniqueName(bucketPrefix);

  await s3.createBucket({
    Bucket: name,
    ...(region ? {
      CreateBucketConfiguration: {
        LocationConstraint: region,
      },
    } : {}),
  }).promise();

  return name;
}

export async function ensureOriginAccessIdentity(api, bucketName) {
  const {
    cloudFront,
  } = aws(api);

  const params = {
    CloudFrontOriginAccessIdentityConfig: {
      CallerReference: `mup-cloud-front-${bucketName}`,
      Comment: `Created for the bucket ${bucketName} by mup-cloud-front `,
    },
  };
  const result = await cloudFront.createCloudFrontOriginAccessIdentity(params).promise();

  return {
    id: result.CloudFrontOriginAccessIdentity.Id,
    canonicalUserId: result.CloudFrontOriginAccessIdentity.S3CanonicalUserId,
  };
}

export async function ensureBucketPolicy(api, bucketName, canonicalUserId) {
  const {
    s3,
  } = aws(api);
  const policy = {
    Version: '2012-10-17',
    Id: 'PolicyForCloudFrontPrivateContent',
    Statement: [
      {
        Sid: 'Grant a CloudFront Origin Identity access to support private content',
        Effect: 'Allow',
        Principal: { CanonicalUser: canonicalUserId },
        Action: 's3:GetObject',
        Resource: `arn:aws:s3:::${bucketName}/*`,
      },
    ],
  };
  await s3.putBucketPolicy({
    Bucket: bucketName,
    Policy: JSON.stringify(policy),
  }).promise();
}

export async function findDistribution(api, bucketName) {
  const {
    cloudFront,
  } = aws(api);
  const {
    app,
  } = api.getConfig();

  const {
    DistributionList: distributions,
  } = await cloudFront.listDistributions().promise();

  return distributions.Items.find(distribution =>
    distribution.Origins.Items.find(origin =>
      origin.Id === bucketName && origin.OriginPath === `/${app.name}`));
}

export async function distributionUrl(api, bucketName) {
  const distribution = await findDistribution(api, bucketName);

  if (distribution) {
    return distribution.DomainName;
  }

  const err = new Error('no-distribution');
  err.solution = 'Run "mup setup" to create a CloudFront distribution';
  throw err;
}

export async function ensureDistribution(api, bucketName) {
  const {
    cloudFront,
  } = aws(api);
  const {
    app,
  } = api.getConfig();
  const existing = await findDistribution(api, bucketName);

  if (!existing) {
    const {
      id,
      canonicalUserId,
    } = await ensureOriginAccessIdentity(api, bucketName);
    await ensureBucketPolicy(api, bucketName, canonicalUserId);
    await cloudFront.createDistribution({
      DistributionConfig: {
        CallerReference: `${app.name}-${bucketName}`,
        Comment: `Created for ${app.name} by mup-cloud-front`,
        DefaultCacheBehavior: {
          ForwardedValues: {
            Cookies: {
              Forward: 'none',
            },
            QueryString: true,
            Headers: {
              Quantity: 0,
              Items: [
              ],
            },
            QueryStringCacheKeys: {
              Quantity: 0,
              Items: [
              ],
            },
          },
          MinTTL: 0,
          TargetOriginId: bucketName,
          TrustedSigners: {
            Enabled: false,
            Quantity: 0,
          },
          ViewerProtocolPolicy: 'allow-all',
          AllowedMethods: {
            Quantity: 2,
            Items: [
              'GET',
              'HEAD',
            ],
            CachedMethods: {
              Items: [
                'GET',
                'HEAD',
              ],
              Quantity: 2,
            },
          },
          Compress: true,
          DefaultTTL: 86400,
          MaxTTL: 31536000,
          FieldLevelEncryptionId: '',
          SmoothStreaming: false,
        },
        Enabled: true,
        Origins: {
          Quantity: 1,
          Items: [
            {
              DomainName: `${bucketName}.s3.amazonaws.com`,
              Id: bucketName,
              OriginPath: `/${app.name}`,
              S3OriginConfig: {
                OriginAccessIdentity: `origin-access-identity/cloudfront/${id}`,
              },
            },
          ],
        },
        CacheBehaviors: {
          Quantity: 0,
          Items: [
          ],
        },
        CustomErrorResponses: {
          Quantity: 0,
          Items: [
          ],
        },
        DefaultRootObject: '',
        HttpVersion: 'http2',
        IsIPV6Enabled: true,
        Logging: {
          Bucket: '',
          Enabled: false,
          IncludeCookies: false,
          Prefix: '',
        },
        PriceClass: 'PriceClass_100',
        Restrictions: {
          GeoRestriction: {
            Quantity: 0,
            RestrictionType: 'none',
            Items: [
            ],
          },
        },
        ViewerCertificate: {
          CertificateSource: 'cloudfront',
          CloudFrontDefaultCertificate: true,
          MinimumProtocolVersion: 'TLSv1',
        },
        WebACLId: '',
      },
    }).promise();
  }
}

export function injectVersion(buildPath, version, api) {
  const configPath = api.resolvePath(buildPath, 'bundle/programs/server/config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.cdnVersion = version;

  // Meteor sets the mode to 444 to make the file readonly
  // Temporarily allow us to write to it
  fs.chmodSync(configPath, 644);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  fs.chmodSync(configPath, 444);
}

export function logPromiseProgress(promises) {
  const total = promises.length;
  let finished = 0;
  let lastLogged = 0;

  // Log every 20% of progress
  function log() {
    const percent = Math.floor((finished / total) * 1000) / 10;
    if (percent - lastLogged >= 20) {
      lastLogged = percent - (percent % 20);
      console.log(`  Uploaded ${percent}% of files`);
    }
  }

  promises.forEach(promise => promise.then(() => {
    finished += 1;
    log();
  }));

  return Promise.all(promises);
}

export function createFileList(archs) {
  const uniqueFiles = archs.reduce((result, arch) => {
    arch.manifest
      .filter(fileConfig => fileConfig.url)
      .forEach((fileConfig) => {
        // When multiple arch's have a file with the same url, use the legacy version
        if (fileConfig.path in result && arch.arch !== 'web.browser.legacy') {
          return;
        }

        result[fileConfig.path] = {
          ...fileConfig,
          arch: arch.arch,
        };
      });

    return result;
  }, {});

  return Object.values(uniqueFiles);
}

export function uploadFile({
  fileConfig, prefix, programsPath, bucketName,
}, api, s3) {
  const fileUrl = fileConfig.url.split('?')[0];
  const filePath = api.resolvePath(programsPath, fileConfig.arch, fileConfig.path);
  const bucketKey = `${prefix}${fileUrl}`;

  return new Promise((resolve, reject) => {
    const uploader = s3.upload({
      Bucket: bucketName,
      Body: fs.createReadStream(filePath),
      Key: bucketKey,
      ContentType: mime.lookup(filePath) || 'application/octet-stream',
    });

    uploader.send((err, result) => {
      if (err) {
        // TODO: retry
        return reject(err);
      }

      resolve(result);
    });
  });
}
