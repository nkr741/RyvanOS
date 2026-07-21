# UX Research Vault

Every survey from restaurants, every rider interview, every customer conversation -- stored here for AI search.

This vault feeds into product decisions, AI training data, and competitive analysis. Treat it as the ground truth of what the market actually says, not what we assume.

## Subdirectories

| Directory | Contents |
|-----------|----------|
| `restaurant-interviews/` | In-person interviews with restaurant owners and managers |
| `rider-interviews/` | Rider feedback sessions and field observations |
| `customer-interviews/` | End-customer interviews and satisfaction data |
| `competitor-analysis/` | Competitive landscape research and teardowns |

## Filing Conventions

- **Filename format:** `YYYY-MM-DD-short-description.md`
  - Example: `2026-05-14-south-delhi-restaurant-owner-pricing.md`
- **Frontmatter tags:** Include at minimum:
  ```
  tags: [restaurant, pricing, south-delhi, pain-point]
  interviewer: <name>
  date: YYYY-MM-DD
  location: <area, city>
  ```
- **Structure each file with:**
  1. Context (who, where, when, why)
  2. Key quotes (verbatim when possible)
  3. Observations (interviewer notes)
  4. Action items (what this implies for product)

## Search Tips

- Tag consistently so AI agents can filter by topic, location, or persona.
- Prefer specific tags (`pricing`, `delivery-speed`) over generic ones (`feedback`).
- Cross-reference related interviews by linking filenames.

## Privacy

- Never store personally identifiable information (names, phone numbers) in research files.
- Use anonymized identifiers: "Restaurant Owner R-042", "Rider D-017".
