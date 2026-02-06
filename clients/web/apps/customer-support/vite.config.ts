import { createViteConfig } from '../../vite.config.base';

// Customer support portal - external customer-facing app
export default createViteConfig({
  basePath: '/customer-support/',
  port: 4016,
  sourcemap: true,
});
