export interface ConfigurationType {
  // Tokens overview: https://docs.rutterapi.com/reference/tokens-endpoints
  // The public token is created once a merchant has authorized Rutter with their eCommerce platform. This is traded for
  // an "access token" to communicate with Rutter
  publicToken: string
}
