Feature: Flip finder
  As a trader
  I want to see where I can buy an item cheaply and sell it to another shop for more
  So that I can make a profit, planned with the existing cart and route

  @flips
  Scenario: The Flips tab lists a profitable round trip and adds it to the cart
    Given the app is loaded with a profitable flip between two players
    When I open the Flips tab of the exchange rates dialog
    Then I should see 1 flip
    And the flip should be for "Iron ingot" with a profit of "+10 Emerald"
    And the flip should buy at "Iron Mine" 10 times and sell at "Smithy" 20 times
    When I add the flip to the cart
    Then the cart badge should show 30
    And the cart should list the shops "Iron Mine" and "Smithy"
