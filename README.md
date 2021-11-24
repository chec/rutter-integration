# Rutter integration

The "Rutter" integration is the source code for several integration templates that connect Commerce.js with other
eCommerce providers. Rutter is a product that abstracts the different APIs and authentication methods of other eCommerce
solutions into one API. Individual templates are created for each eCommerce provider so that Merchants don't need to be
familiar with Rutter when selecting an integration, and so that support for eCommerce services can be released while any
required agreements are established.

## Configuration

During configuration, the merchant will need to grant access for Rutter to connect to their eCommerce provider. The
configuration app utilises Rutter's "Link" API for this: https://docs.rutterapi.com/docs/introduction

## Integration

When created, the integration will sync products from the eCommerce provider into Chec, and establish a webhook so that
further changes to products are reflected in the Chec Dashboard.

## Integration template

This repo was bootstrapped from the Chec integration template https://github.com/chec/integration-template
