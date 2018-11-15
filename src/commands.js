import * as handlers from './command-handlers';

export const setup = {
  description: 'Create CloudFront distribution',
  handler: handlers.setup,
};

export const upload = {
  description: 'Upload static files to s3',
  handler: handlers.upload,
};

export const clean = {
  description: 'Remove old static files',
  handler: handlers.clean,
};

export const env = {
  description: 'Set CDN_URL environment variable',
  handler: handlers.env,
};
