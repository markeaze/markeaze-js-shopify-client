const config = require('./config')

class CartManager {
  static async getCurrentCartItems () {
    const cart = await this._getShopifyCart()
    return cart.items.map(item => { return CartManager.shopifyCartItemToMarkeazeCartItem(item) })
  }

  static async addVariantToCart (variantId, price, quantity = 1, callback = null) {
    // Take integer variant ID from string like this: 'gid://shopify/ProductVariant/36381754720417'
    if (typeof variantId === 'string' && variantId.includes('/')) {
      variantId = parseInt(variantId.split("/").pop())
    }

    const data = {
      items: [{
        id: variantId,
        quantity: quantity
      }]
    }

    fetch('/cart/add.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
    .then(response => {
      EventManager.trackCartAddItem(variantId, quantity, price)
      this.__updateCurrentCartItems()

      // TODO: change this to await from trackCartAddItem when our
      // tracker will support this.
      setTimeout(() => {
        callback();
      }, 200)
    })
    .catch((error) => {
      console.error('Error:', error);
    })
  }

  static shopifyCartItemToMarkeazeCartItem (item) {
    return {
      variant_id: 'gid://shopify/ProductVariant/' + item.variant_id,
      qnt: item.quantity,
      price: item.price / 100.0,
      name: item.title,
      url: window.location.origin + item.url,
      main_image_url: item.featured_image.url
    }
  }

  static compareAndUpdateCart (currentCartItems) {
    const prevCartItemsJSON = sessionStorage.getItem('mkz_cart_items') || JSON.stringify([])
    const currentCartItemsJSON = JSON.stringify(currentCartItems)

    // Update visitor session Cart
    sessionStorage.setItem('mkz_cart_items', currentCartItemsJSON)

    if (prevCartItemsJSON !== currentCartItemsJSON) {
      EventManager.trackCartUpdate(currentCartItems)
    }
  }

  static openCartPage () {
    window.location.href = '/cart';
  }

  // private

  static _getShopifyCart () {
    return fetch('/cart.js')
      .then(function(response) {
        return response.json()
      }).catch(function(err) {
        console.error('[Markeaze]', 'Failed to get current cart from Shopify:', err)
        return null
      })
  }

  static async __updateCurrentCartItems () {
    // Update current cart items in session storage to avoid `cart_update` event
    // after next page change.
    const currentCartItems = await this.getCurrentCartItems()
    sessionStorage.setItem('mkz_cart_items', JSON.stringify(currentCartItems))
  }
}

class EventManager {
  static async trackPageView () {
    const eventPayload = {}
    const meta = PageManager.getPageMeta()

    if (meta.page.pageType == 'searchresults') {
      eventPayload.term = this._getQueryStringValue('q')
      if (eventPayload.term != '') {
        mkz('trackSearch', eventPayload)
      }

    } else {

      if (meta.page.pageType == 'product') {
        const currentResource = await PageManager.getCurrentResourceInfo()
        const selectedVariant = PageManager.getSelectedVariant(currentResource)

        eventPayload.offer = {
          variant_id: 'gid://shopify/ProductVariant/' + selectedVariant.id,
          name: currentResource.product.title,
          price: parseFloat(selectedVariant.price),
          url: selectedVariant.markeaze_offer_url
        }
      }

      if (meta.page.pageType == 'collection' && meta.page.resourceType == 'collection') {
        const currentResource = await PageManager.getCurrentResourceInfo()
        const collection = currentResource.collection

        eventPayload.category = {
          uid: 'gid://shopify/Collection/' + collection.id,
          name: collection.title
        }
      }

      mkz('trackPageView', eventPayload)
    }
  }

  static trackCartUpdate (items) {
    mkz('trackCartUpdate', {items: items})
  }

  static trackCartAddItem (variantId, quantity, price) {
    mkz('trackCartAddItem', {
      item: {
        variant_id: variantId,
        qnt: quantity,
        price: price
      }
    })
  }

  // private

  static _getQueryStringValue (key) {
    return decodeURIComponent(window.location.search.replace(new RegExp("^(?:.*[&\\?]" + encodeURIComponent(key).replace(/[\.\+\*]/g, "\\$&") + "(?:\\=([^&]*))?)?.*$", "i"), "$1"));
  }

}

class PageManager {

  static getSelectedVariant (currentResource) {
    let selectedVariant
    const selectedVariantId = this._getSelectedVariantId(meta.page)

    // This means that a Product has no Variants (e.g. only one default Variant)
    if (selectedVariantId === null) {
      selectedVariant = currentResource.product.variants[0]
      selectedVariant.markeaze_offer_url = this._getCanonicalUrl()
    } else {
      selectedVariant = this._getProductVariantInfo(currentResource.product.variants, selectedVariantId)
      selectedVariant.markeaze_offer_url = IntegrationManager.setQueryParam(this._getCanonicalUrl(), 'variant', selectedVariantId)
    }

    return selectedVariant
  }

  static getPageMeta () {
    return window.ShopifyAnalytics.meta
  }

  static getCurrentResourceInfo () {
    return fetch(window.location.pathname + '.json')
      .then(function(response) {
        return response.json()
      }).catch(function(err) {
        console.error('[Markeaze]', 'Failed to get current resource info from Shopify:', err)
        return null
      })
  }

  // private

  static _getSelectedVariantId (page_meta) {
    return page_meta.selectedVariantId || IntegrationManager.getQueryParam(window.location.href, 'variant')
  }

  static _getProductVariantInfo (variants, variantId) {
    return variants.find( v => v.id == parseInt(variantId) )
  }

  static _getCanonicalUrl () {
    // 1. Try to get 'og:url' tag content
    const metaTags  = document.getElementsByTagName('meta')
    for (let i = 0; i < metaTags.length; i++) {
      if (metaTags[i].getAttribute('property') === 'og:url') {
        return metaTags[i].getAttribute('content')
      }
    }

    // 2. Fallback to link rel='canonical'
    const linkTags  = document.getElementsByTagName('link')
    for (let i = 0; i < linkTags.length; i++) {
      if (linkTags[i].getAttribute('rel') === 'canonical') {
        return linkTags[i].getAttribute('href')
      }
    }

    // 3. Fallback to current location
    return window.location.href
  }
}

class IntegrationManager {

  static init () {

    // Markeaze won't work in very old browsers
    if (!window.sessionStorage) return

    // Get Markeaze Account App Key from current script src
    if (typeof document.currentScript !== 'undefined') {
      const src = document.currentScript.src
    } else {
      // Hack for IE11
      const scripts = document.getElementsByTagName('script')
      const src = scripts[scripts.length - 1].src
    }

    const appKey = this.getQueryParam(src, 'app_key')

    if (typeof appKey === 'undefined') {
      console.error('[Markeaze]', 'Could not be initialized: no `app_key` param found in query URL for current script.')
      return
    }

    this._createMarkeazePixel()
    window.ShopifyAnalytics.lib.ready(() => {
      this._loadMarkeazeJSTracker(this._initMarkeazePixel(appKey))
      this._initWatchURL()
    })
  }

  static _addXMLRequestCallback (callback) {
    let oldSend, i;
    if ( XMLHttpRequest.callbacks ) {
      XMLHttpRequest.callbacks.push( callback );
    } else {
      XMLHttpRequest.callbacks = [callback];
      oldSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function() {
        oldSend.apply(this, arguments);
        this.onreadystatechange = function ( progress ) {
          for ( i = 0; i < XMLHttpRequest.callbacks.length; i++ ) {
            XMLHttpRequest.callbacks[i]( progress );
          }
        };
      }
    }
  }

  static getQueryParam (url, name) {
    const urlParams = (new URL(url)).searchParams
    return urlParams.get(name)
  }

  static setQueryParam (url, name, value) {
    const urlObj = (new URL(url))
    urlObj.searchParams.set(name, value)
    return urlObj.toString()
  }

  // private

  // Load external script with callback
  static _loadMarkeazeJSTracker (callback) {
    const script = document.createElement('script')
    script.setAttribute('src', config.scriptUrl)
    script.setAttribute('type', 'text/javascript')
    script.charset = 'utf-8'
    script.async = true

    script.onreadystatechange = script.onload = callback
    document.body.appendChild(script)
  }

  static _createMarkeazePixel () {
    (function(w,d,c,h) {
      w[c] = w[c] || function() {
          (w[c].q = w[c].q || []
        ).push(arguments)
      }
    })(window, document, 'mkz')
  }

  static async _initMarkeazePixel (appKey) {
    if (config.debug) mkz('debug', true)

    // Set `mkz` cookie if not present as Shopify's customer uniq token
    mkz('setDeviceUid', ShopifyAnalytics.lib.user().traits().uniqToken, false)

    // If a Customer is logged in - set their ID
    const meta = PageManager.getPageMeta()
    if (typeof meta.page.customerId !== 'undefined') {
      mkz('setVisitorInfo', {
        client_id: meta.page.customerId
      })
    }

    // Init Markeaze JS
    mkz('appKey', appKey)

    // Check cart updates initially on page load
    const currentCartItems = await CartManager.getCurrentCartItems()
    CartManager.compareAndUpdateCart(currentCartItems)

    if (typeof window.$ !== 'undefined') {
      $.ajaxSetup({
        success: (response) => {
          if (typeof response.items !== 'undefined') {
            const newCartItems = response.items.map(item => {
              return CartManager.shopifyCartItemToMarkeazeCartItem(item)
            })

            CartManager.compareAndUpdateCart(newCartItems)
          }
        }
      })
    }
  }

  static _initWatchURL () {
    mkz('watch', 'url.change', () => {
      EventManager.trackPageView()
    })
  }
}

window.mkzCartManager = CartManager
IntegrationManager.init()
