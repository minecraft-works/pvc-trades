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
  Scenario: Dashboard does not reappear after reload because snapshot auto-saves
    Given I have a previous snapshot with different prices
    When I reload the app
    And I dismiss the dashboard
    And I reload the app
    Then the deals dashboard should not be visible

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
  # Snapshot Persistence
  # ============================================================================

  @dashboard @snapshot
  Scenario: Initial snapshot is saved on first visit
    Then a trade snapshot should be saved in localStorage
    And the snapshot should contain trade entries
