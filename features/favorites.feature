Feature: Favorites Watchlist
  As a player shopping for items
  I want to watch items I'm interested in buying
  So that I can quickly find good deals and be notified when they appear

  Background:
    Given the app is loaded with mock shop data

  # ============================================================================
  # Adding Favorites from Trade Rows (Star Opens Dialog)
  # ============================================================================

  @favorites @add
  Scenario: Click star on new item opens dialog with pre-filled add form
    When I click the star on a trade row for a new item
    Then I should see the favorites dialog
    And the add input should contain the item name
    And the add input should be focused

  @favorites @add
  Scenario: Add item with no threshold filter
    When I click the star on a trade row for a new item
    And the threshold dropdown shows "Deal"
    And I click the save button in the add row
    Then the star should be filled
    And the item should be in my favorites
    And the item should have no threshold filter

  @favorites @add
  Scenario: Add item with threshold filter
    When I click the star on a trade row for a new item
    And I select "≤-25%" in the add row dropdown
    And I click the save button in the add row
    Then the item should be in my favorites with threshold -25

  @favorites @add
  Scenario: Close dialog without saving does not add item
    When I click the star on a trade row for a new item
    And I close the favorites dialog
    Then the star should remain hollow
    And the item should not be in my favorites

  # ============================================================================
  # Editing Favorites from Trade Rows (Star Opens Dialog in Edit Mode)
  # ============================================================================

  @favorites @edit
  Scenario: Click star on existing favorite opens dialog in edit mode
    Given I have "Diamond" in my favorites
    When I click the filled star on a "Diamond" trade row
    Then I should see the favorites dialog
    And the item row should be in edit mode
    And the edit input should contain the item name

  @favorites @edit
  Scenario: Save edited threshold from trade row star
    Given I have "Diamond" in my favorites with threshold -25
    When I click the filled star on a "Diamond" trade row
    And I select "≤-50%" in the edit dropdown
    And I click the save button in the row
    Then the item should have threshold -50

  @favorites @edit
  Scenario: Cancel edit mode reverts changes
    Given I have "Diamond" in my favorites with threshold -25
    When I click the filled star on a "Diamond" trade row
    And I select "≤-75%" in the edit dropdown
    And I close the favorites dialog
    Then the item should still have threshold -25

  # ============================================================================
  # Editing Favorites via Edit Button
  # ============================================================================

  @favorites @edit
  Scenario: Edit button enters inline edit mode
    Given I have "Diamond" in my favorites
    When I open the favorites dialog
    And I click the edit button for the item
    Then the item row should be in edit mode
    And the save button should be visible
    And the edit button should be hidden

  @favorites @edit
  Scenario: Save inline edit
    Given I have "Diamond" in my favorites without threshold
    When I open the favorites dialog
    And I click the edit button for the item
    And I select "≤-50%" in the edit dropdown
    And I click the save button in the row
    Then the item should have threshold -50

  # ============================================================================
  # Removing Favorites
  # ============================================================================

  @favorites @remove
  Scenario: Remove favorite from dialog
    Given I have "Diamond Pickaxe" in my favorites
    When I open the favorites dialog
    And I click the delete button for the item
    Then the item should not be in my favorites
    And the star should be hollow

  @favorites @remove
  Scenario: Delete button is always visible in normal mode
    Given I have "Diamond" in my favorites
    When I open the favorites dialog
    Then the delete button should be visible
    And the edit button should be visible

  # ============================================================================
  # Favorites Dialog
  # ============================================================================

  @favorites @dialog
  Scenario: Open favorites dialog via button
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

  @favorites @dialog
  Scenario: Favorites dialog shows threshold for each item
    Given I have "Diamond" in my favorites with threshold -25
    When I open the favorites dialog
    Then I should see "≤-25%" displayed for the item

  @favorites @dialog
  Scenario: Items without threshold show no filter indicator
    Given I have "Diamond" in my favorites without threshold
    When I open the favorites dialog
    Then no threshold should be displayed for the item

  # ============================================================================
  # Adding New Items via Dialog Inline Form
  # ============================================================================

  @favorites @add-new
  Scenario: Add row is always visible at bottom of list
    Given I have "Diamond" in my favorites
    When I open the favorites dialog
    Then I should see the add row at the bottom
    And the add row should have an input field
    And the add row should have a threshold dropdown

  @favorites @add-new
  Scenario: Add new item from dialog
    When I open the favorites dialog
    And I type "Mending Book" in the add input
    And I click the save button in the add row
    Then "Mending Book" should be in my favorites
    And the add input should be cleared

  @favorites @add-new
  Scenario: Add new item with threshold from dialog
    When I open the favorites dialog
    And I type "Mending Book" in the add input
    And I select "≤-50%" in the add row dropdown
    And I click the save button in the add row
    Then "Mending Book" should be in my favorites with threshold -50

  # ============================================================================
  # Threshold Dropdown Options
  # ============================================================================

  @favorites @threshold
  Scenario: Threshold dropdown has correct options
    When I open the favorites dialog
    Then the add row dropdown should have options:
      | Deal   |
      | ≤-25%  |
      | ≤-50%  |
      | ≤-75%  |
      | ≤-100% |

  @favorites @threshold
  Scenario: Default threshold is Deal (no filter)
    When I click the star on a trade row for a new item
    Then the add row threshold should be "Deal"

  @favorites @threshold
  Scenario: Dropdown has tooltip explaining purpose
    When I open the favorites dialog
    Then the add row dropdown should have title "Only show trades with deviation at or below this value"

  # ============================================================================
  # Filtering by Favorites
  # ============================================================================

  @favorites @filter @skip
  Scenario: Filter to show only favorited items
    Given I have "Diamond Pickaxe" in my favorites
    When I click the favorites filter button
    Then I should only see trades for favorited items
    And the favorites button should show active state

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

  @favorites @visual
  Scenario: Non-favorited items show hollow star
    Given I have no favorites
    Then all trade rows should show hollow stars

  # ============================================================================
  # Badge Count (Shows Deals Meeting Thresholds)
  # Note: These tests verify badge infrastructure. Deal matching depends on 
  # market data which requires multiple trades per item (not in mock data).
  # ============================================================================

  @favorites @badge
  Scenario: Badge hidden when no deals meet thresholds
    Given I have "Diamond" in my favorites without threshold
    Then the favorites badge should be hidden

  @favorites @badge
  Scenario: Badge not shown for favorites without thresholds
    Given I have "Diamond" in my favorites without threshold
    Then the favorites badge should be hidden or not yellow

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
    Given I have "Diamond Pickaxe" in my favorites with threshold -50
    When I refresh the page
    Then the item should still have threshold -50
