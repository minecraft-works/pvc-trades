/**
 * DOM rendering with lit-html templates.
 *
 * Values interpolated into an `html` template are inserted as text or
 * attribute values, never parsed as markup, so names from the shop feed
 * cannot inject HTML. Use these helpers instead of assigning `innerHTML`.
 *
 * @module rendering/render
 */

import { render, type TemplateResult } from 'lit-html';

/**
 * Replace an element's content with a rendered template.
 *
 * Behaves like assigning `innerHTML`: the template is rendered into a fresh
 * fragment every time instead of being diffed into the element. lit's own
 * `render(template, element)` keeps state on the element, which goes stale
 * when other code (a virtual list, `replaceChildren()`) also changes its
 * children.
 * @param container - Element whose children are replaced
 * @param template - Template to render
 */
export function replaceContent(container: Element, template: TemplateResult): void {
    const fragment = document.createDocumentFragment();
    render(template, fragment);
    container.replaceChildren(fragment);
}

/**
 * Render a template into a new span, for APIs that take an element rather
 * than markup (Leaflet icons and tooltips). A span keeps inline content inline.
 * @param template - Template to render
 * @returns The span with the rendered template inside
 */
export function renderToElement(template: TemplateResult): HTMLElement {
    const element = document.createElement('span');
    render(template, element);
    return element;
}
