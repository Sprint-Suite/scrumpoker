const { expect } = require('@playwright/test');

// Desktop layout: the result cards share the vote panel's column, whatever the
// participants panel beside them is doing.
async function expectResultsInVoteColumn(page) {
  const vote = await page.locator('.vote-panel').boundingBox();
  for (const selector of ['#vote-summary', '#ordered-votes']) {
    const box = await page.locator(selector).boundingBox();
    expect(box.x, `${selector} x`).toBeCloseTo(vote.x, 0);
    expect(box.width, `${selector} width`).toBeCloseTo(vote.width, 0);
  }
}

module.exports = { expectResultsInVoteColumn };
