Feature: Cart Management
  As a player planning a shopping trip
  I want to manage my shopping cart
  So that I can see what I need to bring and what I'll receive

  Background:
    Given the app is loaded with mock shop data

  @cart @totals
  Scenario: Show aggregated costs in cart
    Given I add a trade to the cart
    When I open the cart dialog
    Then I should see total costs showing "Diamond"

  @cart @totals
  Scenario: Show aggregated gains in cart
    Given I add a trade to the cart
    When I open the cart dialog
    Then I should see total gains showing "Emerald"

  @cart @quantity
  Scenario: Quantity affects totals
    Given I add a trade to the cart
    When I increase the quantity to 3
    And I open the cart dialog
    Then I should see total costs showing "3× Diamond"
    And I should see total gains showing "3× Emerald"

  @cart @button-state
  Scenario: Add button shows in-cart state
    When I click the add button for a trade
    Then the button should show "in-cart" styling
    And the button icon should change to a checkmark

  @cart @button-state
  Scenario: Button reverts when item removed
    Given I add a trade to the cart
    When I remove the trade from the cart
    Then the add button should show default styling

  @cart @cleanup
  Scenario: Zero-quantity items removed on dialog close
    Given I add a trade to the cart
    And I open the cart dialog
    When I decrease the quantity to zero
    And I close the cart dialog
    Then the cart badge should be hidden
    And reopening the cart should show empty message

