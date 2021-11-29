import { IntegrationHandler } from '@chec/integration-handler';
import { ConfigurationType } from '../configuration-type';

interface RutterProduct {
  name: 'String',
};

interface RutterCategory {
  name: 'String',
};

const handler: IntegrationHandler<ConfigurationType> = async (request, context) => {
  // Integrations are run by events, usually from a webhook. The event that triggered this action is available within
  // the body of the request
  switch (request.body.event) {
    case 'integrations.ready':
      try {
        // Perform work on the first run of an integration - eg. setting up with an external service for the first time
        const baseUrl = 'https://production.rutterapi.com';
        const config = await getConfig(baseUrl, context);

        let promises = [];
        let syncedItems = {
          products: [],
          categories: [],
        };

        const storeData: any = await context.got(
          'store', config).json();

        //  Initial save products
        // Try making a call to the API to recieve the products data
        const productData: any = await context.got<RutterProduct>(
          'products', config).json();

        if ('products' in productData) {
          productData.products.map((product) => {
            promises.push(
              saveProduct(product, context)
            );
            // Add item to synced list
            syncedItems.products.push(product);
          });
        }

        // RUTTER SHOPIFY DOES NOT SUPPORT CATEGORIES

        //  Initial save categories

        // Try making a call to the API to recieve the categories data
        // const categoryData: any = await context.got<RutterCategory>(
        //   'products/categories', config).json();

        // if ('categories' in categoryData) {
        //   categoryData.categories.map((category) => {
        //     promises.push(
        //       saveCategory(category, context)
        //     );
        //     // Add item to synced list
        //     syncedItems.categories.push(category);
        //   });
        // }

        await Promise.all(promises);

        return {
          statusCode: 201,
          body: JSON.stringify({
            message: 'Shopify sync completed!',
            store: storeData,
            ...syncedItems,
          }),
        };
      } catch (error) {
        console.log(error.response.body);
        // if the error has an attribute error 500 taht you cannot have required attributes so it failed to run
      }

    case 'orders.create':
      // Perform work based on the "order.create" webhook invocation. Integrations are configured to only handle
      // specific webhook events, so ensure that the integration template is configured with the right webhook events.
  }

  return {
    statusCode: 200,
    body: '',
  };
};


async function getConfig(baseUrl, context) {
  const integration = await context.integration();
  // Retrieve the access token from Rutter
  const res: any = await context.got(`${baseUrl}/item/public_token/exchange`,
  {
    json: {
      client_id: process.env.RUTTER_CLIENT_ID,
      secret: process.env.RUTTER_SECRET_ID,
      public_token: integration.config.publicToken
    },
    method: 'post',
  }).json();

  return {
    searchParams: {
      access_token: res.access_token,
    },
    username: process.env.RUTTER_CLIENT_ID,
    password: process.env.RUTTER_SECRET_ID,
    prefixUrl: baseUrl,
  };
}

function sanitizeProduct(product) {
  if (product.variants.length > 1) {
    // Has variants
    const variant_groups_names = product.variants[0].option_values.map((option) => option.name);;

    return {
      product: {
        name: product.name,
        description: product?.description || null,
        sku: null,
        price: product.variants[0]?.price  || 0,
        active: product.status === 'active',
        quantity: null,
      },
      collect: {
        shipping: product.variants.some((variant) => variant.requires_shipping === true),
      },
      delivery: {
        enabled: {
          shipping_native_v1: product.variants.some((variant) => variant.requires_shipping === true),
        }
      },
      updated: product.updated_at,
      assets: [],
      variant_groups: variant_groups_names.map((group) => ({
        name: group,
        options: product.variants.map((variant) =>
          variant.option_values.filter((option) => option.name === group)
          .map((option) => ({
            description: option.value,
            price: variant.price,
            quantity: variant.inventory.total_count
          }))
          .reduce((pre, cur) => pre.concat(cur))
        )
      })),
    }
  }
  return {
    // Single product
    product: {
      name: product.name,
      description: product?.description || null,
      sku: product.variants[0]?.sku || null,
      price: product.variants[0]?.price  || 0,
      active: product.status === 'active',
      quantity: product.variants[0]?.inventory?.total_count || null,
    },
    collect: {
      shipping: product.variants[0]?.requires_shipping,
    },
    delivery: {
      enabled: {
        shipping_native_v1: product?.variants[0]?.requires_shipping,
      }
    },
    updated: product.updated_at,
    assets: [],
  };
}

async function saveProduct(product, context) {
  const payload = sanitizeProduct(product);

  // console.log(JSON.stringify(payload));
  // return;

  if (product.images?.length > 0){
    await Promise.all(product.images.map(async (image) => {
      const data = await context.api.post('v1/assets', {
        filename: image.src.substring(image.src.lastIndexOf('/') + 1),
        url: image.src,
      });

      payload.assets.push({
        id: data.id
      });
    }));
  }

  return context.api.post('v1/products', payload);
}

function saveCategory(category, context) {
  const payload = {
    name: category.name,
  };

  return context.api.post('v1/categories', payload);
}

export = handler;
