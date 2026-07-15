# Workout PDF Pagination v1

The workout PDF uses natural document flow so useful content fills available page space without reducing legibility.

## Rules

- The cover remains a dedicated page.
- Section headings stay with the content immediately following them.
- Workout tables may split between exercise rows and repeat their column header after a page break.
- Coach-note lists may continue onto the next page instead of moving an entire day block.
- Coaching guidance follows the workout tables without a forced page break.
- The safety disclaimer and Fitnet app callout use remaining space instead of always creating a final standalone page.

The renderer does not remove plan content, shrink body text, or change the workout-programming architecture.

Run `npm run validate:workout-pdf-content` to verify content completeness and the compact reference pagination.
