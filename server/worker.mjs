import { handleRequest } from './api.mjs';

// Workers does not discover Pages' functions/ directory. Route API requests
// explicitly so registrations and admin auth reach the shared backend.
export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return handleRequest(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
