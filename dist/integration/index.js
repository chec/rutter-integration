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
;
;
const handler = (request, context) => __awaiter(void 0, void 0, void 0, function* () {
    // Integrations are run by events, usually from a webhook. The event that triggered this action is available within
    // the body of the request
    switch (request.body.event) {
        case 'integrations.ready':
            try {
                // Perform work on the first run of an integration - eg. setting up with an external service for the first time
                const baseUrl = 'https://production.rutterapi.com';
                const config = yield getConfig(baseUrl, context);
                let promises = [];
                let syncedItems = {
                    products: [],
                    categories: [],
                };
                const storeData = yield context.got('store', config).json();
                //  Initial save products
                // Try making a call to the API to recieve the products data
                const productData = yield context.got('products', config).json();
                if ('products' in productData) {
                    productData.products.map((product) => {
                        promises.push(saveProduct(product, context));
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
                yield Promise.all(promises);
                return {
                    statusCode: 201,
                    body: JSON.stringify(Object.assign({ message: 'Shopify sync completed!', store: storeData }, syncedItems)),
                };
            }
            catch (error) {
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
});
function getConfig(baseUrl, context) {
    return __awaiter(this, void 0, void 0, function* () {
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
            searchParams: {
                access_token: res.access_token,
            },
            username: process.env.RUTTER_CLIENT_ID,
            password: process.env.RUTTER_SECRET_ID,
            prefixUrl: baseUrl,
        };
    });
}
function sanitizeProduct(product) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (product.variants.length > 1) {
        // Has variants
        const variant_groups_names = product.variants[0].option_values.map((option) => option.name);
        ;
        return {
            product: {
                name: product.name,
                description: (product === null || product === void 0 ? void 0 : product.description) || null,
                sku: null,
                price: ((_a = product.variants[0]) === null || _a === void 0 ? void 0 : _a.price) || 0,
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
                options: product.variants.map((variant) => variant.option_values.filter((option) => option.name === group)
                    .map((option) => ({
                    description: option.value,
                    price: variant.price,
                    quantity: variant.inventory.total_count
                }))
                    .reduce((pre, cur) => pre.concat(cur)))
            })),
        };
    }
    return {
        // Single product
        product: {
            name: product.name,
            description: (product === null || product === void 0 ? void 0 : product.description) || null,
            sku: ((_b = product.variants[0]) === null || _b === void 0 ? void 0 : _b.sku) || null,
            price: ((_c = product.variants[0]) === null || _c === void 0 ? void 0 : _c.price) || 0,
            active: product.status === 'active',
            quantity: ((_e = (_d = product.variants[0]) === null || _d === void 0 ? void 0 : _d.inventory) === null || _e === void 0 ? void 0 : _e.total_count) || null,
        },
        collect: {
            shipping: (_f = product.variants[0]) === null || _f === void 0 ? void 0 : _f.requires_shipping,
        },
        delivery: {
            enabled: {
                shipping_native_v1: (_g = product === null || product === void 0 ? void 0 : product.variants[0]) === null || _g === void 0 ? void 0 : _g.requires_shipping,
            }
        },
        updated: product.updated_at,
        assets: [],
    };
}
function saveProduct(product, context) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const payload = sanitizeProduct(product);
        // console.log(JSON.stringify(payload));
        // return;
        if (((_a = product.images) === null || _a === void 0 ? void 0 : _a.length) > 0) {
            yield Promise.all(product.images.map((image) => __awaiter(this, void 0, void 0, function* () {
                const data = yield context.api.post('v1/assets', {
                    filename: image.src.substring(image.src.lastIndexOf('/') + 1),
                    url: image.src,
                });
                payload.assets.push({
                    id: data.id
                });
            })));
        }
        return context.api.post('v1/products', payload);
    });
}
function saveCategory(category, context) {
    const payload = {
        name: category.name,
    };
    return context.api.post('v1/categories', payload);
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