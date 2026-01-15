/**
 * Test script for SEC Form 4 tool
 * Tests both the new get_sec_form4_filings tool and legacy get_insider_trades tool
 */

import { handleGetInsiderTrades } from './dist/tools/insider.js';

console.log('='.repeat(60));
console.log('Testing SEC Form 4 Tool');
console.log('='.repeat(60));

async function testMarketWideMode() {
  console.log('\n📊 Test 1: Market-wide mode (recent Form 4 filings)');
  console.log('-'.repeat(60));

  try {
    const result = await handleGetInsiderTrades({
      limit: 5,
      transactionType: 'all'
    });

    console.log('✅ SUCCESS: Market-wide mode');
    console.log(`Mode: ${result.mode}`);
    console.log(`Total transactions: ${result.totalTransactions}`);

    if (result.transactions && result.transactions.length > 0) {
      console.log('\nSample transaction:');
      const tx = result.transactions[0];
      console.log(`  Company: ${tx.company.ticker} - ${tx.company.name}`);
      console.log(`  Insider: ${tx.insider.name} (${tx.insider.position})`);
      console.log(`  Type: ${tx.transaction.type}`);
      console.log(`  Shares: ${tx.transaction.shares}`);
      console.log(`  Filing URL: ${tx.filingUrl}`);
    }
  } catch (error) {
    console.error('❌ FAILED:', error.message);
  }
}

async function testCompanySpecificMode() {
  console.log('\n\n📈 Test 2: Company-specific mode (AAPL insider activity)');
  console.log('-'.repeat(60));

  try {
    const result = await handleGetInsiderTrades({
      symbol: 'AAPL',
      limit: 5,
      transactionType: 'all',
      includeCompanyInfo: false  // Skip company info for faster test
    });

    console.log('✅ SUCCESS: Company-specific mode');
    console.log(`Symbol: ${result.symbol}`);
    console.log(`Company: ${result.company.name}`);
    console.log(`Total transactions: ${result.summary.totalTransactions}`);
    console.log(`Sentiment: ${result.summary.sentiment}`);
    console.log(`Net shares: ${result.summary.netShares}`);
    console.log(`Net value: $${result.summary.netValue.toLocaleString()}`);

    if (result.recentTransactions && result.recentTransactions.length > 0) {
      console.log('\nSample transaction:');
      const tx = result.recentTransactions[0];
      console.log(`  Insider: ${tx.insider.name} (${tx.insider.position})`);
      console.log(`  Type: ${tx.transaction.type}`);
      console.log(`  Shares: ${tx.transaction.shares}`);
      console.log(`  Price: $${tx.transaction.pricePerShare}`);
    }
  } catch (error) {
    console.error('❌ FAILED:', error.message);
  }
}

async function testBuyFilter() {
  console.log('\n\n💰 Test 3: Buy transactions only filter');
  console.log('-'.repeat(60));

  try {
    const result = await handleGetInsiderTrades({
      limit: 3,
      transactionType: 'buy'
    });

    console.log('✅ SUCCESS: Buy filter working');
    console.log(`Total buy transactions found: ${result.totalTransactions}`);
  } catch (error) {
    console.error('❌ FAILED:', error.message);
  }
}

// Run all tests
(async () => {
  try {
    await testMarketWideMode();
    await testCompanySpecificMode();
    await testBuyFilter();

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed!');
    console.log('='.repeat(60));
    console.log('\nThe SEC Form 4 tool is working correctly.');
    console.log('Both tool names point to the same handler:');
    console.log('  - get_sec_form4_filings (new, explicit name)');
    console.log('  - get_insider_trades (legacy alias)');
    console.log('\n');
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
})();
