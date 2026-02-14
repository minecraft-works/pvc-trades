Feature: Daily Deals Dashboard
  As the daily user of the trade viewer
  I want to see what changed since my last visit
  So that I can quickly find new deals and price improvements

  Background:
    Given the app is loaded with dashboard test data

  # ============================================================================
  # Dashboard Visibility
  # ============================================================================

  @dashboard @visibility
  Scenario: Dashboard is hidden on first visit with no snapshot
    Then the deals dashboard should not be visible

  @dashboard @visibility
  Scenario: Dashboard appears when previous snapshot exists with changes
    Given I have a previous snapshot with different prices
    When I reload the app
    Then the deals dashboard should be visible
    And the dashboard should show the time since last visit

  @dashboard @visibility
  Scenario: Dashboard is hidden when nothing changed
    Given I have a previous snapshot with identical prices
    When I reload the app
    Then the deals dashboard should not be visible

  # ============================================================================
  # Dashboard Dismiss
  # ============================================================================

  @dashboard @dismiss
  Scenario: Dismiss button hides the dashboard
    Given I have a previous snapshot with different prices
    When I reload the app
    And I dismiss the dashboard
    Then the deals dashboard should not be visible

  @dashboard @dismiss
  Scenario: Dismissed dashboard reappears on next reload
    Given I have a previous snapshot with different prices
    When I reload the app
    And I dismiss the dashboard
    And I reload the app
    Then the deals dashboard should be visible

  # ============================================================================
  # Toggle Button
  # ============================================================================

  @dashboard @toggle
  Scenario: Toggle button appears when dashboard has content
    Given I have a previous snapshot with different prices
    When I reload the app
    Then the dashboard toggle button should be visible

  @dashboard @toggle
  Scenario: Toggle button re-shows dismissed dashboard
    Given I have a previous snapshot with different prices
    When I reload the app
    And I dismiss the dashboard
    And I click the dashboard toggle button
    Then the deals dashboard should be visible

  @dashboard @toggle
  Scenario: Toggle button is hidden on first visit
    Then the dashboard toggle button should not be visible

  # ============================================================================
  # New Trades Section
  # ============================================================================

  @dashboard @new-trades
  Scenario: Dashboard shows new trade count
    Given I have a previous snapshot missing some trades
    When I reload the app
    Then the deals dashboard should be visible
    And the dashboard should show a new trades section

  # ============================================================================
  # Price Drops Section
  # ============================================================================

  @dashboard @price-drops
  Scenario: Dashboard shows price drops
    Given I have a previous snapshot with higher deviations
    When I reload the app
    Then the deals dashboard should be visible
    And the dashboard should show a price drops section

  # ============================================================================
  # Watchlist Hits Section
  # ============================================================================

  @dashboard @watchlist
  Scenario: Dashboard shows watchlist hits for favorited items
    Given I have a previous snapshot with different prices
    And I have a favorite item matching a current trade
    When I reload the app
    Then the deals dashboard should be visible
    And the dashboard should show a watchlist section

  # ============================================================================
  # Action Buttons
  # ============================================================================

  @dashboard @actions
  Scenario: Show New Trades button filters to new items
    Given I have a previous snapshot missing some trades
    When I reload the app
    And I click the "Show New Trades" dashboard action
    Then the deals dashboard should not be visible

  @dashboard @actions
  Scenario: Show Price Drops button sorts by deviation
    Given I have a previous snapshot with higher deviations
    When I reload the app
    And I click the "Show Price Drops" dashboard action
    Then the deals dashboard should not be visible

  @dashboard @actions
  Scenario: Show Watchlist Deals button activates favorites filter
    Given I have a previous snapshot with different prices
    And I have a favorite item matching a current trade
    When I reload the app
    And I click the "Show Watchlist Deals" dashboard action
    Then the deals dashboard should not be visible
    And the favorites filter should be active

  # ============================================================================
  # Mark as Seen
  # ============================================================================

  @dashboard @mark-seen
  Scenario: Mark as seen updates the snapshot baseline
    Given I have a previous snapshot with different prices
    When I reload the app
    And I click the "✓ Mark as seen" dashboard action
    Then the deals dashboard should not be visible
    And the dashboard toggle button should not be visible

  @dashboard @mark-seen
  Scenario: Dashboard is hidden after marking as seen and reloading
    Given I have a previous snapshot with different prices
    When I reload the app
    And I click the "✓ Mark as seen" dashboard action
    And I reload the app
    Then the deals dashboard should not be visible

  # ============================================================================
  # Snapshot Persistence
  # ============================================================================

  @dashboard @snapshot
  Scenario: Initial snapshot is saved on first visit
    Then a trade snapshot should be saved in localStorage
    And the snapshot should contain trade entries
