@visual
Feature: Visual regression baselines
  Key UI states should not change appearance unexpectedly.
  Screenshots are compared against stored baselines using Playwright's toHaveScreenshot.

  Background:
    Given the app is loaded with mock shop data

  @visual @main
  Scenario: Main trade table matches baseline
    Then the main content area should match the visual baseline "main-trade-table"

  @visual @cart
  Scenario: Cart dialog matches baseline
    Given I add a trade to the cart
    When I open the cart dialog
    Then the dialog should match the visual baseline "cart-dialog"

  @visual @favorites
  Scenario: Favorites dialog matches baseline
    When I open the favorites dialog
    Then the dialog should match the visual baseline "favorites-dialog"

  @visual @trade-details
  Scenario: Trade details popover matches baseline
    When I click on the result name of a trade
    Then the dialog should match the visual baseline "trade-details-popover"
