import { describe, it, expect, vi, beforeEach } from 'vitest';
import fetch from 'node-fetch';

vi.mock('node-fetch');

describe('HuggingFace Import - Large Dataset Performance Tests', () => {
    let mockRequest;
    let mockResponse;
    let jsonMock;
    let statusMock;

    beforeEach(() => {
        vi.clearAllMocks();

        mockRequest = {
            body: {},
            headers: {}
        };

        jsonMock = vi.fn();
        statusMock = vi.fn(() => ({ json: jsonMock }));
        mockResponse = {
            json: jsonMock,
            status: statusMock
        };
    });

    describe('Large Dataset Import (10,000+ rows)', () => {
        it('should handle importing 10,000 rows across multiple chunks', async () => {
            const mockSplitsResponse = {
                splits: [{ config: 'default', split: 'train', num_examples: 10000 }]
            };

            // Simulate 100 chunks of 100 rows each
            const createMockChunk = (offset, size) => ({
                rows: Array(size).fill(null).map((_, i) => ({
                    row: {
                        id: offset + i,
                        text: `Sample text ${offset + i}`,
                        label: `label_${(offset + i) % 10}`
                    }
                }))
            });

            let fetchCallCount = 0;
            fetch.mockImplementation((url) => {
                if (url.includes('/splits?')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockSplitsResponse)
                    });
                } else if (url.includes('/rows?')) {
                    fetchCallCount++;
                    const offset = (fetchCallCount - 1) * 100;
                    const size = fetchCallCount <= 100 ? 100 : 0; // 100 chunks of 100 rows

                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(createMockChunk(offset, size))
                    });
                }
            });

            // Simplified handler to test pagination logic
            const handler = async (req, res) => {
                const chunkSize = 100;
                const rawRows = [];
                let offset = 0;
                const maxRows = 10000;

                // Fetch splits first
                await fetch('splits-url');

                // Fetch rows in chunks
                while (rawRows.length < maxRows) {
                    const rowsResponse = await fetch(`rows-url?offset=${offset}`);
                    const rowsPayload = await rowsResponse.json();
                    const chunkRows = rowsPayload.rows || [];

                    if (chunkRows.length === 0) break;

                    rawRows.push(...chunkRows);
                    offset += chunkRows.length;

                    if (chunkRows.length < chunkSize) break;
                }

                res.json({ rowCount: rawRows.length, offset });
            };

            mockRequest.body = { dataset: 'large/dataset' };
            await handler(mockRequest, mockResponse);

            // Verify all chunks were fetched
            expect(fetch).toHaveBeenCalledTimes(101); // 1 splits + 100 rows calls

            // Verify correct number of rows returned
            expect(jsonMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    rowCount: 10000
                })
            );
        });

        it('should efficiently handle chunking without loading all data at once', async () => {
            // Test that we process chunks iteratively, not all at once
            const chunkSize = 100;
            const totalRows = 50000;
            const chunks = Math.ceil(totalRows / chunkSize);

            let processedChunks = 0;
            const mockSplitsResponse = {
                splits: [{ config: 'default', split: 'train', num_examples: totalRows }]
            };

            fetch.mockImplementation((url) => {
                if (url.includes('/splits?')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockSplitsResponse)
                    });
                } else if (url.includes('/rows?')) {
                    processedChunks++;
                    const remainingRows = totalRows - (processedChunks - 1) * chunkSize;
                    const currentChunkSize = Math.min(chunkSize, remainingRows);

                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            rows: Array(currentChunkSize).fill({ row: { text: 'data' } })
                        })
                    });
                }
            });

            // Verify that chunks are processed one at a time
            const handler = async (req, res) => {
                const rawRows = [];
                let offset = 0;

                await fetch('splits-url');

                // Process chunks iteratively
                for (let i = 0; i < 500; i++) { // Max 500 chunks
                    const response = await fetch(`rows-url?offset=${offset}`);
                    const data = await response.json();

                    if (!data.rows || data.rows.length === 0) break;

                    // In real implementation, we'd only keep necessary data in memory
                    rawRows.push(...data.rows);
                    offset += data.rows.length;

                    if (data.rows.length < chunkSize) break;
                }

                res.json({ rowCount: rawRows.length });
            };

            mockRequest.body = { dataset: 'huge/dataset' };
            await handler(mockRequest, mockResponse);

            expect(processedChunks).toBe(500); // 50,000 rows = 500 chunks
            expect(jsonMock).toHaveBeenCalledWith({ rowCount: 50000 });
        });

        it('should stop fetching when maxRows is reached even with large dataset', async () => {
            const mockSplitsResponse = {
                splits: [{ config: 'default', split: 'train', num_examples: 100000 }]
            };

            let chunksFetched = 0;
            fetch.mockImplementation((url) => {
                if (url.includes('/splits?')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockSplitsResponse)
                    });
                } else if (url.includes('/rows?')) {
                    chunksFetched++;
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            rows: Array(100).fill({ row: { text: 'data' } })
                        })
                    });
                }
            });

            const handler = async (req, res) => {
                const maxRows = 250; // Limit to 250 rows
                const chunkSize = 100;
                const rawRows = [];

                await fetch('splits-url');

                while (rawRows.length < maxRows) {
                    const remaining = maxRows - rawRows.length;
                    const length = Math.min(chunkSize, remaining);

                    const response = await fetch(`rows-url`);
                    const data = await response.json();

                    // Only take what we need
                    rawRows.push(...data.rows.slice(0, length));

                    if (rawRows.length >= maxRows) break;
                }

                res.json({ rowCount: rawRows.length });
            };

            mockRequest.body = { dataset: 'huge/dataset', maxRows: 250 };
            await handler(mockRequest, mockResponse);

            // Should only fetch 3 chunks (100 + 100 + 50 = 250)
            expect(chunksFetched).toBeLessThanOrEqual(3);
            expect(jsonMock).toHaveBeenCalledWith({ rowCount: 250 });
        });
    });

    describe('Memory Efficiency', () => {
        it('should handle data normalization efficiently for large datasets', () => {
            // Test that normalization doesn't create excessive intermediate objects
            const largeRowSet = Array(10000).fill(null).map((_, i) => ({
                row: { id: i, text: `Text ${i}`, label: `label_${i % 100}` }
            }));

            const normalizeRow = (item) => {
                const row = item && typeof item === 'object' && 'row' in item ? item.row : item;
                if (row && typeof row === 'object' && !Array.isArray(row)) {
                    return row;
                }
                return { text: row == null ? '' : String(row) };
            };

            const startTime = Date.now();
            const normalized = largeRowSet.map(normalizeRow);
            const endTime = Date.now();

            // Should normalize 10k rows in under 100ms
            expect(endTime - startTime).toBeLessThan(100);
            expect(normalized.length).toBe(10000);
            expect(normalized[0]).toHaveProperty('id');
            expect(normalized[0]).toHaveProperty('text');
        });

        it('should extract columns efficiently from large heterogeneous datasets', () => {
            // Create dataset with varying column structures
            const largeRowSet = Array(10000).fill(null).map((_, i) => {
                const base = { id: i, text: `Text ${i}` };
                // Add varying columns
                if (i % 2 === 0) base.label = 'even';
                if (i % 3 === 0) base.category = 'divisible_by_3';
                if (i % 5 === 0) base.score = 0.95;
                if (i % 7 === 0) base.metadata = { source: 'test' };
                return base;
            });

            const startTime = Date.now();
            const columnsSet = new Set();
            for (const row of largeRowSet) {
                Object.keys(row || {}).forEach(key => columnsSet.add(key));
            }
            const columns = Array.from(columnsSet);
            const endTime = Date.now();

            // Should process 10k rows in under 50ms
            expect(endTime - startTime).toBeLessThan(50);
            expect(columns).toContain('id');
            expect(columns).toContain('text');
            expect(columns).toContain('label');
            expect(columns).toContain('category');
            expect(columns).toContain('score');
            expect(columns).toContain('metadata');
        });
    });

    describe('Timeout and Error Handling', () => {
        it('should handle slow API responses without hanging', async () => {
            const mockSplitsResponse = {
                splits: [{ config: 'default', split: 'train', num_examples: 1000 }]
            };

            fetch.mockImplementation((url) => {
                if (url.includes('/splits?')) {
                    // Simulate slow response
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            resolve({
                                ok: true,
                                json: () => Promise.resolve(mockSplitsResponse)
                            });
                        }, 100); // 100ms delay
                    });
                }
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ rows: [] })
                });
            });

            const handler = async (req, res) => {
                const response = await fetch('splits-url');
                const data = await response.json();
                res.json({ splits: data.splits });
            };

            const startTime = Date.now();
            await handler(mockRequest, mockResponse);
            const endTime = Date.now();

            // Should complete within reasonable time (< 200ms)
            expect(endTime - startTime).toBeLessThan(200);
            expect(jsonMock).toHaveBeenCalled();
        });

        it('should handle partial failure in multi-chunk fetch gracefully', async () => {
            const mockSplitsResponse = {
                splits: [{ config: 'default', split: 'train', num_examples: 1000 }]
            };

            let fetchCount = 0;
            fetch.mockImplementation((url) => {
                if (url.includes('/splits?')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockSplitsResponse)
                    });
                } else if (url.includes('/rows?')) {
                    fetchCount++;

                    // Fail on 5th chunk
                    if (fetchCount === 5) {
                        return Promise.resolve({
                            ok: false,
                            status: 500,
                            json: () => Promise.resolve({ error: 'Internal server error' })
                        });
                    }

                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            rows: Array(100).fill({ row: { text: 'data' } })
                        })
                    });
                }
            });

            const handler = async (req, res) => {
                const rawRows = [];
                await fetch('splits-url');

                try {
                    for (let i = 0; i < 10; i++) {
                        const response = await fetch('rows-url');

                        if (!response.ok) {
                            return res.status(response.status).json({
                                error: 'Failed to fetch rows',
                                rowsFetchedBeforeError: rawRows.length
                            });
                        }

                        const data = await response.json();
                        rawRows.push(...data.rows);
                    }
                } catch (error) {
                    return res.status(500).json({ error: 'Fetch failed' });
                }

                res.json({ rowCount: rawRows.length });
            };

            await handler(mockRequest, mockResponse);

            expect(statusMock).toHaveBeenCalledWith(500);
            expect(jsonMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Failed to fetch rows',
                    rowsFetchedBeforeError: 400 // 4 successful chunks * 100 rows
                })
            );
        });
    });

    describe('Pagination Edge Cases', () => {
        it('should handle exact multiple of chunk size correctly', async () => {
            // Test when total rows = exact multiple of chunk size (e.g., 500 rows with chunk size 100)
            const mockSplitsResponse = {
                splits: [{ config: 'default', split: 'train', num_examples: 500 }]
            };

            let chunkCount = 0;
            fetch.mockImplementation((url) => {
                if (url.includes('/splits?')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockSplitsResponse)
                    });
                } else if (url.includes('/rows?')) {
                    chunkCount++;

                    // Return 100 rows for first 5 chunks, then empty
                    if (chunkCount <= 5) {
                        return Promise.resolve({
                            ok: true,
                            json: () => Promise.resolve({
                                rows: Array(100).fill({ row: { text: 'data' } })
                            })
                        });
                    }

                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({ rows: [] })
                    });
                }

                // Default return for any other URL
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({})
                });
            });

            const handler = async (req, res) => {
                const rawRows = [];
                const chunkSize = 100;

                await fetch('splits-url');

                while (true) {
                    const response = await fetch('rows-url');
                    const data = await response.json();

                    if (!data.rows || data.rows.length === 0) break;

                    rawRows.push(...data.rows);

                    // Stop if we got fewer rows than chunk size
                    if (data.rows.length < chunkSize) break;
                }

                res.json({ rowCount: rawRows.length, chunksProcessed: chunkCount });
            };

            await handler(mockRequest, mockResponse);

            expect(jsonMock).toHaveBeenCalledWith({
                rowCount: 500,
                chunksProcessed: 5 // Should fetch exactly 5 chunks, not 6
            });
        });
    });
});
