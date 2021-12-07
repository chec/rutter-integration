import { Context, IntegrationHandler } from '@chec/integration-handler';
import { ConfigurationType } from '../configuration-type';
import { OptionsOfJSONResponseBody } from 'got';

interface RutterProduct {
  id: string
  platform_id: string
  type: string
  name: string
  description: string
  images: Array<RutterImage>
  status: 'active' | 'archived' | 'inactive' | 'draft'
  variants: Array<RutterVariant>
  tags: Array<string>
  product_url: string
}

interface RutterVariant {
  id: string
  product_id: string
  barcode: string|null
  title: string
  price: number
  sku: string
  option_values: Array<{ name: string, value: string }>
  requires_shipping: boolean
  inventory?: { total_count: number, locations: null|Array<any> }
}

interface RutterImage {
  src: string
}

interface RutterCategory {
  name: string,
}

interface RutterProductResponse {
  products: Array<RutterProduct>
  next_cursor: string|null
}

// List of platforms that are supported by Rutter's categories API. Notable exceptions:
// - Shopify. They have collections, but not categories.
const categoriesSupport = [];

const handler: IntegrationHandler<ConfigurationType> = async (request, context) => {
  if (request.body.event !== 'integrations.ready') {
    return {
      statusCode: 422,
      body: 'This integration only supports the "integrations.ready" event',
    };
  }

  const integration = await context.integration();
  // @ts-ignore
  const platform = integration.template.code;

  const promises = [];
  const syncedItems = {
    products: [],
    categories: [],
  };

  const gotConfig = await getConfig(context);

  // Sync products using a do..while for handling cursor pagination
  let products = [];
  let cursor: string|null = null;
  do {
    const cursorParam = cursor ? `?cursor=${cursor}` : '';

    // Super ugly object destructuring assignment here. The RHS of this statement is a RutterProductResponse
    ({ products, next_cursor: cursor } = (
      await context.got<RutterProductResponse>(`products${cursorParam}`, gotConfig)
    ).body);

    if (!products) {
      break;
    }

    products.map((product) => {
      promises.push(
        saveProduct(product, context, platform)
      );
      // Add item to synced list
      syncedItems.products.push(product);
    });
  } while (cursor && products && products.length !== 0);


  // Initial save categories
  if (categoriesSupport.includes(platform)) {
    // Try making a call to the API to receive the categories data
    // TODO Add category support
  }

  const checProducts = await Promise.all(promises);

  return {
    statusCode: 201,
    body: JSON.stringify({
      message: 'Shopify sync completed!',
      product_count: promises.length,
      product_ids: checProducts.map(({ id }) => id),
    }),
  };
};


async function getConfig(context: Context): Promise<OptionsOfJSONResponseBody> {
  const baseUrl = 'https://production.rutterapi.com';
  const integration = await context.integration();
  // Retrieve the access token from Rutter
  const res: any = await context.got(`${baseUrl}/item/public_token/exchange`, {
    json: {
      client_id: process.env.RUTTER_CLIENT_ID,
      secret: process.env.RUTTER_SECRET_ID,
      public_token: integration.config.publicToken
    },
    method: 'post',
  }).json();

  return {
    responseType: 'json',
    searchParams: {
      access_token: res.access_token,
    },
    username: process.env.RUTTER_CLIENT_ID,
    password: process.env.RUTTER_SECRET_ID,
    prefixUrl: baseUrl,
  };
}

function convertProduct(product: RutterProduct, platform: string) {
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
        meta: {
          [`${platform}_id`]: product.platform_id,
          integration_id: product.id,
        }
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

async function saveProduct(product: RutterProduct, context: Context, platform: string) {
  const productPayload = convertProduct(product, platform);

  // Upload any images
  if (product.images?.length > 0){
    productPayload.assets = (await Promise.all(product.images.map(async (image) => (
      await context.api.post('v1/assets', {
        filename: image.src.substring(image.src.lastIndexOf('/') + 1),
        url: image.src,
        // @ts-ignore
      })).id)
    )).map(id => ({ id }));
  }

  // Save the product with the given payload
  const productResponse: any = await context.api.post('v1/products', productPayload);

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
