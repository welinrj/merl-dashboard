// Exercise optional information through the same visible controls as a reader.
export async function openOverviewDetails(page, sections = ['projects','finance','reporting','data']) {
  await page.locator('.executive-portfolio').waitFor();
  for (const key of sections) {
    const detail = page.locator(`.ovx-details[data-section="${key}"]`);
    if (await detail.count() && !await detail.evaluate(el => el.open)) await detail.locator(':scope > summary').click();
  }
}
