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
  Scenario: Dismissed dashboard reappears on reload when snapshot is less than 24h old
    Given I have a previous snapshot with different prices
    When I reload the app
    And I dismiss the dashboard
    And I reload the app
    Then the deals dashboard should be visible

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

  @dashboard @watchlist
  Scenario: Watchlist items are sorted by most decreased deviation first
    Given I have a previous snapshot with higher deviations
    And I have a favorite item matching a current trade
    When I reload the app
    Then the dashboard should show a watchlist section
    And the first watchlist item should have the lowest deviation

  @dashboard @watchlist
  Scenario: Clicking a watchlist item name searches for that item
    Given I have a previous snapshot with different prices
    And I have a favorite item matching a current trade
    When I reload the app
    And I click a watchlist item name
    Then the want field should contain the clicked item name
    And the want field clear button should be visible

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

  # ============================================================================
  # Rolling Snapshot History
  # ============================================================================

  @dashboard @snapshot
  Scenario: Old baseline snapshot is preserved in rolling history
    Given I have a previous snapshot with different prices
    When I reload the app
    Then the snapshot timestamp should not have changed

  @dashboard @snapshot
  Scenario: New snapshot is appended when interval has elapsed
    Given I have an old snapshot from 25 hours ago
    When I reload the app
    Then the snapshot timestamp should be recent

  # ============================================================================
  # Snapshot Persistence
  # ============================================================================

  @dashboard @snapshot
  Scenario: Initial snapshot is saved on first visit
    Then a trade snapshot should be saved in localStorage
    And the snapshot should contain trade entries
