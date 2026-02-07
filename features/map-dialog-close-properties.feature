@property @dialog
Feature: Map Dialog Close Properties
  Property-based tests for click detection and dialog close behavior

  # ===========================================================================
  # Click Zone Properties
  # ===========================================================================

  @dialog @property @click-zone
  Scenario Outline: Click inside map keeps dialog open
    Given the map dialog is open
    And the map area is from (100, 100) to (500, 400)
    When click occurs at (<click_x>, <click_y>)
    Then the dialog should be <state>

    Examples: Inside map area
      | click_x | click_y | state |
      | 100     | 100     | open  |
      | 300     | 250     | open  |
      | 500     | 400     | open  |
      | 200     | 150     | open  |
      | 450     | 350     | open  |

    Examples: Outside map area
      | click_x | click_y | state  |
      | 50      | 250     | closed |
      | 550     | 250     | closed |
      | 300     | 50      | closed |
      | 300     | 450     | closed |
      | 0       | 0       | closed |
      | 600     | 500     | closed |

  @dialog @property @click-zone @boundary
  Scenario Outline: Boundary clicks are inside map
    Given the map dialog is open
    And the map area is from (100, 100) to (500, 400)
    When click occurs at (<click_x>, <click_y>)
    Then the dialog should be open

    Examples: Exact boundary clicks
      | click_x | click_y |
      | 100     | 100     |
      | 100     | 400     |
      | 500     | 100     |
      | 500     | 400     |
      | 100     | 250     |
      | 500     | 250     |
      | 300     | 100     |
      | 300     | 400     |

  # ===========================================================================
  # Drag Behavior Properties
  # ===========================================================================

  @dialog @property @drag
  Scenario Outline: Drag starting inside map doesn't close dialog
    Given the map dialog is open
    And the map area is from (100, 100) to (500, 400)
    When drag starts at (<start_x>, <start_y>)
    And drag ends at (<end_x>, <end_y>)
    Then the dialog should be <state>

    Examples: Drag from inside to outside
      | start_x | start_y | end_x | end_y | state |
      | 300     | 250     | 50    | 250   | open  |
      | 300     | 250     | 550   | 250   | open  |
      | 300     | 250     | 300   | 50    | open  |
      | 300     | 250     | 300   | 450   | open  |

    Examples: Drag from outside to inside
      | start_x | start_y | end_x | end_y | state  |
      | 50      | 250     | 300   | 250   | closed |
      | 550     | 250     | 300   | 250   | closed |

  # ===========================================================================
  # Map Interaction Properties
  # ===========================================================================

  @dialog @property @interaction
  Scenario Outline: Map pan/zoom doesn't close dialog
    Given the map dialog is open
    And the map area is from (100, 100) to (500, 400)
    When interaction <interaction> occurs at (300, 250)
    Then the dialog should be open

    Examples: Map interactions
      | interaction   |
      | click         |
      | double-click  |
      | wheel-scroll  |
      | drag          |

  # ===========================================================================
  # Multiple Click Properties
  # ===========================================================================

  @dialog @property @rapid-click
  Scenario Outline: Rapid clicks are handled correctly
    Given the map dialog is open
    And the map area is from (100, 100) to (500, 400)
    When <click_count> rapid clicks occur at (<click_x>, <click_y>)
    Then the dialog should be <state>

    Examples: Rapid clicking inside
      | click_count | click_x | click_y | state |
      | 2           | 300     | 250     | open  |
      | 3           | 300     | 250     | open  |
      | 5           | 300     | 250     | open  |

    Examples: Rapid clicking outside
      | click_count | click_x | click_y | state  |
      | 1           | 50      | 250     | closed |
      | 2           | 50      | 250     | closed |
