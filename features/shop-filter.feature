Feature: Shop and owner filter
  As a player who knows a shop or its owner
  I want to see the shop's name where I go looking for it, and list all its trades
  So that I can find it in-game and browse it, without the trade table getting busier

  @shops @search
  Scenario: Typing a shop name suggests the shop and shows only its trades
    Given the app is loaded with mock shop data
    When I type "dealer" in the want field
    Then I should see a shop suggestion "Diamond Dealer" with "by DiamondOwner"
    When I choose the shop suggestion "Diamond Dealer"
    Then the shop filter should show "Diamond Dealer"
    And the want field should contain ""
    And 1 trade should be displayed
    And the address should contain "owner=DiamondOwner"

  @shops @search
  Scenario: Removing the shop filter shows all shops again
    Given the app is opened at "?owner=FarOwner&shop=Far+Overworld+Shop" with mock shop data
    Then the shop filter should show "Far Overworld Shop"
    And 1 trade should be displayed
    When I remove the shop filter
    Then the shop filter should be hidden
    And more than 1 trade should be displayed
    And the address should not contain "owner="

  @shops @search
  Scenario: Browsing all shops and owners from the Buying menu
    Given the app is loaded with mock shop data
    When I open "All shops & owners" in the Buying menu
    Then the menu should list the owner "DiamondOwner"
    When I choose "Diamond Dealer" in the menu
    Then the shop filter should show "Diamond Dealer"
    And 1 trade should be displayed

  @shops @map
  Scenario: The map names the shop and lists all its trades
    Given the app is loaded with mock shop data
    When I open the map for the "Diamond sword" trade
    Then the map should show the shop "Enchanted Items Shop" by "EnchantOwner"
    When I click the map's "All 2 trades" button
    Then the map dialog should be closed
    And the shop filter should show "Enchanted Items Shop"
    And 2 trades should be displayed

  @shops @map
  Scenario: Other shops are dots on the map and clicking one selects it
    Given the app is loaded with mock shop data
    When I open the map for the "Diamond sword" trade
    And I click the shop "Overworld Shop" on the map
    Then the map should show the shop "Overworld Shop" by "TestOwner"
    And the map coordinates should read "Overworld: 100, 64, 200"

  @shops @map
  Scenario: A shop with a single trade can be listed from the map too
    Given the app is loaded with mock shop data
    When I open the map for the "Diamond sword" trade
    And I click the shop "Diamond Dealer" on the map
    And I click the map's "1 trade" button
    Then the shop filter should show "Diamond Dealer"
    And 1 trade should be displayed
