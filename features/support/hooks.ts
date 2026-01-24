import { Before, After, BeforeAll, AfterAll } from '@cucumber/cucumber';
import { chromium, Browser } from '@playwright/test';
import { spawn, ChildProcess, exec } from 'child_process';
import { CustomWorld } from './world';

let browser: Browser;
let devServer: ChildProcess | null = null;

async function waitForServer(url: string, timeout = 30000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            const response = await fetch(url, { method: 'HEAD' });
            if (response.ok) {
                return true;
            }
        } catch {
            // Server not ready yet
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return false;
}

/**
 * Kill a process tree on Windows using taskkill, or SIGTERM on Unix
 * On Windows, shell:true spawns cmd.exe which doesn't forward SIGTERM to children
 */
function killProcessTree(proc: ChildProcess): Promise<void> {
    return new Promise((resolve) => {
        if (!proc.pid) {
            resolve();
            return;
        }
        
        if (process.platform === 'win32') {
            // Use taskkill with /T (tree) and /F (force) to kill all child processes
            exec(`taskkill /PID ${proc.pid} /T /F`, (err) => {
                if (err) {
                    // Process might already be dead, that's fine
                    console.log('[cucumber] taskkill error (process may already be dead):', err.message);
                }
                resolve();
            });
        } else {
            proc.kill('SIGTERM');
            resolve();
        }
    });
}

BeforeAll({ timeout: 60000 }, async function () {
    // Start dev server
    const baseUrl = process.env.BASE_URL || 'http://localhost:5174/pvc-trades/';
    
    // Check if server is already running (check the actual app URL, not just root)
    const serverAlreadyRunning = await waitForServer(baseUrl, 2000);
    
    if (!serverAlreadyRunning) {
        console.log('[cucumber] Starting dev server...');
        devServer = spawn('npm', ['run', 'dev'], {
            shell: true,
            stdio: 'pipe',
            cwd: process.cwd()
        });
        
        devServer.stdout?.on('data', (data) => {
            const output = data.toString();
            if (output.includes('Local:')) {
                console.log('[cucumber] Dev server ready');
            }
        });
        
        devServer.stderr?.on('data', (data) => {
            console.error('[cucumber] Dev server error:', data.toString());
        });
        
        const ready = await waitForServer(baseUrl, 30000);
        if (!ready) {
            throw new Error(`Dev server failed to start within 30 seconds. URL: ${baseUrl}`);
        }
    } else {
        console.log('[cucumber] Using existing dev server');
    }
    
    browser = await chromium.launch({ 
        headless: process.env.HEADED !== 'true'
    });
});

AfterAll(async function () {
    await browser.close();
    
    if (devServer) {
        console.log('[cucumber] Stopping dev server...');
        await killProcessTree(devServer);
        devServer = null;
    }
});

Before(async function (this: CustomWorld) {
    this.browser = browser;
    this.context = await browser.newContext();
    this.page = await this.context.newPage();
    this.tileRequests = [];
    
    // Track tile requests
    this.page.on('request', req => {
        if (req.url().includes('/tiles/') && req.url().endsWith('.png')) {
            const world = req.url().includes('/the_nether/') ? 'nether' : 'overworld';
            this.tileRequests.push(world);
        }
    });
});

After(async function (this: CustomWorld) {
    await this.context?.close();
});
