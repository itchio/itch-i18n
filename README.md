# itch-i18n

Translations for <https://github.com/itchio/itch>

Contribute at: <https://weblate.itch.zone/projects/itchio/>

Strings use [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/):

- Placeholders look like `{title}`. Keep the name inside the braces exactly as
  it appears in the English string.
- Plurals use ICU plural syntax: `{count, plural, one {# item} other {# items}}`,
  with the plural categories for your language.
- A literal apostrophe directly before `{` or `}` must be doubled: `''{title}'`
  displays as `'Title'`.

## Checking strings

`npm install && npm run check` validates every locale file: each string has to
parse as ICU MessageFormat, use only placeholders that appear in the English
string, and use only the `<strong>`, `<em>` and `<code>` tags. The same check
runs in GitHub Actions on every push.
