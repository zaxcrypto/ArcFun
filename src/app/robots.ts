import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: 'https://www.thearcfun.xyz/sitemap.xml',
    host: 'https://www.thearcfun.xyz',
  };
}
