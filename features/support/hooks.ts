import { Before, After, BeforeAll, AfterAll, Status } from '@cucumber/cucumber';
import { chromium, Browser } from '@playwright/test';
import { spawn, ChildProcess } from 'node:child_process';
import { CustomWorld } from './world';

// Shared browser instance for all scenarios (faster than launching per scenario)
let browser: Browser;
let serverProcess: ChildProcess | null = null;

export const BASE_URL = process.env.BASE_URL || 'http://localhost:5173/pvc-trades/';

async function waitForServer(url: string, timeout = 30_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            const response = await fetch(url.replace(/\/$/, ''));
            if (response.ok) {
                return;
            }
        } catch {
            // Server not ready yet
        }
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error(`Server failed to start at ${url} within ${timeout}ms`);
}

async function startServer(): Promise<ChildProcess> {
    // Check if server is already running
    try {
        const response = await fetch(BASE_URL.replace(/\/$/, ''));
        if (response.ok) {
            console.log('Server already running');
            return null as unknown as ChildProcess;
        }
    } catch {
        // Server not running, start it
    }

    console.log('Starting dev server...');
    const proc = spawn('npm', ['run', 'dev'], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
    });

    proc.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Local:')) {
            console.log('Server started');
        }
    });

    proc.stderr?.on('data', (data) => {
        console.error('Server error:', data.toString());
    });

    await waitForServer(BASE_URL);
    return proc;
}

BeforeAll(async function () {
    // Start server if not running
    serverProcess = await startServer();
    
    // Launch browser once for all tests
    browser = await chromium.launch({ 
        headless: process.env.HEADED !== 'true'
    });
});

AfterAll(async function () {
    if (browser) {
        await browser.close();
    }
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
    }
});

Before(async function (this: CustomWorld) {
    this.browser = browser;
    this.context = await browser.newContext();
    this.page = await this.context.newPage();
    this.tileRequests = [];
    
    // Disable animations for faster, more stable tests
    // This sets both the JS flag and CSS attribute before any page loads
    await this.page.addInitScript(() => {
        // JS flag checked by shouldDisableAnimations() in types.ts
        (globalThis as unknown as { __animationsDisabled?: boolean }).__animationsDisabled = true;
        // CSS attribute checked by [data-animations-disabled] rules in styles.css
        document.documentElement.dataset.animationsDisabled = 'true';
        
        // Patch Leaflet's flyTo to use setView when animations are disabled
        // This avoids buggy flyTo behavior with duration 0
        const patchLeafletFlyTo = () => {
            const L = (globalThis as unknown as { L?: { Map?: { prototype: { flyTo?: unknown; setView?: unknown } } } }).L;
            if (!L?.Map?.prototype?.flyTo) { return; }
            L.Map.prototype.flyTo = function(this: unknown, latlng: unknown, zoom?: number, _options?: unknown) {
                // When animations disabled, use setView which is more reliable
                const setView = (this as { setView: (latlng: unknown, zoom?: number, options?: { animate: boolean }) => unknown }).setView;
                return setView.call(this, latlng, zoom, { animate: false });
            };
        };
        // Patch after Leaflet loads
        if ((globalThis as unknown as { L?: unknown }).L) {
            patchLeafletFlyTo();
        } else {
            // Wait for Leaflet to load, then patch
            Object.defineProperty(globalThis, 'L', {
                configurable: true,
                set(value) {
                    Object.defineProperty(globalThis, 'L', { value, writable: true, configurable: true });
                    setTimeout(patchLeafletFlyTo, 0);
                }
            });
        }
    });
    
    // Track tile requests for debugging
    this.page.on('request', request => {
        if (request.url().includes('/tiles/') && request.url().endsWith('.png')) {
            const world = request.url().includes('/the_nether/') ? 'nether' : 'overworld';
            this.tileRequests.push(`${world}:${request.url()}`);
        }
    });
});

After(async function (this: CustomWorld, scenario) {
    // Take screenshot on failure for debugging
    if (scenario.result?.status === Status.FAILED && this.page) {
        const screenshot = await this.page.screenshot();
        this.attach(screenshot, 'image/png');
    }
    
    // Close context (releases resources)
    if (this.context) {
        await this.context.close();
    }
});
