Feature: Search Variations
  As a player searching for trades
  I want flexible search that handles different input formats
  So that I can find items regardless of how I type them

  Background:
    Given the app is loaded with mock shop data

  @search @parameterized
  Scenario Outline: Search handles case variations
    When I search for "<query>" in the want field
    Then I should see results containing "<expected>"

    Examples:
      | query    | expected |
      | emerald  | Emerald  |
      | EMERALD  | Emerald  |
      | Emerald  | Emerald  |
      | EmErAlD  | Emerald  |

  @search @parameterized
  Scenario Outline: Search handles word separators
    When I search for "<query>" in the want field
    Then I should see results containing "<expected>"

    Examples:
      | query         | expected      |
      | diamond       | Diamond       |
      | iron_ingot    | Iron          |
      | iron ingot    | Iron          |
      | ironingot     | Iron          |

  # Note: Wildcard search (e.g., "dia*", "*mond") is NOT supported by the search filter.
  # The getRegex function supports wildcards only for result highlighting, not filtering.

  @search @parameterized @edge-cases
  Scenario Outline: Search edge cases don't break the app
    When I search for "<query>" in the want field
    Then the app should not crash

    Examples:
      | query                      |
      |                            |
      | a                          |
      | abcdefghijklmnopqrstuvwxyz |
      | 12345                      |
      | !@#$%                      |
      | <script>                   |

  # ===========================================================================
  # XSS and Injection Safety Tests
  # ===========================================================================

  @search @property @security @xss
  Scenario Outline: Search safely handles HTML injection attempts
    When I search for "<malicious_input>" in the want field
    Then the app should not crash
    And no script should execute
    And the search input should be sanitized

    Examples: Script injection
      | malicious_input                           |
      | <script>alert(1)</script>                 |
      | <script>alert('xss')</script>             |
      | <SCRIPT>alert(1)</SCRIPT>                 |
      | <scr<script>ipt>alert(1)</script>         |

    Examples: Event handler injection
      | malicious_input                           |
      | <img src=x onerror=alert(1)>              |
      | <svg onload=alert(1)>                     |
      | <body onload=alert(1)>                    |
      | <div onmouseover=alert(1)>hover</div>     |
      | <input onfocus=alert(1) autofocus>        |

    Examples: JavaScript protocol
      | malicious_input                           |
      | javascript:alert(1)                       |
      | JAVASCRIPT:alert(1)                       |
      | java&#x0A;script:alert(1)                 |

    Examples: Data URI
      | malicious_input                           |
      | data:text/html,<script>alert(1)</script>  |

  @search @property @security @sql
  Scenario Outline: Search safely handles SQL-like injection attempts
    When I search for "<sql_input>" in the want field
    Then the app should not crash
    And the search should complete safely

    Examples: SQL injection patterns
      | sql_input                      |
      | '; DROP TABLE trades; --       |
      | ' OR '1'='1                    |
      | ' OR 1=1 --                    |
      | UNION SELECT * FROM users      |
      | 1; DELETE FROM items           |
      | ' AND 1=0 UNION SELECT null -- |

  @search @property @security @unicode
  Scenario Outline: Search safely handles unicode edge cases
    When I search for "<unicode_input>" in the want field
    Then the app should not crash
    And the search should complete safely

    Examples: Unicode characters
      | unicode_input                  |
      | 💎💎💎                          |
      | ダイヤモンド                     |
      | Ḋìámöñd                        |
      | \u0000null\u0000               |
      | \uFEFF                         |
      | ＄diamond                       |

    Examples: Control characters
      | unicode_input                  |
      | dia\x00mond                    |
      | dia\nmond                      |
      | dia\rmond                      |
      | dia\tmond                      |

  @search @property @security @encoding
  Scenario Outline: Search safely handles encoding edge cases
    When I search for "<encoded_input>" in the want field
    Then the app should not crash
    And the search should complete safely

    Examples: URL encoding
      | encoded_input                  |
      | %3Cscript%3E                   |
      | %00%00%00                      |
      | %2e%2e%2f                      |
      | diamond%20sword                |

    Examples: HTML entities
      | encoded_input                  |
      | &lt;script&gt;                 |
      | &#60;script&#62;               |
      | &#x3C;script&#x3E;             |
      | &amp;lt;script&amp;gt;         |

  # ===========================================================================
  # Regex Special Character Safety
  # ===========================================================================

  @search @property @regex
  Scenario Outline: Search safely handles regex metacharacters
    When I search for "<regex_input>" in the want field
    Then the app should not crash
    And the search should complete safely

    Examples: Regex metacharacters
      | regex_input                    |
      | .*                             |
      | .+                             |
      | [a-z]                          |
      | (diamond)                      |
      | diamond\|emerald               |
      | ^diamond$                      |
      | \\d+                           |
      | (?=diamond)                    |
      | (?:diamond)                    |

    Examples: Catastrophic backtracking patterns
      | regex_input                    |
      | (a+)+b                         |
      | ((a+)+)+b                      |
      | (a\|aa)+b                      |
      | (.*a){25}                      |

  # ===========================================================================
  # Search Performance Properties
  # ===========================================================================

  @search @property @performance
  Scenario Outline: Search completes within acceptable time
    When I search for "<query>" in the want field
    Then results should appear within 500ms

    Examples: Various query complexities
      | query                          |
      | a                              |
      | diamond                        |
      | enchanted diamond sword        |
      | *****                          |
      | d*a*m*o*n*d                    |
      | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
