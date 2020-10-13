# Markeaze JS Client for Shopify Stores

Common script to integrate Shopify Store with [Markeaze marketing platform](https://markeaze.com).

When a Shopify store installs Markeaze app it creates a StriptTag in Shopify store that point to this script. This script contains some common bindings to Shopify JavaScript SDK to allow Markeaze to track on-site events properly.

## Integration with Shopify

You have nothing to do with it, this script is automatically loaded by Shopify when you install a Markeaze app. Script should be accessed by the following permanent links depending on the app environment:

Production environment:
```
https://cdn.jsdelivr.net/gh/markeaze/markeaze-js-shopify-client@latest/dist/client.js?app_key=<account_app_key>
```

Dev environment (from branch `dev`, unstable!):
```
https://cdn.jsdelivr.net/gh/markeaze/markeaze-js-shopify-client@dev/dist/client.js?app_key=<account_app_key>
```

### Builing client for different environments

**Staging / development:**

```
$ NODE_ENV=staging npm run build
```

**Production:**

```
$ NODE_ENV=production npm run build
```

### Development workflow

- make changes;
- run `NODE_ENV=staging npm run build` and commit to `dev` branch;
- test changes in staging environment;
- merge branch `dev` into `master`;
- run `NODE_ENV=production npm run build` and commit to `master` branch;
- publish a new release;
- purge CDN cache.