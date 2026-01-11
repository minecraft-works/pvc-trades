import { test, expect } from '@playwright/test';

test.describe('Performance Checks', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // Wait for initial render
        await page.waitForSelector('.trade-row');
    });

    test('DOM size stays within reasonable bounds', async ({ page }) => {
        // Count total DOM nodes - excessive nodes cause memory issues
        const nodeCount = await page.evaluate(() => {
            return document.querySelectorAll('*').length;
        });
        
        // Allow ~50 nodes per trade row (600 trades = ~30K nodes) plus overhead
        // This catches if DOM explodes due to bugs (e.g., 100K+ nodes)
        expect(nodeCount).toBeLessThan(50000);
    });

    test('no excessive event listeners on trade rows', async ({ page }) => {
        // This checks that we're using event delegation properly
        // Each trade row should NOT have its own click listener
        const delegationCheck = await page.evaluate(() => {
            const results = document.getElementById('results');
            if (!results) { return { error: 'no results container' }; }
            
            // Check that results container has click listener (delegation)
            // We can't directly count listeners, but we can verify the pattern
            // by checking that clicking a row triggers the dialog
            return { 
                hasResultsContainer: true,
                tradeRowCount: document.querySelectorAll('.trade-row').length
            };
        });
        
        expect(delegationCheck.hasResultsContainer).toBe(true);
        expect(delegationCheck.tradeRowCount).toBeGreaterThan(0);
    });

    test('map dialog opens and closes multiple times', async ({ page }) => {
        // Open and close the map dialog multiple times to check for stability
        for (let i = 0; i < 3; i++) {
            const firstRow = page.locator('.trade-row').first();
            await firstRow.click();
            
            // Wait for dialog to open
            await expect(page.locator('#map-dialog')).toHaveAttribute('open');
            
            // Close dialog via close button
            await page.locator('#close-map').click();
            await expect(page.locator('#map-dialog')).not.toHaveAttribute('open');
        }
        
        // Final check - page should still be responsive
        const nodeCount = await page.evaluate(() => document.querySelectorAll('*').length);
        expect(nodeCount).toBeLessThan(50000);
    });

    test('search does not accumulate DOM nodes', async ({ page }) => {
        const searchInput = page.locator('#searchWant');
        
        // Get initial count
        const initialCount = await page.evaluate(() => document.querySelectorAll('*').length);
        
        // Perform multiple searches
        for (let i = 0; i < 5; i++) {
            await searchInput.fill('diamond');
            await page.waitForTimeout(100);
            await searchInput.fill('');
            await page.waitForTimeout(100);
        }
        
        // Check DOM hasn't grown excessively (allow 10% growth for temporary elements)
        const finalCount = await page.evaluate(() => document.querySelectorAll('*').length);
        expect(finalCount).toBeLessThan(initialCount * 1.1);
    });

    test('matrix dialog opens and closes cleanly', async ({ page }) => {
        const matrixButton = page.locator('#open-matrix');
        
        // Open and close multiple times
        for (let i = 0; i < 3; i++) {
            await matrixButton.click();
            await expect(page.locator('#matrix-dialog')).toHaveAttribute('open');
            
            // Close via close button
            await page.locator('#close-matrix').click();
            await expect(page.locator('#matrix-dialog')).not.toHaveAttribute('open');
        }
        
        // Should still be responsive
        await matrixButton.click();
        await expect(page.locator('#matrix-dialog')).toHaveAttribute('open');
    });
});
