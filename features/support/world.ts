import { Browser, BrowserContext, Page } from '@playwright/test';
import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';
import type { PlayerMock } from '../../tests/helpers/navigation-mocks';

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
