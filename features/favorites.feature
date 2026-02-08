Feature: Favorites Watchlist
  As a player shopping for items
  I want to watch items I'm interested in buying
  So that I can quickly find good deals and be notified when they appear

  Background:
    Given the app is loaded with mock shop data

  # ============================================================================
  # Adding Favorites from Trade Rows
  # ============================================================================

  @favorites @add
  Scenario: Add item to favorites from trade row
    When I click the favorite star on a trade row
    Then I should see a popover with threshold options
    When I click the popover "Add to Watchlist" button
    Then the star should be filled
    And the trade row should have a favorite indicator

  @favorites @add
  Scenario: Add favorite with deal threshold
    When I click the favorite star on a trade row
    And I select "Below market by 20%"
    And I click the popover "Add to Watchlist" button
    Then the item should be in my favorites with threshold -20

  @favorites @add
  Scenario: Add favorite without threshold
    When I click the favorite star on a trade row
    And I select "Any price"
    And I click the popover "Add to Watchlist" button
    Then the item should be in my favorites without a threshold

  @favorites @add
  Scenario: Cancel adding favorite closes popover
    When I click the favorite star on a trade row
    And I click outside the popover
    Then the popover should close
    And the star should remain hollow

  # ============================================================================
  # Popover Button Visibility
  # ============================================================================

  @favorites @popover
  Scenario: Popover shows Add button when item is not in favorites
    When I click the favorite star on a trade row for an item not in favorites
    Then I should see the "Add to Watchlist" button
    And I should not see the "Remove" button

  @favorites @popover
  Scenario: Popover shows Remove button when item is already a favorite
    Given I have "Diamond" in my favorites
    When I click the filled star on a "Diamond" trade row
    Then I should see the "Remove" button
    And I should not see the "Add to Watchlist" button

  @favorites @popover
  Scenario: Popover defaults to Any price radio option
    When I click the favorite star on a trade row
    Then the "Any price" radio option should be selected
    And the "Below market by" radio option should not be selected

  # ============================================================================
  # Removing Favorites
  # ============================================================================

  @favorites @remove
  Scenario: Remove favorite from trade row
    Given I have "Diamond Pickaxe" in my favorites
    When I click the filled star on a "Diamond Pickaxe" trade row
    And I click the popover "Remove from Watchlist" button
    Then the star should be hollow
    And the trade row should not have a favorite indicator

  @favorites @remove
  Scenario: Remove favorite from favorites dialog
    Given I have "Diamond Pickaxe" in my favorites
    When I open the favorites dialog
    And I click the delete button for "Diamond Pickaxe"
    Then "Diamond Pickaxe" should not be in my favorites

  # ============================================================================
  # Editing Favorites
  # ============================================================================

  @favorites @edit @skip
  Scenario: Edit favorite threshold from trade row
    Given I have "Diamond Pickaxe" in my favorites with threshold -10
    When I click the filled star on a "Diamond Pickaxe" trade row
    And I change the threshold to -30
    And I click "Update"
    Then the item should be in my favorites with threshold -30

  @favorites @edit @skip
  Scenario: Edit favorite threshold from favorites dialog
    Given I have "Diamond Pickaxe" in my favorites with threshold -10
    When I open the favorites dialog
    And I click the edit button for "Diamond Pickaxe"
    And I change the threshold to -20
    And I click "Save"
    Then the item should be in my favorites with threshold -20

  # ============================================================================
  # Favorites Dialog
  # ============================================================================

  @favorites @dialog
  Scenario: Open favorites dialog
    When I click the favorites button in the search bar
    Then I should see the favorites dialog

  @favorites @dialog
  Scenario: Empty favorites shows helpful message
    Given I have no favorites
    When I open the favorites dialog
    Then I should see text "No items in watchlist" in the dialog
    And I should see a hint to click star on trades

  @favorites @dialog
  Scenario: Favorites dialog shows all watched items
    Given I have "Diamond Pickaxe" in my favorites
    And I have "Mending Book" in my favorites
    When I open the favorites dialog
    Then I should see "Diamond Pickaxe" in the favorites list
    And I should see "Mending Book" in the favorites list

  @favorites @dialog @skip
  Scenario: Favorites dialog shows threshold for each item
    Given I have "Diamond Pickaxe" in my favorites with threshold -20
    And I have "Mending Book" in my favorites without threshold
    When I open the favorites dialog
    Then I should see "Diamond Pickaxe" with threshold display
    And I should see "Mending Book" with any price display

  # ============================================================================
  # Adding New Items via Dialog
  # ============================================================================

  @favorites @add-new @skip
  Scenario: Add new item from favorites dialog
    When I open the favorites dialog
    And I click the "Watch new item" button in the dialog
    Then I should see an item name input

  @favorites @add-new @skip
  Scenario: Autocomplete suggests known items
    When I open the favorites dialog
    And I click "Watch new item"
    And I type "pick" in the new item input
    Then I should see autocomplete suggestions containing "Pickaxe"

  @favorites @add-new @skip
  Scenario: Adding unknown item shows warning
    When I open the favorites dialog
    And I click "Watch new item"
    And I type "Elytra" in the new item input
    Then I should see a warning about no current trades

  # ============================================================================
  # Filtering by Favorites
  # ============================================================================

  @favorites @filter @skip
  Scenario: Filter to show only favorited items
    Given I have "Diamond Pickaxe" in my favorites
    When I click the favorites filter button
    Then I should only see trades for favorited items
    And the favorites button should show active state

  # TODO: These scenarios need mock data with specific deviations
  @favorites @filter @skip
  Scenario: Filter respects deal threshold
    Given I have "Diamond Pickaxe" in my favorites with threshold -20
    And there is a trade for "Diamond Pickaxe" with deviation -25
    And there is a trade for "Diamond Pickaxe" with deviation -10
    When I click the favorites filter button
    Then I should see the trade with deviation -25
    And I should not see the trade with deviation -10

  @favorites @filter
  Scenario: Toggle favorites filter off
    Given I have "Diamond Pickaxe" in my favorites
    And the favorites filter is active
    When I click the favorites filter button
    Then I should see all trades
    And the favorites button should show inactive state

  # ============================================================================
  # Visual Indicators
  # ============================================================================

  @favorites @visual
  Scenario: Favorited items show filled star
    Given I have "Diamond Pickaxe" in my favorites
    Then all "Diamond Pickaxe" trade rows should show filled stars

  # TODO: Needs mock data with specific deviations
  @favorites @visual @skip
  Scenario: Favorited items meeting threshold show deal highlight
    Given I have "Diamond Pickaxe" in my favorites with threshold -20
    And there is a trade for "Diamond Pickaxe" with deviation -25
    Then that trade row should have deal-alert styling

  @favorites @visual
  Scenario: Favorited items above threshold show normal styling
    Given I have "Diamond Pickaxe" in my favorites with threshold -20
    And there is a trade for "Diamond Pickaxe" with deviation -10
    Then that trade row should not have deal-alert styling

  # ============================================================================
  # Badge Count
  # ============================================================================

  # TODO: Needs multiple trades for same item in mock data
  @favorites @badge @skip
  Scenario: Badge shows count of matching deals
    Given I have "Diamond Pickaxe" in my favorites with threshold -20
    And there are 2 trades for "Diamond Pickaxe" below threshold
    Then the favorites button badge should show "2"

  # TODO: Needs mock data with specific deviations
  @favorites @badge @skip
  Scenario: Badge hidden when no matching deals
    Given I have "Diamond Pickaxe" in my favorites with threshold -50
    And there are no trades for "Diamond Pickaxe" below threshold
    Then the favorites button badge should be hidden

  # ============================================================================
  # Persistence
  # ============================================================================

  @favorites @persistence
  Scenario: Favorites persist across page refresh
    Given I have "Diamond Pickaxe" in my favorites
    When I refresh the page
    Then I should still have "Diamond Pickaxe" in my favorites
    And "Diamond Pickaxe" trade rows should show filled stars

  @favorites @persistence
  Scenario: Threshold persists across page refresh
    Given I have "Diamond Pickaxe" in my favorites with threshold -20
    When I refresh the page
    Then the item should still have threshold -20
