/**
 * Accessibility testing step definitions using axe-core
 * 
 * Runs automated WCAG 2.1 AA compliance checks against the current page state.
 * Uses @axe-core/playwright for Playwright-native integration.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { Then } from './fixtures';

/**
 * Axe rule IDs to exclude from checks.
 * Document exclusions with reasoning to keep the list intentional.
 */
const EXCLUDED_RULES: string[] = [
    // color-contrast can false-positive on Minecraft-themed dark UIs
    // where contrast is intentionally stylized for the game aesthetic
    'color-contrast',
];

Then('the page should have no accessibility violations', async ({ page }) => {
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .disableRules(EXCLUDED_RULES)
        .analyze();

    // Build a readable failure message listing each violation
    const violations = results.violations.map((v) => {
        const nodes = v.nodes.map((n) => `  - ${n.html}`).join('\n');
        return `[${v.impact}] ${v.id}: ${v.description}\n${nodes}`;
    });

    expect(
        results.violations,
        `Accessibility violations found:\n${violations.join('\n\n')}`,
    ).toHaveLength(0);
});
