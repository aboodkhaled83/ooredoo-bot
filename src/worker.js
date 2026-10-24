import { onRequestPost } from '../functions/api/chat.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/chat') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      return onRequestPost({ request, env });
    }
    return env.ASSETS.fetch(request);
  }
};
