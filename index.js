const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  // Launch browser
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to Medium and search for AI articles
    console.log('Navigating to Medium and searching for AI articles...');
    await page.goto('https://medium.com/search?q=artificial%20intelligence');
    
    // Wait for search results to load
    await page.waitForSelector('article');

    // Scroll to load more articles (3 times)
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(2000);
    }

    // Extract article data
    console.log('Extracting article data...');
    const articles = await page.$$eval('article', (articles) => {
      return articles.map(article => {
        const titleElement = article.querySelector('h2');
        const clapsElement = article.querySelector('button[aria-label*="clap"]');
        const authorElement = article.querySelector('a[href*="/@"]');
        const linkElement = article.querySelector('a[href*="/"]:not([href*="/@"])');

        return {
          title: titleElement?.innerText.trim() || 'No title',
          claps: clapsElement?.innerText.trim() || '0',
          author: authorElement?.innerText.trim() || 'Unknown author',
          medium_url: linkElement?.href || 'No URL',
          author_profile: authorElement?.href || 'No author profile'
        };
      }).filter(article => article.title !== 'No title');
    });

    // Sort by claps (descending) and take top 20
    const topArticles = articles
      .sort((a, b) => {
        const aClaps = parseInt(a.claps) || 0;
        const bClaps = parseInt(b.claps) || 0;
        return bClaps - aClaps;
      })
      .slice(0, 20);

    console.log(`Found ${topArticles.length} top articles`);

    // Find LinkedIn profiles for first 10 unique authors
    const authorsWithLinkedIn = [];
    const uniqueAuthors = [...new Set(topArticles.map(article => article.author))].slice(0, 10);

    for (const author of uniqueAuthors) {
      console.log(`Searching LinkedIn for: ${author}`);
      const authorPage = await context.newPage();
      
      try {
        // Search Google for author's LinkedIn profile
        await authorPage.goto(`https://www.google.com/search?q=${encodeURIComponent(author)}+site:linkedin.com`);
        
        // Wait for results and click the first LinkedIn result
        await authorPage.waitForSelector('a[href*="linkedin.com"]');
        const linkedinUrl = await authorPage.$eval('a[href*="linkedin.com"]', el => el.href);
        
        // Find all articles by this author
        const authorArticles = topArticles.filter(a => a.author === author);
        
        authorsWithLinkedIn.push({
          author,
          linkedin_url: linkedinUrl,
          articles: authorArticles.map(a => ({
            article_title: a.title,
            medium_url: a.medium_url
          }))
        });

        console.log(`Found LinkedIn profile for ${author}: ${linkedinUrl}`);
      } catch (err) {
        console.log(`Could not find LinkedIn profile for ${author}`);
      } finally {
        await authorPage.close();
      }
    }

    // Save results to JSON file
    const output = {
      generated_at: new Date().toISOString(),
      authors: authorsWithLinkedIn
    };

    fs.writeFileSync('authors.json', JSON.stringify(output, null, 2));
    console.log('Results saved to authors.json');

  } catch (error) {
    console.error('Error during scraping:', error);
  } finally {
    await browser.close();
  }
})();