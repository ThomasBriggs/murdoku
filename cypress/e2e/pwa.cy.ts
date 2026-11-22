import { sel } from '../support/helpers';

interface Icon {
  src: string;
  sizes: string;
  purpose?: string;
}
interface Manifest {
  name: string;
  short_name: string;
  display: string;
  start_url: string;
  icons: Icon[];
}

describe('PWA: manifest and service worker', () => {
  it('serves a standalone manifest with 192, 512 and maskable icons that all load', () => {
    cy.request('/manifest.webmanifest').then((res) => {
      expect(res.status).to.eq(200);
      const m = res.body as Manifest;
      expect(m.name).to.eq('Murdoku');
      expect(m.short_name).to.eq('Murdoku');
      expect(m.display).to.eq('standalone');
      expect(m.start_url).to.eq('./');
      const sizes = m.icons.map((i) => i.sizes);
      expect(sizes).to.include('192x192');
      expect(sizes).to.include('512x512');
      expect(m.icons.some((i) => i.purpose === 'maskable')).to.eq(true);
      for (const icon of m.icons) {
        cy.request(`/${icon.src}`).its('status').should('eq', 200);
      }
    });
  });

  it('serves the service worker as JavaScript, precaching the worker chunk', () => {
    cy.request('/sw.js').then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers['content-type']).to.match(/javascript/);
      expect(res.body as string).to.contain('precacheAndRoute');
      expect(res.body as string).to.match(/engine\.worker/);
    });
  });

  it('links the manifest and the apple touch icon from the page', () => {
    cy.visit('/?seed=cy-pwa&d=easy');
    cy.get('link[rel="manifest"]').should('have.attr', 'href').and('match', /manifest\.webmanifest/);
    cy.get('link[rel="apple-touch-icon"]').should('have.attr', 'href');
    cy.get('meta[name="apple-mobile-web-app-title"]').should('have.attr', 'content', 'Murdoku');
    cy.get(sel('board')).should('be.visible');
  });
});
