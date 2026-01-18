const makePrice = (amount) => ({ amount, currency: "USD" });
const makeSpecs = (query) => [
    { key: "Material", value: "Unknown" },
    { key: "Query", value: query },
];
export const createStubTools = () => {
    return {
        async searchWeb(query) {
            return [
                {
                    title: `Top result for ${query}`,
                    url: `https://example.com/products/${encodeURIComponent(query)}`,
                    snippet: "Mock search result for hackathon wiring.",
                },
                {
                    title: `Alternative ${query} bundle`,
                    url: `https://example.com/alt/${encodeURIComponent(query)}`,
                    snippet: "Mock alternative listing.",
                },
                {
                    title: `Comparable ${query} choice`,
                    url: `https://example.com/compare/${encodeURIComponent(query)}`,
                    snippet: "Mock comparison page.",
                },
            ];
        },
        async fetchPage(url) {
            return `<!doctype html><html><head><title>${url}</title></head><body>Mock page for ${url}</body></html>`;
        },
        async extractProductFields(_html, sourceUrl) {
            const title = `Mock Product from ${sourceUrl}`;
            return {
                title,
                image_url: "https://placehold.co/600x600",
                price: makePrice(19.99),
                specs: makeSpecs(title),
                source_url: sourceUrl,
            };
        },
        async compareProducts(productA, productB) {
            if (productA.price.amount <= productB.price.amount) {
                return "Lower price with similar baseline specs.";
            }
            return "Higher price but could indicate premium build.";
        },
        async buyItem(productId) {
            return { status: "ok", message: `Purchase flow started for ${productId}` };
        },
    };
};
