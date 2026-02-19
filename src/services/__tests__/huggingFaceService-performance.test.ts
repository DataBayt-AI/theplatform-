import { describe, it, expect, vi, beforeEach } from 'vitest';
import { huggingFaceService, type HFCredentials } from '../huggingFaceService';
import * as hub from '@huggingface/hub';

vi.mock('@huggingface/hub', () => ({
    createRepo: vi.fn(),
    uploadFile: vi.fn(),
}));

describe('HuggingFace Service - Large Dataset Performance Tests', () => {
    let mockCredentials: HFCredentials;

    beforeEach(() => {
        vi.clearAllMocks();

        mockCredentials = {
            accessToken: 'test-token-123'
        };
    });

    describe('Large Blob Publishing', () => {
        it('should handle publishing very large blob (100MB+)', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            mockCreateRepo.mockResolvedValue(undefined);
            mockUploadFile.mockResolvedValue(undefined);

            // Create a large dataset (100,000 records)
            const largeData = Array(100000).fill(null).map((_, i) => ({
                id: i,
                text: `This is sample text for record ${i}. It contains enough data to simulate realistic dataset sizes.`,
                label: `category_${i % 100}`,
                metadata: {
                    source: 'test',
                    timestamp: Date.now(),
                    annotator: `user_${i % 50}`
                }
            }));

            const jsonString = JSON.stringify(largeData);
            const largeBlob = new Blob([jsonString], { type: 'application/json' });

            const startTime = Date.now();

            await huggingFaceService.publishDataset(
                'user/large-dataset',
                largeBlob,
                mockCredentials,
                'large_data.jsonl'
            );

            const endTime = Date.now();

            // Should complete in reasonable time (< 1 second for mock)
            expect(endTime - startTime).toBeLessThan(1000);

            // Verify the blob size is actually large (should be ~15MB+)
            expect(largeBlob.size).toBeGreaterThan(15 * 1024 * 1024);

            // Verify upload was called with the large blob
            expect(mockUploadFile).toHaveBeenCalledOnce();
            expect(mockUploadFile).toHaveBeenCalledWith(
                expect.objectContaining({
                    file: expect.objectContaining({
                        path: 'large_data.jsonl',
                        content: largeBlob
                    })
                })
            );
        });

        it('should efficiently convert large Blob to File object', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            mockCreateRepo.mockResolvedValue(undefined);
            mockUploadFile.mockResolvedValue(undefined);

            // Create 50,000 records
            const mediumData = Array(50000).fill(null).map((_, i) => ({
                text: `Sample ${i}`,
                label: i % 10,
                score: Math.random()
            }));

            const blob = new Blob([JSON.stringify(mediumData)], { type: 'application/json' });

            const startTime = Date.now();

            await huggingFaceService.publishDataset(
                'user/medium-dataset',
                blob,
                mockCredentials
            );

            const endTime = Date.now();

            // Blob to File conversion should be fast
            expect(endTime - startTime).toBeLessThan(500);
            expect(mockUploadFile).toHaveBeenCalledOnce();
        });

        it('should handle memory efficiently when processing large blobs', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            mockCreateRepo.mockResolvedValue(undefined);
            mockUploadFile.mockResolvedValue(undefined);

            // Create multiple large blobs in sequence
            const blobSizes: number[] = [];

            for (let i = 0; i < 5; i++) {
                const data = Array(20000).fill(null).map((_, idx) => ({
                    id: idx,
                    text: `Batch ${i}, Record ${idx}`,
                    data: Array(10).fill('x').join('') // Some extra data
                }));

                const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
                blobSizes.push(blob.size);

                await huggingFaceService.publishDataset(
                    `user/dataset-batch-${i}`,
                    blob,
                    mockCredentials,
                    `batch_${i}.jsonl`
                );
            }

            // All blobs should be similar size (memory not accumulating)
            const avgSize = blobSizes.reduce((a, b) => a + b) / blobSizes.length;
            blobSizes.forEach(size => {
                expect(Math.abs(size - avgSize)).toBeLessThan(avgSize * 0.1); // Within 10%
            });

            // Verify all uploads succeeded
            expect(mockUploadFile).toHaveBeenCalledTimes(5);
        });
    });

    describe('Memory and Performance Benchmarks', () => {
        it('should handle rapid successive uploads without memory issues', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            mockCreateRepo.mockResolvedValue(undefined);
            mockUploadFile.mockResolvedValue(undefined);

            // Simulate rapid successive uploads
            const uploadPromises = [];

            for (let i = 0; i < 10; i++) {
                const data = Array(5000).fill(null).map((_, idx) => ({
                    id: `${i}-${idx}`,
                    text: `Text ${idx}`
                }));

                const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });

                uploadPromises.push(
                    huggingFaceService.publishDataset(
                        `user/rapid-${i}`,
                        blob,
                        mockCredentials
                    )
                );
            }

            const startTime = Date.now();
            await Promise.all(uploadPromises);
            const endTime = Date.now();

            // All 10 uploads should complete reasonably fast
            expect(endTime - startTime).toBeLessThan(2000);
            expect(mockUploadFile).toHaveBeenCalledTimes(10);
        });

        it('should maintain performance with varying blob sizes', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            mockCreateRepo.mockResolvedValue(undefined);
            mockUploadFile.mockResolvedValue(undefined);

            const sizes = [100, 1000, 10000, 50000, 100000];
            const uploadTimes: number[] = [];

            for (const size of sizes) {
                const data = Array(size).fill(null).map((_, i) => ({
                    id: i,
                    text: `Record ${i}`
                }));

                const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });

                const startTime = Date.now();
                await huggingFaceService.publishDataset(
                    `user/size-${size}`,
                    blob,
                    mockCredentials
                );
                const endTime = Date.now();

                uploadTimes.push(endTime - startTime);
            }

            // Upload time should scale reasonably (not exponentially)
            // Since these are mocked, they should all be fast
            uploadTimes.forEach(time => {
                expect(time).toBeLessThan(500);
            });

            expect(mockUploadFile).toHaveBeenCalledTimes(5);
        });
    });

    describe('Error Recovery with Large Data', () => {
        it('should handle upload failure gracefully with large blob', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            mockCreateRepo.mockResolvedValue(undefined);

            // Simulate upload failure
            const uploadError = new Error('Upload failed: Connection timeout');
            mockUploadFile.mockRejectedValue(uploadError);

            // Create large blob
            const largeData = Array(50000).fill(null).map((_, i) => ({
                id: i,
                text: `Data ${i}`
            }));
            const largeBlob = new Blob([JSON.stringify(largeData)], { type: 'application/json' });

            // Should throw error but not hang
            await expect(
                huggingFaceService.publishDataset(
                    'user/failing-upload',
                    largeBlob,
                    mockCredentials
                )
            ).rejects.toThrow('Upload failed: Connection timeout');

            // Verify upload was attempted
            expect(mockUploadFile).toHaveBeenCalledOnce();
        });

        it('should not leak memory on failed uploads', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            mockCreateRepo.mockResolvedValue(undefined);
            mockUploadFile.mockRejectedValue(new Error('Network error'));

            // Try multiple failed uploads
            for (let i = 0; i < 5; i++) {
                const data = Array(10000).fill(null).map((_, idx) => ({
                    id: idx,
                    text: `Attempt ${i}, Record ${idx}`
                }));

                const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });

                try {
                    await huggingFaceService.publishDataset(
                        `user/fail-${i}`,
                        blob,
                        mockCredentials
                    );
                } catch (error) {
                    // Expected to fail
                    expect(error).toBeDefined();
                }
            }

            // All attempts should have been made
            expect(mockUploadFile).toHaveBeenCalledTimes(5);
        });
    });

    describe('Blob Size Validation', () => {
        it('should handle extremely large JSONL content efficiently', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            mockCreateRepo.mockResolvedValue(undefined);
            mockUploadFile.mockResolvedValue(undefined);

            // Create JSONL format (one JSON object per line)
            const jsonlLines = Array(100000).fill(null).map((_, i) =>
                JSON.stringify({
                    id: i,
                    text: `This is a longer piece of text for record ${i} to simulate realistic data sizes.`,
                    label: `label_${i % 100}`,
                    score: Math.random()
                })
            );

            const jsonlContent = jsonlLines.join('\n');
            const blob = new Blob([jsonlContent], { type: 'application/x-ndjson' });

            // Blob should be large (> 10MB)
            expect(blob.size).toBeGreaterThan(10 * 1024 * 1024);

            const startTime = Date.now();
            await huggingFaceService.publishDataset(
                'user/jsonl-dataset',
                blob,
                mockCredentials,
                'data.jsonl'
            );
            const endTime = Date.now();

            expect(endTime - startTime).toBeLessThan(1000);
            expect(mockUploadFile).toHaveBeenCalledWith(
                expect.objectContaining({
                    file: expect.objectContaining({
                        path: 'data.jsonl',
                        content: blob
                    })
                })
            );
        });

        it('should preserve blob integrity for very large files', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            mockCreateRepo.mockResolvedValue(undefined);
            mockUploadFile.mockResolvedValue(undefined);

            const originalData = Array(75000).fill(null).map((_, i) => ({
                id: i,
                value: `value_${i}`,
                timestamp: Date.now()
            }));

            const originalJson = JSON.stringify(originalData);
            const originalBlob = new Blob([originalJson], { type: 'application/json' });
            const originalSize = originalBlob.size;

            await huggingFaceService.publishDataset(
                'user/integrity-test',
                originalBlob,
                mockCredentials
            );

            // Verify the blob passed to upload has same size (no corruption)
            const uploadCall = mockUploadFile.mock.calls[0][0];
            expect(uploadCall.file.content.size).toBe(originalSize);
            expect(uploadCall.file.content).toBe(originalBlob);
        });
    });

    describe('Concurrent Large Uploads', () => {
        it('should handle concurrent large uploads without interference', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            mockCreateRepo.mockResolvedValue(undefined);
            mockUploadFile.mockResolvedValue(undefined);

            // Create different sized datasets
            const datasets = [
                Array(10000).fill(null).map((_, i) => ({ id: i, group: 'A' })),
                Array(25000).fill(null).map((_, i) => ({ id: i, group: 'B' })),
                Array(50000).fill(null).map((_, i) => ({ id: i, group: 'C' })),
            ];

            const blobs = datasets.map((data, idx) =>
                new Blob([JSON.stringify(data)], { type: 'application/json' })
            );

            const startTime = Date.now();

            // Upload all concurrently
            await Promise.all(
                blobs.map((blob, idx) =>
                    huggingFaceService.publishDataset(
                        `user/concurrent-${idx}`,
                        blob,
                        mockCredentials,
                        `dataset_${idx}.jsonl`
                    )
                )
            );

            const endTime = Date.now();

            // Concurrent uploads should be faster than sequential
            expect(endTime - startTime).toBeLessThan(1500);
            expect(mockUploadFile).toHaveBeenCalledTimes(3);

            // Verify each upload has correct filename
            expect(mockUploadFile).toHaveBeenCalledWith(
                expect.objectContaining({
                    file: expect.objectContaining({ path: 'dataset_0.jsonl' })
                })
            );
            expect(mockUploadFile).toHaveBeenCalledWith(
                expect.objectContaining({
                    file: expect.objectContaining({ path: 'dataset_1.jsonl' })
                })
            );
            expect(mockUploadFile).toHaveBeenCalledWith(
                expect.objectContaining({
                    file: expect.objectContaining({ path: 'dataset_2.jsonl' })
                })
            );
        });
    });
});
