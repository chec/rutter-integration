import { VercelRequest, VercelResponse } from '@vercel/node';
import { RutterTokenResponse } from '../rutter-types';

require('isomorphic-fetch');

export default async (request: VercelRequest, response: VercelResponse) => {
  const { publicToken } = request.query;

  let token: RutterTokenResponse;
  try {
    token = await fetch('https://production.rutterapi.com/item/public_token/exchange', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.RUTTER_CLIENT_ID,
        secret: process.env.RUTTER_SECRET,
        public_token: publicToken,
      })
    }).then((response) => {
      if (response.status !== 200) {
        throw new Error('Missing connection');
      }
      return response.json()
    });
  } catch (error) {
    response.status(200).send({
      connected: false,
      ready: false,
      id: null,
    });
    return;
  }

  response.status(200).send({
    connected: true,
    ready: token.is_ready,
    id: token.connection_id,
  });
}
