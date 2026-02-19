import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Integration Tests for HuggingFace API
 * 
 * These tests make REAL API calls to HuggingFace's datasets server.
 * 
 * To run these tests:
 * - Set environment variable: RUN_INTEGRATION_TESTS=true
 * - Run: npm test -- server/__tests__/huggingface.integration.test.js
 * 
 * Note: These tests may take longer and require internet connection.
 */

const SHOULD_RUN = process.env.RUN_INTEGRATION_TESTS === 'true';

// Helper to conditionally skip tests
const describeIntegration = SHOULD_RUN ? describe : describe.skip;

describeIntegration('HuggingFace API Integration Tests - Real API Calls', () => {
    const BASE_URL = 'https://datasets-server.huggingface.co';

    // Test datasets - all publicly available on HuggingFace
    const TEST_DATASETS = {
        small: {
            name: 'SetFit/emotion',
            description: 'Small emotion classification dataset (~2k rows)',
            expectedRows: 2000,
            expectedColumns: ['text', 'label']
        },
        medium: {
            name: 'ag_news',
            description: 'AG News classification dataset (~30k rows)',
            expectedRows: 30000,
            expectedColumns: ['text', 'label']
        },
        large: {
            name: 'imdb',
            description: 'IMDB movie reviews (~50k rows)',
            expectedRows: 50000,
            expectedColumns: ['text', 'label']
        }
    };

    beforeAll(() => {
        if (!SHOULD_RUN) {
            console.log('\n⏭️  Skipping integration tests. Set RUN_INTEGRATION_TESTS=true to run.\n');
        } else {
            console.log('\n🌐 Running integration tests with real HuggingFace API...\n');
        }
    });

    describe('Small Dataset (~2k rows)', () => {
        const dataset = TEST_DATASETS.small;

        it('should fetch splits from SetFit/emotion dataset', async () => {
            const url = `${BASE_URL}/splits?dataset=${encodeURIComponent(dataset.name)}`;

            const response = await fetch(url);
            expect(response.ok).toBe(true);

            const data = await response.json();
            expect(data).toHaveProperty('splits');
            expect(Array.isArray(data.splits)).toBe(true);
            expect(data.splits.length).toBeGreaterThan(0);

            console.log(`✅ ${dataset.name}: Found ${data.splits.length} splits`);
        }, 30000); // 30 second timeout

        it('should fetch first 100 rows successfully', async () => {
            // First get splits
            const splitsUrl = `${BASE_URL}/splits?dataset=${encodeURIComponent(dataset.name)}`;
            const splitsResponse = await fetch(splitsUrl);
            const splitsData = await splitsResponse.json();

            const firstSplit = splitsData.splits[0];
            const config = firstSplit.config;
            const split = firstSplit.split;

            // Fetch rows
            const rowsUrl = `${BASE_URL}/rows?dataset=${encodeURIComponent(dataset.name)}&config=${encodeURIComponent(config)}&split=${encodeURIComponent(split)}&offset=0&length=100`;
            const rowsResponse = await fetch(rowsUrl);

            expect(rowsResponse.ok).toBe(true);

            const rowsData = await rowsResponse.json();
            expect(rowsData).toHaveProperty('rows');
            expect(Array.isArray(rowsData.rows)).toBe(true);
            expect(rowsData.rows.length).toBeGreaterThan(0);
            expect(rowsData.rows.length).toBeLessThanOrEqual(100);

            // Verify data structure
            const firstRow = rowsData.rows[0];
            expect(firstRow).toHaveProperty('row');
            expect(typeof firstRow.row).toBe('object');

            console.log(`✅ ${dataset.name}: Fetched ${rowsData.rows.length} rows`);
            console.log(`   First row keys: ${Object.keys(firstRow.row).join(', ')}`);
        }, 30000);

        it('should handle maxRows parameter correctly', async () => {
            const splitsUrl = `${BASE_URL}/splits?dataset=${encodeURIComponent(dataset.name)}`;
            const splitsResponse = await fetch(splitsUrl);
            const splitsData = await splitsResponse.json();

            const firstSplit = splitsData.splits[0];
            const maxRows = 50;

            const rowsUrl = `${BASE_URL}/rows?dataset=${encodeURIComponent(dataset.name)}&config=${encodeURIComponent(firstSplit.config)}&split=${encodeURIComponent(firstSplit.split)}&offset=0&length=${maxRows}`;
            const rowsResponse = await fetch(rowsUrl);
            const rowsData = await rowsResponse.json();

            expect(rowsData.rows.length).toBeLessThanOrEqual(maxRows);

            console.log(`✅ ${dataset.name}: Correctly limited to ${rowsData.rows.length} rows (max: ${maxRows})`);
        }, 30000);
    });

    describe('Medium Dataset (~10-30k rows)', () => {
        const dataset = TEST_DATASETS.medium;

        it('should fetch dataset info and validate size', async () => {
            const splitsUrl = `${BASE_URL}/splits?dataset=${encodeURIComponent(dataset.name)}`;
            const response = await fetch(splitsUrl);

            expect(response.ok).toBe(true);

            const data = await response.json();
            const firstSplit = data.splits[0];

            // Check that dataset has substantial size
            const numRows = firstSplit.num_examples || firstSplit.num_rows || 0;
            expect(numRows).toBeGreaterThan(10000);

            console.log(`✅ ${dataset.name}: Dataset has ${numRows.toLocaleString()} rows`);
        }, 30000);

        it('should fetch multiple chunks efficiently', async () => {
            const splitsUrl = `${BASE_URL}/splits?dataset=${encodeURIComponent(dataset.name)}`;
            const splitsResponse = await fetch(splitsUrl);
            const splitsData = await splitsResponse.json();

            const firstSplit = splitsData.splits[0];
            const chunkSize = 100;
            const totalChunks = 5; // Fetch 5 chunks = 500 rows

            let totalRowsFetched = 0;
            const startTime = Date.now();

            for (let i = 0; i < totalChunks; i++) {
                const offset = i * chunkSize;
                const rowsUrl = `${BASE_URL}/rows?dataset=${encodeURIComponent(dataset.name)}&config=${encodeURIComponent(firstSplit.config)}&split=${encodeURIComponent(firstSplit.split)}&offset=${offset}&length=${chunkSize}`;

                const rowsResponse = await fetch(rowsUrl);
                const rowsData = await rowsResponse.json();

                totalRowsFetched += rowsData.rows.length;
            }

            const endTime = Date.now();
            const duration = endTime - startTime;

            expect(totalRowsFetched).toBe(500);
            expect(duration).toBeLessThan(15000); // Should complete in under 15 seconds

            console.log(`✅ ${dataset.name}: Fetched ${totalRowsFetched} rows in ${duration}ms`);
        }, 45000);
    });

    describe('Large Dataset (~50k rows)', () => {
        const dataset = TEST_DATASETS.large;

        it('should validate large dataset availability', async () => {
            const splitsUrl = `${BASE_URL}/splits?dataset=${encodeURIComponent(dataset.name)}`;
            const response = await fetch(splitsUrl);

            if (!response.ok) {
                console.warn(`⚠️  ${dataset.name} may not be available or accessible`);
                return; // Skip if dataset not available
            }

            const data = await response.json();
            expect(data.splits.length).toBeGreaterThan(0);

            const totalRows = data.splits.reduce((sum, split) => {
                return sum + (split.num_examples || split.num_rows || 0);
            }, 0);

            expect(totalRows).toBeGreaterThan(40000);

            console.log(`✅ ${dataset.name}: Dataset has ${totalRows.toLocaleString()} total rows`);
        }, 30000);

        it('should handle pagination for large offsets', async () => {
            const splitsUrl = `${BASE_URL}/splits?dataset=${encodeURIComponent(dataset.name)}`;
            const splitsResponse = await fetch(splitsUrl);

            if (!splitsResponse.ok) {
                console.warn(`⚠️  Skipping test - ${dataset.name} not accessible`);
                return;
            }

            const splitsData = await splitsResponse.json();
            const firstSplit = splitsData.splits[0];

            // Test fetching data from a large offset
            const largeOffset = 10000;
            const rowsUrl = `${BASE_URL}/rows?dataset=${encodeURIComponent(dataset.name)}&config=${encodeURIComponent(firstSplit.config)}&split=${encodeURIComponent(firstSplit.split)}&offset=${largeOffset}&length=100`;

            const rowsResponse = await fetch(rowsUrl);
            expect(rowsResponse.ok).toBe(true);

            const rowsData = await rowsResponse.json();
            expect(rowsData.rows.length).toBeGreaterThan(0);

            console.log(`✅ ${dataset.name}: Successfully fetched rows from offset ${largeOffset}`);
        }, 30000);
    });

    describe('Data Integrity with Real Data', () => {
        it('should correctly normalize real HuggingFace data structures', async () => {
            const dataset = TEST_DATASETS.small.name;

            const splitsUrl = `${BASE_URL}/splits?dataset=${encodeURIComponent(dataset)}`;
            const splitsResponse = await fetch(splitsUrl);
            const splitsData = await splitsResponse.json();

            const firstSplit = splitsData.splits[0];
            const rowsUrl = `${BASE_URL}/rows?dataset=${encodeURIComponent(dataset)}&config=${encodeURIComponent(firstSplit.config)}&split=${encodeURIComponent(firstSplit.split)}&offset=0&length=50`;

            const rowsResponse = await fetch(rowsUrl);
            const rowsData = await rowsResponse.json();

            // Test normalization logic
            const normalizedRows = rowsData.rows.map(item => {
                const row = item && typeof item === 'object' && 'row' in item ? item.row : item;
                if (row && typeof row === 'object' && !Array.isArray(row)) {
                    return row;
                }
                return { text: row == null ? '' : String(row) };
            });

            expect(normalizedRows.length).toBe(rowsData.rows.length);
            normalizedRows.forEach(row => {
                expect(typeof row).toBe('object');
                expect(row).not.toBeNull();
            });

            // Extract columns
            const columnsSet = new Set();
            for (const row of normalizedRows) {
                Object.keys(row || {}).forEach(key => columnsSet.add(key));
            }
            const columns = Array.from(columnsSet);

            expect(columns.length).toBeGreaterThan(0);

            console.log(`✅ Normalization: ${rowsData.rows.length} rows → columns: ${columns.join(', ')}`);
        }, 30000);
    });

    describe('Error Handling with Real API', () => {
        it('should handle invalid dataset name gracefully', async () => {
            const invalidDataset = 'this-dataset-does-not-exist-12345';
            const url = `${BASE_URL}/splits?dataset=${encodeURIComponent(invalidDataset)}`;

            const response = await fetch(url);

            // Should return an error status
            expect(response.ok).toBe(false);
            expect([400, 404, 500]).toContain(response.status);

            console.log(`✅ Correctly handled invalid dataset (status: ${response.status})`);
        }, 30000);

        it('should handle malformed config/split combinations', async () => {
            const dataset = TEST_DATASETS.small.name;
            const url = `${BASE_URL}/rows?dataset=${encodeURIComponent(dataset)}&config=nonexistent-config&split=nonexistent-split&offset=0&length=10`;

            const response = await fetch(url);

            // Should return an error
            expect(response.ok).toBe(false);

            console.log(`✅ Correctly handled invalid config/split (status: ${response.status})`);
        }, 30000);
    });

    describe('Performance with Real API', () => {
        it('should fetch 1000 rows in reasonable time', async () => {
            const dataset = TEST_DATASETS.medium.name;

            const splitsUrl = `${BASE_URL}/splits?dataset=${encodeURIComponent(dataset)}`;
            const splitsResponse = await fetch(splitsUrl);
            const splitsData = await splitsResponse.json();

            const firstSplit = splitsData.splits[0];
            const chunkSize = 100;
            const numChunks = 10; // 1000 rows total

            let totalRows = 0;
            const startTime = Date.now();

            for (let i = 0; i < numChunks; i++) {
                const offset = i * chunkSize;
                const rowsUrl = `${BASE_URL}/rows?dataset=${encodeURIComponent(dataset)}&config=${encodeURIComponent(firstSplit.config)}&split=${encodeURIComponent(firstSplit.split)}&offset=${offset}&length=${chunkSize}`;

                const rowsResponse = await fetch(rowsUrl);
                const rowsData = await rowsResponse.json();

                totalRows += rowsData.rows.length;
            }

            const endTime = Date.now();
            const duration = endTime - startTime;

            expect(totalRows).toBe(1000);
            expect(duration).toBeLessThan(30000); // Should complete in under 30 seconds

            const rowsPerSecond = (totalRows / duration) * 1000;

            console.log(`✅ Performance: ${totalRows} rows in ${duration}ms (~${rowsPerSecond.toFixed(0)} rows/sec)`);
        }, 60000);
    });
});
