export interface RutterProduct {
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

export interface RutterVariant {
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

export interface RutterImage {
  src: string
}

export interface RutterProductResponse {
  products: Array<RutterProduct>
  next_cursor: string|null
}

export interface RutterTokenResponse {
  access_token: string
  connection_id: string
  request_id: string
  store_unique_name: string
  is_ready: boolean
  platform: string
}
