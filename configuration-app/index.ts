import { createSDK, SchemaFieldTypes } from '@chec/integration-configuration-sdk';
import '@rutter/rutter-link';
import { ConfigurationType } from '../configuration-type';

import './index.css';

// Declare a list of platforms as they relate to template "codes", as we will have multiple integration templates, one
// for each platform Rutter supports
const codesToPlatforms = {
  shopify: {
    platform: 'SHOPIFY',
    label: 'Shopify',
  },
  // TODO add more
};

(async () => {
  // Create an SDK and indicate that the configuration is initially unsavable
  const sdk = await createSDK<ConfigurationType>(false);

  // Figure out what "platform" we're supporting with this integration
  const { platform, label } = codesToPlatforms[sdk.template];

  if (sdk.editMode) {
    // Ensure that we're not preventing save when editing
    sdk.setSavable(true);
    // Show some feedback that no further configuration is required.
    sdk.setSchema([{
      type: SchemaFieldTypes.Html,
      content: `<p>This integration is connected to your ${label} account. Changes to products and categories will be automatically synced and visible in the logs below</p>`,
    }])
    return;
  }

  // Replace spans in HTML content that should have the platform label
  Array.from(document.getElementsByClassName('platform')).forEach((element) => {
    element.innerHTML = label;
  });

  const pendingMessage = document.createElement('p');
  pendingMessage.innerHTML = 'Continue by following the steps in the pop-up window. If the window did not open, please refresh and try again';

  const completeMessage = document.createElement('p');
  completeMessage.innerHTML = 'The connection is complete! Please continue by clicking "Save changes" below.';

  const app = document.getElementById('app');

  const button = document.createElement('button');
  button.innerHTML = `Authenticate with your ${label} account`;
  button.className = platform.toLowerCase();
  button.onclick = () => {
    app.removeChild(button);
    app.appendChild(pendingMessage);
    // @ts-ignore
    const rutter = window.Rutter.create({
      publicKey: process.env.RUTTER_PUBLIC_KEY,
      onSuccess(publicToken) {
        if (publicToken === undefined) {
          // Should apparently never happen. The type will (apparently) be updated in a future release of rutter-link
          return;
        }

        app.removeChild(pendingMessage);
        app.appendChild(completeMessage);

        sdk.setConfig({
          publicToken,
        });
        // We've got what we need to save the integration now
        sdk.setSavable(true);
      },
      onExit() {
        // Re-enable the button assuming that the config is not set
        if (sdk.config.publicToken) {
          return;
        }

        app.removeChild(pendingMessage);
        app.appendChild(button);
      },
      // noop, but required according to TS types - even though it's not required according to docs
      onLoad() {},
    });

    rutter.open({ platform });
  };

  app.appendChild(button);

  sdk.enableAutoResize();
})();


