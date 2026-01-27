Feature: Data Refresh and New Items
  As a player monitoring the market
  I want the shop data to refresh automatically
  So that I can see new trades as they become available

  Background:
    Given the app is loaded with dynamic mock data

  @refresh @new-items
  Scenario: New trades appear after data refresh
    Given there are 5 trades initially
    When the shop data refreshes with 2 new trade(s)
    Then I should see 7 total trades
    And the new trades should be highlighted

  @refresh @new-items
  Scenario: New item highlight is visible
    Given there are 5 trades initially
    When the shop data refreshes with 1 new trade(s) for "Netherite Ingot"
    Then the "Netherite Ingot" trade should have a "new" indicator

  @refresh @new-items
  Scenario: Highlight fades after acknowledgement
    Given there are 5 trades initially
    When the shop data refreshes with 1 new trade(s)
    And I scroll to view the new trade
    Then the highlight should fade after a moment

  @refresh @filter
  Scenario: New trades respect current search filter
    Given there are 5 trades initially
    And I search for "blaze" in the want field
    When the shop data refreshes with a new "Coal Block" trade
    Then I should not see the new "Coal Block" trade
    But clearing the search should show the new trade

  @refresh @cart
  Scenario: Cart is preserved across data refresh
    Given I add a trade to the cart
    When the shop data refreshes
    Then my cart should still contain the trade
    And the cart badge should still show "1"

  @refresh @error
  Scenario: Failed refresh does not disrupt the UI
    Given the app is loaded with dynamic mock data
    When the data refresh fails with a network error
    Then the existing trades should still be visible
    And no error message should be shown to the user

  @refresh @interval
  Scenario: Data refreshes at configured interval
    Given the refresh interval is set to 2 seconds
    When I wait for 2 seconds
    Then the data should have been fetched again
