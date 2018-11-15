import joi from 'joi';

const schema = joi.object().keys({
  auth: joi.object().keys({
    id: joi.string(),
    secret: joi.string(),
  }),
  region: joi.string(),
  bucketName: joi.string().required(),
  oldVersions: joi.number(),
});

export default function validate(config, utils) {
  let details = [];

  details = utils.combineErrorDetails(
    details,
    joi.validate(config.cloudFront, schema, utils.VALIDATE_OPTIONS),
  );

  if (config.app && !config.cloudFront.auth) {
    return details.push({
      message: 'auth is required when not using mup-aws-beanstalk',
      path: '',
    });
  }

  return utils.addLocation(details, 'cloudFront');
}
