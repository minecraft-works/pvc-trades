@accessibility
Feature: Accessibility compliance
  The app should meet WCAG 2.1 AA standards to ensure usability for all users.

  Background:
    Given the app is loaded with mock shop data

  @a11y @main-page
  Scenario: Main page has no critical accessibility violations
    Then the page should have no accessibility violations

  @a11y @cart-dialog
  Scenario: Cart dialog has no critical accessibility violations
    Given I add a trade to the cart
    When I open the cart dialog
    Then the page should have no accessibility violations

  @a11y @favorites-dialog
  Scenario: Favorites dialog has no critical accessibility violations
    When I open the favorites dialog
    Then the page should have no accessibility violations

  @a11y @trade-details
  Scenario: Trade details popover has no critical accessibility violations
    When I click on the result name of a trade
    Then the page should have no accessibility violations
