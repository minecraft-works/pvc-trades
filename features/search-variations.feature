Feature: Search Variations
  As a player searching for trades
  I want flexible search that handles different input formats
  So that I can find items regardless of how I type them

  Each scenario loads the page once and runs every query in its table.

  Background:
    Given the app is loaded with mock shop data

  @search @parameterized
  Scenario: Search ignores case and word separators
    Then each of these searches should find a matching trade:
      | query      | expected |
      | emerald    | Emerald  |
      | EMERALD    | Emerald  |
      | EmErAlD    | Emerald  |
      | diamond    | Diamond  |
      | iron_ingot | Iron     |
      | iron ingot | Iron     |
      | ironingot  | Iron     |

  @search @security
  Scenario: Hostile or unusual search input is handled safely
    Then none of these searches should run injected code or break the page:
      | query                                    |
      | <script>alert(1)</script>                |
      | <scr<script>ipt>alert(1)</script>        |
      | <img src=x onerror=alert(1)>             |
      | <svg onload=alert(1)>                    |
      | <div onmouseover=alert(1)>hover</div>    |
      | <input onfocus=alert(1) autofocus>       |
      | javascript:alert(1)                      |
      | data:text/html,<script>alert(1)</script> |
      | &lt;script&gt;                           |
      | %3Cscript%3E                             |
      | ' OR '1'='1                              |
      | .*                                       |
      | [a-z                                     |
      | (diamond                                 |
      | ^diamond$                                |
      | (a+)+b                                   |
      | (.*a){25}                                |
      | "diamond                                 |
      | 💎💎💎                                   |
      | ダイヤモンド                             |
      | Ḋìámöñd                                  |
      | ＄diamond                                |
      | abcdefghijklmnopqrstuvwxyzabcdefghijklmn |
