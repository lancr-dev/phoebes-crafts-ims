import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
after(() => vite.close());
const { default: Navbar } = await vite.ssrLoadModule('/src/components/Navbar.jsx');
const { default: Sidebar } = await vite.ssrLoadModule('/src/components/Sidebar.jsx');
const { default: MobileNavigation } = await vite.ssrLoadModule('/src/components/MobileNavigation.jsx');
const { default: AppLayout } = await vite.ssrLoadModule('/src/components/AppLayout.jsx');
const { default: AuthContext } = await vite.ssrLoadModule('/src/auth/AuthContext.js');

const render = (component, props) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/inventory'] }, createElement(component, props)));

test('navbar exposes a named dialog trigger with accurate expanded state and no page links', () => {
  const props = { username: 'admin', navigationId: 'mobile-sidebar', onOpenNavigation: () => {} };
  const closed = render(Navbar, props);
  assert.match(closed, /type="button" aria-label="Open navigation menu"/);
  assert.match(closed, /aria-expanded="false" aria-controls="mobile-sidebar" aria-haspopup="dialog"/);
  assert.match(closed, /admin/);
  assert.doesNotMatch(closed, /href="\/(dashboard|inventory|logs)"/);
  assert.match(render(Navbar, { ...props, isNavigationOpen: true }), /aria-expanded="true"/);
});

test('mobile navigation starts closed and contains all page links, active state, close, and sign-out', () => {
  const markup = render(MobileNavigation, { id: 'mobile-sidebar', isOpen: false, onClose: () => {}, onSignOut: () => {} });
  assert.match(markup, /<dialog id="mobile-sidebar" class="mobile-navigation" aria-label="Navigation menu" aria-modal="true">/);
  assert.doesNotMatch(markup, /<dialog[^>]*\bopen(?:=""|\s|>)/);
  for (const path of ['dashboard', 'inventory', 'logs']) assert.match(markup, new RegExp(`href="/${path}"`));
  assert.match(markup, /aria-current="page"/);
  assert.match(markup, /aria-label="Close navigation menu"/);
  assert.match(markup, />Sign out<\/button>/);
});

test('mobile sign-out preserves cooldown and pending states while close stays usable', () => {
  const limited = render(Sidebar, { isMobile: true, isSignOutDisabled: true });
  assert.match(limited, /class="sidebar-sign-out"[^>]*disabled=""/);
  assert.match(limited, />Sign out<\/button>/);
  assert.doesNotMatch(limited, /class="sidebar-close-button"[^>]*disabled/);
  const pending = render(Sidebar, { isMobile: true, isSigningOut: true });
  assert.match(pending, /class="sidebar-sign-out"[^>]*disabled=""/);
  assert.match(pending, /Signing out/);
  assert.doesNotMatch(render(Sidebar, {}), /Close navigation menu/);
  const failed = render(Sidebar, { isMobile: true, signOutError: 'Could not sign out. Try again.' });
  assert.match(failed, /role="alert">Could not sign out/);
  assert.doesNotMatch(failed, /class="sidebar-sign-out"[^>]*disabled/);
});

test('app layout connects the hamburger to an existing closed navigation dialog', () => {
  const auth = { admin: { username: 'admin' }, signOut: async () => {} };
  const markup = renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(AuthContext.Provider, { value: auth }, createElement(AppLayout))));
  const id = markup.match(/aria-controls="([^"]+)"/)[1];
  assert.ok(markup.includes(`<dialog id="${id}"`));
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /<main[^>]*id="main-content" tabindex="-1"/);
});
