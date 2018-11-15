# Mup CloudFront

Plugin for Meteor Up to setup and use CloudFront.

Features:
- Works correctly with rolling deploys and rolling back to an old version
- Automates setting up the Cloud Front distribution and S3 bucket
- Sets CDN_URL environment variable to correct version

Requires the [zodern:cdn](https://atmospherejs.com/zodern/cdn) package.

Compatible with Meteor 1.7.0.1 and newer.

## Why

During a rolling deploy, some servers run the new version and others run the old version of the application. When the new version is first loaded by a user, cloudfront retreives the new static files from one of the servers at random. If CloudFront tries a server running the old version of the application, the new static files fail to load.

To avoid that scenario, this plugin uploads the static files to s3 before each deployment so the new files are always available. The cdn url includes the deployment version to allow multiple versions to run at the same time. The deployment version is stored in the app's bundle so rolling back to an old version works correctly.

## Instructions

1) Install with `npm i --save-dev mup-cloud-front` and `meteor add zodern:cdn`
2) Create/update an IAM user. The access type should be `Programmatic access`. It needs the following permissions:
- `CloudFrontFullAccess`. After the CloudFront distribution is created, you can replace it with `CloudFrontReadOnlyAccess`
- If you are not using the IAM user for `mup-aws-beanstalk`, add the `AmazonS3FullAccess` permission.

3) Update your mup config:
```js
module.exports = {
  // ... rest of config

  cloudFront: {
    // S3 Bucket. Created if it doesn't exist. Multiple apps can safely share the bucket.
    // Random numbers might be added to the name to ensure it is unique.
    bucket: 'name-of-s3-bucket'

    // optional if using mup-aws-beanstalk, otherwise it is required
    auth: {
      // IAM user's Access key ID
      id: '12345',
      // IAM user's Secret access key
      secret: 'secret'
    },
  },
  plugins: [
    'mup-cloud-front'
  ]
};
```

Additional options are documented below.

4) Run `mup setup`
After setting it up, go to https://console.aws.amazon.com/cloudfront/home#distributions. Once the distribution's status is `Deployed` (usually 10 - 20 minutes), you can continue to the next step.

5) Deploy the app with `mup deploy`

## Options

```js
module.exports = {
  // ... rest of config

  cloudFront: {
    // S3 Bucket. Created if it doesn't exist. Multiple apps can safely share the bucket
    bucket: 'name-of-s3-bucket'
    // (optional) aws region for the s3 bucket
    region: 'us-east-1',

    // optional if using mup-aws-beanstalk, otherwise it is required
    auth: {
      // IAM user's Access key ID
      id: '12345',
      // IAM user's Secret access key
      secret: 'secret'
    },
    // (optional) Number of versions of static files to keep for rolling back to an older application version
    // Defaults to app.oldVersions if using mup-aws-beanstalk, or 3
    oldVersions: 3,
  },
  plugins: [
    'mup-cloud-front'
  ]
};
```

## Customizing Distribution

The distribution is setup with defaults that work well with most Meteor apps. You can make any additional changes you want to at https://console.aws.amazon.com/cloudfront/home#distributions.
Do not modify the s3 origin since it is used by this plugin to identify the distribution.

## Commands
`mup cloud-front setup` Sets up s3 bucket and CloudFront distribution
`mup cloud-front upload` Uploads static files to s3
`mup cloud-front clean` Removes old files from s3
`mup cloud-front env` Sets CDN_URL environment variable
