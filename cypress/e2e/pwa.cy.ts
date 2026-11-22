import { checkA11y, openHeaderMenu, sel, setTheme } from '../support/helpers';

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
    cy.get('link[rel="manifest"]')
      .should('have.attr', 'href')
      .and('match', /manifest\.webmanifest/);
    cy.get('link[rel="apple-touch-icon"]').should('have.attr', 'href');
    cy.get('meta[name="apple-mobile-web-app-title"]').should('have.attr', 'content', 'Murdoku');
    cy.get(sel('board')).should('be.visible');
  });
});

interface PwaWindow extends Window {
  __murdokuShowUpdate?: () => void;
}

describe('PWA: update banner', () => {
  const show = () => cy.window().then((win) => (win as PwaWindow).__murdokuShowUpdate?.());

  const load = () => {
    cy.visit('/?seed=cy-pwa&d=easy');
    cy.get(sel('board')).should('be.visible');
  };

  it('is hidden by default, appears non-modally, and Later hides it', () => {
    load();
    cy.get(sel('update-banner')).should('not.exist');
    show();
    cy.get(sel('update-banner'))
      .should('be.visible')
      .and('have.attr', 'role', 'status')
      .and('contain.text', 'A new version of Murdoku is available.');
    // Still playable underneath.
    cy.get(sel('cell-0-0')).should('be.visible');
    cy.get(sel('update-dismiss')).click();
    cy.get(sel('update-banner')).should('not.exist');
  });

  for (const theme of ['light', 'dark'] as const)
    for (const [w, h] of [
      [1280, 900],
      [375, 740],
    ] as const)
      it(`has no accessibility violations (${theme}, ${w}x${h})`, () => {
        cy.viewport(w, h);
        load();
        setTheme(theme);
        show();
        cy.get(sel('update-banner')).should('be.visible');
        checkA11y();
      });
});

describe('PWA: install item', () => {
  for (const [name, w, h] of [
    ['desktop', 1280, 900],
    ['phone', 375, 740],
  ] as const)
    it(`appears only after beforeinstallprompt and calls prompt (${name})`, () => {
      cy.viewport(w, h);
      cy.visit('/?seed=cy-pwa&d=easy');
      cy.get(sel('board')).should('be.visible');
      openHeaderMenu();
      cy.get(sel('install-button')).should('not.exist');
      cy.window().then((win) => {
        const prompt = cy.stub().resolves();
        cy.wrap(prompt).as('prompt');
        const e = new win.Event('beforeinstallprompt', { cancelable: true });
        Object.assign(e, { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });
        win.dispatchEvent(e);
        expect(e.defaultPrevented).to.eq(true);
      });
      cy.get(sel('install-button')).should('be.visible').click();
      cy.get('@prompt').should('have.been.calledOnce');
      cy.get(sel('install-button')).should('not.exist');
    });
});
