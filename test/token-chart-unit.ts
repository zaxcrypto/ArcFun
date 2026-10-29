import assert from "assert";

// 1. Test Price Formatter
function formatPrice(price: number | undefined | null): string {
  if (price === undefined || price === null || isNaN(price)) return "$0.0000";
  if (price < 0.01) return `$${price.toFixed(6)}`;
  if (price < 10) return `$${price.toFixed(4)}`;
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

// 2. Test 24h Change Calculator
function calculate24hChange(current: number, open: number) {
  if (isNaN(current) || isNaN(open) || open <= 0) {
    return { change24h: 0, change24hPct: 0 };
  }
  const change24h = current - open;
  const change24hPct = ((current - open) / open) * 100;
  return {
    change24h: parseFloat(change24h.toFixed(6)),
    change24hPct: parseFloat(change24hPct.toFixed(4)),
  };
}

// 3. Test Candle Deduplication & Ascending Sort
function processCandles(raw: [number, number, number, number, number, number][]) {
  const seenTimes = new Set<number>();
  const points: { time: number; value: number }[] = [];

  for (const item of raw) {
    if (!Array.isArray(item) || item.length < 5) continue;
    const [time, , , , close] = item;
    if (typeof time !== "number" || typeof close !== "number" || isNaN(close) || close <= 0) continue;
    if (seenTimes.has(time)) continue;
    seenTimes.add(time);
    points.push({ time, value: close });
  }

  points.sort((a, b) => a.time - b.time);
  return points;
}

async function runTests() {
  console.log("▶ Running Token Chart Unit Tests...\n");

  // Test 1: Price Formatting
  console.log("1. Testing Price Formatter around $1.0000");
  assert.strictEqual(formatPrice(0.9998), "$0.9998");
  assert.strictEqual(formatPrice(1.0000), "$1.0000");
  assert.strictEqual(formatPrice(1.0005), "$1.0005");
  assert.strictEqual(formatPrice(0.000234), "$0.000234");
  assert.strictEqual(formatPrice(1234.56), "$1,234.56");
  console.log("   ✓ Price formatting matches dynamic precision specs");

  // Test 2: 24h Change Calculations
  console.log("2. Testing 24h Change Calculations");
  const change1 = calculate24hChange(0.9998, 1.0000);
  assert.strictEqual(change1.change24h, -0.0002);
  assert.strictEqual(change1.change24hPct, -0.02);

  const change2 = calculate24hChange(1.0002, 1.0000);
  assert.strictEqual(change2.change24h, 0.0002);
  assert.strictEqual(change2.change24hPct, 0.02);
  console.log("   ✓ 24h change calculations are mathematically accurate");

  // Test 3: Candle Deduplication & Sort
  console.log("3. Testing Candle Normalization (Deduplication + Ascending Sort)");
  const mockCandles: [number, number, number, number, number, number][] = [
    [1725840300, 0.9995, 1.0002, 0.9996, 0.9998, 5000],
    [1725840000, 0.9994, 1.0001, 0.9995, 0.9996, 4000],
    [1725840300, 0.9995, 1.0002, 0.9996, 0.9998, 5000], // duplicate
    [1725840600, 0.9997, 1.0004, 0.9998, 1.0001, 6000],
  ];

  const processed = processCandles(mockCandles);
  assert.strictEqual(processed.length, 3);
  assert.strictEqual(processed[0].time, 1725840000);
  assert.strictEqual(processed[1].time, 1725840300);
  assert.strictEqual(processed[2].time, 1725840600);
  console.log("   ✓ Deduplication and ascending chronological sort verified");

  console.log("\n✅ All Token Price Chart unit tests PASSED successfully!");
}

runTests().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
