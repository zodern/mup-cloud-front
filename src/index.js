import * as _commands from './commands';
import validator from './validate';

export const name = 'cloud-front';
export const description = 'Setup CloudFront with an S3 origin and upload static files';

export const commands = _commands;

export const validate = {
  cloudFront: validator,
};

function onlyPluginEnabled(...commandList) {
  return function run(api) {
    if (api.getConfig().cloudFront) {
      const promise = api.runCommand(commandList.shift());

      commandList.forEach((command) => {
        promise.then(() => api.runCommand(command));
      });

      return promise;
    }
  };
}

export const hooks = {
  'post.default.setup': onlyPluginEnabled('cloud-front.setup'),
  'post.meteor.build': onlyPluginEnabled('cloud-front.upload'),
  'pre.default.reconfig': onlyPluginEnabled('cloud-front.env'),
  'post.default.deploy': onlyPluginEnabled('cloud-front.clean'),
};
