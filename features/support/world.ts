import { IWorldOptions, setDefaultTimeout,setWorldConstructor, World } from '@cucumber/cucumber';
import { Browser, BrowserContext, Page } from '@playwright/test';

import type { PlayerMock } from '../../tests/helpers/navigation-mocks';

// Step timeout - 3 seconds for fast UI operations
setDefaultTimeout(3000);

export interface CustomWorld extends World {
    browser: Browser;
    context: BrowserContext;
    page: Page;
    playerMock: PlayerMock;
    tileRequests: string[];
}

class PlaywrightWorld extends World implements CustomWorld {
    browser!: Browser;
    context!: BrowserContext;
    page!: Page;
    playerMock!: PlayerMock;
    tileRequests: string[] = [];

    constructor(options: IWorldOptions) {
        super(options);
    }
}

setWorldConstructor(PlaywrightWorld);
