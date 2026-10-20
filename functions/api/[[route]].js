import { handleRequest } from '../../server/api.mjs';
export const onRequest = ({ request, env }) => handleRequest(request, env);
