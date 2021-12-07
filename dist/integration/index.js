/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 430:
/***/ (function(module) {


var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// List of platforms that are supported by Rutter's categories API. Notable exceptions:
// - Shopify. They have collections, but not categories.
const categoriesSupport = [];
const handler = (request, context) => __awaiter(void 0, void 0, void 0, function* () {
    if (request.body.event !== 'integrations.ready') {
        return;
    }
    const integration = yield context.integration();
    // @ts-ignore
    const platform = integration.template.code;
    const promises = [];
    const syncedItems = {
        products: [],
        categories: [],
    };
    const gotConfig = yield getConfig(context);
    const storeData = yield context.got('store', gotConfig).json();
    // Initial save products
    // Try making a call to the API to receive the products data
    const productData = (yield context.got('products', gotConfig)).body;
    if (productData.products) {
        productData.products.map((product) => {
            promises.push(saveProduct(product, context));
            // Add item to synced list
            syncedItems.products.push(product);
        });
    }
    // Initial save categories
    if (categoriesSupport.includes(platform)) {
        // Try making a call to the API to receive the categories data
        // TODO Add category support
    }
    const checProducts = yield Promise.all(promises);
    return {
        statusCode: 201,
        body: JSON.stringify({
            message: 'Shopify sync completed!',
            product_count: promises.length,
            product_ids: checProducts.map(({ id }) => id),
        }),
    };
});
function getConfig(context) {
    return __awaiter(this, void 0, void 0, function* () {
        const baseUrl = 'https://production.rutterapi.com';
        const integration = yield context.integration();
        // Retrieve the access token from Rutter
        const res = yield context.got(`${baseUrl}/item/public_token/exchange`, {
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
    });
}
function convertProduct(product) {
    var _a, _b, _c, _d, _e, _f;
    const baseProduct = {
        // Single product
        product: {
            name: product.name,
            description: (product === null || product === void 0 ? void 0 : product.description) || null,
            price: 0,
            active: product.status === 'active',
        },
        assets: [],
    };
    if (product.variants.length === 1) {
        return Object.assign(Object.assign({}, baseProduct), { product: Object.assign(Object.assign({}, baseProduct.product), { sku: ((_a = product.variants[0]) === null || _a === void 0 ? void 0 : _a.sku) || null, price: ((_b = product.variants[0]) === null || _b === void 0 ? void 0 : _b.price) || 0, quantity: ((_d = (_c = product.variants[0]) === null || _c === void 0 ? void 0 : _c.inventory) === null || _d === void 0 ? void 0 : _d.total_count) || null }), collect: {
                shipping: (_e = product.variants[0]) === null || _e === void 0 ? void 0 : _e.requires_shipping,
            }, delivery: {
                enabled: {
                    shipping_native_v1: (_f = product === null || product === void 0 ? void 0 : product.variants[0]) === null || _f === void 0 ? void 0 : _f.requires_shipping,
                }
            } });
    }
    // Has variants. We need go through each variant and build up the groups and options that should be created on the
    // product
    // TODO use Commerce.js types here when they're available
    const variantGroups = product.variants.reduce((acc, variant) => {
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
    return Object.assign(Object.assign({}, baseProduct), { collect: {
            shipping: product.variants.some((variant) => variant.requires_shipping === true),
        }, delivery: {
            enabled: {
                shipping_native_v1: product.variants.some((variant) => variant.requires_shipping === true),
            }
        }, variant_groups: variantGroups });
}
function saveProduct(product, context) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const productPayload = convertProduct(product);
        // Upload any images
        if (((_a = product.images) === null || _a === void 0 ? void 0 : _a.length) > 0) {
            productPayload.assets = (yield Promise.all(product.images.map((image) => __awaiter(this, void 0, void 0, function* () {
                return (yield context.api.post('v1/assets', {
                    filename: image.src.substring(image.src.lastIndexOf('/') + 1),
                    url: image.src,
                })).id;
            })))).map(id => ({ id }));
        }
        // Save the product with the given payload
        const productResponse = yield context.api.post('v1/products', productPayload);
        // We can stop if there are no variants (or one, which is converted into the product)
        if (product.variants.length <= 1) {
            return productResponse;
        }
        // Now we need to figure out what specific variants to save
        const variantPromises = product.variants.map((variant) => {
            var _a;
            // Figure out the specific options that need to be specified
            const options = variant.option_values.map(({ name, value }) => {
                const group = productResponse.variant_groups.find(({ name: candidateName }) => candidateName === name);
                return group.options.find(({ name: candidateName }) => candidateName === value).id;
            });
            // Deal with weird inventory data
            let inventory = (_a = variant.inventory) === null || _a === void 0 ? void 0 : _a.total_count;
            if (typeof inventory !== 'number') {
                inventory = undefined;
            }
            else if (inventory < 0) {
                inventory = 0;
            }
            return context.api.post(`v1/products/${productResponse.id}/variants`, {
                sku: variant.sku,
                price: variant.price,
                inventory,
                options,
            });
        });
        // Let all those variants save
        yield Promise.all(variantPromises);
        return productResponse;
    });
}
module.exports = handler;


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId].call(module.exports, module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __nccwpck_require__(430);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;