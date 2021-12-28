import { Context, IntegrationHandler } from '@chec/integration-handler';
import { OptionsOfJSONResponseBody } from 'got';
import { RutterProduct, RutterProductResponse, RutterTokenResponse } from '../rutter-types';
import { ConfigurationType } from '../configuration-type';
import platformMap from '../platformMap';

const handler: IntegrationHandler<ConfigurationType> = async (request, context) => {
  if (request.body.event !== 'integrations.ready') {
    return {
      statusCode: 422,
      body: 'This integration only supports the "integrations.ready" event',
    };
  }

  const integration = await context.integration();
  const baseUrl = 'https://production.rutterapi.com';

  const { access_token: token, connection_id: connectionId, is_ready: isReady } = (
    await context.got<RutterTokenResponse>(`${baseUrl}/item/public_token/exchange`, {
      responseType: 'json',
      json: {
        client_id: process.env.RUTTER_CLIENT_ID,
        secret: process.env.RUTTER_SECRET_ID,
        public_token: integration.config.publicToken
      },
      method: 'post',
    })
  ).body;

  // Set the store ID as the integration external reference, but don't wait for the response.
  // @ts-ignore
  integration.setExternalId(connectionId);

  // The connection isn't ready yet. The Chec API has a webhook that will rerun this integration when the store is ready
  if (!isReady) {
    return {
      statusCode: 202,
      body: 'Product syncing will begin when the external service is ready',
    };
  }

  const gotConfig: OptionsOfJSONResponseBody = {
    responseType: 'json',
    searchParams: {
      access_token: token,
    },
    username: process.env.RUTTER_CLIENT_ID,
    password: process.env.RUTTER_SECRET_ID,
    prefixUrl: baseUrl,
  };

  const platform = integration.template.code;

  const promises = [];
  const syncedItems = {
    products: [],
    categories: [],
  };

  // TODO Add category support - Rutter only supports this for Etsy

  // Sync products using a do..while for handling cursor pagination
  let products = [];
  let cursor: string|null = null;
  const idMap = (await context.store.get('idMap')) || {};

  do {
    const cursorParam = cursor ? `?cursor=${cursor}` : '';

    // Super ugly object destructuring assignment here. The RHS of this statement is a RutterProductResponse
    ({ products, next_cursor: cursor } = (
      await context.got<RutterProductResponse>(`products${cursorParam}`, gotConfig)
    ).body);

    if (!products) {
      break;
    }

    products
      // Filter out products that have already been synced previously
      .filter((product) => !Object.values(idMap).find(({ integration_id: id }) => id === product.id))
      // Save all products from Rutter to Chec
      .map((product) => {
        promises.push(
          saveProduct(product, context).then((checProduct) => {
            idMap[checProduct.id] = {
              [`${platform}_id`]: product.platform_id,
              integration_id: product.id,
            };

            return checProduct;
          }),
        );
        // Add item to synced list
        syncedItems.products.push(product);
      });
  } while (cursor && products && products.length !== 0);

  const checProducts = await Promise.all(promises);

  context.store.set('idMap', idMap);

  if (promises.length === 0) {
    return {
      statusCode: 200,
      body: 'All products have already been synced',
    };
  }

  return {
    statusCode: 201,
    body: JSON.stringify({
      message: `${platformMap[platform].label} sync completed!`,
      product_count: promises.length,
      product_ids: checProducts.map(({ id }) => id),
    }),
  };
};

function convertProduct(product: RutterProduct) {
  const baseProduct = {
    // Single product
    product: {
      name: product.name,
      description: product?.description || null,
      price: 0,
      active: product.status === 'active',
    },
    assets: [],
  }

  if (product.variants.length === 1) {
    return {
      ...baseProduct,
      product: {
        ...baseProduct.product,
        sku: product.variants[0]?.sku || null,
        price: product.variants[0]?.price || 0,
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
    };
  }

  // Has variants. We need go through each variant and build up the groups and options that should be created on the
  // product
  // TODO use Commerce.js types here when they're available
  const variantGroups = product.variants.reduce<Array<any>>((acc, variant) => {
    variant.option_values.forEach(({ name, value }) => {
      // First, find or create a variant group matching the given name
      let existingGroupIndex = acc.findIndex((candidate) => candidate.name === name);
      if (existingGroupIndex === -1) {
        existingGroupIndex = acc.length;
        acc.push({ name, options: [] });
      }

      // Then create the option in the group if it doesn't exist
      if (!acc[existingGroupIndex].options.find((candidate) => candidate.description === value)) {
        acc[existingGroupIndex].options.push({ description: value });
      }
    });

    return acc;
  }, []);

  return {
    ...baseProduct,
    collect: {
      shipping: product.variants.some((variant) => variant.requires_shipping === true),
    },
    delivery: {
      enabled: {
        shipping_native_v1: product.variants.some((variant) => variant.requires_shipping === true),
      }
    },
    variant_groups: variantGroups
  };
}

async function saveProduct(product: RutterProduct, context: Context) {
  const productPayload = convertProduct(product);

  // Upload any images
  if (product.images?.length > 0){
    productPayload.assets = (await Promise.all(product.images.map(async (image) => (
      await context.api.post('v1/assets', {
        filename: image.src.substring(image.src.lastIndexOf('/') + 1),
        url: image.src,
      })).id)
    )).map(id => ({ id }));
  }

  // Save the product with the given payload
  const productResponse = await context.api.post('v1/products', productPayload);

  // We can stop if there are no variants (or one, which is converted into the product)
  if (product.variants.length <= 1) {
    return productResponse;
  }

  // Now we need to figure out what specific variants to save
  const variantPromises = product.variants.map((variant) => {
    // Figure out the specific options that need to be specified
    const options = variant.option_values.map(({ name, value }) => {
      const group = productResponse.variant_groups.find(({ name: candidateName }) => candidateName === name);
      return group.options.find(({ name: candidateName }) => candidateName === value).id;
    });

    // Deal with weird inventory data
    let inventory = variant.inventory?.total_count;
    if (typeof inventory !== 'number') {
      inventory = undefined;
    } else if (inventory < 0) {
      inventory = 0;
    }

    return context.api.post(`v1/products/${productResponse.id}/variants`, {
      sku: variant.sku,
      price: variant.price,
      inventory,
      options,
    })
  })

  // Let all those variants save
  await Promise.all(variantPromises);

  return productResponse;
}

export = handler;
